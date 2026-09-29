// 任务09.2：联合优化必须复用短周期节点已选中的放入批次——短周期固定候选并入同一优化器，
// 其放入时间成为“免费批次”，长周期节点加入不增加总体 batchCount；时间/批次相同时优先更早的各节点 takeout。
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

function exp55(prodDate = '2026-09-22', days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate,
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetMode: 'custom', targetConfirmed: true, targetDays: days
  });
}
function stateWith(prodDate) {
  const state = app.defaultState();
  state.experiments = [exp55(prodDate)];
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

const prod19 = () => stateWith('2026-09-19');

test('BATCHREUSE-01', 'prodDate=09-19 时 Day3 选择 09-20', () => {
  const plan = grouped(prod19());
  const entry3 = entriesOf(plan).find(entry => entry.day === 3);
  assert.ok(entry3);
  assert.equal(app.fmtDT(entry3.putin), '2026-09-20 10:00');
});

test('BATCHREUSE-02', 'Day9 存在 09-20 合法候选', () => {
  const state = prod19();
  const found = app.build55ConflictSummary(rowOf(state, 9), state).candidates
    .some(candidate => app.fmtDT(candidate.putin) === '2026-09-20 10:00');
  assert.ok(found);
});

test('BATCHREUSE-03', 'Day10 存在 09-20 合法候选', () => {
  const state = prod19();
  const found = app.build55ConflictSummary(rowOf(state, 10), state).candidates
    .some(candidate => app.fmtDT(candidate.putin) === '2026-09-20 10:00');
  assert.ok(found);
});

test('BATCHREUSE-04', '长周期优化知道 09-20 已经是现有批次', () => {
  const plan = grouped(prod19());
  const group = plan.groups.find(g => app.fmtDT(g.putin) === '2026-09-20 10:00');
  assert.ok(group);
  assert.deepEqual(Array.from(group.days).sort((a,b) => a-b), [3,9,10]);
});

test('BATCHREUSE-05', 'Day9/Day10 加入 09-20 时不增加总 batchCount', () => {
  const plan = grouped(prod19());
  /* 若 09-20 被视为新增批次，方案会是 5 批；实际复用后为 4 批 */
  assert.equal(plan.batchCount, 4);
  const group = plan.groups.find(g => app.fmtDT(g.putin) === '2026-09-20 10:00');
  assert.ok(group.days.includes(9) && group.days.includes(10));
});

test('BATCHREUSE-06', '推荐方案实际选择 Day9 = 09-20', () => {
  const entry = entriesOf(grouped(prod19())).find(e => e.day === 9);
  assert.equal(app.fmtDT(entry.putin), '2026-09-20 10:00');
  assert.equal(app.fmtDT(entry.takeout), '2026-09-29 10:00');
});

test('BATCHREUSE-07', '推荐方案实际选择 Day10 = 09-20', () => {
  const entry = entriesOf(grouped(prod19())).find(e => e.day === 10);
  assert.equal(app.fmtDT(entry.putin), '2026-09-20 10:00');
  assert.equal(app.fmtDT(entry.takeout), '2026-09-30 10:00');
});

test('BATCHREUSE-08', '最终总批次数不高于当前方案', () => {
  const plan = grouped(prod19());
  assert.ok(plan.batchCount <= 4);
});

test('BATCHREUSE-09', 'latestTakeout 不变差', () => {
  const plan = grouped(prod19());
  assert.equal(app.fmtDT(plan.latestTakeout), '2026-10-12 10:00');
});

test('BATCHREUSE-10', 'terminalTakeout 不变差', () => {
  const plan = grouped(prod19());
  assert.equal(app.fmtDT(plan.terminalTakeout), '2026-10-08 10:00');
});

test('BATCHREUSE-11', 'totalAbsOffsetDays 更优时优先该方案', () => {
  const plan = grouped(prod19());
  assert.ok(plan.totalAbsOffsetDays < plan.alternatives[0].totalAbsOffsetDays);
  assert.equal(plan.totalAbsOffsetDays, 23);
});

test('BATCHREUSE-12', 'prodDate=09-22 经典案例仍绝不早于 09-22', () => {
  const plan = grouped(stateWith('2026-09-22'));
  for (const entry of entriesOf(plan)) {
    assert.ok(app.ymdOf(entry.putin) >= '2026-09-22', `Day${entry.day} 早于生产日期`);
  }
});

test('BATCHREUSE-13', '无冲突节点不移动', () => {
  const state = prod19();
  const plan = grouped(state);
  app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

console.log(`55C-BATCH-REUSE: ${passed} PASS, ${total - passed} FAIL`);
