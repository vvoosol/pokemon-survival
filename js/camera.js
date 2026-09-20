window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.Camera = class Camera {
  constructor(width, height, world) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.world = world;
  }

  follow(target, dt) {
    const desiredX = target.x - this.width / 2;
    const desiredY = target.y - this.height / 2;
    const t = 1 - Math.pow(0.001, dt);
    this.x += (desiredX - this.x) * t;
    this.y += (desiredY - this.y) * t;
    this.clamp();
  }

  clamp() {
    this.x = this.world.width <= this.width
      ? (this.world.width - this.width) / 2
      : Math.max(0, Math.min(this.world.width - this.width, this.x));
    this.y = Math.max(0, Math.min(this.world.height - this.height, this.y));
  }
};
