#!/usr/bin/env node
/* Print dist/<slug>.html to dist/<slug>.pdf with headless Chrome.
 *
 * Why not Word: Office is installed on this machine but has never been activated,
 * so `Word.Application` Automation blocks on its licence dialog and never returns
 * (two attempts, both hung until killed). Chrome is installed and its DevTools
 * Protocol prints A4 with a real running footer, so the PDF is produced here.
 *
 *   node tools/docs/build_pdf.js dist/doc.html                 # -> dist/doc.pdf
 *   node tools/docs/build_pdf.js dist/doc.html out.pdf --footer "left label"
 *   node tools/docs/build_pdf.js dist/doc.html --probe         # layout check only
 *   node tools/docs/build_pdf.js dist/doc.html --verbose       # step-by-step log
 *
 * Exit codes: 0 ok, 2 no Chrome, 3 protocol/timeout, 4 print failure, 5 probe found a problem.
 */

'use strict';

const path = require('path');
const cdp = require('./cdp');

const DEFAULT_FOOTER_LEFT = 'Dungeon Scrolling - Technical & Design Bible';

/* Runs in the page: measures the print layout without printing it. Catches the
   two failures that matter for a hand-built document -- content wider than the
   page, and images that never loaded.

   The viewport is forced to A4 width and screened as `print` first: measuring in
   a 1400px-wide window reports every element as overflowing, which is true of
   the *screen* layout and says nothing about the page. */
const PROBE_SETUP = [
  ['Emulation.setDeviceMetricsOverride', {
    width: 794, height: 1123, deviceScaleFactor: 1, mobile: false
  }],
  ['Emulation.setEmulatedMedia', { media: 'print' }]
];

const PROBE = `(() => {
  const mm = 96 / 25.4;
  const pageW = 210 * mm;
  const out = { pageW: Math.round(pageW), bodyW: document.body.scrollWidth,
    docH: document.documentElement.scrollHeight, pagesEstimate: 0, overflow: [],
    chapters: document.querySelectorAll('h1').length,
    headings: document.querySelectorAll('h1,h2,h3,h4').length,
    tables: document.querySelectorAll('table').length,
    figures: document.querySelectorAll('figure').length,
    brokenImages: [...document.images].filter(i => !i.naturalWidth).length,
    tocEntries: document.querySelectorAll('.toc li').length };
  /* A lower bound, not the page count: it divides the document by the page box,
     but the printed page is the box minus printToPDF's 0.55in top and 0.62in
     bottom margin, and it cannot see the gaps that page-break-avoid rules leave
     around headings, tables and figures. The probe said 43 while the printed PDF
     held 52 pages, so the real number is the /Count in the file:
       python -c "import re;print(re.findall(rb'/Count (\\d+)',open('dist/x.pdf','rb').read()))" */
  const contentH = (11.69 - 0.55 - 0.62) * 96;
  out.pagesEstimate = Math.round(out.docH / contentH);
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width > pageW + 1) out.overflow.push(el.tagName + '.' + (el.className || '') + ' w=' + Math.round(r.width));
  }
  out.overflow = out.overflow.slice(0, 10);
  return out;
})()`;

async function main() {
  const args = process.argv.slice(2);
  const positionals = args.filter((a) => !a.startsWith('--') && a !== 'verbose');
  const htmlPath = positionals[0];
  if (!htmlPath) {
    console.error('usage: node tools/docs/build_pdf.js <input.html> [output.pdf] [--footer "label"] [--probe] [--verbose]');
    return 2;
  }
  const pdfPath = positionals[1] || htmlPath.replace(/\.html?$/i, '.pdf');
  const footerIdx = args.indexOf('--footer');
  const footerLeft = footerIdx >= 0 ? args[footerIdx + 1] : DEFAULT_FOOTER_LEFT;

  let chrome;
  try {
    chrome = await cdp.launch({ width: 1400, height: 1000 });
  } catch (err) {
    console.error('pdf: ' + err.message);
    return 2;
  }

  try {
    const { session } = chrome;
    await session.cmd('Page.enable');
    const fileUrl = 'file:///' + path.resolve(htmlPath).replace(/\\/g, '/').replace(/ /g, '%20');
    await session.goto(fileUrl, 900);
    cdp.log('page loaded');

    if (args.includes('--probe')) {
      for (const [method, params] of PROBE_SETUP) await session.cmd(method, params);
      await cdp.sleep(250);
      const v = await session.eval(PROBE);
      console.log('probe: ' + JSON.stringify(v, null, 1));
      const ok = v.brokenImages === 0 && v.overflow.length === 0;
      return ok ? 0 : 5;
    }

    const footer = '<div style="width:100%;font-family:Calibri,Arial;font-size:8.5pt;color:#6b6a64;'
      + 'padding:0 18mm;display:flex;justify-content:space-between;border-top:0.5pt solid #d8d5cc;'
      + 'padding-top:3mm;">'
      + '<span>' + footerLeft + '</span>'
      + '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>'
      + '</div>';

    const res = await session.cmd('Page.printToPDF', {
      landscape: false,
      displayHeaderFooter: true,
      headerTemplate: '<div style="font-size:1px"></div>',
      footerTemplate: footer,
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0.55,
      marginBottom: 0.62,
      marginLeft: 0,
      marginRight: 0,
      paperWidth: 8.27,
      paperHeight: 11.69
    }, 120000);

    if (!res || !res.data) {
      console.error('pdf: printToPDF returned no data');
      return 4;
    }
    const bytes = Buffer.from(res.data, 'base64');
    require('fs').mkdirSync(path.dirname(path.resolve(pdfPath)), { recursive: true });
    require('fs').writeFileSync(pdfPath, bytes);
    console.log('pdf: ' + pdfPath + ' (' + (bytes.length / 1024).toFixed(1) + ' KB)');
    return 0;
  } catch (err) {
    console.error('pdf-failed: ' + err.message);
    return 3;
  } finally {
    await chrome.close();
  }
}

main().then((code) => process.exit(code));
