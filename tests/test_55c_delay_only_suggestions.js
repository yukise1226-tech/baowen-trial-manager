// 任务08.3：55℃冲突建议禁止提前放入——候选生成源头只后移（offsetDays>0），
// 应用校验第二道防线拒绝早于当前有效计划的放入。
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

function exp55(days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate: '2026-09-20',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetMode: 'custom', targetConfirmed: true, targetDays: days
  });
}
function classicState(days) {
  const state = app.defaultState();
  state.experiments = [exp55(days)];
  return state;
}
function rowsOf(state) { return app.computeSchedule(state).rows; }
function rowOf(state, day) { return rowsOf(state).find(row => row.expId === 'E55' && row.day === day); }
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

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('DELAY-01', '候选列表不得存在 offsetDays < 0', () => {
  const state = classicState();
  for (const day of [3,9,10,11,12,13,14]) {
    const candidates = app.build55ConflictSummary(rowOf(state, day), state).candidates;
    assert.ok(candidates.length > 0, `Day${day} 应有候选`);
    assert.ok(candidates.every(candidate => candidate.offsetDays > 0), `Day${day} 候选必须全部后移`);
  }
});

test('DELAY-02', '经典09/22 Day3 不得出现 09-21、09-20 等更早放入', () => {
  const state = classicState();
  const candidates = app.build55ConflictSummary(rowOf(state, 3), state).candidates;
  for (const candidate of candidates) {
    assert.ok(candidate.putin.getTime() >= rowOf(state, 3).effectivePlanPutin.getTime(),
      `Day3 候选不得早于 09-22：${app.fmtDT(candidate.putin)}`);
    assert.notEqual(app.ymdOf(candidate.putin), '2026-09-21');
    assert.notEqual(app.ymdOf(candidate.putin), '2026-09-20');
  }
});

test('DELAY-03', '经典Day3最早候选为算法计算出的合法后移日期', () => {
  const state = classicState();
  const first = app.build55ConflictSummary(rowOf(state, 3), state).candidates[0];
  assert.equal(app.fmtDT(first.putin), '2026-10-09 10:00');
  assert.equal(app.fmtDT(first.takeout), '2026-10-12 10:00');
  assert.equal(first.offsetDays, 17);
});

test('DELAY-04', '所有候选 candidatePutin >= effectivePlanPutin', () => {
  const state = classicState();
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowOf(state, day);
    for (const candidate of app.build55ConflictSummary(row, state).candidates) {
      assert.ok(candidate.putin.getTime() >= row.effectivePlanPutin.getTime(), `Day${day} 候选早于当前计划`);
    }
  }
});

test('DELAY-05', '已存在 adjustedPlanPutin 时，新候选不得早于该 adjustedPlanPutin', () => {
  const state = classicState();
  /* Day3 人为调整到 09-23（取出 09-26 仍冲突），后续候选必须 >= 09-23 */
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-23T10:00'});
  const row = rowOf(state, 3);
  assert.equal(app.fmtDT(row.effectivePlanPutin), '2026-09-23 10:00');
  const candidates = app.build55ConflictSummary(row, state).candidates;
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.ok(candidate.putin.getTime() >= row.effectivePlanPutin.getTime());
  }
});

test('DELAY-06', '无冲突 Day1/2/4/5/6/7/8 完全不移动', () => {
  const state = classicState();
  const plan = grouped(state);
  assert.deepEqual(Array.from(plan.conflicts, conflict => conflict.day), [3,9,10,11,12,13,14]);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('DELAY-07', 'Day9～14 可通过后移联合成较少批次（Day14 提前独立）', () => {
  const state = classicState();
  const plan = grouped(state);
  assert.ok(plan.batchCount < 7, '联合批次应少于冲突节点数');
  const longGroups = plan.groups.filter(group => group.days.every(day => day >= 9));
  assert.equal(longGroups.length, 3);
  const totalDays = longGroups.reduce((sum, group) => sum + group.days.length, 0);
  assert.equal(totalDays, 6);
  assert.ok(longGroups.every(group => group.offsets.every(offset => offset > 0)));
});

test('DELAY-08', '所有联合节点保持 Day×24h', () => {
  const state = classicState();
  for (const entry of entriesOf(grouped(state))) {
    assert.equal(entry.takeout.getTime() - entry.putin.getTime(), entry.day * DAY_MS);
  }
});

test('DELAY-09', '所有放入/取出均可操作', () => {
  const state = classicState();
  for (const entry of entriesOf(grouped(state))) {
    assert.equal(app.operationDateStatus(entry.putin, state).available, true);
    assert.equal(app.operationDateStatus(entry.takeout, state).available, true);
  }
});

test('DELAY-10', 'validate/apply 拒绝包含早于当前计划时间的旧方案', () => {
  const state = classicState();
  /* 手工构造含负偏移的“旧 plan 对象”（如任务08前页面残留在内存中的方案） */
  const stalePlan = {
    groups: [{
      putin: app.parseDateTime('2026-09-21T10:00'),
      days: [3],
      takeouts: [app.parseDateTime('2026-09-24T10:00')]
    }]
  };
  const checked = app.validate55GroupedSuggestionPlanForApply(state, 'E55', stalePlan);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /早于当前有效计划/);
  const before = JSON.stringify(state.executions);
  const applied = app.apply55GroupedSuggestionPlan(state, 'E55', stalePlan);
  assert.equal(applied.ok, false);
  assert.equal(JSON.stringify(state.executions), before);
});

test('DELAY-11', '采用后不存在任何 adjustedPlanPutin 早于应用前 effectivePlanPutin', () => {
  const state = classicState();
  const beforeMap = {};
  for (const row of rowsOf(state)) beforeMap[row.day] = row.effectivePlanPutin.getTime();
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  for (const key of Object.keys(state.executions)) {
    if (!key.startsWith('E55|') || !state.executions[key].adjustedPlanPutin) continue;
    const day = +key.split('|')[1];
    assert.ok(app.parseDateTime(state.executions[key].adjustedPlanPutin).getTime() >= beforeMap[day],
      `Day${day} 调整后放入早于应用前计划`);
  }
  /* 采用后冲突解决，联合建议消失 */
  assert.equal(grouped(state), null);
});

console.log(`55C-DELAY-ONLY-SUGGESTIONS: ${passed} PASS, ${total - passed} FAIL`);
