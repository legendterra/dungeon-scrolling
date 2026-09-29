/* A just-enough THREE for the model builders (src/core/voxel*.js): groups and
   boxes with position / rotation / scale that hold numbers, so a builder AND its
   animate() can run headless and be checked for throwing and for NaN. Injected
   into the vm sandbox as source text (see _load.js). */
module.exports = [
  'class Vec { constructor() { this.x = 0; this.y = 0; this.z = 0; }',
  '  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }',
  '  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; } }',
  'class Obj { constructor() { this.position = new Vec(); this.rotation = new Vec();',
  '  this.scale = new Vec(); this.scale.set(1, 1, 1); this.children = []; this.visible = true;',
  '  this.parent = null; this.userData = {}; }',
  '  add(c) { this.children.push(c); c.parent = this; return this; }',
  '  traverse(fn) { fn(this); this.children.forEach(function (k) { k.traverse(fn); }); } }',
  'window.THREE = {',
  '  Group: Obj,',
  '  Mesh: class extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } },',
  '  BoxGeometry: class { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } },',
  '  MeshStandardMaterial: class { constructor(o) { Object.assign(this, o); this.emissive = null; } },',
  '  Color: class { constructor(c) { this.c = c; } },',
  '  DoubleSide: 2, BackSide: 1',
  '};',
  'window.DS.Armor = { MATERIALS: {} };'
].join('\n');
