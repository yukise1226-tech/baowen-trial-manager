// 任务09.1：55℃候选最早放入边界 = 生产日期（而非当前计划）——允许相对当前计划提前的合法候选，
// 但绝不早于生产日期；apply 层同步改为生产日期校验；历史异常检测不再把“早于原计划”当作错误。
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

function exp55(days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14], prodDate = '2026-09-22') {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate,
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
function stateWith(prodDate, days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  const state = app.defaultState();
  state.experiments = [exp55(days, prodDate)];
  return state;
}
function rowsOf(state) { return app.computeSchedule(state).rows; }
function rowOf(state, day) { return rowsOf(state).find(row => row.expId === 'E55' && row.day === day); }
function candidatesOf(state, day) { return app.build55ConflictSummary(rowOf(state, day), state).candidates; }
function grouped(state) {
  return app.build55GroupedConflictSuggestions(rowsOf(state), state, {expId: 'E55'});
}
function groupDaysOf(plan, putinText) {
  const group = plan.groups.find(g => app.fmtDT(g.putin) === putinText);
  return group ? Array.from(group.days) : null;
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('EARLY-01', 'prodDate=09-22 时，不得生成09-22之前候选', () => {
  const state = stateWith('2026-09-22');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const candidate of candidatesOf(state, day)) {
      assert.ok(app.ymdOf(candidate.putin) >= '2026-09-22', `Day${day} 出现早于生产日期的候选`);
    }
  }
});

test('EARLY-02', 'prodDate=09-19、currentPlan=09-22 时，允许生成 09-20/09-21 合法候选', () => {
  const state = stateWith('2026-09-19');
  const day9 = candidatesOf(state, 9);
  assert.ok(day9.some(candidate => app.ymdOf(candidate.putin) === '2026-09-20'));
  assert.ok(day9.some(candidate => app.ymdOf(candidate.putin) === '2026-09-21'));
});

test('EARLY-03', '候选绝不早于 prodDate', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const candidate of candidatesOf(state, day)) {
      assert.ok(app.ymdOf(candidate.putin) >= '2026-09-19', `Day${day} 候选早于生产日期`);
    }
  }
});

test('EARLY-04', '候选 putin 必须可操作', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const candidate of candidatesOf(state, day)) {
      assert.equal(candidate.putinStatus.available, true);
    }
  }
});

test('EARLY-05', '候选 takeout 必须可操作', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const candidate of candidatesOf(state, day)) {
      assert.equal(candidate.takeoutStatus.available, true);
    }
  }
});

test('EARLY-06', '全部保持 takeout = putin + Day×24h', () => {
  const state = stateWith('2026-09-19');
  for (const day of [3,9,10,11,12,13,14]) {
    for (const candidate of candidatesOf(state, day)) {
      assert.equal(candidate.takeout.getTime() - candidate.putin.getTime(), day * DAY_MS);
    }
  }
});

test('EARLY-07', 'Day9 在 09-19 生产案例能发现更早合法方案（09-20 放入 → 09-29 取出）', () => {
  const state = stateWith('2026-09-19');
  const found = candidatesOf(state, 9).find(candidate =>
    app.fmtDT(candidate.putin) === '2026-09-20 10:00' && app.fmtDT(candidate.takeout) === '2026-09-29 10:00');
  assert.ok(found, 'Day9 应存在 09-20 → 09-29 的合法候选');
});

test('EARLY-08', 'Day10 在 09-19 生产案例能发现更早合法方案（09-20 放入 → 09-30 取出）', () => {
  const state = stateWith('2026-09-19');
  const found = candidatesOf(state, 10).find(candidate =>
    app.fmtDT(candidate.putin) === '2026-09-20 10:00' && app.fmtDT(candidate.takeout) === '2026-09-30 10:00');
  assert.ok(found, 'Day10 应存在 09-20 → 09-30 的合法候选');
});

test('EARLY-09', '存在 adjustedPlanPutin 时，未确认节点仍允许优化到更早但不早于 prodDate', () => {
  const state = stateWith('2026-09-19');
  /* 调整到 09-23 仍冲突（取出 10-02 节假日），重新优化可给出 09-20 等更早候选 */
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({adjustedPlanPutin: '2026-09-23T10:00'});
  const row = rowOf(state, 9);
  assert.equal(app.fmtDT(row.effectivePlanPutin), '2026-09-23 10:00');
  const candidates = app.build55ConflictSummary(row, state).candidates;
  assert.ok(candidates.length > 0);
  const earlier = candidates.filter(candidate => candidate.putin.getTime() < row.effectivePlanPutin.getTime());
  assert.ok(earlier.length > 0, '应存在早于 adjustedPlanPutin 的候选');
  for (const candidate of earlier) {
    assert.ok(app.ymdOf(candidate.putin) >= '2026-09-19');
  }
});

test('EARLY-10', 'putinConfirmed=true 节点绝不参与', () => {
  const state = stateWith('2026-09-19');
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05'
  });
  const plan = grouped(state);
  assert.ok(!Array.from(plan.conflicts, conflict => conflict.day).includes(9));
});

test('EARLY-11', 'apply 层接受合法的“相对当前计划提前”方案', () => {
  const state = stateWith('2026-09-19');
  const plan = grouped(state);
  const earlyGroup = plan.groups.find(group => app.fmtDT(group.putin) === '2026-09-20 10:00');
  assert.ok(earlyGroup);
  assert.ok(earlyGroup.offsets.some(offset => offset < 0));
  assert.equal(app.validate55GroupedSuggestionPlanForApply(state, 'E55', plan).ok, true);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 7);
});

test('EARLY-12', 'apply 层拒绝任何早于 prodDate 方案', () => {
  const state = stateWith('2026-09-19');
  const stalePlan = {
    groups: [{
      putin: app.parseDateTime('2026-09-18T10:00'),
      days: [9],
      takeouts: [app.parseDateTime('2026-09-27T10:00')]
    }]
  };
  const checked = app.validate55GroupedSuggestionPlanForApply(state, 'E55', stalePlan);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /早于生产日期/);
});

test('EARLY-13', 'prodDate <= adjustedPlanPutin < originalPlanPutin 不再被标记为异常', () => {
  const state = stateWith('2026-09-20');   /* 生产 09-20；原计划 09-22 */
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-21T10:00'});
  /* 09-21 早于原计划但晚于生产日期，且取出 09-24 可操作 → 无任何异常 */
  const list = app.collect55LegacyPlanAnomalies(state, 'E55');
  assert.equal(list.filter(a => a.day === 3).length, 0);
  assert.ok(!list.some(a => a.type === 'legacy-advance-adjustment'));
  /* 早于生产日期的调整仍被识别（生产日期是唯一时间边界） */
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-19T10:00'});
  const list2 = app.collect55LegacyPlanAnomalies(state, 'E55');
  assert.ok(list2.some(a => a.type === 'plan-putin-before-prod' && a.day === 3));
});

test('EARLY-14', '无冲突节点保持不动', () => {
  const state = stateWith('2026-09-22');
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('EARLY-15', '36℃不变', () => {
  const state = stateWith('2026-09-19');
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

console.log(`55C-EARLY-BOUND: ${passed} PASS, ${total - passed} FAIL`);
