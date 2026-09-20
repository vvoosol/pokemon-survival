window.SurvivorRPG = window.SurvivorRPG || {};

(() => {
  const R = window.SurvivorRPG;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const living = (pokemon) => !!pokemon && !pokemon.dead && pokemon.hp > 0;

  class PokemonAI {
    constructor(game) {
      this.game = game;
    }

    moveIds(pokemon) {
      return (pokemon?.equippedMoves || []).map((slot) => typeof slot === 'string' ? slot : slot.moveId).filter(Boolean);
    }

    moves(pokemon) {
      return this.moveIds(pokemon).map((id) => R.MoveData[id]).filter((move) => move?.power > 0);
    }

    inferRole(pokemon) {
      const moves = this.moves(pokemon);
      if (!moves.length) return { role: 'MIXED', preferredRange: 84, maxRange: 96 };
      let melee = 0, ranged = 0;
      for (const move of moves) {
        const behavior = move.behavior || '';
        if (behavior.startsWith('MELEE') || (move.range || 0) <= 88) melee += 1;
        if (['PROJECTILE', 'MULTI_PROJECTILE', 'BEAM', 'AREA_TARGET'].includes(behavior) || (move.range || 0) >= 128) ranged += 1;
      }
      const maxRange = Math.max(...moves.map((move) => move.range || 72));
      const minRange = Math.min(...moves.map((move) => move.range || 72));
      const role = melee >= Math.ceil(moves.length * .7) ? 'MELEE'
        : ranged >= Math.ceil(moves.length * .7) ? 'RANGED' : 'MIXED';
      const preferredRange = role === 'MELEE' ? clamp(minRange * .55, 38, 72)
        : role === 'RANGED' ? clamp(maxRange * .7, 105, 220)
        : clamp((minRange + maxRange) * .35, 68, 135);
      return { role, preferredRange, maxRange };
    }

    formationOffset(index, count, side = 1) {
      if (count <= 1) return { x: 0, y: 0 };
      const column = Math.floor(index / 2) + 1;
      const lane = index % 2 === 0 ? -1 : 1;
      return { x: -side * column * 48, y: lane * (34 + column * 13) };
    }

    choosePlayerTarget(pokemon, opponents, leaderTarget = null) {
      const candidates = opponents.filter(living);
      if (!candidates.length) return null;
      if (leaderTarget && living(leaderTarget)) return leaderTarget;
      const moves = this.moves(pokemon);
      return candidates.reduce((best, target) => {
        const distance = Math.hypot(target.x - pokemon.x, target.y - pokemon.y);
        const type = moves.reduce((score, move) => Math.max(score,
          R.DataAdapter?.typeMultiplier(move.type, target.types || []) ?? 1), 1);
        const hp = 1 - target.hp / Math.max(1, target.maxHp);
        const score = type * 34 + hp * 18 + Math.max(0, 24 - distance / 18);
        return !best || score > best.score ? { target, score } : best;
      }, null)?.target || candidates[0];
    }

    updatePlayerCompanion(pokemon, index, active, opponents, leader, dt) {
      const role = this.inferRole(pokemon);
      pokemon.trainerBattleState = 'companion';
      pokemon.trainerBattleRole = role.role;
      pokemon.trainerBattlePreferredRange = role.preferredRange;
      const target = this.choosePlayerTarget(pokemon, opponents, leader?.aiTarget);
      pokemon.aiTarget = target;
      const offset = this.formationOffset(index, active.length, 1);
      let point = { x: leader.x + offset.x, y: leader.y + offset.y };
      if (target) {
        const dx = pokemon.x - target.x, dy = pokemon.y - target.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const spread = (index % 3 - 1) * 26;
        point = {
          x: target.x + dx / distance * role.preferredRange - dy / distance * spread,
          y: target.y + dy / distance * role.preferredRange + dx / distance * spread
        };
      }
      this.movePlayerPokemon(pokemon, point, dt);
    }

    updateOpponent(pokemon, target, index, activeCount, dt) {
      const role = this.inferRole(pokemon);
      pokemon.trainerBattleState = 'opponent';
      pokemon.trainerBattleRole = role.role;
      pokemon.trainerBattlePreferredRange = role.preferredRange;
      pokemon.aiTarget = target;
      pokemon.attackCooldown = Math.max(0, (pokemon.attackCooldown || 0) - dt);
      pokemon.recovery = Math.max(0, (pokemon.recovery || 0) - dt);
      if (!target || !living(target)) return;
      const dx = pokemon.x - target.x, dy = pokemon.y - target.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const spread = (index - (activeCount - 1) / 2) * 24;
      const desired = {
        x: target.x + dx / distance * role.preferredRange - dy / distance * spread,
        y: target.y + dy / distance * role.preferredRange + dx / distance * spread
      };
      const tolerance = role.role === 'MELEE' ? 18 : 30;
      if (Math.abs(distance - role.preferredRange) > tolerance) this.moveEntity(pokemon, desired, dt);
      else pokemon.updateBase?.(dt);

      const usableRange = Math.max(70, role.maxRange * .92);
      if (distance <= usableRange && pokemon.attackCooldown <= 0 && pokemon.recovery <= 0 && !this.game.combatSystem.isActing(pokemon)) {
        const windup = this.game.combatSystem.enemyAttack(pokemon, target);
        if (windup) pokemon.attackCooldown = Math.max(.55, windup + .25);
      }
    }

    movePlayerPokemon(pokemon, point, dt) {
      const dx = point.x - pokemon.x, dy = point.y - pokemon.y;
      const distance = Math.hypot(dx, dy);
      const vector = distance > 7 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      pokemon.update(dt, { movementVector: () => vector }, this.game.movementSystem, this.game.map);
      this.clampToArena(pokemon);
    }

    moveEntity(entity, point, dt) {
      const dx = point.x - entity.x, dy = point.y - entity.y;
      const distance = Math.hypot(dx, dy);
      const vector = distance > 6 ? { x: dx / distance, y: dy / distance } : { x: 0, y: 0 };
      this.game.movementSystem.move(entity, vector.x, vector.y, dt, this.game.map);
      if (Math.hypot(vector.x, vector.y) > .1) entity.lastMoveVector = vector;
      entity.updateBase?.(dt);
      this.clampToArena(entity);
    }

    clampToArena(entity) {
      const radius = entity.radius || 10;
      const width = this.game.map?.width || 1024, height = this.game.map?.height || 768;
      entity.x = clamp(entity.x, 54 + radius, width - 54 - radius);
      entity.y = clamp(entity.y, 78 + radius, height - 78 - radius);
    }
  }

  class TrainerAI {
    constructor(game, engine, profile = {}) {
      this.game = game;
      this.engine = engine;
      const presets = {
        normal: { name: 'normal' },
        strong: { name: 'strong', typeWeight: 48, threatWeight: 32, currentTargetBonus: 18,
          targetLockDuration: 1.35, retargetMargin: 15, switchHpRatio: .32, switchCooldown: 2.6 }
      };
      if (typeof profile === 'string') profile = presets[profile] || presets.normal;
      this.profile = {
        name: profile.name || 'balanced',
        typeWeight: profile.typeWeight ?? 36,
        distanceWeight: profile.distanceWeight ?? 20,
        lowHpWeight: profile.lowHpWeight ?? 18,
        threatWeight: profile.threatWeight ?? 26,
        currentTargetBonus: profile.currentTargetBonus ?? 14,
        targetLockDuration: profile.targetLockDuration ?? 1.1,
        retargetMargin: profile.retargetMargin ?? 12,
        switchHpRatio: profile.switchHpRatio ?? .24,
        switchCooldown: profile.switchCooldown ?? 3.2
      };
      this.threat = new Map();
      this.switchCooldown = 0;
      this.switchThink = 0;
    }

    recordThreat(source, damage) {
      if (!source?.uniqueId || damage <= 0) return;
      this.threat.set(source.uniqueId, (this.threat.get(source.uniqueId) || 0) + damage);
    }

    update(dt, attackers, targets) {
      this.switchCooldown = Math.max(0, this.switchCooldown - dt);
      this.switchThink = Math.max(0, this.switchThink - dt);
      for (const [id, value] of this.threat) {
        const next = value * Math.pow(.86, dt);
        if (next < .5) this.threat.delete(id); else this.threat.set(id, next);
      }
      attackers.forEach((attacker) => this.assignTarget(attacker, targets, dt));
      if (this.switchThink <= 0) {
        this.switchThink = .45;
        this.considerSwitch(attackers, targets);
      }
    }

    moveIds(pokemon) {
      return (pokemon?.equippedMoves || []).map((slot) => typeof slot === 'string' ? slot : slot.moveId).filter(Boolean);
    }

    bestTypeMultiplier(attacker, target) {
      let best = .5;
      for (const id of this.moveIds(attacker)) {
        const move = R.MoveData[id];
        if (!move?.power) continue;
        const multiplier = R.DataAdapter?.typeMultiplier(move.type, target.types || []) ?? 1;
        best = Math.max(best, multiplier);
      }
      return best;
    }

    targetScore(attacker, target, current = false) {
      const p = this.profile;
      const type = this.bestTypeMultiplier(attacker, target);
      const distance = Math.hypot(target.x - attacker.x, target.y - attacker.y);
      const hpRatio = target.hp / Math.max(1, target.maxHp);
      const threat = this.threat.get(target.uniqueId) || 0;
      return (type - .5) * p.typeWeight
        + Math.max(0, 1 - distance / 650) * p.distanceWeight
        + (1 - hpRatio) * p.lowHpWeight
        + Math.min(1, threat / Math.max(1, target.maxHp * .8)) * p.threatWeight
        + (current ? p.currentTargetBonus : 0);
    }

    assignTarget(attacker, targets, dt) {
      const candidates = targets.filter(living);
      if (!candidates.length) { attacker.aiTarget = null; return; }
      attacker.trainerTargetLock = Math.max(0, (attacker.trainerTargetLock || 0) - dt);
      const current = living(attacker.aiTarget) ? attacker.aiTarget : null;
      const ranked = candidates.map((target) => ({ target, score: this.targetScore(attacker, target, target === current) }))
        .sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const currentScore = current ? this.targetScore(attacker, current, true) : -Infinity;
      if (current && attacker.trainerTargetLock > 0 && best.target !== current && best.score < currentScore + this.profile.retargetMargin) return;
      if (!current || best.target !== current) attacker.trainerTargetLock = this.profile.targetLockDuration;
      attacker.aiTarget = best.target;
      attacker.trainerTargetScore = best.score;
    }

    considerSwitch(attackers, targets) {
      if (this.switchCooldown > 0 || !attackers.length || !targets.some(living)) return;
      const reserves = this.engine.opponentReserves();
      if (!reserves.length) return;
      const candidate = attackers.map((pokemon, index) => {
        const target = living(pokemon.aiTarget) ? pokemon.aiTarget : targets.find(living);
        const currentMatch = target ? this.bestTypeMultiplier(pokemon, target) : 1;
        const hpRatio = pokemon.hp / Math.max(1, pokemon.maxHp);
        const bestReserve = target ? reserves.reduce((best, reserve) => {
          const score = this.bestTypeMultiplier(reserve, target) + reserve.hp / Math.max(1, reserve.maxHp) * .25;
          return !best || score > best.score ? { reserve, score } : best;
        }, null) : null;
        const pressure = (this.profile.switchHpRatio - hpRatio) * 2.2 + (1 - currentMatch) * .55;
        const gain = bestReserve ? bestReserve.score - currentMatch : 0;
        const score = pressure + gain;
        pokemon.trainerSwitchScore = score;
        return { pokemon, index, reserve: bestReserve?.reserve, score };
      }).filter((item) => item.reserve).sort((a, b) => b.score - a.score)[0];
      if (!candidate || candidate.score < .62) return;
      if (this.engine.switchOpponent(candidate.index, candidate.reserve)) this.switchCooldown = this.profile.switchCooldown;
    }
  }

  class TrainerBattleEngine {
    constructor(game, options = {}) {
      this.game = game;
      this.playerParty = (options.playerParty || game.partyPokemon || []).filter(Boolean);
      this.opponentParty = (options.opponentParty || []).filter(Boolean);
      this.maxActiveCount = clamp(Number(options.maxActiveCount) || 1, 1, 6);
      this.opponentMaxActiveCount = clamp(Number(options.opponentMaxActiveCount) || this.maxActiveCount, 1, 6);
      this.switchCooldownSeconds = clamp(Number(options.switchCooldown) || 3, 1, 8);
      this.phase = 'intro';
      this.playerActive = [];
      this.opponentActive = [];
      this.leader = null;
      this.playerSwitchCooldown = 0;
      this.tacticalMenuOpen = false;
      this.pokemonAI = new PokemonAI(game);
      this.trainerAI = new TrainerAI(game, this, options.aiProfile || {});
    }

    begin() {
      this.phase = 'active';
      this.game.partyBattle?.clear();
      for (const pokemon of this.playerParty) pokemon.inField = false;
      for (const pokemon of this.opponentParty) pokemon.inField = false;
      this.refillPlayer();
      this.refillOpponent();
      this.leader = this.playerActive[0] || null;
      this.syncLeader();
      this.syncGameEnemies();
      return !!this.leader && this.opponentActive.length > 0;
    }

    update(dt) {
      if (['levelChoice', 'moveLearn'].includes(this.game.mode)) return this.phase;
      this.consumeDisabledWorldInput();
      if (this.phase === 'win' || this.phase === 'lose') return this.phase;
      if (this.phase === 'paused') {
        if (this.game.input.consumeMenu()) this.phase = 'active';
        return this.phase;
      }
      if (this.phase !== 'active') return this.phase;
      if (this.game.input.consumeMenu()) { this.phase = 'paused'; this.game.message('트레이너 배틀 일시정지', 1.2); return this.phase; }

      const leaderPressed = this.game.input.consumeLeader?.() || false;
      const tacticalPressed = this.game.input.consumeTactical?.() || false;
      const partyPressed = this.game.input.consumeParty();
      this.game.input.consumeBall();
      if (leaderPressed) this.cycleLeader();
      if (tacticalPressed || partyPressed) this.openTacticalMenu();

      this.playerSwitchCooldown = Math.max(0, this.playerSwitchCooldown - dt);
      this.cleanupAndRefill();
      if (!this.hasLiving(this.playerParty)) return this.setResult('lose');
      if (!this.hasLiving(this.opponentParty)) return this.setResult('win');
      if (!this.leader || !living(this.leader)) { this.leader = this.playerActive.find(living) || null; this.syncLeader(); }
      if (!this.leader) return this.setResult('lose');

      this.trainerAI.update(dt, this.opponentActive, this.playerActive);
      this.assignPlayerTargets();

      this.leader.update(dt, this.game.input, this.game.movementSystem, this.game.map);
      this.leader.trainerBattleState = 'leader';
      this.pokemonAI.clampToArena(this.leader);
      this.playerActive.filter((pokemon) => pokemon !== this.leader).forEach((pokemon, index) =>
        this.pokemonAI.updatePlayerCompanion(pokemon, index, this.playerActive, this.opponentActive, this.leader, dt));
      this.opponentActive.forEach((pokemon, index) =>
        this.pokemonAI.updateOpponent(pokemon, pokemon.aiTarget, index, this.opponentActive.length, dt));

      this.game.combatSystem.update(dt, this.leader, this.opponentActive, true,
        this.playerActive.filter((pokemon) => pokemon !== this.leader));
      this.cleanupAndRefill();
      this.syncGameEnemies();
      if (this.leader) this.game.camera.follow(this.leader, dt);
      if (!this.hasLiving(this.opponentParty)) return this.setResult('win');
      if (!this.hasLiving(this.playerParty)) return this.setResult('lose');
      return this.phase;
    }

    consumeDisabledWorldInput() {
      this.game.input.consumeSwitch();
    }

    assignPlayerTargets() {
      if (!this.playerActive.length) return;
      const leaderTarget = this.pokemonAI.choosePlayerTarget(this.leader, this.opponentActive, null);
      if (this.leader) this.leader.aiTarget = leaderTarget;
      for (const pokemon of this.playerActive) {
        if (pokemon === this.leader) continue;
        pokemon.aiTarget = this.pokemonAI.choosePlayerTarget(pokemon, this.opponentActive, leaderTarget);
      }
    }

    recordDamage(cast, target, damage) {
      if (cast?.team === 'player' && this.opponentParty.includes(target)) this.trainerAI.recordThreat(cast.caster, damage);
    }

    cleanupAndRefill() {
      const previousLeader = this.leader;
      for (const pokemon of [...this.playerActive, ...this.opponentActive]) {
        if (!living(pokemon)) pokemon.inField = false;
      }
      this.playerActive = this.playerActive.filter(living);
      this.opponentActive = this.opponentActive.filter(living);
      if (!living(previousLeader)) this.leader = this.playerActive[0] || null;
      this.refillPlayer();
      this.refillOpponent();
      if (!this.leader) this.leader = this.playerActive[0] || null;
      this.syncLeader();
    }

    hasLiving(party) { return party.some(living); }
    playerReserves() { return this.playerParty.filter((pokemon) => living(pokemon) && !this.playerActive.includes(pokemon)); }
    opponentReserves() { return this.opponentParty.filter((pokemon) => living(pokemon) && !this.opponentActive.includes(pokemon)); }

    refillPlayer() {
      while (this.playerActive.length < this.maxActiveCount) {
        const next = this.playerReserves()[0];
        if (!next) break;
        this.playerActive.push(next);
        this.deploy(next, 'player', this.playerActive.length - 1, this.maxActiveCount);
      }
    }

    refillOpponent() {
      while (this.opponentActive.length < this.opponentMaxActiveCount) {
        const next = this.opponentReserves()[0];
        if (!next) break;
        this.opponentActive.push(next);
        this.deploy(next, 'opponent', this.opponentActive.length - 1, this.opponentMaxActiveCount);
      }
    }

    deploy(pokemon, team, index, count, point = null) {
      const baseX = team === 'player' ? 300 : 724;
      const y = 384 + (index - (count - 1) / 2) * Math.min(92, 430 / Math.max(1, count - 1));
      pokemon.x = point?.x ?? baseX;
      pokemon.y = point?.y ?? y;
      pokemon.vx = 0; pokemon.vy = 0; pokemon.inField = true;
      if (team === 'player') this.game.resetMoveCooldowns?.(pokemon);
      else { pokemon.attackCooldown = .45 + index * .12; pokemon.state = 'aggro'; }
      this.pokemonAI.clampToArena(pokemon);
      this.game.spawnSwitchFlash?.(pokemon.x, pokemon.y);
    }

    cycleLeader() {
      const available = this.playerParty.filter((pokemon) => this.playerActive.includes(pokemon) && living(pokemon));
      if (available.length < 2) return false;
      const index = Math.max(0, available.indexOf(this.leader));
      this.leader = available[(index + 1) % available.length];
      this.syncLeader();
      this.game.message(`${this.leader.name}에게 리더 조작을 넘겼다.`, 1.1);
      return true;
    }

    async openTacticalMenu() {
      if (this.tacticalMenuOpen || this.phase !== 'active') return false;
      if (this.playerSwitchCooldown > 0) { this.game.message(`교체 대기 ${this.playerSwitchCooldown.toFixed(1)}초`, 1); return false; }
      const reserves = this.playerReserves();
      if (!reserves.length) { this.game.message('교체 가능한 대기 포켓몬이 없습니다.', 1.2); return false; }
      this.tacticalMenuOpen = true;
      this.phase = 'paused';
      try {
        const active = this.playerActive.filter(living);
        const activeChoice = await this.game.askStory('교체할 출전 포켓몬을 선택하세요.', active.map((p) => p.name).concat('취소'), active.length);
        if (activeChoice < 0 || activeChoice >= active.length) return false;
        const freshReserves = this.playerReserves();
        const reserveChoice = await this.game.askStory('새로 출전할 대기 포켓몬을 선택하세요.', freshReserves.map((p) => p.name).concat('취소'), freshReserves.length);
        if (reserveChoice < 0 || reserveChoice >= freshReserves.length) return false;
        return this.manualSwitch(active[activeChoice], freshReserves[reserveChoice]);
      } finally {
        this.tacticalMenuOpen = false;
        if (!['win', 'lose'].includes(this.phase)) this.phase = 'active';
      }
    }

    manualSwitch(activePokemon, reservePokemon) {
      if (this.playerSwitchCooldown > 0 || !living(activePokemon) || !living(reservePokemon)) return false;
      const index = this.playerActive.indexOf(activePokemon);
      if (index < 0 || this.playerActive.includes(reservePokemon)) return false;
      const point = { x: activePokemon.x, y: activePokemon.y };
      const wasLeader = this.leader === activePokemon;
      activePokemon.inField = false; activePokemon.vx = 0; activePokemon.vy = 0;
      this.playerActive[index] = reservePokemon;
      this.deploy(reservePokemon, 'player', index, this.maxActiveCount, point);
      if (wasLeader) this.leader = reservePokemon;
      this.playerSwitchCooldown = this.switchCooldownSeconds;
      this.syncLeader();
      this.game.message(`${activePokemon.name} 대신 ${reservePokemon.name}이 출전!`, 1.2);
      return true;
    }

    switchOpponent(index, reservePokemon) {
      const active = this.opponentActive[index];
      if (!living(active) || !living(reservePokemon) || this.opponentActive.includes(reservePokemon)) return false;
      const point = { x: active.x, y: active.y };
      active.inField = false; active.vx = 0; active.vy = 0;
      this.opponentActive[index] = reservePokemon;
      this.deploy(reservePokemon, 'opponent', index, this.opponentMaxActiveCount, point);
      this.syncGameEnemies();
      return true;
    }

    syncLeader() {
      const g = this.game;
      if (!this.leader) return;
      g.activePokemon = this.leader;
      g.player = this.leader;
      if (!['levelChoice', 'moveLearn'].includes(g.mode)) g.mode = 'pokemon';
      const index = g.partyPokemon?.indexOf(this.leader) ?? -1;
      if (index >= 0) { g.selectedPartyIndex = index; g.selectedPokemon = this.leader; }
    }

    syncGameEnemies() {
      this.game.enemies = this.opponentActive.filter(living);
    }

    setResult(result) {
      this.phase = result;
      return this.phase;
    }

    stop() {
      for (const pokemon of [...this.playerParty, ...this.opponentParty]) pokemon.inField = false;
      this.playerActive = [];
      this.opponentActive = [];
      this.leader = null;
    }
  }

  R.PokemonAI = PokemonAI;
  R.TrainerAI = TrainerAI;
  R.TrainerBattleEngine = TrainerBattleEngine;
})();
