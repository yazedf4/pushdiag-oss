import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

for (const command of ['doctor', 'check']) {
  test(`${command} Markdown keeps input text inside one literal table cell`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pushdiag-markdown-'));
    try {
      const name = 'Sample | App\r\nnext\tline\u0000end **bold** _x_ [link](https://example.test) `code` \\ <b>&';
      const manifest = { name };
      await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
      const input = path.join(dir, 'input.json');
      await writeFile(input, JSON.stringify({ skipCapabilities: true, manifestData: manifest }));
      const args = command === 'doctor' ? ['doctor', '--project', dir] : ['check', '--input', input];
      const json = JSON.parse(execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' }));
      const markdown = execFileSync(process.execPath, [cli, ...args, '--markdown'], { encoding: 'utf8' });
      assert.equal(json.checks.find(c => c.id === 'manifest-name').message, `App identity configured (${name}).`);
      assert.ok(markdown.includes('Sample \\| App next line end \\*\\*bold\\*\\* \\_x\\_ \\[link\\](https://example.test) \\`code\\` \\\\ &lt;b&gt;&amp;'));
      assert.ok(markdown.includes('**Fix:** Add \\`"start\\_url": "/"\\`'));
      assert.doesNotMatch(markdown, /[\u0000-\u0009\u000b-\u001f\u007f]/);
      const rows = markdown.split('\n').filter(line => line.startsWith('|'));
      assert.equal(rows.length, json.checks.length + 2);
      for (const row of rows) assert.equal((row.match(/(?<!\\)\|/g) || []).length, 5, row);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
