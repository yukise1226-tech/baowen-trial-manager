// 任务08.1：修正55℃联合建议入口触发条件——未确认放入节点按完整冲突摘要判断，
// 放入可操作、取出不可操作时也必须显示冲突提示与调整建议；新增试验级冲突摘要入口。
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
function classicState(days) {
  const state = app.defaultState();
  state.experiments = [exp55(days)];
  return state;
}
function rowOf(state, day) {
  return app.computeSchedule(state).rows.find(row => row.expId === 'E55' && row.day === day);
}
function syntheticRow(putin, day, expId = 'SYN') {
  const originalPutin = app.parseDateTime(putin);
  return {
    expId, day, status: '未放入', enabled: true, ex: app.cleanExecution(null),
    effectivePlanPutin: originalPutin,
    effectivePlanTakeout: app.addDays(originalPutin, day),
    originalPlanPutin: originalPutin,
    originalPlanTakeout: app.addDays(originalPutin, day)
  };
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('FIX-01', 'putin 可操作、takeout 为 holiday 时，待放入行显示取出冲突提示与调整建议', () => {
  const state = classicState();
  const day3 = rowOf(state, 3);
  /* 前提：放入 09-22 可操作，取出 09-25 为法定节假日 */
  assert.equal(app.operationDateStatus(day3.effectivePlanPutin, state).available, true);
  assert.equal(app.operationDateStatus(day3.effectivePlanTakeout, state).reason, 'holiday');
  const markup = app.operation55SuggestionHTML(day3, state, day3.effectivePlanPutin);
  assert.match(markup, /查看调整建议/);
  assert.match(markup, /取出日冲突（法定节假日）/);
  /* 待放入操作行（今日行渲染）同样可见，并内联提示取出日期冲突 */
  app.state = state;
  const putinMarkup = app.todayPutinRow(day3);
  assert.match(putinMarkup, /查看调整建议/);
  assert.match(putinMarkup, /法定节假日/);
  assert.match(putinMarkup, /联合建议｜推荐：节前优先集中/);
  assert.match(putinMarkup, /采用推荐方案/);
});

test('FIX-02', 'putin 可操作、takeout 为 weekend 时同样显示', () => {
  const state = classicState();
  const row = syntheticRow('2026-11-12T10:00', 2);   /* 取出 2026-11-14 周六（无节假日数据覆盖） */
  assert.equal(app.operationDateStatus(row.effectivePlanPutin, state).available, true);
  assert.equal(app.operationDateStatus(row.effectivePlanTakeout, state).reason, 'weekend');
  const markup = app.operation55SuggestionHTML(row, state, row.effectivePlanPutin);
  assert.match(markup, /查看调整建议/);
  assert.match(markup, /取出日冲突（周末）/);
});

test('FIX-03', 'putin 与 takeout 均可操作时不显示建议', () => {
  const state = classicState();
  const row = syntheticRow('2026-09-21T10:00', 1);   /* 取出 09-22 周二 */
  assert.equal(app.operationDateStatus(row.effectivePlanPutin, state).available, true);
  assert.equal(app.operationDateStatus(row.effectivePlanTakeout, state).available, true);
  assert.equal(app.operation55SuggestionHTML(row, state, row.effectivePlanPutin), '');
  assert.equal(app.operation55SuggestionHTML(row, state, row.effectivePlanTakeout), '');
});

test('FIX-04', '经典 2026-09-22：Day3/9/10/11/12/13/14 均被识别为冲突节点', () => {
  const state = classicState();
  for (const day of [3,9,10,11,12,13,14]) {
    const summary = app.build55ConflictSummary(rowOf(state, day), state);
    assert.ok(summary.conflictReasons.length > 0, `Day${day} 应为冲突节点`);
  }
  for (const day of [1,2,4,5,6,7,8]) {
    const summary = app.build55ConflictSummary(rowOf(state, day), state);
    assert.equal(summary.conflictReasons.length, 0, `Day${day} 不应为冲突节点`);
  }
});

test('FIX-05', '试验级摘要显示冲突数量和 Day 列表', () => {
  const state = classicState();
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55ConflictSummaryHTML(item, state);
  assert.match(markup, /存在 7 个不可操作日冲突/);
  assert.match(markup, /Day3、Day9、Day10、Day11、Day12、Day13、Day14/);
  assert.match(markup, /查看联合调整建议/);
});

test('FIX-06', '从试验级入口打开的联合方案与任务07算法输出完全一致', () => {
  const state = classicState();
  const rows = app.computeSchedule(state).rows;
  const plan = app.build55GroupedConflictSuggestions(rows, state, {expId: 'E55'});
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55ConflictSummaryHTML(item, state);
  const sigMatch = markup.match(/data-sig="([^"]*)"/);
  assert.ok(sigMatch);
  assert.equal(sigMatch[1], app.grouped55PlanSignature(plan));
});

test('FIX-07', '采用方案仍走任务08：重新计算 → 校验 → 确认 → 写 adjustedPlanPutin', () => {
  const state = classicState();
  /* 复刻 groupedApplyOpen/groupedApplyYes 的 handler 逻辑（vm 中无法真实点击） */
  const plan = app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId: 'E55'});
  assert.ok(plan);
  assert.equal(app.validate55GroupedSuggestionPlanForApply(state, 'E55', plan).ok, true);
  const result = app.apply55GroupedSuggestionPlan(state, 'E55', plan);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 7);
  /* 应用后冲突解决，试验级摘要入口随之消失 */
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  assert.equal(app.exp55ConflictSummaryHTML(item, state), '');
});

test('FIX-08', '无冲突节点不移动', () => {
  const state = classicState();
  const before = JSON.stringify(
    app.computeSchedule(state).rows.filter(row => [1,2,4,5,6,7,8].includes(row.day))
      .map(row => ({day: row.day, putin: row.effectivePlanPutin.getTime(), takeout: row.effectivePlanTakeout.getTime()}))
  );
  app.apply55GroupedSuggestionPlan(state, 'E55',
    app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId: 'E55'}));
  const after = JSON.stringify(
    app.computeSchedule(state).rows.filter(row => [1,2,4,5,6,7,8].includes(row.day))
      .map(row => ({day: row.day, putin: row.effectivePlanPutin.getTime(), takeout: row.effectivePlanTakeout.getTime()}))
  );
  assert.equal(after, before);
});

console.log(`55C-SUGGESTION-TRIGGER-FIX: ${passed} PASS, ${total - passed} FAIL`);
