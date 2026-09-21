/* =====================================================================
 *  player.js — 1인칭 이동 · 충돌 · 복셀 레이캐스트
 * ===================================================================== */
(function () {
  'use strict';
  const MC = (window.MC = window.MC || {});

  const GRAVITY = 30;
  const JUMP_SPEED = 8.6;
  const EPS = 1e-3;

  class Player {
    constructor(world) {
      this.world = world;
      this.pos = new THREE.Vector3(0, 60, 0);   // 발 위치(중심)
      this.vel = new THREE.Vector3();
      this.yaw = 0;
      this.pitch = 0;
      this.width = 0.6;
      this.height = 1.8;
      this.eye = 1.62;
      this.onGround = false;
      this.onGroundPrev = false;
      this.landTime = 0;
      this.flying = false;
      this.inWater = false;
      this.headInWater = false;
      this.sprinting = false;
      this.bob = 0;
      this.bobPhase = 0;
      this.keys = {
        forward: false, back: false, left: false, right: false,
        jump: false, sneak: false, sprint: false,
      };
    }

    setPosition(v) {
      this.pos.copy(v);
      this.vel.set(0, 0, 0);
      this.onGround = false;
    }

    eyePosition(out) {
      const o = out || new THREE.Vector3();
      return o.set(this.pos.x, this.pos.y + this.eye + this.bob, this.pos.z);
    }

    lookDirection(out) {
      const o = out || new THREE.Vector3();
      const cp = Math.cos(this.pitch);
      return o.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    }

    /* ---------------- 충돌 ---------------- */
    _solidAt(x, y, z) {
      return MC.isSolid(this.world.getBlock(x, y, z));
    }

    moveX(dx) {
      if (dx === 0) return;
      this.pos.x += dx;
      const hw = this.width / 2;
      const p = this.pos;
      const y0 = Math.floor(p.y + 0.002), y1 = Math.floor(p.y + this.height - 0.002);
      const z0 = Math.floor(p.z - hw + 0.002), z1 = Math.floor(p.z + hw - 0.002);
      if (dx > 0) {
        const xe = Math.floor(p.x + hw - 0.002);
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          if (this._solidAt(xe, y, z)) { p.x = xe - hw - EPS; this.vel.x = 0; return; }
        }
      } else {
        const xe = Math.floor(p.x - hw + 0.002);
        for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
          if (this._solidAt(xe, y, z)) { p.x = xe + 1 + hw + EPS; this.vel.x = 0; return; }
        }
      }
    }

    moveZ(dz) {
      if (dz === 0) return;
      this.pos.z += dz;
      const hw = this.width / 2;
      const p = this.pos;
      const y0 = Math.floor(p.y + 0.002), y1 = Math.floor(p.y + this.height - 0.002);
      const x0 = Math.floor(p.x - hw + 0.002), x1 = Math.floor(p.x + hw - 0.002);
      if (dz > 0) {
        const ze = Math.floor(p.z + hw - 0.002);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (this._solidAt(x, y, ze)) { p.z = ze - hw - EPS; this.vel.z = 0; return; }
        }
      } else {
        const ze = Math.floor(p.z - hw + 0.002);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (this._solidAt(x, y, ze)) { p.z = ze + 1 + hw + EPS; this.vel.z = 0; return; }
        }
      }
    }

    moveY(dy) {
      if (dy === 0) return;
      this.pos.y += dy;
      const hw = this.width / 2;
      const p = this.pos;
      const x0 = Math.floor(p.x - hw + 0.002), x1 = Math.floor(p.x + hw - 0.002);
      const z0 = Math.floor(p.z - hw + 0.002), z1 = Math.floor(p.z + hw - 0.002);
      if (dy > 0) {
        const ye = Math.floor(p.y + this.height - 0.002);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          if (this._solidAt(x, ye, z)) { p.y = ye - this.height - EPS; this.vel.y = 0; return; }
        }
      } else {
        const ye = Math.floor(p.y + 0.002);
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
          if (this._solidAt(x, ye, z)) {
            p.y = ye + 1 + EPS;
            this.vel.y = 0;
            this.onGround = true;
            return;
          }
        }
      }
    }

    /** 블록 안에 끼었을 때 위로 밀어내기 */
    unstick() {
      if (this._collides(this.pos.x, this.pos.y, this.pos.z)) {
        for (let i = 0; i < 24; i++) {
          const y = Math.floor(this.pos.y) + i + 1;
          if (!this._collides(this.pos.x, y + 0.05, this.pos.z)) { this.pos.y = y + 0.05; return; }
        }
      }
    }

    _collides(x, y, z) {
      const hw = this.width / 2;
      const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
      const y0 = Math.floor(y), y1 = Math.floor(y + this.height);
      const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
      for (let X = x0; X <= x1; X++)
        for (let Y = y0; Y <= y1; Y++)
          for (let Z = z0; Z <= z1; Z++)
            if (this._solidAt(X, Y, Z)) return true;
      return false;
    }

    /* ---------------- 프레임 갱신 ---------------- */
    update(dt) {
      dt = Math.min(dt, 0.05);
      const world = this.world;
      const k = this.keys;
      const p = this.pos;

      const fx = Math.floor(p.x), fz = Math.floor(p.z);
      const feetWater = world.isLiquid(fx, Math.floor(p.y + 0.25), fz);
      const bodyWater = feetWater || world.isLiquid(fx, Math.floor(p.y + 1.0), fz);
      this.inWater = bodyWater;
      this.headInWater = world.isLiquid(fx, Math.floor(p.y + this.eye), fz);

      let ix = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      let iz = (k.forward ? 1 : 0) - (k.back ? 1 : 0);
      const len = Math.hypot(ix, iz);
      if (len > 0) { ix /= len; iz /= len; }

      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      const wx = ix * cosY - iz * sinY;
      const wz = -ix * sinY - iz * cosY;

      this.sprinting = !!k.sprint && (Math.abs(iz) > 0 || len > 0);
      let speed = this.flying
        ? (k.sprint ? 26 : 11)
        : (this.sprinting ? 6.1 : 4.35);
      if (!this.flying && k.sneak) speed *= 0.3;
      if (this.inWater && !this.flying) speed *= 0.6;

      const accel = (this.onGround || this.flying || this.inWater) ? 16 : 5;
      const t = Math.min(1, accel * dt);
      this.vel.x += (wx * speed - this.vel.x) * t;
      this.vel.z += (wz * speed - this.vel.z) * t;

      // 수직
      this.onGround = false;
      if (this.flying) {
        const vy = (k.jump ? 1 : 0) - (k.sneak ? 1 : 0);
        this.vel.y += (vy * speed - this.vel.y) * Math.min(1, 12 * dt);
      } else if (this.inWater) {
        if (k.jump) this.vel.y = 3.6;
        else {
          this.vel.y -= GRAVITY * 0.3 * dt;
          this.vel.y *= Math.pow(0.09, dt);
        }
        if (this.vel.y < -4.5) this.vel.y = -4.5;
      } else {
        if (k.jump && this.onGroundPrev) this.vel.y = JUMP_SPEED;
        this.vel.y -= GRAVITY * dt;
        if (this.vel.y < -60) this.vel.y = -60;
      }

      this.moveX(this.vel.x * dt);
      this.moveZ(this.vel.z * dt);
      const wasFalling = this.vel.y;
      this.moveY(this.vel.y * dt);
      this.onGroundPrev = this.onGround;

      // 낙하 피해 대신 물/공허 처리: 공허로 떨어지면 스폰으로
      if (p.y < -6) {
        this.setPosition(world.findSpawn());
        this.vel.set(0, 0, 0);
      }

      // 시점 흔들림
      const hs = Math.hypot(this.vel.x, this.vel.z);
      if (this.onGround && hs > 0.6) {
        this.bobPhase += dt * hs * 1.7;
        this.bob = Math.sin(this.bobPhase * 2) * 0.045;
      } else {
        this.bobPhase = 0;
        this.bob += (0 - this.bob) * Math.min(1, 8 * dt);
      }
      if (wasFalling < -1 && this.onGround) this.landTime = 0.001;

      // 물 속 저항(가라앉는 느낌)
      if (this.inWater && !this.flying) {
        this.vel.x *= Math.pow(0.35, dt);
        this.vel.z *= Math.pow(0.35, dt);
      }
    }
  }

  /* ---------------- 복셀 레이캐스트 (DDA) ---------------- */
  function raycastVoxel(world, origin, dir, maxDist) {
    const dx = dir.x, dy = dir.y, dz = dir.z;
    if (dx === 0 && dy === 0 && dz === 0) return null;

    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (stepX > 0 ? (x + 1 - origin.x) : (origin.x - x)) / Math.abs(dx) : Infinity;
    let tMaxY = dy !== 0 ? (stepY > 0 ? (y + 1 - origin.y) : (origin.y - y)) / Math.abs(dy) : Infinity;
    let tMaxZ = dz !== 0 ? (stepZ > 0 ? (z + 1 - origin.z) : (origin.z - z)) / Math.abs(dz) : Infinity;

    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    let guard = 0;

    while (t <= maxDist && guard++ < 512) {
      const b = world.getBlock(x, y, z);
      if (b !== 0 && !MC.BLOCKS[b].liquid) {
        return { x: x, y: y, z: z, block: b, nx: nx, ny: ny, nz: nz, distance: t };
      }
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) {
        t = tMaxX; x += stepX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY <= tMaxZ) {
        t = tMaxY; y += stepY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        t = tMaxZ; z += stepZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  MC.Player = Player;
  MC.raycastVoxel = raycastVoxel;
})();
