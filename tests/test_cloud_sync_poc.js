const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {createMockSyncServer} = require('./mock_sync_server');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, '页面脚本应存在');

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

const localStorage = memoryStorage();
const sessionStorage = memoryStorage();
const app = vm.createContext({
  console, Date, performance, crypto: webcrypto, URL,
  Promise, setTimeout, clearTimeout, localStorage, sessionStorage
});
vm.runInContext(match[1], app, {filename: htmlPath});

function fixtureState() {
  return {
    version: 4,
    schemaVersion: 6,
    uiVersion: 'V0.6-dev',
    opTime: '10:00',
    experiments: [
      {
        id: 'E55', no: '55-001', project: '55℃稳定样品', batch: 'B55',
        prodDate: '2026-09-20', putinDate: '2026-09-22', actualStartTime: '',
        months: 12, condition: '55±1℃', owner: 'A', note: '', planTime: '10:00',
        targetMode: 'standard', targetDays: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
        targetQty: {}, targetConfirmed: true, enabled: {}, protocol36: null, archived: false, archivedAt: ''
      },
      {
        id: 'E36', no: '36-001', project: '36℃验证样品', batch: 'B36',
        prodDate: '2026-10-07', putinDate: '2026-10-07', actualStartTime: '',
        months: 12, condition: '36±1℃', owner: 'B', note: '', planTime: '10:00',
        targetMode: 'standard', targetDays: [], targetQty: {}, targetConfirmed: true, enabled: {},
        protocol36: {modelVersion: 2, totalDays: 60, microDay: 14, targetConfirmed: true, tasks: {}},
        archived: false, archivedAt: ''
      }
    ],
    executions: {
      'E55|1': {putinConfirmed: false, completeConfirmed: false, putinTime: '', takeoutTime: '', adjustedPlanPutin: '', adjustedExpectedTakeout: '', qty: '', person: '', note: ''},
      'E36|36|sensory-14': {completeConfirmed: false, actualTime: '', adjustedPlanTime: '', qty: '', person: '', note: ''}
    }
  };
}

function syncedMeta(state, revision, deviceId, remoteDeviceId = deviceId) {
  return {
    metadataVersion: 2,
    cloudRevision: revision,
    cloudUpdatedAt: `2026-09-27T00:0${Math.min(revision, 9)}:00.000Z`,
    deviceId,
    lastSyncedFingerprint: app.fingerprintSyncState(state),
    lastSyncedAt: '2026-09-27T00:10:00.000Z',
    lastAction: 'download',
    lastRemoteDeviceId: remoteDeviceId,
    localMutationSeq: 0
  };
}

let passed = 0;
async function test(id, name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${id} ${name}`);
  } catch (error) {
    console.error(`FAIL ${id} ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

(async () => {
  const TOKEN = 'session-only-test-token';
  const mock = createMockSyncServer({token: TOKEN});
  const address = await mock.listen();
  const endpoint = `http://${address.address}:${address.port}/sync`;
  const adapter = app.createRemoteSyncAdapter({endpoint}, fetch, TOKEN);

  let stateA = fixtureState();
  let metaA = {cloudRevision: 0, lastSyncedFingerprint: '', deviceId: 'device-A'};
  let stateB = fixtureState();
  stateB.experiments = [];
  stateB.executions = {};
  let metaB = {cloudRevision: 0, lastSyncedFingerprint: '', deviceId: 'device-B'};

  await test('SYNC-01', 'A 首次上传（baseRevision=0）→ 服务端 revision 1 + 完整 metadata，云端保存整份 state', async () => {
    const result = await app.uploadStateWithAdapter(adapter, stateA, metaA, () => true);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.metadata.schemaVersion, 6);
    assert.equal(result.envelope.metadata.revision, 1);
    assert.equal(result.envelope.metadata.deviceId, 'device-A');
    assert.ok(result.envelope.metadata.updatedAt);
    metaA = app.syncMetaAfterSuccess(metaA, result.envelope.metadata, result.currentFingerprint, 'upload');
    const cloud = mock.getEnvelope();
    assert.equal(cloud.metadata.revision, 1);
    assert.equal(cloud.state.schemaVersion, 6);
    assert.equal(cloud.state.experiments.length, 2);
  });

  await test('SYNC-02', 'B 拉取 A 数据，远端较新时先确认并完整保留 55℃/36℃', async () => {
    let prompt = '';
    const result = await app.downloadStateWithAdapter(adapter, stateB, metaB, message => { prompt = message; return true; });
    assert.match(prompt, /云端 revision 1 高于本地已知版本 0/);
    stateB = result.envelope.state;
    metaB = syncedMeta(stateB, result.envelope.metadata.revision, 'device-B', result.envelope.metadata.deviceId);
    assert.equal(stateB.schemaVersion, 6);
    assert.equal(stateB.experiments.find(item => item.id === 'E55').condition, '55±1℃');
    assert.equal(stateB.experiments.find(item => item.id === 'E36').protocol36.totalDays, 60);
  });

  await test('SYNC-03', 'B 修改 Day14 后上传（baseRevision=1）→ 服务端 revision 2（CAS 模式无覆盖确认弹窗）', async () => {
    stateB.executions['E36|36|sensory-14'].adjustedPlanTime = '2026-10-22T09:00';
    let prompt = '';
    const result = await app.uploadStateWithAdapter(adapter, stateB, metaB, message => { prompt = message; return true; });
    assert.equal(prompt, '');
    assert.equal(result.envelope.metadata.revision, 2);
    assert.equal(result.envelope.metadata.deviceId, 'device-B');
    assert.equal(mock.getEnvelope().state.executions['E36|36|sensory-14'].adjustedPlanTime, '2026-10-22T09:00');
    metaB = app.syncMetaAfterSuccess(metaB, result.envelope.metadata, result.currentFingerprint, 'upload');
  });

  await test('SYNC-04', 'A 拉回 B 的 Day14 修改', async () => {
    let prompt = '';
    const result = await app.downloadStateWithAdapter(adapter, stateA, metaA, message => { prompt = message; return true; });
    assert.match(prompt, /云端 revision 2 高于本地已知版本 1/);
    stateA = result.envelope.state;
    metaA = syncedMeta(stateA, result.envelope.metadata.revision, 'device-A', result.envelope.metadata.deviceId);
    assert.equal(stateA.executions['E36|36|sensory-14'].adjustedPlanTime, '2026-10-22T09:00');
    assert.equal(stateA.schemaVersion, 6);
  });

  await test('SYNC-05', '刷新等价的 localStorage 往返保留业务 state 与 revision', async () => {
    app.state = stateA;
    app.writeSyncMeta(metaA);
    assert.equal(app.saveState({syncedMetadata: {revision: 2, updatedAt: '2026-09-27T00:02:00.000Z', deviceId: 'device-B'},
      syncedFingerprint: app.fingerprintSyncState(stateA)}), true);
    const reloaded = app.loadState();
    assert.equal(reloaded.schemaVersion, 6);
    assert.equal(reloaded.executions['E36|36|sensory-14'].adjustedPlanTime, '2026-10-22T09:00');
    assert.equal(app.loadSyncMeta().cloudRevision, 2);
    assert.equal(app.syncContentState(reloaded, app.loadSyncMeta()).dirty, false);
  });

  await test('SYNC-06', '旧 revision 上传 → 409：云端不被覆盖，页面提示先拉取最新版本', async () => {
    const before = JSON.stringify(mock.getEnvelope());
    const stale = fixtureState();
    stale.experiments[0].note = '不得上传';
    await assert.rejects(
      () => app.uploadStateWithAdapter(adapter, stale, syncedMeta(fixtureState(), 1, 'device-C'), () => true),
      /云端已经有更新（当前 revision 2），请先拉取最新版本/
    );
    assert.equal(JSON.stringify(mock.getEnvelope()), before);
    assert.equal(mock.getEnvelope().metadata.revision, 2);
  });

  await test('SYNC-07', '后端失败不改变本地 state 或 revision', async () => {
    const failing = app.createRemoteSyncAdapter({endpoint: `http://${address.address}:${address.port}/sync-fail`}, fetch, 'session-only-test-token');
    const beforeState = JSON.stringify(stateA);
    const beforeMeta = JSON.stringify(metaA);
    await assert.rejects(() => app.downloadStateWithAdapter(failing, stateA, metaA, () => true), /HTTP 503/);
    assert.equal(JSON.stringify(stateA), beforeState);
    assert.equal(JSON.stringify(metaA), beforeMeta);
  });

  await test('SYNC-08', 'Mock adapter 与 remote adapter 使用同一 envelope 契约', async () => {
    const mockStorage = memoryStorage();
    const localAdapter = app.createMockSyncAdapter(mockStorage);
    const envelope = app.buildSyncEnvelope(stateA, metaA, 3);
    await localAdapter.put(envelope);
    const back = await localAdapter.get();
    assert.equal(back.metadata.revision, 3);
    assert.equal(back.state.schemaVersion, 6);
    assert.equal(back.state.experiments.length, 2);
  });

  await test('SYNC-09', '错误 Token → 401 且云端与本地均不受影响', async () => {
    const wrong = app.createRemoteSyncAdapter({endpoint}, fetch, 'wrong-token');
    await assert.rejects(() => wrong.get(), /401/);
    await assert.rejects(
      () => app.uploadStateWithAdapter(wrong, {...stateA, opTime: '11:00'}, metaA, () => true),
      /401/
    );
    assert.equal(mock.getEnvelope().metadata.revision, 2);
  });

  await test('SYNC-10', '无 Token（未授权）→ 401', async () => {
    const noToken = app.createRemoteSyncAdapter({endpoint}, fetch, '');
    await assert.rejects(() => noToken.get(), /401/);
  });

  await test('SYNC-11', '同步后的本地编辑不影响 cloudRevision：上传仍以云端 r2 为 baseRevision → r3', async () => {
    stateA.experiments[0].note = '本地修改';
    assert.equal(metaA.cloudRevision, 2);
    assert.equal(app.syncContentState(stateA, metaA).dirty, true);
    const result = await app.uploadStateWithAdapter(adapter, stateA, metaA, () => true);
    assert.equal(result.ok, true);
    assert.equal(result.envelope.metadata.revision, 3);
    assert.equal(mock.getEnvelope().metadata.revision, 3);
    metaA = app.syncMetaAfterSuccess(metaA, result.envelope.metadata, result.currentFingerprint, 'upload');
  });

  await test('SYNC-12', '网络不可达（fetch 无 HTTP 响应）→ 通俗提示，不暴露底层错误', async () => {
    const unreachable = app.createRemoteSyncAdapter({endpoint: 'http://127.0.0.1:1/sync'}, fetch, TOKEN);
    await assert.rejects(
      () => app.downloadStateWithAdapter(unreachable, stateA, metaA, () => true),
      /无法连接远程服务器，本地数据未受影响/
    );
    stateA.experiments[0].note = '网络失败前的本地修改';
    await assert.rejects(
      () => app.uploadStateWithAdapter(unreachable, stateA, metaA, () => true),
      /无法连接远程服务器，本地数据未受影响/
    );
  });

  await mock.close();
  console.log(`SYNC: ${passed} PASS, ${12 - passed} FAIL`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
