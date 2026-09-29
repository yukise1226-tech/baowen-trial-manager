// 任务08.2：修复 groupedApplyOpen 事件绑定——排程页/操作日程的按钮点击必须能打开确认弹窗；
// 采用仍走任务08 groupedApplyYes。用最小 DOM stub 真实走 onPlanClick/onTodayClick/onModalClick。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');

/* 最小 DOM stub：只覆盖本任务流程用到的元素（modalBox/modalMask/toast/todayBody/todayDate 等） */
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
  store: {},
  getItem(key) { return key in this.store ? this.store[key] : null; },
  setItem(key, value) { this.store[key] = String(value); },
  removeItem(key) { delete this.store[key]; }
};
const document = { getElementById: el, querySelector() { return null; }, createElement() { return el('dummy'); } };

/* 脚本末尾的 boot 在 document 未定义时跳过 init（与现有测试一致）；
 * 加载后再注入 document stub，供 openModal/showToast 等调用时使用。 */
/* 固定“当前时间”（早于所有测试夹具日期），使建议不因真实日期变化而排除过去候选 */
const FIXED_TEST_NOW = Date.parse('2026-09-01T00:00:00+08:00');
class FixedDate extends Date {
  constructor(...args){ if(args.length===0) super(FIXED_TEST_NOW); else super(...args); }
  static now(){ return FIXED_TEST_NOW; }
  static parse(value){ return Date.parse(value); }
  static UTC(...args){ return Date.UTC(...args); }
}
const app = vm.createContext({console, Date: FixedDate, performance, localStorage, setTimeout, clearTimeout});
vm.runInContext(match[1], app, {filename: htmlPath});
app.document = document;

function exp55(days = [1,2,3,4,5,6,7,8,9,10,11,12,13,14]) {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate: '2026-09-22',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetMode: 'custom', targetConfirmed: true, targetDays: days
  });
}
function classicState() {
  const state = app.defaultState();
  state.experiments = [exp55()];
  return state;
}
function fakeTarget(attrs) {
  return { getAttribute(name) { return attrs[name] || null; }, parentElement: null };
}
function attrsFrom(markup) {
  const pick = (name) => {
    const m = markup.match(new RegExp(name + '="([^"]*)"'));
    return m ? m[1] : null;
  };
  return { id: pick('data-id'), sig: pick('data-sig') };
}
function modalHTML() { return el('modalBox').innerHTML; }
function toastText() { return el('toast').textContent; }
/* 从 todayBody 渲染的待放入行里取出【采用推荐方案】按钮属性 */
function todayApplyAttrs(state, day) {
  app.state = state;
  const row = app.computeSchedule(state).rows.find(r => r.expId === 'E55' && r.day === day);
  const markup = app.todayPutinRow(row);
  const m = markup.match(/data-act="groupedApplyOpen" data-id="([^"]*)" data-sig="([^"]*)"/);
  assert.ok(m, '待放入行应包含采用推荐方案按钮');
  return { id: m[1], sig: m[2] };
}

let passed = 0;
let total = 0;
function test(id, name, fn) {
  total++;
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('CLICK-01', 'planBody 试验级【查看联合调整建议】点击后打开确认弹窗', () => {
  const state = classicState();
  app.state = state;
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const banner = app.exp55ConflictSummaryHTML(item, state);
  const a = attrsFrom(banner);
  assert.equal(a.id, 'E55');
  const btn = fakeTarget({'data-act': 'groupedApplyOpen', 'data-id': a.id, 'data-sig': a.sig});
  app.onPlanClick({target: btn, currentTarget: btn});
  assert.match(modalHTML(), /将调整以下55℃节点：/);
  assert.match(modalHTML(), /data-act="groupedApplyYes"/);
  assert.equal(el('modalBox').hidden, false);
});

test('CLICK-02', '确认弹窗展示经典09/22的3个推荐放入批次', () => {
  const state = classicState();
  app.state = state;
  const item = app.computeSchedule(state).items.find(it => it.kind === 'ok' && it.exp.id === 'E55');
  const a = attrsFrom(app.exp55ConflictSummaryHTML(item, state));
  const btn = fakeTarget({'data-act': 'groupedApplyOpen', 'data-id': a.id, 'data-sig': a.sig});
  app.onPlanClick({target: btn, currentTarget: btn});
  assert.match(modalHTML(), /09-28 10:00 放入：/);
  assert.match(modalHTML(), /09-29 10:00 放入：/);
  assert.match(modalHTML(), /10-09 10:00 放入：/);
  assert.match(modalHTML(), /Day9 → 10-08 10:00/);
  assert.match(modalHTML(), /Day12 → 10-10 10:00/);
  assert.match(modalHTML(), /Day3 → 10-12 10:00/);
});

test('CLICK-03', '点击取消不修改 state', () => {
  const state = classicState();
  app.state = state;
  app.currentTab = 'today';   /* 取消后 renderCurrent 走操作日程（纯字符串渲染，stub 可覆盖） */
  const before = JSON.stringify(state.executions);
  app.onModalClick({target: fakeTarget({'data-act': 'closeModal'})});
  assert.equal(JSON.stringify(state.executions), before);
  assert.equal(app.exOf(state, 'E55', 3).adjustedPlanPutin, '');
});

test('CLICK-04', 'todayBody 中【采用推荐方案】点击后同样打开确认弹窗', () => {
  const state = classicState();
  const a = todayApplyAttrs(state, 3);
  app.onTodayClick({target: fakeTarget({'data-act': 'groupedApplyOpen', 'data-id': a.id, 'data-sig': a.sig})});
  assert.match(modalHTML(), /将调整以下55℃节点：/);
  assert.match(modalHTML(), /仅调整上述冲突节点，无冲突节点保持原计划。/);
});

test('CLICK-05', '确认采用仍走任务08 groupedApplyYes，成功写 adjustedPlanPutin', () => {
  const state = classicState();
  app.currentTab = 'today';
  const a = todayApplyAttrs(state, 3);
  app.onTodayClick({target: fakeTarget({'data-act': 'groupedApplyOpen', 'data-id': a.id, 'data-sig': a.sig})});
  const yesSig = modalHTML().match(/data-act="groupedApplyYes"[^>]*data-sig="([^"]*)"/)[1];
  app.onModalClick({target: fakeTarget({'data-act': 'groupedApplyYes', 'data-id': 'E55', 'data-sig': yesSig})});
  const adjusted = Object.keys(state.executions).filter(key => key.startsWith('E55|') && state.executions[key].adjustedPlanPutin).length;
  assert.equal(adjusted, 7);
  assert.match(toastText(), /已采用推荐方案：调整 7 个节点/);
});

test('CLICK-06', '无冲突节点不移动', () => {
  const state = classicState();
  app.currentTab = 'today';
  const before = JSON.stringify(
    app.computeSchedule(state).rows.filter(row => [1,2,4,5,6,7,8].includes(row.day))
      .map(row => ({day: row.day, putin: row.effectivePlanPutin.getTime(), takeout: row.effectivePlanTakeout.getTime()}))
  );
  const a = todayApplyAttrs(state, 3);
  app.onTodayClick({target: fakeTarget({'data-act': 'groupedApplyOpen', 'data-id': a.id, 'data-sig': a.sig})});
  const yesSig = modalHTML().match(/data-act="groupedApplyYes"[^>]*data-sig="([^"]*)"/)[1];
  app.onModalClick({target: fakeTarget({'data-act': 'groupedApplyYes', 'data-id': 'E55', 'data-sig': yesSig})});
  const after = JSON.stringify(
    app.computeSchedule(state).rows.filter(row => [1,2,4,5,6,7,8].includes(row.day))
      .map(row => ({day: row.day, putin: row.effectivePlanPutin.getTime(), takeout: row.effectivePlanTakeout.getTime()}))
  );
  assert.equal(after, before);
});

test('CLICK-07', '过期 signature 仍拒绝采用', () => {
  const state = classicState();
  app.state = state;
  const before = JSON.stringify(state.executions);
  app.onModalClick({target: fakeTarget({'data-act': 'groupedApplyYes', 'data-id': 'E55', 'data-sig': 'stale-signature'})});
  assert.match(toastText(), /已变化/);
  assert.equal(JSON.stringify(state.executions), before);
});

console.log(`55C-GROUPED-APPLY-CLICKS: ${passed} PASS, ${total - passed} FAIL`);
