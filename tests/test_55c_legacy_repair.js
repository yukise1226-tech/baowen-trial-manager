// 任务08.4重做：历史计划异常检测与修正——只识别违反当前业务不变量的明确逻辑异常，
// 正常执行事实不动；纯计划异常按当前规则修正，硬错误确认需用户明确执行才解除。
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

function exp55(days, prodDate = '2026-09-22') {
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
function stateWith(days, opts = {}) {
  const state = app.defaultState();
  const exp = exp55(days, opts.prodDate);
  if (opts.putinDate) exp.putinDate = opts.putinDate;
  state.experiments = [exp];
  if (opts.executions) state.executions = opts.executions;
  return state;
}
function anomalies(state) {
  return app.collect55LegacyPlanAnomalies(state, 'E55');
}
function rowOf(state, day) {
  return app.computeSchedule(state).rows.find(row => row.expId === 'E55' && row.day === day);
}
function grouped(state) {
  return app.build55GroupedConflictSuggestions(app.computeSchedule(state).rows, state, {expId: 'E55'});
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('LEGACY-01', 'putinDate < prodDate 被检测为异常', () => {
  const state = stateWith([1], {putinDate: '2026-09-20', prodDate: '2026-09-22'});
  const list = anomalies(state);
  assert.ok(list.some(a => a.type === 'exp-putin-before-prod'));
  const a = list.find(item => item.type === 'exp-putin-before-prod');
  assert.equal(a.fix, 'experiment-edit');
});

test('LEGACY-02', 'effectivePlanPutin < prodDate 被检测', () => {
  const state = stateWith([3]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-20T10:00'});
  const list = anomalies(state);
  const a = list.find(item => item.type === 'plan-putin-before-prod' && item.day === 3);
  assert.ok(a);
  assert.equal(a.fix, 'plan-reset');
});

test('LEGACY-03', '同一天生产+放入不报错', () => {
  const state = stateWith([1,2]);   /* putinDate=prodDate=09-22，且无任何冲突 */
  const list = anomalies(state);
  assert.ok(!list.some(a => a.type === 'exp-putin-before-prod' || a.type === 'plan-putin-before-prod'));
  assert.equal(list.length, 0);
});

test('LEGACY-04', 'prodDate<=adjustedPlanPutin<originalPlanPutin 不再被当作异常', () => {
  const state = stateWith([3], {prodDate: '2026-09-20'});   /* 生产 09-20，原计划 09-22 */
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-21T10:00'});
  /* 09-21 晚于生产日期，取出 09-24 可操作 → 无异常（任务09.1：提前本身不是错误） */
  assert.equal(anomalies(state).filter(a => a.day === 3).length, 0);
  /* 早于生产日期的调整仍被识别（生产日期是唯一时间边界） */
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-09-19T10:00'});
  assert.ok(anomalies(state).some(a => a.type === 'plan-putin-before-prod' && a.day === 3));
});

test('LEGACY-05', '旧计划 takeout 落 holiday 且节点未执行，被检测', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const a = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  assert.ok(a);
  assert.match(a.currentText, /法定节假日/);
  assert.equal(a.fix, 'replan');
});

test('LEGACY-06', '旧计划 takeout 落 weekend 且节点未执行，被检测', () => {
  const state = stateWith([3]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({adjustedPlanPutin: '2026-10-08T10:00'});
  /* 调整 10-08（≥原计划 09-22）→ 取出 10-11 周日（普通周末，无节假日数据覆盖） */
  const a = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  assert.ok(a);
  assert.match(a.currentText, /周末/);
});

test('LEGACY-07', '正常无冲突旧项目不提示异常', () => {
  const state = stateWith([1,2]);
  assert.deepEqual(Array.from(anomalies(state)), []);
});

test('LEGACY-08', '未执行的节假日异常可以直接使用当前联合建议修正', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const target = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  assert.ok(target);
  const result = app.apply55LegacyRepairFix(state, 'E55', target);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'replan');
  assert.equal(result.applied, 7);
  assert.equal(grouped(state), null);   /* 冲突全部解决 */
});

test('LEGACY-09', '修正后仍满足 takeout = putin + Day×24h', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const target = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  app.apply55LegacyRepairFix(state, 'E55', target);
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowOf(state, day);
    assert.equal(row.effectivePlanTakeout.getTime() - row.effectivePlanPutin.getTime(), day * DAY_MS);
  }
});

test('LEGACY-10', '修正后 putin/takeout 均可操作', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const target = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  app.apply55LegacyRepairFix(state, 'E55', target);
  for (const day of [3,9,10,11,12,13,14]) {
    const row = rowOf(state, day);
    assert.equal(app.operationDateStatus(row.effectivePlanPutin, state).available, true);
    assert.equal(app.operationDateStatus(row.effectivePlanTakeout, state).available, true);
  }
});

test('LEGACY-11', 'putinConfirmed=true 且 putinTime>=prodDate 的正常执行记录不能被自动恢复', () => {
  const state = stateWith([1,3]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-22T10:05'
  });
  assert.equal(anomalies(state).filter(a => a.day === 3).length, 0);
  /* 伪造一个硬错误异常对象也无法写入（重检测找不到） */
  const before = JSON.stringify(state.executions);
  const result = app.apply55LegacyRepairFix(state, 'E55', {type: 'hard-putin-before-prod', day: 3});
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state.executions), before);
  assert.equal(app.exOf(state, 'E55', 3).putinConfirmed, true);
});

test('LEGACY-12', 'putinConfirmed=true 且 putinTime<prodDate 被识别为硬错误', () => {
  const state = stateWith([1,3]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-20T10:00'
  });
  const a = anomalies(state).find(item => item.type === 'hard-putin-before-prod' && item.day === 3);
  assert.ok(a);
  assert.equal(a.fix, 'hard-undo');
});

test('LEGACY-13', '硬错误只有用户明确执行修正后才 undoPutinRecord', () => {
  const state = stateWith([1,3]);
  state.executions[app.exKey('E55', 3)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: false, putinTime: '2026-09-20T10:00',
    adjustedPlanPutin: '', person: '张三', note: '历史测试'
  });
  /* 只检测不修改 */
  const a = anomalies(state).find(item => item.type === 'hard-putin-before-prod' && item.day === 3);
  assert.ok(a);
  assert.equal(app.exOf(state, 'E55', 3).putinConfirmed, true);
  /* 明确执行修正后才解除 */
  const result = app.apply55LegacyRepairFix(state, 'E55', a);
  assert.equal(result.ok, true);
  assert.equal(result.action, 'hard-undo');
  assert.equal(app.exOf(state, 'E55', 3).putinConfirmed, false);
  assert.equal(app.exOf(state, 'E55', 3).putinTime, '');
  assert.equal(app.exOf(state, 'E55', 3).person, '张三');
  assert.equal(app.exOf(state, 'E55', 3).note, '历史测试');
});

test('LEGACY-14', '已完成节点绝不自动修改', () => {
  const state = stateWith([1,4]);
  state.executions[app.exKey('E55', 4)] = app.cleanExecution({
    putinConfirmed: true, completeConfirmed: true,
    putinTime: '2026-09-20T10:00', takeoutTime: '2026-09-24T11:00', qty: '2'
  });
  /* 已完成节点即使实际放入早于生产日期也不进入异常列表 */
  assert.equal(anomalies(state).filter(a => a.day === 4).length, 0);
  const before = JSON.stringify(state.executions);
  const result = app.apply55LegacyRepairFix(state, 'E55', {type: 'hard-putin-before-prod', day: 4});
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(state.executions), before);
});

/* ---- 事件绑定与 UI（真实走 onPlanClick / onModalClick） ---- */
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
function bannerAttrs(state) {
  app.state = state;
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const markup = app.exp55LegacyAnomaliesHTML(item, state);
  const id = markup.match(/data-id="([^"]*)"/)[1];
  const anoms = markup.match(/data-anoms="([^"]*)"/)[1];
  return { markup, id, anoms };
}
function modalHTML() { return el('modalBox').innerHTML; }

test('LEGACY-15', '【检查并修正】在 planBody 点击后弹窗真实打开', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const banner = bannerAttrs(state);
  assert.match(banner.markup, /发现历史计划异常 7 项/);
  assert.match(banner.markup, /检查并修正/);
  const btn = fakeTarget({'data-act': 'legacyRepairOpen', 'data-id': banner.id, 'data-anoms': banner.anoms});
  app.onPlanClick({target: btn, currentTarget: btn});
  assert.match(modalHTML(), /检查并修正历史计划异常/);
  assert.match(modalHTML(), /Day3 当前计划存在不可操作日冲突/);
  assert.match(modalHTML(), /采用当前规则修正/);
  assert.match(modalHTML(), /data-act="legacyRepairPlanFix"/);
});

test('LEGACY-16', '取消弹窗 state 完全不变', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  app.state = state;
  app.currentTab = 'today';
  const before = JSON.stringify(state.executions);
  app.onModalClick({target: fakeTarget({'data-act': 'closeModal'})});
  assert.equal(JSON.stringify(state.executions), before);
});

test('LEGACY-17', '无冲突节点不被修改', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  const target = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  app.apply55LegacyRepairFix(state, 'E55', target);
  for (const day of [1,2,4,5,6,7,8]) {
    assert.equal(app.exOf(state, 'E55', day).adjustedPlanPutin, '');
  }
});

test('LEGACY-18', '36℃完全不变', () => {
  const state = stateWith([1,2,3,4,5,6,7,8,9,10,11,12,13,14]);
  state.experiments.push(exp36());
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  const target = anomalies(state).find(item => item.type === 'legacy-unavailable-plan' && item.day === 3);
  app.apply55LegacyRepairFix(state, 'E55', target);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

console.log(`55C-LEGACY-REPAIR: ${passed} PASS, ${total - passed} FAIL`);
