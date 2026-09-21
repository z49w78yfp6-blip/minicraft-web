/* =====================================================================
 *  noise.js — 시드 기반 펄린 노이즈 + 해시 유틸
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const GRAD3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];
  const GRAD2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
  ];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /** 결정적 해시: 같은 입력 → 항상 같은 0..1 실수 */
  function hash(x, y, z, seed) {
    let h = (seed | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
    h = Math.imul(h ^ (y | 0), 0x165667b1);
    h = Math.imul(h ^ (z | 0), 0x2545f491);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** 문자열 → 32bit 정수 시드 */
  function seedFromString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /** 작은 고속 난수기 (월드 생성 내부용) */
  function mulberry32(a) {
    let s = a >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Noise {
    constructor(seed) {
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      const rand = mulberry32((seed | 0) || 1);
      for (let i = 255; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      this.perm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    }

    perlin2(x, y) {
      const P = this.perm;
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = P[P[X] + Y] & 7;
      const ba = P[P[X + 1] + Y] & 7;
      const ab = P[P[X] + Y + 1] & 7;
      const bb = P[P[X + 1] + Y + 1] & 7;
      const g = GRAD2;
      const d1 = g[aa][0] * xf + g[aa][1] * yf;
      const d2 = g[ba][0] * (xf - 1) + g[ba][1] * yf;
      const d3 = g[ab][0] * xf + g[ab][1] * (yf - 1);
      const d4 = g[bb][0] * (xf - 1) + g[bb][1] * (yf - 1);
      return lerp(lerp(d1, d2, u), lerp(d3, d4, u), v) * 1.4;
    }

    perlin3(x, y, z) {
      const P = this.perm;
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const Z = Math.floor(z) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const zf = z - Math.floor(z);
      const u = fade(xf), v = fade(yf), w = fade(zf);
      const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
      const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
      const g = GRAD3;
      function dot(gi, dx, dy, dz) { const gr = g[gi % 12]; return gr[0] * dx + gr[1] * dy + gr[2] * dz; }
      const d1 = dot(P[AA], xf, yf, zf);
      const d2 = dot(P[BA], xf - 1, yf, zf);
      const d3 = dot(P[AB], xf, yf - 1, zf);
      const d4 = dot(P[BB], xf - 1, yf - 1, zf);
      const d5 = dot(P[AA + 1], xf, yf, zf - 1);
      const d6 = dot(P[BA + 1], xf - 1, yf, zf - 1);
      const d7 = dot(P[AB + 1], xf, yf - 1, zf - 1);
      const d8 = dot(P[BB + 1], xf - 1, yf - 1, zf - 1);
      const x1 = lerp(d1, d2, u), x2 = lerp(d3, d4, u);
      const x3 = lerp(d5, d6, u), x4 = lerp(d7, d8, u);
      return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w) * 1.1;
    }

    /** 프랙탈 2D — 대략 -1..1 */
    fbm2(x, y, octaves, lacunarity, gain) {
      const lac = lacunarity || 2.0;
      const g = gain === undefined ? 0.5 : gain;
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < (octaves || 4); i++) {
        sum += this.perlin2(x * freq, y * freq) * amp;
        norm += amp;
        amp *= g; freq *= lac;
      }
      return sum / norm;
    }

    /** 프랙탈 3D — 대략 -1..1 */
    fbm3(x, y, z, octaves, lacunarity, gain) {
      const lac = lacunarity || 2.0;
      const g = gain === undefined ? 0.5 : gain;
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < (octaves || 3); i++) {
        sum += this.perlin3(x * freq, y * freq, z * freq) * amp;
        norm += amp;
        amp *= g; freq *= lac;
      }
      return sum / norm;
    }

    /** 리지드(능선) 2D — 산맥용, 0..1 */
    ridged2(x, y, octaves) {
      let amp = 0.5, freq = 1, sum = 0;
      for (let i = 0; i < (octaves || 4); i++) {
        const n = 1 - Math.abs(this.perlin2(x * freq, y * freq));
        sum += n * n * amp;
        amp *= 0.5; freq *= 2;
      }
      return sum;
    }
  }

  MC.Noise = Noise;
  MC.hash = hash;
  MC.seedFromString = seedFromString;
  MC.mulberry32 = mulberry32;
  MC.__F2 = F2;
})();
