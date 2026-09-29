// 任务09.3：一键重新优化已调整计划——旧 adjustedPlanPutin 不再阻止按当前规则重算建议；
// 只生成 preview，采用时原子替换（先清未确认节点旧调整，再写入新方案）；真实执行事实绝不进入。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');
const app = vm.createContext({console, Date, performance, setTimeout, clearTimeout});
vm.runInContext(match[1], app, {filename: htmlPath});

const DAY_MS = 24 * 60 * 60 * 1000;

function exp55(prodDate = '2026-09-22', days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
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
function stateWith(prodDate, days) {
  const state = app.defaultState();
  state.experiments = [exp55(prodDate, days)];
  return state;
}
function rowsOf(state) { return app.computeSchedule(state).rows; }
function grouped(state) {
  return app.build55GroupedConflictSuggestions(rowsOf(state), state, {expId: 'E55'});
}
/* 经典验收场景：先按 prod 09-22 采用推荐，再把生产日期改为 09-19 */
function adoptedThenProd19() {
  const state = stateWith('2026-09-22');
  app.apply55GroupedSuggestionPlan(state, 'E55', grouped(state));
  state.experiments[0].prodDate = '2026-09-19';
  return state;
}
function suggestionOf(state) {
  return app.build55ReoptimizationSuggestion(state, 'E55');
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

/* ---- DOM stub（事件绑定测试用；脚本末尾 boot 因 document 未定义已跳过 init） ---- */
const elements = {};
function el(id) {
  if (!elements[id]) {
    elements[id] = {
      id, innerHTML: '', hidden: false, value: id === 'todayDate' ? '2026-09-21' : '',
      textContent: '', style: {}, classList: { add() {}, remove() {} }, querySelector() { return null; }
    };
  }
  return elements[id];
}
const localStorage = {
  store: {}, getItem(key) { return key in this.store ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); }, removeItem(key) { delete this.store[key]; }
};
const document = { getElementById: el, querySelector() { return null; }, createElement() { return el('dummy'); } };
app.document = document;
app.localStorage = localStorage;
function fakeTarget(attrs) {
  return { getAttribute(name) { return attrs[name] || null; }, parentElement: null };
}
function modalHTML() { return el('modalBox').innerHTML; }
function toastText() { return el('toast').textContent; }

test('REOPT-01', '存在未执行 adjustedPlanPutin 时显示【重新优化建议】', () => {
  const state = adoptedThenProd19();
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55ReoptimizeHTML(item, state);
  assert.match(markup, /重新优化建议/);
  assert.match(markup, /data-act="reoptimizeOpen"/);
  /* 无调整时不显示 */
  const clean = stateWith('2026-09-22');
  const cleanItem = app.computeSchedule(clean).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  assert.equal(app.exp55ReoptimizeHTML(cleanItem, clean), '');
});

test('REOPT-02', '点击按钮真实打开 preview modal', () => {
  const state = adoptedThenProd19();
  app.state = state;
  app.document = document;
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55ReoptimizeHTML(item, state);
  const id = markup.match(/data-id="([^"]*)"/)[1];
  const btn = fakeTarget({'data-act': 'reoptimizeOpen', 'data-id': id});
  app.onPlanClick({target: btn, currentTarget: btn});
  assert.match(modalHTML(), /重新优化当前计划/);
  assert.match(modalHTML(), /当前计划：/);
  assert.match(modalHTML(), /新建议：/);
  assert.match(modalHTML(), /采用新建议/);
});

test('REOPT-03', '只点击按钮不修改 state', () => {
  const state = adoptedThenProd19();
  app.state = state;
  const before = JSON.stringify(state.executions);
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55ReoptimizeHTML(item, state);
  const id = markup.match(/data-id="([^"]*)"/)[1];
  const btn = fakeTarget({'data-act': 'reoptimizeOpen', 'data-id': id});
  app.onPlanClick({target: btn, currentTarget: btn});
  assert.equal(JSON.stringify(state.executions), before);
});

test('REOPT-04', '修改生产日期 09-22 → 09-19 后，无需手工 restorePlan 即可算出新方案', () => {
  const state = adoptedThenProd19();
  /* 当前有效计划已无冲突，普通联合建议不再生成 */
  assert.equal(grouped(state), null);
  /* 重新优化建议基于“恢复原始排程”的 clone 重算 */
  const suggestion = suggestionOf(state);
  assert.ok(suggestion);
  assert.ok(suggestion.plan);
  assert.ok(suggestion.changes.length > 0);
});

test('REOPT-05', '新方案包含 Day3/9/10 的 09-20 批次', () => {
  const suggestion = suggestionOf(adoptedThenProd19());
  const group = suggestion.plan.groups.find(g => app.fmtDT(g.putin) === '2026-09-20 10:00');
  assert.ok(group);
  assert.deepEqual(Array.from(group.days).sort((a,b) => a-b), [3,9,10]);
});

test('REOPT-06', '取消后所有旧 adjustedPlanPutin 保持不变', () => {
  const state = adoptedThenProd19();
  app.state = state;
  app.currentTab = 'today';
  const before = JSON.stringify(state.executions);
  app.onModalClick({target: fakeTarget({'data-act': 'closeModal'})});
  assert.equal(JSON.stringify(state.executions), before);
  assert.equal(app.exOf(state, 'E55', 9).adjustedPlanPutin, '2026-09-29T10:00');
});

test('REOPT-07', '确认采用后旧方案被新方案整体替换', () => {
  const state = adoptedThenProd19();
  const suggestion = suggestionOf(state);
  const result = app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  assert.equal(result.ok, true);
  assert.equal(result.applied, suggestion.changes.length);
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '2026-09-20T10:00');
  assert.equal(app.exOf(state, 'E55', 9).adjustedPlanPutin, '2026-09-20T10:00');
  assert.equal(app.exOf(state, 'E55', 10).adjustedPlanPutin, '2026-09-20T10:00');
  assert.equal(app.exOf(state, 'E55', 13).adjustedPlanPutin, '2026-09-29T10:00');   /* 不变节点保持 */
  assert.equal(app.exOf(state, 'E55', 14).adjustedPlanPutin, '2026-09-24T10:00');
});

test('REOPT-08', '新方案不再需要调整的节点，其 adjustedPlanPutin 应清除', () => {
  const state = stateWith('2026-09-22', [3,4]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-10-09T10:00'});
  state.executions[app.exKey('E55', 4)] = app.cleanExecution({adjustedPlanPutin: '2026-10-09T10:00'});
  const suggestion = suggestionOf(state);
  assert.ok(suggestion);
  const change4 = suggestion.changes.find(change => change.day === 4);
  assert.ok(change4);
  assert.equal(app.fmtDT(change4.to), '2026-09-24 10:00');   /* 恢复原计划 */
  const result = app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  assert.equal(result.ok, true);
  assert.ok(!app.exOf(state, 'E55', 4).adjustedPlanPutin);      /* 清除 */
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '2026-10-09T10:00');   /* 仍需要调整的保留 */
});

test('REOPT-09', 'putinConfirmed=true 节点绝不被清除或修改', () => {
  const state = stateWith('2026-09-22', [3,9]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05'
  });
  /* Day9 人为调整到 10-10（非最优），重新优化应把它改回 09-29 */
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({adjustedPlanPutin: '2026-10-10T10:00'});
  const suggestion = suggestionOf(state);
  assert.ok(suggestion);
  assert.ok(suggestion.changes.some(change => change.day === 9));
  const result = app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  assert.equal(result.ok, true);
  const ex3 = app.exOf(state, 'E55', 3);
  assert.equal(ex3.putinConfirmed, true);
  assert.equal(ex3.putinTime, '2026-09-22T10:05');
  assert.equal(app.exOf(state, 'E55', 9).adjustedPlanPutin, '2026-09-29T10:00');
});

test('REOPT-10', 'takeoutTime / putinTime 等实际事实不变', () => {
  const state = adoptedThenProd19();
  state.executions[app.exKey('E55', 9)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05', person: '张三'
  });
  const before = JSON.stringify(state.executions['E55|9']);
  suggestionOf(state);
  assert.equal(JSON.stringify(state.executions['E55|9']), before);
});

test('REOPT-11', 'preview signature 过期时拒绝采用并要求重新查看', () => {
  const state = adoptedThenProd19();
  app.state = state;
  app.currentTab = 'today';
  const before = JSON.stringify(state.executions);
  app.onModalClick({target: fakeTarget({'data-act': 'reoptimizeYes', 'data-id': 'E55', 'data-sig': 'stale-signature'})});
  assert.match(toastText(), /已变化/);
  assert.equal(JSON.stringify(state.executions), before);
});

test('REOPT-12', '新旧方案完全相同时不产生 mutation', () => {
  const state = adoptedThenProd19();
  /* 先采用重优化建议，使当前计划 = 最新推荐 */
  const suggestion = suggestionOf(state);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  const after = JSON.stringify(state.executions);
  /* 再次重算：变化清单为空，采用被拒绝且无 mutation */
  const again = suggestionOf(state);
  assert.ok(again);
  assert.equal(again.changes.length, 0);
  const result = app.apply55ReoptimizedSuggestion(state, 'E55', again);
  assert.equal(result.ok, false);
  assert.match(result.error, /无需调整/);
  assert.equal(JSON.stringify(state.executions), after);
});

test('REOPT-13', '采用后所有 Day×24h 正确', () => {
  const state = adoptedThenProd19();
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestionOf(state));
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowsOf(state).find(r => r.expId === 'E55' && r.day === day);
    assert.equal(row.effectivePlanTakeout.getTime() - row.effectivePlanPutin.getTime(), day * DAY_MS);
  }
});

test('REOPT-14', '采用后所有 putin/takeout 均可操作', () => {
  const state = adoptedThenProd19();
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestionOf(state));
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowsOf(state).find(r => r.expId === 'E55' && r.day === day);
    assert.equal(app.operationDateStatus(row.effectivePlanPutin, state).available, true);
    assert.equal(app.operationDateStatus(row.effectivePlanTakeout, state).available, true);
  }
});

test('REOPT-15', '无冲突、未参与优化节点保持原计划', () => {
  const state = adoptedThenProd19();
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestionOf(state));
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('REOPT-16', '36℃完全不变', () => {
  const state = adoptedThenProd19();
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  const suggestion = suggestionOf(state);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

test('REOPT-17', 'schemaVersion 不变', () => {
  const state = adoptedThenProd19();
  assert.equal(state.schemaVersion, 6);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestionOf(state));
  assert.equal(state.schemaVersion, 6);
});

/* ---- 任务09.3.1：新旧方案比较口径 ---- */
test('REOPT-SUM-01', '新建议 batchCount 等于实际采用后 computeSchedule 的 batches.length', () => {
  const state = adoptedThenProd19();
  const suggestion = suggestionOf(state);
  const comparison = app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestion);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  assert.equal(comparison.suggested.batchCount, item.batches.length);
});

test('REOPT-SUM-02', '09-19 案例显示 5批 → 5批（非 5批 → 4批）', () => {
  const state = adoptedThenProd19();
  const comparison = app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestionOf(state));
  assert.equal(comparison.current.batchCount, 5);
  assert.equal(comparison.suggested.batchCount, 5);
});

test('REOPT-SUM-03', 'suggested latestTakeout 等于实际采用后完整排程的最晚取出', () => {
  const state = adoptedThenProd19();
  const suggestion = suggestionOf(state);
  const comparison = app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestion);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  let latest = null;
  for (const row of rowsOf(state)) {
    if (row.expId !== 'E55' || row.status !== '未放入' || !row.effectivePlanTakeout) continue;
    if (!latest || row.effectivePlanTakeout.getTime() > latest) latest = row.effectivePlanTakeout.getTime();
  }
  assert.equal(comparison.suggested.latestTakeout.getTime(), latest);
  assert.equal(app.fmtDT(comparison.suggested.latestTakeout), '2026-10-12 10:00');
});

test('REOPT-SUM-04', 'suggested terminalDay 为整个未执行试验最高 Day，不是仅冲突节点最高 Day', () => {
  const state = adoptedThenProd19();
  const comparison = app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestionOf(state));
  assert.equal(comparison.suggested.terminalDay, 14);
});

test('REOPT-SUM-05', 'suggested terminalTakeout 与实际采用后的完整排程一致', () => {
  const state = adoptedThenProd19();
  const suggestion = suggestionOf(state);
  const comparison = app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestion);
  app.apply55ReoptimizedSuggestion(state, 'E55', suggestion);
  const row14 = rowsOf(state).find(r => r.expId === 'E55' && r.day === 14);
  assert.equal(comparison.suggested.terminalTakeout.getTime(), row14.effectivePlanTakeout.getTime());
  assert.equal(app.fmtDT(comparison.suggested.terminalTakeout), '2026-10-08 10:00');
});

test('REOPT-SUM-06', 'preview 仍不修改真实 state', () => {
  const state = adoptedThenProd19();
  const before = JSON.stringify(state);
  const suggestion = suggestionOf(state);
  app.compare55CurrentAndSuggestedPlan(state, 'E55', suggestion);
  app.project55PlanSummaryAfterSuggestion(state, 'E55', suggestion);
  assert.equal(JSON.stringify(state), before);
});

console.log(`55C-REOPTIMIZE: ${passed} PASS, ${total - passed} FAIL`);
