# 当前状态快照

更新日期：2026-09-27（Asia/Shanghai）。更新版本或完成新提交时请同步本文件。

- 项目：本地单文件 HTML 保温试验排程工具；业务细则只看 `01_CURRENT_SPEC.md`。
- 55℃：V0.5.4.1 Stable，冻结；原稳定文件在历史项目目录，未被 V0.6-dev 覆盖。
- 36℃：V0.6-dev，开发测试中；主 HTML 已有独立 `protocol36`、任务模型和 `schemaVersion: 6`。
- 当前 Git 分支：`feat/cloud-sync-poc`；分支基线业务提交：`bb1444e`。`main` 停在初始快照 `87afe5e`；本包自身提交以仓库 `git log -1` 为准。
- `v0.5.4.1-stable` tag：**未创建**；没有可可靠定位的历史稳定提交，不得给现有 V0.6-dev 提交误打该 tag。
- 最近一次主题：手动云同步 PoC；业务 state 仍以 localStorage 为主，整份 `schemaVersion: 6` state 通过可切换的 Mock/HTTP remote adapter 上传与拉取，同步 metadata 单独记录 `schemaVersion`、`revision`、`updatedAt`、`deviceId`。
- 冲突策略：revision 不一致或同 revision 内容不一致时必须显式确认，不静默覆盖；远程 Token 仅保存在当前浏览器会话，不写入 HTML/localStorage。
- 自动测试：`tests/test_cloud_sync_poc.js` 8 通过、0 失败；`tests/test_36c_single_insertion.js` 9 通过、0 失败；真实 Chrome 运行 HTML 内置自测 147 通过、0 失败。
- 真实浏览器同步回测：HTTP remote 上传成功；刷新后本地数据、adapter 设置和 revision 保留；远程拉取成功；模拟 HTTP 503 时明确提示失败，原本地数据仍在。
- Cloudflare：**尚未真正连接**。仓库内没有可复用的 Wrangler/Worker/KV 配置，当前只用 `tests/mock_sync_server.js` 验证 HTTP 契约；未猜测账号、命名空间或 Token。
- 待实测：真实业务数据下创建36℃项目、确认协议、调整 Day0/中间节点、操作日程、实际 Day0，以及周末节点实际操作决定；另需 Cloudflare Worker 项目、KV namespace 与认证 secret 后才可做真实云端联调。
- 36℃周末规则当前按历史/SOP 顺延至周一；是否最终锁为稳定版规则仍待用户确认，勿擅自改算法。
- 当前不做：Pages 正式部署、自动双向同步、多人协作、D1、Dashboard、通知、55℃重构、拆分 HTML、升级稳定版。

路径、文件名与可迁移说明见 `08_FILE_MAP.md`；历史版本变化见 `05_CHANGELOG_SHORT.md`。
