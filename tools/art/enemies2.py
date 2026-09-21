# -*- coding: utf-8 -*-
"""Redraw the nine secondary enemies chibi, at 2x detail.

Round chibi bodies are plotted rather than typed: an ellipse drawn by hand at
this size reliably ends up lopsided. Logical footprints are exactly double the
old art, so collision boxes and spawn spacing are untouched, and the palette
letters are unchanged so every recolour keeps working.
"""
import io
import os
import re

# Repo root, derived from this file's location so the generators can be run
# from anywhere without editing a hardcoded path.
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "src", "entities", "enemies2.js")


class G(object):
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [['.'] * w for _ in range(h)]

    def put(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return '.'

    def rect(self, x0, y0, w, h, c):
        for y in range(int(y0), int(y0 + h)):
            for x in range(int(x0), int(x0 + w)):
                self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c, width=1):
        steps = int(max(abs(x1 - x0), abs(y1 - y0)))
        for i in range(steps + 1):
            t = i / float(steps) if steps else 0
            x = x0 + (x1 - x0) * t
            y = y0 + (y1 - y0) * t
            for d in range(width):
                self.put(x + d, y, c)

    def ellipse(self, cx, cy, rx, ry, fill, edge=None):
        for y in range(self.h):
            for x in range(self.w):
                dx = (x + 0.5 - cx) / float(rx)
                dy = (y + 0.5 - cy) / float(ry)
                d = dx * dx + dy * dy
                if d <= 1.0:
                    self.put(x, y, fill)
        if edge:
            self.outline(edge, only=fill)

    def outline(self, c, only=None):
        """Ring the filled mass with an outline colour."""
        add = []
        for y in range(self.h):
            for x in range(self.w):
                if self.get(x, y) != '.':
                    continue
                for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = self.get(x + ox, y + oy)
                    if n != '.' and (only is None or n == only):
                        add.append((x, y))
                        break
        for x, y in add:
            self.put(x, y, c)

    def eyes(self, cx, cy, gap, rx, ry, sclera, pupil, glint=None):
        for side in (-1, 1):
            ex = cx + side * gap
            for y in range(self.h):
                for x in range(self.w):
                    dx = (x + 0.5 - ex) / float(rx)
                    dy = (y + 0.5 - cy) / float(ry)
                    if dx * dx + dy * dy <= 1.0:
                        self.put(x, y, sclera)
            self.rect(ex - rx / 2.0, cy - ry / 2.0, max(1, rx), max(1, ry), pupil)
            if glint:
                self.put(ex - rx / 2.0, cy - ry / 2.0, glint)

    def hurt_eyes(self, cx, cy, gap, r, c):
        """Eyes screwed into crosses. Same anchor points as `eyes`, so the hurt
        frame lines up exactly with the resting one."""
        for side in (-1, 1):
            ex = cx + side * gap
            for d in range(-r, r + 1):
                self.put(ex + d, cy + d, c)
                self.put(ex + d, cy - d, c)

    def rows(self):
        return [''.join(r) for r in self.g]


def spitter(hurt=False):
    g = G(24, 24)
    g.ellipse(12, 11, 11, 11, 'L')
    g.ellipse(12, 12, 9.5, 9.5, 'l')
    g.ellipse(12, 12, 8.5, 8.5, 'L')
    # big circular maw
    if hurt:
        g.ellipse(12, 12, 6.5, 6.5, 'k')
        g.ellipse(12, 12, 5.2, 2.0, 'R')
        g.hurt_eyes(12, 8, 5, 2, 'k')
    else:
        g.ellipse(12, 12, 6.5, 6.5, 'k')
        g.ellipse(12, 12, 5.2, 5.2, 'R')
        g.ellipse(12, 13, 3.0, 3.0, 'r')
    # squat armoured base
    g.rect(4, 18, 16, 4, 'e')
    g.rect(6, 21, 12, 2, 'E')
    g.outline('k')
    return g.rows()


def spitter_open():
    """Mouth thrown wide with a ring of teeth, so the wind-up frame reads as a
    different pose and not just a slightly bigger circle."""
    g = G(24, 24)
    g.ellipse(12, 11, 11, 11, 'L')
    g.ellipse(12, 12, 10.0, 10.0, 'l')
    g.ellipse(12, 12, 9.0, 9.0, 'k')
    g.ellipse(12, 12, 8.0, 8.0, 'R')
    g.ellipse(12, 13, 5.4, 5.4, 'r')
    # ring of teeth around the open maw
    for i in range(8):
        import math
        a = i * math.pi / 4 + math.pi / 8
        g.put(12 + math.cos(a) * 7.4, 12 + math.sin(a) * 7.4, 'W')
        g.put(12 + math.cos(a) * 6.4, 12 + math.sin(a) * 6.4, 'W')
    # acid drool
    g.rect(9, 20, 2, 3, 'L')
    g.rect(15, 20, 2, 2, 'L')
    g.rect(4, 19, 16, 3, 'e')
    g.rect(6, 21, 12, 2, 'E')
    g.outline('k')
    return g.rows()


def spider(tuck=False, hurt=False):
    """Chibi cave spider. The body is drawn in 'p' rather than 'K' -- 'K' is
    #1c1a2b, near enough to the dungeon background that the body vanished."""
    g = G(24, 20)
    body_r = 6.0 if not tuck else 7.5
    if not tuck:
        # eight legs, four a side, sweeping out and then down
        for ay, by in ((6, 2), (8, 5), (10, 9), (12, 13)):
            g.line(8, ay, 2, by, 'D', 2)
            g.line(16, ay, 21, by, 'D', 2)
            g.line(2, by, 2, by + 4, 'D', 2)
            g.line(21, by, 21, by + 4, 'D', 2)
    else:
        # tucked into a ball: legs folded tight against the body
        for ay in (6, 9, 12):
            g.line(6, ay, 3, ay + 2, 'D', 2)
            g.line(17, ay, 20, ay + 2, 'D', 2)

    g.ellipse(12, 11, body_r + 1, body_r, 'p')
    g.ellipse(12, 12, body_r - 1.5, body_r - 2.5, 'P')
    if not tuck:
        g.ellipse(12, 8, 5.5, 4.0, 'p')
        if hurt:
            g.hurt_eyes(12, 8, 3, 2, 'k')
        else:
            g.eyes(12, 8, 3, 2, 2, 'W', 'k')
    else:
        # curled up: a couple of dull eyes and a chitin ridge
        g.rect(8, 9, 2, 2, 'w')
        g.rect(14, 9, 2, 2, 'w')
    g.outline('k', only='p')
    return g.rows()


def bomber(hurt=False):
    g = G(24, 24)
    g.ellipse(12, 13, 10, 9.5, 't')
    g.ellipse(12, 14, 8.5, 8, 'o')
    # glowing cracked belly
    g.ellipse(12, 15, 5.5, 5, 'y')
    g.ellipse(12, 15, 3.0, 2.8, 'Y')
    for x0, y0, x1, y1 in ((7, 11, 10, 16), (16, 11, 13, 17), (12, 9, 12, 12)):
        g.line(x0, y0, x1, y1, 't', 1)
    if hurt:
        g.hurt_eyes(12, 7, 4, 3, 'k')
    else:
        g.eyes(12, 7, 4, 2, 2, 'W', 'R')
    g.rect(8, 21, 3, 2, 't')
    g.rect(13, 21, 3, 2, 't')
    g.outline('k')
    return g.rows()


def shielder(hurt=False):
    g = G(24, 32)
    # helmeted head
    g.ellipse(14, 8, 7, 7, 'G')
    g.ellipse(14, 7, 6, 6, 'g')
    g.rect(9, 8, 11, 3, 'k')
    if hurt:
        g.rect(11, 9, 2, 1, 'x')
        g.rect(16, 9, 2, 1, 'x')
    else:
        g.rect(11, 9, 2, 1, 'R')
        g.rect(16, 9, 2, 1, 'R')
    # body
    g.rect(9, 15, 11, 12, 'g')
    g.rect(10, 27, 4, 4, 'x')
    g.rect(15, 27, 4, 4, 'x')
    # tower shield covering the front
    g.rect(2, 9, 7, 20, 'G')
    g.rect(3, 10, 5, 18, 'g')
    g.rect(4, 13, 3, 12, 'G')
    g.rect(5, 16, 1, 6, 'W')
    g.outline('k')
    return g.rows()


def wraith(hurt=False):
    g = G(24, 28)
    # hood
    g.ellipse(12, 9, 8, 8, 'P')
    g.ellipse(12, 10, 6.5, 6.5, 'p')
    if hurt:
        g.hurt_eyes(12, 9, 3, 3, 'm')
    else:
        g.eyes(12, 9, 3, 2, 2, 'm', 'W')
    # tattered body, dithered as it fades downward
    for y in range(15, 28):
        span = 9 - (y - 15) // 3
        for x in range(12 - span, 12 + span):
            if y < 20:
                g.put(x, y, 'P')
            elif (x + y) % 2 == 0:
                g.put(x, y, 'p')
            elif (x * 2 + y) % 5 == 0:
                g.put(x, y, 'P')
    g.outline('k', only='P')
    return g.rows()


def necro(hurt=False):
    g = G(20, 32)
    # skull in a hood
    g.ellipse(9, 8, 6.5, 7, 'E')
    g.ellipse(9, 8, 5, 5.5, 'w')
    if hurt:
        g.hurt_eyes(9, 8, 2.5, 2, 'k')
    else:
        g.eyes(9, 8, 2.5, 2, 2, 'k', 'L')
    g.rect(7, 11, 5, 1, 'k')
    # robe
    for y in range(14, 32):
        span = 4 + (y - 14) // 3
        g.rect(9 - span, y, span * 2, 1, 'e')
        if y % 4 == 0:
            g.rect(9 - span + 1, y, 2, 1, 'E')
    # staff with green flame
    g.line(16, 6, 16, 31, 'n', 1)
    g.ellipse(16, 4, 2.5, 3, 'L')
    g.ellipse(16, 4, 1.2, 1.6, 'Y')
    g.outline('k', only='e')
    g.outline('k', only='E')
    return g.rows()


def golem(hurt=False):
    g = G(32, 36)
    # blocky head
    g.rect(11, 2, 10, 8, 'D')
    g.rect(12, 3, 8, 6, 'x')
    g.rect(13, 5, 2, 2, 'x' if hurt else 'y')
    g.rect(17, 5, 2, 2, 'x' if hurt else 'y')
    # torso
    g.rect(8, 11, 16, 14, 'D')
    g.rect(9, 12, 14, 12, 'x')
    # glowing runic seams
    for y in (14, 18, 22):
        g.rect(11, y, 10, 1, 'y')
    g.rect(15, 12, 2, 12, 'y')
    # heavy fists
    g.rect(2, 13, 6, 8, 'D')
    g.rect(24, 13, 6, 8, 'D')
    g.rect(3, 14, 4, 6, 'B')
    g.rect(25, 14, 4, 6, 'B')
    # legs
    g.rect(10, 26, 5, 9, 'D')
    g.rect(17, 26, 5, 9, 'D')
    g.rect(9, 33, 7, 3, 'x')
    g.rect(16, 33, 7, 3, 'x')
    g.outline('k')
    return g.rows()


def golem_pound():
    """Same golem with both fists driven down into the ground."""
    g = G(32, 36)
    g.rect(11, 2, 10, 8, 'D')
    g.rect(12, 3, 8, 6, 'x')
    g.rect(13, 5, 2, 2, 'y')
    g.rect(17, 5, 2, 2, 'y')
    g.rect(8, 11, 16, 14, 'D')
    g.rect(9, 12, 14, 12, 'x')
    for y in (14, 18, 22):
        g.rect(11, y, 10, 1, 'Y')
    g.rect(15, 12, 2, 12, 'Y')
    # fists slammed down beside the legs rather than held out at the sides
    g.rect(2, 24, 6, 9, 'D')
    g.rect(24, 24, 6, 9, 'D')
    g.rect(3, 25, 4, 7, 'B')
    g.rect(25, 25, 4, 7, 'B')
    # braced, wider stance
    g.rect(10, 26, 5, 8, 'D')
    g.rect(17, 26, 5, 8, 'D')
    g.rect(8, 32, 8, 4, 'x')
    g.rect(16, 32, 8, 4, 'x')
    g.outline('k')
    return g.rows()


BUILDERS = [
    ("SPITTER", spitter, 24, 24),
    ("SPITTER_OPEN", spitter_open, 24, 24),
    ("SPIDER", lambda: spider(False), 24, 20),
    ("SPIDER_TUCK", lambda: spider(True), 24, 20),
    ("BOMBER", bomber, 24, 24),
    ("SHIELDER", shielder, 24, 32),
    ("WRAITH", wraith, 24, 28),
    ("NECRO", necro, 20, 32),
    ("GOLEM", golem, 32, 36),
    ("GOLEM_POUND", golem_pound, 32, 36),
    ("SPIDER_HURT", lambda: spider(False, True), 24, 20),
    ("SPITTER_HURT", lambda: spitter(True), 24, 24),
    ("BOMBER_HURT", lambda: bomber(True), 24, 24),
    ("SHIELDER_HURT", lambda: shielder(True), 24, 32),
    ("WRAITH_HURT", lambda: wraith(True), 24, 28),
    ("NECRO_HURT", lambda: necro(True), 20, 32),
    ("GOLEM_HURT", lambda: golem(True), 32, 36),
]


def rows_js(name, rows):
    body = ",\n".join("    '%s'" % r for r in rows)
    return "  const %s = [\n%s\n  ];" % (name, body)


def main():
    s = io.open(SRC, encoding="utf-8").read()
    for name, fn, w, h in BUILDERS:
        rows = fn()
        bad = [(i, len(r)) for i, r in enumerate(rows) if len(r) != w]
        assert not bad, (name, bad[:3])
        assert len(rows) == h, (name, len(rows), h)
        if name == "GOLEM_POUND":
            # was derived as GOLEM.slice(0, 13) + legs; now a standalone pose
            pat = (r"  const GOLEM_POUND = GOLEM\.slice\(0, 13\)\.concat\(\[\n"
                   r"(?:.*?\n)*?  \]\);")
            if not re.search(pat, s):
                pat = r"  const GOLEM_POUND = \[\n(?:.*?\n)*?  \];"
        else:
            pat = r"  const %s = \[\n(?:.*?\n)*?  \];" % name
        block = rows_js(name, rows)
        if re.search(pat, s):
            s = re.sub(pat, lambda m: block, s, count=1)
        else:
            # A newly introduced pose: drop it in just above the sheet baker.
            anchor = "  function sheet(frames, pal) {"
            assert anchor in s, "sheet() anchor missing"
            s = s.replace(anchor, block + "\n\n" + anchor, 1)
        print("%-13s %2dx%-2d -> %dx%d logical" % (name, w, h, w // 2, h // 2))

    old = "    return frames.map(function (rows) { return A.makeSprite(rows, pal); });"
    new = "    return frames.map(function (rows) { return A.makeSprite(rows, pal, ENEMY2_D); });"
    if old in s:
        s = s.replace(old, new)

    if "const ENEMY2_D" not in s:
        anchor = "  const SPITTER = ["
        note = """  /* Drawn chibi at 2x detail: the art grid is double, the logical footprint is
     exactly what it was, so collision boxes and spawn spacing are untouched. */
  const ENEMY2_D = 2;

"""
        assert anchor in s
        s = s.replace(anchor, note + anchor, 1)


    # Every registration ends with its hurt frame at index 2. Monsters with a
    # single pose repeat it at index 1 so the wind-up lookup still lands on a
    # valid frame.
    for old_f, new_f in [('[SPITTER, SPITTER_OPEN]', '[SPITTER, SPITTER_OPEN, SPITTER_HURT]'), ('[SPIDER, SPIDER_TUCK]', '[SPIDER, SPIDER_TUCK, SPIDER_HURT]'), ('[BOMBER]', '[BOMBER, BOMBER, BOMBER_HURT]'), ('[SHIELDER]', '[SHIELDER, SHIELDER, SHIELDER_HURT]'), ('[WRAITH]', '[WRAITH, WRAITH, WRAITH_HURT]'), ('[NECRO]', '[NECRO, NECRO, NECRO_HURT]'), ('[GOLEM, GOLEM_POUND]', '[GOLEM, GOLEM_POUND, GOLEM_HURT]')]:
        if new_f not in s:
            assert old_f in s, "registration not found: " + old_f
            s = s.replace(old_f, new_f)

    io.open(SRC, "w", encoding="utf-8").write(s)
    print("enemies2.js written")


if __name__ == "__main__":
    main()
