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
3. Improve service worker parsing so heuristics do not imply AST-level certainty.
4. Build opt-in integration tests against a real push service, with explicit authorization and safe test data.
5. Document tested iOS/Android behavior without implying delivery guarantees.

## Transparent project impact

This repository is new. At publication, **usage, external adoption, npm downloads, outside contributors, and physical-device tests are not established**. Please do not infer those from CI runs or file counts.

Track genuine GitHub activity (issues, PR reviews, releases, adoption reports), publish changelogs, and never create artificial stars or activity.
