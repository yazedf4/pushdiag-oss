/**
 * PushDiag OSS — conservative, zero-dependency Service Worker source inspection.
 * This is lexical analysis, NOT full JavaScript parsing or runtime verification.
 * Unknown callback shapes are reported as warnings, never as verified passes.
 */

// Tokenize identifiers, punctuation, and quoted strings while ignoring comments.
// Template literals are treated as opaque, because their interpolations can contain
// arbitrary JavaScript and are outside the scope of this lightweight inspector.
function tokenize(source) {
  const tokens = [];
  let i = 0;
  const isWord = c => /[\w$]/.test(c || '');
  while (i < source.length) {
    const c = source[i], n = source[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && n === '/') {
      i += 2;
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      let value = '';
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          if (i + 1 < source.length) value += source[i + 1];
          i += 2;
          continue;
        }
        if (source[i] === quote) { i++; break; }
        value += source[i++];
      }
      tokens.push({ type: quote === '`' ? 'template' : 'string', value });
      continue;
    }
    if (isWord(c)) {
      let end = i + 1;
      while (isWord(source[end])) end++;
      tokens.push({ type: 'word', value: source.slice(i, end) });
      i = end;
      continue;
    }
    if (c === '=' && n === '>') { tokens.push({ type: 'punct', value: '=>' }); i += 2; continue; }
    tokens.push({ type: 'punct', value: c });
    i++;
  }
  return tokens;
}

function balancedEnd(tokens, open, left, right) {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i].value === left && tokens[i].type === 'punct') depth++;
    if (tokens[i].value === right && tokens[i].type === 'punct' && --depth === 0) return i;
  }
  return -1;
}

function listeners(tokens, name) {
  const results = [];
  for (let i = 0; i < tokens.length; i++) {
    // addEventListener('push', callback) — inspect only the callback argument.
    if (tokens[i].value === 'addEventListener' && tokens[i + 1]?.value === '(' &&
        tokens[i + 2]?.type === 'string' && tokens[i + 2].value === name &&
        tokens[i + 3]?.value === ',') {
      const end = balancedEnd(tokens, i + 1, '(', ')');
      if (end >= 0) results.push(tokens.slice(i + 4, end));
    }
    // self.onpush = callback — equivalent listener form.
    if (tokens[i].value === 'on' + name && tokens[i + 1]?.value === '=') {
      const eq = i + 2;
      const opener = tokens.findIndex((t, index) => index >= eq && t.value === '{');
      if (opener >= 0) {
        const end = balancedEnd(tokens, opener, '{', '}');
        if (end >= 0) { results.push(tokens.slice(eq, end + 1)); continue; }
      }
      results.push(tokens.slice(eq, Math.min(eq + 2, tokens.length)));
    }
  }
  return results;
}

function isInlineCallback(tokens) {
  return tokens.some(t => t.value === '=>') || tokens.some(t => t.value === 'function');
}

function includesCall(tokens, name) {
  return tokens.some((t, i) => t.value === name && t.type === 'word' && tokens[i + 1]?.value === '(');
}

function includesTryCatch(tokens) {
  return tokens.some((t, i) => t.value === 'try' && tokens[i + 1]?.value === '{') &&
    tokens.some((t, i) => t.value === 'catch' && ['(', '{'].includes(tokens[i + 1]?.value));
}

export function analyzeServiceWorker(swSource, { sourcePath = 'sw.js' } = {}) {
  const checks = [];
  const add = (id, status, severity, message, fix = null) => {
    checks.push({ id, layer: 'service-worker', status, severity, message, fix });
  };
  if (typeof swSource !== 'string' || swSource.trim().length === 0) {
    add('sw-source-nonempty', 'fail', 'critical', `Service Worker file (${sourcePath}) is empty or unreadable.`, 'Provide a JavaScript Service Worker file that handles the push event.');
    return { valid: false, summary: { passed: 0, warnings: 0, failed: 1, total: 1 }, checks };
  }

  const tokens = tokenize(swSource);
  const handlers = listeners(tokens, 'push');
  if (!handlers.length) {
    add('sw-push-listener', 'fail', 'critical', 'No statically recognizable push event listener detected.', 'Register a push listener using self.addEventListener("push", callback).');
  } else {
    add('sw-push-listener', 'pass', 'info', 'A push event listener registration was located in source code (not runtime-verified).');
  }

  // Any recognized inline push handler that misses waitUntil is an actionable fail.
  // A named callback may call helpers that lexical analysis cannot resolve: warn.
  const evaluate = (id, method, explanation, fix) => {
    if (!handlers.length) return add(id, 'fail', 'critical', `Unable to verify ${method} without a push handler.`, fix);
    const inline = handlers.filter(isInlineCallback);
    if (inline.some(t => !includesCall(t, method))) {
      // If a notification call is elsewhere, it might be reachable via a helper;
      // never call that a verified success or assert a definite failure.
      if (method === 'showNotification' && includesCall(tokens, method)) {
        return add(id, 'warn', 'medium', `${method} was not found directly inside every inline push handler; a helper may be involved. Static inspection cannot verify the call path.`, fix);
      }
      return add(id, 'fail', 'critical', `${method} is missing from at least one recognizable inline push handler.`, fix);
    }
    if (inline.length !== handlers.length) {
      return add(id, 'warn', 'medium', `${method} could not be verified for a named or indirect push callback.`, fix);
    }
    // Lexical presence inside the callback does not guarantee the code executes.
    add(id, 'pass', 'info', `${method}(...) is present inside each recognized push callback; runtime execution remains unverified.`);
  };

  evaluate('sw-wait-until', 'waitUntil', 'Missing waitUntil in push handler.', 'Inside the push handler, pass the async notification promise to event.waitUntil(...).');
  evaluate('sw-show-notification', 'showNotification', 'Missing showNotification in push handler.', 'Display a user-visible notification inside the push handler (or a demonstrably invoked helper).');

  const inlineBodies = handlers.filter(isInlineCallback).flat();
  const directJson = inlineBodies.some((t, i) => t.value === 'json' && inlineBodies[i + 1]?.value === '(' && inlineBodies[i - 1]?.value === '.');
  const textFallback = includesCall(inlineBodies, 'text');
  if (directJson && !includesTryCatch(inlineBodies) && !textFallback) {
    add('sw-payload-safe-parse', 'warn', 'medium', 'Push callback calls .json() without a recognizable try/catch or text fallback.', 'Catch malformed JSON and provide a safe fallback.');
  } else if (directJson) {
    add('sw-payload-safe-parse', 'pass', 'info', 'Push callback contains a candidate JSON parsing fallback; its behavior was not executed.');
  }

  if (listeners(tokens, 'notificationclick').length) {
    add('sw-notificationclick', 'pass', 'info', 'notificationclick handler registration detected.');
  } else {
    add('sw-notificationclick', 'warn', 'medium', 'No notificationclick handler detected.', 'Handle notificationclick and focus/open the intended PWA destination.');
  }
  if (listeners(tokens, 'pushsubscriptionchange').length) {
    add('sw-subscription-change', 'pass', 'info', 'pushsubscriptionchange handler registration detected.');
  } else {
    add('sw-subscription-change', 'warn', 'low', 'No pushsubscriptionchange handler detected; subscription updates may require renewal on next app launch.', 'Consider re-subscribing and syncing updated subscriptions on startup and after subscription changes.');
  }
  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;
  return { valid: failed === 0, summary: { passed, warnings, failed, total: checks.length }, checks };
}
