# 当前状态快照

更新日期：2026-09-27（Asia/Shanghai）。更新版本或完成新提交时请同步本文件。

- 项目：本地单文件 HTML 保温试验排程工具；业务细则只看 `01_CURRENT_SPEC.md`。
- 55℃：V0.5.4.1 Stable，冻结；原稳定文件在历史项目目录，未被 V0.6-dev 覆盖。
- 36℃：V0.6-dev，开发测试中；主 HTML 已有独立 `protocol36`、任务模型和 `schemaVersion: 6`。
- 当前 Git 分支：`feat/cloud-sync-poc`；分支基线业务提交：`bb1444e`。`main` 停在初始快照 `87afe5e`；本包自身提交以仓库 `git log -1` 为准。
- `v0.5.4.1-stable` tag：**未创建**；没有可可靠定位的历史稳定提交，不得给现有 V0.6-dev 提交误打该 tag。

## Cloudflare 云同步 PoC：已完成真实后端联调

- **后端**：Cloudflare Worker + SQLite-backed Durable Object（固定 name=`primary` 保存整份同步 envelope，服务端 revision compare-and-set；不使用 Workers KV 做 revision 判断）。
- **Worker**：`https://baowen-sync.cloud-sync-worker.workers.dev`
- **同步接口**：`https://baowen-sync.cloud-sync-worker.workers.dev/sync`
- **认证**：`SYNC_TOKEN` Secret 已通过 `wrangler secret` 配置（**绝对不要记录实际值**）；页面 Token 只保存在浏览器当前会话（sessionStorage），不写入 HTML/localStorage。
- **已验证（真实浏览器联调，用户实测）**：
  - A↔B 双向同步（Safari A → Cloudflare → Chrome B 与反向均通过，55℃/36℃/执行记录完整）；
  - revision 409 冲突保护（旧 revision 上传被拒，页面提示“云端已经有更新……请先拉取最新版本。”，双方数据均未被覆盖）；
  - 401 认证失败保护（错误 Token 被拒，本地数据未受影响）；
  - 网络失败保护（错误地址/断网时提示“无法连接远程服务器，本地数据未受影响。”，原始错误保留在 console）；
  - localStorage 本地兜底（任何远程失败都不自动覆盖本地数据）；
  - schemaVersion 6 数据完整。
- **当前同步模式**：手动上传 / 手动拉取。
- **同步契约**：PUT body `{baseRevision, schemaVersion:6, deviceId, state}`；服务端一致则 `revision+1`（updatedAt 服务端生成）并保存整份 state；不一致返回 409 + 当前 metadata；GET 返回完整 envelope（空云端 404）。客户端用 `syncedRevision`（上次成功同步的云端 revision）作为 CAS 基准，与本地脏计数器 `revision` 分开。
- **代码位置**：Worker `cloud-sync-worker/`（src/index.js + src/cas.js + wrangler.jsonc + test/sync.test.js）；页面 remote adapter 在 `outputs/保温试验排程_V0.6-dev.html`（默认远程地址已接入本 Worker）。
- **当前仍不做**：自动双向同步、多人协作、D1、Dashboard、通知、正式账号体系、Pages 正式部署。
- 待实测（业务侧，与同步无关）：真实业务数据下 36℃ 协议确认、Day0/中间节点调整、操作日程、实际 Day0 与周末节点操作；36℃ 周末规则是否最终锁版仍待用户确认。
