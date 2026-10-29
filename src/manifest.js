/**
 * PushDiag OSS — Web App Manifest Auditor for iOS Safari (16.4+), Android Chrome, and Desktop PWAs.
 */

const STANDALONE_DISPLAY_MODES = new Set(['standalone', 'fullscreen', 'minimal-ui']);

export function auditManifest(manifestInput, { sourcePath = 'manifest.json' } = {}) {
  const checks = [];
  const add = (id, status, severity, message, fix = null) => {
    checks.push({ id, layer: 'manifest', status, severity, message, fix });
  };

  let manifest = manifestInput;
  if (typeof manifestInput === 'string') {
    try {
      manifest = JSON.parse(manifestInput);
      add('manifest-json-valid', 'pass', 'info', `Successfully parsed ${sourcePath} as valid JSON.`);
    } catch (err) {
      add(
        'manifest-json-valid',
        'fail',
        'critical',
        `Invalid JSON in ${sourcePath}: ${err.message}.`,
        'Fix syntax errors in manifest.json (remove trailing commas or comments).'
      );
      return {
        valid: false,
        iosReady: false,
        summary: { passed: 0, failed: 1, total: 1 },
        checks
      };
    }
  }

  if (!manifest || typeof manifest !== 'object') {
    add('manifest-object', 'fail', 'critical', 'Manifest root must be a JSON object.', 'Provide a valid Web App Manifest JSON object.');
    return { valid: false, iosReady: false, summary: { passed: 0, failed: 1, total: 1 }, checks };
  }

  // 1. Name / short_name
  const hasName = typeof manifest.name === 'string' && manifest.name.trim().length > 0;
  const hasShortName = typeof manifest.short_name === 'string' && manifest.short_name.trim().length > 0;
  if (hasName || hasShortName) {
    add('manifest-name', 'pass', 'info', `App identity configured (${manifest.name || manifest.short_name}).`);
  } else {
    add(
      'manifest-name',
      'fail',
      'high',
      'Manifest is missing both "name" and "short_name".',
      'Add `"name"` and `"short_name"` fields to manifest.json so iOS and Android can install the Home Screen Web App.'
    );
  }

  // 2. Display mode (CRITICAL for iOS Safari Web Push!)
  const display = manifest.display;
  if (display === 'standalone' || display === 'fullscreen') {
    add(
      'manifest-display-ios',
      'pass',
      'info',
      `Manifest display mode is "${display}", satisfying iOS/iPadOS 16.4+ Home Screen Web Push requirement.`
    );
  } else if (display === 'minimal-ui') {
    add(
      'manifest-display-ios',
      'warn',
      'medium',
      'Manifest display mode is "minimal-ui". While supported on Android, iOS Safari strongly expects "standalone" or "fullscreen" for reliable Home Screen Push.',
      'Set `"display": "standalone"` in manifest.json for full iOS Safari Web Push compatibility.'
    );
  } else {
    add(
      'manifest-display-ios',
      'fail',
      'critical',
      `Manifest display is "${display || 'browser (default)'}". iOS Safari completely disables PushManager unless the app is installed to Home Screen with "display": "standalone" or "fullscreen".`,
      'Add `"display": "standalone"` to manifest.json and ensure users install the PWA via Share -> Add to Home Screen on iOS.'
    );
  }

  // 3. start_url
  if (typeof manifest.start_url === 'string' && manifest.start_url.trim().length > 0) {
    add('manifest-start-url', 'pass', 'info', `Manifest defines start_url ("${manifest.start_url}").`);
  } else {
    add(
      'manifest-start-url',
      'fail',
      'high',
      'Manifest is missing "start_url". Installability prompts on Android Chrome and iOS Home Screen launching may fail.',
      'Add `"start_url": "/"` (or your entry route) to manifest.json.'
    );
  }

  // 4. Icons check (192x192 and 512x512 PNG)
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const sizesSet = new Set();
  for (const icon of icons) {
    if (typeof icon?.sizes === 'string') {
      icon.sizes.split(/\s+/).forEach(s => sizesSet.add(s.toLowerCase()));
    }
  }
  if (sizesSet.has('192x192') && sizesSet.has('512x512')) {
    add('manifest-icons', 'pass', 'info', 'Manifest includes standard 192x192 and 512x512 app icons required for PWA installation and notification badges.');
  } else {
    add(
      'manifest-icons',
      'fail',
      'medium',
      `Manifest icons are missing standard PWA dimensions (found: ${Array.from(sizesSet).join(', ') || 'none'}).`,
      'Include at least 192x192 and 512x512 PNG icons in the `"icons"` array of manifest.json.'
    );
  }

  // 5. Legacy gcm_sender_id warning
  if (manifest.gcm_sender_id && manifest.gcm_sender_id !== '103953800507') {
    add(
      'manifest-legacy-gcm',
      'warn',
      'low',
      `Manifest contains legacy "gcm_sender_id": "${manifest.gcm_sender_id}". Modern Web Push uses VAPID applicationServerKey instead of GCM sender IDs.`,
      'Remove custom "gcm_sender_id" and pass your VAPID publicKey to `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.'
    );
  }

  const passed = checks.filter(c => c.status === 'pass').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  const iosReady = (display === 'standalone' || display === 'fullscreen') && (hasName || hasShortName) && failed === 0;

  return {
    valid: failed === 0,
    iosReady,
    summary: {
      passed,
      warnings: checks.filter(c => c.status === 'warn').length,
      failed,
      total: checks.length
    },
    checks
  };
}
