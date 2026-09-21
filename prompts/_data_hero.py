# -*- coding: utf-8 -*-
from _gen import block, emit

FLAT = ("Flat color regions with NO shading inside hair, tunic, belt, trousers or boots (each must be a "
"single solid fill color) so the palette can be swapped at runtime by the paper-doll system. "
"Hair/helm #f2c14e, tunic #7f45b8, belt #c86ee0, trousers #3c2154, boots #5c3f2a, skin #f0c79c, "
"outline #0d0b14. Facing right. Feet on the bottom pixel row of every frame.")

H=[
("HERO-01","hero_idle","idle",2,32,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, standing idle, gentle breathing loop: frame 1 neutral, frame 2 chest and hair raised by 2 pixels. Tiny sword sheathed at the hip."),
("HERO-02","hero_run","run cycle",4,64,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, running to the right, 4-frame cycle: contact, passing, contact opposite, passing opposite. Arms swinging, hair trailing back, one pixel of vertical bob."),
("HERO-03","hero_jump","jump",1,16,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, at the top of a jump, body rising, knees tucked up, arms out for balance, hair pushed down by the upward motion."),
("HERO-04","hero_fall","fall",1,16,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, falling, legs extended downward and apart, arms raised, hair blown upward."),
("HERO-05","hero_attack","attack swing",3,48,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, swinging a sword to the right, 3 frames: wind-up with the blade pulled back behind the head, mid-slash with the blade horizontal in front, recover with the blade low and the body settling. Body stays inside the frame, feet never leave the bottom row."),
("HERO-06","hero_hurt","hurt / knockback",1,16,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, taking a hit, torso leaning back to the left, head snapped back, one arm flung up, knees bent."),
("HERO-07","hero_death","death",4,64,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, dying, 4 frames: stagger, drop to one knee, collapse forward, lying flat on the ground with the sword fallen beside. Final frame occupies only the lower third of the frame."),
("HERO-08","hero_dash","dash / roll",3,48,"Heroic adventurer, chunky expressive proportions with a readable face (eyes, mouth) now that the sprite is 32x32, dashing right, 3 frames: crouched launch, body leaning far forward low to the ground with a 4-pixel afterimage streak behind, recovery upright."),
]
items=[{"id":i,"file":f+".png","size":"%dx32 — %d frame @32x32"%(w*2,n) if n>1 else "32x32 — 1 frame",
        "prompt":block(w,16,s,n=n,fw=16,fh=16,extra=FLAT)} for i,f,lbl,n,w,s in H]
emit("02_HERO.md","Batch 2 — Hero (8 sheet)",
"PENTING: sistem paper doll me-remap warna hero saat pakai armor, jadi tiap region HARUS flat satu warna tanpa shading di dalamnya.",
items)
