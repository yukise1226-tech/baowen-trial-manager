const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

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
const app = vm.createContext({
  console, Date, performance, crypto: webcrypto, URL,
  Promise, setTimeout, clearTimeout, localStorage, sessionStorage
});
vm.runInContext(match[1], app, {filename: htmlPath});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function businessState(note = '') {
  return {
    version: 4, schemaVersion: 6, uiVersion: 'V0.6-dev', opTime: '10:00',
    experiments: [{
      id: 'REV', no: 'REV-01', project: 'revision 测试', batch: 'B1',
      prodDate: '2026-09-20', putinDate: '2026-09-22', actualStartTime: '',
      months: 12, condition: '55±1℃', owner: '测试', note, planTime: '10:00',
      targetMode: 'standard', targetDays: [1, 3, 7, 14], targetQty: {},
      targetConfirmed: true, enabled: {}, protocol36: null, archived: false, archivedAt: ''
    }],
    executions: {}
  };
}
function syncedMeta(state, revision = 4, deviceId = 'device-A') {
  return {
    metadataVersion: 2,
    cloudRevision: revision,
    cloudUpdatedAt: '2026-09-28T00:00:00.000Z',
    deviceId,
    lastSyncedFingerprint: app.fingerprintSyncState(state),
    lastSyncedAt: '2026-09-28T00:00:01.000Z',
    lastAction: 'download',
    lastRemoteDeviceId: 'device-cloud',
    localMutationSeq: 0
  };
}
function countingAdapter(inner) {
  return {
    name: inner.name,
    gets: 0,
    puts: 0,
    get() { this.gets++; return inner.get(); },
    put(payload) { this.puts++; return inner.put(payload); }
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
  const base = businessState();

  await test('SYNC-REV-01', '云端 r4 后本地连续修改四次，cloudRevision 始终为 4', async () => {
    localStorage.clear();
    app.writeSyncMeta(syncedMeta(base, 4));
    const local = clone(base);
    for (let i = 1; i <= 4; i++) {
      local.experiments[0].note = `本地修改-${i}`;
      app.touchLocalSyncMeta();
      const meta = app.loadSyncMeta();
      const info = app.syncStatusInfo(local, meta);
      assert.equal(meta.cloudRevision, 4);
      assert.equal(info.dirty, true);
      assert.equal(info.message, '本地有未同步修改 · 基于云端 r4');
    }
  });

  await test('SYNC-REV-02', '修改后恢复原值，fingerprint 自动恢复为已同步', async () => {
    const local = clone(base);
    const meta = syncedMeta(base, 4);
    local.experiments[0].note = '临时修改';
    assert.equal(app.syncContentState(local, meta).dirty, true);
    local.experiments[0].note = '';
    const info = app.syncStatusInfo(local, meta);
    assert.equal(info.dirty, false);
    assert.equal(info.message, '已同步 · 云端 r4');
  });

  let uploadedState;
  let uploadedMeta;
  let cloudAdapter;
  await test('SYNC-REV-03', '多次本地修改只产生一次 PUT，云端 r4 → r5', async () => {
    const cloudStorage = memoryStorage();
    const inner = app.createMockSyncAdapter(cloudStorage);
    await inner.put(app.buildSyncEnvelope(base, syncedMeta(base, 4), 4));
    cloudAdapter = countingAdapter(inner);
    uploadedState = clone(base);
    uploadedState.experiments[0].note = '一';
    uploadedState.experiments[0].note = '二';
    uploadedState.experiments[0].owner = '修改后负责人';
    const meta = syncedMeta(base, 4);
    const result = await app.uploadStateWithAdapter(cloudAdapter, uploadedState, meta, () => true);
    assert.equal(result.envelope.metadata.revision, 5);
    assert.equal(cloudAdapter.puts, 1);
    uploadedMeta = app.syncMetaAfterSuccess(meta, result.envelope.metadata, result.currentFingerprint, 'upload');
    assert.equal(uploadedMeta.cloudRevision, 5);
    assert.equal(app.syncContentState(uploadedState, uploadedMeta).dirty, false);
  });

  await test('SYNC-REV-04', '无业务修改连续上传五次，0 次 GET/PUT 且仍为云端 r5', async () => {
    cloudAdapter.gets = 0;
    cloudAdapter.puts = 0;
    for (let i = 0; i < 5; i++) {
      const result = await app.uploadStateWithAdapter(cloudAdapter, uploadedState, uploadedMeta, () => true);
      assert.equal(result.skipped, true);
    }
    assert.equal(cloudAdapter.gets, 0);
    assert.equal(cloudAdapter.puts, 0);
    assert.equal(uploadedMeta.cloudRevision, 5);
  });

  await test('SYNC-REV-05', '拉取 r8 后建立 fingerprint 基线并清除 dirty', async () => {
    const remoteState = businessState('来自云端 r8');
    const storage = memoryStorage();
    const adapter = app.createMockSyncAdapter(storage);
    await adapter.put(app.buildSyncEnvelope(remoteState, {deviceId: 'device-B'}, 8));
    const result = await app.downloadStateWithAdapter(adapter, uploadedState, uploadedMeta, () => true);
    const pulledMeta = app.syncMetaAfterSuccess(uploadedMeta, result.envelope.metadata,
      app.fingerprintSyncState(result.envelope.state), 'download');
    assert.equal(pulledMeta.cloudRevision, 8);
    assert.equal(app.syncContentState(result.envelope.state, pulledMeta).dirty, false);
    assert.equal(pulledMeta.lastSyncedFingerprint, app.fingerprintSyncState(remoteState));
  });

  await test('SYNC-REV-06', '409 保持本地 dirty 与 metadata，云端内容不变', async () => {
    const local = businessState('本地未上传');
    const meta = syncedMeta(base, 8);
    const remoteState = businessState('其他设备 r9');
    const beforeMeta = JSON.stringify(meta);
    const beforeLocal = JSON.stringify(local);
    const remote = {
      name: 'remote',
      put() { return Promise.reject(new Error('云端已经有更新（当前 revision 9），请先拉取最新版本。')); }
    };
    await assert.rejects(() => app.uploadStateWithAdapter(remote, local, meta, () => true), /revision 9/);
    assert.equal(JSON.stringify(meta), beforeMeta);
    assert.equal(JSON.stringify(local), beforeLocal);
    assert.equal(remoteState.experiments[0].note, '其他设备 r9');
    assert.equal(app.syncContentState(local, meta).dirty, true);
  });

  await test('SYNC-REV-07', '401 不更新任何同步 metadata', async () => {
    const local = businessState('401 前修改');
    const meta = syncedMeta(base, 8);
    const before = JSON.stringify(meta);
    const denied = {name: 'remote', put() { return Promise.reject(new Error('访问被拒绝（HTTP 401）')); }};
    await assert.rejects(() => app.uploadStateWithAdapter(denied, local, meta, () => true), /401/);
    assert.equal(JSON.stringify(meta), before);
  });

  await test('SYNC-REV-08', '网络失败不更新任何同步 metadata', async () => {
    const local = businessState('网络失败前修改');
    const meta = syncedMeta(base, 8);
    const before = JSON.stringify(meta);
    const failed = {name: 'remote', put() { return Promise.reject(new Error('无法连接远程服务器，本地数据未受影响。')); }};
    await assert.rejects(() => app.uploadStateWithAdapter(failed, local, meta, () => true), /无法连接/);
    assert.equal(JSON.stringify(meta), before);
  });

  await test('SYNC-REV-09', '同步 metadata 改变不产生业务 dirty', async () => {
    const meta = syncedMeta(base, 4);
    const changed = {...meta, cloudUpdatedAt: '2099-01-01T00:00:00.000Z',
      lastSyncedAt: '2099-01-01T00:00:01.000Z', deviceId: 'device-new',
      lastRemoteDeviceId: 'device-other', localMutationSeq: 999};
    assert.equal(app.fingerprintSyncState(base), meta.lastSyncedFingerprint);
    assert.equal(app.syncContentState(base, changed).dirty, false);
  });

  await test('SYNC-REV-10', '旧 localStorage 无 fingerprint 保留数据与 cloud revision，并显示待确认', async () => {
    localStorage.clear();
    localStorage.setItem(app.LS_KEY, JSON.stringify(base));
    localStorage.setItem(app.SYNC_META_KEY, JSON.stringify({
      revision: 12, syncedRevision: 4, updatedAt: '2026-09-27T00:00:00.000Z',
      deviceId: 'legacy-device', lastSyncAt: '2026-09-27T00:01:00.000Z'
    }));
    const migrated = app.loadSyncMeta();
    const reloaded = app.loadState();
    const info = app.syncStatusInfo(reloaded, migrated);
    assert.equal(migrated.cloudRevision, 4);
    assert.equal(migrated.localMutationSeq, 12);
    assert.equal(migrated.lastSyncedFingerprint, '');
    assert.equal(reloaded.experiments[0].project, 'revision 测试');
    assert.equal(info.dirty, null);
    assert.equal(info.message, '同步状态待确认 · 基于云端 r4');
  });

  console.log(`SYNC-REV: ${passed} PASS, ${10 - passed} FAIL`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
