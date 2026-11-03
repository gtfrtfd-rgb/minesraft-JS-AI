/* ============================================================
   mob-ai.js — Мозг и физика мобов.
   Отвечает за: коллизии, гравитацию, прыжки, AI (блуждание, паника),
   анимацию поворота головы и проверку видимости.
   ============================================================ */
window.MOB_AI = (function () {
'use strict';

if (!window.MC) return { update: function(){} };
const MC = window.MC;
const SX = MC.SX, SZ = MC.SZ;
const isSolid = MC.isSolid, highestAt = MC.highestAt;

const GRAVITY = 28;
const JUMP_VELOCITY = 8.6;
const PANIC_DURATION = 4.0;
const PANIC_SPEED_MULT = 1.6;
const LEG_SWING = 0.55;
const VISIBILITY_MARGIN = 1.0;

const HEAD_LOOK_RANGE_SQ = 12 * 12;
const HEAD_MAX_YAW       = 1.15;
const HEAD_MAX_PITCH     = 0.55;
const HEAD_SMOOTH        = 5.5;
const HEAD_BOB_Y         = 0.02;
const HEAD_SWAY          = 0.045;
const JUMP_LEG_POSE      = 0.32;

function mobCollides(px, py, pz, r, h) {
  if (px - r < 0 || px + r > SX) return true;
  if (pz - r < 0 || pz + r > SZ) return true;
  const e = 1e-4;
  const x0 = Math.floor(px - r + e), x1 = Math.floor(px + r - e);
  const y0 = Math.floor(py + e),     y1 = Math.floor(py + h - e);
  const z0 = Math.floor(pz - r + e), z1 = Math.floor(pz + r - e);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++)
        if (isSolid(x, y, z)) return true;
  return false;
}

function canJumpOver(mob, axisX, axisZ) {
  const r = mob.def.r, h = mob.def.h;
  const nx = mob.pos.x + axisX * 1.0;
  const nz = mob.pos.z + axisZ * 1.0;
  if (!mobCollides(nx, mob.pos.y, nz, r, h)) return false;
  if (mobCollides(nx, mob.pos.y + 1.0, nz, r, h)) return false;
  const ix = Math.floor(nx), iz = Math.floor(nz);
  if (ix < 0 || ix >= SX || iz < 0 || iz >= SZ) return false;
  return isSolid(ix, Math.floor(mob.pos.y + 1.0 - 0.01), iz);
}

function tryJump(mob, axisX, axisZ) {
  if (mob.jumpCooldown > 0) return false;
  if (!mob.onGround) return false;
  if (!canJumpOver(mob, axisX, axisZ)) return false;
  mob.vel.y = JUMP_VELOCITY;
  mob.jumpCooldown = 0.4;
  return true;
}

function mobMove(mob, dx, dy, dz) {
  const r = mob.def.r, h = mob.def.h;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.2));
  const sx = dx / steps, sy = dy / steps, sz = dz / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      mob.pos.x += sx;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.x -= sx;
        if (tryJump(mob, Math.sign(sx), 0)) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sz !== 0) {
      mob.pos.z += sz;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.z -= sz;
        if (tryJump(mob, 0, Math.sign(sz))) return;
        if (mob.onGround && mob.vel.y <= 0.01) reactToWall(mob);
      }
    }
    if (sy !== 0) {
      mob.pos.y += sy;
      if (mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) {
        mob.pos.y -= sy;
        if (sy < 0) mob.onGround = true;
        mob.vel.y = 0;
      }
    }
  }
}

function reactToWall(mob) {
  if (mob.avoidCooldown > 0) return;
  const turn = (Math.random() - 0.5) * Math.PI / 2;
  mob.targetYaw = mob.yaw + Math.PI + turn;
  mob.wanderTimer = Math.max(mob.wanderTimer, 0.8 + Math.random() * 0.6);
  mob.walking = true;
  mob.avoidCooldown = 0.4;
}

function unstickMob(mob) {
  const r = mob.def.r, h = mob.def.h;
  if (!mobCollides(mob.pos.x, mob.pos.y, mob.pos.z, r, h)) return;
  for (let k = 1; k <= 14; k++) {
    const ny = mob.pos.y + 0.3 * k;
    if (!mobCollides(mob.pos.x, ny, mob.pos.z, r, h)) {
      mob.pos.y = ny;
      mob.vel.y = 0;
      return;
    }
  }
  const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
  if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) {
    mob.pos.y = highestAt(ix, iz) + 0.5;
    mob.vel.y = 0;
  }
}

function updateMobVisibility(mob, renderDistBlocks, playerPos) {
  if (!playerPos) return;
  const dx = mob.pos.x - playerPos.x;
  const dz = mob.pos.z - playerPos.z;
  const limit = renderDistBlocks + VISIBILITY_MARGIN;
  const visible = (dx * dx + dz * dz) <= limit * limit;
  if (mob.hurtTimer > 0) {
    if (!visible) mob.group.visible = false;
  } else {
    mob.group.visible = visible;
  }
}

function animateHead(mob, dt, playerPos) {
  const hg = mob.headGroup;
  if (!hg) return;

  let targetYaw = 0, targetPitch = 0;
  let playerNearby = false;
  let relYawToPlayer = 0, relPitchToPlayer = 0;

  if (playerPos && !mob.dead) {
    const dx = playerPos.x - mob.pos.x;
    const dz = playerPos.z - mob.pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq < HEAD_LOOK_RANGE_SQ && distSq > 0.25) {
      playerNearby = true;
      const distXZ = Math.sqrt(distSq);
      const playerEyeY = playerPos.y + 1.62;
      const headWorldY = mob.pos.y + mob.def.headPivot[1];
      const dy = playerEyeY - headWorldY;

      const desiredWorldYaw = Math.atan2(-dx, -dz);
      let relYaw = desiredWorldYaw - mob.yaw;
      while (relYaw >  Math.PI) relYaw -= Math.PI * 2;
      while (relYaw < -Math.PI) relYaw += Math.PI * 2;
      relYawToPlayer = Math.max(-HEAD_MAX_YAW, Math.min(HEAD_MAX_YAW, relYaw));

      let relPitch = -Math.atan2(dy, distXZ);
      relPitchToPlayer = Math.max(-HEAD_MAX_PITCH, Math.min(HEAD_MAX_PITCH, relPitch));
    }
  }

  if (mob.panicTimer > 0) {
    mob.headLookAtPlayer = false;
    targetYaw = 0; targetPitch = 0;
  } else if (mob.headLookAtPlayer) {
    mob.headGlanceTimer -= dt;
    if (!playerNearby || mob.headGlanceTimer <= 0) {
      mob.headLookAtPlayer = false;
      mob.headLookTimer = 2 + Math.random() * 5;
      mob.headIdleYaw = (Math.random() - 0.5) * 1.1;
      mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
    } else {
      targetYaw = relYawToPlayer;
      targetPitch = relPitchToPlayer;
    }
  } else {
    mob.headLookTimer -= dt;
    if (mob.headLookTimer <= 0) {
      if (playerNearby && Math.random() < 0.45) {
        mob.headLookAtPlayer = true;
        mob.headGlanceTimer = 1.2 + Math.random() * 2.5;
        targetYaw = relYawToPlayer;
        targetPitch = relPitchToPlayer;
      } else {
        mob.headLookTimer = 2 + Math.random() * 5;
        mob.headIdleYaw = (Math.random() - 0.5) * 1.1;
        mob.headIdlePitch = (Math.random() - 0.5) * 0.35;
        targetYaw = mob.headIdleYaw;
        targetPitch = mob.headIdlePitch;
      }
    } else {
      targetYaw = mob.headIdleYaw;
      targetPitch = mob.headIdlePitch;
    }
  }

  const k = Math.min(1, HEAD_SMOOTH * dt);
  mob.headYaw   += (targetYaw   - mob.headYaw)   * k;
  mob.headPitch += (targetPitch - mob.headPitch) * k;

  let bobY = 0, sway = 0;
  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const ph = mob.walkPhase + mob.headBobPhase;
    bobY = Math.sin(ph * 2) * HEAD_BOB_Y;
    sway = Math.sin(ph) * HEAD_SWAY;
  }

  hg.position.y = mob.def.headPivot[1] + bobY;
  hg.rotation.y = mob.headYaw;
  hg.rotation.x = mob.headPitch;
  hg.rotation.z = sway;
}

function updateMob(mob, dt, env) {
  const def = mob.def;

  if (mob.dead) {
    mob.group.visible = false;
    return;
  }

  unstickMob(mob);

  if (mob.hurtTimer > 0) {
    mob.hurtTimer -= dt;
    mob.group.visible = (Math.floor(mob.hurtTimer * 30) % 2 === 0);
    if (mob.hurtTimer <= 0) mob.group.visible = true;
  }

  if (mob.avoidCooldown > 0) mob.avoidCooldown -= dt;
  if (mob.jumpCooldown > 0)  mob.jumpCooldown  -= dt;

  mob.soundTimer -= dt;
  if (mob.soundTimer <= 0) {
    mob.soundTimer = 8 + Math.random() * 8;
    if (env.playSound) env.playSound(mob);
  }

  if (mob.panicTimer > 0) {
    mob.panicTimer -= dt;
    if (env.playerPos) {
      const dx = mob.pos.x - env.playerPos.x;
      const dz = mob.pos.z - env.playerPos.z;
      mob.targetYaw = Math.atan2(-dx, -dz);
      mob.walking = true;
    }
  } else {
    mob.wanderTimer -= dt;
    if (mob.wanderTimer <= 0) {
      if (mob.walking && Math.random() < 0.45) {
        mob.walking = false;
        mob.wanderTimer = 1.5 + Math.random() * 3;
      } else {
        mob.walking = true;
        mob.targetYaw = Math.random() * Math.PI * 2;
        mob.wanderTimer = 2 + Math.random() * 3;
      }
    }
  }

  let dyaw = mob.targetYaw - mob.yaw;
  while (dyaw >  Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  mob.yaw += dyaw * Math.min(1, 5 * dt);

  const speedMult = mob.panicTimer > 0 ? PANIC_SPEED_MULT : 1.0;
  let vx = 0, vz = 0;
  if (mob.walking) {
    vx = -Math.sin(mob.yaw) * def.speed * speedMult;
    vz = -Math.cos(mob.yaw) * def.speed * speedMult;
  }

  mob.vel.y -= GRAVITY * dt;
  if (mob.vel.y < -30) mob.vel.y = -30;

  const friction = Math.max(0, 1 - 4 * dt);
  mob.vel.x *= friction;
  mob.vel.z *= friction;
  const totalVx = vx + mob.vel.x;
  const totalVz = vz + mob.vel.z;

  mobMove(mob, totalVx * dt, mob.vel.y * dt, totalVz * dt);

  mob.onGround = mobCollides(mob.pos.x, mob.pos.y - 0.05, mob.pos.z, def.r, def.h);
  if (mob.onGround && mob.vel.y < 0) mob.vel.y = 0;

  if (mob.walking && mob.onGround && mob.panicTimer <= 0) {
    const mdx = mob.pos.x - mob.lastX;
    const mdz = mob.pos.z - mob.lastZ;
    const movedSq = mdx * mdx + mdz * mdz;
    const expected = def.speed * dt * 0.1;
    if (movedSq < expected * expected) mob.stuckTimer += dt;
    else mob.stuckTimer = 0;

    if (mob.stuckTimer > 0.6) {
      const turn = (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * Math.PI * 0.5);
      mob.targetYaw = mob.yaw + turn;
      mob.wanderTimer = Math.max(mob.wanderTimer, 1.0 + Math.random() * 1.0);
      mob.stuckTimer = 0;
      mob.avoidCooldown = 0.3;
    }
  } else {
    mob.stuckTimer = 0;
  }
  mob.lastX = mob.pos.x;
  mob.lastZ = mob.pos.z;

  if (!mob.onGround) {
    const rising = mob.vel.y > 0;
    const frontPose = rising ? -JUMP_LEG_POSE : -JUMP_LEG_POSE * 0.4;
    const backPose  = rising ?  JUMP_LEG_POSE :  JUMP_LEG_POSE * 0.4;
    for (let i = 0; i < mob.legs.length; i++) {
      const leg = mob.legs[i];
      const target = leg.front ? frontPose : backPose;
      leg.pivot.rotation.x += (target - leg.pivot.rotation.x) * Math.min(1, 10 * dt);
    }
  } else if (mob.walking) {
    const swing = Math.sin(mob.walkPhase) * LEG_SWING;
    for (let i = 0; i < mob.legs.length; i++) {
      mob.legs[i].pivot.rotation.x = swing * mob.legs[i].dir;
    }
  } else {
    const k = Math.min(1, 8 * dt);
    for (let i = 0; i < mob.legs.length; i++) {
      mob.legs[i].pivot.rotation.x += (0 - mob.legs[i].pivot.rotation.x) * k;
    }
  }

  if (mob.walking && mob.onGround) mob.walkPhase += dt * 8 * speedMult;
  else mob.walkPhase *= 0.85;

  mob.group.position.copy(mob.pos);
  mob.group.rotation.y = mob.yaw;

  animateHead(mob, dt, env.playerPos);
  updateMobVisibility(mob, env.renderDistBlocks, env.playerPos);

  if (mob.pos.y < -10) {
    const ix = Math.floor(mob.pos.x), iz = Math.floor(mob.pos.z);
    if (ix >= 0 && ix < SX && iz >= 0 && iz < SZ) mob.pos.y = highestAt(ix, iz) + 0.5;
    else mob.pos.y = 30;
    mob.vel.set(0, 0, 0);
  }
}

return {
  update: updateMob
};

})();