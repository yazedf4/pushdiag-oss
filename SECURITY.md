# Security Policy

## Reporting a Vulnerability

If you discover a security issue in **PushDiag OSS** (especially within the RFC 8292 VAPID cryptographic verification or local diagnostic HTTP server), please report it privately via GitHub Security Advisories at:
https://github.com/yazedf4/pushdiag-oss/security/advisories

## Best Practices Enforced by PushDiag OSS

1. **Zero Secret Leakage**: Never commit `VAPID_PRIVATE_KEY` or active push subscription endpoints (`endpoint`, `p256dh`, `auth`) to public repositories or issue trackers.
2. **Offline Cryptographic Verification**: `pushdiag vapid` verifies P-256 keypair derivation locally using Node's native `node:crypto` module without transmitting keys over the network.
