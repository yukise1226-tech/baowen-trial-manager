// V0.6-dev 36℃单次放入模型的九个针对性回归；直接调用现有页面脚本，不复制业务实现。
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

function experiment(months = 12, microDay = 14) {
  return {
    id: 'T36', no: 'T36', project: '回归样品', batch: 'B1',
    prodDate: '2026-10-07', putinDate: '2026-10-07', planTime: '10:00',
    months, condition: '36±1℃', archived: false,
    protocol36: {modelVersion: 2, totalDays: app.totalDays36For(months),
      microDay, targetConfirmed: true, tasks: {}}
  };
}
function schedule(exp = experiment(), executions = {}) {
  const state = {opTime: '10:00', experiments: [exp], executions};
  return {state, result: app.computeSchedule(state)};
}
function row(rows, day) { return rows.find(r => r.day === day); }
function time(dt) { return app.fmtDT(dt); }
let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('T36-01', '12个月只有 Day0 一次放入', () => {
  const rows = schedule().result.rows36;
  assert.equal(rows.filter(r => r.action === '放入').length, 1);
  assert.equal(row(rows, 0).action, '放入');
  assert.equal(row(rows, 0).detection, '—');
  assert.equal(time(row(rows, 0).currentPlanTime), '2026-10-07 10:00');
});

test('T36-02', 'Day7/14/21 等后续节点均为取样而非重新放入', () => {
  const rows = schedule().result.rows36;
  for (let day = 7; day <= 56; day += 7) assert.equal(row(rows, day).action, '取样');
  assert.equal(rows.filter(r => r.day > 0 && r.action === '放入').length, 0);
});

test('T36-03', 'Day60 为最终取出', () => {
  const exp = experiment();
  const final = row(schedule(exp).result.rows36, 60);
  assert.equal(final.action, '取出');
  assert.equal(final.detection, '最终感官/理化');
  assert.equal(time(final.originalPlanTime), '2026-12-06 10:00');
  const markup = app.task36RowHTML(final, exp);
  assert.match(markup, /标准节点：12-06 10:00/);
  assert.match(markup, /12-07 10:00/);
  assert.match(markup, /周末顺延/);
});

test('T36-04', '实际 Day0 10:13 成为后续标准节点的唯一基准', () => {
  const executions = {'T36|36|start': {completeConfirmed: true, actualTime: '2026-10-07T10:13'}};
  const rows = schedule(experiment(), executions).result.rows36;
  for (const day of [7, 14, 21, 60]) {
    const expected = app.addDays(app.parseDateTime('2026-10-07T10:13'), day);
    assert.equal(time(row(rows, day).originalPlanTime), time(expected));
  }
});

test('T36-05', '修改未执行 Day0 计划联动未单独调整的节点', () => {
  const executions = {'T36|36|start': {adjustedPlanTime: '2026-10-08T11:00'}};
  const rows = schedule(experiment(), executions).result.rows36;
  assert.equal(time(row(rows, 0).currentPlanTime), '2026-10-08 11:00');
  assert.equal(time(row(rows, 7).originalPlanTime), '2026-10-15 11:00');
  assert.equal(time(row(rows, 14).currentPlanTime), '2026-10-22 11:00');
});

test('T36-06', '单独调整 Day14 不改变 Day0、Day7、Day21', () => {
  const executions = {
    'T36|36|start': {completeConfirmed: true, actualTime: '2026-10-07T10:13'},
    'T36|36|sensory-14': {adjustedPlanTime: '2026-10-21T14:00'}
  };
  const rows = schedule(experiment(), executions).result.rows36;
  assert.equal(time(row(rows, 0).actualTime), '2026-10-07 10:13');
  assert.equal(time(row(rows, 7).currentPlanTime), '2026-10-14 10:13');
  assert.equal(time(row(rows, 14).originalPlanTime), '2026-10-21 10:13');
  assert.equal(time(row(rows, 14).currentPlanTime), '2026-10-21 14:00');
  assert.equal(time(row(rows, 21).currentPlanTime), '2026-10-28 10:13');
});

test('T36-07', 'microDay=14 时操作日程仅一次物理取样', () => {
  const rows = schedule().result.rows36;
  const day14 = rows.filter(r => r.day === 14);
  const events = app.events36ForDate(rows, '2026-10-21').filter(r => r.day === 14);
  assert.equal(day14.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].action, '取样');
  assert.equal(events[0].detection, '感官/理化/微生物');
  assert.match(app.today36Row(events[0]), /36℃｜取样/);
  assert.match(app.today36Row(events[0]), /标准节点：/);
});

test('T36-08', '调整计划日期后操作日程自动迁移', () => {
  const executions = {'T36|36|sensory-14': {adjustedPlanTime: '2026-10-22T09:00'}};
  const rows = schedule(experiment(), executions).result.rows36;
  assert.equal(app.events36ForDate(rows, '2026-10-21').filter(r => r.day === 14).length, 0);
  assert.equal(app.events36ForDate(rows, '2026-10-22').filter(r => r.day === 14).length, 1);
});

test('T36-09', '3/6/9/12 个月仍映射 15/30/45/60 天', () => {
  for (const [months, days] of [[3, 15], [6, 30], [9, 45], [12, 60]]) {
    const rows = schedule(experiment(months, 14)).result.rows36;
    assert.equal(row(rows, days).action, '取出');
    assert.equal(rows.filter(r => r.action === '取出').length, 1);
  }
});

console.log(`T36: ${passed} PASS, ${9 - passed} FAIL`);
