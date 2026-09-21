/* 2.5D WebGL layer for Dungeon Scrolling using Three.js — the hybrid renderer.

   Division of labour between the two canvases:

     THREE (this file)  the dungeon ARCHITECTURE: wall slabs, floor pavers,
                        platforms, spikes, torches, chests, the exit portal,
                        pressure plates and the moving hazards. Also a big
                        pixel-art backdrop plane and the fog/ambient mood.
     Canvas 2D          every gameplay SPRITE (hero, enemies, pickups, FX),
                        water and ropes, and the darkness/lighting composite.

   The backdrop reuses the parallax art baked by src/art/backdrop.js, so the
   far scenery is the same pixel art the menus and the 2D renderer show —
   no second, competing art style. Fog and lighting per theme are kept subtle;
   the real mood comes from the 2D darkness veil, which is composited over
   this canvas in src/systems/lighting.js. */
window.DS = window.DS || {};

(function (DS) {
  'use strict';

  const M = DS.M;   // math helpers (clamp/lerp/approach)

  let enabled = false;
  let scene, camera, renderer, canvas;
  let playerLight = null;
  let ambientLight = null;
  let hemiLight = null;
  let dirLight = null;

  let torchLights = [];
  let flameSprites = [];

  let dungeonGroup = null;
  let shadowGroup = null;
  let propsGroup = null;
  let themeGroup = null;

  let flameTex = null;
  let portalTex = null;
  let runeTex = null;

  let doorPortalObj = null;
  let chestMeshes = [];
  let plateMeshes = [];
  let backdropMesh = null;
  let hazardMeshes = [];
  let spikeMeshes = [];

  // --- voxel chibi actors -----------------------------------------------------
  // Every gameplay character is a blocky 3D model (src/core/voxel.js); the 2D
  // canvas keeps only FX, telegraphs, UI bars and the lighting composite.
  let actorGroup = null;     // hero + monster models
  let fxGroup = null;        // projectiles + pickup meshes
  let heroModel = null;
  let heroArmorKey = '';
  let heroWeaponMesh = null;
  let heroWeaponAura = null;   // orbiting element motes on an elemental weapon
  let heroWeaponRef = null;
  const enemyModels = new Map();   // entity -> model
  let projMeshes = [];
  let pickupMeshes = [];
  let gateMeshes = [];
  let leverMeshes = [];
  let ropeMeshes = [];      // 3D ropes: { x0,y0,x1,y1 (units), group }
  let elemPuddles = [];     // per-enemy status puddles: { mesh, key }
  let elemFields = [];      // ground field plates: { mesh, key }
  let elemBolts = [];       // lightning bolts: { mesh }
  let groundBursts = [];    // 3D skill FX hugging the floor: { group, life, maxLife, vy[] }
  let swingFx = [];         // melee swing arcs: { group, life, maxLife }
  let crateMeshes = [];
  let shrineMesh = null;
  let vignetteMesh = null;
  let nearBackdrop = null;

  // 1 world pixel = 0.1 Three.js units (1 tile of 16px = 1.6 units)
  const P2U = 0.1;
  const TILE_SIZE = 16 * P2U; // 1.6 units

  // Camera: a gentle downward tilt so the floor slabs read as 3D, without
  // tipping far enough to shove the walkway off the bottom of the frame.
  const CAM_DIST = 26;
  const FOV = 39.5;
  const TILT_ANGLE = 0.12; // ~7 degrees

  // Backdrop plane. Sits far behind the walkway; its texel size is chosen so
  // a backdrop pixel appears at roughly world-pixel size from the camera.
  const BACKDROP_Z = -8;
  const BACKDROP_PX_U = P2U * (CAM_DIST - BACKDROP_Z) / CAM_DIST * 1.18; // ~0.155 units
  const SKY_W = 640;   // composite is two sky screens wide, like the mid layer
  const SKY_H = 180;

  /* Per-theme mood. Deliberately restrained: the 2D darkness veil does the
     heavy lifting, so ambient stays low and warm/cool shifts carry the biome. */
  const THEMES = {
    forest: { fog: 0x0e2417, ambient: 0x5a6a50, hemiSky: 0x6a8166, hemiGround: 0x2a3320, dir: 0xfff3d6, dirI: 0.55 },
    caves:  { fog: 0x0a1e1c, ambient: 0x3f6a60, hemiSky: 0x4f8078, hemiGround: 0x182825, dir: 0x5eead4, dirI: 0.42 },
    prison: { fog: 0x1a1006, ambient: 0x6e5638, hemiSky: 0x846845, hemiGround: 0x241810, dir: 0xfbbf24, dirI: 0.50 },
    vault:  { fog: 0x140728, ambient: 0x5c4290, hemiSky: 0x745aa8, hemiGround: 0x201335, dir: 0xd8b4fe, dirI: 0.48 },
    nest:   { fog: 0x1a060a, ambient: 0x6e323c, hemiSky: 0x86404a, hemiGround: 0x24100f, dir: 0xf43f5e, dirI: 0.45 },
    throne: { fog: 0x221806, ambient: 0x74613a, hemiSky: 0x8d7a48, hemiGround: 0x26200f, dir: 0xfde047, dirI: 0.55 }
  };
  const AMBIENT_I = 1.35;
  const HEMI_I = 0.55;
  const FOG_DENSITY = 0.008;

  function createTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  function makeWallTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const baseColor = (biome && biome.pal && biome.pal.D) || '#3e3752';
    const darkColor = (biome && biome.pal && biome.pal.d) || '#221c32';
    const lightColor = (biome && biome.pal && biome.pal.g) || '#564d72';

    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 0, 32, 32);

    const drawBrick = (x, y, w, h) => {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = lightColor;
      ctx.fillRect(x + 1, y + 1, w - 2, 1);
      ctx.fillRect(x + 1, y + 1, 1, h - 2);
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + Math.floor(w * 0.5), y + Math.floor(h * 0.4), 2, 2);
    };

    drawBrick(0, 0, 16, 16);
    drawBrick(16, 0, 16, 16);
    drawBrick(-8, 16, 16, 16);
    drawBrick(8, 16, 16, 16);
    drawBrick(24, 16, 16, 16);

    return createTexture(cv);
  }

  function makeFloorTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const baseColor = (biome && biome.pal && biome.pal.D) || '#484060';
    const darkColor = (biome && biome.pal && biome.pal.d) || '#2a233b';
    const lightColor = (biome && biome.pal && biome.pal.G) || '#786c9b';

    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 32, 32);

    ctx.fillStyle = darkColor;
    ctx.fillRect(0, 15, 32, 2);
    ctx.fillRect(15, 0, 2, 32);

    ctx.fillStyle = lightColor;
    ctx.fillRect(0, 0, 32, 2);
    ctx.fillRect(0, 16, 32, 1);

    return createTexture(cv);
  }

  function makePlatformTexture(biome) {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 8;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#65482e';
    ctx.fillRect(0, 0, 32, 8);

    ctx.fillStyle = '#8a6442';
    ctx.fillRect(0, 0, 32, 1);
    ctx.fillRect(0, 4, 32, 1);

    ctx.fillStyle = '#3d2919';
    ctx.fillRect(0, 7, 32, 1);
    ctx.fillRect(15, 0, 1, 8);

    ctx.fillStyle = '#ffd56b';
    ctx.fillRect(3, 3, 2, 2);
    ctx.fillRect(19, 3, 2, 2);

    return createTexture(cv);
  }

  /* Sky + mid parallax art composited into one looping backdrop canvas.
     The mid layer is 640 logical px wide and the sky 320, so the sky is
     blitted twice — exactly how the 2D renderer stacks them. A darkening
     wash is baked over the mid art so the far scene sits BEHIND the mood
     instead of floating over it. */
  function makeBackdropTexture(biome) {
    if (!DS.Backdrop || !DS.Backdrop.layersFor) return null;
    const L = DS.Backdrop.layersFor(biome);
    if (!L || !L.sky) return null;

    const D = DS.C.RS || 1;
    const cv = document.createElement('canvas');
    cv.width = SKY_W * D;
    cv.height = SKY_H * D;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(L.sky, 0, 0, cv.width / 2, cv.height);
    ctx.drawImage(L.sky, cv.width / 2, 0, cv.width / 2, cv.height);
    if (L.mid) {
      ctx.drawImage(L.mid, 0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(8,6,14,0.20)';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }

    return createTexture(cv);
  }

  /* The near silhouette layer drifts at 0.7x camera speed in 2D. In 3D it
     becomes a foreground plane just behind the walkway — actual parallax
     between two planes, which the flat single backdrop never had. */
  function makeNearTexture(biome) {
    if (!DS.Backdrop || !DS.Backdrop.layersFor) return null;
    const L = DS.Backdrop.layersFor(biome);
    if (!L || !L.near) return null;
    const D = DS.C.RS || 1;
    const cv = document.createElement('canvas');
    cv.width = 640 * D; cv.height = SKY_H * D;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(L.near, 0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(6,5,12,0.18)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    return createTexture(cv);
  }

  function makeFlameTexture() {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    const grd = ctx.createRadialGradient(16, 18, 1, 16, 16, 14);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.3, '#ffe066');
    grd.addColorStop(0.65, '#ff7711');
    grd.addColorStop(1, 'rgba(255, 60, 0, 0)');

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 32, 32);

    return new THREE.CanvasTexture(cv);
  }

  function makePortalTexture() {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 128;
    const ctx = cv.getContext('2d');

    const grd = ctx.createRadialGradient(32, 64, 4, 32, 64, 48);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.25, '#7df5ff');
    grd.addColorStop(0.55, '#3a88e9');
    grd.addColorStop(0.85, '#221155');
    grd.addColorStop(1.0, 'rgba(10, 5, 30, 0)');

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 64, 128);

    ctx.strokeStyle = '#a8ffff';
    ctx.lineWidth = 2;
    for (let r = 8; r <= 36; r += 9) {
      ctx.beginPath();
      ctx.ellipse(32, 64, r * 0.65, r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  function makeRuneTexture() {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 32;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = '#1c1828';
    ctx.fillRect(0, 0, 32, 32);

    ctx.strokeStyle = '#4ee2ec';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(16, 16, 11, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(16, 7); ctx.lineTo(16, 25);
    ctx.moveTo(10, 13); ctx.lineTo(22, 19);
    ctx.moveTo(10, 19); ctx.lineTo(22, 13);
    ctx.stroke();

    return createTexture(cv);
  }

  // --- Screen-Space Camera Particle System ---------------------------------
  // Ambient motes (spores, embers, fireflies) floating between the backdrop
  // and the walkway. Kept sparse and translucent so they read as atmosphere.
  class ScreenParticleManager {
    constructor(parentScene) {
      this.scene = parentScene;
      this.group = new THREE.Group();
      this.scene.add(this.group);
      this.particles = null;
      this.currentTheme = null;
      this.velocities = null;
      this.count = 110;
      this.time = 0;
    }

    setTheme(themeName) {
      if (this.particles) {
        this.group.remove(this.particles);
        if (this.particles.geometry) this.particles.geometry.dispose();
        if (this.particles.material) this.particles.material.dispose();
        this.particles = null;
      }
      this.currentTheme = themeName;

      const count = this.count;
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const velocities = [];

      let color = 0x98d4ff;
      let size = 0.26;
      let opacity = 0.65;

      if (themeName === 'forest') {
        color = 0x86efac; size = 0.35; opacity = 0.75;
      } else if (themeName === 'caves') {
        color = 0x5eead4; size = 0.28; opacity = 0.70;
      } else if (themeName === 'prison') {
        color = 0xf97316; size = 0.32; opacity = 0.85;
      } else if (themeName === 'vault') {
        color = 0xc084fc; size = 0.36; opacity = 0.85;
      } else if (themeName === 'nest') {
        color = 0xfb7185; size = 0.30; opacity = 0.80;
      } else if (themeName === 'throne') {
        color = 0xfde047; size = 0.35; opacity = 0.85;
      }

      for (let i = 0; i < count; i++) {
        positions[i * 3 + 0] = (Math.random() - 0.5) * 44;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 26;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

        let vx = (Math.random() - 0.5) * 0.5;
        let vy = (Math.random() - 0.5) * 0.4;
        let vz = (Math.random() - 0.5) * 0.3;

        if (themeName === 'prison') {
          vx = (Math.random() - 0.5) * 0.7; vy = Math.random() * 1.6 + 0.5;
        } else if (themeName === 'caves') {
          vx = (Math.random() - 0.5) * 0.3; vy = -(Math.random() * 1.1 + 0.2);
        }

        velocities.push({ x: vx, y: vy, z: vz, wobble: Math.random() * 6.28 });
      }

      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: color,
        size: size,
        transparent: true,
        opacity: opacity * 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      this.particles = new THREE.Points(geo, mat);
      this.velocities = velocities;
      this.group.add(this.particles);
    }

    update(camX, camY, dt) {
      if (!this.particles || !this.velocities) return;
      this.time += dt;
      this.group.position.set(camX, camY, 0);

      const pos = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < this.velocities.length; i++) {
        const v = this.velocities[i];
        let px = pos[i * 3 + 0];
        let py = pos[i * 3 + 1];
        let pz = pos[i * 3 + 2];

        const sway = Math.sin(this.time * 2.5 + v.wobble) * 0.02;
        px += (v.x + sway) * dt * 8;
        py += v.y * dt * 8;
        pz += v.z * dt * 8;

        if (py < -14) py = 14;
        if (py > 14) py = -14;
        if (px < -24) px = 24;
        if (px > 24) px = -24;

        pos[i * 3 + 0] = px;
        pos[i * 3 + 1] = py;
        pos[i * 3 + 2] = pz;
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
  }

  let screenParticleManager = null;

  function init() {
    if (typeof THREE === 'undefined') return false;

    canvas = document.getElementById('game3d');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'game3d';
      canvas.style.position = 'absolute';
      canvas.style.left = '50%';
      canvas.style.top = '50%';
      canvas.style.transform = 'translate(-50%, -50%)';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '1';
      const game2d = document.getElementById('game');
      if (game2d && game2d.parentNode) game2d.parentNode.insertBefore(canvas, game2d);
      else document.body.appendChild(canvas);
    }

    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance'
      });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
    } catch (err) {
      console.warn('WebGL init failed:', err);
      return false;
    }

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(THEMES.forest.fog, FOG_DENSITY);

    camera = new THREE.PerspectiveCamera(FOV, DS.C.W / DS.C.H, 0.5, 160);

    ambientLight = new THREE.AmbientLight(THEMES.forest.ambient, AMBIENT_I);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(THEMES.forest.hemiSky, THEMES.forest.hemiGround, HEMI_I);
    scene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(THEMES.forest.dir, THEMES.forest.dirI);
    dirLight.position.set(15, 30, 25);
    scene.add(dirLight);

    playerLight = new THREE.PointLight(0xffe2a0, 0.55, 11, 1.4);
    playerLight.position.set(0, 0, 1.2);
    scene.add(playerLight);

    dungeonGroup = new THREE.Group();
    scene.add(dungeonGroup);

    themeGroup = new THREE.Group();
    scene.add(themeGroup);

    propsGroup = new THREE.Group();
    scene.add(propsGroup);

    shadowGroup = new THREE.Group();
    scene.add(shadowGroup);

    flameTex = makeFlameTexture();
    portalTex = makePortalTexture();
    runeTex = makeRuneTexture();

    screenParticleManager = new ScreenParticleManager(scene);

    actorGroup = new THREE.Group();
    scene.add(actorGroup);

    fxGroup = new THREE.Group();
    scene.add(fxGroup);

    // The camera must join the scene graph for its vignette child to render.
    scene.add(camera);
    vignetteMesh = buildVignette();

    resize();
    enabled = true;
    return true;
  }

  /* A soft screen-edge darkening, parented to the camera so it frames every
     shot. Purely cosmetic: it stops the frame corners from reading as flat
     and gives the scene the same vignetted look the 2D renderer's darkness
     veil gives the sprite view. */
  function buildVignette() {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 144;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(128, 66, 40, 128, 72, 150);
    grd.addColorStop(0, 'rgba(5,4,10,0)');
    grd.addColorStop(0.62, 'rgba(5,4,10,0.08)');
    grd.addColorStop(1, 'rgba(5,4,10,0.52)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 144);
    // A little extra weight along the top, like a low dungeon ceiling.
    const top = ctx.createLinearGradient(0, 0, 0, 40);
    top.addColorStop(0, 'rgba(5,4,10,0.35)');
    top.addColorStop(1, 'rgba(5,4,10,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, 256, 40);
    const tex = new THREE.CanvasTexture(cv);
    // Size the frame to exactly overfill the frustum at 2 units out, so the
    // baked gradient maps to the screen edges whatever the aspect is.
    const dist = 2;
    const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * 1.04;
    const vw = vh * (DS.C.W / DS.C.H) * 1.04;
    const geo = new THREE.PlaneGeometry(vw, vh);
    const m = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(0, 0, -dist);
    mesh.renderOrder = 990;
    camera.add(mesh);
    return mesh;
  }

  /* Voxel models share a small material cache, so teardown frees geometry
     only — the materials stay for the next model that wants them. */
  function disposeModel(model) {
    if (!model || !model.root) return;
    model.root.traverse(function (o) {
      if (o.geometry) o.geometry.dispose();
    });
    if (model.root.parent) model.root.parent.remove(model.root);
  }

  function clearActors() {
    enemyModels.forEach(function (model) { disposeModel(model); });
    enemyModels.clear();
    if (heroModel) { disposeModel(heroModel); heroModel = null; heroArmorKey = ''; }
    heroWeaponMesh = null;
    heroWeaponAura = null;
    heroWeaponRef = null;
    projMeshes.forEach(function (pm) {
      pm.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      if (pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
    });
    projMeshes = [];
    pickupMeshes.forEach(function (pm) {
      pm.mesh.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      if (pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
    });
    pickupMeshes = [];
  }

  function resize() {
    if (!renderer || !canvas) return;
    const game2d = document.getElementById('game');
    if (game2d) {
      canvas.style.width = game2d.style.width;
      canvas.style.height = game2d.style.height;
      const w = parseInt(game2d.style.width, 10) || (DS.C.W * (DS.C.RS || 2));
      const h = parseInt(game2d.style.height, 10) || (DS.C.H * (DS.C.RS || 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  function disposeGroup(group) {
    if (!group) return;
    while (group.children.length > 0) {
      const obj = group.children[0];
      group.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        // Textures are rebuilt per level, so they go with the meshes.
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    }
  }

  function resolveTheme(depth, biome, flavor) {
    if (biome && biome.key) {
      if (biome.key === 'halls') return 'forest';
      if (biome.key === 'caves') return 'caves';
      if (biome.key === 'prison') return 'prison';
      if (biome.key === 'vault') return 'vault';
      if (biome.key === 'nest') return 'nest';
      if (biome.key === 'throne') return 'throne';
    }
    if (flavor === 'flooded') return 'caves';
    if (depth === 1) return 'forest';
    if (depth === 2) return 'caves';
    if (depth === 3) return 'prison';
    if (depth === 4) return 'vault';
    if (depth === 5) return 'nest';
    if (depth === 6) return 'throne';
    return 'forest';
  }

  /* Mood + backdrop. Everything big and distant lives here; the walkway
     architecture is built in loadLevel(). */
  function setupTheme(themeName, w, h, biome) {
    const t = THEMES[themeName] || THEMES.forest;

    scene.fog = new THREE.FogExp2(t.fog, FOG_DENSITY);
    ambientLight.color.setHex(t.ambient);
    ambientLight.intensity = AMBIENT_I;
    hemiLight.color.setHex(t.hemiSky);
    hemiLight.groundColor.setHex(t.hemiGround);
    hemiLight.intensity = HEMI_I;
    dirLight.color.setHex(t.dir);
    dirLight.intensity = t.dirI;
    dirLight.position.set(15, 30, 25);

    disposeGroup(themeGroup);
    backdropMesh = null;
    nearBackdrop = null;      const tex = makeBackdropTexture(biome);
    if (tex) {
      const fullW = (w * 16) * P2U;
      // Wide enough to cover the whole map plus the camera's view margin.
      const planeW = Math.max(fullW + 50, 100);
      // Native art scale: 1 art pixel = BACKDROP_PX_U world units, so the
      // pixel chunkiness matches the 2D renderer instead of smearing.
      const planeH = SKY_H * BACKDROP_PX_U;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(Math.max(2, Math.round(planeW / (SKY_W * BACKDROP_PX_U))), 1);

      const geo = new THREE.PlaneGeometry(planeW, planeH);
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false });
      backdropMesh = new THREE.Mesh(geo, mat);

      const floorY = -(h * 16) * P2U;
      // Bottom of the art sits at the floor line; the plane is tall enough to
      // fill the whole vertical FOV of the camera and then some.
      backdropMesh.position.set((w * 16 * 0.5) * P2U, floorY + planeH * 0.5 + 1.5, BACKDROP_Z);
      themeGroup.add(backdropMesh);
    }

    const nearTex = makeNearTexture(biome);
    if (nearTex) {
      const nearW = Math.max((w * 16) * P2U + 40, 90);
      nearTex.wrapS = THREE.RepeatWrapping;
      nearTex.wrapT = THREE.ClampToEdgeWrapping;
      const planeW2 = nearW;
      const planeH2 = SKY_H * BACKDROP_PX_U * 0.86;
      nearTex.repeat.set(Math.max(2, Math.round(planeW2 / (640 * BACKDROP_PX_U))), 1);

      const geo2 = new THREE.PlaneGeometry(planeW2, planeH2);
      const mat2 = new THREE.MeshBasicMaterial({
        map: nearTex, fog: false, depthWrite: false,
        transparent: true, opacity: 0.62
      });
      nearBackdrop = new THREE.Mesh(geo2, mat2);
      const floorY2 = -(h * 16) * P2U;
      nearBackdrop.position.set((w * 16 * 0.5) * P2U, floorY2 + planeH2 * 0.5 + 0.8, -2.6);
      themeGroup.add(nearBackdrop);
    }

    if (screenParticleManager) {
      screenParticleManager.setTheme(themeName);
    }
  }

  function createDoorwayMesh() {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x3d384c });
    const archMat = new THREE.MeshLambertMaterial({ color: 0x564d72 });

    const pillarGeo = new THREE.BoxGeometry(0.5, 3.2, 0.65);
    const leftPillar = new THREE.Mesh(pillarGeo, stoneMat);
    leftPillar.position.set(-0.9, 1.6, 0);
    const rightPillar = new THREE.Mesh(pillarGeo, stoneMat);
    rightPillar.position.set(0.9, 1.6, 0);
    group.add(leftPillar);
    group.add(rightPillar);

    const lintelGeo = new THREE.BoxGeometry(2.5, 0.6, 0.75);
    const lintel = new THREE.Mesh(lintelGeo, archMat);
    lintel.position.set(0, 3.2, 0);
    group.add(lintel);

    const keystoneGeo = new THREE.BoxGeometry(0.6, 0.7, 0.85);
    const keystone = new THREE.Mesh(keystoneGeo, archMat);
    keystone.position.set(0, 3.25, 0.05);
    group.add(keystone);

    const stepGeo = new THREE.BoxGeometry(2.3, 0.25, 0.9);
    const step = new THREE.Mesh(stepGeo, stoneMat);
    step.position.set(0, 0.12, 0);
    group.add(step);

    const portalGeo = new THREE.PlaneGeometry(1.5, 2.8);
    const portalMat = new THREE.MeshBasicMaterial({
      map: portalTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(0, 1.6, 0.08);
    group.add(portal);

    const ringGeo = new THREE.RingGeometry(0.35, 0.65, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x4ee2ec,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const runeRing = new THREE.Mesh(ringGeo, ringMat);
    runeRing.position.set(0, 1.6, 0.14);
    group.add(runeRing);

    const pLight = new THREE.PointLight(0x4ee2ec, 1.3, 8.0, 2.0);
    pLight.position.set(0, 1.6, 0.8);
    group.add(pLight);

    return {
      group: group,
      portal: portal,
      ring: runeRing,
      light: pLight
    };
  }

  /* The old torch hung from a bracket that no wall held, so the flame
     floated beside an invisible stem. Rebuilt as a standing braziere pole:
     a base plate, a dark iron pole, a collar, and a cup that catches the
     flame — everything the eye needs to believe in the light it casts.
     Pole height was cut down so the flame sits near the walkway, where
     its light can actually reach the player. */
  function createTorchMesh(x, y) {
    const group = new THREE.Group();

    const iron = new THREE.MeshLambertMaterial({ color: 0x2a2733 });
    const ironLight = new THREE.MeshLambertMaterial({ color: 0x4a4658 });

    // Base plate and three stacked pole segments, each nudged a hair so the
    // pole reads as smith-made rather than extruded.
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.44), iron);
    base.position.y = 0.04;
    group.add(base);
    const segH = 0.34;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.12 - (i % 2) * 0.015, segH, 0.12),
                                 i % 2 ? ironLight : iron);
      seg.position.set((i % 2 ? 0.008 : -0.006), 0.08 + segH * (i + 0.5), 0);
      group.add(seg);
    }

    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.2), ironLight);
    collar.position.y = 0.08 + segH * 3 + 0.03;
    group.add(collar);
    // The cup, flaring open to hold the flame.
    const cup = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.26), iron);
    cup.position.y = 0.08 + segH * 3 + 0.14;
    group.add(cup);
    const cupLip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), ironLight);
    cupLip.position.y = 0.08 + segH * 3 + 0.23;
    group.add(cupLip);

    const fMat = new THREE.SpriteMaterial({
      map: flameTex,
      blending: THREE.AdditiveBlending,
      transparent: true
    });
    const flame = new THREE.Sprite(fMat);
    flame.position.set(0, 0.08 + segH * 3 + 0.44, 0);
    flame.scale.set(0.9, 1.2, 1.1);
    group.add(flame);

    const light = new THREE.PointLight(0xff9e38, 0.55, 10, 2.0);
    light.position.set(0, 0.08 + segH * 3 + 0.5, 0.3);
    scene.add(light);
    group.position.set(x, y, 0.2);
    propsGroup.add(group);
    return {
      sprite: flame,
      seed: Math.random() * 20,
      light: light,
      baseIntensity: 0.55,
      flickerOffset: Math.random() * 20,
      smooth: 0.55,
      group: group
    };
  }

  // --- puzzle hardware in 3D: gate bars, lever, crates -----------------------
  function part(parent, sx, sy, sz, x, y, z, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  function createGateMesh(gate) {
    const group = new THREE.Group();
    const barMat = new THREE.MeshLambertMaterial({ color: 0x6f6a90 });
    const barDark = new THREE.MeshLambertMaterial({ color: 0x3a3654 });
    const uW = Math.max(0.5, gate.w * P2U);
    const uH = Math.max(0.8, gate.h * P2U);
    const bars = Math.max(3, Math.round(uW / 0.28));
    for (let i = 0; i < bars; i++) {
      const bx = -uW / 2 + (i + 0.5) * (uW / bars);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.09, uH, 0.09), barMat);
      bar.position.set(bx, 0, 0);
      group.add(bar);
    }
    // Two cross rails so it reads as forged, not extruded.
    for (let r = 0; r < 2; r++) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(uW, 0.08, 0.12), barDark);
      rail.position.set(0, (r === 0 ? 0.32 : -0.32) * uH, 0);
      group.add(rail);
    }
    // Spiked foot edge.
    for (let i = 0; i < bars; i++) {
      const bx = -uW / 2 + (i + 0.5) * (uW / bars);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), barDark);
      spike.position.set(bx, -uH / 2 - 0.06, 0);
      spike.rotation.x = Math.PI;
      group.add(spike);
    }
    propsGroup.add(group);
    return { group, gate, kind: 'gate' };
  }

  function createLeverMesh(lever) {
    const group = new THREE.Group();
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x3a3654 });
    const stickMat = new THREE.MeshLambertMaterial({ color: 0x8a6340 });
    part(group, 0.42, 0.12, 0.42, 0, 0.06, 0, baseMat);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.12, 0);
    group.add(pivot);
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.07), stickMat);
    stick.position.y = 0.31;
    pivot.add(stick);
    const knobMat = new THREE.MeshLambertMaterial({ color: 0xc0303c });
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.16), knobMat);
    knob.position.y = 0.66;
    pivot.add(knob);
    // Anchor on the lever's floor (y+16 like every prop footprint) instead of
    // a magic 1.6-unit offset that left the base buried and the stick floating.
    group.position.set(lever.x * P2U + 0.4, -(lever.y + 16) * P2U, 0.2);
    propsGroup.add(group);
    return { group, pivot, knob, knobMat, lever, kind: 'lever' };
  }

  function createCrateMesh(crate) {
    const group = new THREE.Group();
    const uS = Math.max(0.6, crate.w * P2U);
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a6340 });
    const woodDark = new THREE.MeshLambertMaterial({ color: 0x5c3f2a });
    part(group, uS, uS, uS, 0, uS / 2, 0, wood);
    // Frame edges + a cross plank per face reads as a shipping crate.
    for (let i = -1; i <= 1; i += 2) {
      part(group, uS + 0.02, 0.07, uS + 0.02, 0, uS / 2 + i * (uS / 2 - 0.035), 0, woodDark);
      part(group, 0.07, uS + 0.02, uS + 0.02, i * (uS / 2 - 0.035), uS / 2, 0, woodDark);
    }
    part(group, 0.1, uS, 0.06, 0, uS / 2, uS / 2 + 0.01, woodDark);
    propsGroup.add(group);
    return { group, crate, kind: 'crate' };
  }

  /* A pressure plate that reads as hardware from the camera's shallow angle:
     a proud bezel frame, a raised button slab, corner posts, and the rune
     sigil floating upright facing the player instead of lying flat unseen. */
  function createPressurePlateMesh(px, py) {
    const group = new THREE.Group();

    const frameMat = new THREE.MeshLambertMaterial({ color: 0x2c2838 });
    const rimMat = new THREE.MeshLambertMaterial({ color: 0x6f6a90 });
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x8a84a8 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 1.7), frameMat);
    frame.position.y = 0.08;
    group.add(frame);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 1.3), slabMat);
    slab.position.set(0, 0.3, 0);
    group.add(slab);

    const postOffsets = [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]];
    for (let i = 0; i < postOffsets.length; i++) {
      part(group, 0.16, 0.3, 0.16, postOffsets[i][0], 0.15, postOffsets[i][1], rimMat);
    }

    const runeGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const runeMat = new THREE.MeshBasicMaterial({
      map: runeTex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.position.set(0, 0.65, 0.2);   // upright, between the posts, facing play
    group.add(rune);

    // pz.plate.x/y is the tile the plate occupies; +16 lands on its floor.
    group.position.set(px * P2U, -(py + 16) * P2U, 0);
    propsGroup.add(group);

    return {
      group: group,
      slab: slab,
      rune: rune,
      px: px,
      py: py,
      currentY: 0.3,
      targetY: 0.3,
      emissiveIntensity: 0.2
    };
  }

  function createChestMesh(cx, cy, chestRef) {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5c3d26 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xd4a046 });

    const baseGeo = new THREE.BoxGeometry(1.2, 0.65, 0.85);
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.set(0, 0.325, 0);
    group.add(base);

    const bandGeo = new THREE.BoxGeometry(1.22, 0.67, 0.18);
    const band1 = new THREE.Mesh(bandGeo, trimMat);
    band1.position.set(0, 0.325, -0.28);
    const band2 = new THREE.Mesh(bandGeo, trimMat);
    band2.position.set(0, 0.325, 0.28);
    group.add(band1);
    group.add(band2);

    const lidGroup = new THREE.Group();
    lidGroup.position.set(0, 0.65, -0.42);

    const lidGeo = new THREE.BoxGeometry(1.24, 0.35, 0.88);
    const lid = new THREE.Mesh(lidGeo, woodMat);
    lid.position.set(0, 0.175, 0.44);
    lidGroup.add(lid);

    const lidBandGeo = new THREE.BoxGeometry(1.26, 0.37, 0.18);
    const lBand1 = new THREE.Mesh(lidBandGeo, trimMat);
    lBand1.position.set(0, 0.175, 0.16);
    const lBand2 = new THREE.Mesh(lidBandGeo, trimMat);
    lBand2.position.set(0, 0.175, 0.72);
    lidGroup.add(lBand1);
    lidGroup.add(lBand2);

    group.add(lidGroup);

    const beamGeo = new THREE.CylinderGeometry(0.3, 0.7, 4.0, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffea77,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, 2.2, 0);
    group.add(beam);

    /* Chests are created at (x, y+5) with an 11px hitbox, so the sprite's
       bottom edge sits at y+16 — the floor. Plant the model on that floor
       line, not on the hitbox top, or the base sinks half its height into
       the ground. */
    const floor = cy + 16;
    group.position.set((cx + 8) * P2U, -floor * P2U, 0.05);
    propsGroup.add(group);

    return {
      group: group,
      lidGroup: lidGroup,
      beam: beam,
      ref: chestRef,
      openAngle: 0
    };
  }

  // --- 3D Traps & Hazards System ---
  function createFloorSpikesMesh(ux, uy) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(1.5, 0.12, 1.4);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x24202c });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.06, 0);
    group.add(base);

    const coneGeo = new THREE.ConeGeometry(0.18, 0.72, 4);
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xc8c3d8 });
    const offsets = [[-0.4, -0.3], [0.4, -0.3], [-0.2, 0.3], [0.3, 0.2]];
    offsets.forEach(([ox, oz]) => {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(ox, 0.42, oz);
      cone.rotation.y = Math.PI / 4;
      group.add(cone);
    });

    group.position.set(ux, uy - (TILE_SIZE * 0.5), 0.1);
    return group;
  }

  function createDeathSpikesMesh(ux, uy) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(1.5, 0.16, 1.4);
    const baseMat = new THREE.MeshLambertMaterial({ color: 0x1a060a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 0.08, 0);
    group.add(base);

    const spikeGeo = new THREE.ConeGeometry(0.24, 1.28, 5);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0x6e1b24, emissive: 0x3d0a10, emissiveIntensity: 0.45 });

    const offsets = [[-0.45, -0.2], [0.0, 0.22], [0.45, -0.15]];
    offsets.forEach(([ox, oz]) => {
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(ox, 0.72, oz);
      group.add(spike);
    });

    group.position.set(ux, uy - (TILE_SIZE * 0.5), 0.12);
    return group;
  }

  function createMovingPlatformMesh(w) {
    const group = new THREE.Group();
    const uW = w * P2U;
    const slabGeo = new THREE.BoxGeometry(uW, 0.34, 1.25);
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x7a5634 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.17, 0);
    group.add(slab);

    const chainGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x484256 });
    const leftChain = new THREE.Mesh(chainGeo, chainMat);
    const rightChain = new THREE.Mesh(chainGeo, chainMat);
    leftChain.position.set(-uW * 0.4, 0, -0.1);
    rightChain.position.set(uW * 0.4, 0, -0.1);
    group.add(leftChain);
    group.add(rightChain);

    propsGroup.add(group);
    return { group, slab, leftChain, rightChain, kind: 'platform' };
  }

  function createSpikedBallMesh() {
    const group = new THREE.Group();
    const sphereGeo = new THREE.SphereGeometry(0.55, 8, 8);
    const ballMat = new THREE.MeshLambertMaterial({ color: 0x3e3a4e });
    const sphere = new THREE.Mesh(sphereGeo, ballMat);
    group.add(sphere);

    const spikeGeo = new THREE.ConeGeometry(0.12, 0.4, 4);
    const spikeMat = new THREE.MeshLambertMaterial({ color: 0xd0cce0 });
    const dirs = [
      [1,0,0], [-1,0,0], [0,1,0], [0,-1,0],
      [0.7,0.7,0], [-0.7,0.7,0], [0.7,-0.7,0], [-0.7,-0.7,0],
      [0,0,1], [0,0,-1]
    ];
    dirs.forEach(([dx, dy, dz]) => {
      const sp = new THREE.Mesh(spikeGeo, spikeMat);
      sp.position.set(dx * 0.52, dy * 0.52, dz * 0.52);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
      group.add(sp);
    });

    const chainGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.0, 6);
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x484256 });
    const chain = new THREE.Mesh(chainGeo, chainMat);
    group.add(chain);

    propsGroup.add(group);
    return { group, sphere, chain, kind: 'ball' };
  }

  function createSawMesh() {
    const group = new THREE.Group();
    const diskGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 16);
    const sawMat = new THREE.MeshLambertMaterial({ color: 0xa8a4be });
    const disk = new THREE.Mesh(diskGeo, sawMat);
    disk.rotation.x = Math.PI / 2;
    group.add(disk);

    // Hub cap
    const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8);
    const hubMat = new THREE.MeshLambertMaterial({ color: 0x3d394e });
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.x = Math.PI / 2;
    group.add(hub);

    // Teeth
    const toothGeo = new THREE.ConeGeometry(0.12, 0.28, 3);
    for (let a = 0; a < 8; a++) {
      const angle = (a / 8) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, sawMat);
      tooth.position.set(Math.cos(angle) * 0.68, Math.sin(angle) * 0.68, 0);
      tooth.rotation.z = angle - Math.PI / 2 + 0.3;
      group.add(tooth);
    }

    propsGroup.add(group);
    return { group, disk, kind: 'saw' };
  }

  function createCrumbleMesh(w) {
    const group = new THREE.Group();
    const uW = w * P2U;
    const slabGeo = new THREE.BoxGeometry(uW, 0.32, 1.2);
    const slabMat = new THREE.MeshLambertMaterial({ color: 0x6e5239 });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.16, 0);
    group.add(slab);

    propsGroup.add(group);
    return { group, slab, kind: 'crumble' };
  }

  function loadLevel(map, biome, g) {
    if (!enabled || !dungeonGroup) return;

    disposeGroup(dungeonGroup);
    disposeGroup(propsGroup);
    disposeGroup(themeGroup);

    clearActors();
    gateMeshes = [];
    leverMeshes = [];
    crateMeshes = [];
    ropeMeshes = [];
    elemPuddles.forEach(function (ep) { if (ep.mesh.parent) ep.mesh.parent.remove(ep.mesh); });
    elemPuddles = [];
    elemFields.forEach(function (ef) { if (ef.mesh.parent) ef.mesh.parent.remove(ef.mesh); });
    elemFields = [];
    elemBolts.forEach(function (eb) { if (eb.mesh.parent) eb.mesh.parent.remove(eb.mesh); });
    elemBolts = [];
    groundBursts.forEach(function (gb) { if (gb.group.parent) gb.group.parent.remove(gb.group); });
    groundBursts = [];
    swingFx.forEach(function (s) { if (s.group.parent) s.group.parent.remove(s.group); });
    swingFx = [];
    shrineMesh = null;
    if (fxGroup) fxGroup.children.length = 0;

    torchLights.forEach(tl => scene.remove(tl.light));
    torchLights = [];

    flameSprites.forEach(fs => scene.remove(fs.sprite));
    flameSprites = [];

    hazardMeshes.forEach(hm => {
      if (hm.group && hm.group.parent) hm.group.parent.remove(hm.group);
    });
    hazardMeshes = [];

    spikeMeshes.forEach(sm => {
      if (sm.parent) sm.parent.remove(sm);
    });
    spikeMeshes = [];

    chestMeshes = [];
    plateMeshes = [];
    doorPortalObj = null;

    if (!map) return;

    const w = map.w, h = map.h;
    const depth = (g && g.depth) || 1;
    const flavor = (g && g.levelKind === 'normal' && g.flavor) || '';
    const themeName = resolveTheme(depth, biome, flavor);

    setupTheme(themeName, w, h, biome);

    const wallTex = makeWallTexture(biome);
    const floorTex = makeFloorTexture(biome);
    const platTex = makePlatformTexture(biome);

    const wallFrontMat = new THREE.MeshLambertMaterial({ map: wallTex });
    const wallTopMat = new THREE.MeshLambertMaterial({ map: floorTex });
    const platMat = new THREE.MeshLambertMaterial({ map: platTex });

    const wallMats = [
      wallFrontMat, wallFrontMat,
      wallTopMat, wallFrontMat,
      wallFrontMat, wallFrontMat
    ];

    // Thin slabs: clearly 3D from the tilt, without jutting into the play area.
    const blockGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE, 0.9);
    const platGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE * 0.35, 0.7);

    let wallCount = 0, platCount = 0, paverCount = 0;
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.get(tx, ty);
        if (t === 1) {
          wallCount++;
          if (map.get(tx, ty - 1) !== 1) paverCount++;
        } else if (t === 2) {
          platCount++;
        }
      }
    }

    const wallMesh = new THREE.InstancedMesh(blockGeo, wallMats, wallCount);
    const platMesh = new THREE.InstancedMesh(platGeo, platMat, platCount);

    const paverGeo = new THREE.BoxGeometry(TILE_SIZE * 0.98, 0.32, 1.8);
    const paverMesh = new THREE.InstancedMesh(paverGeo, wallTopMat, paverCount);

    const dummy = new THREE.Object3D();
    let wi = 0, pi = 0, pvi = 0;

    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = map.get(tx, ty);
        const ux = (tx * 16 + 8) * P2U;
        const uy = -(ty * 16 + 8) * P2U;

        if (t === 1) {
          dummy.position.set(ux, uy, -0.3);
          dummy.updateMatrix();
          wallMesh.setMatrixAt(wi++, dummy.matrix);

          if (map.get(tx, ty - 1) !== 1) {
            dummy.position.set(ux, uy + (TILE_SIZE * 0.5 - 0.16), 0.18);
            dummy.updateMatrix();
            paverMesh.setMatrixAt(pvi++, dummy.matrix);
          }
        } else if (t === 2) {
          dummy.position.set(ux, uy + (5 * P2U), -0.15);
          dummy.updateMatrix();
          platMesh.setMatrixAt(pi++, dummy.matrix);
        } else if (t === 3) {
          const sm = createFloorSpikesMesh(ux, uy);
          propsGroup.add(sm);
          spikeMeshes.push(sm);
        } else if (t === 5) {
          const dm = createDeathSpikesMesh(ux, uy);
          propsGroup.add(dm);
          spikeMeshes.push(dm);
        }
      }
    }

    wallMesh.instanceMatrix.needsUpdate = true;
    platMesh.instanceMatrix.needsUpdate = true;
    paverMesh.instanceMatrix.needsUpdate = true;
    dungeonGroup.add(wallMesh);
    dungeonGroup.add(platMesh);
    dungeonGroup.add(paverMesh);

    // Exit doorway portal.
    let doorTileX = -1, doorTileY = -1;
    if (g && g.doorPos) {
      doorTileX = Math.floor(g.doorPos.x / 16);
      doorTileY = Math.floor(g.doorPos.y / 16);
    } else {
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          if (map.get(tx, ty) === 4) {
            doorTileX = tx;
            doorTileY = ty;
            break;
          }
        }
        if (doorTileX >= 0) break;
      }
    }

    if (doorTileX >= 0) {
      doorPortalObj = createDoorwayMesh();
      const dx = (doorTileX * 16 + 8) * P2U;
      const dy = -((doorTileY + 2) * 16) * P2U;
      doorPortalObj.group.position.set(dx, dy, 0.1);
      propsGroup.add(doorPortalObj.group);
    }

    if (map.decor) {
      for (let i = 0; i < map.decor.length; i++) {
        const d = map.decor[i];
        if (d.kind === 'torch' || d.kind === 'candle') {
          const lx = (d.x + 8) * P2U;
          // Plant the pole on the floor below its decor marker: markers carry
          // their sprite-height offset, which used to leave bases floating.
          const tcol = Math.floor((d.x + 8) / 16);
          const floorPx = map.floorBelow
            ? map.floorBelow(tcol, Math.floor((d.y + 8) / 16))
            : d.y + 16;
          const torchObj = createTorchMesh(lx, -floorPx * P2U);
          torchLights.push(torchObj);
          flameSprites.push(torchObj);
        } else if (DS.Voxel && (d.kind === 'merchant' || d.kind === 'table')) {
          // NPCs and furniture: blocky models, so the safe room reads 3D too.
          // decor y marks the sprite top (floor minus sprite height); plant
          // the model on the floor instead so nothing hovers.
          const model = DS.Voxel.build(d.kind, {});
          if (model) {
            const mcol = Math.floor((d.x + 8) / 16);
            const mFloor = map.groundBelow
              ? map.groundBelow(mcol)
              : (map.floorBelow ? map.floorBelow(mcol, 0) : d.y + 16);
            model.root.position.set((d.x + 8) * P2U, -mFloor * P2U, 0.3);
            actorGroup.add(model.root);
            if (d.kind === 'merchant') d.vox3d = model;
          }
        }
      }
    }

    if (g && g.puzzles) {
      for (let i = 0; i < g.puzzles.length; i++) {
        const pz = g.puzzles[i];
        if (pz.kind === 'plate') {
          // The coords live on pz.plate, not on the puzzle itself — using
          // pz.x produced NaN and the plate never appeared anywhere.
          const plateObj = createPressurePlateMesh(pz.plate.x + 8, pz.plate.y + 4);
          plateObj.ref = pz;
          plateMeshes.push(plateObj);
        }
        if (pz.gate) gateMeshes.push(createGateMesh(pz.gate));
        if (pz.lever) leverMeshes.push(createLeverMesh(pz.lever));
      }
    }

    if (g && g.crates) {
      for (let i = 0; i < g.crates.length; i++) {
        crateMeshes.push(createCrateMesh(g.crates[i]));
      }
    }

    if (g && g.shrine && DS.Voxel) {
      shrineMesh = DS.Voxel.build('shrine', {});
      // Sit on the real floor under the shrine marker (marker y is a tile row,
      // not a surface) so the plinth never floats or drowns.
      const scol = Math.floor((g.shrine.x + 8) / 16);
      const sFloor = g.map.floorBelow
        ? g.map.floorBelow(scol, Math.floor((g.shrine.y + 8) / 16))
        : g.shrine.y + 16;
      shrineMesh.root.position.set((g.shrine.x + 8) * P2U, -sFloor * P2U, 0.12);
      actorGroup.add(shrineMesh.root);
    }

    if (g && g.chests) {
      for (let i = 0; i < g.chests.length; i++) {
        const c = g.chests[i];
        const chestObj = createChestMesh(c.x, c.y, c);
        chestMeshes.push(chestObj);
      }
    }

    // Ropes as real 3D geometry: one knotted strand per run of rope tiles.
    // The mountain shafts live or die by these reading as climbable lines.
    if (map.isRope) {
      const ropeMat = new THREE.MeshLambertMaterial({ color: 0xa87848 });
      const ropeDark = new THREE.MeshLambertMaterial({ color: 0x5c3f2a });
      let ty = 0;
      while (ty < h) {
        let tx = 0;
        while (tx < w) {
          if (map.isRope(tx, ty) && !map.isRope(tx, ty - 1) && !map.isRope(tx - 1, ty)) {
            // Walk right to find the strand width, then down for its length.
            let x1 = tx;
            while (map.isRope(x1 + 1, ty)) x1++;
            let y1 = ty;
            while (map.isRope(tx, y1 + 1)) y1++;
            const uW = (x1 - tx + 1) * TILE_SIZE;
            const uH = (y1 - ty + 1) * TILE_SIZE;
            const group = new THREE.Group();
            const cx = ((tx + x1 + 1) * 0.5 * 16) * P2U;
            // Strand: a vertical box column per tile-wide rope.
            const strandW = Math.min(uW, 0.14);
            part(group, strandW, uH, strandW, 0, 0, 0, ropeDark);
            // Inner lit core slightly forward so the braid reads in fog.
            part(group, strandW * 0.5, uH * 0.96, strandW * 0.5, 0, 0, strandW * 0.45, ropeMat);
            // Knots every tile and an anchor block at the top.
            for (let ky = 0; ky < y1 - ty + 1; ky++) {
              part(group, strandW * 2.2, 0.09, strandW * 2.2, 0, uH * 0.5 - (ky + 0.5) * TILE_SIZE, 0, ropeMat);
            }
            if (!map.isRope(tx, ty - 1)) {
              part(group, 0.4, 0.14, 0.4, 0, uH * 0.5 + 0.05, 0, ropeDark);
            }
            group.position.set(cx, -(ty * 16) * P2U - uH * 0.5, 0.25);
            propsGroup.add(group);
            ropeMeshes.push({ group: group, x: tx, y0: ty, y1: y1 });
            tx = x1 + 1;
          } else {
            tx++;
          }
        }
        ty++;
      }
    }
  }

  // --- voxel actor sync ------------------------------------------------------

  function terrainHeight(map, px, py, h) {
    if (!map) return py + h;
    const tx = Math.floor(px / 16);
    const fb = map.floorBelow(tx, Math.floor((py + h - 1) / 16));
    return fb < map.pixelH ? fb : py + h;
  }

  /* (Re)build the hero when the loadout changes. The paper-doll palette the
     2D renderer keys on is the same signal the 3D model recolours from. */
  function ensureHero(g) {
    const p = g.player;
    if (!p || !DS.Voxel) return;
    const key = DS.Paperdoll ? DS.Paperdoll.keyFor(p.inv.armor) : '';
    if (!heroModel) {
      heroModel = DS.Voxel.build('hero', { armor: p.inv.armor });
      heroArmorKey = key;
      actorGroup.add(heroModel.root);
      heroWeaponRef = null;
      heroWeaponMesh = null;
    } else if (key !== heroArmorKey) {
      heroArmorKey = key;
      const wpn = heroWeaponMesh;
      actorGroup.remove(heroModel.root);
      disposeModel(heroModel);
      heroModel = DS.Voxel.build('hero', { armor: p.inv.armor });
      actorGroup.add(heroModel.root);
      heroWeaponMesh = wpn;   // reattach below on the next pose pass
    }

    const item = DS.Inv.weapon(p.inv);
    if (item !== heroWeaponRef) {
      heroWeaponRef = item;
      if (heroWeaponMesh && heroWeaponMesh.parent) {
        heroWeaponMesh.parent.remove(heroWeaponMesh);
      }
      heroWeaponMesh = null;
      heroWeaponAura = null;
      if (item && heroModel.armR) {
        const base = DS.Weapons.WEAPONS[item.type];
        const color = DS.Weapons.rarityColor(item.rarity);
        heroWeaponMesh = DS.Voxel.buildWeapon(item.type, color);
        heroWeaponMesh.position.y = -0.34;   // the hand, at arm's end
        /* Grip it like a tool, not a plank glued to the forearm: blades rise
           up over the shoulder with a slight forward cant, and the broad face
           yaws back toward the camera (the root's 66° turn leaves it nearly
           edge-on otherwise). Bow/staff stay near-vertical in the fist. */
        const release = base && base.holdMode === 'release';
        heroWeaponMesh.rotation.set(release ? 0.2 : 0.35, release ? 0 : -0.55, release ? 0 : -0.18);
        heroModel.armR.add(heroWeaponMesh);
        // Elemental weapons carry a visible aura: tiny glowing motes orbit
        // the blade, tinted by the element. Melee weapons hold their element
        // in procs.element (the Flaming/Frozen prefix), staffs in item.element.
        const auraEl = item.element || (item.procs && item.procs.element);
        if (auraEl && DS.Weapons.ELEMENTS[auraEl]) {
          const elCol = DS.Voxel.elementColorHex(auraEl);
          const aura = new THREE.Group();
          for (let a = 0; a < 3; a++) {
            const mote = new THREE.Mesh(
              new THREE.BoxGeometry(0.05, 0.05, 0.05),
              new THREE.MeshBasicMaterial({ color: elCol, transparent: true,
                opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
            mote.userData.angle = a * (Math.PI * 2 / 3);
            mote.userData.r = 0.24 + (a % 2) * 0.08;
            aura.add(mote);
          }
          aura.position.y = 0.4;
          heroWeaponMesh.add(aura);
          heroWeaponAura = aura;
        }
      }
    }
  }

  function ensureEnemyModel(g, e) {
    if (!DS.Voxel) return null;
    let model = enemyModels.get(e);
    if (!model) {
      const key = DS.Voxel.keyFor(e);
      model = DS.Voxel.build(key, { tier: e.tier, tint: e.barColor });
      if (!model) return null;
      enemyModels.set(e, model);
      actorGroup.add(model.root);
    }
    return model;
  }

  function actorScale(e) {
    if (!e) return 1;
    // Tier scale rides the entity already (size 1/2/3 for normal/miniboss/colossus).
    return (e.sizeScale || 1) * 0.95;
  }

  function poseHero(g, p, time) {
    if (!p) return;
    ensureHero(g);
    const model = heroModel;
    if (!model) return;

    const m = heroModel;
    const walk = Math.abs(p.vx || 0);
    const speedRatio = M.clamp(walk / 2.2, 0, 1);
    const cyc = time * 11;
    const bob = p.onGround && walk < 0.25 ? Math.sin(time * 2.4) * 0.015 : 0;
    // Root: world position, facing flip, squash on landing.
    // Origin sits at the FEET, not the hitbox top: the model stands on the
    // floor line and death topples it around its heels, not mid-air.
    m.root.position.set((p.x + p.w * 0.5) * P2U, (-p.y - p.h) * P2U, 0.3);
    /* Facing: the body actually TURNS toward the run direction (three-quarter
       view, ±66°). Rotating +y turns the model's front (+z) toward screen-right
       (checked: (0,0,1) → (sin θ, 0, cos θ)), so facing=1 must be POSITIVE.
       The old sign had the hero presenting his back to the camera. */
    let targetRy = p.facing < 0 ? -1.15 : 1.15;
    const airborne = !p.onGround && !p.onRope;
    const rising = airborne && p.vy < 0;

    if (p.onRope) {
      const climb = Math.abs(p.vy) > 0.1 ? Math.sin(time * 10) * 0.5 : 0;
      m.armL.rotation.x = -2.6 + climb;
      m.armR.rotation.x = -2.6 - climb;
      m.legL.rotation.x = climb * 0.4;
      m.legR.rotation.x = -climb * 0.4;
      targetRy = 2.75;                // face the wall the rope hangs on
    } else if (airborne) {
      m.armL.rotation.x = rising ? -0.7 : -1.9;
      m.armR.rotation.x = rising ? -0.7 : -1.9;
      m.legL.rotation.x = rising ? 0.5 : -0.3;
      m.legR.rotation.x = rising ? -0.35 : 0.15;
    } else {
      const swing = Math.sin(cyc) * speedRatio;
      m.legL.rotation.x = swing * 0.7;
      m.legR.rotation.x = -swing * 0.7;
      m.armL.rotation.x = -swing * 0.6;
      if (!p.swingTimer) m.armR.rotation.x = swing * 0.6;
      if (!p.swingTimer) m.torso.rotation.y = swing * 0.08;
    }

    // Attack: arm sweeps through the 2D game's pose curve.
    if (p.swingTimer > 0 && p.pending) {
      const item = DS.Inv.weapon(p.inv);
      const base = item ? DS.Weapons.WEAPONS[item.type] : null;
      const t = 1 - (p.swingTimer / Math.max(1, p.swingMax));
      const heavy = p.attackHeavy;
      const arc = base && (base.key === 'sword' || base.key === 'greataxe');
      if (arc) {
        m.armR.rotation.x = M.lerp(-2.3, 1.4, heavy ? t * t : t);
        m.torso.rotation.y = M.lerp(0.5, -0.4, t);
      } else if (base && (base.key === 'dagger' || base.key === 'spear')) {
        const out = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        m.armR.rotation.x = -1.5;
        m.armR.rotation.z = M.lerp(0.4, -0.4, out);
      } else {
        m.armR.rotation.x = M.lerp(-2.6, -0.7, Math.sin(t * Math.PI));
      }
    } else if (p.charging) {
      const item2 = DS.Inv.weapon(p.inv);
      const base2 = item2 ? DS.Weapons.WEAPONS[item2.type] : null;
      const ratio = M.clamp(p.holdFrames / ((base2 && base2.chargeMax) || 30), 0, 1);
      m.armR.rotation.x = M.lerp(-0.6, 0.9, ratio);
      m.torso.rotation.y = M.lerp(0, 0.45, ratio);
    } else if (!p.onRope && !airborne) {
      m.torso.rotation.y *= 0.8;
    }

    // A 3D body pivots toward where it walks — no sprite-style mirror snap.
    let dRy = targetRy - m.root.rotation.y;
    while (dRy > Math.PI) dRy -= Math.PI * 2;
    while (dRy < -Math.PI) dRy += Math.PI * 2;
    m.root.rotation.y += dRy * 0.35;

    // Elemental weapon aura: motes orbit the blade while it is held.
    if (heroWeaponAura) {
      const t = time * 2.6;
      for (let a = 0; a < heroWeaponAura.children.length; a++) {
        const mote = heroWeaponAura.children[a];
        const ang = mote.userData.angle + t;
        mote.position.set(Math.cos(ang) * mote.userData.r,
          Math.sin(t * 1.3 + a * 2.1) * 0.1, Math.sin(ang) * mote.userData.r);
      }
    }

    // Cast/charge glow on the staff tip handled by the emissive material.
    m.head.rotation.z = p.hurtFlash > 0 ? Math.sin(time * 40) * 0.15 : 0;
    m.root.position.y += bob + (p.onRope ? 0.05 : 0);

    // Death: topple over.
    if (p.dead) {
      m.root.rotation.z = M.lerp(m.root.rotation.z, Math.PI / 2 * (p.facing < 0 ? -1 : 1), 0.12);
    } else m.root.rotation.z = 0;
  }

  function poseEnemy(e, model, time, map) {
    const cx = e.x + e.w * 0.5;
    const isSlimey = model.kind === 'slime' || model.kind === 'slimeking';
    const groundY = e.flying ? e.y + e.h : terrainHeight(map, cx, e.y, e.h);
    // Feet on the floor: a ground walker anchors at the surface below it, a
    // flier at the bottom of its own hitbox (plus the hover bob further down).
    const baseY = -(e.flying ? e.y + e.h : groundY);

    model.root.position.set(cx * P2U, baseY * P2U, 0.3);
    // Same three-quarter facing as the hero: the monster turns toward where
    // it walks, face still readable from the camera.
    const targetRy = e.facing < 0 ? -1.15 : 1.15;
    let dRy = targetRy - model.root.rotation.y;
    while (dRy > Math.PI) dRy -= Math.PI * 2;
    while (dRy < -Math.PI) dRy += Math.PI * 2;
    model.root.rotation.y += dRy * 0.35;
    if (e.flying) {
      model.root.position.y += Math.sin(time * 3.2 + (e.x || 0) * 0.02) * 0.08;
    }
    // Delegate limb animation to the shared poser, then layer state on top.
    DS.Voxel.pose(model, e, time);
    if (e.hurtFlash > 0) {
      model.root.rotation.z = Math.sin(time * 44) * 0.09;
    } else model.root.rotation.z = 0;

    // Tier crown: elites get a faint ember, minibosses a red glow child.
    // (The 2D overlay still draws the HP bar; here only presence matters.)
    if (e.tier === 'colossal') model.root.scale.setScalar(1.0 * (e.sizeScale || 3) * 0.95);
    else model.root.scale.setScalar(actorScale(e));

    if (isSlimey) {
      // Slimes have no legs; the whole body squashes on landing.
      const squash = e.onGround ? 1 : 1.12;
      model.body.scale.y = (model.body.scale.y || 1) * 0 + (1 / squash) * (1 + Math.sin(time * 7) * 0.05);
    }

    if (e.dead) model.root.visible = false;
  }

  /* Projectile meshes live in a small pool keyed by insertion order; the 2D
     sim stays authoritative, this only mirrors position/angle. */
  function ensureProjMesh(p, i) {
    let pm = projMeshes[i];
    if (!pm || pm.kind !== p.kind || pm.element !== (p.element || null)) {
      if (pm && pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
      const mesh = DS.Voxel.buildProjectile(p.kind, p.element);
      pm = { mesh, kind: p.kind, element: p.element || null };
      projMeshes[i] = pm;
      fxGroup.add(mesh);
    }
    return pm;
  }

  function syncProjectiles(g, time) {
    const count = g.projectiles.length;
    for (let i = 0; i < count; i++) {
      const p = g.projectiles[i];
      const pm = ensureProjMesh(p, i);
      pm.mesh.visible = true;
      pm.mesh.position.set((p.x + p.w * 0.5) * P2U, -(p.y + p.h * 0.5) * P2U, 0.35);
      if (p.kind === 'arrow') {
        pm.mesh.rotation.z = -Math.atan2(p.vy, p.vx);
      } else {
        pm.mesh.rotation.y = time * 3;
      }
    }
    for (let i = count; i < projMeshes.length; i++) projMeshes[i].mesh.visible = false;
  }

  /* --- elemental ground FX in real 3D --------------------------------------

     Fields (fire patches, poison mist, ...) and per-enemy status puddles
     become glowing plates lying on the floor; lightning becomes a jagged
     3D strip between two points. Keyed pools recycle meshes so a churning
     fight never reallocates geometry. */
  const ELEM_COLORS = {
    fire: 0xe8743b, ice: 0x4fb3e0, lightning: 0xf2c14e,
    poison: 0x5cbf62, water: 0x2f6fa8, earth: 0xb98d5c,
    leaf: 0xa3e86b, steam: 0xd8d5e8
  };

  function acquirePlate(pool, key, el, w, d) {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].key === null) {
        pool[i].key = key;
        pool[i].mesh.visible = true;
        setPlateColor(pool[i].mesh, el);
        pool[i].mesh.scale.set(w / 1.2, 1, d / 1.2);
        return pool[i].mesh;
      }
    }
    const col = ELEM_COLORS[el] || 0xffffff;
    const group = new THREE.Group();
    const glowMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 1.2), glowMat);
    group.add(plate);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.024, 0.1),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false }));
    edge.position.z = 0.56;
    group.add(edge);
    const edge2 = edge.clone();
    edge2.position.z = -0.56;
    group.add(edge2);
    const edge3 = edge.clone();
    edge3.rotation.y = Math.PI / 2;
    edge3.position.set(0.56, 0, 0);
    group.add(edge3);
    const edge4 = edge.clone();
    edge4.rotation.y = Math.PI / 2;
    edge4.position.set(-0.56, 0, 0);
    group.add(edge4);
    group.position.y = 0.03;
    fxGroup.add(group);
    const entry = { mesh: group, key: key };
    pool.push(entry);
    return group;
  }

  function setPlateColor(group, el) {
    const col = new THREE.Color(ELEM_COLORS[el] || 0xffffff);
    for (let i = 0; i < group.children.length; i++) {
      if (group.children[i].material) group.children[i].material.color.copy(col);
    }
  }

  function releasePlate(pool, mesh) {
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].mesh === mesh) { pool[i].key = null; pool[i].mesh.visible = false; return; }
    }
  }

  function placePlate(mesh, x, y, radius) {
    mesh.position.x = x * P2U;
    mesh.position.z = 0.06;
    mesh.position.y = -Math.max(0.5, (y - 1) * P2U) + 0.03;
    const r = Math.max(0.8, radius * P2U);
    mesh.scale.set(r / 0.6, 1, r / 0.6);
  }

  // Ground field: the burning patch / poison cloud the player stood in.
  function syncElemFields(g) {
    if (!g.fields) g.fields = [];
    const fields = g.fields;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const key = 'f' + i;
      let entry = elemFields[i];
      if (!entry) {
        entry = { mesh: acquirePlate(elemFields, key, f.element, 1, 1), key: key };
        elemFields[i] = entry;
      } else {
        entry.mesh.visible = true;
        setPlateColor(entry.mesh, f.element);
      }
      const fade = Math.min(1, f.life / 60);
      entry.mesh.traverse(function (o) {
        if (o.material && o.material.opacity != null) o.material.opacity = 0.42 * fade + 0.1;
      });
      placePlate(entry.mesh, f.x, f.y, f.r);
    }
    for (let i = fields.length; i < elemFields.length; i++) {
      if (elemFields[i].mesh.visible) elemFields[i].mesh.visible = false;
    }
  }

  /* Skill FX on the floor, in 3D: a short-lived ring of glowing voxel shards
     that scatter along the ground from an elemental hit. Called automatically
     from the FX.element hook so every 2D emitter also dirties the 3D floor. */
  function spawnGroundBurst(element, px, py, power) {
    if (!fxGroup || !DS.Voxel) return;
    const elCol = DS.Voxel.elementColorHex(element) || 0xffffff;
    const group = new THREE.Group();
    const n = Math.min(14, 7 + Math.round((power || 1) * 3));
    for (let i = 0; i < n; i++) {
      const s = 0.09 + Math.random() * 0.1;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s * 0.55, s),
        new THREE.MeshBasicMaterial({ color: elCol, transparent: true,
          opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const d = 0.3 + Math.random() * 0.9 * (power || 1);
      m.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d * 0.45);
      m.userData.vx = Math.cos(a) * (0.014 + Math.random() * 0.024);
      m.userData.vz = Math.sin(a) * (0.007 + Math.random() * 0.012);
      m.userData.vy = 0.025 + Math.random() * 0.06;
      group.add(m);
    }
    group.position.set(px * P2U, -py * P2U, 0.1);
    fxGroup.add(group);
    groundBursts.push({ group: group, life: 26, maxLife: 26 });
  }

  function updateGroundBursts() {
    for (let i = groundBursts.length - 1; i >= 0; i--) {
      const gb = groundBursts[i];
      gb.life--;
      const t = gb.life / gb.maxLife;
      gb.group.children.forEach(function (m) {
        m.position.x += m.userData.vx;
        m.position.z += m.userData.vz;
        m.userData.vy -= 0.004;              // gravity back to the floor
        m.position.y += m.userData.vy;
        if (m.position.y < 0.03) { m.position.y = 0.03; m.userData.vy = 0; }
        m.material.opacity = 0.95 * t;
      });
      if (gb.life <= 0) {
        if (gb.group.parent) gb.group.parent.remove(gb.group);
        gb.group.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        });
        groundBursts.splice(i, 1);
      }
    }
  }

  // Per-enemy status puddle API used by Elements.tick.
  function spawnElemPuddle(el, x, y) {
    const mesh = acquirePlate(elemPuddles, 'p' + Math.random(), el, 1, 1);
    placePlate(mesh, x, y, 9);
    return mesh;
  }
  function updateElemPuddle(mesh, x, y) {
    if (mesh) placePlate(mesh, x, y, 9);
  }
  function removeElemPuddle(mesh) {
    if (mesh) releasePlate(elemPuddles, mesh);
  }

  // Lightning: a jagged additive strip from a to b, rebuilt while alive.
  function syncElemBolts(g) {
    if (!g.bolts) g.bolts = [];
    const bolts = g.bolts;
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i];
      let entry = elemBolts[i];
      if (!entry) {
        const geo = new THREE.BoxGeometry(1, 0.05, 0.05);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xfff0a8, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        fxGroup.add(m);
        entry = { mesh: m };
        elemBolts[i] = entry;
      }
      const x1 = b.x1 * P2U, y1 = -b.y1 * P2U, x2 = b.x2 * P2U, y2 = -b.y2 * P2U;
      const dx = x2 - x1, dy = y2 - y1;
      const len = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));
      entry.mesh.visible = true;
      entry.mesh.scale.set(len, 1, 1);
      entry.mesh.position.set(x1 + dx * 0.5, y1 + dy * 0.5, 0.35);
      entry.mesh.rotation.z = Math.atan2(dy, dx);
      entry.mesh.material.opacity = b.life > 6 ? 0.9 : 0.4;
    }
    for (let i = bolts.length; i < elemBolts.length; i++) {
      if (elemBolts[i].mesh.visible) elemBolts[i].mesh.visible = false;
    }
  }

  /* Melee swing arc: a fan of additive boxes sweeping the hit area, spawned
     on an actual hit so the blow reads in 3D the way the 2D trail did. */
  function spawnSwingArc(x, y, dir, heavy) {
    const col = heavy ? 0xfff0a8 : 0xe8e8f4;
    const group = new THREE.Group();
    const R = heavy ? 2.3 : 1.7;
    const count = heavy ? 6 : 5;
    for (let i = 0; i < count; i++) {
      const a = (-0.95 + (i / (count - 1)) * 1.9) * dir;
      const seg = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, heavy ? 0.17 : 0.11, 0.03),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false }));
      seg.position.set(Math.sin(a) * R, Math.cos(a) * R * 0.6, 0);
      seg.rotation.z = -a;
      group.add(seg);
    }
    group.position.set(x * P2U, -y * P2U, 0.4);
    fxGroup.add(group);
    swingFx.push({ group: group, life: 10, maxLife: 10 });
  }

  function updateSwingFx() {
    for (let i = swingFx.length - 1; i >= 0; i--) {
      const s = swingFx[i];
      s.life--;
      const t = Math.max(0, s.life / s.maxLife);
      s.group.traverse(function (o) {
        if (o.material) o.material.opacity = 0.85 * t;
        if (o.geometry && s.life <= 0) o.geometry.dispose();
      });
      s.group.scale.setScalar(1 + (1 - t) * 0.45);
      if (s.life <= 0) { fxGroup.remove(s.group); swingFx.splice(i, 1); }
    }
  }

  function ensurePickupMesh(pk, i) {
    let pm = pickupMeshes[i];
    if (!pm || pm.kind !== pk.kind) {
      if (pm && pm.mesh.parent) pm.mesh.parent.remove(pm.mesh);
      const mesh = DS.Voxel.buildPickup(pk.kind,
        pk.kind === 'item' ? DS.Weapons.rarityColor(pk.item.rarity) : null);
      pm = { mesh, kind: pk.kind };
      pickupMeshes[i] = pm;
      fxGroup.add(mesh);
    }
    return pm;
  }

  function syncPickups(g, time) {
    const count = g.pickups.length;
    for (let i = 0; i < count; i++) {
      const pk = g.pickups[i];
      const pm = ensurePickupMesh(pk, i);
      const blink = pk.life < 60 && Math.floor(pk.life / 5) % 2 === 0;
      pm.mesh.visible = !blink;
      /* Anchor at the pickup's own BOTTOM edge and follow the 2D physics: the
         sim's bounce settles it on the floor, so the mesh lands with it. The
         old centre anchor read as half-buried; a big floor probe read as
         floating. A shallow shimmer bob plays only once it has settled. */
      const settled = Math.abs(pk.vy || 0) < 0.06 && pk.onGround !== false;
      const bobY = settled ? Math.sin(time * 3 + i) * 0.045 + 0.06 : 0.04;
      pm.mesh.position.set((pk.x + pk.w * 0.5) * P2U,
                           -(pk.y + pk.h) * P2U + bobY,
                           0.3);
      pm.mesh.rotation.y = time * 2.4 + i;
    }
    for (let i = count; i < pickupMeshes.length; i++) pickupMeshes[i].mesh.visible = false;
  }

  /* Puzzles: mirrors the lever state and slides the gates with their lift. */
  function syncPuzzles(g) {
    if (!g.puzzles) { gateMeshes.forEach(gm => { gm.group.visible = false; }); return; }

    // Gates (vault gates and barrier keygates both).
    for (let i = 0; i < gateMeshes.length; i++) {
      const gm = gateMeshes[i];
      const gate = gm.gate;
      gm.group.visible = gate.lift < gate.h - 2;
      const gy = -(gate.y + gate.h * 0.5) * P2U;
      gm.group.position.set((gate.x + gate.w * 0.5) * P2U, gy, 0.05);
    }
    for (let i = 0; i < leverMeshes.length; i++) {
      const lm = leverMeshes[i];
      const on = lm.lever.on;
      const target = on ? 0.85 : -0.85;
      lm.pivot.rotation.z = M.approach(lm.pivot.rotation.z, target, 0.12);
      lm.knobMat.color.setHex(on ? 0x5cbf62 : 0xc0303c);
    }
    for (let i = 0; i < crateMeshes.length; i++) {
      const cm = crateMeshes[i];
      const c = cm.crate;
      cm.group.position.set((c.x + c.w * 0.5) * P2U, -(c.y + c.h) * P2U, 0.12);
    }
  }

  function syncShrine(g, time) {
    if (!shrineMesh) return;
    if (!g.shrine) { shrineMesh.root.visible = false; return; }
    const s = g.shrine;
    shrineMesh.root.visible = true;
    shrineMesh.root.position.set((s.x + 8) * P2U, -(s.y + 16) * P2U, 0.12);
    if (shrineMesh.rune) {
      shrineMesh.rune.position.y = 1.75 + Math.sin(time * 2.2) * 0.06;
      shrineMesh.rune.rotation.y = time * 1.4;
      shrineMesh.rune.visible = !s.used;
    }
  }

  function w0(g) { return g.map ? g.map.pixelW : 0; }

  const shadowPool = [];
  const shadowGeo = new THREE.PlaneGeometry(1.2, 0.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.15,
    depthWrite: false
  });

  function getShadowMesh(idx) {
    if (idx < shadowPool.length) return shadowPool[idx];
    const m = new THREE.Mesh(shadowGeo, shadowMat);
    m.position.z = 0.05;
    shadowGroup.add(m);
    shadowPool.push(m);
    return m;
  }

  function render(g) {
    if (!enabled || !renderer || !camera || !g) return;

    const R = DS.R;
    const camX = R.cam.x * P2U;
    const camY = -R.cam.y * P2U;
    const time = g.frames * 0.055;

    if (DS.Voxel) {
      if (g.player) poseHero(g, g.player, time);
      else if (heroModel) heroModel.root.visible = false;

      // Spawn models for any new enemy; retire models whose entity is gone.
      for (let i = 0; i < g.enemies.length; i++) {
        const e = g.enemies[i];
        if (e.dead) continue;
        const model = ensureEnemyModel(g, e);
        if (model) poseEnemy(e, model, time, g.map);
      }
      enemyModels.forEach(function (model, e) {
        if (e.dead || g.enemies.indexOf(e) < 0) {
          disposeModel(model);
          enemyModels.delete(e);
        }
      });

      syncProjectiles(g, time);
      syncPickups(g, time);
      syncPuzzles(g);
      syncShrine(g, time);
      syncElemFields(g);
      syncElemBolts(g);
      updateGroundBursts();
      updateSwingFx();
    }

    camera.position.x = camX;
    camera.position.y = camY - CAM_DIST * Math.tan(TILT_ANGLE);
    camera.position.z = CAM_DIST;
    camera.lookAt(camX, camY, 0);

    if (g.player && playerLight) {
      playerLight.position.x = (g.player.x + g.player.w * 0.5) * P2U;
      playerLight.position.y = -(g.player.y + g.player.h * 0.5) * P2U;
      playerLight.intensity = 0.6 + Math.sin(g.frames * 0.035) * 0.04;
    }

    for (let i = 0; i < torchLights.length; i++) {
      const tl = torchLights[i];
      const fo = tl.flickerOffset;
      const rawTarget = tl.baseIntensity
        + Math.sin(time * 0.71 + fo)         * 0.03
        + Math.sin(time * 1.37 + fo * 0.61) * 0.02
        + Math.sin(time * 2.83 + fo * 1.19) * 0.01;
      tl.smooth = tl.smooth + (rawTarget - tl.smooth) * 0.14;
      tl.light.intensity = tl.smooth;
    }

    for (let i = 0; i < flameSprites.length; i++) {
      const fs = flameSprites[i];
      const s = 1 + Math.sin(time * 4.0 + fs.seed) * 0.15;
      fs.sprite.scale.set(1.1 * s, 1.4 * (2 - s), 1.1);
    }

    if (doorPortalObj) {
      doorPortalObj.portal.rotation.z += 0.02;
      doorPortalObj.ring.rotation.z -= 0.015;

      const isDoorUnlocked = !g.lockedDoor || g.bossDown;
      if (isDoorUnlocked) {
        doorPortalObj.portal.material.color.setHex(0xffffff);
        doorPortalObj.ring.material.color.setHex(0x4ee2ec);
        doorPortalObj.light.color.setHex(0x4ee2ec);
        doorPortalObj.light.intensity = 1.3 + Math.sin(time * 3.0) * 0.3;
      } else {
        doorPortalObj.portal.material.color.setHex(0x882233);
        doorPortalObj.ring.material.color.setHex(0xff2244);
        doorPortalObj.light.color.setHex(0xff2244);
        doorPortalObj.light.intensity = 0.8 + Math.sin(time * 5.0) * 0.2;
      }
    }

    if (g.hazards) {
      while (hazardMeshes.length < g.hazards.length) {
        const h = g.hazards[hazardMeshes.length];
        let hm = null;
        if (h.kind === 'platform') hm = createMovingPlatformMesh(h.w);
        else if (h.kind === 'ball') hm = createSpikedBallMesh();
        else if (h.kind === 'saw') hm = createSawMesh();
        else if (h.kind === 'crumble') hm = createCrumbleMesh(h.w);
        if (hm) hazardMeshes.push(hm);
        else break;
      }

      for (let i = 0; i < hazardMeshes.length; i++) {
        const hm = hazardMeshes[i];
        if (i < g.hazards.length) {
          const h = g.hazards[i];
          hm.group.visible = true;
          const hx = (h.x + h.w * 0.5) * P2U;
          const hy = -(h.y + h.h * 0.5) * P2U;
          hm.group.position.set(hx, hy, 0.15);

          if (hm.kind === 'platform') {
            const anchorY = -(h.baseY - h.range - 8) * P2U;
            const chainLen = Math.max(0.2, Math.abs(hy - anchorY));
            hm.leftChain.scale.y = chainLen;
            hm.leftChain.position.y = chainLen * 0.5;
            hm.rightChain.scale.y = chainLen;
            hm.rightChain.position.y = chainLen * 0.5;
          } else if (hm.kind === 'ball') {
            const anchorY = -(h.baseY - h.range - 10) * P2U;
            const chainLen = Math.max(0.2, Math.abs(hy - anchorY));
            hm.chain.scale.y = chainLen;
            hm.chain.position.y = chainLen * 0.5;
            hm.sphere.rotation.z += 0.04;
          } else if (hm.kind === 'saw') {
            hm.disk.rotation.z += 0.28;
          } else if (hm.kind === 'crumble') {
            if (h.broken > 0) {
              hm.group.visible = false;
            } else {
              hm.group.visible = true;
              if (h.triggered > 0) {
                hm.group.position.x += (Math.random() - 0.5) * 0.08;
              }
            }
          }
        } else {
          hm.group.visible = false;
        }
      }
    }

    for (let i = 0; i < plateMeshes.length; i++) {
      const pm = plateMeshes[i];
      let isSteppedOn = false;

      if (pm.ref && pm.ref.plate && pm.ref.plate.pressed) {
        isSteppedOn = true;
      } else if (g.player) {
        const dx = Math.abs(g.player.x + g.player.w * 0.5 - pm.px);
        const dy = Math.abs(g.player.y + g.player.h - pm.py);
        if (dx < 12 && dy < 8) isSteppedOn = true;
      }

      if (!isSteppedOn && g.crates) {
        for (let c = 0; c < g.crates.length; c++) {
          const cr = g.crates[c];
          if (Math.abs(cr.x + cr.w * 0.5 - pm.px) < 12 && Math.abs(cr.y + cr.h - pm.py) < 8) {
            isSteppedOn = true;
            break;
          }
        }
      }

      pm.targetY = isSteppedOn ? 0.16 : 0.3;
      pm.currentY += (pm.targetY - pm.currentY) * 0.22;
      pm.slab.position.y = pm.currentY;
      pm.rune.position.y = pm.currentY + 0.35;

      const targetEmissive = isSteppedOn ? 1.0 : 0.25;
      pm.emissiveIntensity += (targetEmissive - pm.emissiveIntensity) * 0.2;
      pm.rune.material.opacity = 0.4 + pm.emissiveIntensity * 0.6;
      pm.rune.material.color.setHex(isSteppedOn ? 0x5cbf62 : 0x9b96b8);
    }

    for (let i = 0; i < chestMeshes.length; i++) {
      const cm = chestMeshes[i];
      const isOpened = cm.ref && cm.ref.opened;
      const targetAngle = isOpened ? -1.22 : 0;
      cm.openAngle += (targetAngle - cm.openAngle) * 0.14;
      cm.lidGroup.rotation.x = cm.openAngle;

      if (isOpened) {
        cm.beam.material.opacity = Math.min(0.65, cm.beam.material.opacity + 0.04);
        cm.beam.rotation.y += 0.02;
      } else {
        cm.beam.material.opacity = 0;
      }
    }

    if (screenParticleManager) {
      screenParticleManager.update(camX, camY, 0.016);
    }

    // Near-parallax plane drifts at 0.72x camera speed, like the 2D renderer.
    if (nearBackdrop) {
      nearBackdrop.position.x = (w0(g) * 0.5) * P2U + camX * 0.28;
    }

    let sIdx = 0;
    if (g.player) {
      const p = g.player;
      const pcx = p.x + p.w * 0.5;
      const ptx = Math.floor(pcx / 16);
      let groundY = p.y + p.h;
      if (g.map) {
        const pty = Math.floor((p.y + p.h - 1) / 16);
        const fb = g.map.floorBelow(ptx, pty);
        if (fb < g.map.pixelH) groundY = fb;
      }
      const dist = groundY - (p.y + p.h);
      if (dist >= 0 && dist < 72) {
        const sm = getShadowMesh(sIdx++);
        sm.visible = true;
        sm.position.x = pcx * P2U;
        sm.position.y = -groundY * P2U;
        const fade = Math.max(0.2, 1 - dist / 72);
        sm.scale.set(Math.max(0.6, 1 - dist * 0.008) * fade, Math.max(0.35, 0.5 - dist * 0.005) * fade, 1);
      }
    }

    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (e.dead) continue;

      const ecx = e.x + e.w * 0.5;
      const etx = Math.floor(ecx / 16);
      let groundY = e.y + e.h;
      if (g.map) {
        const ety = Math.floor((e.y + e.h - 1) / 16);
        const fb = g.map.floorBelow(etx, ety);
        if (fb < g.map.pixelH) groundY = fb;
      }
      const dist = groundY - (e.y + e.h);
      if (dist >= 0 && dist < 64) {
        const sm = getShadowMesh(sIdx++);
        sm.visible = true;
        sm.position.x = ecx * P2U;
        sm.position.y = -groundY * P2U;

        let ew = (e.w * P2U) / 1.2;
        let eh = ew * 0.4;
        if (e.kind === 'slime') {
          const bounce = Math.sin(time * 4.5 + e.x) * 0.15;
          ew *= (1 + bounce);
          eh *= (1 - bounce * 0.5);
        }
        const fade = Math.max(0.2, 1 - dist / 64);
        sm.scale.set(ew * fade, eh * fade, 1);
      }
    }

    for (let i = sIdx; i < shadowPool.length; i++) {
      shadowPool[i].visible = false;
    }

    renderer.render(scene, camera);
  }

  DS.R3D = {
    init: init,
    resize: resize,
    loadLevel: loadLevel,
    render: render,
    spawnElemPuddle: spawnElemPuddle,
    spawnGroundBurst: spawnGroundBurst,
    updateElemPuddle: updateElemPuddle,
    removeElemPuddle: removeElemPuddle,
    spawnSwingArc: spawnSwingArc,
    get isEnabled() { return enabled; },
    /* True when gameplay characters are 3D models — every sprite-drawing
       call site keys off this so the 2D canvas draws only FX/UI. */
    get voxels() { return enabled && !!(DS.Voxel); },
    get scene() { return scene; }
  };
})(window.DS);
