#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { diagnose } from './diagnostics.js';
import { generateVapidKeys, inspectVapidKeys, inspectVapidJwt } from './vapid.js';
import { auditManifest } from './manifest.js';
import { analyzeServiceWorker } from './service-worker.js';
import { interpretPushHttpResponse } from './http-analyzer.js';
import { getBrowserProbeScript } from './browser-probe.js';
import { createDiagnosticServer } from './server.js';

const HELP_TEXT = `
PushDiag OSS v1.1.0 — Open-Source Web Push & PWA Diagnostics Engine
Repository: https://github.com/yazedf4/pushdiag-oss

Usage:
  pushdiag [check] --input <capabilities.json> [--strict] [--markdown]
  pushdiag doctor  --project <dir> [--strict] [--markdown]
  pushdiag vapid   [--generate] [--public-key <key>] [--private-key <key>] [--subject <uri>]
  pushdiag jwt     --token <jwt-or-auth-header> [--endpoint <push-url>] [--public-key <key>]
  pushdiag manifest --file <manifest.json> [--strict]
  pushdiag sw      --file <service-worker.js> [--strict]
  pushdiag http    --status <code > [--endpoint <url>] [--ttl <seconds>]
  pushdiag probe   [--postback <url>]
  pushdiag serve   [--port <3400>]

Input keys for snapshot check:
  secureContext, serviceWorker, pushManager, notificationPermission, manifest, installed
`.trim();

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--') ? args[idx + 1] : null;
}

function formatMarkdownReport(report) {
  const lines = [
    `# PushDiag OSS Diagnostic Report (v${report.version || '1.0.0'})`,
    '',
    `**Summary**: ${report.summary.passed}/${report.summary.total} passed | ${report.summary.warnings || 0} warnings | ${report.summary.failed || 0} failed`,
    '',
    '| Status | Layer | Check ID | Finding & Remediation |',
    '| :--- | :--- | :--- | :--- |'
  ];
  for (const c of report.checks || []) {
    const icon = c.status === 'pass' ? 'PASS' : c.status === 'warn' ? 'WARN' : 'FAIL';
    const detail = c.fix ? `${c.message} **Fix:** ${c.fix}` : c.message;
    lines.push(`| **${icon}** | \`${c.layer || 'core'}\` | \`${c.id}\` | ${detail} |`);
  }
  return lines.join('\n');
}

async function fileExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const subcommand = args[0].startsWith('--') ? 'check' : args[0];
  const strict = args.includes('--strict');
  const asMarkdown = args.includes('--markdown');

  try {
    if (subcommand === 'check') {
      const inputPath = getArg(args, '--input');
      if (!inputPath) {
        console.error('Missing --input file');
        process.exit(2);
      }
      const data = JSON.parse(await readFile(inputPath, 'utf8'));
      const report = diagnose(data);
      console.log(asMarkdown ? formatMarkdownReport(report) : JSON.stringify(report, null, 2));
      if (strict && report.summary.failed > 0) process.exitCode = 1;
      return;
    }

    if (subcommand === 'vapid') {
      if (args.includes('--generate')) {
        console.log(JSON.stringify(generateVapidKeys(), null, 2));
        return;
      }
      const publicKey = getArg(args, '--public-key');
      const privateKey = getArg(args, '--private-key');
      const subject = getArg(args, '--subject');
      const report = inspectVapidKeys({ publicKey, privateKey, subject });
      console.log(JSON.stringify(report, null, 2));
      if (strict && !report.valid) process.exitCode = 1;
      return;
    }

    if (subcommand === 'jwt') {
      const token = getArg(args, '--token');
      const endpoint = getArg(args, '--endpoint');
      const publicKey = getArg(args, '--public-key');
      const report = inspectVapidJwt({ token, endpoint, publicKey });
      console.log(JSON.stringify(report, null, 2));
      if (strict && !report.valid) process.exitCode = 1;
      return;
    }

    if (subcommand === 'manifest') {
      const filePath = getArg(args, '--file') || getArg(args, '--input');
      if (!filePath) {
        console.error('Missing --file <manifest.json>');
        process.exit(2);
      }
      const raw = await readFile(filePath, 'utf8');
      const report = auditManifest(raw, { sourcePath: filePath });
      console.log(JSON.stringify(report, null, 2));
      if (strict && !report.valid) process.exitCode = 1;
      return;
    }

    if (subcommand === 'sw') {
      const filePath = getArg(args, '--file') || getArg(args, '--input');
      if (!filePath) {
        console.error('Missing --file <sw.js>');
        process.exit(2);
      }
      const raw = await readFile(filePath, 'utf8');
      const report = analyzeServiceWorker(raw, { sourcePath: filePath });
      console.log(JSON.stringify(report, null, 2));
      if (strict && !report.valid) process.exitCode = 1;
      return;
    }

    if (subcommand === 'http') {
      const statusCode = Number(getArg(args, '--status') || 0);
      const endpoint = getArg(args, '--endpoint') || '';
      const ttl = getArg(args, '--ttl');
      const requestHeaders = ttl !== null ? { TTL: ttl } : {};
      const report = interpretPushHttpResponse({ statusCode, endpoint, requestHeaders });
      console.log(JSON.stringify(report, null, 2));
      if (strict && statusCode >= 400) process.exitCode = 1;
      return;
    }

    if (subcommand === 'probe') {
      const postbackUrl = getArg(args, '--postback');
      console.log(getBrowserProbeScript({ postbackUrl }));
      return;
    }

    if (subcommand === 'doctor') {
      const projectDir = getArg(args, '--project') || '.';
      // Static project inspection must never fake a live browser capability pass.
      // Accept common PWA layouts while keeping diagnostic inputs explicit.
      const locate = async paths => {
        for (const rel of paths) {
          const candidate = path.join(projectDir, rel);
          if (await fileExists(candidate)) return candidate;
        }
        return null;
      };
      const capFile = await locate(['capabilities.json']);
      const manifestFile = await locate(['manifest.json', 'manifest.webmanifest', 'public/manifest.json', 'public/manifest.webmanifest']);
      const swFile = await locate(['sw.js', 'service-worker.js', 'public/sw.js', 'public/service-worker.js', 'src/sw.js', 'src/service-worker.js']);
      if (!capFile && !manifestFile && !swFile) {
        console.error('No manifest, service worker, or capability snapshot found. Try --project <path>.');
        process.exitCode = 2;
        return;
      }
      const snapshot = capFile
        ? JSON.parse(await readFile(capFile, 'utf8'))
        : { skipCapabilities: true };
      if (manifestFile) snapshot.manifestData = JSON.parse(await readFile(manifestFile, 'utf8'));
      if (swFile) snapshot.serviceWorkerCode = await readFile(swFile, 'utf8');
      const report = diagnose(snapshot);
      report.inputs = { capabilities: capFile, manifest: manifestFile, serviceWorker: swFile };
      report.disclaimer = capFile
        ? 'Capability snapshot comes from a file, not a live browser check; passing tests never prove push delivery.'
        : 'Static-file audit only. Live browser capabilities and push delivery were not tested.';
      console.log(asMarkdown ? formatMarkdownReport(report) : JSON.stringify(report, null, 2));
      if (strict && report.summary.failed > 0) process.exitCode = 1;
      return;
    }

    if (subcommand === 'serve') {
      const port = Number(getArg(args, '--port') || 3400);
      const server = createDiagnosticServer();
      server.listen(port, '127.0.0.1', () => {
        console.log(`PushDiag OSS Interactive Dashboard listening on http://localhost:${port}`);
      });
      return;
    }

    console.error(`Unknown subcommand "${subcommand}". Run \`pushdiag --help\` for usage.`);
    process.exit(2);
  } catch (err) {
    console.error('Unable to process input:', err.message);
    process.exitCode = 2;
  }
}

main();
