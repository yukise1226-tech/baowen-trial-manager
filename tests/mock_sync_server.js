const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');

/* 本机模拟同步后端：契约与真实 Cloudflare Worker（cloud-sync-worker）完全一致——
 * GET /sync：200 完整 envelope / 404 空状态
 * PUT /sync：body {baseRevision, schemaVersion:6, deviceId, state}，服务端 CAS：
 *   一致 → revision+1、updatedAt 服务端生成、保存整份 state、返回 200 新 metadata；
 *   不一致 → 409 返回当前 metadata，不写入任何数据。
 * options.token 配置后才校验 Authorization: Bearer（默认不校验，方便本地演练）。 */
function createMockSyncServer(options) {
  options = options || {};
  const requireToken = options.token ? String(options.token) : '';
  let envelope = null;
  const server = http.createServer((req, res) => {
    const requestPath = new URL(req.url, 'http://127.0.0.1').pathname;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (requestPath === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    if (requestPath === '/sync-fail') {
      res.writeHead(503, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'mock backend unavailable'}));
      return;
    }

    if (requestPath === '/sync') {
      if (requireToken && (req.headers['authorization'] || '') !== 'Bearer ' + requireToken) {
        res.writeHead(401, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'unauthorized'}));
        return;
      }
      if (req.method === 'GET') {
        if (!envelope) {
          res.writeHead(404, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'not found'}));
          return;
        }
        res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(envelope));
        return;
      }
      if (req.method === 'PUT') {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 5 * 1024 * 1024) req.destroy();
        });
        req.on('end', () => {
          try {
            const put = JSON.parse(body);
            if (!put || put.schemaVersion !== 6 || !put.state || put.state.schemaVersion !== 6) {
              throw new Error('schemaVersion 6 data required');
            }
            const baseRevision = Number(put.baseRevision);
            if (!Number.isInteger(baseRevision) || baseRevision < 0) {
              throw new Error('bad baseRevision');
            }
            const currentRevision = envelope ? envelope.metadata.revision : 0;
            if (baseRevision !== currentRevision) {
              const meta = envelope ? envelope.metadata
                : {schemaVersion: 6, revision: 0, updatedAt: '', deviceId: ''};
              res.writeHead(409, {'Content-Type': 'application/json'}).end(JSON.stringify(meta));
              return;
            }
            envelope = {
              app: '保温试验排程工具',
              syncVersion: 1,
              metadata: {
                schemaVersion: 6,
                revision: currentRevision + 1,
                updatedAt: new Date().toISOString(),
                deviceId: String(put.deviceId || '')
              },
              state: put.state
            };
            res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(envelope.metadata));
          } catch (error) {
            res.writeHead(400, {'Content-Type': 'application/json'}).end(JSON.stringify({error: error.message}));
          }
        });
        return;
      }
    }
    if ((requestPath === '/' || requestPath === '/app') && req.method === 'GET') {
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      fs.createReadStream(htmlPath).pipe(res);
      return;
    }
    res.writeHead(404, {'Content-Type': 'text/plain; charset=utf-8'}).end('Not found');
  });

  return {
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => resolve(server.address()));
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
    getEnvelope() {
      return envelope;
    }
  };
}

if (require.main === module) {
  const mock = createMockSyncServer();
  const port = Number(process.env.BAOWEN_MOCK_PORT || 8787);
  mock.listen(port).then(address => {
    console.log(`Mock sync app: http://${address.address}:${address.port}/`);
    console.log(`Sync endpoint: http://${address.address}:${address.port}/sync`);
  }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {createMockSyncServer};
