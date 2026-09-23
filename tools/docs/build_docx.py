# -*- coding: utf-8 -*-
"""Build dist/<doc>.docx from docs/*.md, with Python's stdlib only.

Why a hand-written OOXML writer: this project has no build step and no
dependencies, and neither python-docx nor pandoc is installed here. A .docx is
a ZIP of XML parts and the stdlib writes both, so the document builds offline,
deterministically and without an install.

The one thing that matters for a hand-written .docx is *element order*: Word
validates the parts against the ECMA-376 schema, and a property element in the
wrong position makes the file open with "unreadable content". Every property
bag here is therefore emitted through `children()`, which sorts it by the
schema's own sequence instead of by the order a caller happened to add it.

    python tools/docs/build_docx.py             # the real document
    python tools/docs/build_docx.py --smoke     # tiny self-test, for the writer
"""

import argparse
import datetime
import json
import os
import struct
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mdparse  # noqa: E402

ROOT = mdparse.ROOT
DOCS = os.path.join(ROOT, "docs")
DIST = os.path.join(ROOT, "dist")

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"

CONTENT_W = 9600
FONT_BODY = "Calibri"
FONT_HEAD = "Calibri Light"
FONT_MONO = "Consolas"

INK = "1A1A1A"
MUTED = "6B6A64"
HEAD1 = "1B2233"
HEAD_ACCENT = "9A6B1F"
CODE_FILL = "F2F1EC"
QUOTE_FILL = "FBF6E8"
LINE = "D8D5CC"

PPR_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr",
             "widowControl", "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs",
             "suppressAutoHyphens", "kinsoku", "wordWrap", "overflowPunct",
             "topLinePunct", "autoSpaceDE", "autoSpaceDN", "bidi", "adjustRightInd",
             "snapToGrid", "spacing", "ind", "contextualSpacing", "mirrorIndents",
             "suppressOverlap", "jc", "textDirection", "textAlignment",
             "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr"]

RPR_ORDER = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike",
             "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid",
             "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz",
             "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign",
             "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"]

TBLPR_ORDER = ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
               "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd",
               "tblBorders", "shd", "tblLayout", "tblCellMar", "tblLook"]

TCPR_ORDER = ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd",
              "noWrap", "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"]

TRPR_ORDER = ["cnfStyle", "divId", "gridBefore", "gridAfter", "wBefore", "wAfter",
              "cantSplit", "trHeight", "tblHeader", "tblCellSpacing", "jc", "hidden"]

SECTPR_ORDER = ["footnotePr", "endnotePr", "type", "pgSz", "pgMar", "paperSrc",
                "pgBorders", "lnNumType", "pgNumType", "cols", "formProt", "vAlign",
                "noEndnote", "titlePg", "textDirection", "bidi", "rtlGutter",
                "docGrid", "printerSettings"]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def children(props, order, where):
    """Emit a property bag in the schema's sequence. Loud on unknown names."""
    out = []
    for name in order:
        if name in props:
            out.append(props.pop(name))
    if props:
        raise KeyError("unknown %s children: %s" % (where, sorted(props)))
    return "".join(out)


def pPr(**props):
    return "<w:pPr>%s</w:pPr>" % children(props, PPR_ORDER, "w:pPr")


def rPr(**props):
    return "<w:rPr>%s</w:rPr>" % children(props, RPR_ORDER, "w:rPr")


def tblPr(**props):
    return "<w:tblPr>%s</w:tblPr>" % children(props, TBLPR_ORDER, "w:tblPr")


def tcPr(**props):
    return "<w:tcPr>%s</w:tcPr>" % children(props, TCPR_ORDER, "w:tcPr")


def trPr(**props):
    return "<w:trPr>%s</w:trPr>" % children(props, TRPR_ORDER, "w:trPr")


# --- runs ------------------------------------------------------------------

def runs(text, size=None, color=None, mono=False, base=None):
    out = []
    for kind, body in mdparse.inline(text):
        props = {}
        font = FONT_MONO if (mono or kind == "code") else base
        if font:
            props["rFonts"] = '<w:rFonts w:ascii="%s" w:hAnsi="%s"/>' % (font, font)
        if kind == "bold":
            props["b"] = "<w:b/><w:bCs/>"
        elif kind == "italic":
            props["i"] = "<w:i/><w:iCs/>"
        if color:
            props["color"] = '<w:color w:val="%s"/>' % color
        if size:
            props["sz"] = '<w:sz w:val="%d"/><w:szCs w:val="%d"/>' % (size, size)
        if kind == "code":
            props["shd"] = '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % CODE_FILL
        out.append('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>'
                   % (rPr(**props), esc(body)))
    return "".join(out)


# --- blocks ----------------------------------------------------------------

def para(text, size=None, color=None, align=None, spacing=None, indent=None,
         style=None, keep_next=False):
    props = {}
    if style:
        props["pStyle"] = '<w:pStyle w:val="%s"/>' % style
    if keep_next:
        props["keepNext"] = "<w:keepNext/>"
    if spacing:
        props["spacing"] = '<w:spacing w:before="%d" w:after="%d"/>' % spacing
    if indent:
        props["ind"] = '<w:ind w:left="%d"/>' % indent
    if align:
        props["jc"] = '<w:jc w:val="%s"/>' % align
    return "<w:p>%s%s</w:p>" % (pPr(**props), runs(text, size=size, color=color))


def list_item(text, num_id, ilvl, counter=None):
    label = ("%s. " % counter) if counter else ""
    return ('<w:p>%s%s</w:p>'
            % (pPr(pStyle='<w:pStyle w:val="ListParagraph"/>',
                   numPr='<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="%d"/></w:numPr>'
                         % (ilvl, num_id),
                   spacing='<w:spacing w:after="40"/>'),
               runs(label + text)))


def table(rows):
    if not rows:
        return ""
    cols = max(len(r) for r in rows)
    share = CONTENT_W // cols
    widths = [share] * cols
    widths[-1] = CONTENT_W - sum(widths[:-1])
    grid = "".join('<w:gridCol w:w="%d"/>' % w for w in widths)

    out = ['<w:tbl>', tblPr(
        tblStyle='<w:tblStyle w:val="GridTable"/>',
        tblW='<w:tblW w:w="%d" w:type="dxa"/>' % CONTENT_W,
        tblBorders='<w:tblBorders>'
                   '<w:top w:val="single" w:sz="4" w:color="C9C6BC"/>'
                   '<w:left w:val="single" w:sz="4" w:color="C9C6BC"/>'
                   '<w:bottom w:val="single" w:sz="4" w:color="C9C6BC"/>'
                   '<w:right w:val="single" w:sz="4" w:color="C9C6BC"/>'
                   '<w:insideH w:val="single" w:sz="4" w:color="DCD9D0"/>'
                   '<w:insideV w:val="single" w:sz="4" w:color="DCD9D0"/>'
                   '</w:tblBorders>',
        tblLayout='<w:tblLayout w:type="fixed"/>',
        tblCellMar='<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
                   '<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'),
        '<w:tblGrid>%s</w:tblGrid>' % grid]

    for i, cells in enumerate(rows):
        header = i == 0
        out.append("<w:tr>")
        if header:
            out.append(trPr(tblHeader="<w:tblHeader/>"))
        for c in range(cols):
            txt = cells[c] if c < len(cells) else ""
            out.append("<w:tc>")
            out.append(tcPr(
                tcW='<w:tcW w:w="%d" w:type="dxa"/>' % widths[c],
                shd='<w:shd w:val="clear" w:color="auto" w:fill="%s"/>'
                    % ("EDE7D6" if header else "FFFFFF"),
                vAlign='<w:vAlign w:val="center"/>'))
            cell_props = pPr(spacing='<w:spacing w:before="20" w:after="20"/>')
            out.append("<w:p>%s%s</w:p>" % (cell_props,
                                            runs(txt, size=17,
                                                 color="33302A" if header else None)))
            out.append("</w:tc>")
        out.append("</w:tr>")
    out.append("</w:tbl>")
    out.append("<w:p>%s</w:p>" % pPr(spacing='<w:spacing w:after="0"/>'))
    return "".join(out)


def code_block(lines):
    body = []
    for line in (lines or [""]):
        body.append("<w:p>%s%s</w:p>"
                    % (pPr(spacing='<w:spacing w:before="0" w:after="0"/>',
                           contextualSpacing="<w:contextualSpacing/>"),
                       runs(line or " ", size=16, mono=True)))
    return ('<w:tbl>'
            + tblPr(tblW='<w:tblW w:w="%d" w:type="dxa"/>' % CONTENT_W,
                    tblBorders='<w:tblBorders>'
                               '<w:top w:val="single" w:sz="4" w:color="DEDAD0"/>'
                               '<w:left w:val="single" w:sz="4" w:color="DEDAD0"/>'
                               '<w:bottom w:val="single" w:sz="4" w:color="DEDAD0"/>'
                               '<w:right w:val="single" w:sz="4" w:color="DEDAD0"/>'
                               '</w:tblBorders>',
                    tblLayout='<w:tblLayout w:type="fixed"/>',
                    tblCellMar='<w:tblCellMar><w:top w:w="80" w:type="dxa"/>'
                               '<w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/>'
                               '<w:right w:w="120" w:type="dxa"/></w:tblCellMar>')
            + '<w:tblGrid><w:gridCol w:w="%d"/></w:tblGrid>' % CONTENT_W
            + "<w:tr><w:tc>"
            + tcPr(tcW='<w:tcW w:w="%d" w:type="dxa"/>' % CONTENT_W,
                   shd='<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % CODE_FILL)
            + "".join(body)
            + "</w:tc></w:tr></w:tbl>"
            + '<w:p>%s</w:p>' % pPr(spacing='<w:spacing w:after="0"/>'))


def quote(text):
    return ('<w:p>%s%s</w:p>'
            % (pPr(pBdr='<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="%s"/></w:pBdr>' % HEAD_ACCENT,
                   shd='<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % QUOTE_FILL,
                   spacing='<w:spacing w:before="100" w:after="140"/>',
                   ind='<w:ind w:left="170" w:right="120"/>'),
               runs(text)))


def hr():
    return ('<w:p>%s</w:p>'
            % pPr(pBdr='<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="%s"/></w:pBdr>' % LINE,
                  spacing='<w:spacing w:before="80" w:after="120"/>'))


def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])


def image_block(block, index):
    """(xml, rel) -- rel is (rid, path) when the file was embedded."""
    if not os.path.isfile(block["path"]):
        return quote("SCREENSHOT PENDING: %s - capture it, then rebuild." % block["src"]), None
    size = png_size(block["path"])
    if not size:
        return quote("NOT A PNG: %s" % block["src"]), None
    w, h = size
    cx = 14 * 360000 * 95 // 100           # ~13.3 cm wide
    cy = int(round(cx * h / float(w)))
    rid = "img%d" % index
    xml = ('<w:p>%s<w:r><w:drawing>'
           '<wp:inline distT="0" distB="0" distL="0" distR="0">'
           '<wp:extent cx="%d" cy="%d"/><wp:effectExtent l="0" t="0" r="0" b="0"/>'
           '<wp:docPr id="%d" name="Picture %d"/><wp:cNvGraphicFramePr/>'
           '<a:graphic><a:graphicData uri="%s">'
           '<pic:pic><pic:nvPicPr><pic:cNvPr id="%d" name="%s"/><pic:cNvPicPr/></pic:nvPicPr>'
           '<pic:blipFill><a:blip r:embed="%s"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
           '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="%d" cy="%d"/></a:xfrm>'
           '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
           '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
           % (pPr(jc='<w:jc w:val="center"/>',
                  spacing='<w:spacing w:before="140" w:after="40"/>',
                  keepNext="<w:keepNext/>"),
              cx, cy, index, index, PIC, index, os.path.basename(block["path"]), rid, cx, cy))
    if block.get("caption"):
        xml += ('<w:p>%s%s</w:p>'
                % (pPr(jc='<w:jc w:val="center"/>',
                       spacing='<w:spacing w:after="180"/>'),
                   runs("Figure - " + block["caption"], size=16, color=MUTED)))
    return xml, (rid, block["path"])


def toc_field():
    return ('<w:p>%s%s</w:p>'
            % (pPr(pStyle='<w:pStyle w:val="TOCHeading"/>',
                   spacing='<w:spacing w:after="160"/>'),
               runs("TABLE OF CONTENTS", size=28, color=HEAD1))
            + '<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r>'
              '<w:r><w:instrText xml:space="preserve"> TOC \\o "1-4" \\h \\z \\u </w:instrText></w:r>'
              '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
              '<w:r><w:rPr><w:i/><w:color w:val="%s"/></w:rPr>'
              '<w:t>In Word: Ctrl+A, then F9, to build this table of contents.</w:t></w:r>'
              '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>' % MUTED)


def pagebreak():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def render_blocks(blocks, images):
    out = []
    for b in blocks:
        t = b["type"]
        if t == "heading":
            out.append("<w:p>%s%s</w:p>"
                       % (pPr(pStyle='<w:pStyle w:val="Heading%d"/>' % b["level"]),
                          runs(b["text"])))
        elif t == "para":
            out.append(para(b["text"]))
        elif t == "bullet":
            out.append(list_item(b["text"], 1, b["depth"]))
        elif t == "number":
            out.append(list_item(b["text"], 2, b["depth"]))
        elif t == "table":
            out.append(table(b["rows"]))
        elif t == "code":
            out.append(code_block(b["lines"]))
        elif t == "quote":
            out.append(quote(b["text"]))
        elif t == "hr":
            out.append(hr())
        elif t == "toc":
            out.append(toc_field())
        elif t == "pagebreak":
            out.append(pagebreak())
        elif t == "image":
            xml, rel = image_block(b, len(images) + 1)
            if rel:
                images.append(rel)
            out.append(xml)
    return "".join(out)


# --- package ---------------------------------------------------------------

def styles_xml():
    parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<w:styles xmlns:w="%s">' % W,
             '<w:docDefaults><w:rPrDefault><w:rPr>'
             '<w:rFonts w:ascii="%s" w:hAnsi="%s"/><w:color w:val="%s"/>'
             '<w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault>'
             '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/>'
             '</w:pPr></w:pPrDefault></w:docDefaults>'
             % (FONT_BODY, FONT_BODY, INK),
             '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
             '<w:name w:val="Normal"/></w:style>',
             '<w:style w:type="paragraph" w:styleId="ListParagraph">'
             '<w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/>'
             '<w:pPr><w:spacing w:after="40"/></w:pPr></w:style>']

    for lvl, (size, color, before) in enumerate(
            [(40, HEAD1, 320), (30, HEAD1, 260), (25, HEAD_ACCENT, 220), (23, "4A4A44", 180)],
            start=1):
        parts.append('<w:style w:type="paragraph" w:styleId="Heading%d">'
                     '<w:name w:val="heading %d"/><w:basedOn w:val="Normal"/>'
                     '<w:next w:val="Normal"/>'
                     '<w:pPr><w:keepNext/><w:keepLines/>'
                     '<w:numPr><w:ilvl w:val="%d"/><w:numId w:val="9"/></w:numPr>'
                     '<w:spacing w:before="%d" w:after="80"/>'
                     '<w:outlineLvl w:val="%d"/></w:pPr>'
                     '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s"/><w:b/><w:bCs/>'
                     '<w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr>'
                     '</w:style>'
                     % (lvl, lvl, lvl - 1, before, lvl - 1, FONT_HEAD, FONT_HEAD,
                        color, size, size))

    parts.append('<w:style w:type="paragraph" w:styleId="TOCHeading">'
                 '<w:name w:val="TOC Heading"/><w:basedOn w:val="Normal"/>'
                 '<w:pPr><w:keepNext/><w:spacing w:before="200" w:after="160"/>'
                 '<w:outlineLvl w:val="9"/></w:pPr>'
                 '<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s"/><w:b/><w:bCs/>'
                 '<w:color w:val="%s"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>'
                 '</w:style>' % (FONT_HEAD, FONT_HEAD, HEAD1))
    parts.append('<w:style w:type="table" w:styleId="GridTable">'
                 '<w:name w:val="Grid Table"/>'
                 '<w:tblPr><w:tblCellMar><w:top w:w="40" w:type="dxa"/>'
                 '<w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/>'
                 '<w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>')
    parts.append("</w:styles>")
    return "".join(parts)


def numbering_xml():
    def lvl(i, fmt, text, indent, sym=False):
        rpr = ('<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>' if sym else "")
        return ('<w:lvl w:ilvl="%d"><w:start w:val="1"/><w:numFmt w:val="%s"/>'
                '<w:lvlText w:val="%s"/><w:lvlJc w:val="left"/>'
                '<w:pPr><w:ind w:left="%d" w:hanging="360"/></w:pPr>%s</w:lvl>'
                % (i, fmt, text, indent, rpr))

    bullets = (lvl(0, "bullet", "\u2022", 360, True)
               + lvl(1, "bullet", "\u25E6", 720)
               + lvl(2, "bullet", "\u25AA", 1080, True))
    numbers = (lvl(0, "decimal", "%1.", 360)
               + lvl(1, "lowerLetter", "%1.", 720))
    heads = "".join(lvl(i, "decimal",
                        "%1." if i == 0 else ".".join("%%%d" % (j + 1) for j in range(i + 1)),
                        0)
                    for i in range(4))

    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:numbering xmlns:w="%s">'
            '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>'
            '%s</w:abstractNum>'
            '<w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>'
            '%s</w:abstractNum>'
            '<w:abstractNum w:abstractNumId="9"><w:multiLevelType w:val="multilevel"/>'
            '%s</w:abstractNum>'
            '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>'
            '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>'
            '<w:num w:numId="9"><w:abstractNumId w:val="9"/></w:num>'
            '</w:numbering>' % (W, bullets, numbers, heads))


def cover_xml(meta):
    today = meta.get("date") or datetime.date.today().isoformat()
    rows = [("Game", meta.get("game", "Dungeon Scrolling")),
            ("Document", meta.get("title", "Game Design & Technical Bible")),
            ("Version", meta.get("version", "v0")),
            ("Date", today),
            ("Engine", meta.get("engine", "Vanilla JavaScript + Three.js, no build step")),
            ("Repository", meta.get("repo", "-")),
            ("Live build", meta.get("url", "-")),
            ("Prepared for", meta.get("author", "-"))]
    out = ['<w:p>%s</w:p>' % pPr(spacing='<w:spacing w:before="2600" w:after="0"/>'),
           '<w:p>%s%s</w:p>'
           % (pPr(jc='<w:jc w:val="center"/>', spacing='<w:spacing w:after="0"/>'),
              runs(meta.get("game", "DUNGEON SCROLLING"), size=56, color=HEAD1)),
           '<w:p>%s%s</w:p>'
           % (pPr(jc='<w:jc w:val="center"/>',
                  pBdr='<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="%s"/></w:pBdr>' % HEAD_ACCENT,
                  spacing='<w:spacing w:before="60" w:after="260"/>'),
              runs(meta.get("title", "Game Design & Technical Bible"), size=30, color=HEAD_ACCENT)),
           '<w:p>%s%s</w:p>'
           % (pPr(jc='<w:jc w:val="center"/>', spacing='<w:spacing w:after="420"/>'),
              runs(meta.get("subtitle", ""), size=20, color="4A4A44"))]
    for label, value in rows:
        out.append('<w:p>%s%s%s</w:p>'
                   % (pPr(jc='<w:jc w:val="center"/>', spacing='<w:spacing w:after="20"/>'),
                      runs(label + ": ", size=18, color=MUTED),
                      runs(str(value), size=18, color=INK)))
    if meta.get("note"):
        out.append('<w:p>%s%s</w:p>'
                   % (pPr(jc='<w:jc w:val="center"/>', spacing='<w:spacing w:before="520" w:after="0"/>'),
                      runs(meta["note"], size=18, color=MUTED)))
    out.append(pagebreak())
    return "".join(out)


def footer_xml(meta):
    label = "%s %s - %s" % (meta.get("game", "Dungeon Scrolling"),
                            meta.get("version", ""), meta.get("title", ""))
    tail = ('<w:p>%s'
            '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>'
            '<w:r><w:tab/>%s<w:t xml:space="preserve">Page </w:t></w:r>'
            '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
            '<w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>'
            '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
            '<w:r>%s<w:t>1</w:t></w:r>'
            '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
            '</w:p>'
            % (pPr(pBdr='<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="%s"/></w:pBdr>' % LINE,
                   tabs='<w:tabs><w:tab w:val="right" w:pos="9600"/></w:tabs>',
                   spacing='<w:spacing w:before="60"/>'),
               rPr(sz='<w:sz w:val="14"/>', color=MUTED), esc(label),
               rPr(sz='<w:sz w:val="14"/>', color=MUTED),
               rPr(sz='<w:sz w:val="14"/>', color=MUTED)))
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:ftr xmlns:w="%s">%s</w:ftr>' % (W, tail))


def document_xml(body):
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="%s" xmlns:r="%s" xmlns:wp="%s" xmlns:a="%s" xmlns:pic="%s">'
            '<w:body>%s<w:sectPr>'
            '<w:footerReference w:type="default" r:id="rIdFooter"/>'
            '<w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1200" w:right="1150" w:bottom="1150" w:left="1150" '
            'w:header="708" w:footer="708" w:gutter="0"/>'
            '<w:cols w:space="708"/><w:docGrid w:linePitch="360"/>'
            '</w:sectPr></w:body></w:document>' % (W, R, WP, A, PIC, body))


def rels_xml(images):
    parts = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
             '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
             '<Relationship Id="rIdStyles" Type="%s/styles" Target="styles.xml"/>' % R,
             '<Relationship Id="rIdNumbering" Type="%s/numbering" Target="numbering.xml"/>' % R,
             '<Relationship Id="rIdSettings" Type="%s/settings" Target="settings.xml"/>' % R,
             '<Relationship Id="rIdFooter" Type="%s/footer" Target="footer1.xml"/>' % R]
    for rid, path in images:
        parts.append('<Relationship Id="%s" Type="%s/image" Target="media/%s"/>'
                     % (rid, R, os.path.basename(path)))
    parts.append("</Relationships>")
    return "".join(parts)


def content_types():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Default Extension="png" ContentType="image/png"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
            '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>'
            '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
            '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
            '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
            '</Types>')


def root_rels():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="%s/officeDocument" Target="word/document.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            '<Relationship Id="rId3" Type="%s/extended-properties" Target="docProps/app.xml"/>'
            '</Relationships>' % (R, R))


def settings_xml():
    # updateFields: Word refreshes the TOC (and the footer's PAGE field) when the
    # document opens, so the reader never sees the placeholder line.
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:settings xmlns:w="%s"><w:zoom w:percent="100"/>'
            '<w:defaultTabStop w:val="708"/><w:updateFields w:val="true"/>'
            '<w:compat><w:compatSetting w:name="compatibilityMode" '
            'w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
            '</w:settings>' % W)


def core_xml(meta):
    stamp = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ")
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" '
            'xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            '<dc:title>%s</dc:title><dc:creator>%s</dc:creator>'
            '<cp:lastModifiedBy>%s</cp:lastModifiedBy>'
            '<dcterms:created xsi:type="dcterms:W3CDTF">%s</dcterms:created>'
            '<dcterms:modified xsi:type="dcterms:W3CDTF">%s</dcterms:modified>'
            '</cp:coreProperties>'
            % (esc(meta.get("title", "")), esc(meta.get("author", "")),
               esc(meta.get("author", "")), stamp, stamp))


def app_xml():
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
            '<Application>Dungeon Scrolling doc builder</Application></Properties>')


def read_meta():
    path = os.path.join(DOCS, "meta.json")
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {}


SMOKE_MD = """# Smoke test

A paragraph with **bold**, *italic* and `code` runs, long enough to wrap onto a
second line so the body spacing can be judged.

- first bullet
- second bullet
  - nested bullet

1. first number
2. second number

| Column A | Column B | Column C |
|---|---|---|
| one | two | three |
| four | five | six |

```js
const pool = { torches: 4, elements: 2 };
```

> A callout box, for the rules a reader must not skim.

---

### Third-level heading after a rule

Text after the rule.
"""


def build(smoke=False, out_name=None, quiet=False):
    meta = read_meta()
    images = []
    if smoke:
        body = cover_xml(meta) + render_blocks(mdparse.parse(SMOKE_MD), images)
        chapters = 0
    else:
        parts = [cover_xml(meta)]
        for title, blocks in mdparse.load_all():
            parts.append(render_blocks(blocks, images))
            parts.append(pagebreak())
        body = "".join(parts)
        chapters = len(mdparse.chapters())

    os.makedirs(DIST, exist_ok=True)
    slug = out_name or (meta.get("slug") or "dungeon-scrolling-documentation") + ".docx"
    out_path = os.path.join(DIST, slug)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types())
        z.writestr("_rels/.rels", root_rels())
        z.writestr("word/document.xml", document_xml(body))
        z.writestr("word/_rels/document.xml.rels", rels_xml(images))
        z.writestr("word/styles.xml", styles_xml())
        z.writestr("word/numbering.xml", numbering_xml())
        z.writestr("word/settings.xml", settings_xml())
        z.writestr("word/footer1.xml", footer_xml(meta))
        z.writestr("docProps/core.xml", core_xml(meta))
        z.writestr("docProps/app.xml", app_xml())
        for rid, path in images:
            z.write(path, "word/media/" + os.path.basename(path))

    if not quiet:
        print("docx: %s (%.1f KB, %d chapters, %d images)"
              % (out_path, os.path.getsize(out_path) / 1024.0, chapters, len(images)))
    return out_path


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    build(args.smoke, args.out)
    sys.exit(0)
