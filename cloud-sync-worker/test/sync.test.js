/* ============================================================
 * 云同步 Worker 本地测试（无需 Cloudflare 登录）
 *
 * 1. 单元测试：纯 CAS 逻辑（src/cas.js）
 * 2. 集成测试：npx wrangler dev 起本地 Worker + SQLite Durable Object，
 *    真实 HTTP 验证 health / 401 / 首次上传 / revision 推进 / 409 冲突 /
 *    409 后云端不改变 / 空状态 404 / CORS preflight
 *
 * 用法：npm test（先 npm install）
 * ============================================================ */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCas } from "../src/cas.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(__dirname, "..");
const PORT = 8797;
const BASE = `http://127.0.0.1:${PORT}`;
const DEFAULT_LOCAL_TOKEN = "local-dev-test-token";

let passed = 0;
let total = 0;
const failures = [];
function record(name, cond, detail = "") {
  total++;
  if (cond) { passed++; console.log(`[PASS] ${name}${detail ? " — " + detail : ""}`); }
  else { failures.push(name); console.log(`[FAIL] ${name}${detail ? " — " + detail : ""}`); }
}

/* ---------- 单元测试：纯 CAS 逻辑 ---------- */
function testApplyCas() {
  const state = { schemaVersion: 6, experiments: [], executions: {}, mark: "A" };
  const r1 = applyCas(null, { baseRevision: 0, schemaVersion: 6, deviceId: "device-A", state },
    "2026-09-27T10:00:00.000Z");
  record("U01 首次上传 baseRevision=0 → ok，revision 1",
    r1.status === "ok" && r1.metadata.revision === 1 && r1.envelope.state.mark === "A");

  const stateB = { schemaVersion: 6, experiments: [], executions: {}, mark: "B" };
  const r2 = applyCas(r1.envelope, { baseRevision: 1, schemaVersion: 6, deviceId: "device-A", state: stateB },
    "2026-09-27T10:05:00.000Z");
  record("U02 baseRevision=1（当前 1）→ ok，revision 2",
    r2.status === "ok" && r2.metadata.revision === 2);

  const r3 = applyCas(r2.envelope, { baseRevision: 1, schemaVersion: 6, deviceId: "device-B", state },
    "2026-09-27T10:06:00.000Z");
  record("U03 旧 baseRevision=1 vs 当前 2 → conflict，返回当前 metadata（revision 2 + updatedAt）",
    r3.status === "conflict" && r3.metadata && r3.metadata.revision === 2
    && r3.metadata.updatedAt === "2026-09-27T10:05:00.000Z");
  record("U04 冲突时不产生新 envelope（云端数据不会被覆盖）", !r3.envelope);

  const r4 = applyCas(null, { baseRevision: 3, schemaVersion: 6, deviceId: "device-C", state },
    "2026-09-27T10:07:00.000Z");
  record("U05 空云端 baseRevision=3 → conflict（metadata revision 0）",
    r4.status === "conflict" && r4.metadata.revision === 0);

  record("U06 schemaVersion 5 → bad_request",
    applyCas(null, { baseRevision: 0, schemaVersion: 5, deviceId: "d", state }, "t").status === "bad_request");
  record("U07 state.schemaVersion 5 → bad_request",
    applyCas(null, { baseRevision: 0, schemaVersion: 6, deviceId: "d", state: { schemaVersion: 5 } }, "t").status === "bad_request");
  record("U08 baseRevision=-1 → bad_request",
    applyCas(null, { baseRevision: -1, schemaVersion: 6, deviceId: "d", state }, "t").status === "bad_request");
  record("U09 baseRevision=1.5（非整数）→ bad_request",
    applyCas(null, { baseRevision: 1.5, schemaVersion: 6, deviceId: "d", state }, "t").status === "bad_request");
  record("U10 updatedAt/revision 由服务端生成（等于传入的服务端值，与客户端无关）",
    r1.metadata.updatedAt === "2026-09-27T10:00:00.000Z" && r1.metadata.deviceId === "device-A");
}

/* ---------- 集成测试辅助 ---------- */
function ensureDevVars() {
  const devVarsPath = path.join(WORKER_DIR, ".dev.vars");
  if (fs.existsSync(devVarsPath)) {
    const m = fs.readFileSync(devVarsPath, "utf8").match(/^SYNC_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  }
  fs.writeFileSync(devVarsPath, "SYNC_TOKEN=" + DEFAULT_LOCAL_TOKEN + "\n");
  return DEFAULT_LOCAL_TOKEN;
}

async function req(method, pathname, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* 无 JSON 响应体 */ }
  return { status: res.status, json };
}

async function waitForHealth(child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`wrangler dev 提前退出（exit ${child.exitCode}）\n${childOutput}`);
    }
    try {
      const res = await fetch(BASE + "/health");
      if (res.ok) {
        const body = await res.json();
        if (body && body.ok === true) return;
      }
      lastErr = "HTTP " + res.status;
    } catch (e) {
      lastErr = String((e && e.message) || e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`wrangler dev 在 ${timeoutMs}ms 内未就绪：${lastErr}\n${childOutput}`);
}

let childOutput = "";
function startWranglerDev() {
  const bin = path.join(WORKER_DIR, "node_modules", ".bin", "wrangler");
  const child = spawn(bin, ["dev", "--port", String(PORT)], {
    cwd: WORKER_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { childOutput += String(d); });
  child.stderr.on("data", (d) => { childOutput += String(d); });
  return child;
}

async function stopWranglerDev(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 2000));
  if (child.exitCode === null) child.kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 500));
}

/* ---------- 集成测试：真实 wrangler dev + Durable Object ---------- */
async function testIntegration(child, token) {
  await waitForHealth(child, 120000);

  const h = await req("GET", "/health");
  record("I01 GET /health（无认证）→ 200 {ok:true}", h.status === 200 && h.json && h.json.ok === true);

  const g401 = await req("GET", "/sync");
  record("I02 GET /sync 未授权 → 401", g401.status === 401);
  const p401 = await req("PUT", "/sync", { body: { baseRevision: 0, schemaVersion: 6, deviceId: "d", state: { schemaVersion: 6 } } });
  record("I03 PUT /sync 未授权 → 401", p401.status === 401);
  const wrong = await req("GET", "/sync", { token: "wrong-token" });
  record("I04 错误 Token → 401", wrong.status === 401);

  const empty = await req("GET", "/sync", { token });
  record("I05 空云端 GET /sync → 404 明确空状态", empty.status === 404);

  const stateA = { schemaVersion: 6, experiments: [{ id: "E55", no: "55-001", condition: "55±1℃" }], executions: {}, mark: "A" };
  const s1 = await req("PUT", "/sync", { token, body: { baseRevision: 0, schemaVersion: 6, deviceId: "device-A", state: stateA } });
  record("I06 第一次上传 baseRevision=0 → 200 revision 1（updatedAt 服务端生成）",
    s1.status === 200 && s1.json && s1.json.revision === 1 && !!s1.json.updatedAt && s1.json.deviceId === "device-A");

  const stateB = { schemaVersion: 6, experiments: [{ id: "E36", no: "36-001", condition: "36±1℃" }], executions: {}, mark: "B" };
  const s2 = await req("PUT", "/sync", { token, body: { baseRevision: 1, schemaVersion: 6, deviceId: "device-A", state: stateB } });
  record("I07 第二次上传 baseRevision=1 → 200 revision 2", s2.status === 200 && s2.json && s2.json.revision === 2);

  const c = await req("PUT", "/sync", { token, body: { baseRevision: 1, schemaVersion: 6, deviceId: "device-B", state: { schemaVersion: 6, mark: "C" } } });
  record("I08 冲突：仍用 baseRevision=1（当前已是 2）→ 409 且返回当前 revision/updatedAt",
    c.status === 409 && c.json && c.json.revision === 2 && c.json.updatedAt === s2.json.updatedAt);

  const g2 = await req("GET", "/sync", { token });
  record("I09 409 后云端 state 不得改变（仍 revision 2，内容仍为第二次上传）",
    g2.status === 200 && g2.json.metadata.revision === 2
    && g2.json.state.mark === "B" && JSON.stringify(g2.json.state) === JSON.stringify(stateB));

  const opt = await fetch(BASE + "/sync", { method: "OPTIONS" });
  record("I10 OPTIONS preflight → 204 且带 CORS 头（*、GET/PUT/OPTIONS、Authorization）",
    opt.status === 204
    && opt.headers.get("access-control-allow-origin") === "*"
    && (opt.headers.get("access-control-allow-methods") || "").includes("PUT")
    && (opt.headers.get("access-control-allow-headers") || "").includes("Authorization"));
}

/* ---------- 入口 ---------- */
testApplyCas();

let child = null;
let ok = false;
try {
  const token = ensureDevVars();
  child = startWranglerDev();
  await testIntegration(child, token);
  ok = true;
} catch (error) {
  console.log(`[FAIL] 集成测试异常：${error && error.message ? error.message : error}`);
  failures.push("integration");
  total++;
} finally {
  await stopWranglerDev(child);
}

console.log("-".repeat(60));
console.log(`测试结果：通过 ${passed} / ${total}`);
if (failures.length) {
  console.log(`失败项：${failures.join("、")}`);
  process.exit(1);
}
