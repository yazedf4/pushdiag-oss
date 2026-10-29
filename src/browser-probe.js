/**
 * PushDiag OSS — Injectable Browser Probe & Client Environment Snapshot Generator
 * Runs inside any mobile/desktop browser (or DevTools console) to capture real-time
 * Web Push, PWA Standalone state, iOS version, Manifest, Service Worker, and Subscription metrics.
 */

export function getBrowserProbeScript({ postbackUrl = null } = {}) {
  return `(async function runPushDiagBrowserProbe() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosVersionMatch = ua.match(/OS (\d+)_(\d+)/);
  const iosVersion = iosVersionMatch ? parseFloat(iosVersionMatch[1] + '.' + iosVersionMatch[2]) : null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  let swRegistration = null;
  let pushSubscription = null;
  let manifestData = null;
  let manifestUrl = null;

  if ('serviceWorker' in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.getRegistration();
      if (swRegistration && 'pushManager' in swRegistration) {
        pushSubscription = await swRegistration.pushManager.getSubscription();
      }
    } catch (e) {}
  }

  const manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink && manifestLink.href) {
    manifestUrl = manifestLink.href;
    try {
      const res = await fetch(manifestUrl);
      if (res.ok) manifestData = await res.json();
    } catch (e) {}
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    url: location.href,
    userAgent: ua,
    platform: {
      isIOS,
      iosVersion,
      isAndroid: /Android/i.test(ua),
      isStandalone
    },
    secureContext: window.isSecureContext === true,
    serviceWorker: 'serviceWorker' in navigator && Boolean(swRegistration && swRegistration.active),
    serviceWorkerScope: swRegistration ? swRegistration.scope : null,
    pushManager: 'serviceWorker' in navigator && 'PushManager' in window,
    notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
    manifest: Boolean(manifestLink),
    manifestUrl,
    manifestData,
    installed: isStandalone,
    hasActiveSubscription: Boolean(pushSubscription),
    subscriptionEndpointOrigin: pushSubscription ? new URL(pushSubscription.endpoint).origin : null
  };

  console.group('%c[PushDiag OSS] Browser Capability Snapshot', 'color:#10b981;font-weight:bold;font-size:14px');
  console.log(JSON.stringify(snapshot, null, 2));
  console.groupEnd();

  ${postbackUrl ? `try { await fetch(${JSON.stringify(postbackUrl)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }); } catch (e) {}` : ''}
  return snapshot;
})();`;
}
