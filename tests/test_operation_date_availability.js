// V0.7 日期可操作性纯规则层专项测试；不接入现有 55℃/36℃排程。
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
function ymd(value) { return app.ymdOf(value); }
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('CAL-01', '普通工作日不调整', () => {
  const input = date('2026-09-29T10:13');
  const result = app.nextOperationDateAtOrAfter(input);
  assert.equal(app.fmtDT(result), '2026-09-29 10:13');
  assert.notEqual(result, input);
});

test('CAL-02', '周六顺延到下一个可操作日', () => {
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-03T10:00'))), '2026-10-05');
});

test('CAL-03', '周日顺延到下一个可操作日', () => {
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-04T10:00'))), '2026-10-05');
});

test('CAL-04', '自定义跳过某个工作日', () => {
  const rules = {customSkipDates: new Set(['2026-10-06'])};
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-06T10:00'), rules)), '2026-10-07');
});

test('CAL-05', '连续多个不可操作日', () => {
  const rules = {customSkipDates: ['2026-10-05', '2026-10-06']};
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-05T10:00'), rules)), '2026-10-07');
});

test('CAL-06', '周末与自定义跳过日期连续组合', () => {
  const rules = {customSkipDates: new Set(['2026-10-05'])};
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-03T10:00'), rules)), '2026-10-06');
});

test('CAL-07', '空规则行为稳定', () => {
  const input = date('2026-09-29T08:45');
  assert.equal(app.isOperationDateAvailable(input), true);
  assert.equal(app.isOperationDateAvailable(input, {}), true);
  assert.equal(app.fmtDT(app.nextOperationDateAtOrAfter(input, {})), '2026-09-29 08:45');
  assert.equal(app.fmtDT(input), '2026-09-29 08:45');
});

test('CAL-08', '预留节假日日期集合注入口', () => {
  const rules = {holidayDates: new Set(['2026-10-07'])};
  assert.equal(app.isOperationDateAvailable(date('2026-10-07T10:00'), rules), false);
  assert.equal(ymd(app.nextOperationDateAtOrAfter(date('2026-10-07T10:00'), rules)), '2026-10-08');
});

console.log(`CALENDAR: ${passed} PASS, ${8 - passed} FAIL`);
