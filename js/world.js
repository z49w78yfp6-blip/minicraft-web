/* =====================================================================
 *  world.js — 청크 기반 복셀 월드 (지형 생성 + 메시 빌드 + 광원/AO)
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});
  const ID = MC.ID;
  const BLOCKS = MC.BLOCKS;
  const FACES = MC.FACES;
  const FACE_UV = MC.FACE_UV;
  const AIR = 0;

  const CS = 16;         // 청크 한 변
  const CH = 72;         // 월드 높이
  const SEA = 31;        // 해수면
  const SNOW_LINE = 56;  // 이 높이 이상은 눈
  const AO_LEVELS = [0.48, 0.68, 0.85, 1.0];

  function idxOf(x, y, z) { return (x * CS + z) * CH + y; }

  /** 정수 청크 키 (문자열 할당 없이 빠른 Map 조회) */
  function keyOf(cx, cz) { return (cx + 32768) * 65536 + (cz + 32768); }

  function Chunk(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = null;
    this.heightMap = null;
    this.meshes = null;
    this.dirty = true;
    this.built = false;
  }

  /* =================================================================== */
  class World {
    constructor(seed, atlas, texture) {
      this.seed = seed | 0;
      this.atlas = atlas;
      this.texture = texture;
      this.noise = new MC.Noise(this.seed);
      this.noise2 = new MC.Noise(this.seed + 1013);
      this.noise3 = new MC.Noise(this.seed + 7717);

      this.chunks = new Map();     // key -> Chunk
      this.edits = new Map();      // key -> Map(localIdx -> id)
      this.group = new THREE.Group();
      this.group.name = 'world';

      this.renderDistance = 6;
      this.lastCX = Infinity;
      this.lastCZ = Infinity;
      this.wanted = null;
      this.queue = [];
      this.editCount = 0;
      this.stats = { loaded: 0, tris: 0, queued: 0 };

      this._buildMaterials();
    }

    _buildMaterials() {
      const common = { map: this.texture, vertexColors: true, fog: true };
      this.matOpaque = new THREE.MeshBasicMaterial(Object.assign({}, common, {
        alphaTest: 0.5, side: THREE.FrontSide,
      }));
      this.matCutout = new THREE.MeshBasicMaterial(Object.assign({}, common, {
        alphaTest: 0.5, side: THREE.DoubleSide,
      }));
      this.matTrans = new THREE.MeshBasicMaterial(Object.assign({}, common, {
        transparent: true, side: THREE.DoubleSide, depthWrite: true, alphaTest: 0.02,
      }));
      this.allMaterials = [this.matOpaque, this.matCutout, this.matTrans];
    }

    /* ---------------- 좌표 / 조회 ---------------- */
    getChunk(cx, cz) {
      const k = keyOf(cx, cz);
      let c = this.chunks.get(k);
      if (c) return c;
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
      this.generate(c);
      return c;
    }

    getBlock(x, y, z) {
      if (y < 0 || y >= CH) return AIR;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.getChunk(cx, cz);
      return c.data[idxOf(x - cx * CS, y, z - cz * CS)];
    }

    getSurfaceY(x, z) {
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const c = this.getChunk(cx, cz);
      return c.heightMap[(x - cx * CS) * CS + (z - cz * CS)];
    }

    isSolid(x, y, z) { return MC.isSolid(this.getBlock(x, y, z)); }
    isLiquid(x, y, z) { return MC.isLiquid(this.getBlock(x, y, z)); }
    isOpaque(x, y, z) { return MC.isOpaque(this.getBlock(x, y, z)); }

    /* ---------------- 지형 (순수 함수) ---------------- */
    heightAt(wx, wz) {
      const n = this.noise;
      const cont = n.fbm2(wx * 0.0026, wz * 0.0026, 4);      // 대륙
      const hills = n.fbm2(wx * 0.0115, wz * 0.0115, 3);     // 구릉
      const detail = n.fbm2(wx * 0.048, wz * 0.048, 2);      // 잔굴곡
      let h = 35 + cont * 30 + hills * 9 + detail * 2.6;

      const mask = n.fbm2(wx * 0.0018 + 120, wz * 0.0018 - 60, 3);
      if (mask > 0.16) {
        const t = Math.min(1, (mask - 0.16) / 0.34);
        const ridge = n.ridged2(wx * 0.009, wz * 0.009, 3);
        h += t * (4 + ridge * 26);
      }

      if (h < 1) h = 1;
      if (h > CH - 9) h = CH - 9;
      return Math.round(h);
    }

    tempAt(wx, wz) {
      return this.noise3.fbm2(wx * 0.0016 + 500, wz * 0.0016 + 500, 2);
    }

    /** 지표면 블록 종류 */
    surfaceBlock(wx, wz, h) {
      if (h <= SEA - 3) return ID.GRAVEL;      // 깊은 바다 바닥
      if (h <= SEA + 1) return ID.SAND;        // 해변 · 얕은 바닥
      const t = this.tempAt(wx, wz);
      if (h > SNOW_LINE || t < -0.30) return ID.SNOW;
      if (t > 0.28) return ID.SAND;            // 사막
      return ID.GRASS;
    }

    biomeAt(wx, wz) {
      const h = this.heightAt(wx, wz);
      if (h <= SEA - 3) return '깊은 바다';
      if (h <= SEA) return '바다';
      if (h <= SEA + 1) return '해변';
      const t = this.tempAt(wx, wz);
      if (h > SNOW_LINE) return '설산';
      if (t < -0.30) return '설원';
      if (t > 0.28) return '사막';
      if (h > 50) return '구릉';
      const f = this.noise2.fbm2(wx * 0.008 + 300, wz * 0.008 - 200, 2);
      return f > 0.10 ? '숲' : '평원';
    }

    caveAt(x, y, z) {
      if (y < 3) return false;
      return this.noise2.fbm3(x * 0.058, y * 0.1, z * 0.058, 2) > 0.35;
    }

    featureAt(wx, wz) {
      const h = this.heightAt(wx, wz);
      if (h <= SEA + 1) return null;
      const surf = this.surfaceBlock(wx, wz, h);
      const r = MC.hash(wx, 91, wz, this.seed);

      if (surf === ID.GRASS) {
        const forest = this.noise2.fbm2(wx * 0.008 + 300, wz * 0.008 - 200, 2);
        const density = forest > 0.10 ? 0.20 : 0.045;
        if (r > density) return null;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (MC.hash(wx + dx, 91, wz + dz, this.seed) < r) return null;
            if (Math.abs(this.heightAt(wx + dx, wz + dz) - h) > 1) return null;
          }
        }
        if (this.caveAt(wx, h, wz)) return null;
        return { type: 'tree', h: 4 + Math.floor(MC.hash(wx, 7, wz, this.seed + 9) * 3) };
      }

      if (surf === ID.SAND) {
        if (r > 0.05) return null;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (MC.hash(wx + dx, 91, wz + dz, this.seed) < r) return null;
          }
        }
        return { type: 'cactus', h: 2 + Math.floor(MC.hash(wx, 13, wz, this.seed + 5) * 2) };
      }
      return null;
    }

    /* ---------------- 청크 생성 ---------------- */
    generate(chunk) {
      const data = new Uint8Array(CS * CS * CH);
      const cx = chunk.cx, cz = chunk.cz;
      const bx = cx * CS, bz = cz * CS;

      for (let x = 0; x < CS; x++) {
        for (let z = 0; z < CS; z++) {
          const wx = bx + x, wz = bz + z;
          const h = this.heightAt(wx, wz);
          const surf = this.surfaceBlock(wx, wz, h);
          const sub = surf === ID.SAND ? ID.SAND : (surf === ID.GRAVEL ? ID.GRAVEL : ID.DIRT);
          const col = (x * CS + z) * CH;
          const underwater = h < SEA;

          for (let y = 0; y <= h; y++) {
            let b;
            if (y === 0) b = ID.BEDROCK;
            else if (y === h) b = surf;
            else if (y > h - 4) b = sub;
            else b = ID.STONE;

            if (b !== ID.BEDROCK && y > 1) {
              if (!(underwater && y > SEA - 5) && this.caveAt(wx, y, wz)) b = AIR;
            }
            data[col + y] = b;
          }

          for (let y = h + 1; y <= SEA; y++) data[col + y] = ID.WATER;
        }
      }

      const rnd = MC.mulberry32((Math.imul(cx, 0x1f123bb5) ^ Math.imul(cz, 0x27d4eb2f) ^ this.seed) >>> 0);
      this._veins(data, rnd, ID.COAL_ORE, 9, 6, 52, 9);
      this._veins(data, rnd, ID.IRON_ORE, 7, 5, 40, 7);
      this._veins(data, rnd, ID.GOLD_ORE, 3, 5, 24, 6);
      this._veins(data, rnd, ID.DIAMOND_ORE, 2, 3, 16, 5);
      this._veins(data, rnd, ID.GRAVEL, 3, 8, 40, 12);
      this._veins(data, rnd, ID.OBSIDIAN, 1, 3, 12, 6);

      chunk.data = data;

      for (let x = -3; x < CS + 3; x++) {
        for (let z = -3; z < CS + 3; z++) {
          const wx = bx + x, wz = bz + z;
          const f = this.featureAt(wx, wz);
          if (!f) continue;
          const h = this.heightAt(wx, wz);
          if (f.type === 'tree') this._placeTree(data, x, z, h, f.h);
          else this._placeCactus(data, x, z, h, f.h);
        }
      }

      const hm = new Uint8Array(CS * CS);
      for (let x = 0; x < CS; x++) {
        for (let z = 0; z < CS; z++) {
          const col = (x * CS + z) * CH;
          let top = 0;
          for (let y = CH - 1; y >= 0; y--) {
            const b = data[col + y];
            if (b !== AIR && BLOCKS[b].opaque) { top = y; break; }
          }
          hm[x * CS + z] = top;
        }
      }
      chunk.heightMap = hm;

      const e = this.edits.get(keyOf(cx, cz));
      if (e && e.size) e.forEach(function (v, i) { data[i] = v; });

      chunk.built = false;
      chunk.dirty = true;
    }

    _veins(data, rnd, type, count, minY, maxY, size) {
      const depth = maxY - minY;
      for (let i = 0; i < count; i++) {
        let x = (rnd() * CS) | 0;
        let z = (rnd() * CS) | 0;
        let y = (minY + rnd() * depth) | 0;
        const n = 3 + ((rnd() * size) | 0);
        for (let k = 0; k < n; k++) {
          if (x >= 0 && x < CS && z >= 0 && z < CS && y > 1 && y < CH - 1) {
            const i2 = (x * CS + z) * CH + y;
            if (data[i2] === ID.STONE) data[i2] = type;
          }
          const d = (rnd() * 6) | 0;
          if (d === 0) x++;
          else if (d === 1) x--;
          else if (d === 2) y++;
          else if (d === 3) y--;
          else if (d === 4) z++;
          else z--;
        }
      }
    }

    _setLocal(data, x, y, z, id, onlyAir) {
      if (x < 0 || x >= CS || z < 0 || z >= CS || y < 0 || y >= CH) return;
      const i = (x * CS + z) * CH + y;
      if (onlyAir && data[i] !== AIR && data[i] !== ID.LEAVES) return;
      data[i] = id;
    }

    _placeTree(data, x, z, h, trunkH) {
      const top = h + trunkH;
      for (let y = h + 1; y <= top; y++) this._setLocal(data, x, y, z, ID.LOG, true);
      for (let dy = -2; dy <= 1; dy++) {
        const y = top + dy;
        const r = dy <= -1 ? 2 : 1;
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
            this._setLocal(data, x + dx, y, z + dz, ID.LEAVES, true);
          }
        }
      }
      this._setLocal(data, x, top + 1, z, ID.LEAVES, true);
      this._setLocal(data, x, top + 2, z, ID.LEAVES, true);
    }

    _placeCactus(data, x, z, h, n) {
      for (let y = h + 1; y <= h + n; y++) this._setLocal(data, x, y, z, ID.CACTUS, true);
    }

    /* ---------------- 블록 수정 ---------------- */
    setBlock(x, y, z, id, fromLoad) {
      if (y < 0 || y >= CH) return false;
      const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
      const lx = x - cx * CS, lz = z - cz * CS;
      const chunk = this.getChunk(cx, cz);
      const i = idxOf(lx, y, lz);
      if (chunk.data[i] === id) return false;
      chunk.data[i] = id;

      const k = keyOf(cx, cz);
      let e = this.edits.get(k);
      if (!e) { e = new Map(); this.edits.set(k, e); }
      e.set(i, id);
      if (!fromLoad) this.editCount = this._countEdits();

      this._recalcColumn(chunk, lx, lz);
      chunk.dirty = true;

      for (let n = 0; n < 4; n++) {
        const dx = n === 0 ? -1 : (n === 1 ? 1 : 0);
        const dz = n === 2 ? -1 : (n === 3 ? 1 : 0);
        if ((lx === 0 && dx === -1) || (lx === CS - 1 && dx === 1) ||
            (lz === 0 && dz === -1) || (lz === CS - 1 && dz === 1)) {
          this.getChunk(cx + dx, cz + dz).dirty = true;
        }
      }
      this.flushDirty();
      return true;
    }

    _countEdits() {
      let n = 0;
      this.edits.forEach(function (m) { n += m.size; });
      return n;
    }

    _recalcColumn(chunk, lx, lz) {
      const col = (lx * CS + lz) * CH;
      let top = 0;
      for (let y = CH - 1; y >= 0; y--) {
        const b = chunk.data[col + y];
        if (b !== AIR && BLOCKS[b].opaque) { top = y; break; }
      }
      chunk.heightMap[lx * CS + lz] = top;
    }

    /** 편집된 청크를 즉시 다시 그림 */
    flushDirty() {
      let n = 0;
      this.chunks.forEach(function (c) {
        if (c.dirty && c.built && n < 8) { this.buildChunk(c); n++; }
      }, this);
    }

    /* ---------------- 메시 빌드 ---------------- */
    buildChunk(chunk) {
      const G = {
        opaque: { p: [], n: [], u: [], c: [], i: [] },
        cutout: { p: [], n: [], u: [], c: [], i: [] },
        trans: { p: [], n: [], u: [], c: [], i: [] },
      };
      const atlas = this.atlas;
      const bx = chunk.cx * CS, bz = chunk.cz * CS;
      const data = chunk.data;
      const self = this;
      const nbCache = new Map();

      // 청크 내부는 직접, 외부는 캐시된 이웃 청크에서
      function gb(wx, wy, wz) {
        if (wy < 0 || wy >= CH) return AIR;
        const lx = wx - bx, lz = wz - bz;
        if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) return data[(lx * CS + lz) * CH + wy];
        const cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
        const k = keyOf(cx, cz);
        let c = nbCache.get(k);
        if (!c) { c = self.getChunk(cx, cz); nbCache.set(k, c); }
        return c.data[idxOf(wx - cx * CS, wy, wz - cz * CS)];
      }
      function op(x, y, z) { return MC.isOpaque(gb(x, y, z)) ? 1 : 0; }

      for (let x = 0; x < CS; x++) {
        for (let z = 0; z < CS; z++) {
          const wx = bx + x, wz = bz + z;
          const col = (x * CS + z) * CH;
          const sky = chunk.heightMap[x * CS + z];

          for (let y = 0; y < CH; y++) {
            const id = data[col + y];
            if (id === AIR) continue;
            const def = BLOCKS[id];

            let depth = sky - y;
            if (depth < 0) depth = 0;
            if (depth > 5) depth = 5;
            const light = def.liquid ? 0.74 : (1 - depth * 0.11);

            const g = (def.liquid || def.transparent) ? G.trans
              : (def.cutout ? G.cutout : G.opaque);

            for (let f = 0; f < 6; f++) {
              const fd = FACES[f];
              const nx = wx + fd.dir[0], ny = y + fd.dir[1], nz = wz + fd.dir[2];
              const nid = gb(nx, ny, nz);
              if (!faceVisible(id, nid)) continue;

              const uvR = MC.tileUV(atlas, def.tiles[f]);
              const base = g.p.length / 3;
              const shade = fd.shade * light;
              const doAO = !def.liquid && !def.transparent;

              for (let c = 0; c < 4; c++) {
                const cn = fd.corners[c];
                g.p.push(x + cn[0], y + cn[1], z + cn[2]);
                g.n.push(fd.dir[0], fd.dir[1], fd.dir[2]);
                const fuv = FACE_UV[c];
                g.u.push(uvR[0] + (uvR[2] - uvR[0]) * fuv[0],
                         uvR[1] + (uvR[3] - uvR[1]) * fuv[1]);

                let lum = shade;
                if (doAO) {
                  const su = (c === 0 || c === 3) ? -1 : 1;
                  const sv = (c < 2) ? -1 : 1;
                  const ux = fd.u[0] * su, uy = fd.u[1] * su, uz = fd.u[2] * su;
                  const vx = fd.v[0] * sv, vy = fd.v[1] * sv, vz = fd.v[2] * sv;
                  const o1 = op(nx + ux, ny + uy, nz + uz);
                  const o2 = op(nx + vx, ny + vy, nz + vz);
                  const oc = op(nx + ux + vx, ny + uy + vy, nz + uz + vz);
                  const lvl = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
                  lum *= AO_LEVELS[lvl];
                }
                g.c.push(lum, lum, lum);
              }
              g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
          }
        }
      }

      if (chunk.meshes) {
        for (let i = 0; i < chunk.meshes.length; i++) {
          this.group.remove(chunk.meshes[i]);
          chunk.meshes[i].geometry.dispose();
        }
        chunk.meshes = null;
      }

      const meshes = [];
      const mk = (g, mat, order) => {
        if (g.i.length === 0) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
        geo.setIndex(g.i);
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        // 지오메트리는 청크 로컬 좌표(0~16) → 메시를 청크 원점으로 이동시킨다.
        // (좌표를 월드 단위로 직접 넣지 않아 먼 거리에서도 정밀도가 유지된다)
        m.position.set(bx, 0, bz);
        m.matrixAutoUpdate = false;
        m.updateMatrix();          // position 을 행렬에 반영
        m.renderOrder = order;
        m.frustumCulled = true;
        meshes.push(m);
        this.group.add(m);
      };
      mk(G.opaque, this.matOpaque, 0);
      mk(G.cutout, this.matCutout, 1);
      mk(G.trans, this.matTrans, 2);

      chunk.meshes = meshes;
      chunk.built = true;
      chunk.dirty = false;
      this._statDirty = true;
    }

    /* ---------------- 스트리밍 ---------------- */
    update(px, pz, budgetMs) {
      const ccx = Math.floor(px / CS), ccz = Math.floor(pz / CS);
      if (ccx !== this.lastCX || ccz !== this.lastCZ) {
        this.lastCX = ccx; this.lastCZ = ccz;
        this._recomputeWanted(ccx, ccz);
      }

      const t0 = performance.now();
      const budget = budgetMs === undefined ? 7 : budgetMs;
      while (this.queue.length && (performance.now() - t0) < budget) {
        this.buildNext();
      }

      let loaded = 0, tris = 0;
      this._statTick = (this._statTick || 0) + 1;
      if (this._statDirty || this._statTick % 45 === 1) {
        this._statDirty = false;
        this.chunks.forEach(function (c) {
          if (c.meshes && c.meshes.length) {
            loaded++;
            for (let i = 0; i < c.meshes.length; i++) {
              tris += c.meshes[i].geometry.index.count / 3;
            }
          }
        });
        this._loadedCache = loaded;
        this._trisCache = tris | 0;
      }
      this.stats.loaded = this._loadedCache || 0;
      this.stats.tris = this._trisCache || 0;
      this.stats.queued = this.queue.length;
    }

    /** 대기열에서 하나 꺼내 메시를 만든다 */
    buildNext() {
      const it = this.queue.shift();
      if (!it) return false;
      const c = this.getChunk(it.cx, it.cz);
      if (!c.built || c.dirty) this.buildChunk(c);
      return true;
    }

    _recomputeWanted(ccx, ccz) {
      const R = this.renderDistance;
      const keep = new Map();
      const list = [];
      // 유지 범위는 R+1 (테두리 청크의 이웃 데이터 보존)
      for (let dx = -R - 1; dx <= R + 1; dx++) {
        for (let dz = -R - 1; dz <= R + 1; dz++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > (R + 1.5) * (R + 1.5)) continue;
          keep.set(keyOf(ccx + dx, ccz + dz), d2);
          if (d2 > (R + 0.5) * (R + 0.5)) continue;
          list.push({ cx: ccx + dx, cz: ccz + dz, d2: d2 });
        }
      }
      this.wanted = keep;

      const self = this;
      const toRemove = [];
      this.chunks.forEach(function (c, k) {
        if (keep.has(k)) return;
        if (c.meshes) {
          for (let i = 0; i < c.meshes.length; i++) {
            self.group.remove(c.meshes[i]);
            c.meshes[i].geometry.dispose();
          }
        }
        toRemove.push(k);
      });
      for (let i = 0; i < toRemove.length; i++) this.chunks.delete(toRemove[i]);

      list.sort(function (a, b) { return a.d2 - b.d2; });
      this.queue = list;
    }

    /** 로딩 화면용: 대기열을 전부 즉시 빌드 */
    buildAllNow(limit) {
      let guard = 0;
      const max = limit || 5000;
      while (this.queue.length && guard++ < max) this.buildNext();
      return this.queue.length;
    }

    /* ---------------- 저장 / 복원 ---------------- */
    serializeEdits() {
      const out = [];
      this.edits.forEach(function (map, k) {
        const cx = Math.floor(k / 65536) - 32768;
        const cz = (k % 65536) - 32768;
        map.forEach(function (id, i) {
          const col = (i / CH) | 0;
          const y = i % CH;
          const lx = (col / CS) | 0;
          const lz = col % CS;
          out.push([cx * CS + lx, y, cz * CS + lz, id]);
        });
      });
      return out;
    }

    applyEdits(list) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        this.setBlock(e[0], e[1], e[2], e[3], true);
      }
      this.editCount = this._countEdits();
    }

    findSpawn() {
      for (let r = 0; r < 90; r++) {
        const steps = r === 0 ? 1 : 8;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const x = Math.round(Math.cos(a) * r * 5);
          const z = Math.round(Math.sin(a) * r * 5);
          const h = this.heightAt(x, z);
          if (h <= SEA + 1) continue;
          if (this.surfaceBlock(x, z, h) !== ID.GRASS) continue;
          let y = h + 1;
          let guard = 0;
          while (y < CH - 3 && this.getBlock(x, y, z) !== AIR && guard++ < 24) y++;
          if (y >= CH - 3) continue;
          return new THREE.Vector3(x + 0.5, y + 0.05, z + 0.5);
        }
      }
      return new THREE.Vector3(0.5, 50, 0.5);
    }
  }

  function faceVisible(id, nid) {
    if (nid === AIR) return true;
    if (nid === id) return !BLOCKS[id].sameCull;
    return !BLOCKS[nid].opaque;
  }

  MC.World = World;
  MC.CHUNK_SIZE = CS;
  MC.WORLD_HEIGHT = CH;
  MC.SEA_LEVEL = SEA;
})();
