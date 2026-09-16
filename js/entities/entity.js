window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.Entity = class Entity {
  constructor(data, x, y) {
    this.data = data;
    this.id = data.id;
    this.name = data.name;
    this.level = data.level;
    this.types = [...data.types];
    this.maxHp = data.maxHp;
    this.hp = data.hp;
    this.attack = data.attack;
    this.defense = data.defense;
    this.specialAttack = data.specialAttack;
    this.specialDefense = data.specialDefense;
    this.speed = data.speed;
    this.movementSpeed = data.movementSpeed;
    this.spriteKey = data.id;
    this.frameSize = data.frameSize || 64;
    this.scale = data.scale || 1;
    this.radius = data.radius || 22;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.direction = "down";
    this.animTime = 0;
    this.hitFlash = 0;
    this.dead = false;
    this.damageOffsetX = 0;
    this.damageOffsetY = 0;
  }

  get drawSize() {
    return this.frameSize * this.scale;
  }

  takeDamage(amount, knockbackX = 0, knockbackY = 0) {
    this.hp = Math.max(0, this.hp - amount);
    this.hitFlash = 0.18;
    this.damageOffsetX = knockbackX;
    this.damageOffsetY = knockbackY;
    if (this.hp <= 0) this.dead = true;
  }

  updateBase(dt) {
    const moving = Math.hypot(this.vx, this.vy) > 0.01;
    if (moving) {
      this.animTime += dt * 8;
      if (Math.abs(this.vx) > Math.abs(this.vy)) {
        this.direction = this.vx > 0 ? "right" : "left";
      } else {
        this.direction = this.vy > 0 ? "down" : "up";
      }
    } else {
      this.animTime = 0;
    }
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.damageOffsetX *= Math.pow(0.002, dt);
    this.damageOffsetY *= Math.pow(0.002, dt);
  }

  draw(ctx, camera, assets, pose = null) {
    const img = assets.image(this.spriteKey);
    if (!img) return;
    const facing = pose ? (Math.abs(pose.direction.x) > Math.abs(pose.direction.y)
      ? (pose.direction.x > 0 ? 'right' : 'left') : (pose.direction.y > 0 ? 'down' : 'up')) : this.direction;
    const row = { down: 0, left: 1, right: 2, up: 3 }[facing] || 0;
    const col = Math.floor(this.animTime) % 4;
    const size = this.drawSize;
    const screenX = Math.round(this.x - camera.x - size / 2 + this.damageOffsetX);
    const screenY = Math.round(this.y - camera.y - size / 2 + this.damageOffsetY);

    ctx.save();
    if (pose) {
      const centerX = this.x - camera.x, centerY = this.y - camera.y;
      ctx.translate(centerX + pose.direction.x * pose.offset, centerY + pose.direction.y * pose.offset);
      ctx.scale(1 / pose.squash, pose.squash);
      ctx.translate(-centerX, -centerY);
      ctx.filter = `brightness(${pose.brightness})`;
    }
    if (this.hitFlash > 0) {
      ctx.filter = "brightness(2.6)";
    }
    ctx.drawImage(
      img,
      col * this.frameSize,
      row * this.frameSize,
      this.frameSize,
      this.frameSize,
      screenX,
      screenY,
      size,
      size
    );
    ctx.restore();
  }
};
