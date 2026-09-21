/* =====================================================================
 *  sound.js — WebAudio 로 만드는 절차적 효과음 (외부 파일 없음)
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  let actx = null;
  let master = null;
  let noiseBuf = null;
  let muted = false;
  let lastAt = 0;

  function ensure() {
    if (actx) return actx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.32;
      master.connect(actx.destination);
    } catch (e) {
      actx = null;
    }
    return actx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function noise(c) {
    if (noiseBuf) return noiseBuf;
    const len = Math.floor(c.sampleRate * 0.6);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  function burst(opts) {
    const c = ensure();
    if (!c || muted) return;
    const now = c.currentTime;
    if (now - lastAt < 0.012) return;   // 폭주 방지
    lastAt = now;

    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;

    const filt = c.createBiquadFilter();
    filt.type = opts.filter || 'bandpass';
    filt.frequency.setValueAtTime(opts.freq || 700, now);
    if (opts.freqTo) filt.frequency.exponentialRampToValueAtTime(Math.max(60, opts.freqTo), now + (opts.dur || 0.15));
    filt.Q.value = opts.q === undefined ? 1.2 : opts.q;

    const g = c.createGain();
    const peak = (opts.gain === undefined ? 0.5 : opts.gain);
    const dur = opts.dur || 0.15;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(now);
    src.stop(now + dur + 0.03);
  }

  function tone(freq, dur, type, gain) {
    const c = ensure();
    if (!c || muted) return;
    const now = c.currentTime;
    const o = c.createOscillator();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, now);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain === undefined ? 0.25 : gain, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g);
    g.connect(master);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  /** 블록 종류에 따라 대략적인 소리 톤을 정한다 */
  function profile(blockId) {
    const b = MC.BLOCKS[blockId];
    if (!b) return { f: 800, d: 0.14 };
    const t = b.tiles[0];
    const M = MC.T;
    if (t === M.SAND || t === M.GRAVEL || t === M.DIRT || t === M.GRASS_SIDE || t === M.GRASS_TOP) return { f: 420, d: 0.15, q: 0.7 };
    if (t === M.SNOW) return { f: 1500, d: 0.11, q: 0.6 };
    if (t === M.WOOL_RED || t === M.WOOL_BLUE || t === M.WOOL_YELLOW) return { f: 320, d: 0.16, q: 0.5 };
    if (t === M.LEAVES) return { f: 2400, d: 0.12, q: 1.6 };
    if (t === M.WATER) return { f: 900, d: 0.3, q: 0.8, freqTo: 260 };
    if (t === M.GLASS) return { f: 2600, d: 0.2, q: 2.4 };
    if (t === M.LOG_SIDE || t === M.LOG_TOP || t === M.PLANKS || t === M.BOOKSHELF) return { f: 620, d: 0.15, q: 1.0 };
    return { f: 900, d: 0.16, q: 1.4 };   // 돌 계열
  }

  const API = {
    resume: resume,
    isMuted: function () { return muted; },
    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.32;
      return muted;
    },
    setVolume: function (v) {
      if (master) master.gain.value = muted ? 0 : v;
    },
    breakBlock: function (blockId) {
      const p = profile(blockId);
      burst({ freq: p.f, q: p.q || 1.2, dur: p.d, filter: 'bandpass', gain: 0.42 });
      tone(p.f * 0.35, 0.06, 'sine', 0.12);
    },
    placeBlock: function (blockId) {
      const p = profile(blockId);
      burst({ freq: p.f * 1.15, q: p.q || 1.2, dur: p.d * 0.6, gain: 0.3 });
    },
    step: function (blockId) {
      burst({ freq: 340, q: 0.6, dur: 0.075, filter: 'lowpass', gain: 0.16 });
    },
    splash: function () {
      burst({ freq: 1100, freqTo: 240, q: 0.9, dur: 0.42, gain: 0.34 });
    },
    click: function () { tone(880, 0.05, 'square', 0.08); },
    pick: function () { tone(1320, 0.06, 'sine', 0.1); },
    hurt: function () { tone(180, 0.3, 'sawtooth', 0.14); },
  };

  MC.Sound = API;
})();
