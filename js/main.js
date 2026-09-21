/* =====================================================================
 *  main.js — 게임 루프 · 입력 · 상호작용 · 저장
 * ===================================================================== */
(function () {
  'use strict';

  /* three.js 로드 확인 */
  if (typeof THREE === 'undefined') {
    const ov = document.getElementById('overlay');
    const menu = document.getElementById('panel-menu');
    const err = document.getElementById('panel-error');
    const msg = document.getElementById('error-msg');
    if (msg) msg.textContent = 'vendor/three.min.js 를 불러오지 못했습니다. 폴더 구조를 확인해 주세요.';
    if (menu) menu.classList.add('hidden');
    if (err) err.classList.remove('hidden');
    if (ov) ov.classList.remove('hidden');
    return;
  }

  const MC = window.MC;
  const ID = MC.ID;
  const UI = MC.UI;
  const Sound = MC.Sound;

  const SAVE_KEY = 'minicraft.save.v2';
  const RENDER_DISTANCE = 6;
  const REACH = 6;
  const DAY_SECONDS = 600;       // 하루 길이(초)

  /* ---- 전역 상태 ---- */
  let renderer = null, scene = null, camera = null, clock = null;
  let atlasInfo = null, atlasTex = null;
  let world = null, player = null;
  let state = 'menu';            // menu | loading | playing | paused | inventory
  let highlight = null, heldMesh = null, heldMat = null, heldId = -1;
  let sunMesh = null, moonMesh = null, stars = null;
  let particles = null;
  const parts = [];
  const MAX_PARTS = 320;
  let dummy = null;

  let hotbar = MC.DEFAULT_HOTBAR.slice();
  let selected = 0;
  let currentTarget = null;
  let breakHeld = false, placeHeld = false, breakCd = 0, placeCd = 0;
  let swing = 0;
  let wasInWater = false;
  let stepAccum = 0;
  let curFov = 70;
  let timeOfDay = 0.28, timeFlowing = true;
  let showDebug = false;
  let fps = 60, fpsAcc = 0, fpsFrames = 0;
  let autosaveT = 0;
  let loadTotal = 1;
  let lastSpace = 0;
  let spawnPoint = null;
  let skyColor = null;
  const tmpV1 = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpV3 = new THREE.Vector3();
  const tmpColor = new THREE.Color();

  /* ===================================================================
   *  초기화
   * =================================================================== */
  function init() {
    const canvas = document.getElementById('game');
    UI.init();

    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) {
      showError('이 브라우저에서 WebGL을 사용할 수 없습니다.');
      return;
    }
    if (!renderer || !renderer.getContext()) {
      showError('이 브라우저에서 WebGL을 사용할 수 없습니다.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    // 픽셀 아트 특유의 또렷한 명암 대비를 위해 색 변환을 끈 선형 파이프라인을 사용합니다.
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.NoColorSpace !== undefined ? THREE.NoColorSpace : THREE.LinearSRGBColorSpace;
    }
    if (renderer.outputEncoding !== undefined && THREE.LinearEncoding !== undefined) {
      renderer.outputEncoding = THREE.LinearEncoding;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1016);
    skyColor = new THREE.Color(0x8ec5e6);
    scene.fog = new THREE.Fog(0x8ec5e6, 40, 95);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / Math.max(1, window.innerHeight), 0.08, 1400);
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    clock = new THREE.Clock();
    dummy = new THREE.Object3D();

    buildAtlas();
    UI.buildInventory(MC.CREATIVE_BLOCKS, pickFromInventory);
    bindEvents();
    updateMenuButtons();

    state = 'menu';
    UI.showPanel('menu');
    UI.setWorldUI(false);
    requestAnimationFrame(loop);
  }

  function buildAtlas() {
    atlasInfo = MC.buildAtlas();
    atlasTex = new THREE.CanvasTexture(atlasInfo.canvas);
    atlasTex.magFilter = THREE.NearestFilter;
    atlasTex.minFilter = THREE.NearestMipmapLinearFilter;
    atlasTex.generateMipmaps = true;
    atlasTex.wrapS = THREE.ClampToEdgeWrapping;
    atlasTex.wrapT = THREE.ClampToEdgeWrapping;
    // 텍스처도 변환 없이 그대로 사용 (위 선형 파이프라인과 일관)
    if ('colorSpace' in atlasTex) {
      atlasTex.colorSpace = THREE.NoColorSpace !== undefined ? THREE.NoColorSpace : THREE.LinearSRGBColorSpace;
    } else if (THREE.LinearEncoding !== undefined) {
      atlasTex.encoding = THREE.LinearEncoding;
    }
    atlasTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    atlasTex.needsUpdate = true;
    UI.setAtlas(atlasInfo);
  }

  /* ===================================================================
   *  월드 생성 / 정리
   * =================================================================== */
  function createWorld(seed, saveData) {
    disposeWorld();

    world = new MC.World(seed, atlasInfo, atlasTex);
    world.renderDistance = RENDER_DISTANCE;
    scene.add(world.group);

    if (saveData && saveData.edits && saveData.edits.length) {
      world.applyEdits(saveData.edits);
    }

    player = new MC.Player(world);
    const sp = (saveData && saveData.player)
      ? new THREE.Vector3(saveData.player.x, saveData.player.y, saveData.player.z)
      : world.findSpawn();
    spawnPoint = sp.clone();
    player.setPosition(sp);
    if (saveData && saveData.player) {
      player.yaw = saveData.player.yaw || 0;
      player.pitch = saveData.player.pitch || 0;
      player.flying = !!saveData.player.flying;
    }
    if (saveData && typeof saveData.time === 'number') timeOfDay = saveData.time;

    buildSky();
    buildHighlight();
    buildHeld();
    buildParticles();

    scene.fog.near = RENDER_DISTANCE * 16 * 0.45;
    scene.fog.far = RENDER_DISTANCE * 16 * 0.98;

    // 스트리밍 큐 초기화
    world.update(sp.x, sp.z, 0);
    loadTotal = Math.max(1, world.queue.length);

    UI.setWorldUI(true);
    UI.setWaterTint(false);
    UI.buildHotbar(hotbar, selected);
    UI.selectSlot(selected, hotbar, false);
    UI.showPanel('loading');
    UI.setLoading(0, '지형을 만드는 중…');
    state = 'loading';
    wasInWater = false;
    stepAccum = 0;
    autosaveT = 0;
    curFov = 70;
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }

  function disposeWorld() {
    if (heldMesh && camera) camera.remove(heldMesh);
    if (world) {
      world.chunks.forEach(function (c) {
        if (c.meshes) for (let i = 0; i < c.meshes.length; i++) c.meshes[i].geometry.dispose();
      });
      for (let i = 0; i < world.allMaterials.length; i++) world.allMaterials[i].dispose();
      scene.remove(world.group);
      world = null;
    }
    const objs = [highlight, heldMesh, sunMesh, moonMesh, stars, particles];
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      if (!o) continue;
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
    highlight = heldMesh = heldMat = sunMesh = moonMesh = stars = particles = null;
    heldId = -1;
    parts.length = 0;
    player = null;
    currentTarget = null;
    breakHeld = placeHeld = false;
  }

  /* ---------------- 하늘 ---------------- */
  function buildSky() {
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6c4, fog: false, depthWrite: false });
    sunMesh = new THREE.Mesh(new THREE.CircleGeometry(26, 26), sunMat);
    sunMesh.renderOrder = -1;
    scene.add(sunMesh);

    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe8f5, fog: false, depthWrite: false });
    moonMesh = new THREE.Mesh(new THREE.CircleGeometry(16, 22), moonMat);
    moonMesh.renderOrder = -1;
    scene.add(moonMesh);

    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(th) * r * 520;
      pos[i * 3 + 1] = u * 520;
      pos[i * 3 + 2] = Math.sin(th) * r * 520;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 2.4, sizeAttenuation: false,
      transparent: true, opacity: 0.9, fog: false, depthWrite: false,
    });
    stars = new THREE.Points(geo, mat);
    stars.renderOrder = -2;
    scene.add(stars);
  }

  function updateSky(dt) {
    if (!world) return;
    if (state === 'playing' && timeFlowing) {
      timeOfDay = (timeOfDay + dt / DAY_SECONDS) % 1;
    }
    const ang = (timeOfDay - 0.25) * Math.PI * 2;
    const dir = tmpV3.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const elev = dir.y;

    let b = Math.max(0, Math.min(1, (elev + 0.18) / 0.45));
    b = b * b * (3 - 2 * b);

    let r = 0.035 + (0.56 - 0.035) * b;
    let g = 0.05 + (0.77 - 0.05) * b;
    let bl = 0.12 + (0.95 - 0.12) * b;

    const sunset = Math.max(0, 1 - Math.abs(elev) / 0.24) * (elev > -0.14 ? 1 : 0);
    r += (1.0 - r) * sunset * 0.55;
    g += (0.46 - g) * sunset * 0.34;
    bl += (0.24 - bl) * sunset * 0.22;

    skyColor.setRGB(r, g, bl);
    scene.background = skyColor;
    scene.fog.color.copy(skyColor);

    const dark = 0.28 + 0.72 * b;
    tmpColor.setRGB(dark, dark, dark);
    world.matOpaque.color.copy(tmpColor);
    world.matCutout.color.copy(tmpColor);
    world.matTrans.color.copy(tmpColor);
    if (heldMat) heldMat.color.copy(tmpColor);
    if (particles) particles.material.color.setRGB(1, 1, 1);

    const cam = camera.position;
    sunMesh.position.set(cam.x + dir.x * 460, cam.y + dir.y * 460, cam.z + dir.z * 460);
    sunMesh.lookAt(cam);
    sunMesh.visible = elev > -0.2;
    sunMesh.material.opacity = 1;

    moonMesh.position.set(cam.x - dir.x * 460, cam.y - dir.y * 460, cam.z - dir.z * 460);
    moonMesh.lookAt(cam);
    moonMesh.visible = -elev > -0.2;

    stars.position.copy(cam);
    stars.material.opacity = Math.max(0, Math.min(1, 1 - b * 1.7)) * 0.9;
  }

  /* ---------------- 하이라이트 ---------------- */
  function buildHighlight() {
    const geo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const edges = new THREE.EdgesGeometry(geo);
    geo.dispose();
    highlight = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0x101010, transparent: true, opacity: 0.65, fog: false,
    }));
    highlight.visible = false;
    highlight.renderOrder = 5;
    scene.add(highlight);
  }

  /* ---------------- 손에 든 블록 ---------------- */
  function buildHeld() {
    heldMat = new THREE.MeshBasicMaterial({
      map: atlasTex, vertexColors: true, fog: false, alphaTest: 0.5,
    });
    rebuildHeld();
  }

  function rebuildHeld() {
    if (!heldMat) return;
    const id = hotbar[selected];
    heldId = id;
    if (heldMesh) { camera.remove(heldMesh); heldMesh.geometry.dispose(); }
    const geo = MC.buildBlockGeometry(atlasInfo, id, 0.36);
    heldMesh = new THREE.Mesh(geo, heldMat);
    heldMesh.renderOrder = 4;
    heldMesh.position.set(0.44, -0.38, -0.62);
    heldMesh.rotation.set(-0.1, -0.55, 0.06);
    camera.add(heldMesh);
  }

  function updateHeld(dt) {
    if (!heldMesh) return;
    if (hotbar[selected] !== heldId) rebuildHeld();
    if (swing > 0) { swing += dt * 4.2; if (swing >= 1) swing = 0; }
    const s = swing > 0 ? Math.sin(swing * Math.PI) : 0;
    const bobA = Math.sin(player.bobPhase * 2) * 0.012;
    heldMesh.position.set(0.44 - s * 0.10, -0.38 + player.bob * 0.7 + bobA - s * 0.12, -0.62 + s * 0.10);
    heldMesh.rotation.set(-0.1 - s * 0.85, -0.55 + s * 0.35, 0.06 - s * 0.2);
  }

  /* ---------------- 파티클 ---------------- */
  function buildParticles() {
    const geo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: false, fog: true });
    particles = new THREE.InstancedMesh(geo, mat, MAX_PARTS);
    particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    particles.count = 0;
    particles.frustumCulled = false;
    scene.add(particles);
  }

  function spawnParticles(x, y, z, blockId, count) {
    if (!particles) return;
    const def = MC.BLOCKS[blockId];
    if (!def) return;
    const avg = atlasInfo.averages[def.tiles[0]] || [0.6, 0.6, 0.6];
    const n = count || 10;
    for (let i = 0; i < n && parts.length < MAX_PARTS; i++) {
      parts.push({
        p: new THREE.Vector3(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8),
        v: new THREE.Vector3((Math.random() - 0.5) * 2.6, Math.random() * 3.4 + 0.6, (Math.random() - 0.5) * 2.6),
        life: 0.55 + Math.random() * 0.55,
        t: 0,
        s: 0.6 + Math.random() * 0.8,
        c: avg,
      });
    }
  }

  function updateParticles(dt) {
    if (!particles) return;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.v.y -= 18 * dt;
      const nx = p.p.x + p.v.x * dt;
      const ny = p.p.y + p.v.y * dt;
      const nz = p.p.z + p.v.z * dt;
      if (world && MC.isSolid(world.getBlock(Math.floor(nx), Math.floor(p.p.y), Math.floor(p.p.z)))) { p.v.x = 0; } else p.p.x = nx;
      if (world && MC.isSolid(world.getBlock(Math.floor(p.p.x), Math.floor(p.p.y), Math.floor(nz)))) { p.v.z = 0; } else p.p.z = nz;
      if (world && MC.isSolid(world.getBlock(Math.floor(p.p.x), Math.floor(ny), Math.floor(p.p.z)))) {
        p.v.y = 0;
        p.v.x *= 0.6; p.v.z *= 0.6;
      } else p.p.y = ny;

      parts[w] = p;
      const k = 1 - (p.t / p.life);
      const scale = p.s * (0.35 + 0.65 * k);
      dummy.position.copy(p.p);
      dummy.rotation.set(p.t * 4, p.t * 3, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      particles.setMatrixAt(w, dummy.matrix);
      particles.setColorAt(w, tmpColor.setRGB(p.c[0], p.c[1], p.c[2]));
      w++;
    }
    parts.length = w;
    particles.count = w;
    particles.instanceMatrix.needsUpdate = true;
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
  }

  /* ===================================================================
   *  입력
   * =================================================================== */
  function bindEvents() {
    window.addEventListener('resize', onResize);
    document.addEventListener('contextmenu', function (e) { if (state !== 'menu') e.preventDefault(); });
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('pointerlockerror', function () {
      UI.toast('화면 고정에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    });
    window.addEventListener('beforeunload', function () { if (world && state !== 'menu') saveGame(); });

    document.getElementById('btn-new').addEventListener('click', function () { startFromMenu(false); });
    document.getElementById('btn-continue').addEventListener('click', function () { startFromMenu(true); });
    document.getElementById('btn-resume').addEventListener('click', resumeGame);
    document.getElementById('btn-save').addEventListener('click', function () {
      if (saveGame()) UI.toast('저장했습니다');
      else UI.toast('저장에 실패했습니다');
    });
    document.getElementById('btn-quit').addEventListener('click', quitToMenu);
    document.getElementById('btn-error-back').addEventListener('click', function () {
      state = 'menu';
      UI.showPanel('menu');
      UI.setWorldUI(false);
    });

    // 모바일 안내
    if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      UI.toast('키보드와 마우스가 필요합니다', 4000);
    }
  }

  function onResize() {
    if (!renderer) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }

  function requestLock() {
    try {
      const p = renderer.domElement.requestPointerLock();
      if (p && p.catch) p.catch(function () { });
    } catch (e) { /* 무시 */ }
  }

  function onLockChange() {
    const locked = document.pointerLockElement === renderer.domElement;
    if (!locked) {
      clearKeys();
      breakHeld = placeHeld = false;
      if (state === 'playing') {
        state = 'paused';
        UI.showPanel('pause');
        saveGame();
      }
    } else if (state === 'paused') {
      state = 'playing';
      UI.showPanel(null);
    }
  }

  function onMouseMove(e) {
    if (document.pointerLockElement !== renderer.domElement) return;
    if (state !== 'playing') return;
    const sens = 0.0022;
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    const lim = Math.PI / 2 - 0.001;
    if (player.pitch > lim) player.pitch = lim;
    if (player.pitch < -lim) player.pitch = -lim;
  }

  function onMouseDown(e) {
    if (state !== 'playing') return;
    if (document.pointerLockElement !== renderer.domElement) return;
    if (e.button === 0) {
      breakHeld = true;
      breakCd = 0;
      doBreak();
      swing = 0.0001;
    } else if (e.button === 2) {
      placeHeld = true;
      placeCd = 0;
      doPlace();
      swing = 0.0001;
    } else if (e.button === 1) {
      e.preventDefault();
      pickBlock();
    }
  }

  function onMouseUp(e) {
    if (e.button === 0) breakHeld = false;
    if (e.button === 2) placeHeld = false;
  }

  function onWheel(e) {
    if (state !== 'playing') return;
    e.preventDefault();
    selected = (selected + (e.deltaY > 0 ? 1 : hotbar.length - 1)) % hotbar.length;
    UI.selectSlot(selected, hotbar, true);
    rebuildHeld();
  }

  function clearKeys() {
    if (!player) return;
    const k = player.keys;
    k.forward = k.back = k.left = k.right = k.jump = k.sneak = k.sprint = false;
  }

  function onKeyUp(e) {
    if (!player) return;
    const k = player.keys;
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': k.forward = false; break;
      case 'KeyS': case 'ArrowDown': k.back = false; break;
      case 'KeyA': case 'ArrowLeft': k.left = false; break;
      case 'KeyD': case 'ArrowRight': k.right = false; break;
      case 'Space': k.jump = false; break;
      case 'ShiftLeft': case 'ShiftRight': k.sneak = false; break;
      case 'ControlLeft': case 'ControlRight': k.sprint = false; break;
    }
  }

  function onKeyDown(e) {
    const c = e.code;

    if (state === 'inventory') {
      if (c === 'KeyE' || c === 'Escape') { e.preventDefault(); closeInventory(); }
      return;
    }
    if (state !== 'playing') {
      if (c === 'Enter' && state === 'paused') resumeGame();
      return;
    }

    const k = player.keys;
    switch (c) {
      case 'KeyW': case 'ArrowUp': k.forward = true; break;
      case 'KeyS': case 'ArrowDown': k.back = true; break;
      case 'KeyA': case 'ArrowLeft': k.left = true; break;
      case 'KeyD': case 'ArrowRight': k.right = true; break;
      case 'Space':
        e.preventDefault();
        if (!k.jump) {
          const now = performance.now();
          if (now - lastSpace < 280) {
            player.flying = !player.flying;
            player.vel.y = 0;
            UI.toast(player.flying ? '비행 모드 켜짐' : '비행 모드 꺼짐');
          }
          lastSpace = now;
        }
        k.jump = true;
        break;
      case 'ShiftLeft': case 'ShiftRight': k.sneak = true; break;
      case 'ControlLeft': case 'ControlRight': k.sprint = true; break;
      case 'KeyF':
        player.flying = !player.flying;
        player.vel.y = 0;
        UI.toast(player.flying ? '비행 모드 켜짐' : '비행 모드 꺼짐');
        break;
      case 'KeyT':
        timeFlowing = !timeFlowing;
        UI.toast(timeFlowing ? '시간이 흐릅니다' : '시간이 멈췄습니다');
        break;
      case 'KeyR':
        player.setPosition(spawnPoint.clone());
        player.vel.set(0, 0, 0);
        UI.toast('스폰 지점으로 이동');
        break;
      case 'KeyP':
        UI.toast(saveGame() ? '저장했습니다' : '저장에 실패했습니다');
        break;
      case 'KeyE':
        openInventory();
        break;
      case 'F3': case 'Backquote':
        e.preventDefault();
        showDebug = !showDebug;
        UI.setDebug(showDebug, '');
        break;
      case 'KeyM': {
        const m = Sound.toggleMute();
        UI.toast(m ? '소리 꺼짐' : '소리 켜짐');
        break;
      }
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': {
        const n = parseInt(c.slice(5), 10) - 1;
        if (n < hotbar.length) {
          selected = n;
          UI.selectSlot(selected, hotbar, true);
          rebuildHeld();
        }
        break;
      }
    }
  }

  /* ===================================================================
   *  인벤토리
   * =================================================================== */
  function openInventory() {
    state = 'inventory';
    breakHeld = placeHeld = false;
    UI.buildInvHotbar(hotbar, selected, pickInvSlot);
    UI.showInventory(true, selected);
    clearKeys();
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function closeInventory() {
    UI.showInventory(false);
    state = 'playing';
    requestLock();
  }

  function pickInvSlot(i) {
    selected = i;
    UI.setInvHotbarSelected(i);
    UI.selectSlot(i, hotbar, true);
    Sound.click();
  }

  function pickFromInventory(id) {
    hotbar[selected] = id;
    UI.refreshSlot(selected, id);
    UI.refreshInvHotbarSlot(selected, id);
    UI.selectSlot(selected, hotbar, true);
    rebuildHeld();
    Sound.click();
  }

  /* ===================================================================
   *  상호작용
   * =================================================================== */
  function updateTarget() {
    const origin = player.eyePosition(tmpV1);
    const dir = player.lookDirection(tmpV2);
    const hit = MC.raycastVoxel(world, origin, dir, REACH);
    currentTarget = hit;
    if (hit) {
      highlight.visible = true;
      highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else if (highlight) {
      highlight.visible = false;
    }
  }

  function doBreak() {
    const t = currentTarget;
    if (!t) return;
    const b = world.getBlock(t.x, t.y, t.z);
    if (b === 0) return;
    if (b === ID.BEDROCK) { spawnParticles(t.x + 0.5, t.y + 0.5, t.z + 0.5, b, 4); return; }
    if (world.setBlock(t.x, t.y, t.z, 0)) {
      Sound.breakBlock(b);
      spawnParticles(t.x + 0.5, t.y + 0.5, t.z + 0.5, b, 11);
    }
  }

  function blockHitsPlayer(x, y, z) {
    const hw = player.width / 2;
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    return (x < px + hw && x + 1 > px - hw &&
            y < py + player.height && y + 1 > py &&
            z < pz + hw && z + 1 > pz - hw);
  }

  function doPlace() {
    const t = currentTarget;
    if (!t) return;
    const x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    if (y < 0 || y >= MC.WORLD_HEIGHT) return;
    const cur = world.getBlock(x, y, z);
    if (cur !== 0 && !MC.BLOCKS[cur].liquid) return;
    const id = hotbar[selected];
    if (!id) return;
    if (blockHitsPlayer(x, y, z)) return;
    if (world.setBlock(x, y, z, id)) Sound.placeBlock(id);
  }

  function pickBlock() {
    const t = currentTarget;
    if (!t) return;
    hotbar[selected] = t.block;
    UI.refreshSlot(selected, t.block);
    UI.selectSlot(selected, hotbar, true);
    rebuildHeld();
    Sound.pick();
  }

  function handleInteractions(dt) {
    breakCd -= dt; placeCd -= dt;
    if (breakHeld && breakCd <= 0) { doBreak(); breakCd = 0.22; swing = 0.0001; }
    if (placeHeld && placeCd <= 0) { doPlace(); placeCd = 0.2; swing = 0.0001; }
  }

  /* ===================================================================
   *  프레임
   * =================================================================== */
  function updateCamera(dt) {
    player.eyePosition(camera.position);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    camera.rotation.z = 0;
    const target = player.sprinting ? 76 : 70;
    curFov += (target - curFov) * Math.min(1, dt * 8);
    if (Math.abs(camera.fov - curFov) > 0.01) {
      camera.fov = curFov;
      camera.updateProjectionMatrix();
    }
  }

  function stepPlaying(dt) {
    player.update(dt);

    if (player.inWater && !wasInWater) {
      Sound.splash();
      spawnParticles(player.pos.x, player.pos.y + 0.4, player.pos.z, ID.WATER, 10);
    }
    wasInWater = player.inWater;

    // 발소리
    if (player.onGround && !player.flying) {
      const hs = Math.hypot(player.vel.x, player.vel.z);
      stepAccum += hs * dt;
      if (stepAccum > 2.0) {
        stepAccum = 0;
        Sound.step(world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.2), Math.floor(player.pos.z)));
      }
    }

    updateCamera(dt);
    world.update(player.pos.x, player.pos.z, 5);
    updateTarget();
    handleInteractions(dt);
    updateHeld(dt);
    UI.setWaterTint(player.headInWater);

    // HUD
    const p = player.pos;
    UI.updateHUD({
      dt: dt,
      fps: Math.round(fps),
      pos: p.x.toFixed(1) + ' / ' + p.y.toFixed(1) + ' / ' + p.z.toFixed(1),
      chunk: Math.floor(p.x / 16) + ', ' + Math.floor(p.z / 16),
      biome: world.biomeAt(Math.floor(p.x), Math.floor(p.z)),
      mode: player.flying ? '비행' : (player.headInWater ? '잠수' : (player.inWater ? '수영' : (player.sprinting ? '달리기' : '걷기'))),
      time: fmtTime(timeOfDay),
      blocks: world.stats.loaded + '청크 · ' + (world.stats.tris / 1000).toFixed(1) + 'k 삼각',
    });

    if (showDebug) {
      UI.setDebug(true,
        'seed ' + world.seed +
        '  |  큐 ' + world.stats.queued +
        '  |  수정 ' + world.editCount +
        '  |  입자 ' + parts.length +
        '  |  목표 ' + (currentTarget ? currentTarget.block + ' @' + currentTarget.x + ',' + currentTarget.y + ',' + currentTarget.z : '없음') +
        '  |  시각 ' + timeOfDay.toFixed(3));
    }

    autosaveT += dt;
    if (autosaveT > 20) { autosaveT = 0; saveGame(); }
  }

  function fmtTime(t) {
    const total = t * 1440;
    const hh = Math.floor(total / 60) % 24;
    const mm = Math.floor(total % 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function loadStep() {
    const t0 = performance.now();
    while (world.queue.length && performance.now() - t0 < 14) {
      world.buildNext();
    }
    const remain = world.queue.length;
    const done = Math.min(loadTotal, loadTotal - remain);
    UI.setLoading(loadTotal ? done / loadTotal : 1,
      '지형을 만드는 중… ' + done + ' / ' + loadTotal + ' 청크');
    if (remain === 0) finishLoading();
  }

  function finishLoading() {
    state = 'playing';
    UI.showPanel(null);
    UI.setWorldUI(true);
    Sound.resume();
    UI.toast('좌클릭 부수기 · 우클릭 설치 · E 블록 목록', 2600);
    if (document.pointerLockElement !== renderer.domElement) {
      state = 'paused';
      UI.showPanel('pause');
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!renderer) return;
    const dt = Math.min(clock.getDelta(), 0.1);

    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.5) { fps = fpsFrames / fpsAcc; fpsAcc = 0; fpsFrames = 0; }

    if (!scene) { return; }

    if (state === 'loading' && world) {
      loadStep();
    } else if (world) {
      if (state === 'playing') stepPlaying(dt);
      updateSky(dt);
      updateParticles(dt);
    }
    renderer.render(scene, camera);
  }

  /* ===================================================================
   *  메뉴 / 저장
   * =================================================================== */
  function updateMenuButtons() {
    const meta = readMeta();
    const btn = document.getElementById('btn-continue');
    if (meta) {
      btn.disabled = false;
      btn.textContent = '이어하기 (' + new Date(meta.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ')';
    } else {
      btn.disabled = true;
      btn.textContent = '이어하기 (저장 없음)';
    }
  }

  function readMeta() {
    try {
      const s = localStorage.getItem(SAVE_KEY + '.meta');
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function readSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function saveGame() {
    if (!world || !player) return false;
    try {
      const data = {
        v: 2,
        seed: world.seed,
        time: timeOfDay,
        player: {
          x: player.pos.x, y: player.pos.y, z: player.pos.z,
          yaw: player.yaw, pitch: player.pitch, flying: player.flying,
        },
        edits: world.serializeEdits(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      localStorage.setItem(SAVE_KEY + '.meta', JSON.stringify({ at: Date.now(), seed: world.seed }));
      updateMenuButtons();
      return true;
    } catch (e) {
      return false;
    }
  }

  function startFromMenu(useSave) {
    Sound.resume();
    let save = null;
    if (useSave) save = readSave();

    let seed;
    if (save && typeof save.seed === 'number') {
      seed = save.seed;
    } else {
      const inp = document.getElementById('seed-input');
      const txt = inp ? inp.value.trim() : '';
      seed = txt ? MC.seedFromString(txt) : ((Math.random() * 0x7fffffff) | 0);
    }

    requestLock();
    try {
      createWorld(seed, save);
    } catch (err) {
      showError(String(err && err.message ? err.message : err));
      throw err;
    }
  }

  function resumeGame() {
    Sound.resume();
    requestLock();
  }

  function quitToMenu() {
    saveGame();
    clearKeys();
    if (document.exitPointerLock) document.exitPointerLock();
    disposeWorld();
    state = 'menu';
    UI.setWorldUI(false);
    UI.setWaterTint(false);
    UI.showPanel('menu');
    updateMenuButtons();
  }

  function showError(msg) {
    const el = document.getElementById('error-msg');
    if (el) el.textContent = msg;
    UI.showPanel('error');
  }

  /* ---- 시작 ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
