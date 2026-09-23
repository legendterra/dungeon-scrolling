# -*- coding: utf-8 -*-
"""Validate a generated .docx without Word.

Word refuses a hand-written .docx for exactly three reasons in practice:

  1. a property element in the wrong position within pPr / rPr / tblPr / tcPr /
     trPr (the schema defines a sequence, not a set);
  2. a reference that points at nothing -- a w:pStyle with no style, a numId with
     no numbering definition, an image r:embed with no relationship, a tblStyle
     that is not defined, a footer relation that does not exist;
  3. a part that is not declared in [Content_Types].xml.

Word cannot be automated on this machine (Office is unactivated, so
`Word.Application` hangs on its licence dialog), so this is the gate instead. It
reads the package back the way Word's loader does.

    python tools/docs/check_docx.py dist/<doc>.docx
"""

import re
import sys
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
CT = "{http://schemas.openxmlformats.org/package/2006/content-types}"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# ECMA-376 sequences, the same tables build_docx.py writes against.
PPR_ORDER = ["pStyle", "keepNext", "keepLines", "pageBreakBefore", "framePr", "widowControl",
             "numPr", "suppressLineNumbers", "pBdr", "shd", "tabs", "suppressAutoHyphens",
             "kinsoku", "wordWrap", "overflowPunct", "topLinePunct", "autoSpaceDE",
             "autoSpaceDN", "bidi", "adjustRightInd", "snapToGrid", "spacing", "ind",
             "contextualSpacing", "mirrorIndents", "suppressOverlap", "jc", "textDirection",
             "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr",
             "sectPr", "pPrChange"]
RPR_ORDER = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "caps", "smallCaps", "strike",
             "dstrike", "outline", "shadow", "emboss", "imprint", "noProof", "snapToGrid",
             "vanish", "webHidden", "color", "spacing", "w", "kern", "position", "sz",
             "szCs", "highlight", "u", "effect", "bdr", "shd", "fitText", "vertAlign",
             "rtl", "cs", "em", "lang", "eastAsianLayout", "specVanish", "oMath"]
TBLPR_ORDER = ["tblStyle", "tblpPr", "tblOverlap", "bidiVisual", "tblStyleRowBandSize",
               "tblStyleColBandSize", "tblW", "jc", "tblCellSpacing", "tblInd", "tblBorders",
               "shd", "tblLayout", "tblCellMar", "tblLook", "tblCaption", "tblDescription"]
TCPR_ORDER = ["cnfStyle", "tcW", "gridSpan", "hMerge", "vMerge", "tcBorders", "shd", "noWrap",
              "tcMar", "textDirection", "tcFitText", "vAlign", "hideMark"]
TRPR_ORDER = ["cnfStyle", "divId", "gridBefore", "gridAfter", "wBefore", "wAfter", "cantSplit",
              "trHeight", "tblHeader", "tblCellSpacing", "jc", "hidden"]

ORDERS = {"pPr": PPR_ORDER, "rPr": RPR_ORDER, "tblPr": TBLPR_ORDER,
          "tcPr": TCPR_ORDER, "trPr": TRPR_ORDER}


def tag(el):
    return el.tag.split("}")[-1]


def check_order(root, problems):
    for el in root.iter():
        name = tag(el)
        order = ORDERS.get(name)
        if not order:
            continue
        seen = -1
        for child in el:
            cname = tag(child)
            if cname not in order:
                problems.append("<w:%s> has unknown child <w:%s>" % (name, cname))
                continue
            idx = order.index(cname)
            if idx < seen:
                problems.append("<w:%s>: <w:%s> appears after a later element "
                                "(schema order violated)" % (name, cname))
            seen = max(seen, idx)


def main(path):
    problems = []
    z = zipfile.ZipFile(path)
    names = z.namelist()

    # 3. content types
    ct = ET.fromstring(z.read("[Content_Types].xml"))
    defaults = set()
    overrides = set()
    for el in ct:
        if tag(el) == "Default":
            defaults.add(el.get("Extension", "").lower())
        elif tag(el) == "Override":
            overrides.add(el.get("PartName", ""))
    for part in names:
        if part.startswith("[") or part.endswith("/"):
            continue
        ext = part.rsplit(".", 1)[-1].lower()
        if "/" + part not in overrides and ext not in defaults:
            problems.append("part not declared in [Content_Types].xml: %s" % part)

    # 1. element order, in every XML part that has property bags
    doc = ET.fromstring(z.read("word/document.xml"))
    check_order(doc, problems)
    for part in names:
        if part.endswith(".xml") and part.startswith("word/"):
            check_order(ET.fromstring(z.read(part)), problems)

    # 2a. style references
    styles = ET.fromstring(z.read("word/styles.xml"))
    style_ids = set()
    for el in styles.iter():
        if tag(el) in ("style", "latentStyles"):
            sid = el.get(W + "styleId")
            if sid:
                style_ids.add(sid)
    for el in doc.iter():
        if tag(el) == "pStyle" or tag(el) == "tblStyle" or tag(el) == "rStyle":
            val = el.get(W + "val")
            if val and val not in style_ids:
                problems.append("style not defined: %s (used by <w:%s>)" % (val, tag(el)))

    # 2b. numbering references
    nums = ET.fromstring(z.read("word/numbering.xml"))
    num_ids = {el.get(W + "numId") for el in nums if tag(el) == "num"}
    abstract_ids = {el.get(W + "abstractNumId") for el in nums if tag(el) == "abstractNum"}
    for el in nums:
        if tag(el) == "num":
            ref = el.find(W + "abstractNumId")
            if ref is not None and ref.get(W + "val") not in abstract_ids:
                problems.append("numId %s points at a missing abstractNum" % el.get(W + "numId"))
    for el in doc.iter():
        if tag(el) == "numId":
            val = el.get(W + "val")
            if val and val not in num_ids:
                problems.append("numId not defined: %s" % val)

    # 2c. image relationships and media parts
    rels = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    rel_map = {}
    for el in rels:
        rel_map[el.get("Id")] = el.get("Target")
    for el in doc.iter():
        rid = el.get(R + "embed")
        if rid:
            target = rel_map.get(rid)
            if not target:
                problems.append("image r:embed=%s has no relationship" % rid)
            elif "word/" + target not in names:
                problems.append("relationship %s points at missing part word/%s" % (rid, target))
    for el in doc.iter():
        if tag(el) == "footerReference":
            rid = el.get(R + "id")
            if rid not in rel_map:
                problems.append("footerReference %s has no relationship" % rid)

    # extra: every media part is actually referenced (catches a stray embed)
    media = [n for n in names if n.startswith("word/media/")]
    referenced = {("word/" + t) for t in rel_map.values() if t and t.startswith("media/")}
    for m in media:
        if m not in referenced:
            problems.append("unused media part: %s" % m)

    print("docx check: %s" % path)
    print("  parts: %d | styles: %d | numbering: %d | media: %d | relationships: %d"
          % (len(names), len(style_ids), len(num_ids), len(media), len(rel_map)))
    print("  paragraphs: %d | tables: %d | images drawn: %d"
          % (len(list(doc.iter(W + "p"))), len(list(doc.iter(W + "tbl"))),
             sum(1 for el in doc.iter() if tag(el) == "blip")))
    if problems:
        print("  PROBLEMS (%d):" % len(problems))
        for p in problems[:40]:
            print("   - " + p)
        return 1
    print("  OK - order, references and content types all consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "dist/dungeon-scrolling-documentation.docx"))
