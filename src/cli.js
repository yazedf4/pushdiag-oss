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
PushDiag OSS v1.0.0 — Open-Source Web Push & PWA Diagnostics Engine
Repository: https://github.com/yazedf4/pushdiag-oss

Usage:
  pushdiag [check] --input <capabilities.json> [--strict] [--markdown]
  pushdiag doctor  --project <dir> [--strict] [--markdown]
  pushdiag vapid   [--generate] [--public-key <key>] [--private-key <key>] [--subject <uri>]
  pushdiag jwt     --token <jwt-or-auth-header> [--endpoint <push-url>]
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
      const report = inspectVapidJwt({ token, endpoint });
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
      const capFile = path.join(projectDir, 'capabilities.json');
      const manifestFile = path.join(projectDir, 'manifest.json');
      const swFile = path.join(projectDir, 'sw.js');

      let snapshot = {
        secureContext: true,
        serviceWorker: true,
        pushManager: true,
        notificationPermission: 'granted',
        manifest: true,
        installed: true
      };

      if (await fileExists(capFile)) {
        snapshot = JSON.parse(await readFile(capFile, 'utf8'));
      }
      if (await fileExists(manifestFile)) {
        snapshot.manifestData = JSON.parse(await readFile(manifestFile, 'utf8'));
      }
      if (await fileExists(swFile)) {
        snapshot.serviceWorkerCode = await readFile(swFile, 'utf8');
      }

      const report = diagnose(snapshot);
      console.log(asMarkdown ? formatMarkdownReport(report) : JSON.stringify(report, null, 2));
      if (strict && report.summary.failed > 0) process.exitCode = 1;
      return;
    }

    if (subcommand === 'serve') {
      const port = Number(getArg(args, '--port') || 3400);
      const server = createDiagnosticServer();
      server.listen(port, () => {
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
