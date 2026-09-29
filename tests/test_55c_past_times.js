// 任务10.3：55℃优化建议不得推荐已经过去的放入时间——实际最早边界 = max(生产日期, 当前时间)，
// 按 datetime 比较；联合建议/重新优化/采用层全部继承同一规则；时间可注入 options.nowMs。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');
const app = vm.createContext({console, Date, performance});
vm.runInContext(match[1], app, {filename: htmlPath});

const DAY_MS = 24 * 60 * 60 * 1000;
const T1 = app.parseDateTime('2026-09-29T07:30').getTime();   /* 早上：09-29 10:00 仍合法 */
const T2 = app.parseDateTime('2026-09-29T11:00').getTime();   /* 11点：09-29 10:00 已过去 */

function exp55(prodDate = '2026-09-19', days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate,
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetMode: 'custom', targetConfirmed: true, targetDays: days
  });
}
function exp36() {
  return app.cleanExperiment({
    id: 'E36', no: '36-01', project: '36℃样品', batch: 'B2', prodDate: '2026-09-19',
    putinDate: '2026-09-22', months: 3, condition: '36±1℃', planTime: '10:00',
    protocol36: {modelVersion:2,totalDays:15,microDay:14,targetConfirmed:true,tasks:{}}
  });
}
function stateWith(prodDate) {
  const state = app.defaultState();
  state.experiments = [exp55(prodDate)];
  return state;
}
function rowsOf(state) { return app.computeSchedule(state).rows; }
function rowOf(state, day) { return rowsOf(state).find(row => row.expId === 'E55' && row.day === day); }
function candidatesOf(state, day, nowMs) {
  return app.build55ConflictSummary(rowOf(state, day), state, {nowMs}).candidates;
}
function grouped(state, nowMs) {
  return app.build55GroupedConflictSuggestions(rowsOf(state), state, {expId: 'E55', nowMs});
}
function planEntries(plan) {
  const entries = [];
  for (const group of plan.groups) {
    for (let i = 0; i < group.days.length; i++) {
      entries.push({putin: group.putin, day: group.days[i], takeout: group.takeouts[i]});
    }
  }
  return entries;
}
/* 已采用旧方案（prod 09-22 推荐）后改生产日期 09-19 */
function adoptedThenProd19() {
  const state = stateWith('2026-09-22');
  const plan = grouped(state, app.parseDateTime('2026-09-01T00:00').getTime());
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  state.experiments[0].prodDate = '2026-09-19';
  return state;
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('PAST-01', 'now=09-29 07:30 时，不得生成 09-28 任何候选', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    const candidates = candidatesOf(state, day, T1);
    assert.ok(candidates.every(c => c.putin.getTime() >= T1), `Day${day} 出现已过去的候选`);
    assert.ok(!candidates.some(c => app.ymdOf(c.putin) === '2026-09-28'), `Day${day} 出现 09-28 候选`);
  }
});

test('PAST-02', 'now=09-29 07:30 时，09-29 10:00 若其他条件合法可生成', () => {
  const state = stateWith('2026-09-19');
  const found = candidatesOf(state, 9, T1).find(c => app.fmtDT(c.putin) === '2026-09-29 10:00');
  assert.ok(found);
  assert.equal(app.fmtDT(found.takeout), '2026-10-08 10:00');
});

test('PAST-03', 'now=09-29 11:00 时，09-29 10:00 不得生成', () => {
  const state = stateWith('2026-09-19');
  const candidates = candidatesOf(state, 9, T2);
  assert.ok(!candidates.some(c => app.fmtDT(c.putin) === '2026-09-29 10:00'));
  assert.ok(candidates.every(c => c.putin.getTime() >= T2));
});

test('PAST-04', '任何 candidatePutin >= prodDate', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const c of candidatesOf(state, day, T1)) {
      assert.ok(app.ymdOf(c.putin) >= '2026-09-19');
    }
  }
});

test('PAST-05', '任何 candidatePutin >= now（datetime 比较）', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const c of candidatesOf(state, day, T1)) {
      assert.ok(c.putin.getTime() >= T1);
    }
  }
});

test('PAST-06', 'takeout = putin + Day×24h', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const c of candidatesOf(state, day, T1)) {
      assert.equal(c.takeout.getTime() - c.putin.getTime(), day * DAY_MS);
    }
  }
});

test('PAST-07', 'putin/takeout 均可操作', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const c of candidatesOf(state, day, T1)) {
      assert.equal(c.putinStatus.available, true);
      assert.equal(c.takeoutStatus.available, true);
    }
  }
});

test('PAST-08', '普通联合建议不推荐过去时间', () => {
  const state = stateWith('2026-09-19');
  const plan = grouped(state, T1);
  assert.ok(plan);
  for (const entry of planEntries(plan)) {
    assert.ok(entry.putin.getTime() >= T1, `Day${entry.day} 联合建议含过去时间`);
  }
});

test('PAST-09', '重新优化建议不推荐过去时间', () => {
  const state = adoptedThenProd19();
  const suggestion = app.build55ReoptimizationSuggestion(state, 'E55', {nowMs: T1});
  assert.ok(suggestion);
  assert.ok(suggestion.changes.length > 0);
  for (const entry of planEntries(suggestion.plan)) {
    assert.ok(entry.putin.getTime() >= T1, `Day${entry.day} 重新优化建议含过去时间`);
  }
});

test('PAST-10', 'preview 打开后时间越过候选点，确认采用必须拒绝', () => {
  const state = adoptedThenProd19();
  const suggestion = app.build55ReoptimizationSuggestion(state, 'E55', {nowMs: T1});
  /* 11 点时：普通联合建议的采用校验拒绝已过去候选 */
  const plan = grouped(state, T1);
  const checked = app.validate55GroupedSuggestionPlanForApply(state, 'E55', plan, {nowMs: T2});
  assert.equal(checked.ok, false);
  assert.match(checked.error, /已经过去/);
  /* 重新优化采用同样拒绝，且 state 不变 */
  const before = JSON.stringify(state.executions);
  const result = app.apply55ReoptimizedSuggestion(state, 'E55', suggestion, {nowMs: T2});
  assert.equal(result.ok, false);
  assert.match(result.error, /已经过去/);
  assert.equal(JSON.stringify(state.executions), before);
});

test('PAST-11', '已确认节点仍不参与优化', () => {
  const state = stateWith('2026-09-19');
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05'
  });
  const plan = grouped(state, T1);
  assert.ok(!Array.from(plan.conflicts, conflict => conflict.day).includes(9));
});

test('PAST-12', '36℃不变', () => {
  const state = stateWith('2026-09-19');
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  grouped(state, T1);
  app.build55ReoptimizationSuggestion(state, 'E55', {nowMs: T1});
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

console.log(`55C-PAST-TIMES: ${passed} PASS, ${total - passed} FAIL`);
