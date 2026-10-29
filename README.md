# PushDiag OSS

**Zero-dependency, local-first Web Push & PWA diagnostic toolkit for VAPID, service workers, manifests, and browser capability snapshots.**

[![License: MIT](https://img.shields.io/badge/License-MIT-10b981.svg)](./LICENSE)
[![Node.js >= 20](https://img.shields.io/badge/node-%3E%3D20.0.0-3b82f6.svg)](https://nodejs.org)
[![CI](https://github.com/yazedf4/pushdiag-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/yazedf4/pushdiag-oss/actions/workflows/ci.yml)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](./package.json)

---

## Why PushDiag OSS?

Existing Web Push libraries (such as `web-push`) focus on **sending** notifications, while playground tools only test basic delivery. Yet in production—especially on **iOS/iPadOS 16.4+ Home Screen PWAs**, **Android Chrome**, and **Firefox**—notifications frequently fail silently across five distinct layers:

1. **Client & PWA Environment Layer**: Missing HTTPS, unrequested user gesture permissions, or iOS Safari running in a regular browser tab instead of `display: standalone` Home Screen mode.
2. **Web App Manifest Layer**: Missing `"display": "standalone"`, missing `start_url`, or incomplete icon matrices (`192x192` / `512x512`).
3. **Service Worker Lifecycle Layer**: Missing `event.waitUntil()` causing worker termination before `showNotification()` resolves, or unguarded `event.data.json()` crashes on plain-text test pushes.
4. **RFC 8292 VAPID Cryptographic Layer**: Base64 vs. Base64URL padding errors, mismatched P-256 public/private keypairs, expired JWTs, or `aud` origin mismatches (`401` / `403`).
5. **RFC 8030 / RFC 8291 Push Service HTTP Layer**: Misinterpreting `201 Created` as device display, failing to prune `410 Gone` subscriptions, or missing mandatory `TTL` and `aes128gcm` headers.

**PushDiag OSS** performs local static checks and optional browser capability snapshots with **zero external npm dependencies**. It does **not** send push notifications, independently verify their delivery, or perform a complete end-to-end delivery test.

---

## Quick Start

Requires **Node.js 20+**. No `npm install` of third-party packages is needed!

```bash
# 1. Run the automated test suite
npm test

# 2. Run a full-stack project audit (Manifest + Service Worker + Capabilities)
node src/cli.js doctor --project ./examples --markdown

# 3. Generate a fresh RFC 8292 P-256 VAPID keypair
node src/cli.js vapid --generate

# 4. Launch the interactive Web UI Dashboard & Live Browser Probe server
node src/cli.js serve --port 3400
```

---

## CLI Commands Reference

### 1. Full Project Doctor (`pushdiag doctor`)
Scans a directory containing `manifest.json`, `sw.js`, and/or `capabilities.json` and outputs a unified JSON or Markdown diagnostic report:

```bash
node src/cli.js doctor --project ./examples --strict
node src/cli.js doctor --project ./examples --markdown
```

### 2. Cryptographic VAPID Keypair & JWT Auditor (`pushdiag vapid` / `pushdiag jwt`)
Mathematically verifies via `node:crypto` (`prime256v1`) that your private scalar derives your exact uncompressed 65-byte public key, and validates RFC 8292 `mailto:` / `https:` subjects:

```bash
node src/cli.js vapid --public-key <BASE64URL_PUB> --private-key <BASE64URL_PRIV> --subject mailto:admin@domain.com
node src/cli.js jwt --token "vapid t=eyJ..., k=BEl..." --endpoint "https://web.push.apple.com/QH123"
# For a bare JWT, also provide --public-key <BASE64URL_PUB> to verify its signature
```

### 3. Web App Manifest iOS & Android Auditor (`pushdiag manifest`)
```bash
node src/cli.js manifest --file ./examples/manifest.json --strict
```

### 4. Service Worker Static Code Analyzer (`pushdiag sw`)
```bash
node src/cli.js sw --file ./examples/sw.js --strict
```

### 5. Push Provider HTTP Response Decoder (`pushdiag http`)
Classifies endpoints (`FCM`, `Apple APNs Web Push`, `Mozilla Autopush`, `WNS`) and translates status codes (`201`, `400`, `401`, `403`, `404`, `410`, `413`, `429`) into concrete backend actions:

```bash
node src/cli.js http --status 403 --endpoint "https://web.push.apple.com/QHabc123" --ttl 3600
```

### 6. Live Browser Probe (`pushdiag probe`)
Outputs a self-contained JavaScript snippet you can paste into Mobile Safari / Chrome DevTools (or load via `<script src="http://localhost:3400/probe.js">`) to extract live browser capabilities:

```bash
node src/cli.js probe
```

---

## Programmatic API (ESM)

```javascript
import {
  diagnose,
  generateVapidKeys,
  inspectVapidKeys,
  auditManifest,
  analyzeServiceWorker,
  interpretPushHttpResponse
} from 'pushdiag-oss';

const keys = generateVapidKeys();
const report = diagnose({
  secureContext: true,
  serviceWorker: true,
  pushManager: true,
  notificationPermission: 'granted',
  manifest: true,
  installed: true,
  vapid: { ...keys, subject: 'mailto:ops@example.com' }
});

console.log(report.summary); // { passed: 9, warnings: 0, failed: 0, total: 9 }
```

---

## Maintainer & License

Created and maintained by **[yazedf4](https://github.com/yazedf4)** under the [MIT License](./LICENSE).


## Trust and verification boundaries

- `doctor` audits project files. It **never** assumes a real browser supports Web Push when no capability snapshot exists.
- The `jwt` command checks ES256 signatures **only** when a public VAPID key is supplied (or included in `vapid t=..., k=...`). Without the key, it reports an unverified signature and `valid: false`.
- HTTP 201/202 from a push service confirms acceptance, **not** display on the recipient's device. This toolkit does not independently verify delivery.
- Static service worker inspection is heuristic, not an AST parser or runtime execution proof.
- `serve` is bound to `127.0.0.1`, with cross-origin requests disabled. Do not expose it to a public network or reverse proxy.
- Never paste a private VAPID key, JWT, or subscription endpoint into an issue or publicly shared report.

## Reproducible local demonstrations

```bash
# No capability file present: static checks only, with explicit inputs
node src/cli.js doctor --project ./examples --markdown
# Fail fast on a deliberately broken iOS PWA snapshot
node src/cli.js check --input ./examples/ios-broken-pwa.json --strict
# Run on an actual PWA's local public/ tree
node src/cli.js doctor --project /path/to/your/pwa --strict
```

See [security policy](./SECURITY.md) and [contribution guide](./CONTRIBUTING.md). No real-world adoption or cross-device notification delivery is claimed without published evidence.

## Use in GitHub Actions (no npm registry required)

PushDiag can also be called as a composite action from a PWA repository:

```yaml
name: PWA diagnostics
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: yazedf4/pushdiag-oss@main
        with:
          project: '.'
          strict: 'true'
```

For production automation, **pin the action to a reviewed commit SHA**, not `@main`. The action only reads local files and posts a Markdown audit to the workflow run summary. It never sends Web Push messages.

See [validation scope](./docs/VALIDATION_SCOPE.md) and [maintainer roadmap](./docs/MAINTAINER_ROADMAP.md).
