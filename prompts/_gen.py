# -*- coding: utf-8 -*-
import os, io

PALETTE = """Ink/outline  #0d0b14  #1c1a2b
Stone        #2a2740  #514c72  #6f6a90  #9b96b8  #d8d5e8
Gold         #8a7440  #f2c14e  #fff0a8
Ember        #8a3b2a  #e8743b
Blood        #6e1b28  #c0303c  #8a4550
Green        #1b4436  #2f7d4f  #5cbf62  #a3e86b
Blue         #16324f  #2f6fa8  #4fb3e0  #a8e4ff
Purple       #1e0f2a  #3c2154  #7f45b8  #c86ee0  #a89bff
Wood/leather #2e2018  #5c3f2a  #8a6340  #b98d5c
Skin         #f0c79c"""

PREFIX = ("Pixel art sprite, strict 1:1 pixel grid, no anti-aliasing, no blur, no gradients, "
"hard-edged pixels only, transparent PNG background (alpha), no drop shadow, no text, "
"no watermark, no border frame, single object centered, orthographic side view, "
"dark-fantasy dungeon crawler style, limited palette (max 12 colors), crisp near-black "
"outline (#0d0b14). Output exactly {W}x{H} pixels.")

ANIM = ("Horizontal sprite sheet, {N} frames in a single row, each frame exactly {FW}x{FH} px, "
"identical pivot and baseline across frames, no gap between frames.")

TILE = "Seamlessly tileable on all 4 edges, edge pixels must wrap."
BG   = "Full-bleed opaque background, horizontally loopable, no alpha."

SCALE = 2  # game internal res 640x360, TILE 32 (was 320x180 / 16)

DIMS = {}

def block(w,h,subject,n=1,fw=None,fh=None,extra=None,kind=None):
    w*=SCALE; h*=SCALE
    if fw: fw*=SCALE
    if fh: fh*=SCALE
    parts=[PREFIX.format(W=w,H=h)]
    if kind=="tile": parts.append(TILE)
    if kind=="bg":   parts.append(BG)
    if n>1: parts.append(ANIM.format(N=n,FW=fw or w,FH=fh or h))
    parts.append(subject.strip())
    parts.append("Design for a 640x360 game screen at tile size 32x32: the silhouette must read clearly at 100% zoom.")
    if extra: parts.append(extra.strip())
    p = " ".join(parts)
    lbl = "%dx%d" % (w, h)
    if n > 1: lbl += " — %d frame @%dx%d" % (n, fw or w, fh or h)
    DIMS[p] = lbl
    return p

def emit(fname,title,intro,items):
    out=io.StringIO()
    out.write("# %s\n\n" % title)
    out.write("> Prompt di bawah sudah FULL-EXPANDED (prefix + ukuran + frame + palette).\n")
    out.write("> Tinggal copy satu blok utuh, paste ke Claude chat. Satu blok = satu file PNG.\n\n")
    if intro: out.write(intro.strip()+"\n\n")
    out.write("**PALET RESMI GAME — jangan bikin warna baru:**\n\n```\n%s\n```\n\n---\n\n" % PALETTE)
    for it in items:
        out.write("## %s — `%s` (%s)\n\n" % (it["id"], it["file"], (DIMS.get(it["prompt"]) or it["size"])))
        out.write("```text\n%s\n```\n\n" % it["prompt"])
    open(fname,"w",encoding="utf-8").write(out.getvalue())
    print("wrote %s (%d prompts)" % (fname,len(items)))
