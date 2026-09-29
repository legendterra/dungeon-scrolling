/* HTML menus (v6): the title screen over the camp diorama, the name prompt,
   the loadout, how-to-play, records, the pause screen and the run summary.

   The scenes still own the logic. src/scenes/menu.js keeps its state object
   and its keyboard/gamepad handling and hands this module a small `act`
   table for the mouse (choose an entry, start a run, go back); the pause
   screen (src/ui/profile.js) does the same with the run. This module only
   turns that state into DOM and routes clicks back -- which is what keeps
   keyboard, gamepad and mouse on one cursor. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const K = function () { return DS.HKit; };
  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }

  const VERSION = DS.VERSION || 'v7.0.0';

  // --- shared: the controls sheet -------------------------------------------

  const CONTROLS = [
    { group: 'MOVE', rows: [
      [['A', 'D'], 'Run'],
      [['SPACE'], 'Jump · again in the air'],
      [['SHIFT'], 'Dash'],
      [['RMB', 'C'], 'Mini dash · two charges']
    ] },
    { group: 'FIGHT', rows: [
      [['J', 'LMB'], 'Attack · chain the combo'],
      [['HOLD J'], 'Charge a heavy blow'],
      [['E'], 'Weapon skill · mana'],
      [['X'], 'Ultimate · mana'],
      [['Q'], 'Swap hands']
    ] },
    { group: 'ELEMENTS', rows: [
      [['R'], 'Infuse · next known essence'],
      [['T'], 'Infuse · previous essence'],
      [['MOUSE'], 'Aim · arrows and bolts fly at it']
    ] },
    { group: 'WORLD', rows: [
      [['F'], 'Interact · open · pick up'],
      [['TAB', 'B'], 'Bag and equipment'],
      [['ESC', 'P'], 'Pause']
    ] }
  ];

  function controlsSheet(compact) {
    const wrap = h('div', 'hm-controls' + (compact ? ' is-compact' : ''));
    const groups = DS.Input && DS.Input.controlGroups ? DS.Input.controlGroups() : CONTROLS;
    for (let i = 0; i < groups.length; i++) {
      const grp = groups[i];
      const list = h('div', 'hm-ctl-list');
      for (let r = 0; r < grp.rows.length; r++) {
        const keys = h('span', 'hm-ctl-keys');
        const ks = grp.rows[r][0];
        for (let k = 0; k < ks.length; k++) {
          if (k) keys.appendChild(h('span', 'hm-ctl-or', { text: '/' }));
          keys.appendChild(K().keycap(ks[k]));
        }
        list.appendChild(h('div', 'hm-ctl-row', null, [keys, h('span', 'hm-ctl-label', { text: grp.rows[r][1] })]));
      }
      wrap.appendChild(h('div', 'hm-ctl-group', null, [h('div', 'hk-section-label', { text: grp.group }), list]));
    }
    return wrap;
  }

  function formatTime(frames) {
    const total = Math.floor((frames || 0) / 60);
    const m = Math.floor(total / 60), s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function tile(label, value, cls) {
    return h('div', 'hm-tile' + (cls ? ' ' + cls : ''), null, [
      h('div', 'hm-tile-val ui-num', { text: value }),
      h('div', 'hm-tile-label', { text: label })
    ]);
  }

  function button(label, cls, onClick, onEnter) {
    const b = h('button', 'ui-btn hm-btn' + (cls ? ' ' + cls : ''), { type: 'button', tabindex: '-1' }, [
      h('span', 'hm-btn-label', { text: label })
    ]);
    if (onClick) b.addEventListener('click', onClick);
    if (onEnter) b.addEventListener('pointerenter', onEnter);
    return b;
  }

  // --- title screen ---------------------------------------------------------

  const ITEMS = [
    { label: 'START RUN', desc: 'Choose your steel and descend' },
    { label: 'HOW TO PLAY', desc: 'Controls, elements and the rules of the dungeon' },
    { label: 'RECORDS', desc: 'Your deepest runs and finest steel' },
    { label: 'OPTIONS', desc: 'Graphics, audio, controls and more' }
  ];

  const M = { nodes: [], bar: null };

  function lockup() {
    return h('div', 'hm-lockup', null, [
      h('div', 'hm-kicker', { text: 'ONE LIFE · THREE ACTS · ENDLESS DEPTHS' }),
      h('div', 'hm-word', null, [
        h('span', 'hm-word-a', { text: 'DUNGEON' })
      ]),
      h('div', 'hm-word-b', null, [
        h('i', 'hm-word-line'), h('span', '', { text: 'SCROLLING' }), h('i', 'hm-word-line')
      ])
    ]);
  }

  function mainMenu(state, act) {
    const s = K().screen('menu');
    K().rebuild(s, 'main|' + Math.round(DS.HUI.frame.h), function (root) {
      M.nodes = [];
      const list = h('nav', 'hm-list');
      M.bar = h('div', 'hm-bar');
      list.appendChild(M.bar);
      for (let i = 0; i < ITEMS.length; i++) {
        const label = ITEMS[i].label;
        const item = h('button', 'hm-item', { type: 'button', tabindex: '-1' }, [
          h('span', 'hm-idx ui-num', { text: '0' + (i + 1) }),
          h('span', 'hm-item-text', null, [
            h('span', 'hm-item-label', { text: label }),
            h('span', 'hm-item-desc', { text: ITEMS[i].desc })
          ]),
          h('span', 'hm-item-chev', { text: '›' })
        ]);
        item.addEventListener('pointerenter', function () { act.focus(i); });
        item.addEventListener('click', function () { act.choose(i); });
        M.nodes.push(item);
        list.appendChild(item);
      }
      root.appendChild(h('div', 'hm-title-scrim'));
      root.appendChild(h('div', 'hm-title-col', null, [lockup(), list]));
      root.appendChild(h('footer', 'hm-title-foot', null, [
        h('span', 'hm-version ui-num', { text: VERSION }),
        h('span', 'hm-foot-sep'),
        h('span', 'hm-oneLife', null, [h('i', 'hm-skull'), h('span', '', { text: 'ONE LIFE PER RUN' })]),
        h('span', 'hk-mast-fill'),
        K().hints([['↑ ↓', 'Select'], ['ENTER', 'Confirm']])
      ]));
    });
    K().setFocus(M.nodes, state.cursor);
    const node = M.nodes[state.cursor];
    if (node && M.bar) {
      M.bar.style.transform = 'translateY(' + node.offsetTop + 'px)';
      M.bar.style.height = node.offsetHeight + 'px';
    }
  }

  // --- name prompt ----------------------------------------------------------

  function namePrompt(state, act) {
    const s = K().screen('name');
    const caret = (state.frame % 40) < 24;
    K().rebuild(s, 'name', function (root) {
      root.appendChild(h('div', 'hm-scrim-full'));
      const field = h('div', 'hm-field', null, [h('span', 'hm-field-text'), h('span', 'hm-caret')]);
      const confirm = button('THAT IS ME', 'is-primary', function () { act.confirmName(); });
      const back = button('BACK', '', function () { act.back(); });
      root.appendChild(h('div', 'hm-center', null, [
        h('div', 'ui-panel hm-name', null, [
          h('div', 'hk-eyebrow', { text: 'A NEW DESCENT' }),
          h('div', 'hm-name-title', { text: 'Who are you?' }),
          h('div', 'hm-name-sub', { text: 'This name rides with you into the dungeon, and onto the ladder.' }),
          field,
          h('div', 'hm-note'),
          h('div', 'hm-row', null, [back, confirm])
        ])
      ]));
      root.appendChild(K().foot([['TYPE', 'Your name'], ['ENTER', 'Confirm'], ['ESC', 'Back']]));
    });
    const text = s.root.querySelector('.hm-field-text');
    const shown = state.typed.toUpperCase();
    if (text.textContent !== shown) text.textContent = shown;
    s.root.querySelector('.hm-caret').classList.toggle('is-on', caret);
    const note = s.root.querySelector('.hm-note');
    if (note.textContent !== (state.note || '')) note.textContent = state.note || '';
    s.root.querySelector('.hm-field').classList.toggle('is-bad', !!state.note);
  }

  // --- loadout --------------------------------------------------------------

  const ROLE = { sword: 'BALANCED', dagger: 'ASSASSIN', spear: 'LANCER', greataxe: 'BRUISER', bow: 'RANGER', staff: 'CASTER' };
  const STEP_NAME = {
    slashH: 'Slash', slashUp: 'Rising Cut', spin: 'Whirlwind', crossA: 'Cross', crossB: 'Cross',
    dashStab: 'Dash Stab', cleave: 'Cleave', slam: 'Ground Slam', thrust: 'Thrust', sweep: 'Sweep'
  };
  const RELEASE_CHAIN = {
    bow: ['Hold · Draw', 'Release · Loose', 'Full draw · Pierce'],
    staff: ['Hold · Charge', 'Release · Bolt', 'Full charge · Burst']
  };
  const L = { nodes: [] };

  function comboChain(key) {
    const C = DS.Combos && DS.Combos.forWeapon ? DS.Combos.forWeapon(key) : null;
    if (!C) return RELEASE_CHAIN[key] || ['Attack'];
    const out = C.steps.map(function (st) { return STEP_NAME[st.key] || st.key; });
    if (C.heavy) out.push('Hold · Heavy');
    return out;
  }

  function norm(key) {
    const W = DS.Weapons.WEAPONS;
    const b = W[key];
    return {
      power: b.damage / 17,
      speed: (60 / b.cooldown) / (60 / 13),
      crit: b.crit / 0.26,
      reach: b.ranged ? 1 : (b.hit ? b.hit.w / 34 : 0.6)
    };
  }

  function meter(label, v) {
    const m = h('div', 'hm-meter', null, [
      h('span', 'hm-meter-label', { text: label }),
      h('span', 'hm-meter-track', null, [h('i', 'hm-meter-fill')])
    ]);
    m.querySelector('.hm-meter-fill').style.width = Math.round(Math.max(0.08, Math.min(1, v)) * 100) + '%';
    return m;
  }

  function weaponCard(key, i, act) {
    const b = DS.Weapons.WEAPONS[key];
    const n = norm(key);
    const card = h('button', 'hm-wcard', { type: 'button', tabindex: '-1' }, [
      h('div', 'hm-wcard-top', null, [
        h('span', 'hm-wcard-idx ui-num', { text: '0' + (i + 1) }),
        h('span', 'hm-wcard-tag' + (b.ranged ? ' is-ranged' : ''), { text: b.ranged ? 'RANGED' : 'MELEE' })
      ]),
      h('div', 'hm-wcard-art', null, [h('i', 'hm-wcard-glow'), K().icon(DS.SPR.icon[b.icon], 'hm-wcard-icon')]),
      h('div', 'hm-wcard-name', { text: b.label.toUpperCase() }),
      h('div', 'hm-wcard-role', { text: ROLE[key] || '' }),
      h('div', 'hm-meters', null, [meter('PWR', n.power), meter('SPD', n.speed), meter('CRT', n.crit), meter('RCH', n.reach)])
    ]);
    card.addEventListener('pointerenter', function () { act.pick(i); });
    card.addEventListener('click', function () { act.start(i); });
    return card;
  }

  function loadoutDetail(key) {
    const b = DS.Weapons.WEAPONS[key];
    const chain = comboChain(key);
    const steps = h('div', 'hm-chain');
    for (let i = 0; i < chain.length; i++) {
      if (i) steps.appendChild(h('span', 'hm-chain-arrow', { text: '›' }));
      steps.appendChild(h('span', 'hm-chain-step' + (/Hold|Full/.test(chain[i]) ? ' is-hold' : ''), { text: chain[i] }));
    }
    const names = DS.Skills && DS.Skills.names ? DS.Skills.names({ type: key }) : null;
    return h('div', 'hm-ldetail ui-anim-in', null, [
      h('div', 'hm-ld-main', null, [
        h('div', 'hk-eyebrow', { text: (ROLE[key] || '') + ' · ' + (b.ranged ? 'RANGED' : 'MELEE') }),
        h('div', 'hm-ld-name', { text: b.label }),
        h('div', 'hm-ld-blurb', { text: b.blurb + '.' })
      ]),
      h('div', 'hm-ld-col', null, [
        h('div', 'hk-section-label', { text: b.ranged ? 'HOW IT FIRES' : 'COMBO · ' + (DS.Combos && DS.Combos.length ? DS.Combos.length(key) : 1) + ' HITS' }),
        steps,
        names ? h('div', 'hk-skills', null, [
          h('span', 'hk-skill', null, [K().keycap('E'), h('span', '', { text: names.skill })]),
          h('span', 'hk-skill', null, [K().keycap('X'), h('span', '', { text: names.ult })])
        ]) : null
      ]),
      h('div', 'hm-ld-stats', null, [
        tile('DAMAGE', String(b.damage)),
        tile('HITS / SEC', (60 / b.cooldown).toFixed(1)),
        tile('CRIT', Math.round(b.crit * 100) + '%')
      ])
    ]);
  }

  function loadout(state, act) {
    const s = K().screen('loadout');
    const keys = act.weapons;
    K().rebuild(s, 'loadout|' + Math.round(DS.HUI.frame.h), function (root) {
      L.nodes = [];
      root.appendChild(h('div', 'hm-scrim-full'));
      root.appendChild(K().masthead({
        eyebrow: 'LOADOUT', title: 'Choose your steel', accent: 'var(--gold)',
        sub: 'Every offer is plain steel. The pick decides how the run plays, never how strong it starts.'
      }));
      const row = h('div', 'hm-wcards');
      for (let i = 0; i < keys.length; i++) {
        const c = weaponCard(keys[i], i, act);
        L.nodes.push(c);
        row.appendChild(c);
      }
      L.detail = h('div', 'hm-ldetail-host');
      L.detailKey = '';
      root.appendChild(h('main', 'hk-body hm-loadout', null, [row, L.detail]));
      root.appendChild(K().foot([['← →', 'Choose'], ['ENTER', 'Descend'], ['ESC', 'Back'], ['F2', 'Fullscreen']]));
    });
    K().setFocus(L.nodes, state.pick);
    const key = keys[state.pick];
    if (L.detail && L.detailKey !== key) {
      L.detailKey = key;
      while (L.detail.firstChild) L.detail.removeChild(L.detail.firstChild);
      L.detail.appendChild(loadoutDetail(key));
    }
  }

  // --- how to play ----------------------------------------------------------

  const RULES = [
    ['Steel', 'Skills come from the weapon you hold, and hit harder the rarer it is.'],
    ['Elements', 'Every weapon carries an element. Two elements on one foe react. Essences let R / T infuse any weapon.'],
    ['Chests', 'A keybearer guards every locked chest. Vault chests open when the warden dies.'],
    ['Shrines', 'Take one boon of three. R rerolls the offer for coins.'],
    ['Ground', 'Cracked ledges over a pit give way under you.'],
    ['Death', 'One life. Die and the run is over; only the record survives.']
  ];

  function howTo(state, act) {
    const s = K().screen('help');
    K().rebuild(s, 'help|' + Math.round(DS.HUI.frame.h), function (root) {
      root.appendChild(h('div', 'hm-scrim-full'));
      root.appendChild(K().masthead({ eyebrow: 'GUIDE', title: 'How to play', accent: 'var(--accent)',
        sub: 'Keyboard shown. A gamepad works everywhere too.' }));
      const rules = h('ol', 'hm-rules');
      for (let i = 0; i < RULES.length; i++) {
        rules.appendChild(h('li', 'hm-rule' + (i === RULES.length - 1 ? ' is-danger' : ''), null, [
          h('span', 'hm-rule-name', { text: RULES[i][0] }),
          h('span', 'hm-rule-text', { text: RULES[i][1] })
        ]));
      }
      root.appendChild(h('main', 'hk-body hm-help', null, [
        h('section', 'ui-panel hm-help-controls', null, [h('div', 'hm-panel-title', { text: 'Controls' }), controlsSheet(false)]),
        h('section', 'ui-panel hm-help-rules', null, [h('div', 'hm-panel-title', { text: 'Rules of the dungeon' }), rules])
      ]));
      const back = button('BACK', 'hm-foot-btn', function () { act.back(); });
      root.appendChild(K().foot([['ESC', 'Back']], h('div', 'hk-foot-left', null, [back])));
    });
  }

  // --- records --------------------------------------------------------------

  function records(state, act) {
    const s = K().screen('records');
    const st = state.stats || {};
    const rows = (DS.Board && DS.Board.rows()) || [];
    K().rebuild(s, 'records|' + rows.length + '|' + st.runs + '|' + Math.round(DS.HUI.frame.h), function (root) {
      root.appendChild(h('div', 'hm-scrim-full'));
      root.appendChild(K().masthead({ eyebrow: 'HALL', title: 'Records', accent: 'var(--gold)',
        sub: 'Nothing carries over between runs. This page is what survives.' }));
      const hasBest = st.bestItemRarity >= 0 && st.bestItemName;
      const finest = h('div', 'hm-finest' + (hasBest ? ' ' + K().rarityClass(st.bestItemRarity) : ''), null, [
        h('div', 'hk-section-label', { text: 'FINEST STEEL' }),
        h('div', 'hm-finest-name', { text: hasBest ? st.bestItemName : 'Nothing yet' }),
        hasBest ? K().pips(st.bestItemRarity) : null
      ]);
      root.appendChild(h('main', 'hk-body hm-records', null, [
        h('section', 'hm-rec-left', null, [
          h('div', 'hm-tiles', null, [
            tile('RUNS', String(st.runs || 0)),
            tile('BEST DEPTH', st.bestDepth ? (DS.Acts ? DS.Acts.shortLabel(st.bestDepth) : String(st.bestDepth)) : '—', 'is-gold'),
            tile('TOTAL KILLS', String(st.totalKills || 0)),
            tile('FASTEST CLEAR', st.fastestClearFrames ? formatTime(st.fastestClearFrames) : '—')
          ]),
          finest
        ]),
        ladder(rows, 0)
      ]));
      const back = button('BACK', 'hm-foot-btn', function () { act.back(); });
      root.appendChild(K().foot([['ESC', 'Back']], h('div', 'hk-foot-left', null, [back])));
    });
  }

  function ladder(rows, rank) {
    const list = h('ol', 'hm-ladder-list');
    for (let i = 0; i < rows.length && i < 8; i++) {
      const r = rows[i];
      const mine = DS.Board && DS.Board.name && r.name === DS.Board.name;
      list.appendChild(h('li', 'hm-lrow' + (mine ? ' is-mine' : '') + (r.cleared ? ' is-cleared' : ''), null, [
        h('span', 'hm-lrank ui-num', { text: String(r.rank) }),
        h('span', 'hm-lname', { text: r.name }),
        h('span', 'hm-ldepth ui-num', { text: DS.Acts ? DS.Acts.shortLabel(r.depth) : String(r.depth) })
      ]));
    }
    if (!rows.length) list.appendChild(h('li', 'hm-lempty', { text: 'No runs recorded yet' }));
    return h('section', 'ui-panel hm-ladder', null, [
      h('div', 'hm-ladder-head', null, [
        h('div', 'hm-panel-title', { text: 'Ladder' }),
        h('span', 'hm-online' + (DS.Board && DS.Board.online ? ' is-on' : ''),
          { text: DS.Board && DS.Board.online ? 'ONLINE' : 'THIS DEVICE' })
      ]),
      rank ? h('div', 'hm-yourrank', { text: 'YOUR RUN · RANK #' + rank }) : null,
      list
    ]);
  }

  // --- title-screen dispatch ------------------------------------------------

  function menu(state, act) {
    if (state.page === 'name') namePrompt(state, act);
    else if (state.page === 'loadout') loadout(state, act);
    else if (state.page === 'help') howTo(state, act);
    else if (state.page === 'records') records(state, act);
    else if (state.page === 'options' && state.options) state.options.draw();
    else mainMenu(state, act);
  }

  // --- run summary ----------------------------------------------------------

  const O = { btns: [] };

  function gameOver(state, act) {
    const s = K().screen('over');
    const g = state.g;
    const won = state.won;
    const rows = state.rows || [];
    const sig = 'over|' + won + '|' + rows.length + '|' + state.rank + '|' + (rows[0] ? rows[0].name + rows[0].depth : '') +
      '|' + (state.frame > 30) + '|' + Math.round(DS.HUI.frame.h);
    K().rebuild(s, sig, function (root) {
      O.btns = [];
      root.appendChild(h('div', 'hm-over-scrim' + (won ? ' is-won' : ' is-lost')));
      const best = state.best;
      const record = g.depth >= (state.stats.bestDepth || 0) && g.depth > 0;
      const where = DS.Acts ? DS.Acts.label(g.depth) : 'DEPTH ' + g.depth;
      const weapon = best ? h('div', 'hm-over-weapon ' + K().rarityClass(best.rarity), null, [
        h('div', 'hk-tile ' + K().rarityClass(best.rarity), null, [K().itemIcon(best, 'hk-tile-icon')]),
        h('div', 'hm-ow-text', null, [
          h('div', 'hk-section-label', { text: 'BEST WEAPON' }),
          h('div', 'hm-ow-name', { text: best.name }),
          h('div', 'hm-ow-type', { text: DS.Weapons.rarityLabel(best.rarity).toUpperCase() + ' · ' +
            (DS.Armor.isArmor(best) ? 'ARMOUR' : DS.Weapons.WEAPONS[best.type].label.toUpperCase()) +
            (best.stats && best.stats.damage ? ' · DMG ' + best.stats.damage : '') })
        ])
      ]) : null;

      const btnRow = h('div', 'hm-over-btns');
      if (state.frame > 30) {
        const again = button('RUN AGAIN', 'is-primary', function () { act.again(); }, function () { act.focus(0); });
        const menuB = button('MAIN MENU', '', function () { act.menu(); }, function () { act.focus(1); });
        O.btns.push(again, menuB);
        btnRow.appendChild(again);
        btnRow.appendChild(menuB);
      }

      root.appendChild(h('main', 'hm-over', null, [
        h('section', 'hm-over-hero', null, [
          h('div', 'hm-over-kicker', { text: won ? 'THE DESCENT IS WON' : 'THE DUNGEON KEEPS ANOTHER' }),
          h('div', 'hm-over-title', { text: won ? 'All three acts cleared' : 'Your run ends here' }),
          h('div', 'hm-over-where', null, [
            h('span', 'hm-over-depth ui-num', { text: where }),
            record ? h('span', 'hm-badge', { text: 'NEW RECORD' }) : null
          ]),
          h('div', 'hm-tiles hm-over-stats', null, [
            tile('ENEMIES SLAIN', String(g.kills)),
            tile('TIME', formatTime(g.frames)),
            tile('COINS', String(g.inv.coins), 'is-gold'),
            tile('BEST STREAK', 'x' + (g.streakBest || 0))
          ]),
          weapon,
          h('div', 'hm-over-who', { text: (DS.Board && DS.Board.name) || 'PLAYER' }),
          btnRow
        ]),
        ladder(rows, state.rank)
      ]));
      root.appendChild(K().foot([['← →', 'Select'], ['ENTER', 'Confirm'], ['ESC', 'Main menu']]));
    });
    K().setFocus(O.btns, state.btn || 0);
  }

  // --- pause ----------------------------------------------------------------

  const PAUSE = ['RESUME', 'INVENTORY', 'OPTIONS', 'ABANDON RUN'];
  const P = { nodes: [], side: null, sideKey: '' };

  function pauseState(g) {
    g.profile = g.profile || {};
    const st = g.profile;
    if (st.action == null || st.action >= PAUSE.length) st.action = 0;
    return st;
  }

  function quality() { return DS.PostFX ? DS.PostFX.requested : 'high'; }

  function stepQuality(dir) {
    if (!DS.PostFX) { DS.Audio.play('error'); return; }
    const Q = DS.PostFX.QUALITIES;
    const i = Q.indexOf(quality());
    const next = Q[Math.max(0, Math.min(Q.length - 1, i + dir))];
    if (next === quality()) { DS.Audio.play('error'); return; }
    DS.PostFX.setQuality(next, { lock: true, quiet: true });
    DS.Audio.play('menuMove');
  }

  function setQualityTo(q) {
    if (!DS.PostFX || q === quality()) return;
    DS.PostFX.setQuality(q, { lock: true, quiet: true });
    DS.Audio.play('menuMove');
  }

  function pauseRun(g, i) {
    const st = pauseState(g);
    st.action = i;
    const key = PAUSE[i];
    if (key !== 'ABANDON RUN') st.confirm = false;
    if (key === 'RESUME') { DS.Profile.close(g); return; }
    if (key === 'INVENTORY') { DS.Audio.play('menuPick'); g.paused = false; DS.UI.openBag(g); return; }
    if (key === 'OPTIONS') {
      DS.Audio.play('menuPick');
      st.options = DS.Options.create({ fromMenu: false, onClose: function () { st.options = null; } });
      return;
    }
    if (!st.confirm) { st.confirm = true; DS.Audio.play('error'); return; }
    st.confirm = false;
    DS.Audio.play('menuPick');
    DS.Scenes.gameOver(g, false);
  }

  function pauseUpdate(g) {
    const In = DS.Input;
    const st = pauseState(g);
    if (st.options) { st.options.update(); return; }
    if (In.justPressed('pause') || In.justPressed('back')) {
      In.consume('pause'); In.consume('back');
      if (st.confirm) { st.confirm = false; DS.Audio.play('menuMove'); return; }
      DS.Profile.close(g);
      return;
    }
    if (In.justPressed('up')) { st.action = (st.action + PAUSE.length - 1) % PAUSE.length; st.confirm = false; DS.Audio.play('menuMove'); }
    if (In.justPressed('down')) { st.action = (st.action + 1) % PAUSE.length; st.confirm = false; DS.Audio.play('menuMove'); }
    if (In.justPressed('confirm')) { In.consume('confirm'); pauseRun(g, st.action); }
  }

  function pauseItem(g, i, st) {
    const key = PAUSE[i];
    const value = null;
    const danger = key === 'ABANDON RUN';
    const label = danger && st.confirm ? 'CONFIRM · ABANDON?' : key;
    const node = h('button', 'hm-pitem' + (danger ? ' is-danger' : '') + (danger && st.confirm ? ' is-armed' : ''),
      { type: 'button', tabindex: '-1' }, [
        h('span', 'hm-pitem-label', { text: label }),
        value
      ]);
    node.addEventListener('pointerenter', function () {
      if (st.action !== i) { st.action = i; if (!danger) st.confirm = false; DS.Audio.play('menuMove'); }
    });
    node.addEventListener('click', function () { pauseRun(g, i); });
    return node;
  }

  function runSide(g) {
    const p = g.player;
    const held = DS.Inv.weapon(g.inv);
    const dmg = held ? Math.round(held.stats.damage * DS.Player.damageMult(g, p)) : 0;
    const crit = held ? Math.min(0.9, held.stats.crit + (p.stats.critBonus || 0)) : 0;
    const boons = h('div', 'hm-boons');
    const list = g.inv.boons || [];
    for (let i = 0; i < list.length; i++) {
      const b = DS.Boons.BY_KEY[list[i]];
      if (!b) continue;
      const chip = h('div', 'hm-boon', null, [h('span', 'hm-boon-name', { text: b.name }), h('span', 'hm-boon-desc', { text: b.desc })]);
      chip.style.setProperty('--boon', b.color || '#ffffff');
      boons.appendChild(chip);
    }
    if (!list.length) boons.appendChild(h('div', 'hk-empty-line', { text: 'No boons taken yet. Shrines offer them.' }));
    const stats = h('div', 'hm-herostats', null, [
      statLine('Damage', String(dmg)),
      statLine('Crit', Math.round(crit * 100) + '%'),
      statLine('Hearts', Math.ceil(p.hp) + ' / ' + p.stats.maxHp),
      statLine('Shield', Math.round(p.shield || 0) + ' / ' + p.stats.shield),
      statLine('Mana', Math.round(p.mana || 0) + ' / ' + p.stats.maxMana),
      statLine('Move speed', p.stats.moveSpeed.toFixed(2)),
      statLine('Weight', String(p.stats.weight || 0))
    ]);
    const rule = g.modifier;
    const ruleChip = h('span', 'hm-rule-chip' + (rule ? '' : ' is-none'), { text: rule ? rule.name : 'NO FLOOR RULE' });
    if (rule && rule.color) ruleChip.style.setProperty('--boon', rule.color);
    return h('section', 'ui-panel hm-pside ui-anim-in', null, [
      h('div', 'hm-pside-head', null, [
        h('div', '', null, [
          h('div', 'hk-eyebrow', { text: 'THIS RUN' }),
          h('div', 'hm-pside-where ui-num', { text: DS.Acts ? DS.Acts.label(g.depth) : 'DEPTH ' + g.depth })
        ]),
        ruleChip
      ]),
      h('div', 'hm-tiles is-4', null, [
        tile('KILLS', String(g.kills)),
        tile('TIME', formatTime(g.frames)),
        tile('BEST STREAK', 'x' + (g.streakBest || 0)),
        tile('COINS', String(g.inv.coins), 'is-gold')
      ]),
      h('div', 'hm-pside-cols', null, [
        h('div', '', null, [h('div', 'hk-section-label', { text: 'BOONS · ' + list.length }), boons]),
        h('div', '', null, [h('div', 'hk-section-label', { text: 'HERO' }), stats])
      ])
    ]);
  }

  function statLine(label, val) {
    return h('div', 'hm-sline', null, [h('span', '', { text: label }), h('span', 'ui-num', { text: val })]);
  }

  function pauseDraw(g) {
    const st = pauseState(g);
    if (st.options) { st.options.draw(); return; }
    const s = K().screen('pause');
    const sig = 'pause|' + st.confirm + '|' + Math.round(DS.HUI.frame.h);
    K().rebuild(s, sig, function (root) {
      P.nodes = [];
      root.appendChild(h('div', 'hk-scrim is-pause'));
      root.appendChild(K().masthead({ eyebrow: 'GAME PAUSED', title: 'Paused', accent: 'var(--accent)',
        sub: 'Death ends the run. Nothing carries over.', right: K().purse(g.inv) }));
      const col = h('nav', 'hm-pmenu');
      for (let i = 0; i < PAUSE.length; i++) {
        const n = pauseItem(g, i, st);
        P.nodes.push(n);
        col.appendChild(n);
      }
      P.side = h('div', 'hm-pside-host');
      P.sideKey = '';
      root.appendChild(h('main', 'hk-body hm-pause', null, [col, P.side]));
      root.appendChild(K().foot([['↑ ↓', 'Select'], ['ENTER', 'Confirm'], ['ESC', 'Resume']]));
    });
    K().setFocus(P.nodes, st.action);
    /* The right pane follows the cursor: the controls sheet while CONTROLS is
       focused (or opened), the run summary otherwise. */
    const showSheet = PAUSE[st.action] === 'OPTIONS';
    const key = (showSheet ? 'sheet' : 'run') + '|' + g.inv.coins + '|' + (g.inv.boons || []).length +
      (showSheet ? '|' + JSON.stringify(DS.Input.exportBindings()) : '');
    if (P.side && P.sideKey !== key) {
      P.sideKey = key;
      while (P.side.firstChild) P.side.removeChild(P.side.firstChild);
      P.side.appendChild(showSheet
        ? h('section', 'ui-panel hm-pside ui-anim-in', null, [h('div', 'hm-panel-title', { text: 'Controls' }), controlsSheet(true)])
        : runSide(g));
    }
  }

  DS.HMenus = {
    menu: menu,
    gameOver: gameOver,
    pauseUpdate: pauseUpdate,
    pauseDraw: pauseDraw,
    controlsSheet: controlsSheet
  };
})(window.DS);
