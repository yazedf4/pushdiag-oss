/**
 * PushDiag OSS — Push Service Endpoint Classifier & RFC 8030 / RFC 8291 / RFC 8292 HTTP Response Decoder
 * Supports FCM (Chrome/Android/Edge), Apple Web Push (iOS/macOS Safari), Mozilla Autopush (Firefox), and WNS.
 */

export function classifyPushEndpoint(endpointUrl) {
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return { valid: false, provider: 'Unknown', protocol: null, reason: 'Endpoint URL is empty or not a string.' };
  }
  try {
    const url = new URL(endpointUrl);
    if (url.protocol !== 'https:') {
      return {
        valid: false,
        provider: 'Invalid',
        origin: url.origin,
        reason: `Push endpoint must use HTTPS (found ${url.protocol}).`
      };
    }
    const host = url.hostname.toLowerCase();
    let provider = 'Generic RFC 8030 Push Service';
    let platformHint = 'Standard Web Push Browser';
    let maxPayloadBytes = 4096;

    if (host.includes('fcm.googleapis.com') || host.includes('android.googleapis.com')) {
      provider = 'Google Firebase Cloud Messaging (FCM)';
      platformHint = 'Chrome, Edge, Brave, Opera (Desktop & Android)';
      maxPayloadBytes = 4096;
    } else if (host.includes('web.push.apple.com')) {
      provider = 'Apple Push Notification service (APNs Web Push)';
      platformHint = 'Safari on iOS/iPadOS 16.4+ (Home Screen PWA) or macOS Ventura+';
      maxPayloadBytes = 4096;
    } else if (host.includes('push.services.mozilla.com') || host.includes('updates.push.services.mozilla.com')) {
      provider = 'Mozilla Autopush';
      platformHint = 'Firefox (Desktop & Android)';
      maxPayloadBytes = 4096;
    } else if (host.includes('notify.windows.com')) {
      provider = 'Windows Notification Service (WNS)';
      platformHint = 'Microsoft Edge / Windows Push';
      maxPayloadBytes = 4096;
    }

    return {
      valid: true,
      provider,
      origin: url.origin,
      hostname: host,
      platformHint,
      maxPayloadBytes
    };
  } catch (err) {
    return { valid: false, provider: 'Malformed URL', reason: err.message };
  }
}

export function interpretPushHttpResponse({
  statusCode,
  endpoint = '',
  headers = {},
  body = '',
  requestHeaders = {},
  payloadSizeBytes = 0
} = {}) {
  const endpointInfo = classifyPushEndpoint(endpoint);
  const findings = [];
  const normReqHeaders = Object.fromEntries(
    Object.entries(requestHeaders || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  // Check request headers required by RFC 8030 / RFC 8291
  if (Object.keys(normReqHeaders).length > 0) {
    if (normReqHeaders['ttl'] === undefined) {
      findings.push({
        id: 'req-missing-ttl',
        layer: 'push-delivery-http',
        status: 'fail',
        severity: 'high',
        message: 'Outgoing push request is missing the mandatory `TTL` (Time-To-Live) HTTP header (RFC 8030 Section 5.2).',
        fix: 'Include a `TTL` header in seconds (e.g., `TTL: 86400`) on every Web Push POST request.'
      });
    } else {
      findings.push({
        id: 'req-ttl-present',
        layer: 'push-delivery-http',
        status: 'pass',
        severity: 'info',
        message: `Request includes valid TTL header (${normReqHeaders['ttl']}s).`
      });
    }

    if (payloadSizeBytes > 0) {
      const encoding = normReqHeaders['content-encoding'];
      if (encoding !== 'aes128gcm' && encoding !== 'aesgcm') {
        findings.push({
          id: 'req-content-encoding',
          layer: 'push-delivery-http',
          status: 'fail',
          severity: 'critical',
          message: `Encrypted push payload requires Content-Encoding "aes128gcm" (RFC 8291), got "${encoding || 'none'}".`,
          fix: 'Encrypt the payload using RFC 8291 (`aes128gcm`) and set `Content-Encoding: aes128gcm`.'
        });
      }
      if (payloadSizeBytes > 4096) {
        findings.push({
          id: 'req-payload-size',
          layer: 'push-delivery-http',
          status: 'fail',
          severity: 'critical',
          message: `Payload size (${payloadSizeBytes} bytes) exceeds the 4096-byte Web Push limit.`,
          fix: 'Reduce notification payload below 4 KB or fetch large content inside the Service Worker.'
        });
      }
    }
  }

  const code = Number(statusCode);
  let diagnosis = {
    statusCode: code,
    provider: endpointInfo.provider,
    category: 'Unknown',
    deliveredToPushService: false,
    shouldRemoveSubscription: false,
    shouldRetryWithBackoff: false,
    explanation: '',
    fix: ''
  };

  if (code === 201 || code === 200 || code === 202) {
    diagnosis = {
      ...diagnosis,
      category: 'Accepted by Push Service',
      deliveredToPushService: true,
      explanation: `Push service (${endpointInfo.provider}) accepted the message for queued delivery. Note: HTTP ${code} confirms server-to-provider handoff, NOT that the user saw the notification on screen.`,
      fix: 'If the notification still does not appear on the device, inspect the Service Worker (`pushdiag sw`) for missing `event.waitUntil(showNotification)` or OS-level Do Not Disturb / permission suppression.'
    };
    findings.push({
      id: `http-status-${code}`,
      layer: 'push-delivery-http',
      status: 'pass',
      severity: 'info',
      message: diagnosis.explanation,
      fix: null
    });
  } else if (code === 400) {
    diagnosis = {
      ...diagnosis,
      category: 'Bad Request / Malformed Headers or Encryption',
      explanation: `HTTP 400 from ${endpointInfo.provider}: malformed request headers (missing TTL, invalid Urgency/Topic) or corrupted aes128gcm payload encryption.`,
      fix: 'Verify `TTL` header is a non-negative integer, `Topic` (if set) is <= 32 URL-safe chars, and payload encryption matches the subscription `p256dh` and `auth` keys.'
    };
    findings.push({
      id: 'http-status-400',
      layer: 'push-delivery-http',
      status: 'fail',
      severity: 'critical',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  } else if (code === 401 || code === 403) {
    diagnosis = {
      ...diagnosis,
      category: 'VAPID Authentication / Key Mismatch Failure',
      explanation: `HTTP ${code} from ${endpointInfo.provider}: VAPID signature verification failed, JWT "aud" origin does not match "${endpointInfo.origin || 'endpoint'}", JWT expired, or VAPID public key differs from the key used during pushManager.subscribe().`,
      fix: 'Run `pushdiag vapid --public-key <PUB> --private-key <PRIV>` and ensure JWT `aud` equals the exact origin `' + (endpointInfo.origin || 'https://push-provider-host') + '`.'
    };
    findings.push({
      id: `http-status-${code}`,
      layer: 'push-delivery-http',
      status: 'fail',
      severity: 'critical',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  } else if (code === 404 || code === 410) {
    diagnosis = {
      ...diagnosis,
      category: 'Subscription Expired or Unsubscribed (Gone)',
      shouldRemoveSubscription: true,
      explanation: `HTTP ${code} from ${endpointInfo.provider}: the push subscription is permanently dead (user revoked permission, cleared browser data, or uninstalled the iOS/Android PWA).`,
      fix: 'Immediately delete this subscription endpoint from your database and stop sending to it; re-subscribe the user on their next active session.'
    };
    findings.push({
      id: `http-status-${code}`,
      layer: 'push-delivery-http',
      status: 'fail',
      severity: 'high',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  } else if (code === 413) {
    diagnosis = {
      ...diagnosis,
      category: 'Payload Too Large',
      explanation: `HTTP 413 from ${endpointInfo.provider}: encrypted payload exceeds the maximum 4096-byte limit.`,
      fix: 'Trim the JSON payload below 3800 bytes (accounting for encryption header overhead).'
    };
    findings.push({
      id: 'http-status-413',
      layer: 'push-delivery-http',
      status: 'fail',
      severity: 'critical',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  } else if (code === 429 || (code >= 500 && code <= 599)) {
    diagnosis = {
      ...diagnosis,
      category: code === 429 ? 'Rate Limited (Too Many Requests)' : 'Push Service Temporary Outage',
      shouldRetryWithBackoff: true,
      explanation: `HTTP ${code} from ${endpointInfo.provider}: transient rate limit or upstream server error.`,
      fix: 'Honor the `Retry-After` response header and retry using exponential backoff with jitter. Do NOT delete the subscription.'
    };
    findings.push({
      id: `http-status-${code}`,
      layer: 'push-delivery-http',
      status: 'warn',
      severity: 'medium',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  } else {
    diagnosis = {
      ...diagnosis,
      category: 'Unrecognized HTTP Status',
      explanation: `Received unexpected HTTP status ${code} from push provider.`,
      fix: 'Inspect the response body and verify endpoint URL and network proxy settings.'
    };
    findings.push({
      id: `http-status-${code}`,
      layer: 'push-delivery-http',
      status: 'fail',
      severity: 'medium',
      message: diagnosis.explanation,
      fix: diagnosis.fix
    });
  }

  return {
    endpointInfo,
    diagnosis,
    findings
  };
}
