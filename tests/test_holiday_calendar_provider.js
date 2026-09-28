// V0.7 法定节假日 provider / 调休工作日专项测试；使用纯合成 fixture，不代表真实节假日。
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

function date(value) { return app.parseDateTime(value); }
function ymd(value) { return app.ymdOf(value); }
function stateWithSkip(value) {
  const state = app.defaultState();
  if (value) app.addCustomSkipDate(state, value);
  return state;
}
const provider = app.createHolidayCalendarProvider({
  source: 'fixture.synthetic',
  version: 'test-v1',
  loadYear(year) {
    return {
      year,
      holidayDates: ['2099-06-08', '2099-06-09', '2099-06-12'],
      workdayOverrides: ['2099-06-06', '2099-06-07', '2099-06-13']
    };
  }
});
const calendar = app.loadHolidayCalendar(provider, 2099);
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('HOL-01', 'provider 输出标准字段并保留来源信息', () => {
  assert.equal(calendar.year, 2099);
  assert.equal(calendar.source, 'fixture.synthetic');
  assert.equal(calendar.version, 'test-v1');
  assert.deepEqual(Array.from(calendar.holidayDates), ['2099-06-08', '2099-06-09', '2099-06-12']);
  assert.deepEqual(Array.from(calendar.workdayOverrides), ['2099-06-06', '2099-06-07', '2099-06-13']);
});

test('HOL-02', '普通工作日可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(app.isOperationDateAvailable(date('2099-06-10T10:00'), rules), true);
});

test('HOL-03', '普通周末不可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), app.loadHolidayCalendar(null, 2099));
  assert.equal(app.isOperationDateAvailable(date('2099-06-13T10:00'), rules), false);
  assert.equal(app.isOperationDateAvailable(date('2099-06-14T10:00'), rules), false);
});

test('HOL-04', 'holidayDates 中的工作日不可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(app.isOperationDateAvailable(date('2099-06-08T10:00'), rules), false);
});

test('HOL-05', 'workdayOverrides 中的周六可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(app.isOperationDateAvailable(date('2099-06-06T10:00'), rules), true);
});

test('HOL-06', 'workdayOverrides 中的周日可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(app.isOperationDateAvailable(date('2099-06-07T10:00'), rules), true);
});

test('HOL-07', 'customSkipDates 覆盖 workdayOverrides', () => {
  const rules = app.operationDateRulesForState(stateWithSkip('2099-06-06'), calendar);
  assert.equal(app.isOperationDateAvailable(date('2099-06-06T10:00'), rules), false);
});

test('HOL-08', '连续节假日后找到下一个可操作日', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2099-06-08T10:00'), rules)), '2099-06-10');
});

test('HOL-09', '节假日 + 调休 + 自定义跳过组合', () => {
  const rules = app.operationDateRulesForState(stateWithSkip('2099-06-13'), calendar);
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2099-06-12T10:00'), rules)), '2099-06-15');
});

test('HOL-10', 'provider 缺失时兼容现有规则', () => {
  const empty = app.loadHolidayCalendar(null, 2099);
  const rules = app.operationDateRulesForState(stateWithSkip('2099-06-10'), empty);
  assert.deepEqual(Array.from(empty.holidayDates), []);
  assert.deepEqual(Array.from(empty.workdayOverrides), []);
  assert.equal(app.isOperationDateAvailable(date('2099-06-10T10:00'), rules), false);
  assert.equal(app.isOperationDateAvailable(date('2099-06-11T10:00'), rules), true);
});

test('HOL-11', '日期规则设置仍不影响现有 55℃/36℃排程', () => {
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
  app.addCustomSkipDate(state, '2099-06-13');
  app.operationDateRulesForState(state, calendar);
  const after = app.computeSchedule(state);
  assert.equal(JSON.stringify(after.rows), JSON.stringify(before.rows));
  assert.equal(JSON.stringify(after.rows36), JSON.stringify(before.rows36));
});

console.log(`HOLIDAY-CALENDAR: ${passed} PASS, ${11 - passed} FAIL`);
