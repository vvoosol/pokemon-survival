window.SurvivorRPG = window.SurvivorRPG || {};
window.SurvivorRPG.StoryState = {
  create(start = {map: 1, x: 9, y: 7}) {
    return {version: 1, mapId: start.map, x: start.x, y: start.y, direction: 2,
      switches: {}, variables: {}, selfSwitches: {}, badges: [false, false, false],
      keyItems: {}, gymRewards: [], playTime: 0, expShareEnabled: false, activeCount: 1,
      playerName: 'Red', rivalName: 'Azul', eventCheckpoint: null};
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
      const c = event.pages[i].condition;
      if (c.switch1_valid && !state.switches[c.switch1_id]) continue;
      if (c.switch2_valid && !state.switches[c.switch2_id]) continue;
      if (c.variable_valid && !(Number(state.variables[c.variable_id] || 0) >= c.variable_value)) continue;
      if (c.self_switch_valid && !state.selfSwitches[`${mapId}:${event.id}:${c.self_switch_ch}`]) continue;
      return i;
    }
    return -1;
  }
};
