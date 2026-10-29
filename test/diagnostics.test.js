import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(res.valid, true);

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
