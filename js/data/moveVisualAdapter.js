window.SurvivorRPG = window.SurvivorRPG || {};

(function defineMoveVisualAdapter() {
  // Anil BattleAnimationPlayer.rb uses five 192px columns. Timelines are adapted for real time.
  const sheets = {
    impact: ['Tackle_B.png', [0], [0], '#fff2ae'],
    scratch: ['Scratch + Shadow Claw.png', [0], [0], '#fff2ae'],
    waterPulse: ['PRAS- Water Pulse.png', [0], [1, 2, 3, 4], '#80dcff'],
    fire: ['PRAS- Fire.png', [20, 21, 22, 23], [40, 41, 42, 43, 44], '#ffad62'],
    water: ['PRAS- Water.png', [3, 4, 5, 6, 7], [19, 20, 21, 22, 23], '#80dcff'],
    bubble: ['PRAS- Water.png', [36], [36, 37, 38, 39, 40], '#aeeaff'],
    leaf: ['PRAS- Magical Leaf.png', [4, 5, 6, 7, 8, 9, 10, 11, 12], [13, 14], '#b7ef81'],
    vine: ['PRAS- Grass.png', [23, 24, 25, 26, 27], [37, 38], '#a0e476'],
    seed: ['PRAS- Seed Bomb.png', [0], [1, 2, 3, 4], '#cfeb7d'],
    electric: ['PRAS- Electric.png', [0, 1, 2, 3, 4], [5, 6, 7, 8], '#fff47b'],
    drain: ['PRAS- Giga Drain.png', [0, 1, 2, 3], [2, 3, 5, 6], '#c0ffa0'],
    psychic: ['PRAS- Psybeam.png', [0, 1, 2, 3], [0, 1, 2, 3], '#f5a9ff'],
    mud: ['PRAS- Mud Shot.png', [0], [0], '#dec49a'],
    gust: ['PRAS- Gust.png', [0], [0], '#e2fff9'],
    rock: ['PRAS- Rock.png', [0, 1, 2], [2, 3, 4, 5], '#e6cd99'],
    poison: ['PRAS- Poison.png', [0, 1], [7, 8, 9, 10, 11, 12, 13, 14, 15], '#de9cff'],
    bite: ['PRAS- Bite.png', [0, 1, 2], [0, 1, 2], '#ffe5dd'],
    bug: ['PRAS- Bug Bite.png', [0], [0], '#d2f38a'],
    energy: ['PRAS- Energy Ball.png', [0], [0], '#b7ff83'],
    sludge: ['PRAS- Sludge Bomb.png', [0], [0], '#de9cff']
  };
  const bySource = {
    TACKLE: 'impact', SCRATCH: 'scratch', WATERPULSE: 'waterPulse', QUICKATTACK: 'impact', BITE: 'bite', HYPERFANG: 'bite', BUGBITE: 'bug',
    GUST: 'gust', WINGATTACK: 'gust', VINEWHIP: 'vine', RAZORLEAF: 'leaf', SEEDBOMB: 'seed',
    ABSORB: 'drain', MEGADRAIN: 'drain', GIGADRAIN: 'drain', ACID: 'poison',
    EMBER: 'fire', FLAMEBURST: 'fire', FLAMETHROWER: 'fire', WATERGUN: 'water',
    BUBBLE: 'bubble', BUBBLEBEAM: 'bubble', THUNDERSHOCK: 'electric',
    ELECTROBALL: 'electric', THUNDERBOLT: 'electric', SPARK: 'electric',
    ROCKTHROW: 'rock', MAGNITUDE: 'rock', BULLDOZE: 'mud', MUDSHOT: 'mud',
    CONFUSION: 'psychic', PSYBEAM: 'psychic', PSYCHIC: 'psychic',
    ENERGYBALL: 'energy', SLUDGEBOMB: 'sludge', SOLARBEAM: 'energy'
  };
  const byType = { fire: 'fire', water: 'water', grass: 'leaf', electric: 'electric',
    poison: 'poison', psychic: 'psychic', ghost: 'psychic', flying: 'gust',
    bug: 'bug', rock: 'rock', ground: 'mud', dark: 'bite' };

  window.SurvivorRPG.MoveVisualAdapter = {
    sheets,
    bounds: new Map(),
    async load(assets) {
      await Promise.all([...new Set(Object.values(sheets).map((s) => s[0]))].map((file) =>
        assets.loadImage('move:' + file, 'assets/moves/' + file)));
      // Cache transparent margins once so tiny source particles remain readable.
      for (const [file, flight, hit] of Object.values(sheets)) {
        const image = assets.image('move:' + file);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 192;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        for (const frame of new Set([...flight, ...hit])) {
          const sx = frame % 5 * 192, sy = Math.floor(frame / 5) * 192;
          ctx.clearRect(0, 0, 192, 192);
          ctx.drawImage(image, sx, sy, 192, 192, 0, 0, 192, 192);
          let left = 192, top = 192, right = -1, bottom = -1;
          // file:// may forbid pixel reads; full source cells remain usable.
          try {
            const pixels = ctx.getImageData(0, 0, 192, 192).data;
            for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
              if (pixels[(y * 192 + x) * 4 + 3] < 24) continue;
              left = Math.min(left, x); top = Math.min(top, y);
              right = Math.max(right, x); bottom = Math.max(bottom, y);
            }
          } catch { left = top = 0; right = bottom = 191; }
          if (right >= left) this.bounds.set(file + ':' + frame,
            { x: sx + left, y: sy + top, width: right - left + 1, height: bottom - top + 1 });
        }
      }
    },
    getMoveAnimation(moveOrId) {
      const move = typeof moveOrId === 'string' ? window.SurvivorRPG.MoveData[moveOrId] : moveOrId;
      const key = bySource[move?.sourceId] || byType[move?.type] || 'impact';
      const [file, frames, hitFrames, color] = sheets[key];
      return { key, file, frames, hitFrames, color, sound: 'hit', foundOriginal: true,
        adapter: bySource[move?.sourceId] ? 'anil-move-adaptation' : 'anil-type-fallback' };
    },
    getProjectileVisual(move) { return this.getMoveAnimation(move); },
    getHitAnimation(move) { return this.getMoveAnimation(move); },
    getMoveSound() { return 'hit'; },
    draw(ctx, assets, move, x, y, size, age, angle = 0, impact = false) {
      const visual = this.getMoveAnimation(move);
      const frames = impact ? visual.hitFrames : visual.frames;
      const frame = frames[Math.floor(age * 16) % frames.length];
      const bounds = this.bounds.get(visual.file + ':' + frame);
      const image = assets.image('move:' + visual.file);
      if (!image || !bounds) return;
      const scale = size / Math.max(bounds.width, bounds.height);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height,
        -bounds.width * scale / 2, -bounds.height * scale / 2, bounds.width * scale, bounds.height * scale);
      ctx.restore();
    }
  };
})();
