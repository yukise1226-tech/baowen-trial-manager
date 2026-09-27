# 函数索引

本文件只用于定位代码，不替代 [当前业务规则](docs/CURRENT_SPEC.md)。行号对应 `outputs/保温试验排程_V0.6-dev.html` 当前快照，后续以搜索函数名为准。先找函数，再只读其附近代码。

## 55℃核心（Stable，不主动修改）

| 函数 / 搜索词 | 约行号 | 用途 |
|---|---:|---|
| `dayRangeFor` | 410 | 保质期对应 55℃ Day 范围 |
| `scheduleBatches` | 688 | 工作日与批次排程 |
| `computeSchedule` | 732 | 统一计算入口；含协议分流，55℃路径保持稳定 |
| `currentPutinOf` / `currentTakeoutOf` | 908 / 912 | 55℃ 当前有效放入/取出时间 |

## 36℃核心

| 函数 / 搜索词 | 约行号 | 用途 |
|---|---:|---|
| `totalDays36For` | 418 | 3/6/9/12 月周期映射 |
| `cleanProtocol36` / `ensureProtocol36` | 422 / 441 | 独立协议规范化 |
| `task36Definitions` | 470 | Day0、每 7 天取样、微生物合并、最终取出 |
| `changeMicroDay36` | 500 | 微生物日期改选与旧计划清理 |
| `weekendOperationTime36` | 535 | 36℃ 后续周末顺延 |
| `compute36Item` | 544 | 单项目节点、统一时间基准与单点调整 |
| `progressSummary36` | 593 | 节点完成/待执行计数 |
| `task36ExOf` / `undoTask36Record` | 456 / 528 | 任务执行记录与撤销 |
| `events36ForDate` / `overdue36List` | 979 / 993 | 操作日程日期与逾期筛选 |

## 36℃界面与导出

| 函数 / 搜索词 | 约行号 | 用途 |
|---|---:|---|
| `openProtocol36Editor` / `protocol36ConfirmHTML` | 1888 / 1922 | 目标/协议编辑及确认 |
| `onModalClick` 中的 `protocol36Skip`、`protocol36ConfirmYes` | 1957 起 | 协议设置写入 |
| `task36RowHTML` / `plan36SectionHTML` | 2311 / 2335 | 36℃排程表行与分区 |
| `openAdjust36Plan` / `refreshAdjust36Preview` | 2596 / 2611 | 计划操作时间单点调整 |
| `openTask36Confirm` | 2753 | 实际操作确认弹窗 |
| `today36Row` / `task36TableHTML` | 2909 / 2934 | 36℃操作日程行与表 |
| `onTodayInput` / `onTodayChange` / `onTodayClick` | 3013 / 3037 / 3062 | 实际字段、完成与撤销 |
| `buildCsvTexts` 中的 `plan36`、`rows36` | 1037 起 | 36℃排程及操作 CSV；同函数也有 55℃导出，修改时须隔离 |
| `migrate36PhysicalActionModel` / `migrateV06` | 1265 / 1311 | 旧 36℃双行数据迁移、schema 5→6 |
| `runSelfTests` | 3177 | 页面内置回归入口（URL 加 `?test`） |

## 局部定位顺序

`docs/CURRENT_SPEC.md` → 本索引 → `git diff` → `rg -n '函数名|关键词' outputs/保温试验排程_V0.6-dev.html` → 只读取命中函数上下文。跨模块原因无法定位、数据结构整体损坏或用户明确要求全量审计时，才扩大阅读范围。
