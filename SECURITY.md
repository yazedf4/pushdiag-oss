# Security Policy

Report vulnerabilities privately using [GitHub Security Advisories](https://github.com/yazedf4/pushdiag-oss/security/advisories). Do not post credentials, push subscription endpoints, or private VAPID keys in public issues.

## Scope and threat model

- `pushdiag serve` is designed **only for localhost**, not as an internet-facing service. It binds to `127.0.0.1`, rejects foreign Host and Origin values, and does not enable CORS.
- The dashboard can generate VAPID private keys locally for experiments. Treat these as secret material. Do not screenshot or share them.
- CLI input files may contain sensitive information; minimize and redact snapshots before sharing them.
- Static analysis and claims inspection cannot prove that a device displayed a notification. JWT claims are not trusted unless the ES256 signature is verified using the matching public key.
- Optional OpenAI integration is opt-in and sends diagnostic findings to an external API. Do not include secret material in those findings.

Please include a minimal reproduction with **redacted** inputs and expected/actual behavior when reporting bugs.
