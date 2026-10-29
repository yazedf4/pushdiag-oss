/**
 * PushDiag OSS — Service Worker Static Code Analyzer for Web Push Lifecycle
 * Detects subtle anti-patterns that cause dropped notifications, terminated workers,
 * or browser-forced "This site has been updated in the background" warnings.
 */

export function analyzeServiceWorker(swSource, { sourcePath = 'sw.js' } = {}) {
  const checks = [];
  const add = (id, status, severity, message, fix = null) => {
    checks.push({ id, layer: 'service-worker', status, severity, message, fix });
  };

  if (typeof swSource !== 'string' || swSource.trim().length === 0) {
    add('sw-source-nonempty', 'fail', 'critical', `Service Worker file (${sourcePath}) is empty or unreadable.`, 'Provide a valid JavaScript Service Worker file handling the "push" event.');
    return { valid: false, summary: { passed: 0, warnings: 0, failed: 1, total: 1 }, checks };
  }

  // Strip block and line comments for cleaner static analysis
  const cleanCode = swSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  // 1. Push event listener
  const hasPushListener =
    /addEventListener\s*\(\s*['"`]push['"`]/i.test(cleanCode) ||
    /onpush\s*=/i.test(cleanCode);

  if (hasPushListener) {
    add('sw-push-listener', 'pass', 'info', 'Service Worker registers a "push" event listener.');
  } else {
    add(
      'sw-push-listener',
      'fail',
      'critical',
      'No "push" event listener (`self.addEventListener("push", ...)`) detected in Service Worker.',
      'Add `self.addEventListener("push", (event) => { event.waitUntil(self.registration.showNotification(...)); });`.'
    );
  }

  // 2. event.waitUntil inside push handler
  const hasWaitUntil = /\.waitUntil\s*\(/.test(cleanCode);
  if (hasWaitUntil) {
    add('sw-wait-until', 'pass', 'info', 'Service Worker uses `event.waitUntil(...)` to keep the worker thread alive during async push processing.');
  } else {
    add(
      'sw-wait-until',
      'fail',
      'critical',
      'Missing `event.waitUntil(...)` in Service Worker! Browsers (especially iOS WebKit and Android Chrome) will terminate the Service Worker before `showNotification()` resolves.',
      'Wrap your notification promise inside `event.waitUntil(self.registration.showNotification(title, options))`.'
    );
  }

  // 3. showNotification invocation
  const hasShowNotification = /showNotification\s*\(/.test(cleanCode);
  if (hasShowNotification) {
    add('sw-show-notification', 'pass', 'info', 'Service Worker calls `registration.showNotification(...)` to display user-visible notifications.');
  } else {
    add(
      'sw-show-notification',
      'fail',
      'critical',
      'Service Worker does not call `self.registration.showNotification(...)`. Because Web Push requires `userVisibleOnly: true`, silent pushes are penalized or revoked by Chrome and iOS Safari.',
      'Always call `self.registration.showNotification(title, options)` inside every `push` event.'
    );
  }

  // 4. Safe payload parsing (handling both JSON and plain text payloads)
  const usesJsonDirect = /\.data\.json\s*\(\s*\)/.test(cleanCode);
  const hasTryCatchOrTextFallback = /try\s*\{[\s\S]*?\.json\s*\(\s*\)[\s\S]*?catch/m.test(cleanCode) || /\.data\.text\s*\(\s*\)/.test(cleanCode);
  if (usesJsonDirect && !hasTryCatchOrTextFallback) {
    add(
      'sw-payload-safe-parse',
      'warn',
      'medium',
      'Service Worker calls `event.data.json()` without a `try/catch` or `.text()` fallback. Sending a plain-text test push from DevTools will throw an unhandled SyntaxError and drop the notification.',
      'Wrap `event.data.json()` in a `try { ... } catch { fallbackToText = event.data.text(); }` block.'
    );
  } else if (usesJsonDirect || hasTryCatchOrTextFallback) {
    add('sw-payload-safe-parse', 'pass', 'info', 'Service Worker safely parses incoming push payloads with fallback handling.');
  }

  // 5. notificationclick listener
  const hasNotificationClick =
    /addEventListener\s*\(\s*['"`]notificationclick['"`]/i.test(cleanCode) ||
    /onnotificationclick\s*=/i.test(cleanCode);
  if (hasNotificationClick) {
    add('sw-notificationclick', 'pass', 'info', 'Service Worker handles `notificationclick` events to close notifications and focus/open client windows.');
  } else {
    add(
      'sw-notificationclick',
      'warn',
      'medium',
      'Missing `notificationclick` event listener. Tapping the notification on Android or iOS will not open or focus your PWA.',
      'Add `self.addEventListener("notificationclick", (event) => { event.notification.close(); event.waitUntil(clients.openWindow("/")); });`.'
    );
  }

  // 6. pushsubscriptionchange listener (key rotation / iOS & Firefox token refresh)
  const hasSubscriptionChange =
    /addEventListener\s*\(\s*['"`]pushsubscriptionchange['"`]/i.test(cleanCode) ||
    /onpushsubscriptionchange\s*=/i.test(cleanCode);
  if (hasSubscriptionChange) {
    add('sw-subscription-change', 'pass', 'info', 'Service Worker listens for `pushsubscriptionchange` to automatically re-sync rotated endpoints.');
  } else {
    add(
      'sw-subscription-change',
      'warn',
      'low',
      'No `pushsubscriptionchange` listener found. When push providers rotate subscription tokens, the client will silently stop receiving notifications until next app launch.',
      'Add a `pushsubscriptionchange` listener to re-subscribe and POST the updated endpoint to your backend.'
    );
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  return {
    valid: failed === 0,
    summary: { passed, warnings, failed, total: checks.length },
    checks
  };
}
