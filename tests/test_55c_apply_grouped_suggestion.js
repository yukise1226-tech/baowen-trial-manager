// 任务08：55℃联合建议人工确认采用——原子式写入 adjustedPlanPutin，取出=放入+Day×24h 自动推导；
// 不改事实字段、确认状态、原计划、36℃、schemaVersion 与云同步协议。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');
/* 固定“当前时间”（早于所有测试夹具日期），使建议不因真实日期变化而排除过去候选 */
const FIXED_TEST_NOW = Date.parse('2026-09-01T00:00:00+08:00');
class FixedDate extends Date {
  constructor(...args){ if(args.length===0) super(FIXED_TEST_NOW); else super(...args); }
  static now(){ return FIXED_TEST_NOW; }
  static parse(value){ return Date.parse(value); }
  static UTC(...args){ return Date.UTC(...args); }
}
const app = vm.createContext({console, Date: FixedDate, performance});
vm.runInContext(match[1], app, {filename: htmlPath});

const DAY_MS = 24 * 60 * 60 * 1000;

function exp55(days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate: '2026-09-22',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetMode: 'custom', targetConfirmed: true, targetDays: days
  });
}
function exp36() {
  return app.cleanExperiment({
    id: 'E36', no: '36-01', project: '36℃样品', batch: 'B2', prodDate: '2026-09-22',
    putinDate: '2026-09-22', months: 3, condition: '36±1℃', planTime: '10:00',
    protocol36: {modelVersion:2,totalDays:15,microDay:14,targetConfirmed:true,tasks:{}}
  });
}
function classicState(days) {
  const state = app.defaultState();
  state.experiments = [exp55(days)];
  return state;
}
function grouped(state) {
  return app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId: 'E55'});
}
function apply(state) {
  return app.apply55GroupedSuggestionPlan(state, 'E55', grouped(state));
}
function rowsOf(state) { return app.computeSchedule(state).rows; }
function rowOf(state, day) { return rowsOf(state).find(row => row.expId === 'E55' && row.day === day); }
function adjustedDays(state) {
  const days = [];
  for (const key of Object.keys(state.executions)) {
    const [id, day] = key.split('|');
    if (id === 'E55' && state.executions[key].adjustedPlanPutin) days.push(+day);
  }
  return days.sort((a, b) => a - b);
}
/* 行关键时间快照：用于前后对比原计划/有效计划 */
function snapshot(state) {
  return rowsOf(state).map(row => ({
    day: row.day,
    effP: row.effectivePlanPutin ? row.effectivePlanPutin.getTime() : null,
    effT: row.effectivePlanTakeout ? row.effectivePlanTakeout.getTime() : null,
    origP: row.originalPlanPutin ? row.originalPlanPutin.getTime() : null,
    origT: row.originalPlanTakeout ? row.originalPlanTakeout.getTime() : null
  }));
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('APPLY-01', '经典09/22案例能够得到推荐方案并成功采用', () => {
  const state = classicState();
  const plan = grouped(state);
  assert.ok(plan);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 7);
  assert.equal(result.changes.length, 7);
});

test('APPLY-02', '采用后只有冲突 Day 3,9,10,11,12,13,14 出现 adjustedPlanPutin', () => {
  const state = classicState();
  apply(state);
  assert.deepEqual(adjustedDays(state), [3,9,10,11,12,13,14]);
});

test('APPLY-03', '无冲突 Day 1,2,4,5,6,7,8 完全不变', () => {
  const state = classicState();
  const before = snapshot(state);
  apply(state);
  const after = snapshot(state);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.deepEqual(after.find(row => row.day === day), before.find(row => row.day === day));
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('APPLY-04', '所有调整节点保持 takeout = putin + Day×24h', () => {
  const state = classicState();
  apply(state);
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowOf(state, day);
    assert.equal(row.effectivePlanTakeout.getTime() - row.effectivePlanPutin.getTime(), day * DAY_MS);
  }
});

test('APPLY-05', '所有调整后放入日均可操作', () => {
  const state = classicState();
  apply(state);
  for (const day of [3,9,10,11,12,13,14]) {
    assert.equal(app.operationDateStatus(rowOf(state, day).effectivePlanPutin, state).available, true);
  }
});

test('APPLY-06', '所有调整后取出日均可操作', () => {
  const state = classicState();
  apply(state);
  for (const day of [3,9,10,11,12,13,14]) {
    assert.equal(app.operationDateStatus(rowOf(state, day).effectivePlanTakeout, state).available, true);
  }
});

test('APPLY-07', '应用后经典案例原节假日冲突全部解决', () => {
  const state = classicState();
  apply(state);
  assert.equal(grouped(state), null);   /* 不再生成新的联合建议 */
  for (const day of [3,9,10,11,12,13,14]) {
    const summary = app.build55ConflictSummary(rowOf(state, day), state);
    assert.equal(summary.conflictReasons.length, 0);
  }
});

test('APPLY-08', 'originalPlanPutin / originalPlanTakeout 保持不变', () => {
  const state = classicState();
  const before = snapshot(state);
  apply(state);
  const after = snapshot(state);
  for (const row of after) {
    const prev = before.find(b => b.day === row.day);
    assert.equal(row.origP, prev.origP);
    assert.equal(row.origT, prev.origT);
  }
});

test('APPLY-09', 'putinTime / takeoutTime / 确认状态不被改变', () => {
  const state = classicState();
  apply(state);
  for (const key of Object.keys(state.executions)) {
    const ex = state.executions[key];
    assert.equal(ex.putinConfirmed, false);
    assert.equal(ex.completeConfirmed, false);
    assert.equal(ex.putinTime, '');
    assert.equal(ex.takeoutTime, '');
  }
});

test('APPLY-10', '存在已确认放入节点时整组拒绝，且其他节点也没有部分写入', () => {
  const state = classicState([3,9]);
  const plan = grouped(state);   /* 生成时 Day3/Day9 都未确认 */
  assert.ok(plan);
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({putinConfirmed:true, putinTime:'2026-09-22T10:00'});
  const afterConfirm = JSON.stringify(state.executions);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state.executions), afterConfirm);          /* 一个都不写 */
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '');
});

test('APPLY-11', '建议生成后日期规则变化导致候选失效时整组拒绝', () => {
  const state = classicState();
  const plan = grouped(state);
  app.addCustomSkipDate(state, '2026-09-28');   /* 新联合方案的放入日之一变为不可操作 */
  const before = JSON.stringify(state.executions);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state.executions), before);
  /* 重新计算的方案与旧方案签名不同（过期方案不会被 UI 采用） */
  assert.notEqual(app.grouped55PlanSignature(grouped(state)), app.grouped55PlanSignature(plan));
});

test('APPLY-12', '重复采用不产生第二次无意义 mutation', () => {
  const state = classicState();
  assert.equal(apply(state).ok, true);
  const after = JSON.stringify(state.executions);
  assert.equal(grouped(state), null);   /* 冲突已解决，不再出现相同采用入口 */
  const again = app.apply55GroupedSuggestionPlan(state, 'E55', {groups: []});
  assert.equal(again.ok, false);
  assert.equal(JSON.stringify(state.executions), after);
});

test('APPLY-13', '操作日程成功显示调整后的日期', () => {
  const state = classicState();
  apply(state);
  const rows = rowsOf(state);
  const ev1009 = app.eventsForDate(rows, '2026-10-09');
  assert.ok(ev1009.putins.some(r => r.expId === 'E55' && r.day === 3));
  const ev22 = app.eventsForDate(rows, '2026-09-22');
  assert.ok(!ev22.putins.some(r => r.expId === 'E55' && r.day === 3));   /* 原放入日不再有 Day3 */
  const ev0928 = app.eventsForDate(rows, '2026-09-28');
  assert.deepEqual(Array.from(ev0928.putins.filter(r => r.expId === 'E55').map(r => r.day).sort((a,b) => a-b)), [10,11,12]);
  const ev0929 = app.eventsForDate(rows, '2026-09-29');
  assert.deepEqual(Array.from(ev0929.putins.filter(r => r.expId === 'E55').map(r => r.day).sort((a,b) => a-b)), [9,13]);
  const ev0924 = app.eventsForDate(rows, '2026-09-24');
  assert.ok(ev0924.putins.some(r => r.expId === 'E55' && r.day === 14));   /* 当日原计划亦有 Day4/5 */
});

test('APPLY-14', 'CSV有效计划使用调整后日期，同时原计划追溯列仍保留原值', () => {
  const state = classicState();
  apply(state);
  const csv = app.buildCsvTexts(state, app.computeSchedule(state));
  /* 操作日程 CSV：Day3 计划时间=10-09 10:00，原计划时间=09-22 10:00 */
  const op3 = csv.ops.split('\n').find(line => line.includes('55-CLASSIC') && line.includes(',3,放入'));
  assert.ok(op3);
  assert.ok(op3.startsWith('2026-10-09 10:00'));
  assert.ok(op3.includes('2026-09-22 10:00'));
  /* 排程 CSV：Day3 计划放入=调整后，原计划放入列保持 09-22 10:00 */
  const plan3 = csv.plan.split('\n').find(line => line.includes('55-CLASSIC') && line.includes(',3,'));
  assert.ok(plan3);
  assert.ok(plan3.includes('2026-10-09 10:00'));
  assert.ok(plan3.includes('2026-09-22 10:00'));
  assert.ok(plan3.includes('（已调整）'));
});

test('APPLY-15', '36℃ rows36 前后完全一致', () => {
  const state = classicState();
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  apply(state);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

test('APPLY-16', 'schemaVersion 不变', () => {
  const state = classicState();
  assert.equal(state.schemaVersion, 6);
  apply(state);
  assert.equal(state.schemaVersion, 6);
});

test('APPLY-UI-01', '确认弹窗按批次分组展示放入/取出时间，且只有确认才写 state', () => {
  const state = classicState();
  app.state = state;
  const plan = grouped(state);
  const exp = app.findExp('E55');
  const markup = app.apply55GroupedPlanConfirmHTML(exp, plan);
  assert.match(markup, /将调整以下55℃节点：/);
  assert.match(markup, /09-24 10:00 放入：/);
  assert.match(markup, /Day14 → 10-08 10:00/);
  assert.match(markup, /09-28 10:00 放入：/);
  assert.match(markup, /Day10 → 10-08 10:00/);
  assert.match(markup, /Day11 → 10-09 10:00/);
  assert.match(markup, /Day12 → 10-10 10:00/);
  assert.match(markup, /09-29 10:00 放入：/);
  assert.match(markup, /Day9 → 10-08 10:00/);
  assert.match(markup, /Day13 → 10-12 10:00/);
  assert.match(markup, /10-09 10:00 放入：/);
  assert.match(markup, /Day3 → 10-12 10:00/);
  assert.match(markup, /仅调整上述冲突节点，无冲突节点保持原计划。/);
  assert.match(markup, /data-act="groupedApplyYes"/);
  assert.match(markup, />确认采用</);
  assert.match(markup, />取消</);
  /* 生成确认弹窗本身不写 state */
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '');
});

console.log(`55C-APPLY-GROUPED-SUGGESTION: ${passed} PASS, ${total - passed} FAIL`);
