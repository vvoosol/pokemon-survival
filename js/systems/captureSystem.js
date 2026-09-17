window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.CaptureSystem = class CaptureSystem {
  constructor() {
    this.captureRange = 190;
  }

  nearestTarget(trainer, enemies) {
    if(this.lockedTarget && enemies.includes(this.lockedTarget) && this.canAttempt(trainer,this.lockedTarget))return this.lockedTarget;
    this.lockedTarget=null;
    let best = null;
    let bestDistance = Infinity;
    enemies.forEach((enemy) => {
      if (!this.canAttempt(trainer, enemy)) return;
      const distance = Math.hypot(enemy.x - trainer.x, enemy.y - trainer.y);
      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    });
    return best;
  }

  cycleTarget(trainer,enemies,current) {
    const list=enemies.filter(e=>this.canAttempt(trainer,e)).sort((a,b)=>Math.hypot(a.x-trainer.x,a.y-trainer.y)-Math.hypot(b.x-trainer.x,b.y-trainer.y));
    this.lockedTarget=list[(list.indexOf(current)+1)%list.length] || null;
    return this.lockedTarget;
  }

  canAttempt(trainer, wildPokemon) {
    if (!wildPokemon || wildPokemon.dead || wildPokemon.state === "captured" || wildPokemon.state === "capture_sequence") return false;
    return Math.hypot(wildPokemon.x - trainer.x, wildPokemon.y - trainer.y) <= this.captureRange;
  }

  calculateCaptureChance(wildPokemon, ball) {
    const hpRatio = Math.max(0.01, Math.min(1, wildPokemon.hp / wildPokemon.maxHp));
    const catchRate = Math.max(1, wildPokemon.data.catchRate || 120);
    const ballModifier = ball.catchModifier || 1;
    const speciesFactor = catchRate / 255;
    const hpFactor = 0.22 + (1 - hpRatio) * 0.68;
    return Math.max(0.03, Math.min(0.95, speciesFactor * ballModifier * hpFactor + (wildPokemon.captureFailures || 0)*.06));
  }

  tryCapture(wildPokemon, ball) {
    const chance = this.calculateCaptureChance(wildPokemon, ball);
    return {
      chance,
      success: Math.random() < chance
    };
  }

  simulate(wildPokemon, ball, iterations = 1000) {
    let wins = 0;
    const chance = this.calculateCaptureChance(wildPokemon, ball);
    for (let i = 0; i < iterations; i += 1) {
      if (Math.random() < chance) wins += 1;
    }
    return { iterations, wins, rate: wins / iterations, chance };
  }
};
