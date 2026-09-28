# 当前状态快照

更新日期：2026-09-28（Asia/Shanghai）。更新版本或完成新提交时请同步本文件。

- 项目：本地单文件 HTML 保温试验排程工具；业务细则只看 `01_CURRENT_SPEC.md`。
- 55℃：V0.5.4.1 Stable，冻结；原稳定文件在历史项目目录，未被 V0.6-dev 覆盖。
- 36℃：V0.6-dev，开发测试中；主 HTML 已有独立 `protocol36`、任务模型和 `schemaVersion: 6`。
- 当前 Git 分支：`dev-v0.7`；从 `dev-v0.6` 继续开发，未合并 `main`；本包自身提交以仓库 `git log -1` 为准。
- `v0.5.4.1-stable` tag：**未创建**；没有可可靠定位的历史稳定提交，不得给现有 V0.6-dev 提交误打该 tag。

## V0.7 统一日期规则：任务01～09.3已完成

- 已有 `customSkipDates`、`holidayDates`、`workdayOverrides`、2026 中国官方节假日 provider 与 `isOperationDateAvailable()`。
- `operationDateStatus()` 已按计划操作时间返回 `available`、`reason`、`date` 及官方日历覆盖状态；`customSkipDates` 优先级最高，调休上班日覆盖普通周末。
- 55℃放入/取出与 36℃操作日程只追加“法定节假日 / 周末 / 自定义跳过”冲突提示；不修改原计划时间，不自动顺延。未收录年份不猜测节假日，但仍判断周末与自定义跳过。
- 55℃冲突已有只读候选建议层：候选只平移整组“放入 + 取出”，始终保持 `取出 = 放入 + Day×24h`，且两日均须可操作；按 `offsetDays` 升序。**任务09.1起时间边界 = 生产日期**：候选放入不得早于 `exp.prodDate`（同一天允许），相对当前有效计划提前是合法的（offsetDays 可为负，UI 显示“提前 X 天”）；未知生产日期时保守地只后移。操作日程仅提供“查看调整建议”，不提供采用动作，不写入 execution，36℃不受影响。未收录年份的候选明确标注“官方节假日覆盖不足”。
- 55℃多节点冲突已有只读联合建议层：只处理尚未确认放入的冲突节点，无冲突节点保持原计划；Day<7 独立选择最早合法候选；Day>=7 在 ±7 天合理窗口内做联合优化。任务09起优化优先级为**最终完成时间优先**：latestTakeout 最早 → terminalTakeout（最高 Day 取出）最早 → 批次数少 → 更早的各节点 takeout → 总延后小 → 单节点最大延后小；相对“最少批次方案”最多 +1 批，且需至少提前 2 天的明确时间收益，否则保持更少批次。任务09.2起：**长周期优化复用短周期已选中的放入批次**——短周期节点以单一固定候选并入同一优化器，其放入时间成为“免费批次”，长周期节点加入不增加总体 batchCount；备选最少批次方案同样按含短周期批次的真实批次数计算。方案含 latestTakeout/terminalDay/terminalTakeout/totalDelayDays/maxDelayDays 指标并展示“预计最终完成/Day完成/放入批次/总偏移（提前/延后个数）”；备选为“最少批次方案”对照（完全相同则不显示）。联合建议不写入 execution/adjustedPlan，不改变 55℃或36℃排程。
- 任务08已完成：联合建议支持人工确认采用——【采用推荐方案】只打开确认弹窗，点【确认采用】才按当前 state 重算推荐方案（与展示签名不一致即拒绝过期方案），全量校验后原子式写入 `adjustedPlanPutin`（取出=放入+Day×24h 自动推导）。任一节点已确认/进行中/已完成/已无冲突/候选不可操作则整组拒绝、一个都不写；事实字段、确认状态、原计划、36℃、schemaVersion、云同步协议均不变。备选方案保持只读。
- 任务08.1已完成：修正建议入口触发条件——未确认放入节点按 `build55ConflictSummary` 完整结果判断（放入或取出任一不可操作即显示冲突提示与调整建议，不再只检查当前显示的放入时间）；待放入行内联提示对应计划取出日期的冲突；排程页新增试验级冲突摘要（“当前计划存在 N 个不可操作日冲突：Day…”，【查看联合调整建议】复用任务08确认采用流程，不建第二套算法）。
- 任务08.2已完成：修复采用入口事件绑定——抽出共享入口 `open55GroupedApplyFromTrigger(t)`（重算→签名校验→全量校验→打开确认弹窗），排程页/操作日程/弹窗三处 `groupedApplyOpen` 统一走该 helper（在 `day===null` 拦截之前处理）；`groupedApplyYes` 仍在弹窗内独立处理。未动联合建议算法、validate/apply 逻辑与各协议。
- 任务08.3已完成（后被任务09.1修订）：55℃调整禁止提前放入——候选生成源头 `suggest55ConflictAlternatives` 只向后搜索（offsetDays>0）；Day<7 改为最早合法后移，Day>=7 窗口内仅后移并优先减少批次。scheduleBatches、实际时间、36℃、schemaVersion、云同步协议均未动。
- 任务08.4重做已完成：历史计划异常检测与修正（替换早先“批量恢复进行中节点”的错误方向）——纯检测层 `collect55LegacyPlanAnomalies(state, expId)` 只按“数据违反当前业务不变量”识别明确逻辑异常：试验/节点计划放入早于生产日期、未执行节点的有效计划仍落在不可操作日、已确认实际放入早于生产日期（硬错误）；正常执行事实（已完成、进行中且实际放入≥生产日期）绝不进入。排程页显示“⚠ 发现历史计划异常 N 项 +【检查并修正】”，弹窗逐项展示原因/当前值/当前规则/推荐处理：纯计划异常【采用当前规则修正】（清除早于生产日期的调整或按当前联合建议原子写入 adjustedPlanPutin），硬错误【解除错误确认并重新排程】（复用 undoPutinRecord，执行人/备注保留，需用户明确确认）。不按版本号判断、不批量清确认、不改事实字段、已完成绝不处理；新建试验 putinDate<prodDate 由既有排程校验阻止。任务09.1后“早于原计划”本身不再是异常，唯一时间边界是生产日期。
- 任务09已完成：联合方案优化目标改为“最终取出时间尽量靠前”——新增 `metricsFor55Assignment` / `compare55FinalAssignment` / `best55FinalGroupedAssignment`（在最少批次与 +1 批范围内按新优先级枚举，+1 批需至少提前 2 天的明确收益；极端规模保持贪心降级）。经典 09/22 案例（生产=计划=09-22）：Day14 提前独立放入（09-24 → 10-08），Day10/11/12 @09-28、Day9/13 @09-29、Day3 @10-09；推荐 4 批/总偏移 47 天，备选最少批次 3 批/总偏移 51 天。scheduleBatches、事实字段、36℃、schemaVersion、云同步协议未动。
- 任务09.1已完成：候选最早放入边界改为**生产日期**而非当前计划——`suggest55ConflictAlternatives` 搜索范围为 [prodDate, currentPlan+maxOffset]（允许合法提前，绝不早于生产日期；未知生产日期保守只后移）；`earliest55DelayCandidate` 更名 `earliest55Candidate`（最早合法候选）；`reasonable55GroupedCandidates` 窗口改为 ±limit；`validate55GroupedSuggestionPlanForApply` 的第二道防线改为“推荐放入早于生产日期即整组拒绝”（相对当前计划提前合法）；历史异常检测删除“adjustedPlanPutin<originalPlanPutin=异常”分支。生产日期提前（如 prod 09-19、计划 09-22）时联合优化可发现 09-20/09-21 等更早合法候选。scheduleBatches、真实事实、已确认节点、36℃、schemaVersion、云同步协议未动。
- 任务09.2已完成：联合优化复用短周期已选批次——`best55FinalGroupedAssignment` 的输入改为“短周期固定候选 + 长周期候选”合并的完整冲突集（短节点候选列表为单一固定候选），短节点占用的放入日期成为免费批次；`compare55FinalAssignment` 在时间与批次相同后新增“更早的各节点 takeout（升序列表逐项比较）”再比较总延后。prod 09-19 案例：09-20 批次含 Day3/9/10（Day9→09-29、Day10→09-30 不再拖到 10-08），总偏移 23 天；prod 09-22 经典案例结果与任务09完全一致（4 批/47 天）。scheduleBatches、真实事实、已确认节点、36℃、schemaVersion、云同步协议未动。
- 任务09.3已完成：一键重新优化已调整计划——`build55ReoptimizationSuggestion` 在 clone 中只清除该试验未确认节点的旧 adjustedPlanPutin 后按当前规则重算（旧调整不再阻止新建议；只读 preview）；排程页在“有未确认且带调整节点”时显示【重新优化建议】→ 弹窗对比当前/新建议的批次与完成时间、列出实际变化的 Day →【采用新建议】原子替换（先清所有未确认节点旧调整，再写入新方案；目标节点已确认即整组拒绝；失败回滚一个不改）。新旧方案完全相同时提示“无需调整”，不产生 mutation；已确认/进行中/已完成节点与事实字段绝不进入。scheduleBatches、Task09目标、生产日期边界、36℃、schemaVersion、云同步协议未动。

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
- **当前同步模式**：手动上传 / 手动拉取；不做自动同步。
- **同步契约**：PUT body `{baseRevision, schemaVersion:6, deviceId, state}`；服务端一致则 `revision+1`（updatedAt 服务端生成）并保存整份 state；不一致返回 409 + 当前 metadata；GET 返回完整 envelope（空云端 404）。客户端只用 `cloudRevision`（最近一次成功上传/拉取确认的云端 revision）作为 CAS 基准；本地编辑不再推进或展示 revision。
- **Cloud Sync V1.1 状态语义**：`lastSyncedFingerprint` 只计算整份业务 state（排除同步 metadata）；当前 fingerprint 与基线不同时动态显示“本地有未同步修改 · 基于云端 rN”，恢复原值后自动回到“已同步 · 云端 rN”。无内容变化的上传不发 GET/PUT、不生成新 revision；成功上传或拉取才更新 `cloudRevision`、`lastSyncedFingerprint`、`lastSyncedAt`。旧 metadata 无 fingerprint 时保留云端 revision 并显示“同步状态待确认”，不伪造已同步。
- **V1.1 验证**：revision 专项 10/10、同步专项 12/12、36℃专项 9/9、HTML 内置 147/147、Worker 单测+集成 20/20；真实 Chrome 已验证连续编辑、无变化重复上传、恢复原值、刷新保留四个场景。409/401/网络失败仍保持本地 state 与同步 metadata 不变。
- **代码位置**：Worker `cloud-sync-worker/`（src/index.js + src/cas.js + wrangler.jsonc + test/sync.test.js）；页面 remote adapter 在 `outputs/保温试验排程_V0.6-dev.html`（默认远程地址已接入本 Worker）。
- **当前仍不做**：自动双向同步、多人协作、D1、Dashboard、通知、正式账号体系、Pages 正式部署。
- 待实测（业务侧，与同步无关）：真实业务数据下 36℃ 协议确认、Day0/中间节点调整、操作日程、实际 Day0 与周末节点操作；36℃ 周末规则是否最终锁版仍待用户确认。

## Cloudflare Pages 测试站（feat/mobile-pages-poc）

- **已部署**：项目 `baowen-tool`（静态目录 `pages/`，生产分支 main），URL `https://baowen-tool.pages.dev`；
  `pages/index.html` 是主 HTML 的部署副本（修改主 HTML 后需同步并重新部署）。
- **手机响应式**（仅 CSS `@media (max-width: 768px)` + 表格包裹，不改业务 JS）：
  头部可换行、宽表只自身横向滚动（touch）、试验管理移动端隐藏样品批次/计划放入/负责人列（数据保留）、
  弹窗宽度 ≤100vw−24px 且内部纵向滚动、按钮移动端最小点击高度 40px、防 iOS 聚焦放大。
- **状态**：iPhone Safari 已能打开 Pages 并显示云端数据（用户实测）；响应式布局与 Cloud Sync V1.1 页面副本已部署，
  **等待用户再次用真实 iPhone 截图验收**；桌面自动化 147/147 通过。
- 使用方式：Mac / iPhone → Pages → 手动同步 → Worker → Durable Object；
  Pages localStorage 与 file:// 相互独立，首次需从云端拉取。
- TODO：当 Mac 与手机都统一切换到正式 Pages URL 后，再单独收紧 Worker CORS Origin（当前保留 `*`）。
