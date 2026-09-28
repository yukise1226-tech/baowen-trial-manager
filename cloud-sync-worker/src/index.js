/* ============================================================
 * 保温试验排程工具 —— 手动云同步 Worker
 *
 * 后端方案（不依赖 Workers KV 做 revision 判断）：
 *   Workers KV 是 eventual consistency，不适合跨设备原子 compare-and-set；
 *   本 Worker 使用一个 SQLite-backed Durable Object（固定 name="primary"）
 *   保存整份同步 envelope，revision 的读改写在该 DO 实例内串行完成，
 *   天然原子，无跨设备竞争窗口。
 *
 * 数据契约（与网页 PoC / validateSyncEnvelope 一致）：
 *   envelope = {
 *     app, syncVersion,
 *     metadata: { schemaVersion, revision, updatedAt, deviceId },
 *     state     // 完整业务数据（schemaVersion: 6；不拆表）
 *   }
 *
 * 接口：
 *   GET  /health  无需认证 → { ok: true }
 *   GET  /sync    需 Authorization: Bearer <env.SYNC_TOKEN>
 *                 → 200 完整 envelope / 404 明确空状态
 *   PUT  /sync    需认证；body = { baseRevision, schemaVersion: 6, deviceId, state }
 *                 → 一致：revision = current + 1，updatedAt 由服务端生成，
 *                   保存完整 state，返回 200 新 envelope metadata
 *                 → 冲突（baseRevision !== currentRevision）：HTTP 409，
 *                   返回当前 metadata，不写入任何数据
 *   第一次上传：currentRevision = 0，客户端必须 baseRevision = 0
 *
 * 安全要求：
 *   认证 token 只来自 env.SYNC_TOKEN（本地 .dev.vars / 线上 wrangler secret），
 *   绝不写入 HTML / wrangler.jsonc / Git / 日志。
 * ============================================================ */

import { DurableObject } from "cloudflare:workers";
import { applyCas } from "./cas.js";

/* 注意：主模块的每个 export 都会被 workerd 当作 handler 绑定，
 * 因此这里的常量不能带 export（纯逻辑导出放在 cas.js）。 */
const SYNC_STATE_KEY = "sync-state";
const PRIMARY_NAME = "primary";

function corsHeaders() {
  /* PoC 阶段页面可能从本地 file:// 打开，放开 Origin；不启用 cookie credentials。
   * 正式网页部署后再收紧 Origin。 */
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

/* 恒定时间比较，避免时序侧信道 */
function isAuthorized(request, env) {
  const token = env && env.SYNC_TOKEN ? String(env.SYNC_TOKEN) : "";
  if (!token) return false;
  const header = request.headers.get("Authorization") || "";
  const expected = "Bearer " + token;
  let ok = header.length === expected.length;
  for (let i = 0; ok && i < header.length; i++) {
    ok = header.charCodeAt(i) === expected.charCodeAt(i);
  }
  return ok;
}

/* 所有 GET /sync 与 PUT /sync 都路由到同一个固定 DO（name=primary），
 * 不为不同设备创建不同 Object。 */
function getPrimaryStub(env) {
  const ns = env && env.SYNC_STORE;
  if (!ns) return null;
  if (typeof ns.getByName === "function") return ns.getByName(PRIMARY_NAME);
  return ns.get(ns.idFromName(PRIMARY_NAME));
}

export class SyncStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
  }

  async currentEnvelope() {
    const raw = await this.ctx.storage.get(SYNC_STATE_KEY);
    if (!raw) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (e) {
      return null;
    }
  }

  async fetch(request) {
    if (request.method === "GET") {
      const envelope = await this.currentEnvelope();
      if (!envelope) return jsonResponse({ error: "云端还没有任何同步数据" }, 404);
      return jsonResponse(envelope, 200);
    }
    if (request.method === "PUT") {
      let body = null;
      try {
        body = await request.json();
      } catch (e) {
        body = null;
      }
      if (!body) return jsonResponse({ error: "请求体不是有效 JSON" }, 400);

      const current = await this.currentEnvelope();
      const result = applyCas(current, body, new Date().toISOString());
      if (result.status === "bad_request") return jsonResponse({ error: result.error }, 400);
      if (result.status === "conflict") return jsonResponse(result.metadata, 409);

      await this.ctx.storage.put(SYNC_STATE_KEY, result.envelope);
      return jsonResponse(result.metadata, 200);
    }
    return jsonResponse({ error: "method not allowed" }, 405);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* CORS preflight：直接放行，不带 cookie credentials */
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (url.pathname === "/health") {
      return jsonResponse({ ok: true }, 200);
    }

    if (url.pathname === "/sync") {
      if (!isAuthorized(request, env)) {
        return jsonResponse({ error: "未授权：Bearer Token 无效或未配置" }, 401);
      }
      const stub = getPrimaryStub(env);
      if (!stub) return jsonResponse({ error: "Durable Object 绑定未配置" }, 500);
      return stub.fetch(request);
    }

    return jsonResponse({ error: "not found" }, 404);
  },
};
