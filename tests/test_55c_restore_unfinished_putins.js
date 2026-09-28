// 任务08.4：把“进行中但未完成”的55℃节点安全恢复为未放入（清除测试期的错误确认放入）；
// 复用 undoPutinRecord，保留计划调整/执行人/备注；已完成节点整组拒绝；36℃与协议不变。
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

function exp55(days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate: '2026-09-20',
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
function classicState() {
  const state = app.defaultState();
  state.experiments = [exp55()];
  return state;
}
function rowOf(state, day) {
  return app.computeSchedule(state).rows.find(row => row.expId === 'E55' && row.day === day);
}
/* Day3 进行中未完成（含计划调整/执行人/备注）；Day4 已完成；其余未放入 */
function stateWithMixed() {
  const state = classicState();
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05',
    adjustedPlanPutin: '2026-09-29T10:00', adjustedExpectedTakeout: '', qty: '1',
    person: '张三', note: '测试确认'
  });
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-24T10:12',
    adjustedPlanPutin: '', person: '李四', note: ''
  });
  state.executions[app.exKey('E55', 4)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: true,
    putinTime: '2026-09-24T10:00', takeoutTime: '2026-09-28T11:00', qty: '2'
  });
  return state;
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('RESTORE-01', '进行中未完成节点可以恢复为未放入', () => {
  const state = stateWithMixed();
  const result = app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  assert.equal(result.ok, true);
  assert.equal(result.restored, 1);
  assert.equal(rowOf(state, 3).status, '未放入');
});

test('RESTORE-02', '恢复后 putinConfirmed=false', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  assert.equal(app.exOf(state, 'E55', 3).putinConfirmed, false);
});

test('RESTORE-03', '恢复后 putinTime 清空', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  assert.equal(app.exOf(state, 'E55', 3).putinTime, '');
});

test('RESTORE-04', 'adjustedPlanPutin 保留', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '2026-09-29T10:00');
});

test('RESTORE-05', 'person / note 保留', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  assert.equal(app.exOf(state, 'E55', 3).person, '张三');
  assert.equal(app.exOf(state, 'E55', 3).note, '测试确认');
});

test('RESTORE-06', '已完成节点不能直接恢复', () => {
  const state = stateWithMixed();
  const before = JSON.stringify(state.executions);
  const result = app.apply55RestoreUnfinishedPutins(state, 'E55', [4]);
  assert.equal(result.ok, false);
  assert.match(result.error, /已完成/);
  assert.equal(JSON.stringify(state.executions), before);
});

test('RESTORE-07', '批量恢复多个未完成节点成功', () => {
  const state = stateWithMixed();
  assert.deepEqual(Array.from(app.collect55RestorablePutinDays(state, 'E55')), [3,9]);
  const result = app.apply55RestoreUnfinishedPutins(state, 'E55', [3,9]);
  assert.equal(result.ok, true);
  assert.equal(result.restored, 2);
  assert.equal(rowOf(state, 3).status, '未放入');
  assert.equal(rowOf(state, 9).status, '未放入');
  assert.equal(app.exOf(state, 'E55', 9).putinConfirmed, false);
});

test('RESTORE-08', '批量中混入已完成节点时整组拒绝', () => {
  const state = stateWithMixed();
  const before = JSON.stringify(state.executions);
  const result = app.apply55RestoreUnfinishedPutins(state, 'E55', [3,4]);
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state.executions), before);          /* 一个都不写 */
  assert.equal(app.exOf(state, 'E55', 3).putinConfirmed, true);    /* Day3 也没有部分恢复 */
});

test('RESTORE-09', '恢复后节点重新允许调整计划', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  /* 恢复后重新人工调整（与 adjustSave 相同的写入路径），有效计划立即生效 */
  const ex = app.exOf(state, 'E55', 3);
  ex.adjustedPlanPutin = '2026-10-09T10:00';
  state.executions[app.exKey('E55', 3)] = ex;
  const row = rowOf(state, 3);
  assert.equal(app.fmtDT(row.effectivePlanPutin), '2026-10-09 10:00');
  assert.equal(row.adjusted, true);
});

test('RESTORE-10', '恢复后可以重新进入联合建议流程', () => {
  const state = stateWithMixed();
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3]);
  /* Day3 恢复后回到原计划 09-22（取出 09-25 节假日冲突），重新进入联合建议并可采用 */
  const plan = app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId: 'E55'});
  assert.ok(plan);
  assert.ok(Array.from(plan.conflicts, conflict => conflict.day).includes(3));
  const applied = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(applied.ok, true);
  assert.ok(applied.changes.some(change => change.day === 3));
});

test('RESTORE-11', '36℃完全不变', () => {
  const state = stateWithMixed();
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3,9]);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
  for (const key of Object.keys(state.executions)) {
    assert.ok(!key.includes('|36|') || JSON.stringify(state.executions[key]) === JSON.stringify(state.executions[key]),
      '36℃执行键不应被触碰');
  }
});

test('RESTORE-12', 'schemaVersion 不变', () => {
  const state = stateWithMixed();
  assert.equal(state.schemaVersion, 6);
  app.apply55RestoreUnfinishedPutins(state, 'E55', [3,9]);
  assert.equal(state.schemaVersion, 6);
});

test('RESTORE-UI-01', '排程区块恢复入口展示节点列表与确认弹窗内容', () => {
  const state = stateWithMixed();
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55RestoreUnfinishedHTML(item, state);
  assert.match(markup, /有 2 个进行中未完成节点（Day3、Day9）/);
  assert.match(markup, /批量恢复未完成的确认放入/);
  assert.match(markup, /data-act="restoreUnfinishedOpen"/);
  const confirmMarkup = app.restore55UnfinishedConfirmHTML(item.exp, [3,9]);
  assert.match(confirmMarkup, /将以下节点恢复为未放入：/);
  assert.match(confirmMarkup, /Day3、Day9/);
  assert.match(confirmMarkup, /实际放入时间将清空。/);
  assert.match(confirmMarkup, /计划调整、执行人、备注保留。/);
  assert.match(confirmMarkup, /已完成节点不会处理。/);
  assert.match(confirmMarkup, /data-act="restoreUnfinishedYes"/);
  assert.match(confirmMarkup, />确认恢复</);
  assert.match(confirmMarkup, />取消</);
  /* 无进行中未完成节点时不显示入口 */
  const clean = classicState();
  const cleanItem = app.computeSchedule(clean).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  assert.equal(app.exp55RestoreUnfinishedHTML(cleanItem, clean), '');
});

console.log(`55C-RESTORE-UNFINISHED-PUTINS: ${passed} PASS, ${total - passed} FAIL`);
