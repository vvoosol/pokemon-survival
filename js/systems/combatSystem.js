window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.CombatSystem = class CombatSystem {
  constructor(statSystem, assets) {
    this.statSystem = statSystem;
    this.assets = assets;
    this.onLevelUp = null;
    this.onEnemyDefeated = null;
    this.clear();
  }

  clear() {
    this.friendlyTargets = null;
    this.telegraphs = [];
    this.projectiles = [];
    this.hitboxes = [];
    this.delayedAttacks = [];
    this.impacts = [];
    this.meleeSwings = [];
    this.charges = [];
    this.damageNumbers = [];
    this.levelToastTime = 0;
  }

  update(dt, player, enemies, autoAttack = true, allies = []) {
    this.friendlyTargets = [...new Set([player, ...allies].filter(Boolean))];
    // Advance existing shots before releasing new casts: they never jump on their first frame.
    this.updateProjectiles(dt, player, enemies);
    this.updateMeleeSwings(dt, player, enemies);
    this.updateCharges(dt,player,enemies);
    for (const box of this.hitboxes) box.time -= dt;
    this.hitboxes = this.hitboxes.filter((box) => box.time > 0);
    for (const impact of this.impacts) { impact.life -= dt; impact.age += dt; }
    this.impacts = this.impacts.filter((impact) => impact.life > 0);
    const pending = this.telegraphs;
    this.telegraphs = [];
    for (const cast of pending) {
      if (cast.caster.dead || this.isProtected(cast.caster)) continue;
      this.followCaster(cast);
      cast.timer -= dt;
      if (cast.timer <= 0) this.release(cast, player, enemies);
      else this.telegraphs.push(cast);
    }
    const delayed = this.delayedAttacks;
    this.delayedAttacks = [];
    for (const cast of delayed) {
      cast.timer -= dt;
      if (cast.timer <= 0) this.release(cast, player, enemies);
      else this.delayedAttacks.push(cast);
    }
    for (const num of this.damageNumbers) { num.life -= dt; num.y -= 38 * dt; }
    this.damageNumbers = this.damageNumbers.filter((num) => num.life > 0);
    this.levelToastTime = Math.max(0, this.levelToastTime - dt);
    if (autoAttack) for (const fighter of this.friendlyTargets) {
      if (!fighter.dead && fighter.inField !== false) this.tryPlayerAutoAttacks(fighter, enemies);
    }
  }

  isProtected(entity) {
    return ['captured', 'capture_sequence', 'capture_ready'].includes(entity?.state);
  }

  nearestEnemy(player, enemies) {
    let best = null, bestDistance = Infinity;
    for (const enemy of enemies) {
      if (enemy.dead || this.isProtected(enemy)) continue;
      const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
      if (distance < bestDistance) { best = enemy; bestDistance = distance; }
    }
    return best;
  }

  tryPlayerAutoAttacks(player, enemies) {
    const target = this.nearestEnemy(player, enemies);
    if (!target) return;
    for (const slot of player.equippedMoves) {
      const move = this.effectiveMove(player, slot.moveId);
      if (!move || slot.cooldownRemaining > 0) continue;
      const upgrade = slot.upgradeLevel || 0;
      const cast = this.createCast(player, target, move, upgrade, 'player');
      // Range never gates casting. A target beyond range can simply be missed.
      slot.cooldownRemaining = this.statSystem.calculateMoveCooldown(move, player.speed, upgrade);
      player.lastMoveVector = cast.direction;
      player.attackAnim = Math.max(player.attackAnim || 0, cast.timer + 0.18);
      player.syncMoveState?.();
      this.telegraphs.push(cast);
    }
  }

  enemyAttack(enemy, player) {
    if (enemy.dead || !player || player.dead) return;
    const options=(enemy.equippedMoves || []).filter(id=>{
      const behavior=window.SurvivorRPG.MoveData[id]?.behavior;
      return enemy.aiType==='artillery'?behavior==='AREA_TARGET':enemy.aiType==='ranged'?['PROJECTILE','MULTI_PROJECTILE','BEAM'].includes(behavior):true;
    });
    const id = options[Math.floor(Math.random() * options.length)] || enemy.equippedMoves?.[0] || 'wildBite';
    const move = window.SurvivorRPG.MoveData[id] || window.SurvivorRPG.MoveData.wildBite;
    const charger=enemy.aiType==='charger';
    const attack=charger?{...move,behavior:'MELEE_FRONT',range:165,width:enemy.radius*2}:move;
    const windup=enemy.aiType==='artillery'?1:charger ? 0.9 : Math.max(.55,this.windupFor(move));
    const cast = this.createCast(enemy, player, attack, 0, 'enemy',windup);
    cast.charge=charger;
    this.telegraphs.push(cast);
    return cast.timer;
  }

  createCast(caster, target, move, upgradeLevel = 0, team = 'player', windup = null) {
    const direction = this.normalized(target.x - caster.x, target.y - caster.y);
    const cast = { caster, move: { ...move }, upgradeLevel, team, direction,
      origin: { x: caster.x, y: caster.y }, timer: windup ?? this.windupFor(move),
      multiplier: 1, hitTargets: new Set() };
    cast.windup = cast.timer;
    cast.hitboxes = this.makePlayerHitboxes(caster, move, 0, direction, upgradeLevel);
    if (move.behavior === 'AREA_TARGET') {
      const distance = Math.min(move.range, Math.hypot(target.x - caster.x, target.y - caster.y));
      const landing = { x: caster.x + direction.x * distance, y: caster.y + direction.y * distance, radius: move.width / 2 };
      cast.hitboxes = [landing];
      if (upgradeLevel >= 4) {
        for (const sign of [-1, 1]) cast.hitboxes.push({ ...landing,
          x: landing.x - direction.y * move.width * 0.64 * sign,
          y: landing.y + direction.x * move.width * 0.64 * sign });
      }
    }
    return cast;
  }

  release(cast, player, enemies) {
    if(cast.team==='enemy')cast.caster.recovery=cast.charge ? 0.9 : 0.6;
    if(cast.charge) {
      this.charges.push({cast,remaining:cast.move.range,speed:520});
      return;
    }
    const behavior = cast.move.behavior;
    if (['PROJECTILE', 'MULTI_PROJECTILE', 'AREA_TARGET', 'BEAM'].includes(behavior)) {
      for (const box of cast.hitboxes) {
        const area = behavior === 'AREA_TARGET';
        const start = area ? cast.origin : { x: box.startX, y: box.startY };
        const direction = area ? this.normalized(box.x - start.x, box.y - start.y) : { x: box.dirX, y: box.dirY };
        this.projectiles.push({ cast, x: start.x, y: start.y, origin: { ...start }, direction,
          radius: area ? 12 : box.width / 2, length: 0,
          remaining: area ? Math.hypot(box.x - start.x, box.y - start.y) : box.length,
          speed: cast.move.projectileSpeed || (behavior === 'BEAM' ? 740 : 390),
          landing: area ? box : null, beam: behavior === 'BEAM', age: 0, hold: 0.12, dead: false });
      }
    } else {
      this.meleeSwings.push({ cast, age: 0, duration: 0.32, impactAt: 0.12, resolved: false });
    }
    if (cast.upgradeLevel >= 2 && !cast.echo) {
      // A second wave retains its original caster, direction and damage penalty.
      this.delayedAttacks.push({ ...cast, echo: true, timer: 0.18,
        multiplier: 0.6, hitTargets: new Set() });
    }
  }

  targets(cast, player, enemies) {
    const candidates = cast.team === 'enemy' ? (this.friendlyTargets || (player ? [player] : [])) : enemies;
    return candidates.filter((entity) => !entity.dead && !this.isProtected(entity));
  }

  followCaster(cast) {
    const dx = cast.caster.x - cast.origin.x, dy = cast.caster.y - cast.origin.y;
    cast.origin = { x: cast.caster.x, y: cast.caster.y };
    // Direction and landing stay locked; mobile casters release from their current position.
    if (cast.move.behavior === 'AREA_TARGET') return;
    for (const box of cast.hitboxes) {
      if (box.dirX === undefined) { box.x += dx; box.y += dy; }
      else { box.startX += dx; box.startY += dy; }
    }
  }

  updateMeleeSwings(dt, player, enemies) {
    for (const swing of this.meleeSwings) {
      swing.age += dt;
      if (swing.cast.caster.dead || this.isProtected(swing.cast.caster) || swing.cast.caster.inField === false) {
        swing.age = swing.duration;
        continue;
      }
      if (!swing.resolved && swing.age >= swing.impactAt) {
        swing.resolved = true;
        this.resolveShapes(swing.cast, swing.cast.hitboxes, player, enemies);
      }
    }
    this.meleeSwings = this.meleeSwings.filter((swing) => swing.age < swing.duration);
  }

  isActing(entity) {
    return this.telegraphs.some((cast) => cast.caster === entity)
      || this.meleeSwings.some((swing) => swing.cast.caster === entity)
      || this.charges.some(charge=>charge.cast.caster===entity);
  }

  updateCharges(dt,player,enemies) {
    const movement=window.SurvivorRPG.MovementSystem && new window.SurvivorRPG.MovementSystem();
    for(const charge of this.charges) {
      const {cast}=charge, caster=cast.caster;
      if(caster.dead||this.isProtected(caster)){charge.remaining=0;continue;}
      const from={x:caster.x,y:caster.y},distance=Math.min(charge.remaining,charge.speed*dt);
      if(movement && this.world)movement.move(caster,cast.direction.x,cast.direction.y,distance/charge.speed,this.world,charge.speed/caster.movementSpeed);
      else {caster.x+=cast.direction.x*distance;caster.y+=cast.direction.y*distance;}
      for(const target of this.targets(cast,player,enemies)) {
        if(this.segmentHitTime(from,caster,target,caster.radius+target.radius)!==null)this.hit(cast,target);
      }
      charge.remaining-=distance;
      if(Math.hypot(caster.x-from.x,caster.y-from.y)<distance*.4)charge.remaining=0;
    }
    this.charges=this.charges.filter(charge=>charge.remaining>0);
  }

  poseFor(entity) {
    const swing = this.meleeSwings.find((entry) => entry.cast.caster === entity && !entry.cast.echo);
    if (swing) {
      const progress = Math.min(1, swing.age / swing.duration);
      return { direction: swing.cast.direction, offset: Math.sin(progress * Math.PI) * 18,
        squash: 1 - Math.sin(progress * Math.PI) * 0.08, brightness: 1 };
    }
    const cast = this.telegraphs.find((entry) => entry.caster === entity);
    if (!cast) return null;
    const progress = Math.max(0, Math.min(1, 1 - cast.timer / cast.windup));
    return { direction: cast.direction, offset: -10 * progress,
      squash: 1 - progress * 0.12, brightness: 1 + progress * 0.35 };
  }

  updateProjectiles(dt, player, enemies) {
    for (const shot of this.projectiles) {
      shot.age += dt;
      const distance = Math.min(shot.remaining, shot.speed * dt);
      const from = { x: shot.x, y: shot.y };
      shot.x += shot.direction.x * distance;
      shot.y += shot.direction.y * distance;
      // Solid scenery clips shots at its near face; area attacks fizzle on obstruction.
      const obstruction=this.wallIntersection(from,shot,shot.landing?4:Math.min(shot.radius,8));
      if(obstruction) {
        shot.x=obstruction.x;shot.y=obstruction.y;shot.remaining=0;shot.dead=true;
        if(shot.landing)continue;
      }
      shot.remaining = Math.max(0, shot.remaining - distance);
      shot.length += Math.hypot(shot.x-from.x,shot.y-from.y);
      if (shot.landing) {
        if (shot.remaining <= 0) {
          this.resolveShapes(shot.cast, [shot.landing], player, enemies);
          shot.dead = true;
        }
        continue;
      }
      const cast = shot.cast;
      const targets = this.targets(cast, player, enemies).filter((target) => !cast.hitTargets.has(target));
      if (shot.beam) {
        const box = { startX: shot.origin.x, startY: shot.origin.y, dirX: shot.direction.x,
          dirY: shot.direction.y, width: shot.radius * 2, length: shot.length };
        for (const target of targets) if (this.isInHitbox(target, box)) this.hit(cast, target);
      } else {
        // Swept circle/circle entry times avoid tunnelling and order non-piercing collisions.
        const collisions = targets.map((target) => ({ target,
          t: this.segmentHitTime(from, shot, target, shot.radius + target.radius) }))
          .filter((hit) => hit.t !== null).sort((a, b) => a.t - b.t);
        for (const collision of collisions) {
          this.hit(cast, collision.target);
          if (!cast.move.piercing) {
            shot.x = from.x + (shot.x - from.x) * collision.t;
            shot.y = from.y + (shot.y - from.y) * collision.t;
            shot.dead = true;
            break;
          }
        }
      }
      if (shot.remaining <= 0) {
        if (shot.beam) shot.hold -= dt;
        if (!shot.beam || shot.hold <= 0) shot.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((shot) => !shot.dead);
  }

  segmentHitTime(from, to, target, radius) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const ox = from.x - target.x, oy = from.y - target.y;
    const c = ox * ox + oy * oy - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a < 0.000001) return null;
    const b = 2 * (ox * dx + oy * dy);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }

  wallIntersection(from,to,radius=0) {
    if(!this.world?.colliders?.length)return null;
    let earliest=Infinity;
    for(const box of this.world.colliders) {
      let near=0,far=1;
      for(const [start,end,min,max] of [[from.x,to.x,box.x-radius,box.x+box.width+radius],
        [from.y,to.y,box.y-radius,box.y+box.height+radius]]) {
        const delta=end-start;
        if(Math.abs(delta)<1e-8){if(start<min||start>max){near=Infinity;break;}continue;}
        const a=(min-start)/delta,b=(max-start)/delta;
        near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
      }
      if(near<=far && far>=0 && near<=1)earliest=Math.min(earliest,near);
    }
    return Number.isFinite(earliest)?{x:from.x+(to.x-from.x)*Math.max(0,earliest-.001),y:from.y+(to.y-from.y)*Math.max(0,earliest-.001)}:null;
  }

  resolveShapes(cast, boxes, player, enemies) {
    this.hitboxes.push(...boxes.map((box) => ({ ...box, time: 0.24, cast })));
    const targets = this.targets(cast, player, enemies).filter((target) =>
      !cast.hitTargets.has(target) && this.isInAnyHitbox(target, boxes) && !this.wallIntersection(cast.origin,target));
    targets.sort((a, b) => Math.hypot(a.x - cast.origin.x, a.y - cast.origin.y) -
      Math.hypot(b.x - cast.origin.x, b.y - cast.origin.y));
    for (const target of targets) {
      this.hit(cast, target);
      if (!cast.move.piercing && cast.move.behavior !== 'AREA_TARGET') break;
    }
  }

  hit(cast, target) {
    if (target.dead || cast.hitTargets.has(target) || this.isProtected(target)) return;
    cast.hitTargets.add(target);
    const breakdown = this.statSystem.calculateDamageBreakdown(cast.caster, target, cast.move);
    const damage = breakdown.finalDamage <= 0 ? 0 : Math.max(1, Math.floor(breakdown.finalDamage * cast.multiplier));
    if (damage > 0) {
      target.takeDamage(damage, cast.direction.x * 12, cast.direction.y * 12);
      this.onDamage?.(cast,target,damage);
      if (cast.team === 'player') this.recordParticipant(target, cast.caster);
    }
    cast.caster.lastDamageBreakdown = { ...breakdown, finalDamage: damage };
    const recent=this.damageNumbers.find(n=>n.target===target && n.team===cast.team && typeof n.value==='number' && n.life>.55);
    if(recent){recent.value+=damage;recent.life=.75;}
    else this.damageNumbers.push({ target,team:cast.team,x: target.x, y: target.y - 34, value: damage, life: 0.75,
      color: cast.team === 'enemy' ? '#ff9d9d' : this.effectColor(breakdown.type) });
    this.pushEffectText(target, breakdown.type);
    this.impacts.push({ x: target.x, y: target.y, move: cast.move, size: Math.max(36, target.radius * 2.2), age: 0, life: 0.3 });
    this.assets.play('hit', 0.22);
    if (target.dead && cast.team === 'player') this.handleEnemyDefeat(target);
  }

  effectiveMove(player, moveId) {
    const base = window.SurvivorRPG.MoveData[moveId];
    if (!base) return null;
    const slot = player.equippedMoves?.find((entry) => (typeof entry === 'string' ? entry : entry.moveId) === moveId);
    const upgrade = typeof slot === 'object' ? slot.upgradeLevel || 0 : player.moveUpgradeLevels?.[moveId] || 0;
    return upgrade >= 1 ? { ...base, range: Math.round(base.range * 1.2), width: Math.round(base.width * 1.3) } : { ...base };
  }

  isInAnyHitbox(entity, boxes) { return boxes.some((box) => this.isInHitbox(entity, box)); }

  isInHitbox(entity, box) {
    if (box.radius !== undefined) return Math.hypot(entity.x - box.x, entity.y - box.y) <= box.radius + entity.radius;
    let x, y, width, height;
    if (box.dirX === undefined) {
      x = entity.x - box.x; y = entity.y - box.y; width = box.width; height = box.height;
    } else {
      const dx = entity.x - box.startX, dy = entity.y - box.startY;
      x = dx * box.dirX + dy * box.dirY;
      y = -dx * box.dirY + dy * box.dirX + box.width / 2;
      width = box.length; height = box.width;
    }
    // Exact circle vs oriented rectangle, including rounded corner contact.
    return Math.hypot(x - Math.max(0, Math.min(width, x)), y - Math.max(0, Math.min(height, y))) <= entity.radius;
  }

  isInPlayerHitbox(player, enemy, move) { return this.isInAnyHitbox(enemy, this.makePlayerHitboxes(player, move, 0)); }

  makePlayerHitboxes(player, move, time, direction = null, upgradeLevel = 0) {
    const dir = direction || this.attackDirection(player);
    let boxes;
    if (move.behavior === 'MELEE_AREA') boxes = [{ x: player.x, y: player.y, radius: move.width / 2, time }];
    else if (move.behavior === 'AREA_TARGET') boxes = [{ x: player.x + dir.x * move.range * 0.78,
      y: player.y + dir.y * move.range * 0.78, radius: move.width / 2, time }];
    else {
      const angles = [0];
      boxes = angles.map((angle) => this.makeDirectionalHitbox(player.x, player.y, this.rotate(dir, angle), move, time));
    }
    if (upgradeLevel >= 4) for (const sign of [-1, 1]) {
      boxes.push(this.makeDirectionalHitbox(player.x - dir.y * move.width * 0.64 * sign,
        player.y + dir.x * move.width * 0.64 * sign, dir, move, time));
    }
    return boxes;
  }

  makeDirectionalHitbox(x, y, dir, move, time) {
    return { startX: x, startY: y, dirX: dir.x, dirY: dir.y, length: move.range, width: move.width, time };
  }

  recordParticipant(enemy, player) {
    if (!enemy.participants) enemy.participants = new Set();
    if (player.uniqueId) enemy.participants.add(player.uniqueId);
  }

  handleEnemyDefeat(enemy) {
    if (this.onEnemyDefeated) return this.onEnemyDefeated(enemy);
    this.damageNumbers.push({ x: enemy.x, y: enemy.y - 58, value: `EXP +${enemy.expReward}`, life: 1, color: '#9fd4ff' });
    this.assets.play('exp', 0.28);
  }

  attackDirection(player) { return this.normalized(player.lastMoveVector?.x || 0, player.lastMoveVector?.y || 0); }
  normalized(x, y) { const len = Math.hypot(x, y); return len > 0 ? { x: x / len, y: y / len } : { x: 1, y: 0 }; }
  rotate(dir, angle) { return { x: dir.x * Math.cos(angle) - dir.y * Math.sin(angle), y: dir.x * Math.sin(angle) + dir.y * Math.cos(angle) }; }
  windupFor(move) {
    if (move.castTime !== undefined) return move.castTime;
    if (move.sourceId === 'QUICKATTACK') return 0.38;
    if (move.behavior === 'MELEE_FRONT') return 0.6;
    if (move.behavior === 'MELEE_AREA' || move.behavior === 'AREA_TARGET') return 0.65;
    if (move.behavior === 'BEAM') return 0.55;
    return 0.45;
  }
  effectColor(type) { return type === 0 ? '#d0d0d0' : type >= 2 ? '#ffde72' : type < 1 ? '#a9c7ff' : '#fff2a8'; }
  pushEffectText(target, type) {
    const value = type === 0 ? '효과가 없다' : type >= 2 ? '효과가 굉장했다' : type < 1 ? '효과가 별로다' : '';
    if (value && !this.damageNumbers.some(n=>n.target===target && n.value===value)) this.damageNumbers.push({ target,x: target.x, y: target.y - 60, value, life: 0.9, color: this.effectColor(type) });
  }

  drawEffects(ctx, camera) {
    const visuals = window.SurvivorRPG.MoveVisualAdapter;
    ctx.save();
    ctx.lineWidth = 1.5;
    for (const cast of this.telegraphs) {
      const color = cast.team === 'enemy' ? '#ff8e8e' : visuals.getMoveAnimation(cast.move).color;
      if(cast.team==='enemy')this.drawHostileTell(ctx,camera,cast);
      if (cast.move.behavior === 'AREA_TARGET') {
        for (const box of cast.hitboxes) this.drawHitboxShape(ctx, camera, box, 'transparent', color + '90');
      }
      if (!cast.move.behavior.startsWith('MELEE')) {
        const progress = Math.max(0, 1 - cast.timer / cast.windup);
        visuals.draw(ctx, this.assets, cast.move,
          cast.caster.x + cast.direction.x * 26 - camera.x,
          cast.caster.y + cast.direction.y * 26 - camera.y,
          12 + progress * 14, cast.windup - cast.timer);
      }
    }
    for (const shot of this.projectiles) {
      ctx.save();
      ctx.globalAlpha=shot.cast.team==='enemy'?1:(this.assets.settings?.reducedEffects ? 0.5 : 0.72);
      const color = shot.cast.team === 'enemy' ? '#ff8e8e' : visuals.getMoveAnimation(shot.cast.move).color;
      const angle = Math.atan2(shot.direction.y, shot.direction.x);
      if(shot.cast.team==='enemy') {
        ctx.strokeStyle='#ff7777';ctx.lineWidth=2;ctx.beginPath();
        ctx.arc(shot.x-camera.x,shot.y-camera.y,shot.radius+3,0,Math.PI*2);ctx.stroke();
      }
      if (shot.landing) {
        ctx.setLineDash([5, 5]);
        this.drawHitboxShape(ctx, camera, shot.landing, 'transparent', color + '90');
        ctx.setLineDash([]);
      }
      if (shot.beam) {
        const step = Math.max(16, shot.radius * 0.9);
        for (let d = step / 2; d <= shot.length; d += step) visuals.draw(ctx, this.assets, shot.cast.move,
          shot.origin.x + shot.direction.x * d - camera.x, shot.origin.y + shot.direction.y * d - camera.y,
          shot.radius * 1.65, shot.age + d / 500, angle);
      } else {
        visuals.draw(ctx, this.assets, shot.cast.move, shot.x - camera.x, shot.y - camera.y,
          shot.radius * 2, shot.age, angle + (shot.cast.move.visualSpin || 0) * shot.age);
      }
      ctx.restore();
    }
    for (const swing of this.meleeSwings) {
      if (swing.resolved) continue;
      const progress = Math.min(1, swing.age / swing.impactAt);
      const { cast } = swing;
      const reach = cast.move.behavior === 'MELEE_AREA' ? 0 : cast.move.range * 0.5 * progress;
      ctx.save();
      ctx.globalAlpha = 0.35 + progress * 0.65;
      visuals.draw(ctx, this.assets, cast.move,
        cast.origin.x + cast.direction.x * reach - camera.x,
        cast.origin.y + cast.direction.y * reach - camera.y,
        18 + progress * 34, swing.age, Math.atan2(cast.direction.y, cast.direction.x), true);
      ctx.restore();
    }
    for (const box of this.hitboxes) {
      // On contact the target impact is enough; avoid masking the lunge with a second flash.
      const frontalMelee = box.cast.move.behavior === 'MELEE_FRONT';
      if (frontalMelee && box.cast.hitTargets.size > 0) continue;
      const x = box.dirX === undefined ? box.x : box.startX + box.dirX * box.length / 2;
      const y = box.dirY === undefined ? box.y : box.startY + box.dirY * box.length / 2;
      visuals.draw(ctx, this.assets, box.cast.move, x - camera.x, y - camera.y,
        box.radius ? box.radius * 1.7 : frontalMelee ? Math.min(56, box.width * 0.8) : box.width * 0.8,
        0.24 - box.time, 0, true);
    }
    for (const impact of this.impacts) visuals.draw(ctx, this.assets, impact.move,
      impact.x - camera.x, impact.y - camera.y, impact.size, impact.age, 0, true);
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px FusionPokemon, Segoe UI, Arial';
    for (const num of this.damageNumbers) {
      ctx.globalAlpha = Math.min(1, num.life * 1.4);
      ctx.fillStyle = num.color; ctx.strokeStyle = '#202020'; ctx.lineWidth = 3;
      ctx.strokeText(String(num.value), num.x - camera.x, num.y - camera.y);
      ctx.fillText(String(num.value), num.x - camera.x, num.y - camera.y);
    }
    ctx.restore();
  }

  drawHostileTell(ctx,camera,cast) {
    ctx.save();
    ctx.strokeStyle='#ff9292';ctx.lineWidth=2;
    const progress=Math.max(0,Math.min(1,1-cast.timer/cast.windup));
    const x=cast.origin.x-camera.x,y=cast.origin.y-camera.y;
    ctx.beginPath();ctx.arc(x,y,cast.caster.radius+7,-Math.PI/2,-Math.PI/2+Math.PI*2*progress);ctx.stroke();
    if(cast.move.behavior==='AREA_TARGET') {
      for(const box of cast.hitboxes) {
        ctx.beginPath();ctx.arc(box.x-camera.x,box.y-camera.y,box.radius*progress,0,Math.PI*2);ctx.stroke();
      }
    } else {
      const distance=cast.move.range,end=this.wallIntersection(cast.origin,{x:cast.origin.x+cast.direction.x*distance,y:cast.origin.y+cast.direction.y*distance})
        || {x:cast.origin.x+cast.direction.x*distance,y:cast.origin.y+cast.direction.y*distance};
      const ex=end.x-camera.x,ey=end.y-camera.y;
      ctx.setLineDash(cast.charge?[10,5]:[3,7]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ex,ey);ctx.stroke();ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(ex-cast.direction.x*10-cast.direction.y*7,ey-cast.direction.y*10+cast.direction.x*7);
      ctx.lineTo(ex,ey);ctx.lineTo(ex-cast.direction.x*10+cast.direction.y*7,ey-cast.direction.y*10-cast.direction.x*7);ctx.stroke();
    }
    ctx.restore();
  }

  drawHitboxShape(ctx, camera, box, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill; ctx.strokeStyle = stroke;
    if (box.radius !== undefined) {
      ctx.beginPath(); ctx.arc(box.x - camera.x, box.y - camera.y, box.radius, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (box.dirX !== undefined) {
      ctx.translate(box.startX - camera.x, box.startY - camera.y);
      ctx.rotate(Math.atan2(box.dirY, box.dirX));
      ctx.fillRect(0, -box.width / 2, box.length, box.width);
      ctx.strokeRect(0, -box.width / 2, box.length, box.width);
    } else {
      ctx.fillRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
      ctx.strokeRect(box.x - camera.x, box.y - camera.y, box.width, box.height);
    }
    ctx.restore();
  }
};
