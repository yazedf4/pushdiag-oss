import { inspectVapidKeys } from './vapid.js';
import { auditManifest } from './manifest.js';
import { analyzeServiceWorker } from './service-worker.js';
import { interpretPushHttpResponse } from './http-analyzer.js';
import { buildRemediationPlan } from './ai-advisor.js';

/**
 * PushDiag OSS — Unified Multi-Layer Web Push Diagnostics Engine (v1.0.0)
 * Backward-compatible with v0.1.0 `diagnose()` signature while supporting full-stack audits:
 * Layer 1: Client Capabilities & iOS/Android PWA Environment
 * Layer 2: Web App Manifest Compliance
 * Layer 3: Service Worker Lifecycle & Static Analysis
 * Layer 4: VAPID Cryptographic Keypair & Subject Audit
 * Layer 5: Push Service HTTP Delivery & Endpoint Classification
 */

export function diagnose(input = {}) {
  const {
    secureContext,
    serviceWorker,
    pushManager,
    notificationPermission,
    manifest,
    installed,
    platform,
    manifestData,
    serviceWorkerCode,
    vapid,
    httpDelivery
  } = input;

  const checks = [];
  const add = (id, ok, fix, { layer = 'client-capabilities', severity = 'critical', message = null, statusOverride = null } = {}) => {
    const status = statusOverride || (ok ? 'pass' : 'fail');
    checks.push({
      id,
      layer,
      status,
      severity: status === 'pass' ? 'info' : severity,
      message: message || (status === 'pass' ? `Check "${id}" passed.` : `Check "${id}" failed.`),
      fix: status === 'pass' ? null : fix
    });
  };

  // Layer 1: Core Browser Capabilities (v0.1.0 compatible + iOS 16.4+ aware)
  add(
    'secure-context',
    secureContext === true,
    'Serve the app over HTTPS or localhost.',
    { message: secureContext === true ? 'Application is running in a secure context (HTTPS/localhost).' : 'Application is NOT running in a secure context (HTTPS required for Service Worker and PushManager).' }
  );

  add(
    'service-worker',
    serviceWorker === true,
    'Register a service worker with the correct scope.',
    { message: serviceWorker === true ? 'Service Worker API is supported and registered.' : 'Service Worker is missing or not active.' }
  );

  add(
    'push-api',
    pushManager === true,
    'Use a browser supporting PushManager.',
    { message: pushManager === true ? 'PushManager API is available in this browser.' : 'PushManager API is unavailable (on iOS, ensure the PWA is added to the Home Screen first).' }
  );

  add(
    'notification-permission',
    notificationPermission === 'granted',
    'Request permission after a user gesture; check browser settings.',
    {
      severity: notificationPermission === 'denied' ? 'critical' : 'high',
      message: notificationPermission === 'granted'
        ? 'Notification permission is granted.'
        : `Notification permission is "${notificationPermission || 'missing'}" (must be "granted" triggered via an explicit user click/tap).`
    }
  );

  add(
    'manifest',
    manifest === true,
    'Provide a valid linked web app manifest.',
    { message: manifest === true ? 'Web App Manifest is linked in the document head.' : 'Missing `<link rel="manifest" href="/manifest.json">` in HTML.' }
  );

  if (installed !== undefined) {
    add(
      'installed',
      installed === true,
      'Install the PWA where required, particularly on iOS.',
      {
        layer: 'ios-pwa',
        severity: platform?.isIOS ? 'critical' : 'medium',
        message: installed === true
          ? 'PWA is running in standalone Home Screen mode.'
          : 'PWA is running inside a regular browser tab instead of Home Screen standalone mode (required on iOS/iPadOS).'
      }
    );
  }

  // Layer 1b: Specific iOS Safari Version Check if platform metadata is provided
  if (platform && platform.isIOS) {
    if (typeof platform.iosVersion === 'number' && platform.iosVersion < 16.4) {
      add(
        'ios-version-support',
        false,
        'Update iOS/iPadOS to version 16.4 or newer to support Web Push.',
        {
          layer: 'ios-pwa',
          severity: 'critical',
          message: `Detected iOS ${platform.iosVersion}, which does not support Web Push (requires iOS 16.4+).`
        }
      );
    } else if (typeof platform.iosVersion === 'number') {
      add(
        'ios-version-support',
        true,
        null,
        {
          layer: 'ios-pwa',
          message: `Detected iOS ${platform.iosVersion} (supports Home Screen Web Push).`
        }
      );
    }
  }

  // Layer 2: Deep Manifest Inspection (optional when manifestData is provided)
  if (manifestData) {
    const manifestReport = auditManifest(manifestData);
    for (const c of manifestReport.checks) {
      checks.push(c);
    }
  }

  // Layer 3: Service Worker Static Code Audit (optional when serviceWorkerCode is provided)
  if (typeof serviceWorkerCode === 'string') {
    const swReport = analyzeServiceWorker(serviceWorkerCode);
    for (const c of swReport.checks) {
      checks.push(c);
    }
  }

  // Layer 4: VAPID Keypair Audit (optional when vapid object is provided)
  if (vapid && typeof vapid === 'object') {
    const vapidReport = inspectVapidKeys(vapid);
    for (const c of vapidReport.checks) {
      checks.push(c);
    }
  }

  // Layer 5: HTTP Delivery Audit (optional when httpDelivery is provided)
  if (httpDelivery && typeof httpDelivery === 'object') {
    const httpReport = interpretPushHttpResponse(httpDelivery);
    for (const c of httpReport.findings) {
      checks.push(c);
    }
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  const baseReport = {
    version: '1.0.0',
    checks,
    summary: {
      passed,
      warnings,
      failed,
      total: checks.length
    },
    disclaimer: 'Local capability checks cannot prove remote push delivery.'
  };

  baseReport.remediation = buildRemediationPlan(baseReport);
  return baseReport;
}
