window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.MovementSystem = class MovementSystem {
  move(entity, x, y, dt, world, speedFactor = 1) {
    const length = Math.hypot(x, y);
    let nx = x;
    let ny = y;
    if (length > 1) {
      nx /= length;
      ny /= length;
    }
    const speed = entity.movementSpeed * speedFactor;
    entity.vx = nx;
    entity.vy = ny;
    entity.x = Math.max(entity.radius, Math.min(world.width - entity.radius, entity.x + nx * speed * dt));
    entity.y = Math.max(entity.radius, Math.min(world.height - entity.radius, entity.y + ny * speed * dt));
  }

  moveToward(entity, tx, ty, dt, world, speedFactor = 1) {
    const dx = tx - entity.x;
    const dy = ty - entity.y;
    const len = Math.hypot(dx, dy) || 1;
    this.move(entity, dx / len, dy / len, dt, world, speedFactor);
  }
};
