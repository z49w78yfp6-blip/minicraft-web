/* =====================================================================
 *  textures.js — 코드로 그리는 16x16 픽셀 텍스처 + 아틀라스
 *  (외부 이미지 파일 없이 완전 오프라인 동작)
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  const TILE = 16;      // 타일 한 변
  const PAD = 8;        // 밉맵 대비 가장자리 복제 여백
  const CELL = TILE + PAD * 2;
  const COLS = 8;

  function rndFactory(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- 그리기 도우미 ---------------- */
  function fill(ctx, col) { ctx.fillStyle = col; ctx.fillRect(0, 0, TILE, TILE); }

  function px(ctx, x, y, col) {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** 전체에 뿌리는 잡티 */
  function speck(ctx, R, cols, count, size) {
    const s = size || 1;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = cols[(R() * cols.length) | 0];
      ctx.fillRect((R() * TILE) | 0, (R() * TILE) | 0, s, s);
    }
  }

  /** 뭉툭한 원형 반점 */
  function blob(ctx, R, cx, cy, r, cols) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + (r * 0.6)) continue;
        const X = Math.round(cx + x), Y = Math.round(cy + y);
        if (X < 0 || X > 15 || Y < 0 || Y > 15) continue;
        ctx.fillStyle = cols[(R() * cols.length) | 0];
        ctx.fillRect(X, Y, 1, 1);
      }
    }
  }

  function hLine(ctx, y, col, x0, x1) {
    ctx.fillStyle = col;
    ctx.fillRect(x0 === undefined ? 0 : x0, y, (x1 === undefined ? TILE : x1) - (x0 || 0), 1);
  }
  function vLine(ctx, x, col, y0, y1) {
    ctx.fillStyle = col;
    ctx.fillRect(x, y0 === undefined ? 0 : y0, 1, (y1 === undefined ? TILE : y1) - (y0 || 0));
  }

  /* ---------------- 개별 텍스처 ---------------- */
  const PAINTERS = [];

  // 0 잔디 윗면
  PAINTERS[0] = function (ctx, R) {
    fill(ctx, '#5d9c3d');
    speck(ctx, R, ['#6fb84a', '#528c34', '#79c456', '#4b812e'], 150);
    speck(ctx, R, ['#82cf5c'], 22, 2);
  };

  // 1 잔디 옆면
  PAINTERS[1] = function (ctx, R) {
    fill(ctx, '#8b6239');
    speck(ctx, R, ['#7a5530', '#9c7143', '#6d4a28', '#a1784a'], 90);
    // 위쪽 잔디 띠 (들쭉날쭉)
    const heights = [4, 3, 5, 3, 4, 6, 3, 4, 5, 3, 4, 4, 6, 3, 5, 4];
    for (let x = 0; x < TILE; x++) {
      const h = heights[x];
      for (let y = 0; y < h; y++) {
        px(ctx, x, y, R() < 0.35 ? '#4b812e' : (R() < 0.5 ? '#79c456' : '#5d9c3d'));
      }
      px(ctx, x, h, R() < 0.5 ? '#4b812e' : '#42701f');
    }
  };

  // 2 흙
  PAINTERS[2] = function (ctx, R) {
    fill(ctx, '#8b6239');
    speck(ctx, R, ['#7a5530', '#9c7143', '#6d4a28', '#a1784a', '#835b34'], 170);
    speck(ctx, R, ['#5f4023'], 16, 2);
  };

  // 3 돌
  PAINTERS[3] = function (ctx, R) {
    fill(ctx, '#7d7d7d');
    speck(ctx, R, ['#8c8c8c', '#6f6f6f', '#949494', '#777777', '#858585'], 200);
    speck(ctx, R, ['#656565'], 14, 2);
  };

  // 4 조약돌
  PAINTERS[4] = function (ctx, R) {
    fill(ctx, '#5f5f5f');
    const stones = [[1, 1, 6, 4], [8, 1, 6, 5], [2, 7, 5, 4], [8, 8, 6, 6], [1, 12, 6, 3], [12, 12, 3, 3]];
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      ctx.fillStyle = ['#8e8e8e', '#7b7b7b', '#9a9a9a', '#848484'][i % 4];
      ctx.fillRect(s[0], s[1], s[2], s[3]);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(s[0], s[1] + s[3] - 1, s[2], 1);
      ctx.fillRect(s[0] + s[2] - 1, s[1], 1, s[3]);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(s[0], s[1], s[2], 1);
    }
    speck(ctx, R, ['#6a6a6a', '#a5a5a5'], 60);
  };

  // 5 모래
  PAINTERS[5] = function (ctx, R) {
    fill(ctx, '#dbd08a');
    speck(ctx, R, ['#e6dc9c', '#cfc078', '#e0d494', '#c9b96f'], 180);
  };

  // 6 사암
  PAINTERS[6] = function (ctx, R) {
    fill(ctx, '#ddd2a0');
    speck(ctx, R, ['#e6dcae', '#d0c48f'], 90);
    hLine(ctx, 0, '#c6b880');
    hLine(ctx, 1, '#ece2b8');
    hLine(ctx, 5, '#c6b880');
    hLine(ctx, 6, '#ece2b8');
    hLine(ctx, 10, '#c6b880');
    hLine(ctx, 11, '#ece2b8');
    hLine(ctx, 15, '#c6b880');
  };

  // 7 자갈
  PAINTERS[7] = function (ctx, R) {
    fill(ctx, '#83807c');
    for (let i = 0; i < 26; i++) {
      blob(ctx, R, (R() * 16) | 0, (R() * 16) | 0, 1 + ((R() * 2) | 0),
        ['#9c9995', '#6d6a66', '#a8a5a0', '#5c5956', '#8f8c88']);
    }
    speck(ctx, R, ['#b3b0ab', '#565350'], 40);
  };

  // 8 원목 옆면
  PAINTERS[8] = function (ctx, R) {
    fill(ctx, '#6b4f2a');
    for (let x = 0; x < TILE; x += 2) {
      const c = ['#5a4020', '#7a5a31', '#63482a', '#815f35'][(R() * 4) | 0];
      vLine(ctx, x, c);
    }
    speck(ctx, R, ['#4b3519', '#8d6a3d'], 50);
  };

  // 9 원목 윗면(나이테)
  PAINTERS[9] = function (ctx, R) {
    fill(ctx, '#b08850');
    const rings = [[7, '#966f3c'], [5, '#c19a63'], [3.2, '#8f6835'], [1.6, '#c9a672']];
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i][0];
      ctx.strokeStyle = rings[i][1];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(8, 8, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    px(ctx, 8, 8, '#7d5a2c');
    speck(ctx, R, ['#a07840', '#c0a070'], 30);
  };

  // 10 나뭇잎 (구멍 있음)
  PAINTERS[10] = function (ctx, R) {
    fill(ctx, '#3f7a2c');
    speck(ctx, R, ['#4d9135', '#356a24', '#58a03c', '#2c5a1e'], 170);
    speck(ctx, R, ['#68b247'], 20, 2);
    // 알파 구멍
    for (let i = 0; i < 26; i++) {
      ctx.clearRect((R() * TILE) | 0, (R() * TILE) | 0, 1, 1);
    }
    for (let i = 0; i < 5; i++) {
      ctx.clearRect((R() * TILE) | 0, (R() * TILE) | 0, 2, 2);
    }
  };

  // 11 나무 판자
  PAINTERS[11] = function (ctx, R) {
    fill(ctx, '#b0864f');
    speck(ctx, R, ['#a37b47', '#bd9260', '#966f3f'], 110);
    for (let y = 0; y < TILE; y += 4) {
      hLine(ctx, y, '#8a6537');
      hLine(ctx, y + 1, '#c69a66');
    }
    // 세로 이음선
    vLine(ctx, 5, '#8a6537', 0, 4);
    vLine(ctx, 11, '#8a6537', 4, 8);
    vLine(ctx, 3, '#8a6537', 8, 12);
    vLine(ctx, 9, '#8a6537', 12, 16);
  };

  // 12 벽돌
  PAINTERS[12] = function (ctx, R) {
    fill(ctx, '#c9bfae');
    const brick = '#9d4a3b';
    const brickAlt = '#a9553f';
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const off = row % 2 === 0 ? 0 : -4;
      for (let x = off; x < TILE; x += 8) {
        ctx.fillStyle = (row + x) % 2 === 0 ? brick : brickAlt;
        ctx.fillRect(x, y + 1, 7, 3);
      }
    }
    speck(ctx, R, ['#8c3f33', '#b25f48'], 40);
  };

  // 13 유리
  PAINTERS[13] = function (ctx) {
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.fillStyle = 'rgba(198, 232, 245, 0.22)';
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = 'rgba(226, 245, 252, 0.95)';
    ctx.fillRect(0, 0, TILE, 1);
    ctx.fillRect(0, 15, TILE, 1);
    ctx.fillRect(0, 0, 1, TILE);
    ctx.fillRect(15, 0, 1, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(2, 2, 4, 1);
    ctx.fillRect(2, 3, 2, 1);
    ctx.fillRect(11, 11, 3, 1);
  };

  // 14 물
  PAINTERS[14] = function (ctx, R) {
    ctx.fillStyle = 'rgba(41, 106, 198, 0.78)';
    ctx.fillRect(0, 0, TILE, TILE);
    speck(ctx, R, ['rgba(64, 138, 226, 0.75)', 'rgba(30, 86, 168, 0.75)', 'rgba(88, 160, 236, 0.7)'], 90);
    ctx.fillStyle = 'rgba(150, 205, 250, 0.55)';
    ctx.fillRect(2, 3, 4, 1);
    ctx.fillRect(9, 8, 5, 1);
    ctx.fillRect(4, 12, 3, 1);
  };

  // 15 기반암
  PAINTERS[15] = function (ctx, R) {
    fill(ctx, '#3b3b3b');
    for (let i = 0; i < 30; i++) {
      const s = 2 + ((R() * 3) | 0);
      ctx.fillStyle = ['#555555', '#262626', '#6a6a6a', '#1a1a1a', '#4a4a4a'][(R() * 5) | 0];
      ctx.fillRect((R() * 16) | 0, (R() * 16) | 0, s, s);
    }
  };

  // 16 석탄 원석
  PAINTERS[16] = function (ctx, R) { stoneBase(ctx, R); oreBlobs(ctx, R, ['#1b1b1b', '#2c2c2c', '#0d0d0d'], 4); };
  // 17 철 원석
  PAINTERS[17] = function (ctx, R) { stoneBase(ctx, R); oreBlobs(ctx, R, ['#d8a17a', '#c98d63', '#e8bb96'], 4); };
  // 18 금 원석
  PAINTERS[18] = function (ctx, R) { stoneBase(ctx, R); oreBlobs(ctx, R, ['#f7d64a', '#e0b92c', '#ffeb8a'], 4); };
  // 19 다이아 원석
  PAINTERS[19] = function (ctx, R) { stoneBase(ctx, R); oreBlobs(ctx, R, ['#59e0e0', '#33c4c9', '#a5f5f5'], 4); };

  function stoneBase(ctx, R) {
    fill(ctx, '#7d7d7d');
    speck(ctx, R, ['#8c8c8c', '#6f6f6f', '#949494', '#777777'], 170);
  }
  function oreBlobs(ctx, R, cols, n) {
    for (let i = 0; i < n; i++) {
      blob(ctx, R, 2 + R() * 12, 2 + R() * 12, 1 + ((R() * 1.8) | 0), cols);
    }
    speck(ctx, R, cols, 8);
  }

  // 20 눈
  PAINTERS[20] = function (ctx, R) {
    fill(ctx, '#f2f7fb');
    speck(ctx, R, ['#e2ebf2', '#ffffff', '#dbe6ef'], 130);
  };

  // 21 이끼 낀 조약돌
  PAINTERS[21] = function (ctx, R) {
    PAINTERS[4](ctx, R);
    for (let i = 0; i < 14; i++) {
      blob(ctx, R, (R() * 16) | 0, (R() * 16) | 0, 1 + ((R() * 2) | 0),
        ['#4e7a35', '#3f6629', '#5f8f42', '#345420']);
    }
  };

  // 22 흑요석
  PAINTERS[22] = function (ctx, R) {
    fill(ctx, '#171226');
    speck(ctx, R, ['#251c3d', '#0d0a16', '#2f2450', '#1c1533'], 170);
    speck(ctx, R, ['#4a3a78', '#5b4694'], 12, 1);
  };

  // 23 발광석
  PAINTERS[23] = function (ctx, R) {
    fill(ctx, '#d9b45a');
    for (let i = 0; i < 22; i++) {
      blob(ctx, R, (R() * 16) | 0, (R() * 16) | 0, 1 + ((R() * 2) | 0),
        ['#fff3b0', '#ffe680', '#f5d76e', '#c9a04a']);
    }
    speck(ctx, R, ['#fffbe0', '#b98f3c'], 40);
  };

  // 24 책장
  PAINTERS[24] = function (ctx, R) {
    fill(ctx, '#b0864f');
    speck(ctx, R, ['#a37b47', '#bd9260'], 80);
    hLine(ctx, 0, '#8a6537'); hLine(ctx, 1, '#c69a66');
    hLine(ctx, 8, '#8a6537'); hLine(ctx, 9, '#c69a66');
    hLine(ctx, 15, '#8a6537');
    const bookCols = ['#a33b32', '#3b5aa3', '#3b8a4a', '#c9a13b', '#7a3ba3', '#c96a3b'];
    for (let shelf = 0; shelf < 2; shelf++) {
      const y0 = shelf * 8 + 2;
      let x = 0;
      while (x < TILE) {
        const w = 1 + ((R() * 2) | 0);
        ctx.fillStyle = bookCols[(R() * bookCols.length) | 0];
        ctx.fillRect(x, y0, Math.min(w, TILE - x), 6);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x, y0 + 5, Math.min(w, TILE - x), 1);
        x += w + 1;
      }
    }
  };

  // 25~27 양털
  function wool(col, dark, light) {
    return function (ctx, R) {
      fill(ctx, col);
      speck(ctx, R, [dark, light, col], 210);
    };
  }
  PAINTERS[25] = wool('#b83b30', '#9c2f26', '#cc5044');
  PAINTERS[26] = wool('#3b62b8', '#2f4f9c', '#5078cc');
  PAINTERS[27] = wool('#e0c246', '#c4a634', '#f2da6a');

  // 28 선인장 옆면
  PAINTERS[28] = function (ctx, R) {
    fill(ctx, '#417a30');
    vLine(ctx, 0, '#345f26'); vLine(ctx, 1, '#4d8c39');
    vLine(ctx, 14, '#345f26'); vLine(ctx, 15, '#4d8c39');
    for (let y = 0; y < TILE; y += 3) {
      px(ctx, 3 + ((R() * 3) | 0), y, '#e8e0c0');
      px(ctx, 10 + ((R() * 3) | 0), y + 1, '#e8e0c0');
    }
    speck(ctx, R, ['#4d8c39', '#376b28'], 70);
  };

  // 29 선인장 윗면
  PAINTERS[29] = function (ctx, R) {
    fill(ctx, '#4d8c39');
    ctx.strokeStyle = '#376b28';
    ctx.beginPath(); ctx.arc(8, 8, 5.5, 0, Math.PI * 2); ctx.stroke();
    speck(ctx, R, ['#376b28', '#5aa044'], 60);
    blob(ctx, R, 8, 8, 2, ['#2f5a22', '#3f7a30']);
  };

  // 30 호박 옆면
  PAINTERS[30] = function (ctx, R) {
    fill(ctx, '#c8761f');
    for (let x = 1; x < TILE; x += 4) vLine(ctx, x, '#a85c14');
    for (let x = 3; x < TILE; x += 4) vLine(ctx, x, '#e09034');
    speck(ctx, R, ['#b96a1a', '#d98a2e'], 70);
  };

  // 31 호박 윗면
  PAINTERS[31] = function (ctx, R) {
    fill(ctx, '#c8761f');
    blob(ctx, R, 8, 8, 6, ['#b96a1a', '#d98a2e']);
    ctx.fillStyle = '#6b4f2a';
    ctx.fillRect(6, 6, 4, 4);
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(7, 7, 2, 2);
    speck(ctx, R, ['#a85c14', '#e09034'], 40);
  };

  /* ---------------- 아틀라스 생성 ---------------- */
  function buildAtlas() {
    const rows = Math.ceil(PAINTERS.length / COLS);
    const W = COLS * CELL;
    const H = rows * CELL;

    const atlas = document.createElement('canvas');
    atlas.width = W;
    atlas.height = H;
    const actx = atlas.getContext('2d');
    actx.imageSmoothingEnabled = false;

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = TILE;
    tileCanvas.height = TILE;

    const averages = new Array(PAINTERS.length);

    for (let i = 0; i < PAINTERS.length; i++) {
      const tctx = tileCanvas.getContext('2d');
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, TILE, TILE);
      tctx.imageSmoothingEnabled = false;
      PAINTERS[i](tctx, rndFactory(0x51ed + i * 7919));

      const col = i % COLS, row = (i / COLS) | 0;
      const cx = col * CELL + PAD;
      const cy = row * CELL + PAD;

      // 본체
      actx.drawImage(tileCanvas, 0, 0, TILE, TILE, cx, cy, TILE, TILE);

      // 가장자리 복제 (밉맵 번짐 방지)
      actx.drawImage(tileCanvas, 0, 0, TILE, 1, cx, cy - PAD, TILE, PAD);            // 위
      actx.drawImage(tileCanvas, 0, TILE - 1, TILE, 1, cx, cy + TILE, TILE, PAD);   // 아래
      actx.drawImage(tileCanvas, 0, 0, 1, TILE, cx - PAD, cy, PAD, TILE);           // 왼쪽
      actx.drawImage(tileCanvas, TILE - 1, 0, 1, TILE, cx + TILE, cy, PAD, TILE);   // 오른쪽
      actx.drawImage(tileCanvas, 0, 0, 1, 1, cx - PAD, cy - PAD, PAD, PAD);
      actx.drawImage(tileCanvas, TILE - 1, 0, 1, 1, cx + TILE, cy - PAD, PAD, PAD);
      actx.drawImage(tileCanvas, 0, TILE - 1, 1, 1, cx - PAD, cy + TILE, PAD, PAD);
      actx.drawImage(tileCanvas, TILE - 1, TILE - 1, 1, 1, cx + TILE, cy + TILE, PAD, PAD);

      // 평균 색 (파티클용)
      const d = tctx.getImageData(0, 0, TILE, TILE).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p + 3] < 24) continue;
        r += d[p]; g += d[p + 1]; b += d[p + 2]; n++;
      }
      if (n === 0) n = 1;
      averages[i] = [(r / n) / 255, (g / n) / 255, (b / n) / 255];
    }

    return { canvas: atlas, width: W, height: H, cols: COLS, rows: rows, tile: TILE, cell: CELL, pad: PAD, averages: averages };
  }

  /** 타일 인덱스 → UV 사각형 [u0, v0, u1, v1] (three 좌표계: 좌하단 원점) */
  function tileUV(atlas, index) {
    const col = index % atlas.cols;
    const row = (index / atlas.cols) | 0;
    const x0 = col * atlas.cell + atlas.pad;
    const y0 = row * atlas.cell + atlas.pad;
    const x1 = x0 + atlas.tile;
    const y1 = y0 + atlas.tile;
    return [x0 / atlas.width, 1 - y1 / atlas.height, x1 / atlas.width, 1 - y0 / atlas.height];
  }

  /** UI용: 특정 타일만 확대한 작은 캔버스 */
  function tileThumb(atlas, index, size) {
    const c = document.createElement('canvas');
    c.width = c.height = size || 48;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const col = index % atlas.cols;
    const row = (index / atlas.cols) | 0;
    ctx.drawImage(atlas.canvas,
      col * atlas.cell + atlas.pad, row * atlas.cell + atlas.pad, atlas.tile, atlas.tile,
      0, 0, c.width, c.height);
    return c;
  }

  /** 블록 한 개짜리 정육면체 지오메트리 (손에 든 아이템용) */
  function buildBlockGeometry(atlas, blockId, size) {
    const def = MC.BLOCKS[blockId];
    const FACES = MC.FACES;
    const FACE_UV = MC.FACE_UV;
    const s = size === undefined ? 1 : size;
    const p = [], n = [], u = [], c = [], idx = [];

    for (let f = 0; f < 6; f++) {
      const fd = FACES[f];
      const uvR = tileUV(atlas, def.tiles[f]);
      const base = p.length / 3;
      for (let k = 0; k < 4; k++) {
        const cn = fd.corners[k];
        p.push((cn[0] - 0.5) * s, (cn[1] - 0.5) * s, (cn[2] - 0.5) * s);
        n.push(fd.dir[0], fd.dir[1], fd.dir[2]);
        const fuv = FACE_UV[k];
        u.push(uvR[0] + (uvR[2] - uvR[0]) * fuv[0],
               uvR[1] + (uvR[3] - uvR[1]) * fuv[1]);
        const sh = 0.55 + fd.shade * 0.45;
        c.push(sh, sh, sh);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    geo.setIndex(idx);
    return geo;
  }

  MC.buildAtlas = buildAtlas;
  MC.tileUV = tileUV;
  MC.tileThumb = tileThumb;
  MC.buildBlockGeometry = buildBlockGeometry;
  MC.TILE_COUNT = PAINTERS.length;
})();
