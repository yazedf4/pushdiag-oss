# Validation boundary and evidence

PushDiag is a **static analysis and developer diagnostics toolkit**, not an OS-level push monitor or delivery receipt service.

| Signal | Can establish | Cannot establish |
| --- | --- | --- |
| `doctor` | Specific files contain configured manifest/worker patterns | That a browser ever loaded the files |
| Live browser probe | Browser API and permission state at the time it was run | Server acceptance or notification display |
| ES256 JWT checker | Cryptographic signature validity given a trusted VAPID public key and claim checks | Push provider acceptance or trust in the supplied key's ownership |
| Push HTTP decoder | Likely meaning of a reported status code | Device delivery, display, or user attention |
| GitHub Action | The static audit runs on a reproducible CI runner | iOS/Android physical-device success |

Use a supported physical device and a real push provider to establish actual notification behavior. Keep test results and personal tokens out of public tickets.

## Reproducible tests

`npm test` exercises core checks, signed and forged ES256 cases, CLI file discovery, and local HTTP security boundaries. `node src/cli.js doctor --project ./examples --strict` scans provided examples. Both are run on GitHub Actions for proposed changes.

## Limits and future work

- Service Worker scanning uses a limited lexical tokenizer to identify inline listener callbacks. It is not an AST or call-graph parser: named handlers, imported helpers, template-interpolated code, dynamic listener registration and complex syntax can be uncertain. The tool must warn rather than claim a verified pass when it cannot establish scope.
- Browser probe is read-only; it does not request notification permission or subscribe to pushes.
- No automated real-device/browser push-delivery tests are included.
- Development/runtime support should be validated on supported Node versions and actual devices before claims of compatibility.
