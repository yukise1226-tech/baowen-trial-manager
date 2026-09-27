const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'outputs', '保温试验排程_V0.6-dev.html');

function createMockSyncServer() {
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
    if (requestPath === '/sync' && req.method === 'GET') {
      if (!envelope) {
        res.writeHead(404, {'Content-Type': 'application/json'}).end(JSON.stringify({error: 'not found'}));
        return;
      }
      res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(envelope));
      return;
    }
    if (requestPath === '/sync' && req.method === 'PUT') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) req.destroy();
      });
      req.on('end', () => {
        try {
          const next = JSON.parse(body);
          if (!next || next.metadata?.schemaVersion !== 6 || next.state?.schemaVersion !== 6) {
            throw new Error('schemaVersion 6 envelope required');
          }
          envelope = next;
          res.writeHead(200, {'Content-Type': 'application/json'}).end(JSON.stringify(envelope));
        } catch (error) {
          res.writeHead(400, {'Content-Type': 'application/json'}).end(JSON.stringify({error: error.message}));
        }
      });
      return;
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
