# Changelog

## [1.0.0] - 2026-10-29

### Added
- **Multi-Layer Diagnostics Engine (`src/diagnostics.js`)**: Unified 5-layer Web Push inspection covering Client Capabilities, iOS/iPadOS 16.4+ Standalone PWA checks, Web App Manifest validation, Service Worker static analysis, VAPID cryptography, and HTTP delivery decoding.
- **RFC 8292 VAPID Cryptographic Auditor (`src/vapid.js`)**: Native `node:crypto` P-256 keypair generator, Base64URL validator, mathematical public-from-private key derivation check, and JWT (`ES256`, `aud`, `exp`, `sub`) inspector.
- **Service Worker Static Analyzer (`src/service-worker.js`)**: Detects missing `event.waitUntil()`, missing `showNotification()`, unsafe `event.data.json()` calls, and missing `notificationclick` / `pushsubscriptionchange` handlers.
- **Push Service HTTP Decoder (`src/http-analyzer.js`)**: Classifies FCM, Apple Web Push (`web.push.apple.com`), Mozilla Autopush, and WNS endpoints and explains HTTP `201`, `400`, `401`, `403`, `404`, `410`, `413`, and `429` responses.
- **Injectable Browser Probe (`src/browser-probe.js`) & Interactive Dashboard (`src/server.js`)**: Live browser inspection and local web UI (`pushdiag serve`).
- **AI Remediation Advisor (`src/ai-advisor.js`)**: Deterministic root-cause remediation planner with optional OpenAI Codex API patch generation.

## [0.1.0] - Initial Prototype
- Basic 6-rule capability JSON snapshot checker.

## Unreleased — v1.1.0 candidate

- Verify ES256 JWT signatures against VAPID public keys and explicitly report unverified tokens.
- Prevent the project doctor from fabricating browser capability results.
- Support common public/ layouts for static PWA files.
- Restrict local diagnostic server access and cap JSON request bodies.
- Add regression tests and clarify validation-versus-delivery limitations.
