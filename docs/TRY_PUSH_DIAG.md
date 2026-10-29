# Try PushDiag OSS in 5 minutes (maintainer invite)

PushDiag is a **local, static diagnostic tool**, not a real push sender. We welcome reproducible experience reports, whether it finds an issue or misses one.

## Prerequisites and privacy

- Node.js 20+ and a PWA project you own or have permission to test.
- Do **not** paste push subscription endpoints, VAPID private keys, JWTs, auth headers, user identifiers, or proprietary source code into public issues.
- The CLI runs locally with no dependency install and no telemetry. An optional OpenAI patch function exists but is not invoked by the commands below.

## Try it

```bash
git clone https://github.com/yazedf4/pushdiag-oss.git
cd pushdiag-oss
npm test
node src/cli.js doctor --project ./examples --markdown
node src/cli.js sw --file ./examples/sw.js --strict
# Replace with a local PWA directory that you are authorized to audit
node src/cli.js doctor --project /path/to/your/pwa --markdown
```

The action is also usable from a separate PWA repository through `uses: yazedf4/pushdiag-oss@<reviewed-commit-sha>`. See the README for an example. Action audits files on the GitHub runner, not in a real browser.

## Help improve this project

Open a [bug report](https://github.com/yazedf4/pushdiag-oss/issues/new/choose) with a **synthetic minimal reproduction**, the check ID, expected and actual status, your environment, and the reason the finding matters. For positive feedback, explain what you tested and whether a diagnostic led to an actual fix, without posting secrets.

Do not count tests, forks, stars, reports or adoption that has not happened. We only report explicitly verifiable experience.

## Known limits

- The service worker inspector uses limited lexical analysis, not a full JavaScript parser or a JavaScript runtime. It does not trace helper calls or external modules. For ambiguous cases it warns rather than asserting success.
- A passing `doctor` report does not establish notification permission, a live subscription, push service acceptance, or display on a real device.
- This is intentionally not a hosted service and does not collect usage analytics.
