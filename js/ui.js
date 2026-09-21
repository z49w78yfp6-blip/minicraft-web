/* =====================================================================
 *  ui.js — HUD · 단축바 · 블록 목록 · 메뉴/패널
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  let atlas = null;
  const el = {};
  let toastTimer = null;
  const lastHud = {};

  function $(id) { return document.getElementById(id); }

  /* --------- 아이소메트릭 블록 아이콘 --------- */
  function makeIcon(blockId, size) {
    const def = MC.BLOCKS[blockId];
    if (!def) return null;
    const W = 64, H = 64, T = 16;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    const topTile = MC.tileThumb(atlas, def.tiles[2], T);
    const sideTile = MC.tileThumb(atlas, def.tiles[0], T);

    const drawFace = function (m, img, tint) {
      ctx.save();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(img, 0, 0, T, T);
      if (tint) { ctx.fillStyle = tint; ctx.fillRect(0, 0, T, T); }
      ctx.restore();
    };

    // 왼쪽 / 오른쪽 / 윗면
    drawFace([2, 1, 0, 2, 0, 16], sideTile, 'rgba(0,0,0,0.26)');
    drawFace([2, -1, 0, 2, 32, 32], sideTile, 'rgba(0,0,0,0.06)');
    drawFace([2, 1, -2, 1, 32, 0], topTile, null);

    if (size && size !== W) {
      const c2 = document.createElement('canvas');
      c2.width = c2.height = size;
      const g = c2.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(c, 0, 0, size, size);
      return c2;
    }
    return c;
  }

  /* --------- 초기화 --------- */
  function init() {
    el.overlay = $('overlay');
    el.worldUI = $('world-ui');
    el.crosshair = $('crosshair');
    el.hudFps = $('hud-fps');
    el.hudPos = $('hud-pos');
    el.hudChunk = $('hud-chunk');
    el.hudBiome = $('hud-biome');
    el.hudMode = $('hud-mode');
    el.hudTime = $('hud-time');
    el.hudBlocks = $('hud-blocks');
    el.hotbar = $('hotbar');
    el.itemName = $('item-name');
    el.inventory = $('inventory');
    el.invGrid = $('inv-grid');
    el.invSlot = $('inv-slot');
    el.invHotbar = $('inv-hotbar');
    el.toast = $('toast');
    el.waterTint = $('water-tint');
    el.debugNote = $('debug-note');
    el.loadBar = $('load-bar');
    el.loadStatus = $('load-status');
    el.panels = {
      menu: $('panel-menu'),
      loading: $('panel-loading'),
      pause: $('panel-pause'),
      error: $('panel-error'),
    };
  }

  function setAtlas(a) { atlas = a; }

  /* --------- 단축바 --------- */
  let slotEls = [];
  let invSlotEls = [];

  function makeSlotEl(id, numText) {
    const d = document.createElement('div');
    d.className = 'slot';
    const icon = makeIcon(id, 36);
    if (icon) d.appendChild(icon);
    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = numText;
    d.appendChild(n);
    return d;
  }

  function buildHotbar(ids, selected) {
    el.hotbar.innerHTML = '';
    slotEls = [];
    for (let i = 0; i < ids.length; i++) {
      const d = makeSlotEl(ids[i], String(i + 1));
      el.hotbar.appendChild(d);
      slotEls.push(d);
    }
    selectSlot(selected);
  }

  function selectSlot(i, ids, showName) {
    for (let k = 0; k < slotEls.length; k++) slotEls[k].classList.toggle('active', k === i);
    if (ids) {
      const def = MC.BLOCKS[ids[i]];
      if (def) {
        el.itemName.textContent = def.name;
        el.itemName.classList.remove('fade');
        el.itemName.style.opacity = '1';
        clearTimeout(el.itemName._t);
        el.itemName._t = setTimeout(function () { el.itemName.style.opacity = '0'; }, showName ? 1500 : 900);
      }
    }
  }

  /** 슬롯 하나만 갱신 (가방에서 고를 때) */
  function refreshSlot(i, id) {
    const s = slotEls[i];
    if (!s) return;
    s.innerHTML = '';
    const icon = makeIcon(id, 36);
    if (icon) s.appendChild(icon);
    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = String(i + 1);
    s.appendChild(n);
  }

  /* --------- 가방 안의 단축바 --------- */
  function buildInvHotbar(ids, selected, onSelect) {
    el.invHotbar.innerHTML = '';
    invSlotEls = [];
    for (let i = 0; i < ids.length; i++) {
      const d = makeSlotEl(ids[i], String(i + 1));
      (function (idx) {
        d.addEventListener('click', function () { onSelect(idx); });
      })(i);
      el.invHotbar.appendChild(d);
      invSlotEls.push(d);
    }
    setInvHotbarSelected(selected);
  }

  function setInvHotbarSelected(i) {
    for (let k = 0; k < invSlotEls.length; k++) invSlotEls[k].classList.toggle('active', k === i);
    if (el.invSlot) el.invSlot.textContent = String(i + 1);
  }

  function refreshInvHotbarSlot(i, id) {
    const s = invSlotEls[i];
    if (!s) return;
    s.innerHTML = '';
    const icon = makeIcon(id, 36);
    if (icon) s.appendChild(icon);
    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = String(i + 1);
    s.appendChild(n);
  }

  /* --------- 블록 목록 --------- */
  function buildInventory(ids, onPick) {
    el.invGrid.innerHTML = '';
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      const icon = makeIcon(id, 40);
      if (icon) cell.appendChild(icon);
      const label = document.createElement('span');
      label.textContent = MC.BLOCKS[id].name;
      cell.appendChild(label);
      cell.addEventListener('click', function () { onPick(id); });
      el.invGrid.appendChild(cell);
    }
  }

  function showInventory(on, slotIndex) {
    el.inventory.classList.toggle('hidden', !on);
    if (on && slotIndex !== undefined) el.invSlot.textContent = String(slotIndex + 1);
  }

  /* --------- 패널 --------- */
  function showPanel(name) {
    el.overlay.classList.toggle('hidden', !name);
    Object.keys(el.panels).forEach(function (k) {
      el.panels[k].classList.toggle('hidden', k !== name);
    });
  }

  function setLoading(p, text) {
    el.loadBar.style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    if (text) el.loadStatus.textContent = text;
  }

  function setWorldUI(on) {
    el.worldUI.classList.toggle('hidden', !on);
  }

  function setWaterTint(on) {
    el.waterTint.classList.toggle('hidden', !on);
  }

  function toast(msg, ms) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove('show'); }, ms || 1500);
  }

  /* --------- HUD --------- */
  let hudAcc = 0;
  function updateHUD(info, force) {
    hudAcc += info.dt || 0;
    if (!force && hudAcc < 0.12) return;
    hudAcc = 0;
    if (lastHud.fps !== info.fps) { el.hudFps.textContent = String(info.fps); lastHud.fps = info.fps; }
    if (lastHud.pos !== info.pos) { el.hudPos.textContent = info.pos; lastHud.pos = info.pos; }
    if (lastHud.chunk !== info.chunk) { el.hudChunk.textContent = info.chunk; lastHud.chunk = info.chunk; }
    if (lastHud.biome !== info.biome) { el.hudBiome.textContent = info.biome; lastHud.biome = info.biome; }
    if (lastHud.mode !== info.mode) { el.hudMode.textContent = info.mode; lastHud.mode = info.mode; }
    if (lastHud.time !== info.time) { el.hudTime.textContent = info.time; lastHud.time = info.time; }
    if (lastHud.blocks !== info.blocks) { el.hudBlocks.textContent = info.blocks; lastHud.blocks = info.blocks; }
  }

  function setDebug(on, text) {
    el.debugNote.classList.toggle('hidden', !on);
    if (text !== undefined) el.debugNote.textContent = text;
  }

  MC.UI = {
    init: init,
    setAtlas: setAtlas,
    makeIcon: makeIcon,
    buildHotbar: buildHotbar,
    selectSlot: selectSlot,
    refreshSlot: refreshSlot,
    buildInvHotbar: buildInvHotbar,
    setInvHotbarSelected: setInvHotbarSelected,
    refreshInvHotbarSlot: refreshInvHotbarSlot,
    buildInventory: buildInventory,
    showInventory: showInventory,
    showPanel: showPanel,
    setLoading: setLoading,
    setWorldUI: setWorldUI,
    setWaterTint: setWaterTint,
    toast: toast,
    updateHUD: updateHUD,
    setDebug: setDebug,
  };
})();
