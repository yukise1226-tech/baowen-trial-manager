// 任务05：操作日程冲突检测层专项测试；只读计划结果，不自动重排。
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

function date(value) { return app.parseDateTime(value); }
function status(value, state = app.defaultState()) { return app.operationDateStatus(date(value), state); }
function exp55() {
  return app.cleanExperiment({
    id: 'E55', no: '55-CLASSIC', project: '经典55℃案例', batch: 'B1', prodDate: '2026-09-20',
    putinDate: '2026-09-22', months: 12, condition: '55±1℃', planTime: '10:00',
    targetConfirmed: true, targetDays: [1,2,3,4,5,6,7,8,9,10,11,12,13,14]
  });
}
function exp36() {
  return app.cleanExperiment({
    id: 'E36', no: '36-01', project: '36℃样品', batch: 'B2', prodDate: '2026-09-22',
    putinDate: '2026-09-22', months: 3, condition: '36±1℃', planTime: '10:00',
    protocol36: {modelVersion:2,totalDays:15,microDay:14,targetConfirmed:true,tasks:{}}
  });
}
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('CONFLICT-01', '普通工作日 available 且返回完整日历覆盖状态', () => {
  const result = status('2026-09-22T10:00');
  assert.equal(result.available, true);
  assert.equal(result.reason, 'available');
  assert.equal(result.date, '2026-09-22');
  assert.equal(result.holidayCalendar.year, 2026);
  assert.equal(result.holidayCalendar.available, true);
  assert.equal(result.holidayCalendar.status, 'loaded');
});

test('CONFLICT-02', '普通周末 weekend', () => {
  const result = status('2026-09-19T10:00');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'weekend');
});

test('CONFLICT-03', '2026 官方节假日 holiday', () => {
  const result = status('2026-09-25T10:00');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'holiday');
});

test('CONFLICT-04', '调休周末由 workdayOverrides 覆盖为 available', () => {
  const result = status('2026-09-20T10:00');
  assert.equal(result.available, true);
  assert.equal(result.reason, 'available');
});

test('CONFLICT-05', 'customSkipDates 返回 custom-skip', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-09-22');
  const result = status('2026-09-22T10:00', state);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'custom-skip');
});

test('CONFLICT-06', 'customSkipDates 优先覆盖调休工作日', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-09-20');
  const result = status('2026-09-20T10:00', state);
  assert.equal(result.available, false);
  assert.equal(result.reason, 'custom-skip');
});

test('CONFLICT-07', '未收录年份安全降级：工作日可用，周末与自定义仍判断', () => {
  const weekday = status('2027-09-22T10:00');
  assert.equal(weekday.available, true);
  assert.equal(weekday.reason, 'calendar-unavailable');
  assert.equal(weekday.holidayCalendar.available, false);
  assert.equal(weekday.holidayCalendar.status, 'unavailable');
  assert.equal(status('2027-09-19T10:00').reason, 'weekend');
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2027-09-22');
  assert.equal(status('2027-09-22T10:00', state).reason, 'custom-skip');
});

test('CONFLICT-08', '2026-09-22 经典55℃案例识别 Day3 节假日冲突', () => {
  const state = app.defaultState();
  state.experiments = [exp55()];
  const rows = app.computeSchedule(state).rows;
  const day3 = rows.find(row => row.day === 3);
  assert.equal(app.fmtDT(day3.effectivePlanPutin), '2026-09-22 10:00');
  assert.equal(app.fmtDT(day3.effectivePlanTakeout), '2026-09-25 10:00');
  assert.equal(app.operationDateStatus(day3.effectivePlanTakeout, state).reason, 'holiday');
});

test('CONFLICT-09', '冲突检测前后55℃排程 JSON 完全一致', () => {
  const state = app.defaultState();
  state.experiments = [exp55()];
  const before = JSON.stringify(app.computeSchedule(state).rows);
  const rows = app.computeSchedule(state).rows;
  for (const row of rows) {
    app.operationDateStatus(row.effectivePlanPutin, state);
    app.operationDateStatus(row.effectivePlanTakeout, state);
  }
  assert.equal(JSON.stringify(app.computeSchedule(state).rows), before);
});

test('CONFLICT-10', '冲突检测前后36℃排程 JSON 完全一致', () => {
  const state = app.defaultState();
  state.experiments = [exp36()];
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  const rows = app.computeSchedule(state).rows36;
  for (const row of rows) app.operationDateStatus(row.currentPlanTime, state);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

test('CONFLICT-11', '操作日程显示可区分的冲突提示', () => {
  const state = app.defaultState();
  app.state = state;
  state.experiments = [exp55()];
  const day3 = app.computeSchedule(state).rows.find(row => row.day === 3);
  assert.match(app.todayTakeoutRow(day3), /法定节假日｜原计划不变/);
  app.addCustomSkipDate(state, '2026-09-22');
  const day1 = app.computeSchedule(state).rows.find(row => row.day === 1);
  assert.match(app.todayPutinRow(day1), /自定义跳过｜原计划不变/);
  assert.match(app.operationDateStatusHTML(date('2026-09-19T10:00'), state), /周末｜原计划不变/);
  state.calendarRules.customSkipDates = [];
  state.experiments = [exp36()];
  const day14 = app.computeSchedule(state).rows36.find(row => row.day === 14);
  assert.match(app.today36Row(day14), /法定节假日｜原计划不变/);
});

test('CONFLICT-12', '未收录年份在日程显示官方节假日数据不可用', () => {
  const markup = app.operationDateStatusHTML(date('2027-09-22T10:00'), app.defaultState());
  assert.match(markup, /该年份官方节假日数据未加载\/不可用/);
});

console.log(`OPERATION-DATE-CONFLICTS: ${passed} PASS, ${12 - passed} FAIL`);
