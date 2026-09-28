# 函数索引

主代码是单文件 HTML；这里仅列函数名、职责及可搜索关键词，不展开代码。用 `rg -n '函数名|关键词' <主HTML>` 定位后，只读取相关函数上下文。统一路径见 `08_FILE_MAP.md`。

| 函数名 | 职责 | 搜索关键词 |
|---|---|---|
| `dayRangeFor` | 55℃保质期对应 Day 范围 | `dayRangeFor` |
| `scheduleBatches` | 55℃工作日/批次排程，冻结 | `scheduleBatches` |
| `computeSchedule` | 按条件分流 55℃与36℃项目 | `computeSchedule`、`ok36` |
| `currentPutinOf` / `currentTakeoutOf` | 55℃当前有效操作时间，冻结 | `currentPutinOf`、`currentTakeoutOf` |
| `totalDays36For` | 36℃周期映射 | `totalDays36For` |
| `cleanProtocol36` / `ensureProtocol36` | 独立协议规范化 | `protocol36`、`modelVersion` |
| `task36Definitions` | Day0、周期取样、同日微生物、最终取出定义 | `task36Definitions`、`mergedMicro` |
| `task36ExOf` / `undoTask36Record` | 36℃执行记录读取与撤销 | `task36ExOf`、`undoTask36Record` |
| `changeMicroDay36` | 微生物改日与旧时间清理 | `changeMicroDay36` |
| `weekendOperationTime36` | 36℃当前周末转换 | `weekendOperationTime36` |
| `compute36Item` / `progressSummary36` | 时间基准、有效计划、节点及进度 | `baseStart`、`originalPlanTime` |
| `events36ForDate` / `overdue36List` | 36℃日程日期与逾期筛选 | `events36ForDate`、`overdue36List` |
| `openProtocol36Editor` / `protocol36ConfirmHTML` | 协议编辑与确认 | `protocol36Micro`、`protocol36ConfirmYes` |
| `task36RowHTML` / `plan36SectionHTML` | 36℃排程结果 | `计划操作时间`、`标准节点` |
| `openAdjust36Plan` / `refreshAdjust36Preview` | 36℃单点计划调整 | `adjust36Save`、`restore36Plan` |
| `today36Row` / `task36TableHTML` | 36℃操作日程展示 | `36℃｜`、`task36Confirm` |
| `operationDateStatus` / `operationDateStatusHTML` | 按计划操作时间返回日期可用性与官方日历覆盖状态，并生成只读冲突提示 | `custom-skip`、`calendar-unavailable`、`operation-date-note` |
| `suggest55ConflictAlternatives` / `build55ConflictSummary` | 为 55℃节点生成保持 Day×24h 的双向只读候选，并汇总冲突与日历覆盖状态 | `offsetDays`、`holidayCoverageStatus`、`operation55SuggestionHTML` |
| `onTodayInput` / `onTodayChange` / `onTodayClick` | 实际字段、确认与撤销事件 | `task36Text`、`task36Time`、`task36Undo` |
| `buildCsvTexts` 的 `plan36`、`rows36` 分支 | 36℃排程/操作 CSV；与55℃分支共存 | `plan36`、`rows36` |
| `migrate36PhysicalActionModel` / `migrateV06` | 旧记录合并、schema 5→6 | `legacy-micro-day`、`migrateV06` |
| `runSelfTests` | HTML 内置自测 | `?test`、`TESTS:` |
