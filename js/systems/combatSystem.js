window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.CombatSystem = class CombatSystem {
  constructor(statSystem, assets) {
    this.statSystem = statSystem;
    this.assets = assets;
    this.hitboxes = [];
    this.delayedAttacks = [];
    this.damageNumbers = [];
    this.levelToastTime = 0;
    this.onLevelUp = null;
  }

  update(dt, player, enemies) {
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
    this.tryPlayerAutoAttack(player, enemies);
  }

  tryPlayerAutoAttack(player, enemies) {
    const move = this.effectiveMove(player, player.moveId);
    if (!move || player.attackCooldown > 0) return;
    const hitboxes = this.makePlayerHitboxes(player, move, 0.18);
    const targets = enemies.filter((enemy) => !enemy.dead && this.isInAnyHitbox(enemy, hitboxes));
    if (!targets.length) return;

    const upgradeLevel = player.moveUpgradeLevels[player.moveId] || 0;
    const cooldown = this.statSystem.calculateMoveCooldown(move, player.speed, upgradeLevel);
    player.attackCooldown = cooldown;
    player.attackAnim = 0.18;
    this.hitboxes = hitboxes;
    this.assets.play("tackle", 0.34);

    targets.forEach((enemy) => {
      const damage = this.statSystem.calculateDamage(player, enemy, move);
      const dir = this.normalized(enemy.x - player.x, enemy.y - player.y);
      enemy.takeDamage(damage, dir.x * 12, dir.y * 12);
      this.damageNumbers.push({ x: enemy.x, y: enemy.y - 32, value: damage, life: 0.75, color: "#fff2a8" });
      this.assets.play("hit", 0.32);
      if (enemy.dead) {
        const levelEvents = player.gainExp(enemy.expReward, this.statSystem);
        this.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: `EXP +${enemy.expReward}`, life: 1.0, color: "#9fd4ff" });
        this.assets.play("exp", 0.28);
        if (levelEvents.length) {
          this.levelToastTime = 1.5;
          this.assets.play("level", 0.45);
          if (this.onLevelUp) {
            levelEvents.forEach((event) => this.onLevelUp(event));
          }
        }
      }
    });

    if (upgradeLevel >= 2) {
      const aftershock = this.makeAftershockHitboxes(player, move);
      this.delayedAttacks.push({ timer: 0.18, hitboxes: aftershock, damageMultiplier: 0.6 });
    }
  }

  enemyAttack(enemy, player) {
    if (enemy.dead || player.dead) return;
    const move = window.SurvivorRPG.MoveData.wildBite;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    if (Math.hypot(dx, dy) > enemy.attackRange + player.radius) return;
    const damage = this.statSystem.calculateDamage(enemy, player, move);
    player.takeDamage(damage);
    this.damageNumbers.push({ x: player.x, y: player.y - 42, value: damage, life: 0.75, color: "#ff9d9d" });
    this.assets.play("hit", 0.3);
  }

  effectiveMove(player, moveId) {
    const baseMove = window.SurvivorRPG.MoveData[moveId];
    if (!baseMove) return null;
    const upgradeLevel = player.moveUpgradeLevels[moveId] || 0;
    const move = { ...baseMove };
    if (upgradeLevel >= 1) {
      move.range = Math.round(move.range * 1.2);
      move.width = Math.round(move.width * 1.3);
    }
    return move;
  }

  isInAnyHitbox(enemy, hitboxes) {
    return hitboxes.some((box) => enemy.x >= box.x && enemy.x <= box.x + box.width && enemy.y >= box.y && enemy.y <= box.y + box.height);
  }

  isInPlayerHitbox(player, enemy, move) {
    const box = this.makePlayerHitboxes(player, move, 0)[0];
    return enemy.x >= box.x && enemy.x <= box.x + box.width && enemy.y >= box.y && enemy.y <= box.y + box.height;
  }

  makePlayerHitboxes(player, move, time) {
    const dir = this.attackDirection(player);
    const boxes = [this.makeDirectionalHitbox(player.x, player.y, dir, move, time)];
    const upgradeLevel = player.moveUpgradeLevels[player.moveId] || 0;
    if (upgradeLevel >= 4) {
      const side = { x: -dir.y, y: dir.x };
      const offset = move.width * 0.64;
      boxes.push(this.makeDirectionalHitbox(player.x + side.x * offset, player.y + side.y * offset, dir, move, time));
      boxes.push(this.makeDirectionalHitbox(player.x - side.x * offset, player.y - side.y * offset, dir, move, time));
    }
    return boxes;
  }

  makeDirectionalHitbox(originX, originY, dir, move, time) {
    const halfWidth = move.width / 2;
    const startOffset = 10;
    if (Math.abs(dir.x) > Math.abs(dir.y)) {
      const x = dir.x > 0 ? originX + startOffset : originX - move.range - startOffset;
      return { x, y: originY - halfWidth, width: move.range, height: move.width, time };
    }
    const y = dir.y > 0 ? originY + startOffset : originY - move.range - startOffset;
    return { x: originX - halfWidth, y, width: move.width, height: move.range, time };
  }

  makeAftershockHitboxes(player, move) {
    const dir = this.attackDirection(player);
    const shifted = {
      x: player.x + dir.x * move.range * 0.55,
      y: player.y + dir.y * move.range * 0.55
    };
    const shockMove = { ...move, range: Math.round(move.range * 0.82), width: Math.round(move.width * 0.78) };
    return [this.makeDirectionalHitbox(shifted.x, shifted.y, dir, shockMove, 0.22)];
  }

  resolveDelayedAttack(player, enemies, attack) {
    const move = this.effectiveMove(player, player.moveId);
    const targets = enemies.filter((enemy) => !enemy.dead && this.isInAnyHitbox(enemy, attack.hitboxes));
    this.hitboxes.push(...attack.hitboxes.map((box) => ({ ...box, time: 0.22, aftershock: true })));
    targets.forEach((enemy) => {
      const damage = Math.max(1, Math.floor(this.statSystem.calculateDamage(player, enemy, move) * attack.damageMultiplier));
      const dir = this.normalized(enemy.x - player.x, enemy.y - player.y);
      enemy.takeDamage(damage, dir.x * 9, dir.y * 9);
      this.damageNumbers.push({ x: enemy.x, y: enemy.y - 32, value: damage, life: 0.75, color: "#d8f4ff" });
      this.assets.play("hit", 0.26);
      if (enemy.dead) {
        const levelEvents = player.gainExp(enemy.expReward, this.statSystem);
        this.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: `EXP +${enemy.expReward}`, life: 1.0, color: "#9fd4ff" });
        this.assets.play("exp", 0.28);
        if (levelEvents.length) {
          this.levelToastTime = 1.5;
          this.assets.play("level", 0.45);
          if (this.onLevelUp) {
            levelEvents.forEach((event) => this.onLevelUp(event));
          }
        }
      }
    });
  }

  attackDirection(player) {
    const len = Math.hypot(player.lastMoveVector.x, player.lastMoveVector.y) || 1;
    return { x: player.lastMoveVector.x / len, y: player.lastMoveVector.y / len };
  }

  normalized(x, y) {
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }

  drawEffects(ctx, camera) {
    if (this.hitboxes.length) {
      ctx.save();
      ctx.lineWidth = 3;
      this.hitboxes.forEach((box) => {
        ctx.fillStyle = box.aftershock ? "rgba(145, 225, 255, 0.28)" : "rgba(255, 245, 145, 0.26)";
        ctx.strokeStyle = box.aftershock ? "rgba(180, 240, 255, 0.92)" : "rgba(255, 255, 255, 0.88)";
        ctx.fillRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
        ctx.strokeRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
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
};
