import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeServiceWorker } from '../src/service-worker.js';

const status = (report, id) => report.checks.find(c => c.id === id)?.status;

test('ignores fake calls inside comments, strings and unrelated message listener', () => {
  const input = `
    // self.addEventListener('push',e => e.waitUntil(self.registration.showNotification('fake')));
    const example = "self.addEventListener('push', x => x.waitUntil(showNotification()))";
    self.addEventListener('push', (event) => { console.log(event.data); });
    self.addEventListener('message', (event) => {
      event.waitUntil(self.registration.showNotification('unrelated'));
    });
  `;
  const r = analyzeServiceWorker(input);
  assert.equal(status(r, 'sw-push-listener'), 'pass');
  assert.equal(status(r, 'sw-wait-until'), 'fail');
  assert.equal(status(r, 'sw-show-notification'), 'warn');
});

test('valid push callback with URL-containing string is not truncated', () => {
  const r = analyzeServiceWorker(`
    self.addEventListener('push', e => {
      const target = 'https://example.test/a';
      e.waitUntil(self.registration.showNotification('Alert', { data: { target } }));
    });
  `);
  assert.equal(status(r, 'sw-wait-until'), 'pass');
  assert.equal(status(r, 'sw-show-notification'), 'pass');
});

test('recognizes minified arrow push handler without braces', () => {
  const r = analyzeServiceWorker('self.addEventListener("push",e=>e.waitUntil(self.registration.showNotification("Hi")))');
  assert.equal(status(r, 'sw-wait-until'), 'pass');
  assert.equal(status(r, 'sw-show-notification'), 'pass');
});

test('named callback is not treated as verified', () => {
  const r = analyzeServiceWorker('self.addEventListener("push", handlePush); function handlePush(e) { e.waitUntil(self.registration.showNotification("Hi")) }');
  assert.equal(status(r, 'sw-wait-until'), 'warn');
  assert.equal(status(r, 'sw-show-notification'), 'warn');
});

test('multiple listeners do not hide missing waitUntil in one listener', () => {
  const r = analyzeServiceWorker(`
    self.addEventListener('push', e => e.waitUntil(self.registration.showNotification('Hi')));
    self.addEventListener('push', e => console.log(e));
  `);
  assert.equal(status(r, 'sw-wait-until'), 'fail');
  assert.equal(status(r, 'sw-show-notification'), 'warn');
});

test('supports self.onpush = function callback', () => {
  const r = analyzeServiceWorker(`self.onpush = function(e) { e.waitUntil(self.registration.showNotification('Hi')); };`);
  assert.equal(status(r, 'sw-push-listener'), 'pass');
  assert.equal(status(r, 'sw-wait-until'), 'pass');
});

test('bare untrusted string is not interpreted as code', () => {
  const r = analyzeServiceWorker(`const x = 'addEventListener("push", e => e.waitUntil(showNotification()))';`);
  assert.equal(status(r, 'sw-push-listener'), 'fail');
  assert.equal(status(r, 'sw-wait-until'), 'fail');
});
