/* The HTML UI layer (v6): one #ui-root laid exactly over the 16:9 play frame
   the WebGL canvas letterboxes, and the handful of helpers every screen built
   on it shares. Styling lives in styles/ui.css; sizes there are in `--s`
   units (1/720 of the frame height), which this module keeps current.

   Layers, bottom to top: world (labels glued to 3D positions), hud, panel
   (menus, bag, shop — the only things that take the pointer), overlay
   (banners, toasts, fades). Screens mount into a layer and own their nodes;
   nothing here knows what a HUD or a menu is. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const DESIGN_H = 720;
  const LAYERS = ['world', 'hud', 'panel', 'overlay'];

  let root = null;
  const layers = {};
  const frame = { x: 0, y: 0, w: 0, h: 0, s: 1 };
  let hoverCount = 0;

  function init() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ui-root';
    for (let i = 0; i < LAYERS.length; i++) {
      const layer = document.createElement('div');
      layer.className = 'ui-layer';
      layer.dataset.layer = LAYERS[i];
      root.appendChild(layer);
      layers[LAYERS[i]] = layer;
    }
    document.body.appendChild(root);
    /* The WebGL pointer is drawn under this layer, so while the mouse is over
       an interactive HTML element the system cursor takes over (see ui.css
       .ui-interactive) and DS.HUI.pointerOverUI tells the game not to treat
       the click as an attack. */
    root.addEventListener('pointerover', function (e) {
      if (e.target.closest && e.target.closest('.ui-interactive')) hoverCount = 1;
    });
    root.addEventListener('pointerout', function (e) {
      if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.ui-interactive')) hoverCount = 0;
    });
    sync();
    return root;
  }

  /* Match the play frame. Cheap enough to run every frame; only writes the
     DOM when the frame actually moved. */
  function sync() {
    if (!root) return;
    const v = DS.UI3 && DS.UI3.view;
    const x = v ? v.x : 0, y = v ? v.y : 0;
    const w = v ? v.w : window.innerWidth, h = v ? v.h : window.innerHeight;
    if (x === frame.x && y === frame.y && w === frame.w && h === frame.h) return;
    frame.x = x; frame.y = y; frame.w = w; frame.h = h;
    frame.s = h / DESIGN_H;
    root.style.left = x + 'px';
    root.style.top = y + 'px';
    root.style.width = w + 'px';
    root.style.height = h + 'px';
    root.style.setProperty('--s', frame.s.toFixed(4) + 'px');
  }

  /* Tiny element builder: el('div', 'ui-panel', { text: 'x' }, [children]). */
  function el(tag, className, props, children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (props) {
      for (const k in props) {
        if (k === 'text') node.textContent = props[k];
        else if (k === 'style') Object.assign(node.style, props[k]);
        else if (k === 'dataset') Object.assign(node.dataset, props[k]);
        else node.setAttribute(k, props[k]);
      }
    }
    if (children) for (let i = 0; i < children.length; i++) if (children[i]) node.appendChild(children[i]);
    return node;
  }

  function layer(name) { init(); return layers[name]; }

  /* Logical 320x180 coordinates (what DS.R and DS.R3D.worldToScreen speak)
     to CSS pixels inside the frame. */
  function fromLogical(lx, ly, out) {
    const o = out || {};
    o.x = lx * (frame.w / DS.C.W);
    o.y = ly * (frame.h / DS.C.H);
    return o;
  }

  /* A fixed pool of nodes for things that come and go every frame (damage
     numbers, labels). acquire() never allocates after the pool is full; it
     recycles the oldest live node instead. */
  function pool(layerName, size, make) {
    const host = layer(layerName);
    const nodes = [];
    const live = [];
    for (let i = 0; i < size; i++) {
      const n = make();
      n.hidden = true;
      host.appendChild(n);
      nodes.push(n);
    }
    let cursor = 0;
    return {
      nodes: nodes,
      acquire: function () {
        const n = nodes[cursor];
        cursor = (cursor + 1) % nodes.length;
        n.hidden = false;
        return n;
      },
      release: function (n) { n.hidden = true; },
      hideAll: function () { for (let i = 0; i < nodes.length; i++) nodes[i].hidden = true; live.length = 0; }
    };
  }

  DS.HUI = {
    DESIGN_H: DESIGN_H,
    init: init,
    sync: sync,
    el: el,
    layer: layer,
    pool: pool,
    fromLogical: fromLogical,
    get frame() { return frame; },
    get pointerOverUI() { return hoverCount > 0; }
  };
})(window.DS);
