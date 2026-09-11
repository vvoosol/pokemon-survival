window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.CombatSystem = class CombatSystem {
  constructor(statSystem, assets) {
    this.statSystem = statSystem;
    this.assets = assets;
    this.telegraphs = [];
    this.hitboxes = [];
    this.delayedAttacks = [];
    this.damageNumbers = [];
    this.levelToastTime = 0;
    this.onLevelUp = null;
    this.onEnemyDefeated = null;
  }

  update(dt, player, enemies) {
    this.telegraphs.forEach((telegraph) => {
      telegraph.timer -= dt;
    });
    this.telegraphs
      .filter((telegraph) => telegraph.timer <= 0)
      .forEach((telegraph) => this.resolvePlayerAttack(player, enemies, telegraph));
    this.telegraphs = this.telegraphs.filter((telegraph) => telegraph.timer > 0);
    this.hitboxes.forEach((box) => {
      box.time -= dt;
    });
    this.hitboxes = this.hitboxes.filter((box) => box.time > 0);
    this.delayedAttacks.forEach((attack) => {
      attack.timer -= dt;
    });
    this.delayedAttacks
      .filter((attack) => attack.timer <= 0)
      .forEach((attack) => this.resolveDelayedAttack(player, enemies, attack));
    this.delayedAttacks = this.delayedAttacks.filter((attack) => attack.timer > 0);
    this.damageNumbers.forEach((num) => {
      num.life -= dt;
      num.y -= 38 * dt;
    });
    this.damageNumbers = this.damageNumbers.filter((num) => num.life > 0);
    this.levelToastTime = Math.max(0, this.levelToastTime - dt);
    this.tryPlayerAutoAttacks(player, enemies);
  }

  tryPlayerAutoAttacks(player, enemies) {
    const target = this.nearestEnemy(player, enemies);
    if (!target) return;

    player.equippedMoves.forEach((slot) => {
      const move = this.effectiveMove(player, slot.moveId);
      if (!move || slot.cooldownRemaining > 0) return;
      const upgradeLevel = slot.upgradeLevel || 0;
      const cooldown = this.statSystem.calculateMoveCooldown(move, player.speed, upgradeLevel);
      const direction = this.normalized(target.x - player.x, target.y - player.y);
      const windup = this.windupFor(move);
      const hitboxes = this.makePlayerHitboxes(player, move, 0.18, direction, upgradeLevel);
      player.lastMoveVector = direction;
      slot.cooldownRemaining = cooldown;
      player.syncMoveState?.();
      player.attackAnim = Math.max(player.attackAnim, windup + 0.18);
      this.telegraphs.push({ timer: windup, hitboxes, move, upgradeLevel, direction, moveId: slot.moveId });
      this.assets.play("tackle", 0.22);
    });
  }

  resolvePlayerAttack(player, enemies, attack) {
    const move = attack.move;
    const hitboxes = attack.hitboxes;
    const targets = enemies.filter((enemy) => !enemy.dead && this.isInAnyHitbox(enemy, hitboxes));
    this.hitboxes.push(...hitboxes.map((box) => ({ ...box, time: 0.2 })));
    targets.forEach((enemy) => {
      const breakdown = this.statSystem.calculateDamageBreakdown(player, enemy, move);
      const damage = breakdown.finalDamage;
      const dir = this.normalized(enemy.x - player.x, enemy.y - player.y);
      if (damage > 0) {
        enemy.takeDamage(damage, dir.x * 12, dir.y * 12);
        this.recordParticipant(enemy, player);
      }
      player.lastDamageBreakdown = breakdown;
      this.damageNumbers.push({ x: enemy.x, y: enemy.y - 32, value: damage, life: 0.75, color: this.effectColor(breakdown.type) });
      this.pushEffectText(enemy, breakdown.type);
      this.assets.play("hit", 0.32);
      if (enemy.dead) {
        this.handleEnemyDefeat(enemy);
      }
    });

    if (attack.upgradeLevel >= 2) {
      const aftershock = this.makeAftershockHitboxes(player, move, attack.direction);
      this.delayedAttacks.push({ timer: 0.18, hitboxes: aftershock, damageMultiplier: 0.6, move });
    }
  }

  nearestEnemy(player, enemies) {
    let best = null;
    let bestDistance = Infinity;
    enemies.forEach((enemy) => {
      if (enemy.dead || enemy.state === "captured" || enemy.state === "capture_sequence") return;
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    });
    return best;
  }

  enemyAttack(enemy, player) {
    if (enemy.dead || player.dead) return;
    const moveId = enemy.equippedMoves?.[Math.floor(Math.random() * enemy.equippedMoves.length)] || "wildBite";
    const move = window.SurvivorRPG.MoveData[moveId] || window.SurvivorRPG.MoveData.wildBite;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    if (Math.hypot(dx, dy) > enemy.attackRange + player.radius) return;
    const breakdown = this.statSystem.calculateDamageBreakdown(enemy, player, move);
    const damage = breakdown.finalDamage;
    if (damage > 0) player.takeDamage(damage);
    this.damageNumbers.push({ x: player.x, y: player.y - 42, value: damage, life: 0.75, color: "#ff9d9d" });
    this.assets.play("hit", 0.3);
  }

  effectiveMove(player, moveId) {
    const baseMove = window.SurvivorRPG.MoveData[moveId];
    if (!baseMove) return null;
    const slot = player.equippedMoves?.find((move) => (typeof move === "string" ? move : move.moveId) === moveId);
    const upgradeLevel = slot && typeof slot !== "string" ? (slot.upgradeLevel || 0) : (player.moveUpgradeLevels?.[moveId] || 0);
    const move = { ...baseMove };
    if (upgradeLevel >= 1) {
      move.range = Math.round(move.range * 1.2);
      move.width = Math.round(move.width * 1.3);
    }
    return move;
  }

  isInAnyHitbox(enemy, hitboxes) {
    return hitboxes.some((box) => this.isInHitbox(enemy, box));
  }

  isInHitbox(enemy, box) {
    if (box.dirX === undefined) {
      return enemy.x >= box.x && enemy.x <= box.x + box.width && enemy.y >= box.y && enemy.y <= box.y + box.height;
    }
    const relX = enemy.x - box.startX;
    const relY = enemy.y - box.startY;
    const along = relX * box.dirX + relY * box.dirY;
    const side = relX * -box.dirY + relY * box.dirX;
    return along >= -enemy.radius * 0.35 && along <= box.length + enemy.radius * 0.35 && Math.abs(side) <= box.width / 2 + enemy.radius * 0.35;
  }

  isInPlayerHitbox(player, enemy, move) {
    const box = this.makePlayerHitboxes(player, move, 0)[0];
    return this.isInHitbox(enemy, box);
  }

  makePlayerHitboxes(player, move, time, direction = null, upgradeLevel = 0) {
    const dir = direction || this.attackDirection(player);
    const boxes = [];
    if (move.behavior === "MELEE_AREA") {
      boxes.push({
        x: player.x - move.width / 2,
        y: player.y - move.width / 2,
        width: move.width,
        height: move.width,
        time
      });
    } else if (move.behavior === "AREA_TARGET") {
      const centerDistance = Math.min(move.range, Math.max(70, move.range * 0.78));
      boxes.push({
        x: player.x + dir.x * centerDistance - move.width / 2,
        y: player.y + dir.y * centerDistance - move.width / 2,
        width: move.width,
        height: move.width,
        time
      });
    } else if (move.behavior === "MULTI_PROJECTILE") {
      boxes.push(this.makeDirectionalHitbox(player.x, player.y, dir, move, time));
      const spread = 0.24;
      boxes.push(this.makeDirectionalHitbox(player.x, player.y, this.rotate(dir, spread), move, time));
      boxes.push(this.makeDirectionalHitbox(player.x, player.y, this.rotate(dir, -spread), move, time));
    } else {
      boxes.push(this.makeDirectionalHitbox(player.x, player.y, dir, move, time));
    }
    if (upgradeLevel >= 4) {
      const side = { x: -dir.y, y: dir.x };
      const offset = move.width * 0.64;
      boxes.push(this.makeDirectionalHitbox(player.x + side.x * offset, player.y + side.y * offset, dir, move, time));
      boxes.push(this.makeDirectionalHitbox(player.x - side.x * offset, player.y - side.y * offset, dir, move, time));
    }
    return boxes;
  }

  makeDirectionalHitbox(originX, originY, dir, move, time) {
    const startOffset = 10;
    return {
      startX: originX + dir.x * startOffset,
      startY: originY + dir.y * startOffset,
      dirX: dir.x,
      dirY: dir.y,
      length: move.range,
      width: move.width,
      time
    };
  }

  makeAftershockHitboxes(player, move, direction = null) {
    const dir = direction || this.attackDirection(player);
    const shifted = {
      x: player.x + dir.x * move.range * 0.55,
      y: player.y + dir.y * move.range * 0.55
    };
    const shockMove = { ...move, range: Math.round(move.range * 0.82), width: Math.round(move.width * 0.78) };
    return [this.makeDirectionalHitbox(shifted.x, shifted.y, dir, shockMove, 0.22)];
  }

  resolveDelayedAttack(player, enemies, attack) {
    const move = attack.move || this.effectiveMove(player, player.moveId);
    const targets = enemies.filter((enemy) => !enemy.dead && this.isInAnyHitbox(enemy, attack.hitboxes));
    this.hitboxes.push(...attack.hitboxes.map((box) => ({ ...box, time: 0.22, aftershock: true })));
    targets.forEach((enemy) => {
      const breakdown = this.statSystem.calculateDamageBreakdown(player, enemy, move);
      const damage = breakdown.finalDamage <= 0 ? 0 : Math.max(1, Math.floor(breakdown.finalDamage * attack.damageMultiplier));
      const dir = this.normalized(enemy.x - player.x, enemy.y - player.y);
      if (damage > 0) {
        enemy.takeDamage(damage, dir.x * 9, dir.y * 9);
        this.recordParticipant(enemy, player);
      }
      player.lastDamageBreakdown = { ...breakdown, finalDamage: damage };
      this.damageNumbers.push({ x: enemy.x, y: enemy.y - 32, value: damage, life: 0.75, color: "#d8f4ff" });
      this.pushEffectText(enemy, breakdown.type);
      this.assets.play("hit", 0.26);
      if (enemy.dead) {
        this.handleEnemyDefeat(enemy);
      }
    });
  }

  recordParticipant(enemy, player) {
    if (!enemy.participants) enemy.participants = new Set();
    if (player.uniqueId) enemy.participants.add(player.uniqueId);
  }

  handleEnemyDefeat(enemy) {
    if (this.onEnemyDefeated) {
      this.onEnemyDefeated(enemy);
      return;
    }
    this.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: `EXP +${enemy.expReward}`, life: 1.0, color: "#9fd4ff" });
    this.assets.play("exp", 0.28);
  }

  attackDirection(player) {
    const len = Math.hypot(player.lastMoveVector.x, player.lastMoveVector.y) || 1;
    return { x: player.lastMoveVector.x / len, y: player.lastMoveVector.y / len };
  }

  normalized(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  effectColor(multiplier) {
    if (multiplier === 0) return "#d0d0d0";
    if (multiplier >= 2) return "#ffde72";
    if (multiplier < 1) return "#a9c7ff";
    return "#fff2a8";
  }

  pushEffectText(target, multiplier) {
    let value = "";
    if (multiplier === 0) value = "효과가 없다";
    else if (multiplier >= 2) value = "효과가 굉장했다";
    else if (multiplier < 1) value = "효과가 별로다";
    if (!value) return;
    this.damageNumbers.push({ x: target.x, y: target.y - 54, value, life: 0.9, color: this.effectColor(multiplier) });
  }

  rotate(dir, radians) {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return { x: dir.x * c - dir.y * s, y: dir.x * s + dir.y * c };
  }

  windupFor(move) {
    if (move.behavior === "AREA_TARGET") return 0.28;
    if (move.behavior === "BEAM") return 0.18;
    if (move.behavior === "MULTI_PROJECTILE") return 0.2;
    return 0.16;
  }

  drawEffects(ctx, camera) {
    if (this.telegraphs.length) {
      ctx.save();
      ctx.lineWidth = 3;
      this.telegraphs.forEach((telegraph) => {
        const pulse = 0.58 + Math.sin(telegraph.timer * 48) * 0.18;
        telegraph.hitboxes.forEach((box) => {
          this.drawHitboxShape(ctx, camera, box, `rgba(255, 222, 72, ${0.16 * pulse})`, `rgba(255, 247, 156, ${0.78 * pulse})`);
        });
      });
      ctx.restore();
    }

    if (this.hitboxes.length) {
      ctx.save();
      ctx.lineWidth = 3;
      this.hitboxes.forEach((box) => {
        ctx.fillStyle = box.aftershock ? "rgba(145, 225, 255, 0.28)" : "rgba(255, 245, 145, 0.26)";
        ctx.strokeStyle = box.aftershock ? "rgba(180, 240, 255, 0.92)" : "rgba(255, 255, 255, 0.88)";
        this.drawHitboxShape(ctx, camera, box, ctx.fillStyle, ctx.strokeStyle);
      });
      ctx.restore();
    }

    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "bold 20px Segoe UI, Arial";
    this.damageNumbers.forEach((num) => {
      ctx.globalAlpha = Math.min(1, num.life * 1.4);
      ctx.fillStyle = num.color;
      ctx.strokeStyle = "#202020";
      ctx.lineWidth = 4;
      ctx.strokeText(String(num.value), num.x - camera.x, num.y - camera.y);
      ctx.fillText(String(num.value), num.x - camera.x, num.y - camera.y);
    });
    ctx.restore();
  }

  drawHitboxShape(ctx, camera, box, fillStyle, strokeStyle) {
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    if (box.dirX === undefined) {
      ctx.fillRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
      ctx.strokeRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
      return;
    }

    const half = box.width / 2;
    const px = -box.dirY;
    const py = box.dirX;
    const ax = box.startX + px * half - camera.x;
    const ay = box.startY + py * half - camera.y;
    const bx = box.startX - px * half - camera.x;
    const by = box.startY - py * half - camera.y;
    const endX = box.startX + box.dirX * box.length;
    const endY = box.startY + box.dirY * box.length;
    const cx = endX - px * half - camera.x;
    const cy = endY - py * half - camera.y;
    const dx = endX + px * half - camera.x;
    const dy = endY + py * half - camera.y;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.lineTo(dx, dy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(box.startX - camera.x, box.startY - camera.y);
    ctx.lineTo(endX - camera.x, endY - camera.y);
    ctx.stroke();
  }
};
