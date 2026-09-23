# -*- coding: utf-8 -*-
"""Render docs/*.md to a print-ready HTML page, which tools/docs/build_pdf.js
then prints to PDF with headless Chrome.

This exists because Word automation is unavailable on this machine (Office is
installed but never licensed, so `Word.Application` hangs on its activation
dialog). Chrome is installed and prints A4 with a real running footer, so the
PDF is produced from the *same* parsed chapters as the .docx -- one source, two
renderers, and the palette is shared with the Word theme so the two editions
look like one document.

    python tools/docs/build_html.py            # -> dist/<slug>.html
"""

import html
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mdparse  # noqa: E402

ROOT = mdparse.ROOT
DIST = os.path.join(ROOT, "dist")

INK = "#1a1a1a"
MUTED = "#6b6a64"
HEAD1 = "#1b2233"
ACCENT = "#9a6b1f"
CODE_FILL = "#f2f1ec"
QUOTE_FILL = "#fbf6e8"
LINE = "#d8d5cc"

CSS = """
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: Calibri, "Segoe UI", Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.42; color: %(INK)s;
  counter-reset: h1; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page { padding: 0 18mm; }
h1, h2, h3, h4 { font-family: "Calibri Light", Calibri, "Segoe UI", sans-serif;
  color: %(HEAD1)s; page-break-after: avoid; break-after: avoid; margin: 0; }
h1 { font-size: 21pt; margin: 0 0 6pt; counter-reset: h2 h3 h4; counter-increment: h1;
     border-bottom: 2.4pt solid %(ACCENT)s; padding-bottom: 4pt; }
h1::before { content: counter(h1) ". "; color: %(ACCENT)s; }
h2 { font-size: 15.5pt; margin: 16pt 0 4pt; counter-reset: h3 h4; counter-increment: h2; }
h2::before { content: counter(h1) "." counter(h2) "  "; color: %(ACCENT)s; }
h3 { font-size: 12.5pt; margin: 12pt 0 3pt; color: %(ACCENT)s;
     counter-reset: h4; counter-increment: h3; }
h3::before { content: counter(h1) "." counter(h2) "." counter(h3) "  "; }
h4 { font-size: 11pt; margin: 10pt 0 2pt; color: #4a4a44; counter-increment: h4; }
h4::before { content: counter(h1) "." counter(h2) "." counter(h3) "." counter(h4) "  "; }
p { margin: 0 0 6pt; }
strong { font-weight: 700; }
em { font-style: italic; }
code { font-family: Consolas, "Courier New", monospace; font-size: 9pt;
       background: %(CODE_FILL)s; padding: 0 2px; }
ul, ol { margin: 0 0 7pt; padding-left: 16pt; }
li { margin-bottom: 2pt; }
table { width: 100%%; border-collapse: collapse; margin: 4pt 0 10pt;
        page-break-inside: auto; font-size: 8.6pt; }
th, td { border: 0.6pt solid #d8d5cc; padding: 3pt 4pt; text-align: left;
         vertical-align: top; }
th { background: #ede7d6; color: #33302a; font-weight: 700; }
tr { page-break-inside: avoid; }
pre { background: %(CODE_FILL)s; border: 0.6pt solid #dedad0; padding: 6pt 8pt;
      font-family: Consolas, "Courier New", monospace; font-size: 8.6pt;
      white-space: pre-wrap; page-break-inside: avoid; margin: 2pt 0 10pt; }
blockquote { margin: 6pt 0 10pt; padding: 5pt 9pt; background: %(QUOTE_FILL)s;
             border-left: 3pt solid %(ACCENT)s; page-break-inside: avoid; }
blockquote p { margin: 0; }
hr { border: 0; border-top: 0.6pt solid %(LINE)s; margin: 10pt 0; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; text-align: center; }
figure img { max-width: 100%%; border: 0.6pt solid %(LINE)s; }
figcaption { font-size: 8.6pt; color: %(MUTED)s; margin-top: 3pt; font-style: italic; }
.cover { height: 297mm; padding: 90mm 20mm 0; text-align: center;
         page-break-after: always; break-after: page; }
.cover .game { font-family: "Calibri Light", Calibri; font-size: 34pt; font-weight: 700;
               color: %(HEAD1)s; letter-spacing: 1px; }
.cover .title { font-size: 19pt; color: %(ACCENT)s; margin-top: 8pt;
                border-bottom: 1.6pt solid %(ACCENT)s; display: inline-block;
                padding-bottom: 5pt; }
.cover .sub { font-size: 11.5pt; color: #4a4a44; margin-top: 14pt; }
.cover dl { margin: 34pt auto 0; display: table; font-size: 10pt; }
.cover dl div { display: table-row; }
.cover dt { display: table-cell; text-align: right; color: %(MUTED)s; padding: 2pt 6pt; }
.cover dd { display: table-cell; text-align: left; padding: 2pt 6px; }
.cover .note { margin-top: 26pt; font-size: 9.4pt; color: %(MUTED)s; }
.toc { page-break-after: always; }
.toc h2 { counter-increment: none; margin-bottom: 8pt; }
.toc h2::before { content: ""; }
.toc ol { list-style: none; padding-left: 0; font-size: 10pt; }
.toc ol ol { padding-left: 16pt; font-size: 9.3pt; color: #3a3a36; }
.toc li { margin-bottom: 1.5pt; }
.toc .num { color: %(ACCENT)s; font-weight: 700; margin-right: 5pt; }
.chapter { page-break-before: always; }
.chapter:first-of-type { page-break-before: avoid; }
.missing { color: #b03a48; font-style: italic; }
""" % {"INK": INK, "MUTED": MUTED, "HEAD1": HEAD1, "ACCENT": ACCENT,
       "CODE_FILL": CODE_FILL, "QUOTE_FILL": QUOTE_FILL, "LINE": LINE}


def esc(t):
    return html.escape(t, quote=False)


def inline(text):
    out = []
    for kind, body in mdparse.inline(text):
        if kind == "bold":
            out.append("<strong>%s</strong>" % esc(body))
        elif kind == "italic":
            out.append("<em>%s</em>" % esc(body))
        elif kind == "code":
            out.append("<code>%s</code>" % esc(body))
        else:
            out.append(esc(body))
    return "".join(out)


def render(blocks):
    out = []
    i = 0
    while i < len(blocks):
        b = blocks[i]
        t = b["type"]
        if t == "heading":
            lvl = b["level"]
            cls = ' class="chapter"' if lvl == 1 else ""
            out.append("<h%d%s>%s</h%d>" % (lvl, cls, inline(b["text"]), lvl))
        elif t == "para":
            out.append("<p>%s</p>" % inline(b["text"]))
        elif t == "bullet":
            items = []
            while i < len(blocks) and blocks[i]["type"] == "bullet":
                items.append(blocks[i])
                i += 1
            out.append("<ul>" + "".join("<li>%s</li>" % inline(x["text"]) for x in items) + "</ul>")
            continue
        elif t == "number":
            items = []
            while i < len(blocks) and blocks[i]["type"] == "number":
                items.append(blocks[i])
                i += 1
            out.append("<ol>" + "".join("<li>%s</li>" % inline(x["text"]) for x in items) + "</ol>")
            continue
        elif t == "table":
            rows = b["rows"]
            head = "".join("<th>%s</th>" % inline(c) for c in rows[0])
            body = "".join("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r)
                           for r in rows[1:])
            out.append("<table><thead><tr>%s</tr></thead><tbody>%s</tbody></table>" % (head, body))
        elif t == "code":
            out.append("<pre>%s</pre>" % esc("\n".join(b["lines"])))
        elif t == "quote":
            out.append("<blockquote><p>%s</p></blockquote>" % inline(b["text"]))
        elif t == "hr":
            out.append("<hr/>")
        elif t == "pagebreak":
            out.append('<div style="page-break-after: always"></div>')
        elif t == "toc":
            out.append("[[TOCPLACEHOLDER]]")
        elif t == "image":
            if os.path.isfile(b["path"]):
                # Relative to the HTML file, which lives in dist/ -- not to the
                # project root, or every figure resolves to dist/docs/... and
                # silently fails to load in the printed PDF.
                rel = os.path.relpath(b["path"], DIST).replace("\\", "/")
                cap = '<figcaption>%s</figcaption>' % esc(b["caption"]) if b.get("caption") else ""
                out.append('<figure><img src="%s"/>%s</figure>' % (rel, cap))
            else:
                out.append('<p class="missing">Screenshot pending: %s</p>' % esc(b["src"]))
        i += 1
    return "\n".join(out)


def toc_html(chapters):
    """A number+title table of contents, built from the headings themselves."""
    lis = []
    for idx, (blocks) in enumerate(chapters, start=1):
        subs = []
        for b in blocks:
            if b["type"] == "heading" and b["level"] == 1:
                lis.append('<li><span class="num">%d.</span>%s</li>' % (idx, esc(b["text"])))
            elif b["type"] == "heading" and b["level"] == 2:
                subs.append('<li><span class="num">%d.%d</span>%s</li>'
                            % (idx, len(subs) + 1, esc(b["text"])))
        if subs:
            lis.append("<ol style='list-style:none'>" + "".join(subs) + "</ol>")
    return ('<div class="toc"><h2>Table of Contents</h2><ol>%s</ol></div>' % "".join(lis))


def build(quiet=False):
    meta = {}
    meta_path = os.path.join(ROOT, "docs", "meta.json")
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = json.load(fh)

    chapters = [blocks for _title, blocks in mdparse.load_all()]
    # No explicit page break between files: every chapter opens with an h1, and
    # h1 already forces one, so adding another would print blank pages.
    page = "\n".join(render(blocks) for blocks in chapters)
    page = page.replace("[[TOCPLACEHOLDER]]", toc_html(chapters))

    cover_rows = [
        ("Version", meta.get("version", "")),
        ("Date", meta.get("date", "")),
        ("Engine", meta.get("engine", "")),
        ("Repository", meta.get("repo", "")),
        ("Live build", meta.get("url", "")),
        ("Prepared for", meta.get("author", "")),
    ]
    cover = ('<div class="cover"><div class="game">%s</div>'
             '<div class="title">%s</div><div class="sub">%s</div>'
             '<dl>%s</dl><div class="note">%s</div></div>'
             % (esc(meta.get("game", "DUNGEON SCROLLING")),
                esc(meta.get("title", "")), esc(meta.get("subtitle", "")),
                "".join("<div><dt>%s</dt><dd>%s</dd></div>" % (esc(k), esc(v))
                        for k, v in cover_rows if v),
                esc(meta.get("note", ""))))

    doc = ('<!doctype html><html><head><meta charset="utf-8">'
           '<title>%s</title><style>%s</style></head><body>%s<div class="page">%s</div>'
           '</body></html>'
           % (esc(meta.get("title", "Documentation")), CSS, cover, page))

    os.makedirs(DIST, exist_ok=True)
    out = os.path.join(DIST, (meta.get("slug") or "documentation") + ".html")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(doc)
    if not quiet:
        print("html: %s (%.1f KB, %d chapters)" % (out, len(doc) / 1024.0, len(chapters)))
    return out


if __name__ == "__main__":
    build()
