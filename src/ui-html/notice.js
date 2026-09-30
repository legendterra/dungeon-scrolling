/* The startup notice: what this game is and how it was made, in plain English,
   shown before the title screen until the player asks not to see it again.

   It is a document the player has to scroll to the end of before its buttons
   wake. Agreeing goes to the game; declining shows a short apology and then goes
   to the game too -- the answer is recorded, it does not gate anything. The
   answer, and "do not show again", live in DS.Settings ('notice'), and Options
   can bring the notice back. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  /* Raise this when the text changes in substance: everyone sees the new
     version once, whatever they chose before. */
  const NOTICE_VERSION = 1;

  const TITLE = 'Before you play';
  const SUB = 'Project notice and terms of use · research prototype';

  /* `**word**` is bold. */
  const SECTIONS = [
    { title: 'What this is', text:
      'Dungeon Scrolling is an **experimental game created by an artificial-intelligence system** as part of a research ' +
      'effort into how far AI-assisted software development has come. Its code, level design, monsters, art direction and ' +
      'interface were produced through an AI-driven process under human supervision. It is a research artifact and a ' +
      'prototype, not a commercial product, and it will contain rough edges.' },
    { title: 'Free of charge', text:
      'The game is **free**. It contains no advertisements, no paid content and **no real-money transactions of any ' +
      'kind**. Keys, coins and cosmetic items exist only inside the game; they have no monetary value and cannot be bought, ' +
      'sold or exchanged for money.' },
    { title: 'Independent work', text:
      'This is an independent, non-commercial project. It is not affiliated with, endorsed by or intended to represent any ' +
      'existing game, studio or developer. The conventions of the action-roguelike genre are used as inspiration only. ' +
      'We hold the craft of the developers of the games that inspired it in high regard, and nothing here is meant to ' +
      'diminish it.' },
    { title: 'What is stored', text:
      'Your settings, character appearance, unlocked cosmetics and progress are stored **locally in your browser**. If you ' +
      'submit a score, the display name you chose, the depth reached, your kill count and the run time are sent to a public ' +
      'scoreboard, so choose a name you are comfortable sharing. No account, e-mail address or tracking identifier is ' +
      'collected. Clearing your browser data removes everything stored locally.' },
    { title: 'No warranty', text:
      'The game is provided “as is”, without warranty of any kind. Because it is a prototype, it may contain defects, ' +
      'and features or saved data may change or be reset between versions. You play at your own discretion.' },
    { title: 'Third-party material', text:
      'Photographic textures are CC0 (public domain) scans from **Poly Haven**. The 3D engine is **three.js** (MIT ' +
      'licence). The interface typefaces, Rajdhani and Nunito Sans, are served by **Google Fonts** under the SIL Open ' +
      'Font License, which means your browser contacts that service when the page loads. All other art, sound and ' +
      'music are generated in code. Credits are listed in the Options menu.' },
    { title: 'Your choice', text:
      'Select **I AGREE** to confirm that you have read and understood this notice. Select **DECLINE** if you do not agree; ' +
      'you can still enter the game, and your answer is simply recorded. You can show this notice again at any time from ' +
      'Options, under About.' }
  ];

  const APOLOGY_TITLE = 'Thank you for being candid';
  const APOLOGY_TEXT =
    'This project exists purely for research into the progress of AI capabilities. If it comes across as disrespectful to ' +
    'the developers of the games that inspired it, we are sorry: that was never the intention, and we admire their work. ' +
    'You are welcome to continue to the game.';

  function h(tag, cls, props, kids) { return DS.HUI.el(tag, cls, props, kids); }
  function K() { return DS.HKit; }

  /* Should the notice be shown at launch? */
  function needed() {
    // ?notice=0 is for the test tools, which drive the game headless.
    if (typeof location !== 'undefined' && /[?&]notice=0(?:&|$)/.test(location.search)) return false;
    const n = DS.Settings.get('notice');
    return !(n.hide && n.ack > 0 && n.ver >= NOTICE_VERSION);
  }

  function record(ack, hide) {
    DS.Settings.set('notice', 'ack', ack);
    DS.Settings.set('notice', 'hide', !!hide);
    DS.Settings.set('notice', 'ver', NOTICE_VERSION);
  }

  /* Text with **bold** runs into a <p>. Built with nodes, never innerHTML. */
  function richText(text) {
    const p = h('p', 'hn-sec-text');
    const parts = text.split('**');
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      p.appendChild(i % 2 ? h('b', '', { text: parts[i] }) : document.createTextNode(parts[i]));
    }
    return p;
  }

  function createScene(onDone) {
    /* Starts from what is stored, so reading the notice again from Options and agreeing
       does not quietly turn a "do not show again" off. */
    const st = { frame: 0, read: false, accept: false, hide: !!DS.Settings.get('notice', 'hide'), focus: 1, popup: false, nudge: 0, scroll: 0, done: false };
    const ui = {};

    function finish() {
      if (st.done) return;
      st.done = true;
      onDone();
    }
    function agree() { record(1, st.hide); DS.Audio.play('menuPick'); finish(); }
    function decline() { record(2, st.hide); DS.Audio.play('menuPick'); st.popup = true; }
    function toggleHide() { st.hide = !st.hide; DS.Audio.play('menuMove'); }
    /* The agreement is its own tick, and it cannot be ticked before the end of the
       notice has been reached: scrolling alone never counts as agreeing. */
    function toggleAccept() {
      if (!st.read) { st.nudge = 20; DS.Audio.play('error'); return; }
      st.accept = !st.accept;
      DS.Audio.play('menuMove');
    }
    function press(which) {
      if (!st.read || (which === 1 && !st.accept)) { st.nudge = 20; DS.Audio.play('error'); return; }
      if (which === 1) agree(); else decline();
    }

    function build(root) {
      root.appendChild(h('div', 'hm-scrim-full'));
      ui.body = h('div', 'hn-body', { tabindex: '-1' });
      for (let i = 0; i < SECTIONS.length; i++) {
        ui.body.appendChild(h('section', 'hn-sec', null, [
          h('div', 'hn-sec-title', { text: (i + 1) + '. ' + SECTIONS[i].title }),
          richText(SECTIONS[i].text)
        ]));
      }
      ui.fill = h('i', 'hn-fill');
      ui.hint = h('span', 'hn-hint', { text: 'Scroll to the end to continue' });
      ui.check = h('div', 'hn-check', null, [h('i', 'hn-box'), h('span', '', { text: 'Do not show this notice again' })]);
      ui.check.addEventListener('click', toggleHide);
      ui.accept = h('div', 'hn-check hn-accept', null, [h('i', 'hn-box'), h('span', '', { text: 'I have read this notice and I agree to it' })]);
      ui.accept.addEventListener('click', toggleAccept);
      ui.decline = h('button', 'ui-btn hm-btn', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: 'DECLINE' })]);
      ui.agree = h('button', 'ui-btn hm-btn is-primary', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: 'I AGREE' })]);
      ui.decline.addEventListener('click', function () { press(0); });
      ui.agree.addEventListener('click', function () { press(1); });
      ui.decline.addEventListener('pointerenter', function () { st.focus = 0; });
      ui.agree.addEventListener('pointerenter', function () { st.focus = 1; });

      ui.cont = h('button', 'ui-btn hm-btn is-primary is-focus', { type: 'button', tabindex: '-1' }, [h('span', 'hm-btn-label', { text: 'CONTINUE TO GAME' })]);
      ui.cont.addEventListener('click', finish);
      ui.pop = h('div', 'hn-pop', null, [
        h('div', 'ui-panel hn-pop-card', null, [
          h('div', 'hk-eyebrow', { text: 'RESEARCH PROTOTYPE' }),
          h('div', 'hn-pop-title', { text: APOLOGY_TITLE }),
          h('div', 'hn-pop-text', { text: APOLOGY_TEXT }),
          h('div', 'hm-row', null, [ui.cont])
        ])
      ]);
      ui.pop.hidden = true;

      root.appendChild(h('div', 'hm-center', null, [
        h('div', 'ui-panel hn-panel', null, [
          h('div', 'hk-eyebrow', { text: 'PROJECT NOTICE' }),
          h('div', 'hn-title', { text: TITLE }),
          h('div', 'hn-sub', { text: SUB }),
          ui.body,
          h('div', 'hn-progress', null, [h('span', 'hn-track', null, [ui.fill]), ui.hint]),
          ui.accept,
          ui.check,
          h('div', 'hm-row hn-actions', null, [ui.decline, ui.agree])
        ])
      ]));
      root.appendChild(ui.pop);
      root.appendChild(K().foot([['↑ ↓', 'Scroll'], ['T', 'Tick to agree'], ['← →', 'Choose'], ['SPACE', 'Do not show again'], ['ENTER', 'Confirm']]));
      ui.body.scrollTop = st.scroll;
    }

    return {
      state: st,

      update: function () {
        const In = DS.Input;
        st.frame++;
        DS.Audio.setMusic('calm');
        if (st.popup) {
          if (In.justPressed('confirm') || In.justPressed('back')) { In.consume('confirm'); In.consume('back'); finish(); }
          return;
        }
        if (ui.body) {
          if (In.isDown('down')) ui.body.scrollTop += 8;
          if (In.isDown('up')) ui.body.scrollTop -= 8;
        }
        if (In.justPressed('left')) st.focus = 0;
        if (In.justPressed('right')) st.focus = 1;
        /* Space or the pad's Y, by code: 'jump' is also W, Up and the pad's A, which
           scroll and confirm here and must not tick the box on the way. */
        if (In.pressedCode('Space') || In.pressedCode('PAD3')) toggleHide();
        if (In.pressedCode('KeyT') || In.pressedCode('PAD2')) toggleAccept();
        if (In.justPressed('confirm')) { In.consume('confirm'); press(st.focus); }
      },

      draw: function () {
        const R = DS.R;
        R.begin();
        R.uiMode();
        if (!(DS.Camp3D && DS.UI3 && DS.UI3.ready && DS.Camp3D.attach(1 / 60))) R.rectS(0, 0, DS.C.W, DS.C.H, '#070b0c');

        const s = K().screen('notice');
        K().rebuild(s, 'notice|' + Math.round(DS.HUI.frame.h), build);

        const body = ui.body;
        st.scroll = body.scrollTop;
        const max = body.scrollHeight - body.clientHeight;
        const ratio = max <= 4 ? 1 : Math.min(1, body.scrollTop / max);
        if (ratio > 0.985 && body.clientHeight > 0) st.read = true;
        ui.fill.style.width = Math.round((st.read ? 1 : ratio) * 100) + '%';
        ui.hint.textContent = !st.read ? 'Scroll to the end to continue' : st.accept ? 'Thank you — you may continue' : 'Tick the box to agree';
        ui.hint.classList.toggle('is-done', st.read && st.accept);
        if (st.nudge > 0) st.nudge--;
        ui.hint.classList.toggle('is-nudge', st.nudge > 0);

        ui.check.classList.toggle('is-on', st.hide);
        ui.accept.classList.toggle('is-on', st.accept);
        ui.accept.classList.toggle('is-locked', !st.read);
        ui.decline.classList.toggle('is-locked', !st.read);
        ui.agree.classList.toggle('is-locked', !st.read || !st.accept);
        ui.decline.classList.toggle('is-focus', st.focus === 0);
        ui.agree.classList.toggle('is-focus', st.focus === 1);
        ui.pop.hidden = !st.popup;
      }
    };
  }

  DS.Notice = {
    VERSION: NOTICE_VERSION, TITLE: TITLE, SECTIONS: SECTIONS,
    APOLOGY_TITLE: APOLOGY_TITLE, APOLOGY_TEXT: APOLOGY_TEXT,
    needed: needed, record: record, createScene: createScene
  };
})(window.DS);
