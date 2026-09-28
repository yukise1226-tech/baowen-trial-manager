// V0.7 自定义跳过日期设置、持久化与规则层传递专项测试。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

const localStorage = memoryStorage();
const sessionStorage = memoryStorage();
const app = vm.createContext({console, Date, performance, localStorage, sessionStorage});
vm.runInContext(match[1], app, {filename: htmlPath});

function dates(state) { return Array.from(state.calendarRules.customSkipDates); }
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('CAL-SET-01', '新增一个日期并统一为 YYYY-MM-DD', () => {
  const state = app.defaultState();
  assert.equal(app.addCustomSkipDate(state, '2026/10/6'), '2026-10-06');
  assert.deepEqual(dates(state), ['2026-10-06']);
});

test('CAL-SET-02', '重复日期自动去重', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-10-06');
  app.addCustomSkipDate(state, '20261006');
  assert.deepEqual(dates(state), ['2026-10-06']);
});

test('CAL-SET-03', '删除日期', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-10-06');
  assert.equal(app.removeCustomSkipDate(state, '2026-10-06'), true);
  assert.deepEqual(dates(state), []);
});

test('CAL-SET-04', '日期自动排序', () => {
  const state = app.defaultState();
  for (const value of ['2026-12-01', '2026-10-06', '2026-11-15']) app.addCustomSkipDate(state, value);
  assert.deepEqual(dates(state), ['2026-10-06', '2026-11-15', '2026-12-01']);
});

test('CAL-SET-05', '保存后重新加载仍存在', () => {
  localStorage.clear();
  app.state = app.defaultState();
  app.addCustomSkipDate(app.state, '2026-10-06');
  assert.equal(app.saveState(), true);
  app.state = null;
  const reloaded = app.loadState();
  assert.deepEqual(dates(reloaded), ['2026-10-06']);
});

test('CAL-SET-06', '旧数据无字段时自动得到空集合且 schemaVersion 不变', () => {
  localStorage.clear();
  localStorage.setItem(app.LS_KEY, JSON.stringify({
    version: 4, schemaVersion: 6, uiVersion: 'V0.6-dev',
    opTime: '10:00', experiments: [], executions: {}
  }));
  const reloaded = app.loadState();
  assert.deepEqual(dates(reloaded), []);
  assert.equal(reloaded.schemaVersion, 6);
});

test('CAL-SET-07', 'customSkipDates 正确传入任务 01 规则层', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-10-06');
  const rules = app.operationDateRulesForState(state);
  assert.equal(app.isOperationDateAvailable(app.parseDateTime('2026-10-06T10:00'), rules), false);
  assert.deepEqual(Array.from(rules.holidayDates), []);
});

test('CAL-SET-08', '设置变化不影响现有 55℃/36℃排程', () => {
  const state = app.defaultState();
  const exp55 = app.cleanExperiment({
    id: 'E55', no: '55-01', project: '55℃样品', batch: 'B1', prodDate: '2026-09-20',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetConfirmed: true, targetDays: [1, 3, 7, 14]
  });
  const exp36 = app.cleanExperiment({
    id: 'E36', no: '36-01', project: '36℃样品', batch: 'B2', prodDate: '2026-10-07',
    putinDate: '2026-10-07', months: 3, condition: '36±1℃', planTime: '10:00',
    protocol36: {modelVersion: 2, totalDays: 15, microDay: 14, targetConfirmed: true, tasks: {}}
  });
  state.experiments = [exp55, exp36];
  const before = app.computeSchedule(state);
  app.addCustomSkipDate(state, '2026-10-08');
  const after = app.computeSchedule(state);
  assert.equal(JSON.stringify(after.rows), JSON.stringify(before.rows));
  assert.equal(JSON.stringify(after.rows36), JSON.stringify(before.rows36));
});

test('CAL-SET-09', '导出、导入及同步快照携带设置', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-10-06');
  const imported = app.importJSONString(app.exportJSONString(state));
  const snapshot = app.stateSnapshotForSync(state);
  assert.equal(imported.ok, true);
  assert.deepEqual(dates(imported.state), ['2026-10-06']);
  assert.deepEqual(dates(snapshot), ['2026-10-06']);
  assert.equal(snapshot.schemaVersion, 6);
});

test('CAL-SET-10', '页面提供日期规则设置入口', () => {
  assert.match(html, /id="btnDateRules"[^>]*>日期规则<\/button>/);
  assert.match(html, /id="customSkipDateInput" type="date"/);
});

console.log(`CALENDAR-SETTINGS: ${passed} PASS, ${10 - passed} FAIL`);
