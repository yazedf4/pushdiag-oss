import crypto from 'node:crypto';

/**
 * PushDiag OSS — RFC 8292 VAPID Keypair & JWT Cryptographic Auditor
 * Zero-dependency implementation using native node:crypto (P-256 / prime256v1).
 */

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(str) {
  if (typeof str !== 'string' || str.trim() === '') {
    throw new Error('Input must be a non-empty string');
  }
  if (/[^A-Za-z0-9\-_]/.test(str.trim())) {
    throw new Error('Contains invalid Base64URL characters (found standard Base64 +, /, or = padding)');
  }
  const padded = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

/**
 * Generates a fresh RFC 8292 compliant P-256 VAPID keypair.
 */
export function generateVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const publicKey = toBase64Url(ecdh.getPublicKey());
  const privateKey = toBase64Url(ecdh.getPrivateKey());
  return {
    publicKey,
    privateKey,
    curve: 'prime256v1 (NIST P-256)',
    publicKeyBytes: 65,
    privateKeyBytes: 32
  };
}

/**
 * Validates VAPID public and optional private keys, and checks cryptographic pairing.
 */
export function inspectVapidKeys({ publicKey, privateKey, subject } = {}) {
  const checks = [];
  const add = (id, status, severity, message, fix = null) => {
    checks.push({ id, layer: 'vapid-crypto', status, severity, message, fix });
  };

  let pubBuf = null;
  let privBuf = null;

  if (!publicKey) {
    add(
      'vapid-public-key-present',
      'fail',
      'critical',
      'Missing VAPID public key (applicationServerKey).',
      'Generate a VAPID keypair via `pushdiag vapid --generate` and pass the publicKey to pushManager.subscribe().'
    );
  } else {
    try {
      pubBuf = fromBase64Url(publicKey);
      if (pubBuf.length !== 65 || pubBuf[0] !== 0x04) {
        add(
          'vapid-public-key-format',
          'fail',
          'critical',
          `Invalid uncompressed P-256 public key: expected 65 bytes starting with 0x04, got ${pubBuf.length} bytes (first byte: 0x${pubBuf[0]?.toString(16) || '00'}).`,
          'Ensure the VAPID public key is an uncompressed P-256 point (65 bytes, Base64URL encoded without "=" padding).'
        );
      } else {
        add(
          'vapid-public-key-format',
          'pass',
          'info',
          'VAPID public key is a valid 65-byte uncompressed P-256 point (0x04 prefix) in Base64URL format.'
        );
      }
    } catch (err) {
      add(
        'vapid-public-key-encoding',
        'fail',
        'critical',
        `VAPID public key Base64URL decoding failed: ${err.message}.`,
        'Convert standard Base64 (+, /, =) to URL-safe Base64URL (- and _, without = padding).'
      );
    }
  }

  if (privateKey !== undefined && privateKey !== null && privateKey !== '') {
    try {
      privBuf = fromBase64Url(privateKey);
      if (privBuf.length !== 32) {
        add(
          'vapid-private-key-format',
          'fail',
          'critical',
          `Invalid P-256 private key scalar: expected 32 bytes, got ${privBuf.length} bytes.`,
          'Ensure the VAPID private key is a 32-byte raw P-256 private scalar encoded as Base64URL.'
        );
      } else {
        add(
          'vapid-private-key-format',
          'pass',
          'info',
          'VAPID private key is a valid 32-byte P-256 scalar in Base64URL format.'
        );
      }
    } catch (err) {
      add(
        'vapid-private-key-encoding',
        'fail',
        'critical',
        `VAPID private key Base64URL decoding failed: ${err.message}.`,
        'Encode private key in URL-safe Base64URL without padding.'
      );
    }

    if (pubBuf && pubBuf.length === 65 && privBuf && privBuf.length === 32) {
      try {
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.setPrivateKey(privBuf);
        const derivedPub = ecdh.getPublicKey();
        if (derivedPub.equals(pubBuf)) {
          add(
            'vapid-keypair-match',
            'pass',
            'info',
            'Cryptographic verification passed: private key mathematically derives the exact provided public key on P-256.'
          );
        } else {
          add(
            'vapid-keypair-match',
            'fail',
            'critical',
            'VAPID keypair mismatch! The provided privateKey does NOT correspond to the provided publicKey.',
            'Verify that your backend VAPID_PRIVATE_KEY matches the frontend applicationServerKey. Subscriptions created with an old public key will fail with HTTP 401/403.'
          );
        }
      } catch (err) {
        add(
          'vapid-keypair-match',
          'fail',
          'critical',
          `Failed to derive P-256 public key from private key: ${err.message}.`,
          'Regenerate a valid P-256 keypair using `pushdiag vapid --generate`.'
        );
      }
    }
  }

  if (subject !== undefined && subject !== null && subject !== '') {
    const isMailto = /^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(subject);
    let isHttps = false;
    try {
      const u = new URL(subject);
      isHttps = u.protocol === 'https:' && u.hostname !== 'localhost';
    } catch {
      isHttps = false;
    }

    if (isMailto || isHttps) {
      add(
        'vapid-subject-uri',
        'pass',
        'info',
        `VAPID subject "${subject}" complies with RFC 8292 (valid mailto: or https: contact URI).`
      );
    } else {
      add(
        'vapid-subject-uri',
        'fail',
        'high',
        `Invalid VAPID subject "${subject}". Apple Push and FCM reject non-RFC-8292 subjects (e.g. localhost or plain emails without mailto:).`,
        'Set VAPID subject to "mailto:admin@yourdomain.com" or "https://yourdomain.com".'
      );
    }
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  return {
    valid: checks.every(c => c.status === 'pass'),
    summary: { passed, failed: checks.length - passed, total: checks.length },
    checks
  };
}

/**
 * Inspects a RFC 8292 VAPID Authorization header or JWT token against an endpoint URL.
 */
export function inspectVapidJwt({ token, endpoint, publicKey, nowEpochSeconds = Math.floor(Date.now() / 1000) } = {}) {
  const checks = [];
  const add = (id, status, severity, message, fix = null) => {
    checks.push({ id, layer: 'vapid-jwt', status, severity, message, fix });
  };

  if (!token || typeof token !== 'string') {
    add('jwt-present', 'fail', 'critical', 'Missing VAPID JWT or Authorization header.', 'Pass a valid JWT or `vapid t=<jwt>, k=<pubKey>` header.');
    return { valid: false, checks, summary: { passed: 0, failed: 1, total: 1 } };
  }

  let rawJwt = token.trim();
  let verifiedSignature = false;
  const vapidHeaderMatch = rawJwt.match(/^vapid\s+t=([^,\s]+)\s*,\s*k=([^,\s]+)$/i);
  if (vapidHeaderMatch) {
    rawJwt = vapidHeaderMatch[1];
    publicKey = publicKey || vapidHeaderMatch[2];
    add('auth-header-scheme', 'pass', 'info', 'Authorization header matches RFC 8292 `vapid t=<jwt>, k=<key>` scheme.');
  }

  const parts = rawJwt.split('.');
  if (parts.length !== 3) {
    add('jwt-structure', 'fail', 'critical', `Malformed JWT: expected 3 dot-separated segments, found ${parts.length}.`, 'Construct a standard JWS compact serialization (header.payload.signature).');
    return { valid: false, checks, summary: { passed: checks.filter(c => c.status === 'pass').length, failed: 1, total: checks.length } };
  }

  try {
    const header = JSON.parse(fromBase64Url(parts[0]).toString('utf8'));
    const payload = JSON.parse(fromBase64Url(parts[1]).toString('utf8'));

    // Claims can be well formed while the signature is forged. Never call a JWT
    // cryptographically valid without verifying its ES256 JWS signature.
    if (!publicKey) {
      add('jwt-signature', 'warn', 'high', 'JWT signature NOT verified: no public key supplied.',
        'Pass --public-key <VAPID_PUBLIC_KEY> or an Authorization header with k=<key>.');
    } else {
      try {
        const pub = fromBase64Url(publicKey);
        const signature = fromBase64Url(parts[2]);
        if (pub.length !== 65 || pub[0] !== 4 || signature.length !== 64) {
          throw new Error('Expected a 65-byte uncompressed P-256 key and 64-byte JWS ES256 signature.');
        }
        const key = crypto.createPublicKey({
          key: {
            kty: 'EC', crv: 'P-256',
            x: toBase64Url(pub.subarray(1, 33)),
            y: toBase64Url(pub.subarray(33, 65))
          },
          format: 'jwk'
        });
        verifiedSignature = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`),
          { key, dsaEncoding: 'ieee-p1363' }, signature);
        add('jwt-signature', verifiedSignature ? 'pass' : 'fail',
          verifiedSignature ? 'info' : 'critical',
          verifiedSignature ? 'ES256 signature verified against supplied VAPID public key.' : 'ES256 signature verification FAILED.',
          verifiedSignature ? null : 'Ensure the VAPID public key matches the private signing key and that JWT bytes were not changed.');
      } catch (err) {
        add('jwt-signature', 'fail', 'critical', `Signature verification failed: ${err.message}`,
          'Supply a valid uncompressed P-256 public key and a correctly signed ES256 JWT.');
      }
    }

    if (header.alg === 'ES256') {
      add('jwt-alg', 'pass', 'info', 'JWT header uses mandatory ES256 (ECDSA P-256 + SHA-256) algorithm.');
    } else {
      add('jwt-alg', 'fail', 'critical', `Invalid JWT alg "${header.alg}". RFC 8292 strictly requires "ES256".`, 'Sign the VAPID JWT with ES256.');
    }

    if ( payload.aud ) {
      if (endpoint) {
        const expectedOrigin = new URL(endpoint).origin;
        if (payload.aud === expectedOrigin) {
          add('jwt-aud-match', 'pass', 'info', `JWT audience "${payload.aud}" matches push service origin.`);
        } else {
          add('jwt-aud-match', 'fail', 'critical', `JWT audience mismatch: token has aud="${payload.aud}", but endpoint origin is "${expectedOrigin}".`, `Set the JWT "aud" claim to the exact origin "${expectedOrigin}" (no trailing slash or path).`);
        }
      } else {
        add('jwt-aud-present', 'pass', 'info', `JWT audience claim present: "${payload.aud}".`);
      }
    } else {
      add('jwt-aud-present', 'fail', 'critical', 'Missing "aud" (Audience) claim in VAPID JWT payload.', 'Set "aud" to the origin (https://host) of the push subscription endpoint.');
    }

    if (typeof payload.exp !== 'number') {
      add('jwt-exp', 'fail', 'critical', 'Missing numeric "exp" (Expiration) timestamp in VAPID JWT.', 'Include an "exp" claim in seconds (within 24 hours of current time).');
    } else {
      const diff = payload.exp - nowEpochSeconds;
      if (diff <= 0) {
        add('jwt-exp', 'fail', 'critical', `VAPID JWT has expired (${Math.abs(diff)} seconds ago).`, 'Generate a fresh JWT before sending push requests.');
      } else if (diff > 86400) {
        add('jwt-exp', 'fail', 'high', `VAPID JWT expiration exceeds 24-hour maximum allowed by RFC 8292 (expires in ${Math.round(diff / 3600)}h).`, 'Set JWT "exp" to no more than 12-24 hours in the future (Math.floor(Date.now()/1000) + 43200).');
      } else {
        add('jwt-exp', 'pass', 'info', `JWT expiration is valid (expires in ${Math.round(diff / 60)} minutes).`);
      }
    }

    const subAudit = inspectVapidKeys({ publicKey: 'B' + 'A'.repeat(86), subject: payload.sub }).checks.find(c => c.id === 'vapid-subject-uri');
    if (!payload.sub) {
      add('jwt-sub', 'fail', 'high', 'Missing "sub" claim in VAPID JWT.', 'Add "sub": "mailto:you@domain.com" to the JWT payload.');
    } else if (subAudit && subAudit.status === 'pass') {
      add('jwt-sub', 'pass', 'info', subAudit.message);
    } else if (subAudit) {
      add('jwt-sub', 'fail', 'high', subAudit.message, subAudit.fix);
    }
  } catch (err) {
    add('jwt-decode', 'fail', 'critical', `Failed to decode JWT JSON segments: ${err.message}.`, 'Ensure JWT header and payload are valid UTF-8 JSON encoded as Base64URL.');
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  return {
    valid: verifiedSignature && checks.every(c => c.status === 'pass'),
    signatureVerified: verifiedSignature,
    summary: { passed, failed: checks.filter(c => c.status === 'fail').length, warnings: checks.filter(c => c.status === 'warn').length, total: checks.length },
    checks
  };
}
