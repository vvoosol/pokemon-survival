window.SurvivorRPG = window.SurvivorRPG || {};
window.SurvivorRPG.StoryState = {
  createWildLevelProfile(random = Math.random) {
    const shift = () => Math.max(-1, Math.min(1, Math.floor(Number(random()) * 3) - 1));
    const profile = {};
    for (const [key, min, max] of [
      ['opening', 2, 6],
      ['preBrock', 5, 11],
      ['postBrock', 10, 19],
      ['postMisty', 17, 26],
      ['postSurge', 23, 30]
    ]) {
      const offset = shift();
      profile[key] = {min: Math.max(2, min + offset), max: Math.max(2, max + offset)};
    }
    return profile;
  },
  ensureWildLevelProfile(state) {
    if (!state.wildLevelProfile) state.wildLevelProfile = this.createWildLevelProfile();
    return state.wildLevelProfile;
  },
  wildLevelRange(state, mapId = state.mapId) {
    const profile = this.ensureWildLevelProfile(state);
    const cleared = state.gymRewards.length;
    if (cleared >= 3) return profile.postSurge;
    if (cleared >= 2) return profile.postMisty;
    if (cleared >= 1) return profile.postBrock;
    return [2, 3, 4].includes(Number(mapId)) ? profile.opening : profile.preBrock;
  },
  create(start = {map: 1, x: 9, y: 7}, random = Math.random) {
    return {version: 1, mapId: start.map, x: start.x, y: start.y, direction: 2,
      switches: {}, variables: {}, selfSwitches: {}, badges: [false, false, false],
      keyItems: {}, gymRewards: [], playTime: 0, expShareEnabled: false, activeCount: 1,
      playerName: 'Red', rivalName: 'Azul', eventCheckpoint: null, reachedViridian: false,
      wildLevelProfile: this.createWildLevelProfile(random)};
  },
  validate(state) {
    const fail = () => { throw Error('Invalid story state'); };
    if (!state || state.version !== 1 || !Number.isInteger(state.mapId) || state.mapId <= 0) fail();
    if (![state.x, state.y, state.playTime].every(n => Number.isFinite(n) && n >= 0)) fail();
    if (![2, 4, 6, 8].includes(state.direction)) fail();
    const record = value => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length <= 10000;
    for (const name of ['switches', 'variables', 'selfSwitches', 'keyItems']) if (!record(state[name])) fail();
    for (const [key, value] of Object.entries(state.switches)) if (!/^\d+$/.test(key) || typeof value !== 'boolean') fail();
    for (const [key, value] of Object.entries(state.variables))
      if (!/^\d+$/.test(key) || !(Number.isFinite(value) || typeof value === 'string' && value.length <= 1000)) fail();
    for (const [key, value] of Object.entries(state.selfSwitches))
      if (!/^\d+:\d+:[ABCD]$/.test(key) || typeof value !== 'boolean') fail();
    for (const [key, value] of Object.entries(state.keyItems))
      if (!/^[a-zA-Z0-9_]+$/.test(key) || !Number.isInteger(value) || value < 0) fail();
    if (!Array.isArray(state.badges) || state.badges.length !== 3 || state.badges.some(b => typeof b !== 'boolean')) fail();
    if (!Array.isArray(state.gymRewards) || new Set(state.gymRewards).size !== state.gymRewards.length ||
      state.gymRewards.some((n, i) => n !== i + 1 || !state.badges[n - 1])) fail();
    if (![1, 2, 3].includes(state.activeCount) || state.activeCount > this.maxActive(state)) fail();
    if (typeof state.expShareEnabled !== 'boolean' || state.expShareEnabled && !state.gymRewards.includes(1)) fail();
    if (state.reachedViridian !== undefined && typeof state.reachedViridian !== 'boolean') fail();
    if (state.wildLevelProfile !== undefined) {
      if (!record(state.wildLevelProfile)) fail();
      for (const name of ['opening', 'preBrock', 'postBrock', 'postMisty', 'postSurge']) {
        const range = state.wildLevelProfile[name];
        if (!record(range) || !Number.isInteger(range.min) || !Number.isInteger(range.max) ||
          range.min < 2 || range.max < range.min || range.max > 31) fail();
      }
    }
    const point = p => record(p) && [p.x, p.y].every(Number.isFinite) &&
      (p.direction === undefined || [2, 4, 6, 8].includes(p.direction));
    if (state.mapEvents !== undefined) {
      const events = state.mapEvents;
      if (!record(events) || events.mapId !== state.mapId || !record(events.positions) ||
        !Array.isArray(events.erased) || events.erased.some(id => !Number.isInteger(id) || id < 1)) fail();
      for (const [id, position] of Object.entries(events.positions)) if (!/^[1-9]\d*$/.test(id) || !point(position)) fail();
    }
    if (state.healingSpot !== undefined && (!point(state.healingSpot) ||
      !Number.isInteger(state.healingSpot.mapId) || state.healingSpot.mapId < 1)) fail();
    for (const name of ['playerName', 'rivalName'])
      if (typeof state[name] !== 'string' || state[name].length > 24 || /[<>]/.test(state[name])) fail();
    if (state.eventCheckpoint !== null) {
      const c = state.eventCheckpoint;
      if (!c || !Array.isArray(c.frames) || c.frames.length > 32) fail();
      for (const frame of c.frames) if (!Number.isInteger(frame.mapId) || frame.mapId < 1 ||
        !Number.isInteger(frame.eventId) || frame.eventId < 1 || !Number.isInteger(frame.pageIndex) || frame.pageIndex < 0 ||
        !Number.isInteger(frame.pc) || frame.pc < 0 || !record(frame.choices) || !Array.isArray(frame.loops) ||
        frame.loops.some(n => !Number.isInteger(n) || n < 0) ||
        frame.commonEventId !== undefined && (!Number.isInteger(frame.commonEventId) || frame.commonEventId < 1)) fail();
    }
    return state;
  },
  maxActive(state) { return state.gymRewards.includes(3) ? 3 : state.gymRewards.includes(2) ? 2 : 1; },
  unlockGym(state, order) {
    if (![1, 2, 3].includes(order) || !state.badges[order - 1]) throw Error('Original badge reward must be applied first');
    if (state.gymRewards.includes(order)) return false;
    if (order > 1 && !state.gymRewards.includes(order - 1)) throw Error('Previous gym reward is missing');
    state.gymRewards.push(order);
    if (order === 1) { state.keyItems.EXPSHARE = 1; state.expShareEnabled = true; }
    return true;
  },
  pageIndex(event, state, mapId) {
    for (let i = event.pages.length - 1; i >= 0; i--) {
      const page = event.pages[i];
      const c = page.condition;
      const originalEngineHelperPage = c.switch1_valid && c.switch1_id === 127 && page.list?.some(command =>
        [355, 655].includes(command.code) && /(?:get_self\.onEvent\?|setTempSwitchOn)/.test(String(command.parameters?.[0] || ''))
      );
      if (originalEngineHelperPage) continue;
      if (c.switch1_valid && !state.switches[c.switch1_id]) continue;
      if (c.switch2_valid && !state.switches[c.switch2_id]) continue;
      if (c.variable_valid && !(Number(state.variables[c.variable_id] || 0) >= c.variable_value)) continue;
      if (c.self_switch_valid && !state.selfSwitches[`${mapId}:${event.id}:${c.self_switch_ch}`]) continue;
      return i;
    }
    return -1;
  }
};
