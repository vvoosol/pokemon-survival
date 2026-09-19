window.SurvivorRPG = window.SurvivorRPG || {};
window.SurvivorRPG.StoryEventInterpreter = class StoryEventInterpreter {
  constructor(state, host = {}) { this.state = state; this.host = host; this.frames = []; this.running = false; this.error = null; }
  fault(message, frame, command) {
    const error = new Error(`${message} [map=${frame.mapId}, event=${frame.eventId}, page=${frame.pageIndex}, command=${frame.pc}, code=${command?.code}]`);
    error.location = {mapId: frame.mapId, eventId: frame.eventId, pageIndex: frame.pageIndex, pc: frame.pc, code: command?.code};
    return error;
  }
  async run(mapId, event, pageIndex) {
    if (this.running) throw Error('An event is already running');
    if (!event.pages[pageIndex]) throw Error('Event page not found');
    this.running = true; this.error = null;
    const frame = {mapId, eventId: event.id, pageIndex, pc: 0, list: event.pages[pageIndex].list, choices: {}, loops: []};
    this.frames = [frame];
    try { await this.execute(frame); this.state.eventCheckpoint = null; }
    catch (error) { this.error = error; throw error; }
    finally { this.running = false; this.frames = []; }
  }
  async resume() {
    if (this.running) throw Error('An event is already running');
    const checkpoint = this.state.eventCheckpoint;
    if (!checkpoint?.frames.length) return;
    this.running = true; this.error = null;
    try {
      this.frames = [];
      for (const saved of checkpoint.frames) {
        const source = saved.commonEventId
          ? await this.host.commonEvent(saved.commonEventId)
          : await this.host.eventPage(saved.mapId, saved.eventId, saved.pageIndex);
        if (!source?.list || saved.pc >= source.list.length) throw Error('Checkpoint source no longer matches');
        this.frames.push({...saved, list: source.list, choices: {...saved.choices}, loops: [...saved.loops]});
      }
      while (this.frames.length) {
        await this.execute(this.frames.at(-1));
        this.frames.pop();
        if (this.frames.length) this.frames.at(-1).pc++;
      }
      this.state.eventCheckpoint = null;
    } catch (error) { this.error = error; throw error; }
    finally { this.running = false; this.frames = []; }
  }
  async call(name, args, frame, command) {
    if (typeof this.host[name] !== 'function') throw this.fault(`Unsupported adapter: ${name}`, frame, command);
    try { return await this.host[name](...args); }
    catch (error) { throw error.location ? error : this.fault(`${name}: ${error.message}`, frame, command); }
  }
  skipTo(frame, predicate) {
    const start = frame.pc;
    for (let i = start + 1; i < frame.list.length; i++) {
      if (predicate(frame.list[i])) { frame.pc = i; return; }
    }
    throw this.fault('Unterminated event branch', frame, frame.list[start]);
  }
  async condition(args, frame, command) {
    const s = this.state;
    if (args[0] === 0) return !!s.switches[args[1]] === (args[2] === 0);
    if (args[0] === 1) {
      const left = s.variables[args[1]] ?? 0, right = args[2] === 0 ? args[3] : s.variables[args[3]] ?? 0;
      const comparisons = [() => left === right, () => left >= right, () => left <= right, () => left > right, () => left < right, () => left !== right];
      if (!comparisons[args[4]]) throw this.fault('Unsupported variable comparison', frame, command);
      return comparisons[args[4]]();
    }
    if (args[0] === 2) return !!s.selfSwitches[`${frame.mapId}:${frame.eventId}:${args[1]}`] === (args[2] === 0);
    if (args[0] === 12) return !!(await this.call('scriptCondition', [args[1], frame], frame, command));
    return !!(await this.call('condition', [args, frame], frame, command));
  }
  async execute(frame) {
    let steps = 0;
    while (frame.pc < frame.list.length) {
      if (++steps > 20000) throw this.fault('Event exceeded command budget', frame, frame.list[frame.pc]);
      this.state.eventCheckpoint = {frames: this.frames.map(({mapId, eventId, pageIndex, pc, choices, loops, commonEventId}) =>
        ({mapId, eventId, pageIndex, pc, choices: {...choices}, loops: [...loops], ...(commonEventId ? {commonEventId} : {})}))};
      const command = frame.list[frame.pc], {code, indent, parameters: p} = command;
      switch (code) {
        case 0: case 108: case 408: case 118: case 412: case 404: break;
        case 101: {
          let text = p[0];
          while (frame.list[frame.pc + 1]?.code === 401) text += '\n' + frame.list[++frame.pc].parameters[0];
          await this.call('dialogue', [text, frame], frame, command); break;
        }
        case 102: {
          const answer = await this.call('choices', [p[0], p[1], frame], frame, command);
          if (!Number.isInteger(answer) || answer < -1 || answer >= p[0].length) throw this.fault('Invalid choice answer', frame, command);
          if (answer === -1 && p[1] === 0) throw this.fault('Cancellation is disabled', frame, command);
          frame.choices[indent] = answer === -1 && p[1] < 5 ? p[1] - 1 : answer; break;
        }
        case 402: case 403: {
          const selected = code === 402 ? frame.choices[indent] === p[0] : frame.choices[indent] === -1;
          if (!selected) { this.skipTo(frame, c => c.indent === indent && [402, 403, 404].includes(c.code)); continue; }
          break;
        }
        case 111:
          if (!await this.condition(p, frame, command)) {
            this.skipTo(frame, c => c.indent === indent && [411, 412].includes(c.code));
          }
          break;
        case 411: this.skipTo(frame, c => c.indent === indent && c.code === 412); break;
        case 112: frame.loops.push(frame.pc); break;
        case 113:
          this.skipTo(frame, c => c.indent < indent && c.code === 413);
          frame.loops.pop(); break;
        case 413:
          if (!frame.loops.length) throw this.fault('Loop start not found', frame, command);
          frame.pc = frame.loops.at(-1); break;
        case 115: return;
        case 119: {
          const index = frame.list.findIndex(c => c.code === 118 && c.parameters[0] === p[0]);
          if (index < 0) throw this.fault('Label not found', frame, command);
          frame.pc = index; break;
        }
        case 121:
          for (let id = p[0]; id <= p[1]; id++) this.state.switches[id] = p[2] === 0;
          break;
        case 122: {
          const operand = p[3] === 0 ? p[4] : p[3] === 1 ? this.state.variables[p[4]] ?? 0
            : await this.call('variableOperand', [p, frame], frame, command);
          const operators = [(a, b) => b, (a, b) => a + b, (a, b) => a - b, (a, b) => a * b,
            (a, b) => b === 0 ? 0 : Math.floor(a / b), (a, b) => b === 0 ? 0 : a % b];
          if (!operators[p[2]]) throw this.fault('Unsupported variable operation', frame, command);
          for (let id = p[0]; id <= p[1]; id++) this.state.variables[id] = operators[p[2]](this.state.variables[id] ?? 0, operand);
          break;
        }
        case 123: this.state.selfSwitches[`${frame.mapId}:${frame.eventId}:${p[0]}`] = p[1] === 0; break;
        case 106: await this.call('wait', [p[0] / 20], frame, command); break;
        case 201: {
          const values = p[0] === 0 ? p.slice(1, 4) : p.slice(1, 4).map(id => this.state.variables[id] ?? 0);
          const result = await this.call('transfer', [...values, p[4], p[5]], frame, command);
          if (!result?.suppressed) {
            [this.state.mapId, this.state.x, this.state.y] = values;
            if (p[4]) this.state.direction = p[4];
          }
          break;
        }
        case 117: {
          if (this.frames.length >= 32) throw this.fault('Common event recursion limit', frame, command);
          const common = await this.call('commonEvent', [p[0]], frame, command);
          if (!common?.list) throw this.fault('Common event missing', frame, command);
          const child = {...frame, commonEventId: p[0], list: common.list, pc: 0, choices: {}, loops: []};
          this.frames.push(child); await this.execute(child); this.frames.pop(); break;
        }
        case 355: {
          let script = p[0];
          while (frame.list[frame.pc + 1]?.code === 655) script += '\n' + frame.list[++frame.pc].parameters[0];
          await this.call('script', [script, frame], frame, command); break;
        }
        default: await this.call('command', [command, frame], frame, command);
      }
      frame.pc++;
    }
  }
};
