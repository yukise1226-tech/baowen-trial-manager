# 简短版本记录

## V0.5.4.1 Stable

55℃稳定基线：完成记录只读，CSV 与当前有效计划同步；本轮开发不改其业务语义。

## V0.6-dev

新增独立 `protocol36`、15/30/45/60 天周期、Day0 一次放入、周期取样、微生物检测和最终取出；数据升级至 `schemaVersion: 6`。

`bb1444e`：确认单次放入模型；36℃排程和操作日程直接显示标准节点时间，新增九项专项回归。仍为开发版，未升稳定版。

## 手动云同步 PoC（未升稳定版）

- 保留 localStorage 为本地主数据，新增“同步设置 / 上传到云端 / 从云端拉取 / 同步状态”。
- 整份保存 `schemaVersion: 6` state；envelope metadata 含 `schemaVersion`、`revision`、`updatedAt`、`deviceId`，不改 55℃/36℃业务字段与算法。
- 提供本机 Mock 与可配置 HTTP remote adapter；Token 只存在浏览器会话，不写死或持久化到 HTML/localStorage。
- 后端失败不影响本地业务数据；任何远程失败都不自动覆盖 localStorage。

### 真实 Cloudflare 联调（已完成）

- 后端改为 **Worker + SQLite-backed Durable Object**（不用 Workers KV 做 revision 判断）：`cloud-sync-worker/`，固定 DO `primary` 保存整份 envelope，服务端 CAS；本地 `wrangler dev` 测试 20/20。
- 已部署：`https://baowen-sync.cloud-sync-worker.workers.dev`（接口 `/sync`）；`SYNC_TOKEN` 用 Wrangler Secret 配置，值绝不记录。
- 页面 remote adapter 已接入该 Worker（默认远程地址），PUT 改为服务端 CAS 契约（baseRevision=上次同步的 `syncedRevision`）；409 提示“云端已经有更新……请先拉取最新版本。”；网络层失败提示“无法连接远程服务器，本地数据未受影响。”（原始错误保留 console）。
- 真实浏览器联调（用户实测）：A→B / B→A 双向同步、409 冲突保护、401 错误 Token、网络失败本地保护，全部通过。
- 自动化：云同步专项 12/12（含 CAS/409/401/网络失败/同步后本地编辑不破坏 CAS）、36℃ 9/9、HTML 内置完整回归 147/147、Worker 单测+集成 20/20。
- 当前仍为**手动同步**，不做自动双向同步/多用户/D1/Dashboard。
