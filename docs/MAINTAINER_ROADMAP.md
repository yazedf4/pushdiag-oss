# Maintainer roadmap (evidence-based)

Owner/core maintainer: [@yazedf4](https://github.com/yazedf4).

## Already implemented (source/test evidence)

- Local Node.js CLI for diagnostic snapshots, manifests, service workers, VAPID, and HTTP status.
- Explicit JWT signature validation if a public key is provided.
- Local-only diagnostic dashboard, with basic origin/host and payload-size boundaries.
- GitHub CI for automated regression tests and example self-audits.
- Composite GitHub Action for running the static doctor inside other projects.

## Open work: prioritize verified usefulness

1. Validate against **three permissioned real-world PWAs**, recording only redacted diagnoses and fixes.
2. Gather honest feedback from developers who try the CLI/Action; triage bug reports and improve rules.
3. Continue improving conservative Service Worker analysis beyond lexical tokenization, including helper call graphs; retain no-false-success safeguards.
4. Build opt-in integration tests against a real push service, with explicit authorization and safe test data.
5. Document tested iOS/Android behavior without implying delivery guarantees.

## Transparent project impact

This repository is new. At publication, **usage, external adoption, npm downloads, outside contributors, and physical-device tests are not established**. Please do not infer those from CI runs or file counts.

Track genuine GitHub activity (issues, PR reviews, releases, adoption reports), publish changelogs, and never create artificial stars or activity.

See [tester onboarding](./TRY_PUSH_DIAG.md), [real-device validation protocol](./REAL_DEVICE_TEST_PROTOCOL.md) and [public evidence ledger](./ADOPTION_EVIDENCE.md).
