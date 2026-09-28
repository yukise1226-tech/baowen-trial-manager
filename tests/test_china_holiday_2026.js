// V0.7 2026 中国官方节假日内置数据专项测试；运行时不联网。
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
const calendar = app.loadHolidayCalendar(app.chinaHolidayCalendarProvider, 2026);
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('CN26-01', '2026 provider 元数据正确', () => {
  assert.equal(calendar.year, 2026);
  assert.equal(calendar.source, '国务院办公厅');
  assert.equal(calendar.version, '国办发明电〔2025〕7号');
  assert.equal(calendar.sourceUrl, 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm');
  assert.equal(calendar.available, true);
  assert.equal(calendar.status, 'loaded');
});

test('CN26-02', '官方放假日完整进入 holidayDates', () => {
  assert.deepEqual(Array.from(calendar.holidayDates), [
    '2026-01-01','2026-01-02','2026-01-03',
    '2026-02-15','2026-02-16','2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-21','2026-02-22','2026-02-23',
    '2026-04-04','2026-04-05','2026-04-06',
    '2026-05-01','2026-05-02','2026-05-03','2026-05-04','2026-05-05',
    '2026-06-19','2026-06-20','2026-06-21',
    '2026-09-25','2026-09-26','2026-09-27',
    '2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07'
  ]);
});

test('CN26-03', '官方调休上班日完整进入 workdayOverrides', () => {
  assert.deepEqual(Array.from(calendar.workdayOverrides), [
    '2026-01-04','2026-02-14','2026-02-28','2026-05-09','2026-09-20','2026-10-10'
  ]);
});

test('CN26-04', '调休周末判定为可操作', () => {
  const rules = app.operationDateRulesForState(app.defaultState(), calendar);
  assert.equal(app.isOperationDateAvailable(date('2026-01-04T10:00'), rules), true);
  assert.equal(app.isOperationDateAvailable(date('2026-02-14T10:00'), rules), true);
});

test('CN26-05', 'customSkipDates 覆盖调休上班日', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-01-04');
  const rules = app.operationDateRulesForState(state, calendar);
  assert.equal(app.isOperationDateAvailable(date('2026-01-04T10:00'), rules), false);
});

test('CN26-06', '未收录年份安全降级', () => {
  const missing = app.loadHolidayCalendar(app.chinaHolidayCalendarProvider, 2027);
  assert.equal(missing.year, 2027);
  assert.equal(missing.available, false);
  assert.equal(missing.status, 'unavailable');
  assert.deepEqual(Array.from(missing.holidayDates), []);
  assert.deepEqual(Array.from(missing.workdayOverrides), []);
  assert.equal(missing.sourceUrl, '');
});

test('CN26-07', '日期规则页面显示官方数据已加载状态', () => {
  assert.match(app.dateRulesSettingsHTML(app.defaultState()), /2026 中国法定节假日已加载｜来源：国务院办公厅/);
});

test('CN26-08', '内置节假日数据仍不影响现有 55℃/36℃排程', () => {
  const state = app.defaultState();
  const exp55 = app.cleanExperiment({
    id: 'E55', no: '55-01', project: '55℃样品', batch: 'B1', prodDate: '2026-09-20',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetConfirmed: true, targetDays: [1,3,7,14]
  });
  const exp36 = app.cleanExperiment({
    id: 'E36', no: '36-01', project: '36℃样品', batch: 'B2', prodDate: '2026-10-07',
    putinDate: '2026-10-07', months: 3, condition: '36±1℃', planTime: '10:00',
    protocol36: {modelVersion:2,totalDays:15,microDay:14,targetConfirmed:true,tasks:{}}
  });
  state.experiments = [exp55, exp36];
  const before = app.computeSchedule(state);
  app.loadHolidayCalendar(app.chinaHolidayCalendarProvider, 2026);
  const after = app.computeSchedule(state);
  assert.equal(JSON.stringify(after.rows), JSON.stringify(before.rows));
  assert.equal(JSON.stringify(after.rows36), JSON.stringify(before.rows36));
});

console.log(`CHINA-HOLIDAY-2026: ${passed} PASS, ${8 - passed} FAIL`);
