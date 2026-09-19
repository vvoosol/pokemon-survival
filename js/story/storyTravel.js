// Outdoor placement and temporary battles share the existing story/save state.
Object.assign(window.SurvivorRPG.StoryGame.prototype, {
  storyDoors() {
    const map = this.storyRenderer.map;
    return Object.values(map.events).filter(e => e.x > 1 && e.y > 1 && e.x < map.width - 2 && e.y < map.height - 2 &&
      e.pages.some(p => p.list.some(c => c.code === 201 && c.parameters[0] === 0 && c.parameters[1] !== map.id &&
        (c.parameters[4] === 8 || /door|puerta/i.test(e.name)))));
  },
  placeStoryNpcsAtDoors() {
    const doors = this.storyDoors();
    if (!doors.length) return;
    const occupied = new Set(doors.map(d => `${d.x},${d.y}`));
    const transfersTo = (door, id) => door.pages.some(p => p.list.some(c => c.code === 201 && c.parameters[1] === id));
    const place = (npc, preferred) => {
      const sorted = [...doors].sort((a, b) => (preferred && transfersTo(b, preferred) ? 10000 : 0) -
        (preferred && transfersTo(a, preferred) ? 10000 : 0) + Math.hypot(a.x - npc.x, a.y - npc.y) - Math.hypot(b.x - npc.x, b.y - npc.y));
      for (const door of sorted) for (const dx of [1, -1, 2, -2, 3, -3]) for (const dy of [0, 1]) {
        const x = door.x + dx, y = door.y + dy;
        if (occupied.has(`${x},${y}`) || !window.SurvivorRPG.MovementSystem.canStand(this.map, (x + .5) * 32, (y + .5) * 32, 10)) continue;
        // Keep one walkable approach beside every NPC and leave the doorway open.
        if (!window.SurvivorRPG.MovementSystem.canStand(this.map, (x + .5) * 32, (y + 1.5) * 32, 10)) continue;
        occupied.add(`${x},${y}`);
        return {x, y, direction: 2};
      }
      return {x: npc.x, y: npc.y, direction: 2};
    };
    for (const npc of this.storyProxyNpcs) Object.assign(npc, place(npc, npc.action === 'bill' ? 176 : npc.sourceMapId));
    const species = new Set(Object.values(window.SurvivorRPG.PokemonData).map(p => p.sourceId));
    for (const event of Object.values(this.storyRenderer.map.events)) {
      if (doors.includes(event)) continue;
      const human = event.pages.some(p => p.trigger === 0 && p.graphic.character_name &&
        !species.has(p.graphic.character_name) && !/door|puerta|item|ball|tree|rock|follower/i.test(p.graphic.character_name));
      if (human) this.storyPositions[event.id] = place(event);
    }
  },
  async nearestStoryCenter() {
    const queue = [this.story.mapId], seen = new Set(queue);
    while (queue.length) {
      const id = queue.shift();
      const center = this.storyOutdoorPlan(id).proxies.find(p => p.label === '간호순');
      if (center) return {mapId: id, npcId: center.id, x: center.x, y: center.y + 1};
      const map = await this.loadStorySourceMap(id);
      for (const e of Object.values(map.events)) for (const p of e.pages) for (const c of p.list) {
        const next = c.parameters?.[1];
        if (c.code !== 201 || c.parameters[0] !== 0 || seen.has(next) || !this.storyRenderer.manifest.maps[next]) continue;
        seen.add(next); queue.push(next);
      }
    }
    return {mapId: 4, npcId: 'viridian-joy', x: 52, y: 38};
  },
  async restartAfterDefeat() {
    if (this.mode !== 'gameOver' || this.recovering) return false;
    this.recovering = true; this.storyBusy = true;
    try {
      let center;
      if (!this.story.reachedViridian) {
        center = {mapId: 2, npcId: 'oak-starter', x: 27, y: 31, professor: true};
      } else if (this.story.healingSpot) {
        center = {mapId: this.story.healingSpot.mapId, x: this.story.healingSpot.x, y: this.story.healingSpot.y};
      } else {
        center = {mapId: 4, npcId: 'viridian-joy', x: 52, y: 38};
      }
      this.combatSystem.clear(); this.partyBattle.clear();
      this.levelUpQueue = []; this.currentLevelEvent = this.currentMoveLearn = null;
      this.transition = null; this.captureTarget = null; this.captureSystem.lockedTarget = null;
      this.ui.hideLevelChoices(); this.ui.hideGameMenu(); this.menuOpen = false;
      await this.transferStory(center.mapId, center.x, center.y, 2);
      const npc = this.storyProxyNpcs.find(p => p.id === center.npcId);
      const point = window.SurvivorRPG.MovementSystem.safePosition(this.map, ((npc?.x ?? center.x) + .5) * 32,
        ((npc ? npc.y + 1 : center.y) + .5) * 32, this.trainer.radius);
      if (!point) throw Error('회복 위치를 찾을 수 없습니다.');
      Object.assign(this.trainer, point); this.healParty();
      this.mode = 'trainer'; this.activePokemon = null;
      if (this.story.reachedViridian)
        this.story.healingSpot = {mapId: center.mapId, x: Math.floor(point.x / 32), y: Math.floor(point.y / 32), direction: 2};
      this.camera.follow(this.trainer, 1);
      this.message(center.professor
        ? '오박사: 괜찮다. 포켓몬은 모두 회복시켜 두었단다. 다시 1번도로를 따라 상록시티로 가 보렴!'
        : '간호순: 모두 회복했어요. 이어서 모험을 계속하세요!', 5);
      this.storyBusy = false; this.saveGame(true);
      return true;
    } catch (error) {
      this.mode = 'gameOver'; this.storyError = error;
      this.message(`복귀 오류: ${error.message}`, 5); return false;
    } finally { this.recovering = false; this.storyBusy = false; }
  },
  enterGymArena(trainer) {
    const actor = this.activePokemon || this.trainer;
    this.gymArena = {map: this.map, name: {LIDER1: '브록', LIDER2: '이슬', LIDER3: '마티스'}[trainer.type] || trainer.name,
      x: actor.x, y: actor.y, direction: actor.direction};
    this.map = {id: 'gym_arena', name: '체육관 배틀필드', width: 1024, height: 768,
      tileSize: 32, colliders: [], npcs: [], objects: [], spawnZones: []};
    this.camera.world = this.map; this.combatSystem.world = this.map; this.spawnSystem.setMap(this.map);
    this.partyBattle.clear(); this.activePokemon = null; this.mode = 'trainer';
    this.trainer.x = 360; this.trainer.y = 384;
    this.camera.follow(this.trainer, 1); this.nearbyNpc = null;
  },
  leaveGymArena(won) {
    const saved = this.gymArena;
    if (!saved) return;
    this.map = saved.map; this.camera.world = this.map; this.combatSystem.world = this.map;
    this.spawnSystem.mapData = this.map; this.partyBattle.clear();
    for (const p of this.partyPokemon) p.inField = false;
    this.activePokemon = null; this.transition = null;
    Object.assign(this.trainer, {x: saved.x, y: saved.y, direction: saved.direction});
    this.camera.follow(this.trainer, 1); this.mode = won ? 'trainer' : 'gameOver';
    this.gymArena = null;
  },
  drawGymArena() {
    const ctx = this.ctx;
    ctx.fillStyle = '#172938'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.save(); ctx.scale(this.worldZoom, this.worldZoom); ctx.translate(-this.camera.x, -this.camera.y);
    ctx.fillStyle = '#386851'; ctx.fillRect(0, 0, this.map.width, this.map.height);
    ctx.strokeStyle = '#b8d5bb'; ctx.lineWidth = 4;
    ctx.strokeRect(48, 72, 928, 624); ctx.beginPath(); ctx.moveTo(512, 72); ctx.lineTo(512, 696); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 384, 110, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(512, 384, 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.scale(this.worldZoom, this.worldZoom);
    const actors = [this.activePokemon || this.trainer, ...this.partyBattle.members, ...this.enemies];
    for (const actor of [...new Set(actors)].sort((a, b) => a.y - b.y)) {
      actor.draw(ctx, this.camera, this.assets, this.combatSystem.poseFor(actor));
      if (this.enemies.includes(actor)) this.drawEnemyHp(actor);
    }
    this.combatSystem.drawEffects(ctx, this.camera); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${this.gymArena.name} 관장전`, this.width / 2, 36);
  }
});
