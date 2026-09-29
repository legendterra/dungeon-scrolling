#!/usr/bin/env node
/* Boot the page headless and print every console error / exception seen while
 * loading. A thirty-second answer to "does the build even start?".
 *
 *   node tools/qa/probe-load.js [base-url]
 */
'use strict';
const cdp = require('../docs/cdp');

const HOOK = `(() => {
  window.__loadErrors = [];
  const push = (m) => { try { window.__loadErrors.push(String(m).slice(0, 300)); } catch (e) {} };
  const oe = console.error.bind(console);
  console.error = function () { push(Array.prototype.join.call(arguments, ' ')); return oe.apply(null, arguments); };
  window.addEventListener('error', (e) => push(e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  window.addEventListener('unhandledrejection', (e) => push('rejection ' + (e.reason && (e.reason.stack || e.reason))));
})();`;

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:8133/';
  const { session, close } = await cdp.launch({ width: 1280, height: 720, url: 'about:blank' });
  try {
    await session.cmd('Page.enable');
    await session.cmd('Runtime.enable');
    await session.cmd('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await session.goto(base, 4000);
    const out = await session.eval(`({ errors: window.__loadErrors, inv: !!(window.DS && DS.Inv),
      ui3: !!(window.DS && DS.UI3 && DS.UI3.ready) })`);
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } finally { await close(); }
}
main().catch((e) => { process.stderr.write('probe-load: ' + e.message + '\n'); process.exit(2); });
