window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.WildPokemon = class WildPokemon extends window.SurvivorRPG.Entity {
  constructor(data, x, y, spawnZoneId) {
    super(data, x, y);
    this.spawnZoneId = spawnZoneId;
    this.originX = x;
    this.originY = y;
    this.aggroRadius = data.aggroRadius;
    this.attackRange = data.attackRange;
    this.attackCooldown = Math.random() * 1.2;
    this.expReward = data.expReward;
    this.equippedMoves = (data.learnset || [])
      .filter((entry) => entry.level <= this.level)
      .map((entry) => entry.moveId)
      .filter((moveId) => {
        const move = window.SurvivorRPG.MoveData[moveId];
        return move && move.power > 0;
      })
      .filter((moveId, index, list) => list.indexOf(moveId) === index)
      .slice(-2);
    if (!this.equippedMoves.length) this.equippedMoves = [data.wildMove || "wildBite"];
    this.state = "idle";
    this.roamTimer = 0.5 + Math.random() * 1.8;
    this.roamVector = { x: 0, y: 0 };
    this.alertTime = 0;
    this.windup = 0;
    this.participants = new Set();
  }

  takeDamage(amount, knockbackX = 0, knockbackY = 0) {
    super.takeDamage(amount, knockbackX, knockbackY);
    if (this.dead) this.state = "fainted";
  }

  update(dt, player, movementSystem, combatSystem, world, options = {}) {
    if (this.dead) return;
    if (this.state === "capture_ready" || this.state === "capture_sequence" || options.passive) {
      this.updatePassive(dt, movementSystem, world);
      return;
    }
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const distance = Math.hypot(dx, dy);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (distance <= this.aggroRadius) {
      if (this.state !== "aggro" && this.state !== "attack") {
        this.alertTime = 0.75;
      }
      this.state = distance <= this.attackRange ? "attack" : "aggro";
    } else if (distance > this.aggroRadius * 1.35) {
      this.state = "idle";
    }

    if (this.state === "aggro") {
      movementSystem.moveToward(this, player.x, player.y, dt, world);
      this.windup = 0;
    } else if (this.state === "attack") {
      this.vx = 0;
      this.vy = 0;
      if (this.attackCooldown <= 0 && this.windup <= 0) {
        this.windup = 0.42;
      }
      if (this.windup > 0) {
        this.windup -= dt;
        if (this.windup <= 0) {
          combatSystem.enemyAttack(this, player);
          this.attackCooldown = this.data.attackCooldown;
        }
      }
    } else {
      this.roam(dt, movementSystem, world);
    }

    this.alertTime = Math.max(0, this.alertTime - dt);
    this.updateBase(dt);
  }

  updatePassive(dt, movementSystem, world) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.windup = 0;
    if (this.state === "capture_ready" || this.state === "capture_sequence") {
      this.vx = 0;
      this.vy = 0;
      this.updateBase(dt);
      return;
    }
    this.roam(dt, movementSystem, world);
    this.alertTime = Math.max(0, this.alertTime - dt);
    this.updateBase(dt);
  }

  setCaptureReady() {
    if (this.dead) return;
    this.state = "capture_ready";
    this.windup = 0;
    this.vx = 0;
    this.vy = 0;
  }

  resumeWild() {
    if (this.dead || this.state === "captured") return;
    this.state = "idle";
    this.windup = 0;
  }

  roam(dt, movementSystem, world) {
    this.roamTimer -= dt;
    if (this.roamTimer <= 0) {
      this.roamTimer = 0.8 + Math.random() * 2.2;
      const angle = Math.random() * Math.PI * 2;
      const moving = Math.random() > 0.35;
      this.roamVector.x = moving ? Math.cos(angle) * 0.45 : 0;
      this.roamVector.y = moving ? Math.sin(angle) * 0.45 : 0;
    }
    movementSystem.move(this, this.roamVector.x, this.roamVector.y, dt, world);
    if (Math.hypot(this.x - this.originX, this.y - this.originY) > 180) {
      movementSystem.moveToward(this, this.originX, this.originY, dt, world, 0.45);
    }
  }

  drawOverhead(ctx, camera) {
    const screenX = this.x - camera.x;
    const screenY = this.y - camera.y - this.drawSize * 0.58;
    if (this.alertTime > 0) {
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#202020";
      ctx.lineWidth = 4;
      ctx.font = "bold 26px Segoe UI, Arial";
      ctx.textAlign = "center";
      ctx.strokeText("!", screenX, screenY);
      ctx.fillText("!", screenX, screenY);
      ctx.restore();
    }
    if (this.state === "capture_ready") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 245, 150, 0.92)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(screenX, this.y - camera.y + this.radius * 0.8, this.radius * 1.15, this.radius * 0.44, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.windup > 0) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 225, 75, 0.9)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screenX, this.y - camera.y, this.attackRange, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
};
