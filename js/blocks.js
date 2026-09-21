/* =====================================================================
 *  blocks.js — 텍스처 타일 인덱스 + 블록 정의
 *
 *  면 순서(face index): 0=+X(동) 1=-X(서) 2=+Y(위) 3=-Y(아래) 4=+Z(남) 5=-Z(북)
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  /* ---- 아틀라스 타일 인덱스 (textures.js 와 순서 일치) ---- */
  const T = {
    GRASS_TOP: 0,
    GRASS_SIDE: 1,
    DIRT: 2,
    STONE: 3,
    COBBLE: 4,
    SAND: 5,
    SANDSTONE: 6,
    GRAVEL: 7,
    LOG_SIDE: 8,
    LOG_TOP: 9,
    LEAVES: 10,
    PLANKS: 11,
    BRICK: 12,
    GLASS: 13,
    WATER: 14,
    BEDROCK: 15,
    COAL_ORE: 16,
    IRON_ORE: 17,
    GOLD_ORE: 18,
    DIAMOND_ORE: 19,
    SNOW: 20,
    MOSSY: 21,
    OBSIDIAN: 22,
    GLOWSTONE: 23,
    BOOKSHELF: 24,
    WOOL_RED: 25,
    WOOL_BLUE: 26,
    WOOL_YELLOW: 27,
    CACTUS_SIDE: 28,
    CACTUS_TOP: 29,
    PUMPKIN_SIDE: 30,
    PUMPKIN_TOP: 31,
  };

  const AIR = 0;

  /* id 0 = 공기 */
  const BLOCKS = [null];

  /**
   * 블록 정의 추가
   *  name     : 표시 이름
   *  tiles    : [동, 서, 위, 아래, 남, 북] 타일 인덱스 (배열 또는 단일 숫자)
   *  opaque   : 빛을 완전히 막는가 (이웃 면 제거 판정)
   *  solid    : 충돌 판정
   *  liquid   : 물
   *  cutout   : 알파 컷아웃 (나뭇잎)
   *  sameCull : 같은 블록끼리 맞닿은 면을 숨길지
   *  hardness : 부수는 데 걸리는 시간(초)
   */
  function def(name, tiles, opts) {
    const o = opts || {};
    const arr = typeof tiles === 'number'
      ? [tiles, tiles, tiles, tiles, tiles, tiles]
      : tiles.slice();
    BLOCKS.push({
      id: BLOCKS.length,
      name: name,
      tiles: arr,
      opaque: o.opaque !== false && !o.cutout && !o.liquid && !o.transparent,
      solid: o.solid !== false && !o.liquid,
      liquid: !!o.liquid,
      cutout: !!o.cutout,
      transparent: !!o.transparent,
      sameCull: o.sameCull === undefined ? true : o.sameCull,
      hardness: o.hardness === undefined ? 0.18 : o.hardness,
      creative: o.creative !== false,
    });
    return BLOCKS.length - 1;
  }

  const ID = {};
  ID.AIR = AIR;
  ID.GRASS = def('잔디 블록', [T.GRASS_SIDE, T.GRASS_SIDE, T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, T.GRASS_SIDE]);
  ID.DIRT = def('흙', T.DIRT);
  ID.STONE = def('돌', T.STONE, { hardness: 0.32 });
  ID.COBBLE = def('조약돌', T.COBBLE, { hardness: 0.3 });
  ID.SAND = def('모래', T.SAND);
  ID.SANDSTONE = def('사암', [T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE, T.SANDSTONE], { hardness: 0.3 });
  ID.GRAVEL = def('자갈', T.GRAVEL);
  ID.LOG = def('원목', [T.LOG_SIDE, T.LOG_SIDE, T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE, T.LOG_SIDE], { hardness: 0.25 });
  ID.LEAVES = def('나뭇잎', T.LEAVES, { cutout: true, sameCull: true, hardness: 0.1 });
  ID.PLANKS = def('나무 판자', T.PLANKS);
  ID.BRICK = def('벽돌', T.BRICK, { hardness: 0.3 });
  ID.GLASS = def('유리', T.GLASS, { transparent: true, sameCull: false, hardness: 0.15 });
  ID.WATER = def('물', T.WATER, { liquid: true, transparent: true, solid: false, sameCull: true, hardness: 0 });
  ID.BEDROCK = def('기반암', T.BEDROCK, { hardness: 1.5, creative: true });
  ID.COAL_ORE = def('석탄 원석', T.COAL_ORE, { hardness: 0.4 });
  ID.IRON_ORE = def('철 원석', T.IRON_ORE, { hardness: 0.5 });
  ID.GOLD_ORE = def('금 원석', T.GOLD_ORE, { hardness: 0.55 });
  ID.DIAMOND_ORE = def('다이아몬드 원석', T.DIAMOND_ORE, { hardness: 0.7 });
  ID.SNOW = def('눈 블록', T.SNOW);
  ID.MOSSY = def('이끼 낀 조약돌', T.MOSSY, { hardness: 0.3 });
  ID.OBSIDIAN = def('흑요석', T.OBSIDIAN, { hardness: 1.2 });
  ID.GLOWSTONE = def('발광석', T.GLOWSTONE, { hardness: 0.25 });
  ID.BOOKSHELF = def('책장', T.BOOKSHELF, { hardness: 0.25 });
  ID.WOOL_RED = def('빨간 양털', T.WOOL_RED);
  ID.WOOL_BLUE = def('파란 양털', T.WOOL_BLUE);
  ID.WOOL_YELLOW = def('노란 양털', T.WOOL_YELLOW);
  ID.CACTUS = def('선인장', [T.CACTUS_SIDE, T.CACTUS_SIDE, T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE, T.CACTUS_SIDE]);
  ID.PUMPKIN = def('호박', [T.PUMPKIN_SIDE, T.PUMPKIN_SIDE, T.PUMPKIN_TOP, T.PUMPKIN_TOP, T.PUMPKIN_SIDE, T.PUMPKIN_SIDE]);

  /* ---- 면(face) 기하 데이터 ---- */
  // v0..v3 은 블록 로컬 0..1 좌표, 바깥에서 볼 때 반시계 방향
  const FACES = [
    { // 0 : +X
      dir: [1, 0, 0],
      corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
      u: [0, 0, -1], v: [0, 1, 0],
      shade: 0.76,
    },
    { // 1 : -X
      dir: [-1, 0, 0],
      corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
      u: [0, 0, 1], v: [0, 1, 0],
      shade: 0.76,
    },
    { // 2 : +Y (위)
      dir: [0, 1, 0],
      corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
      u: [1, 0, 0], v: [0, 0, -1],
      shade: 1.0,
    },
    { // 3 : -Y (아래)
      dir: [0, -1, 0],
      corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
      u: [1, 0, 0], v: [0, 0, 1],
      shade: 0.52,
    },
    { // 4 : +Z
      dir: [0, 0, 1],
      corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
      u: [1, 0, 0], v: [0, 1, 0],
      shade: 0.88,
    },
    { // 5 : -Z
      dir: [0, 0, -1],
      corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
      u: [-1, 0, 0], v: [0, 1, 0],
      shade: 0.62,
    },
  ];

  // 정점별 UV (면 로컬 0..1)
  const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

  function isOpaque(id) { return id !== AIR && BLOCKS[id].opaque; }
  function isSolid(id) { return id !== AIR && BLOCKS[id].solid; }
  function isLiquid(id) { return id !== AIR && BLOCKS[id].liquid; }
  function blockById(id) { return BLOCKS[id]; }

  MC.T = T;
  MC.AIR = AIR;
  MC.ID = ID;
  MC.BLOCKS = BLOCKS;
  MC.FACES = FACES;
  MC.FACE_UV = FACE_UV;
  MC.isOpaque = isOpaque;
  MC.isSolid = isSolid;
  MC.isLiquid = isLiquid;

  /* 단축바 기본 구성 */
  MC.DEFAULT_HOTBAR = [
    ID.GRASS, ID.DIRT, ID.STONE, ID.COBBLE, ID.PLANKS, ID.LOG,
    ID.LEAVES, ID.GLASS, ID.GLOWSTONE,
  ];

  /* 크리에이티브 블록 목록 */
  MC.CREATIVE_BLOCKS = BLOCKS.filter(Boolean)
    .filter(function (b) { return b.creative; })
    .map(function (b) { return b.id; });
})();
