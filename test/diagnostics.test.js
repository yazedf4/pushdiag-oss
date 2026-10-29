import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createDiagnosticServer } from '../src/server.js';
import {
  diagnose,
  generateVapidKeys,
  inspectVapidKeys,
  inspectVapidJwt,
  auditManifest,
  analyzeServiceWorker,
  classifyPushEndpoint,
  interpretPushHttpResponse,
  getBrowserProbeScript,
  buildRemediationPlan
} from '../src/index.js';

// --- 1. Core Capability Snapshot Tests (Backward-compatible with v0.1.0) ---
test('all supported capabilities pass', () => {
  const r = diagnose({
    secureContext: true,
    serviceWorker: true,
    pushManager: true,
    notificationPermission: 'granted',
    manifest: true,
    installed: true
  });
  assert.equal(r.summary.passed, 6);
  assert.equal(r.summary.failed, 0);
  assert.equal(r.remediation.healthy, true);
});

test('missing capabilities include actionable fixes', () => {
  const r = diagnose({});
  assert.equal(r.summary.passed, 0);
  assert.ok(r.checks.every(c => c.fix));
  assert.equal(r.remediation.healthy, false);
});

test('iOS install check is optional when omitted, enforced when present', () => {
  assert.equal(diagnose({}).summary.total, 5);
  const iosReport = diagnose({
    secureContext: true,
    serviceWorker: true,
    pushManager: false,
    notificationPermission: 'default',
    manifest: true,
    installed: false,
    platform: { isIOS: true, iosVersion: 16.2 }
  });
  assert.ok(iosReport.checks.some(c => c.id === 'ios-version-support' && c.status === 'fail'));
});

// --- 2. VAPID Cryptographic Keypair & JWT Auditor Tests ---
test('generateVapidKeys produces valid 65-byte public and 32-byte private P-256 keys that match', () => {
  const keys = generateVapidKeys();
  const audit = inspectVapidKeys({
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    subject: 'mailto:yazed@example.com'
  });
  assert.equal(audit.valid, true);
  assert.ok(audit.checks.some(c => c.id === 'vapid-keypair-match' && c.status === 'pass'));
});

test('inspectVapidKeys detects mismatched public/private keypair and invalid subject', () => {
  const pair1 = generateVapidKeys();
  const pair2 = generateVapidKeys();
  const audit = inspectVapidKeys({
    publicKey: pair1.publicKey,
    privateKey: pair2.privateKey,
    subject: 'http://localhost:3000'
  });
  assert.equal(audit.valid, false);
  assert.ok(audit.checks.some(c => c.id === 'vapid-keypair-match' && c.status === 'fail'));
  assert.ok(audit.checks.some(c => c.id === 'vapid-subject-uri' && c.status === 'fail'));
});

test('inspectVapidJwt validates ES256 header, audience origin, and expiration window', () => {
  const now = 1750000000;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    aud: 'https://fcm.googleapis.com',
    exp: now + 3600,
    sub: 'mailto:ops@example.com'
  })).toString('base64url');
  const fakeToken = `vapid t=${header}.${payload}.sig123, k=pubKey123`;

  const res = inspectVapidJwt({
    token: fakeToken,
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    nowEpochSeconds: now
  });
  // A forged '.sig123' token can have plausible claims but is NOT valid.
  assert.equal(res.valid, false);
  assert.equal(res.signatureVerified, false);
  assert.ok(res.checks.some(c => c.id === 'jwt-signature' && c.status === 'fail'));

  const mismatchRes = inspectVapidJwt({
    token: fakeToken,
    endpoint: 'https://web.push.apple.com/QH999',
    nowEpochSeconds: now
  });
  assert.equal(mismatchRes.valid, false);
  assert.ok(mismatchRes.checks.some(c => c.id === 'jwt-aud-match' && c.status === 'fail'));
});

// --- 3. Web App Manifest Auditor Tests ---
test('auditManifest validates iOS standalone display mode and icons', () => {
  const good = auditManifest({
    name: 'PushDiag App',
    start_url: '/',
    display: 'standalone',
    icons: [
      { src: '/192.png', sizes: '192x192' },
      { src: '/512.png', sizes: '512x512' }
    ]
  });
  assert.equal(good.valid, true);
  assert.equal(good.iosReady, true);

  const badIos = auditManifest({
    name: 'Browser Tab App',
    display: 'browser'
  });
  assert.equal(badIos.valid, false);
  assert.equal(badIos.iosReady, false);
});

// --- 4. Service Worker Static Analyzer Tests ---
test('analyzeServiceWorker detects missing waitUntil and showNotification', () => {
  const brokenSw = `self.addEventListener('push', (e) => { console.log(e.data.json()); });`;
  const badReport = analyzeServiceWorker(brokenSw);
  assert.equal(badReport.valid, false);
  assert.ok(badReport.checks.some(c => c.id === 'sw-wait-until' && c.status === 'fail'));
  assert.ok(badReport.checks.some(c => c.id === 'sw-show-notification' && c.status === 'fail'));

  const healthySw = `
    self.addEventListener('push', (event) => {
      let data = {};
      try { data = event.data.json(); } catch { data = { title: event.data.text() }; }
      event.waitUntil(self.registration.showNotification(data.title || 'Hi'));
    });
    self.addEventListener('notificationclick', (e) => { e.notification.close(); });
    self.addEventListener('pushsubscriptionchange', (e) => {});
  `;
  const goodReport = analyzeServiceWorker(healthySw);
  assert.equal(goodReport.valid, true);
  assert.equal(goodReport.summary.failed, 0);
});

// --- 5. Push Service Endpoint Classifier & HTTP Decoder Tests ---
test('classifyPushEndpoint and interpretPushHttpResponse decode FCM, APNs, and Autopush responses', () => {
  const apns = classifyPushEndpoint('https://web.push.apple.com/QH1234');
  assert.equal(apns.valid, true);
  assert.match(apns.provider, /Apple Push/);

  const gone = interpretPushHttpResponse({
    statusCode: 410,
    endpoint: 'https://fcm.googleapis.com/fcm/send/token123',
    requestHeaders: { TTL: '3600' }
  });
  assert.equal(gone.diagnosis.shouldRemoveSubscription, true);

  const authErr = interpretPushHttpResponse({
    statusCode: 403,
    endpoint: 'https://web.push.apple.com/QH1234'
  });
  assert.match(authErr.diagnosis.category, /VAPID Authentication/);
});

// --- 6. Browser Probe & Remediation Synthesizer Tests ---
test('getBrowserProbeScript generates executable self-contained probe', () => {
  const script = getBrowserProbeScript({ postbackUrl: 'http://localhost:3400/api/diagnose' });
  assert.match(script, /runPushDiagBrowserProbe/);
  assert.match(script, /http:\/\/localhost:3400\/api\/diagnose/);
});

function signedVapidJwt({ now = 1750000000, audience = 'https://fcm.googleapis.com', payloadPatch = {} } = {}) {
  const keys = generateVapidKeys();
  const raw = Buffer.from(keys.publicKey, 'base64url');
  const signer = crypto.createPrivateKey({
    key: {
      kty: 'EC', crv: 'P-256',
      x: raw.subarray(1, 33).toString('base64url'),
      y: raw.subarray(33, 65).toString('base64url'),
      d: keys.privateKey
    },
    format: 'jwk'
  });
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ aud: audience, exp: now + 3600, sub: 'mailto:owner@example.org', ...payloadPatch })).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(input), { key: signer, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { jwt: `${input}.${signature}`, keys };
}

test('real ES256 VAPID signature is verified and tampering is rejected', () => {
  const now = 1750000000;
  const { jwt, keys } = signedVapidJwt({ now });
  const endpoint = 'https://fcm.googleapis.com/fcm/send/test';
  const accepted = inspectVapidJwt({ token: `vapid t=${jwt}, k=${keys.publicKey}`, endpoint, nowEpochSeconds: now });
  assert.equal(accepted.valid, true);
  assert.equal(accepted.signatureVerified, true);
  assert.ok(accepted.checks.some(c => c.id === 'jwt-signature' && c.status === 'pass'));

  const [h, p, sig] = jwt.split('.');
  const modifiedPayload = JSON.parse(Buffer.from(p, 'base64url').toString());
  modifiedPayload.exp += 600;
  const altered = `${h}.${Buffer.from(JSON.stringify(modifiedPayload)).toString('base64url')}.${sig}`;
  const reject = inspectVapidJwt({ token: altered, publicKey: keys.publicKey, endpoint, nowEpochSeconds: now });
  assert.equal(reject.valid, false);
  assert.equal(reject.signatureVerified, false);
  assert.ok(reject.checks.some(c => c.id === 'jwt-signature' && c.status === 'fail'));
  const wrongKey = generateVapidKeys();
  assert.equal(inspectVapidJwt({ token: jwt, publicKey: wrongKey.publicKey, nowEpochSeconds: now }).valid, false);
});

test('VAPID signature validity never bypasses expiration and audience checks', () => {
  const now = 1750000000;
  const { jwt, keys } = signedVapidJwt({ now });
  const wrongAudience = inspectVapidJwt({ token: jwt, publicKey: keys.publicKey, endpoint: 'https://web.push.apple.com/id', nowEpochSeconds: now });
  assert.equal(wrongAudience.signatureVerified, true);
  assert.equal(wrongAudience.valid, false);
  const expired = inspectVapidJwt({ token: jwt, publicKey: keys.publicKey, nowEpochSeconds: now + 4000 });
  assert.equal(expired.signatureVerified, true);
  assert.equal(expired.valid, false);
  const missingKey = inspectVapidJwt({ token: jwt, nowEpochSeconds: now });
  assert.equal(missingKey.valid, false);
  assert.equal(missingKey.summary.warnings, 1);
});

test('doctor discovers common public/ manifest and SW and never invents capability passes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pushdiag-fixture-'));
  try {
    await mkdir(path.join(dir, 'public'));
    await writeFile(path.join(dir, 'public', 'manifest.webmanifest'), JSON.stringify({
      name: 'Fixture', start_url: '/', display: 'standalone',
      icons: [{ sizes: '192x192' }, { sizes: '512x512' }]
    }));
    await writeFile(path.join(dir, 'public', 'sw.js'), `self.addEventListener('push', e => {
      e.waitUntil(self.registration.showNotification('Test'));
    });`);
    const out = execFileSync(process.execPath, ['src/cli.js', 'doctor', '--project', dir], { cwd: process.cwd(), encoding: 'utf8' });
    const report = JSON.parse(out);
    assert.ok(report.checks.some(c => c.id === 'manifest-display-ios'));
    assert.ok(report.checks.some(c => c.id === 'sw-push-listener'));
    assert.equal(report.checks.some(c => c.id === 'secure-context'), false);
    assert.match(report.disclaimer, /not tested/);
    const missing = await mkdtemp(path.join(tmpdir(), 'pushdiag-empty-'));
    try {
      const result = spawnSync(process.execPath, ['src/cli.js', 'doctor', '--project', missing], { cwd: process.cwd(), encoding: 'utf8' });
      assert.equal(result.status, 2);
      assert.match(result.stderr, /No manifest/);
    } finally { await rm(missing, { recursive: true, force: true }); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('local diagnostic server serves UI and rejects cross-origin and hostile Host requests', async () => {
  const server = createDiagnosticServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const root = `http://127.0.0.1:${port}`;
    const home = await fetch(root);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /PushDiag OSS/);
    assert.equal(home.headers.get('access-control-allow-origin'), null);
    assert.equal(home.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(root + '/api/health')).status, 200);
    assert.equal((await fetch(root + '/api/vapid/generate')).status, 404);
    const crossSite = await fetch(root + '/api/vapid/generate', {
      method: 'POST', headers: { Origin: 'https://attacker.example' }
    });
    assert.equal(crossSite.status, 403);
    const hostileStatus = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: '/api/health', headers: { Host: 'attacker.example' } },
        response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
    });
    assert.equal(hostileStatus, 403);
    const generated = await fetch(root + '/api/vapid/generate', {
      method: 'POST', headers: { Origin: root }
    });
    assert.equal(generated.status, 200);
    assert.ok((await generated.json()).privateKey);
    const oversized = await fetch(root + '/api/diagnose', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'X'.repeat(280000) })
    });
    assert.equal(oversized.status, 413);
    const wrongType = await fetch(root + '/api/diagnose', { method: 'POST', body: 'hello' });
    assert.equal(wrongType.status, 415);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
