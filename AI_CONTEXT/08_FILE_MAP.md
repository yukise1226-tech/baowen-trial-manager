# 文件与路径映射

以下绝对路径是**当前这台 Mac 的位置**；复制本目录到其他电脑后，应以相对路径重新定位，不把旧绝对路径当作必然存在。未包含整份 HTML，需开发时另提供仓库。

项目/Git 根目录：

`/Users/johnnysteven/Documents/AI项目/保温试验管理`

| 用途 | 项目内相对路径 | 当前本机实际路径 |
|---|---|---|
| 主 HTML（V0.6-dev） | `outputs/保温试验排程_V0.6-dev.html` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/outputs/保温试验排程_V0.6-dev.html` |
| 当前规则源文档 | `docs/CURRENT_SPEC.md` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/docs/CURRENT_SPEC.md` |
| 历史规则原文 | `docs/BASELINE_RULES.md` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/docs/BASELINE_RULES.md` |
| 函数索引源文档 | `ARCHITECTURE.md` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/ARCHITECTURE.md` |
| 回归清单源文档 | `regression.md` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/regression.md` |
| 36℃专项测试 | `tests/test_36c_single_insertion.js` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/tests/test_36c_single_insertion.js` |
| 云同步 Worker（已部署后端） | `cloud-sync-worker/`（src/index.js、src/cas.js、wrangler.jsonc、test/sync.test.js） | `/Users/johnnysteven/Documents/AI项目/保温试验管理/cloud-sync-worker/` |
| Pages 静态部署目录（正式生产） | `pages/`（index.html 为主 HTML 部署副本、README.md） | `/Users/johnnysteven/Documents/AI项目/保温试验管理/pages/` |
| 云同步测试（PoC + V1.1） | `tests/test_cloud_sync_poc.js`、`tests/mock_sync_server.js`、`tests/test_sync_revision_v11.js` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/tests/` |
| Git 元数据 | `.git/` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/.git/` |
| 本交接包 | `AI_CONTEXT/` | `/Users/johnnysteven/Documents/AI项目/保温试验管理/AI_CONTEXT/` |

历史 V0.5.4.1 Stable 原文件（**不在当前 Git 仓库内，不要覆盖**）：

`/Users/johnnysteven/Documents/Claude code/保温试验管理/保温试验排程工具/保温试验排程.html`

Git：当前分支 `main`（V0.6 Stable 已发布，`dev-v0.6` 经 PR #1 合入 main）。若路径移动，先在新位置执行 `git rev-parse --show-toplevel`，再组合表中的相对路径。
