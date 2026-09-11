window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.Trainer = class Trainer extends window.SurvivorRPG.Entity {
  constructor(data, x, y) {
    super(data, x, y);
    this.spriteKey = "trainer";
  }

  update(dt, input, movementSystem, world) {
    const vector = input.movementVector();
    movementSystem.move(this, vector.x, vector.y, dt, world);
    this.updateBase(dt);
  }
};
