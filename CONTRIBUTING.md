# Contributing to PushDiag OSS

Thank you for helping improve Web Push diagnostics across browsers and mobile PWAs!

## Development Setup

PushDiag OSS is intentionally built with **zero external runtime dependencies** (requiring only Node.js 20+).

```bash
git clone https://github.com/yazedf4/pushdiag-oss.git
cd pushdiag-oss
npm test
node src/cli.js doctor --project ./examples
```

## Pull Request Checklist

- Ensure all tests pass (`npm test`).
- Add unit tests in `test/diagnostics.test.js` for any new diagnostic rule or browser quirk.
- Keep all modules dependency-free using standard Node.js built-ins (`node:crypto`, `node:fs`, `node:http`, `node:test`).
