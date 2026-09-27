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
- revision 冲突仅提示并等待用户确认，不静默覆盖；后端失败不影响本地业务数据。
- 本地 HTTP 双设备链路、Day14 往返、刷新持久化、失败保护和 schema/业务数据保留均已自动化验证；真实 Chrome 手动上传、拉取、刷新和 503 失败提示已回测。
- 尚未连接真实 Cloudflare Worker + KV；仓库当前无可复用的账号、项目、KV namespace 或认证 secret 配置。
