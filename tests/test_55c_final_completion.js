// 任务09：联合方案优先最终完成时间——latestTakeout/terminalTakeout 优先于批次数；
// 相对最少批次方案最多 +1 批，且需至少提前 2 天的明确收益；硬约束不变（只后移、Day×24h、可操作）。
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
function rowsOf(state) { return app.computeSchedule(state).rows; }
function grouped(state) {
  return app.build55GroupedConflictSuggestions(rowsOf(state), state, {expId: 'E55'});
}
function entriesOf(plan) {
  const entries = [];
  for (const group of plan.groups) {
    for (let i = 0; i < group.days.length; i++) {
      entries.push({putin: group.putin, day: group.days[i], takeout: group.takeouts[i], offset: group.offsets[i]});
    }
  }
  return entries;
}
/* 构造两个带 metrics 的方案对象，直接测比较器优先级 */
function fakeAssignment(latest, terminal, batchCount, totalDelay, maxDelay) {
  return {
    metrics: {
      latestTakeout: app.parseDateTime(latest),
      terminalTakeout: app.parseDateTime(terminal),
      batchCount, totalDelayDays: totalDelay, maxDelayDays: maxDelay
    }
  };
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('FINAL-01', '方案包含 latestTakeout', () => {
  const plan = grouped(classicState());
  assert.ok(plan.latestTakeout instanceof Date);
  assert.equal(app.fmtDT(plan.latestTakeout), '2026-10-12 10:00');
});

test('FINAL-02', '方案包含 terminalDay / terminalTakeout', () => {
  const plan = grouped(classicState());
  assert.equal(plan.terminalDay, 14);
  assert.equal(app.fmtDT(plan.terminalTakeout), '2026-10-08 10:00');
  assert.equal(plan.totalDelayDays, 47);
  assert.equal(plan.maxDelayDays, 17);
});

test('FINAL-03', '推荐方案优先 latestTakeout 更早', () => {
  const earlier = fakeAssignment('2026-10-10 10:00', '2026-10-10 10:00', 3, 20, 8);
  const later = fakeAssignment('2026-10-12 10:00', '2026-10-12 10:00', 2, 10, 5);
  assert.ok(app.compare55FinalAssignment(earlier, later) < 0);
  assert.ok(app.compare55FinalAssignment(later, earlier) > 0);
});

test('FINAL-04', 'latestTakeout 相同时，优先 terminalTakeout 更早', () => {
  const a = fakeAssignment('2026-10-12 10:00', '2026-10-08 10:00', 3, 20, 8);
  const b = fakeAssignment('2026-10-12 10:00', '2026-10-12 10:00', 2, 10, 5);
  assert.ok(app.compare55FinalAssignment(a, b) < 0);
});

test('FINAL-05', '时间相同时再比较 batchCount', () => {
  const a = fakeAssignment('2026-10-12 10:00', '2026-10-12 10:00', 2, 10, 5);
  const b = fakeAssignment('2026-10-12 10:00', '2026-10-12 10:00', 3, 8, 4);
  assert.ok(app.compare55FinalAssignment(a, b) < 0);
});

test('FINAL-06', '推荐方案最多只比最少批次方案多1批', () => {
  const plan = grouped(classicState());
  assert.equal(plan.batchCount, 4);
  assert.equal(plan.alternatives.length, 1);
  const alt = plan.alternatives[0];
  assert.equal(alt.strategy, 'minimum-batch');
  assert.equal(alt.batchCount, 3);
  assert.equal(plan.batchCount, alt.batchCount + 1);
});

test('FINAL-07', '增加1批但没有明显时间收益时，不增加批次', () => {
  const state = classicState([9,10]);
  const plan = grouped(state);
  /* Day10 拆到 09-28 只提前 1 天（<2 天阈值），保持最少批次 1 批 */
  assert.equal(plan.batchCount, 1);
  assert.equal(app.fmtDT(plan.groups[0].putin), '2026-09-29 10:00');
  assert.deepEqual(Array.from(plan.groups[0].days), [9,10]);
  assert.equal(plan.alternatives.length, 0);
});

test('FINAL-08', 'Day14 不得为了合批被无意义拖晚', () => {
  const plan = grouped(classicState());
  const g14 = plan.groups.find(group => group.days.length === 1 && group.days[0] === 14);
  assert.ok(g14);
  assert.equal(app.fmtDT(g14.putin), '2026-09-24 10:00');
  assert.equal(app.fmtDT(g14.takeouts[0]), '2026-10-08 10:00');
  const alt = plan.alternatives[0];
  const alt14 = alt.groups.find(group => group.days.includes(14));
  assert.equal(app.fmtDT(alt14.takeouts[alt14.days.indexOf(14)]), '2026-10-12 10:00');
  assert.ok(g14.takeouts[0].getTime() < alt14.takeouts[alt14.days.indexOf(14)].getTime());
});

test('FINAL-09', '经典09/22案例中，Day14使用算法算出的更早合法方案', () => {
  const plan = grouped(classicState());
  const g14 = plan.groups.find(group => group.days.includes(14));
  const takeout14 = g14.takeouts[g14.days.indexOf(14)];
  assert.equal(app.fmtDT(takeout14), '2026-10-08 10:00');
  assert.equal(app.operationDateStatus(g14.putin, classicState()).available, true);
});

test('FINAL-10', '所有 candidatePutin >= 当前 effectivePlanPutin', () => {
  const state = classicState();
  const plan = grouped(state);
  const effByDay = {};
  for (const row of rowsOf(state)) effByDay[row.day] = row.effectivePlanPutin.getTime();
  for (const entry of entriesOf(plan)) {
    assert.ok(entry.putin.getTime() >= effByDay[entry.day], `Day${entry.day} 候选早于当前有效计划`);
  }
});

test('FINAL-11', '所有 takeout = putin + Day×24h', () => {
  const plan = grouped(classicState());
  for (const entry of entriesOf(plan)) {
    assert.equal(entry.takeout.getTime() - entry.putin.getTime(), entry.day * DAY_MS);
  }
});

test('FINAL-12', '所有放入/取出均可操作', () => {
  const state = classicState();
  for (const entry of entriesOf(grouped(state))) {
    assert.equal(app.operationDateStatus(entry.putin, state).available, true);
    assert.equal(app.operationDateStatus(entry.takeout, state).available, true);
  }
});

test('FINAL-13', '无冲突节点完全不移动', () => {
  const state = classicState();
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('FINAL-14', '已确认节点不参与优化', () => {
  const state = classicState();
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05'
  });
  const plan = grouped(state);
  assert.ok(!Array.from(plan.conflicts, conflict => conflict.day).includes(9));
  for (const entry of entriesOf(plan)) assert.notEqual(entry.day, 9);
});

test('FINAL-15', '采用推荐方案后仍通过任务08 validate/apply', () => {
  const state = classicState();
  const plan = grouped(state);
  assert.equal(app.validate55GroupedSuggestionPlanForApply(state, 'E55', plan).ok, true);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 7);
  assert.equal(grouped(state), null);   /* 冲突全部解决 */
});

test('FINAL-16', '36℃完全不变', () => {
  const state = classicState();
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

console.log(`55C-FINAL-COMPLETION: ${passed} PASS, ${total - passed} FAIL`);
