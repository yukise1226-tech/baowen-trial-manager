# 版本记录

## V0.6.0 Stable

- 正式发布（2026-09-28）：包含 Cloud Sync V1.1（手动同步，Worker + SQLite-backed Durable Object 服务端 CAS）；
  55℃ 稳定逻辑保持不变；36℃ 冻结不继续优化；`schemaVersion: 6` 不变。
- 正式生产部署到 Cloudflare Pages：`https://baowen-tool.pages.dev`（部署自 main，deployment `5c447bf7`）；
  桌面生产 smoke 通过，手机实机 smoke 通过（用户实测）。
- 最终自动化回归：HTML 内置 147/147、Cloud Sync V1.1 专项 10/10、同步 PoC 12/12、
  36℃ 单插入 9/9、Worker 单测+集成 20/20。
- 仍为手动同步；不做自动双向同步、多用户、D1、Dashboard。

## 手动云同步 PoC（真实 Cloudflare 联调完成，未升稳定版）

- 后端：Cloudflare Worker + SQLite-backed Durable Object（`cloud-sync-worker/`），
  固定 DO `primary` 保存整份 envelope，服务端 revision compare-and-set（不用 Workers KV）。
- 已部署：`https://baowen-sync.cloud-sync-worker.workers.dev`（接口 `/sync`）；
  认证 `SYNC_TOKEN` 通过 Wrangler Secret 配置（值绝不记录）。
- 页面 remote adapter 接入该 Worker：PUT 走服务端 CAS（baseRevision=上次同步的 `syncedRevision`）；
  409 提示“云端已经有更新……请先拉取最新版本。”；网络层失败提示
  “无法连接远程服务器，本地数据未受影响。”（原始错误保留 console）。
- 真实浏览器联调（用户实测）：A→B / B→A 双向同步、409 冲突保护、401 错误 Token、
  网络失败本地保护全部通过；schemaVersion 6、55℃/36℃数据完整。
- 自动化：云同步专项 12/12、36℃ 9/9、HTML 内置完整回归 147/147、Worker 单测+集成 20/20。
- 当前为手动同步；不做自动双向同步、多用户、D1、Dashboard、Pages 正式部署。

## V0.5.4.1 Stable

- 55℃稳定基线；已完成记录只读，CSV 与当前有效计划同步。
- 原稳定 HTML 保留在历史项目目录；不在 V0.6-dev 中重构 55℃。

## V0.6-dev

- 新增独立 `protocol36`、36℃任务模型与 `schemaVersion: 6`。
- 3/6/9/12 个月映射 15/30/45/60 天；Day0 一次放入、周期取样、微生物任务、最终取出。
- 同日微生物与常规取样合并为一次物理操作；Day0 与后续节点按当前 36℃周末规则处理。
- 36℃排程与操作日程直接显示标准节点时间，便于区分标准时间、当前计划和周末顺延。
- 当前为开发测试版，未升稳定版。
