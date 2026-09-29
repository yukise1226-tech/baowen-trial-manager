// 任务07：55℃多节点联合冲突优化建议层；只读建议，不自动修改排程。
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

function date(value) { return app.parseDateTime(value); }
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
  return app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state);
}
function syntheticRow(putin, day, expId = 'SYN') {
  const originalPutin = date(putin);
  return {
    expId, day, status: '未放入', enabled: true, ex: app.cleanExecution(null),
    effectivePlanPutin: originalPutin,
    effectivePlanTakeout: app.addDays(originalPutin, day),
    originalPlanPutin: originalPutin,
    originalPlanTakeout: app.addDays(originalPutin, day)
  };
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

let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('GROUP-01', '无冲突试验不生成联合建议', () => {
  assert.equal(grouped(classicState([1,2])), null);
});

test('GROUP-02', '只冲突一个短 Day 时选择最早合法后移', () => {
  const plan = grouped(classicState([3]));
  assert.ok(plan);
  assert.equal(plan.batchCount, 1);
  assert.deepEqual(Array.from(plan.groups[0].days), [3]);
  assert.deepEqual(Array.from(plan.groups[0].offsets), [17]);
  assert.equal(app.fmtDT(plan.groups[0].putin), '2026-10-09 10:00');
});

test('GROUP-03', '多个 Day>=7 冲突可通过后移联合，且 Day14 提前独立放入', () => {
  const plan = grouped(classicState([9,10,11,12,13,14]));
  assert.equal(plan.batchCount, 3);
  const g14 = plan.groups.find(group => group.days.length === 1 && group.days[0] === 14);
  assert.ok(g14);
  assert.equal(app.fmtDT(g14.putin), '2026-09-24 10:00');
  const totalDays = plan.groups.reduce((sum, group) => sum + group.days.length, 0);
  assert.equal(totalDays, 6);
  assert.equal(plan.alternatives[0].batchCount, 2);
});

test('GROUP-04', '联合建议只包含冲突节点，不移动无冲突 Day', () => {
  const plan = grouped(classicState());
  assert.deepEqual(Array.from(plan.conflicts, conflict => conflict.day), [3,9,10,11,12,13,14]);
  assert.deepEqual(entriesOf(plan).map(entry => entry.day).sort((a,b) => a-b), [3,9,10,11,12,13,14]);
});

test('GROUP-05', '推荐方案全部为延后候选，禁止提前', () => {
  const plan = grouped(classicState());
  assert.equal(plan.advanceCount, 0);
  assert.equal(plan.delayCount, 7);
  assert.ok(entriesOf(plan).every(entry => entry.offset > 0));
});

test('GROUP-06', '保留“最少批次方案”对照：批次更少但最终完成更晚', () => {
  const plan = grouped(classicState());
  assert.equal(plan.alternatives.length, 1);
  const alternative = plan.alternatives[0];
  assert.equal(alternative.strategy, 'minimum-batch');
  assert.equal(alternative.delayCount, 7);
  assert.ok(alternative.batchCount < plan.batchCount);
  assert.ok(alternative.totalDelayDays > plan.totalDelayDays);
  assert.ok(alternative.terminalTakeout.getTime() > plan.terminalTakeout.getTime());
  assert.equal(alternative.latestTakeout.getTime(), plan.latestTakeout.getTime());
});

test('GROUP-07', '所有 group 节点严格满足 Day×24h', () => {
  const plan = grouped(classicState());
  for (const entry of entriesOf(plan)) {
    assert.equal(entry.takeout.getTime() - entry.putin.getTime(), entry.day * 24 * 60 * 60 * 1000);
  }
});

test('GROUP-08', '每个联合放入与取出时间均为可操作日', () => {
  const state = classicState();
  for (const entry of entriesOf(grouped(state))) {
    assert.equal(app.operationDateStatus(entry.putin, state).available, true);
    assert.equal(app.operationDateStatus(entry.takeout, state).available, true);
  }
});

test('GROUP-09', 'customSkipDates 会阻止对应联合候选', () => {
  const state = classicState();
  app.addCustomSkipDate(state, '2026-09-15');
  const plan = grouped(state);
  assert.ok(plan);
  assert.ok(plan.groups.every(group => app.ymdOf(group.putin) !== '2026-09-15'));
  for (const entry of entriesOf(plan)) {
    assert.notEqual(app.operationDateStatus(entry.putin, state).reason, 'custom-skip');
    assert.notEqual(app.operationDateStatus(entry.takeout, state).reason, 'custom-skip');
  }
});

test('GROUP-10', 'Day9/10 后移联合为单批次', () => {
  const state = classicState([9,10]);
  const plan = grouped(state);
  assert.equal(plan.batchCount, 1);
  assert.equal(app.ymdOf(plan.groups[0].putin), '2026-09-29');
  assert.deepEqual(Array.from(plan.groups[0].days), [9,10]);
  assert.equal(app.operationDateStatus(plan.groups[0].putin, state).reason, 'available');
  assert.ok(Array.from(plan.groups[0].offsets).every(offset => offset > 0));
});

test('GROUP-11', '未收录年份正确标记 coverageWarning', () => {
  const state = app.defaultState();
  const plan = app.build55GroupedConflictSuggestions([syntheticRow('2027-09-19T10:00', 1)], state);
  assert.ok(plan);
  assert.equal(plan.coverageWarning, '官方节假日覆盖不足');
  assert.match(plan.explanation, /优先缩短最终完成时间/);
});

test('GROUP-12', '经典案例 Day14 提前独立放入，其余长周期节点后移联合', () => {
  const plan = grouped(classicState());
  assert.equal(plan.batchCount, 4);
  assert.equal(plan.totalAbsOffsetDays, 47);
  const short = plan.groups.find(group => group.days.length === 1 && group.days[0] === 3);
  assert.ok(short);
  assert.equal(app.fmtDT(short.putin), '2026-10-09 10:00');
  const g14 = plan.groups.find(group => group.days.length === 1 && group.days[0] === 14);
  assert.ok(g14);
  assert.equal(app.fmtDT(g14.putin), '2026-09-24 10:00');
  const long = plan.groups.filter(group => group.days.length > 1 && group.days.every(day => day >= 9));
  assert.equal(long.length, 2);
  assert.deepEqual(Array.from(long[0].days), [10,11,12]);
  assert.equal(app.fmtDT(long[0].putin), '2026-09-28 10:00');
  assert.deepEqual(Array.from(long[1].days), [9,13]);
  assert.equal(app.fmtDT(long[1].putin), '2026-09-29 10:00');
});

test('GROUP-13', '生成联合建议前后55℃ rows 与 execution 完全一致', () => {
  const state = classicState();
  const rowsBefore = JSON.stringify(app.computeSchedule(state).rows);
  const executionBefore = JSON.stringify(state.executions);
  grouped(state);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows), rowsBefore);
  assert.equal(JSON.stringify(state.executions), executionBefore);
});

test('GROUP-14', '生成联合建议前后36℃ rows36 完全一致', () => {
  const state = classicState();
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId:'E55'});
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

test('GROUP-15', '操作日程展示联合建议、分组时间与总批次数；采用仅提供确认入口，不直接写 state', () => {
  const state = classicState();
  const day3 = app.computeSchedule(state).rows.find(row => row.day === 3);
  const markup = app.operation55SuggestionHTML(day3, state, day3.effectivePlanTakeout);
  assert.match(markup, /联合建议｜推荐：尽早完成/);
  assert.match(markup, /预计最终完成：2026-10-12 10:00/);
  assert.match(markup, /Day14 完成：2026-10-08 10:00/);
  assert.match(markup, /放入批次：4/);
  assert.match(markup, /Day9、Day13/);
  assert.match(markup, /Day10、Day11、Day12/);
  assert.match(markup, /总偏移 47 天/);
  /* 任务08：出现“采用推荐方案”按钮，但只打开确认弹窗（groupedApplyOpen），不直接写 state */
  assert.match(markup, /采用推荐方案/);
  assert.match(markup, /data-act="groupedApplyOpen"/);
  assert.doesNotMatch(markup, /data-act="groupedApplyYes"/);
});

test('GROUP-16', '已确认放入的冲突节点不进入联合建议', () => {
  const state = classicState([3,9]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({putinConfirmed:true, putinTime:'2026-09-22T10:00'});
  const plan = grouped(state);
  assert.ok(plan);
  assert.deepEqual(Array.from(plan.conflicts, conflict => conflict.day), [9]);
  const confirmedDay3 = app.computeSchedule(state).rows.find(row => row.day === 3);
  const markup = app.operation55SuggestionHTML(confirmedDay3, state, app.currentTakeoutOf(confirmedDay3));
  assert.doesNotMatch(markup, /联合建议/);
});

console.log(`55C-GROUPED-CONFLICT-SUGGESTIONS: ${passed} PASS, ${16 - passed} FAIL`);
