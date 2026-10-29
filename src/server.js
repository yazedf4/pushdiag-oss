import http from 'node:http';
import { diagnose } from './diagnostics.js';
import { generateVapidKeys, inspectVapidKeys, inspectVapidJwt } from './vapid.js';
import { auditManifest } from './manifest.js';
import { analyzeServiceWorker } from './service-worker.js';
import { interpretPushHttpResponse, classifyPushEndpoint } from './http-analyzer.js';
import { getBrowserProbeScript } from './browser-probe.js';

// This dashboard is for localhost use only. It is not an authenticated hosted service.
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PushDiag OSS — Interactive Web Push & PWA Diagnostics</title>
  <style>
    :root {
      --bg: #0b0f19;
      --surface: #111827;
      --border: #1f2937;
      --text: #f9fafb;
      --muted: #9ca3af;
      --accent: #10b981;
      --danger: #ef4444;
      --warn: #f59e0b;
      --blue: #3b82f6;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding: 1.25rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(17, 24, 39, 0.85);
    }
    .brand { display: flex; align-items: center; gap: 0.75rem; }
    .badge {
      background: rgba(16, 185, 129, 0.15);
      color: var(--accent);
      border: 1px solid rgba(16, 185, 129, 0.4);
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 2rem;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 1.5rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
    }
    .card h2 { margin-top: 0; font-size: 1.1rem; color: #e5e7eb; }
    button {
      background: var(--accent);
      color: #052e16;
      border: none;
      border-radius: 8px;
      padding: 0.6rem 1rem;
      font-weight: 700;
      cursor: pointer;
      margin-right: 0.5rem;
      margin-bottom: 0.5rem;
    }
    button.secondary {
      background: #1f2937;
      color: var(--text);
      border: 1px solid #374151;
    }
    textarea, input {
      width: 100%;
      background: #030712;
      color: var(--text);
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 0.65rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    pre {
      background: #030712;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem;
      overflow-x: auto;
      font-size: 0.82rem;
      max-height: 360px;
    }
    .full-width { grid-column: 1 / -1; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1 style="margin:0;font-size:1.35rem;">PushDiag OSS</h1>
      <span class="badge">v1.1.0 · Zero-Dependency Diagnostics</span>
    </div>
    <div style="color:var(--muted);font-size:0.88rem;">github.com/yazedf4/pushdiag-oss</div>
  </header>
  <main>
    <section class="card">
      <h2>1. Live Browser & iOS PWA Capability Probe</h2>
      <p style="color:var(--muted);font-size:0.9rem;">Inspect this browser's real-time Service Worker, PushManager, Standalone mode, and Manifest state.</p>
      <button onclick="probeCurrentBrowser()">Scan This Browser Now</button>
      <button class="secondary" onclick="generateVapid()">Generate VAPID Keys</button>
    </section>

    <section class="card">
      <h2>2. Push HTTP Status & Endpoint Decoder</h2>
      <input id="endpointInput" placeholder="https://web.push.apple.com/QH..." value="https://web.push.apple.com/QH123456" />
      <input id="statusInput" type="number" placeholder="HTTP Status (e.g. 401, 410, 201)" value="403" />
      <button onclick="analyzeHttp()">Decode HTTP Failure</button>
    </section>

    <section class="card full-width">
      <h2>3. Full-Stack Diagnostic Output & Remediation Plan</h2>
      <pre id="outputBox">Click "Scan This Browser Now" or "Decode HTTP Failure" to view structured JSON diagnostics...</pre>
    </section>
  </main>
  <script>
    async function probeCurrentBrowser() {
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
      const snapshot = {
        secureContext: window.isSecureContext === true,
        serviceWorker: 'serviceWorker' in navigator,
        pushManager: 'PushManager' in window,
        notificationPermission: 'Notification' in window ? Notification.permission : 'unsupported',
        manifest: Boolean(document.querySelector('link[rel="manifest"]')),
        installed: isStandalone,
        platform: { isIOS, isStandalone }
      };
      const res = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot)
      });
      const report = await res.json();
      document.getElementById('outputBox').textContent = JSON.stringify(report, null, 2);
    }

    async function generateVapid() {
      const res = await fetch('/api/vapid/generate', { method: 'POST' });
      const keys = await res.json();
      document.getElementById('outputBox').textContent = JSON.stringify(keys, null, 2);
    }

    async function analyzeHttp() {
      const endpoint = document.getElementById('endpointInput').value;
      const statusCode = Number(document.getElementById('statusInput').value);
      const res = await fetch('/api/http', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, statusCode })
      });
      const report = await res.json();
      document.getElementById('outputBox').textContent = JSON.stringify(report, null, 2);
    }
  </script>
</body>
</html>`;

export function createDiagnosticServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    // Reject DNS rebinding and malicious cross-origin requests to localhost.
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) {
      res.writeHead(403); res.end('Local access only'); return;
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`) {
      res.writeHead(403); res.end('Cross-origin requests are disabled'); return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204); res.end(); return;
    }

    const sendJson = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data, null, 2));
    };

    const readJsonBody = async () => {
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
        const error = new Error('Content-Type must be application/json');
        error.statusCode = 415;
        throw error;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 256 * 1024) {
          const error = new Error('JSON payload exceeds 256 KiB');
          error.statusCode = 413;
          throw error;
        }
        chunks.push(chunk);
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        const error = new Error('Invalid JSON body');
        error.statusCode = 400;
        throw error;
      }
    };

    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(DASHBOARD_HTML);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(200, { status: 'ok', version: '1.1.0', service: 'pushdiag-oss' });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/vapid/generate') {
        sendJson(200, generateVapidKeys());
        return;
      }
      if (req.method === 'GET' && url.pathname === '/probe.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(getBrowserProbeScript());
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/diagnose') {
        const body = await readJsonBody();
        sendJson(200, diagnose(body));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/vapid/inspect') {
        const body = await readJsonBody();
        sendJson(200, inspectVapidKeys(body));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/http') {
        const body = await readJsonBody();
        sendJson(200, interpretPushHttpResponse(body));
        return;
      }
      sendJson(404, { error: 'Not Found' });
    } catch (err) {
      sendJson(err.statusCode || 400, { error: err.message });
    }
  });
}
