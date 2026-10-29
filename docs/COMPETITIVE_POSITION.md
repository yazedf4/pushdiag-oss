# Competitive position — October 2026

PushDiag is **not** the first Web Push test tool. Publicly available alternatives include:

| Project | Example publicly documented scope | How PushDiag differs |
| --- | --- | --- |
| [PushForge](https://pushforge.draphy.org/) | Browser-based push playground, and a Web Push message builder. | PushDiag is local static diagnostics and VAPID signature verification; it does not send a real push. |
| [SignOps Web Push Tester](https://signops.dev/tools/web-push-test/) | Sends a real push to its own browser subscription and shows service response. | PushDiag scans developer-owned project files and GitHub Actions configurations, not provider-side delivery. |
| [pwa-check](https://github.com/pwa-today/pwa-check) | Broad installability, manifest, service worker and PWA health checks. | PushDiag specializes in protocol-level VAPID JWT / HTTP status diagnosis while retaining a small zero-dependency CLI. |
| [GoogleChromeLabs Web Push Testing Service](https://github.com/GoogleChromeLabs/web-push-testing-service) | Browser orchestration and integration tests. | PushDiag performs offline rule-based analysis with no Selenium requirements. |

These are observations based on published descriptions, not exhaustive feature audits. There is overlap; do not claim exclusivity or guaranteed superiority.
