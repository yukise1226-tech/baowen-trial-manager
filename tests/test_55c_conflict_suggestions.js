// 任务06：55℃不可操作日冲突候选建议层；只读建议，不自动修改排程。
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
function rowAt(putin, day, expId = 'ROW') {
  const originalPutin = date(putin);
  return {
    expId,
    day,
    status: '未放入',
    effectivePlanPutin: originalPutin,
    effectivePlanTakeout: app.addDays(originalPutin, day),
    originalPlanPutin: originalPutin,
    originalPlanTakeout: app.addDays(originalPutin, day)
  };
}
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
function classicDay3(state) {
  state.experiments = [exp55()];
  return app.computeSchedule(state).rows.find(row => row.day === 3);
}

let passed = 0;
function test(id, name, fn) {
  try { fn(); passed++; console.log(`PASS ${id} ${name}`); }
  catch (error) { console.error(`FAIL ${id} ${name}: ${error.message}`); process.exitCode = 1; }
}

test('SUGGEST-01', '普通无冲突节点不生成建议', () => {
  const summary = app.build55ConflictSummary(rowAt('2026-09-22T10:00', 1), app.defaultState());
  assert.equal(summary.conflictReason, 'available');
  assert.deepEqual(Array.from(summary.candidates), []);
});

test('SUGGEST-02', '节假日取出冲突能找到候选', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(classicDay3(state), state);
  assert.equal(summary.conflictReason, 'holiday');
  assert.ok(summary.candidates.length > 0);
});

test('SUGGEST-03', '放入日冲突能找到候选', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(rowAt('2026-09-25T10:00', 3), state);
  assert.equal(summary.putinStatus.reason, 'holiday');
  assert.ok(summary.candidates.length > 0);
});

test('SUGGEST-04', '周末冲突能找到候选', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(rowAt('2026-09-19T10:00', 3), state);
  assert.equal(summary.putinStatus.reason, 'weekend');
  assert.ok(summary.candidates.length > 0);
});

test('SUGGEST-05', 'customSkipDates 冲突能找到候选', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-08-18');
  const summary = app.build55ConflictSummary(rowAt('2026-08-18T10:00', 2), state);
  assert.equal(summary.putinStatus.reason, 'custom-skip');
  assert.ok(summary.candidates.length > 0);
});

test('SUGGEST-06', '调休周末可作为候选放入日', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(rowAt('2026-09-19T10:00', 1), state);
  const shiftedWorkday = summary.candidates.find(candidate => candidate.offsetDays === 1);
  assert.ok(shiftedWorkday);
  assert.equal(app.ymdOf(shiftedWorkday.putin), '2026-09-20');
  assert.equal(shiftedWorkday.putinStatus.available, true);
  assert.equal(shiftedWorkday.putinStatus.reason, 'available');
});

test('SUGGEST-07', '所有候选严格保持 Day×24h', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(classicDay3(state), state);
  assert.ok(summary.candidates.length > 0);
  for (const candidate of summary.candidates) {
    assert.equal(candidate.takeout.getTime() - candidate.putin.getTime(), 3 * 24 * 60 * 60 * 1000);
  }
});

test('SUGGEST-08', '所有候选放入与取出均为可操作日', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(classicDay3(state), state);
  for (const candidate of summary.candidates) {
    assert.equal(candidate.putinStatus.available, true);
    assert.equal(candidate.takeoutStatus.available, true);
  }
});

test('SUGGEST-09', '前后都有候选时按 |offsetDays| 升序', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-08-18');
  const candidates = app.build55ConflictSummary(rowAt('2026-08-18T10:00', 2), state).candidates;
  assert.ok(candidates.some(candidate => candidate.offsetDays < 0));
  assert.ok(candidates.some(candidate => candidate.offsetDays > 0));
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(Math.abs(candidates[i - 1].offsetDays) <= Math.abs(candidates[i].offsetDays));
  }
});

test('SUGGEST-10', '相同绝对偏移时优先较晚日期', () => {
  const state = app.defaultState();
  app.addCustomSkipDate(state, '2026-08-18');
  const candidates = app.build55ConflictSummary(rowAt('2026-08-18T10:00', 2), state).candidates;
  assert.ok(candidates.findIndex(candidate => candidate.offsetDays === 1)
    < candidates.findIndex(candidate => candidate.offsetDays === -1));
});

test('SUGGEST-11', '2026-09-22 经典55℃案例 Day3 给出候选', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(classicDay3(state), state);
  assert.equal(app.fmtDT(summary.originalPutin), '2026-09-22 10:00');
  assert.equal(app.fmtDT(summary.originalTakeout), '2026-09-25 10:00');
  assert.equal(summary.candidates[0].offsetDays, -1);
  assert.equal(app.fmtDT(summary.candidates[0].putin), '2026-09-21 10:00');
  assert.equal(app.fmtDT(summary.candidates[0].takeout), '2026-09-24 10:00');
});

test('SUGGEST-12', '生成建议前后 computeSchedule().rows JSON 完全一致', () => {
  const state = app.defaultState();
  state.experiments = [exp55()];
  const before = JSON.stringify(app.computeSchedule(state).rows);
  const executionsBefore = JSON.stringify(state.executions);
  for (const row of app.computeSchedule(state).rows) app.build55ConflictSummary(row, state);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows), before);
  assert.equal(JSON.stringify(state.executions), executionsBefore);
});

test('SUGGEST-13', '生成建议前后 rows36 JSON 完全一致', () => {
  const state = app.defaultState();
  state.experiments = [exp55(), exp36()];
  const before = JSON.stringify(app.computeSchedule(state).rows36);
  for (const row of app.computeSchedule(state).rows) app.build55ConflictSummary(row, state);
  assert.equal(JSON.stringify(app.computeSchedule(state).rows36), before);
});

test('SUGGEST-14', '操作日程只读展示“查看调整建议”且没有采用控件', () => {
  const state = app.defaultState();
  app.state = state;
  const row = classicDay3(state);
  const markup = app.todayTakeoutRow(row);
  assert.match(markup, /查看调整建议/);
  assert.match(markup, /不会自动修改计划/);
  assert.doesNotMatch(markup, /data-act="[^"]*(apply|adopt|saveSuggestion)/i);
});

test('SUGGEST-15', '未收录年份仍按周末与 customSkipDates 计算且标记覆盖不足', () => {
  const state = app.defaultState();
  const row = rowAt('2027-09-19T10:00', 1);
  const summary = app.build55ConflictSummary(row, state);
  assert.equal(summary.putinStatus.reason, 'weekend');
  assert.ok(summary.candidates.length > 0);
  assert.equal(summary.holidayCoverageStatus, 'insufficient');
  assert.equal(summary.coverageWarning, '官方节假日覆盖不足');
  assert.ok(summary.candidates.every(candidate => candidate.holidayCoverageSufficient === false));
  assert.match(app.operation55SuggestionHTML(row, state, row.effectivePlanPutin), /官方节假日覆盖不足/);
});

test('SUGGEST-16', '候选摘要字段完整', () => {
  const state = app.defaultState();
  const summary = app.build55ConflictSummary(classicDay3(state), state);
  assert.equal(summary.expId, 'E55');
  assert.equal(summary.day, 3);
  assert.ok(summary.originalPutin instanceof Date);
  assert.ok(summary.originalTakeout instanceof Date);
  assert.equal(summary.conflictReason, 'holiday');
  const candidate = summary.candidates[0];
  assert.ok(candidate.putin instanceof Date);
  assert.ok(candidate.takeout instanceof Date);
  assert.equal(typeof candidate.offsetDays, 'number');
  assert.equal(typeof candidate.putinStatus, 'object');
  assert.equal(typeof candidate.takeoutStatus, 'object');
});

console.log(`55C-CONFLICT-SUGGESTIONS: ${passed} PASS, ${16 - passed} FAIL`);
