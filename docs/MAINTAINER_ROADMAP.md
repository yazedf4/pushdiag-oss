# Maintainer roadmap (evidence-based)

Owner/core maintainer: [@yazedf4](https://github.com/yazedf4).

## Already implemented (source/test evidence)

- Local Node.js CLI for diagnostic snapshots, manifests, service workers, VAPID, and HTTP status.
- Explicit JWT signature validation if a public key is provided.
- Local-only diagnostic dashboard, with basic origin/host and payload-size boundaries.
- GitHub CI for automated regression tests and example self-audits.
- Composite GitHub Action for running the static doctor inside other projects.

## Planned v1.3.0 work (open, not yet shipped)

These issues describe genuine limitations with reproducible acceptance criteria. The project is volunteer-maintained: timelines are not guaranteed.

| Issue | Problem to solve | Status |
| --- | --- | --- |
| [#5](https://github.com/yazedf4/pushdiag-oss/issues/5) | Local manifest icon declarations can refer to files that do not exist; resolve safe local paths without claiming remote asset verification. | Open / enhancement |
| [#6](https://github.com/yazedf4/pushdiag-oss/issues/6) | CI findings need stable structured output and safely escaped optional GitHub annotations. | Open / enhancement |
| [#7](https://github.com/yazedf4/pushdiag-oss/issues/7) | Markdown reports can be malformed by unescaped input text such as pipes and line breaks. | Open / good first issue |
| [#2](https://github.com/yazedf4/pushdiag-oss/issues/2) | Lexical Service Worker analysis still cannot verify named/indirect callback call graphs. | Open / enhancement |
| [#3](https://github.com/yazedf4/pushdiag-oss/issues/3) | Reproducible permissioned physical-device Web Push testing has not yet been performed. | Open / help wanted |

No work is considered complete without a reviewed change and a passing automated test or reproducible validation record.

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
