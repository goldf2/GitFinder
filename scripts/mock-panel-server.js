#!/usr/bin/env node

const http = require('node:http');

const host = '127.0.0.1';
const port = Number(process.env.GITFINDER_PANEL_MOCK_PORT || 4786);
const token = process.env.GITFINDER_PANEL_MOCK_TOKEN || 'mock-panel-read-token';
const observedAt = new Date().toISOString();
const resource = {
  resourceUuid: 'resource_demo',
  nodeId: 'node_con01',
  projectUuid: 'panel_project_demo',
  environmentUuid: 'environment_production',
  name: 'GitFinder 2 Demo',
  type: 'application',
  status: 'running',
  serverName: 'Con01',
  projectName: 'GitFinder',
  environmentName: 'production',
  domains: ['https://gitfinder.example.test'],
  panelUrl: `http://${host}:${port}/resources/resource_demo`,
  coolifyUrl: 'https://cool.example.test/project/resource_demo',
  observedAt
};

function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  if (request.headers.authorization !== `Bearer ${token}`) {
    sendJson(response, 401, { error: 'unauthorized' });
    return;
  }
  const url = new URL(request.url, `http://${host}:${port}`);
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'read_only' });
    return;
  }
  if (url.pathname === '/api/gitfinder/v1/capabilities') {
    sendJson(response, 200, {
      apiVersion: '1.0',
      providerKind: 'xiangshu-panel',
      capabilities: ['catalog:read', 'snapshots:read', 'events:read']
    });
    return;
  }
  if (url.pathname === '/api/gitfinder/v1/catalog') {
    sendJson(response, 200, { apiVersion: '1.0', resources: [resource] });
    return;
  }
  if (url.pathname === '/api/gitfinder/v1/snapshot' && url.searchParams.get('resourceUuid') === resource.resourceUuid) {
    sendJson(response, 200, { apiVersion: '1.0', resource: { ...resource, observedAt: new Date().toISOString() } });
    return;
  }
  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, host, () => {
  process.stdout.write(`GitFinder Panel mock listening on http://${host}:${port}\n`);
  process.stdout.write(`Read-only token: ${token}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
