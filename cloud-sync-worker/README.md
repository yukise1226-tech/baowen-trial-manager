# cloud-sync-worker —— 保温试验排程工具手动云同步 Worker

真实 Cloudflare 测试环境后端：**Worker + SQLite-backed Durable Object**。

## 为什么不用 Workers KV 做 revision 判断

Workers KV 是 eventual consistency，无法跨设备做原子 compare-and-set。
本 Worker 由一个**固定 Durable Object（name=`primary`）**保存整份同步 envelope，
revision 的“读-比较-写”在同一 DO 实例内串行完成，天然原子。

数据不拆表，整份 envelope 原样保存：

```json
{
  "app": "保温试验排程工具",
  "syncVersion": 1,
  "metadata": { "schemaVersion": 6, "revision": 1, "updatedAt": "…", "deviceId": "…" },
  "state": { "schemaVersion": 6, "…完整业务数据…" }
}
```

## 接口

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | /health | 无 | `{ "ok": true }` |
| GET | /sync | Bearer | 200 完整 envelope；空云端返回 404 明确空状态 |
| PUT | /sync | Bearer | body `{ baseRevision, schemaVersion: 6, deviceId, state }` |
| OPTIONS | 任意 | 无 | CORS preflight → 204 |

PUT 语义（服务端 CAS）：

- 读取当前 envelope → `currentRevision`（空云端为 0）；
- `baseRevision !== currentRevision` → **HTTP 409**，返回当前 metadata，**不写入任何数据**；
- 一致 → `revision = currentRevision + 1`，`updatedAt` **由服务端生成**，
  保存完整 state，返回 200 新 envelope metadata；
- 第一次上传：`currentRevision = 0`，客户端必须 `baseRevision = 0`。

## 认证与 CORS

- 认证：`Authorization: Bearer <SYNC_TOKEN>`，token 只来自 `env.SYNC_TOKEN`；
- 禁止把 token 写入 HTML、wrangler.jsonc、Git 或日志；
- CORS（PoC 阶段页面可能从本地 file:// 打开）：`Access-Control-Allow-Origin: *`，
  允许方法 GET/PUT/OPTIONS、允许头 Authorization/Content-Type，不启用 cookie credentials；
  正式网页部署后收紧 Origin。

## 目录结构

```
cloud-sync-worker/
├── src/
│   ├── index.js        # Worker 入口 + SyncStore Durable Object（SQLite）
│   └── cas.js          # 纯函数 revision compare-and-set（可单测）
├── wrangler.jsonc      # name/main/compatibility_date/migrations(new_sqlite_classes)/DO 绑定
├── package.json
├── .gitignore          # node_modules/ .wrangler/ .dev.vars
├── README.md
└── test/
    └── sync.test.js    # 纯 CAS 单测 + wrangler dev 集成测试
```

## 本地开发与测试（无需 Cloudflare 登录）

```bash
cd cloud-sync-worker
npm install
npm test          # 单测 + 自动起 wrangler dev 跑真实 HTTP 集成测试
npx wrangler dev  # 手动起本地服务（默认 http://127.0.0.1:8787）
```

本地 token 放在 `.dev.vars`（已 gitignore，测试会自动创建；仅本地开发用）：

```
SYNC_TOKEN=<你的本地开发 token>
```

## 部署（真实 Cloudflare）

1. `npx wrangler login`（用户本人执行）
2. `npx wrangler whoami` 确认账号
3. `npx wrangler deploy` → 得到 `https://baowen-sync.<subdomain>.workers.dev`
4. `npx wrangler secret put SYNC_TOKEN`（用户本人在隐藏输入提示中粘贴 token）
5. `npx wrangler secret list` 只确认 Secret 名存在

Secret 绝不能记录到仓库文档、命令参数或聊天内容中。

## 当前状态

- 真实联调已完成：Worker 已部署到 `https://baowen-sync.cloud-sync-worker.workers.dev`，
  SYNC_TOKEN Secret 已配置（值绝不记录）；A↔B 双向同步、409 冲突保护、401 与网络失败保护均已实测通过；
- 网页目前为**手动同步**（上传 / 拉取按钮），不做自动双向同步；
