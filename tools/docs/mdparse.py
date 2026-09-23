# -*- coding: utf-8 -*-
"""Parse the Markdown chapters in docs/ into one ordered block list.

One parser, two renderers (tools/docs/build_docx.py for Word, tools/docs/
build_html.py for the PDF), so the Word file and the PDF can never disagree
about what the document says.

The subset is deliberately small -- it is exactly what the chapters use:

    # .. ####            headings (auto-numbered by the Word renderer)
    paragraph            **bold**, *italic*, `code`
    - item               bullets (two-space indent nests)
    1. item              numbered list
    | a | b |            table, first row is the header
    ```..```             code block
    > text               callout
    ![caption](path)     image + caption
    ---                  horizontal rule
    [[TOC]]              table of contents
    [[PAGEBREAK]]        hard page break
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _flush_paragraph(buf):
    return {"type": "para", "text": " ".join(buf)}


def parse(text):
    """Markdown text -> list of block dicts."""
    blocks = []
    lines = text.replace("\r\n", "\n").split("\n")
    i = 0
    while i < len(lines):
        line = lines[i]

        if line.strip() == "[[TOC]]":
            blocks.append({"type": "toc"})
            blocks.append({"type": "pagebreak"})
            i += 1
            continue

        if line.strip() == "[[PAGEBREAK]]":
            blocks.append({"type": "pagebreak"})
            i += 1
            continue

        if line.startswith("```"):
            lang = line.strip()[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            blocks.append({"type": "code", "lang": lang, "lines": buf})
            continue

        m = re.match(r"^(#{1,4})\s+(.*)$", line)
        if m:
            blocks.append({"type": "heading", "level": len(m.group(1)),
                           "text": m.group(2).strip()})
            i += 1
            continue

        m = re.match(r"^!\[(.*?)\]\((.*?)\)\s*$", line.strip())
        if m:
            src = m.group(2)
            path = src if os.path.isabs(src) else os.path.join(ROOT, src)
            blocks.append({"type": "image", "caption": m.group(1),
                           "src": src, "path": path})
            i += 1
            continue

        if line.strip() == "---":
            blocks.append({"type": "hr"})
            i += 1
            continue

        if line.strip().startswith("> "):
            buf = []
            while i < len(lines) and lines[i].strip().startswith("> "):
                buf.append(lines[i].strip()[2:])
                i += 1
            blocks.append({"type": "quote", "text": " ".join(buf)})
            continue

        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[\s:|-]+\|$", lines[i + 1].strip()):
            rows = [[c.strip() for c in line.strip().strip("|").split("|")]]
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            blocks.append({"type": "table", "rows": rows})
            continue

        m = re.match(r"^(\s*)([-*])\s+(.*)$", line)
        if m:
            blocks.append({"type": "bullet", "depth": min(2, len(m.group(1)) // 2),
                           "text": m.group(3)})
            i += 1
            continue

        m = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if m:
            blocks.append({"type": "number", "depth": min(2, len(m.group(1)) // 2),
                           "text": m.group(3), "n": m.group(2)})
            i += 1
            continue

        if not line.strip():
            i += 1
            continue

        buf = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(
                r"^(#{1,4}\s|```|\||> |---|!\[|\s*[-*]\s|\s*\d+\.\s|\[\[)", lines[i]):
            buf.append(lines[i].strip())
            i += 1
        blocks.append(_flush_paragraph(buf))

    return blocks


def chapters():
    """docs/NN-*.md in filename order."""
    out = []
    for name in sorted(os.listdir(os.path.join(ROOT, "docs"))):
        if name.endswith(".md") and re.match(r"^\d\d", name):
            out.append(os.path.join(ROOT, "docs", name))
    return out


def load_all():
    """[(title, blocks)] for every chapter, title taken from its first heading."""
    out = []
    for path in chapters():
        with open(path, "r", encoding="utf-8") as fh:
            blocks = parse(fh.read())
        title = ""
        for b in blocks:
            if b["type"] == "heading" and b["level"] == 1:
                title = b["text"]
                break
        out.append((title or os.path.basename(path), blocks))
    return out


INLINE = re.compile(r"(\*\*.+?\*\*|\*[^*]+?\*|`[^`]+?`)")


def inline(text):
    """[(kind, text)] where kind is plain / bold / italic / code."""
    out = []
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4:
            out.append(("bold", part[2:-2]))
        elif part.startswith("`") and part.endswith("`") and len(part) > 2:
            out.append(("code", part[1:-1]))
        elif part.startswith("*") and part.endswith("*") and len(part) > 2:
            out.append(("italic", part[1:-1]))
        else:
            out.append(("plain", part))
    return out
