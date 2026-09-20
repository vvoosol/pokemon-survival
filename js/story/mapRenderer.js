window.SurvivorRPG = window.SurvivorRPG || {};
window.SurvivorRPG.StoryMapRenderer = class StoryMapRenderer {
  constructor(manifest) { this.manifest = manifest; this.images = new Map(); this.map = null; }
  async image(url) {
    if (!url) return null;
    if (!this.images.has(url)) this.images.set(url, new Promise((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image);
      image.onerror = () => reject(Error(`Story image failed: ${url}`)); image.src = url;
    }));
    return this.images.get(url);
  }
  async load(id) {
    const entry = this.manifest.maps[id];
    if (!entry) throw Error(`Story map not packaged: ${id}`);
    const map = await window.SurvivorRPG.loadStoryJSON(entry.url), tileset = this.manifest.tilesets[map.tileset_id];
    const [atlas, autotiles] = await Promise.all([this.image(tileset.image), Promise.all(tileset.autotiles.map(url => this.image(url)))]);
    const characters = new Map();
    const names = new Set(Object.values(map.events).flatMap(event => event.pages.map(page => page.graphic.character_name)).filter(Boolean));
    await Promise.all([...names].map(async name => characters.set(name, await this.image(this.manifest.characters[name]))));
    // Commit a fully loaded map atomically; an asset failure leaves the previous view intact.
    this.map = map; this.tileset = tileset; this.atlas = atlas; this.autotiles = autotiles; this.characters = characters;
    return map;
  }
  tileAt(x, y, z) {
    const map = this.map;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return 0;
    return map.data.values[x + y * map.width + z * map.width * map.height] || 0;
  }
  drawTile(ctx, id, x, y, seconds) {
    if (id >= 384) {
      ctx.drawImage(this.atlas, (id - 384) % 8 * 32, Math.floor((id - 384) / 8) * 32, 32, 32, x, y, 32, 32);
      return;
    }
    if (id < 48) return;
    const image = this.autotiles[Math.floor(id / 48) - 1];
    if (!image) return;
    const frameWidth = image.height === 32 ? 32 : 96;
    const frame = Math.floor(seconds / 0.25) % Math.max(1, Math.floor(image.width / frameWidth));
    if (image.height === 32) { ctx.drawImage(image, frame * 32, 0, 32, 32, x, y, 32, 32); return; }
    const pattern = this.manifest.autotilePatterns[id % 48];
    pattern.forEach((tile, i) => {
      const index = tile - 1;
      ctx.drawImage(image, frame * 96 + index % 6 * 16, Math.floor(index / 6) * 16, 16, 16,
        x + i % 2 * 16, y + Math.floor(i / 2) * 16, 16, 16);
    });
  }
  activeEvents(state) {
    return Object.values(this.map.events).flatMap(event => {
      const pageIndex = window.SurvivorRPG.StoryState.pageIndex(event, state, this.map.id);
      return pageIndex < 0 ? [] : [{event, pageIndex, page: event.pages[pageIndex]}];
    });
  }
  drawCharacter(ctx, event, page, camera) {
    const g = page.graphic;
    if (g.tile_id > 0) { this.drawTile(ctx, g.tile_id, event.x * 32 - camera.x, event.y * 32 - camera.y, 0); return; }
    const image = this.characters.get(g.character_name);
    if (!image) return;
    const width = image.width / 4, height = image.height / 4;
    ctx.save(); ctx.globalAlpha = (g.opacity ?? 255) / 255;
    ctx.drawImage(image, (g.pattern || 0) * width, ((g.direction || 2) / 2 - 1) * height, width, height,
      event.x * 32 + 16 - width / 2 - camera.x, (event.y + 1) * 32 - height - camera.y, width, height);
    ctx.restore();
  }
  draw(ctx, camera, state, seconds = 0, actors = [], positions = {}, erased = new Set(), hidden = new Set()) {
    if (!this.map) return;
    const map = this.map, foreground = [];
    ctx.imageSmoothingEnabled = false;
    const minX = Math.max(0, Math.floor(camera.x / 32)), minY = Math.max(0, Math.floor(camera.y / 32) - 5);
    const maxX = Math.min(map.width, Math.ceil((camera.x + camera.width) / 32));
    const maxY = Math.min(map.height, Math.ceil((camera.y + camera.height) / 32));
    for (let z = 0; z < map.data.z; z++) for (let y = minY; y < maxY; y++) for (let x = minX; x < maxX; x++) {
      const id = this.tileAt(x, y, z); if (!id) continue;
      const priority = this.tileset.priorities.values[id] || 0;
      const draw = () => this.drawTile(ctx, id, x * 32 - camera.x, y * 32 - camera.y, seconds);
      if (priority) foreground.push({y: (y + priority) * 32, order: z, draw}); else draw();
    }
    for (const {event, page} of this.activeEvents(state)) {
      if (erased.has(event.id) || hidden.has(event.id)) continue;
      const placed = {...event, ...positions[event.id]};
      const visiblePage = {...page, graphic: {...page.graphic, ...(placed.direction ? {direction: placed.direction} : {})}};
      foreground.push({y: page.always_on_top ? Infinity : (placed.y + 1) * 32 - 1, order: 3,
        draw: () => this.drawCharacter(ctx, placed, visiblePage, camera)});
    }
    foreground.push(...actors);
    foreground.sort((a, b) => a.y - b.y || a.order - b.order);
    foreground.forEach(item => item.draw());
  }
};
