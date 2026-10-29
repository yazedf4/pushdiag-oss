# Voluntary real-device Web Push validation protocol

Status: **NOT EXECUTED**. This document is a test plan, **not a report of achieved compatibility**.

Goal: record reproducible failures and blind spots in PushDiag without confusing browser support with delivery guarantees.

Only test systems and devices you own or are explicitly authorized to use. Never publish subscription endpoints, tokens, private keys, exact device identifiers, or IP addresses. Redact URLs to synthetic examples.

| Field | Example of a safe value |
| --- | --- |
| Date | 2026-10-29 |
| OS and major version | iOS 26 / Android 16 |
| Browser and major version | Safari / Chrome |
| Installed via Home Screen? | yes/no |
| Notification permission | granted/denied/default |
| Subscription created | yes/no/unknown |
| Push service accepted request | HTTP status code or unknown |
| Notification observed on device | yes/no/unknown (personally observed) |
| Device backgrounded / locked | yes/no |
| Redacted reproduction | a synthetic code snippet without secrets |

## Sequence

1. Install and launch the test PWA under HTTPS. For iPhone, add to Home Screen and launch from its icon on a supported iOS version.
2. Record OS/browser major versions and initial permission state.
3. Grant notification permission from a user gesture and register a real push subscription in the PWA's own flow.
4. Send a test push using the PWA's authorized backend with its existing VAPID keys; **do not upload these keys to PushDiag**.
5. Record separately: push provider HTTP acceptance, recipient device display, and any user interaction.
6. Lock/background device and repeat. Distinguish delay, failure and unknown.
7. Run the PushDiag static audit on a **redacted fixture** of that PWA, then record whether its diagnosis was accurate.
8. Share only a sanitized reproduction in an issue. Do not imply success for devices not actually tested.

The protocol does not promise delivery and does not collect any test data by itself.
