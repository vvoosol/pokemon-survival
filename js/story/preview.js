(async () => {
  const R = window.SurvivorRPG, canvas = document.getElementById('storyCanvas'), ctx = canvas.getContext('2d');
  const selector = document.getElementById('mapSelect'), status = document.getElementById('sourceStatus');
  const dialogue = document.getElementById('dialogue'), button = document.getElementById('eventButton');
  const response = await fetch('assets/story/manifest.json');
  if (!response.ok) throw Error('Story manifest failed');
  const manifest = await response.json(), renderer = new R.StoryMapRenderer(manifest), state = R.StoryState.create();
  const camera = {x: 0, y: 0, width: 1280 / 1.5, height: 720 / 1.5};
  let dialogueResolve = null, pending = false, pan = null;
  const clamp = () => {
    camera.x = Math.max(0, Math.min(Math.max(0, renderer.map.width * 32 - camera.width), camera.x));
    camera.y = Math.max(0, Math.min(Math.max(0, renderer.map.height * 32 - camera.height), camera.y));
  };
  for (const [id, entry] of Object.entries(manifest.maps)) {
    const option = document.createElement('option'); option.value = id; option.textContent = `${id} · ${entry.name}`; selector.append(option);
  }
  const load = async id => {
    selector.disabled = button.disabled = true;
    try {
      const map = await renderer.load(Number(id)); state.mapId = map.id;
      camera.x = (map.width * 32 - camera.width) / 2; camera.y = (map.height * 32 - camera.height) / 2; clamp();
      status.textContent = `${map.width} × ${map.height} · 제작 중 / 전투 미연결`;
    } finally { selector.disabled = button.disabled = false; }
  };
  const interpreter = new R.StoryEventInterpreter(state, {
    dialogue: text => new Promise(resolve => {
      dialogue.textContent = text.replace(/<\/?b>/g, '').replace(/\\PN/g, state.playerName).replace(/\\v\[(\d+)\]/g, (_, id) => state.variables[id] ?? 0).replace(/\\c\[\d+\]/g, '');
      dialogue.hidden = false; dialogueResolve = resolve;
    })
  });
  const advance = () => { if (!dialogueResolve) return; const resolve = dialogueResolve; dialogueResolve = null; dialogue.hidden = true; resolve(); };
  // Release-gated input prevents the same press from opening and advancing a dialogue.
  dialogue.addEventListener('pointerdown', () => { pending = true; });
  dialogue.addEventListener('click', event => { if (pending || event.detail === 0) advance(); pending = false; });
  button.addEventListener('click', async () => {
    const candidate = renderer.activeEvents(state).find(({page}) => page.trigger === 0 && page.list[0]?.code === 101);
    if (!candidate) { status.textContent = '현재 페이지에 직접 실행할 대사가 없습니다.'; return; }
    selector.disabled = button.disabled = true;
    try { await interpreter.run(renderer.map.id, candidate.event, candidate.pageIndex); }
    catch (error) { status.textContent = error.message; }
    finally { selector.disabled = button.disabled = false; }
  });
  selector.addEventListener('change', () => load(selector.value).catch(error => { status.textContent = error.message; }));
  canvas.addEventListener('pointerdown', event => { pan = {x: event.clientX, y: event.clientY}; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if (!pan) return;
    const scale = canvas.width / canvas.getBoundingClientRect().width / 1.5;
    camera.x -= (event.clientX - pan.x) * scale; camera.y -= (event.clientY - pan.y) * scale;
    pan = {x: event.clientX, y: event.clientY}; clamp();
  });
  canvas.addEventListener('pointerup', () => { pan = null; });
  canvas.addEventListener('pointercancel', () => { pan = null; });
  window.addEventListener('keydown', event => {
    if (event.repeat) return;
    if (event.key.toLowerCase() === 'z') { event.preventDefault(); advance(); }
    const delta = {ArrowLeft: [-64, 0], ArrowRight: [64, 0], ArrowUp: [0, -64], ArrowDown: [0, 64]}[event.key];
    if (delta) { event.preventDefault(); camera.x += delta[0]; camera.y += delta[1]; clamp(); }
  });
  selector.value = '2'; await load(2);
  window.storyPreview = {renderer, state, camera, interpreter, load};
  const frame = time => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.scale(1.5, 1.5); renderer.draw(ctx, camera, state, time / 1000); ctx.restore();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})().catch(error => { document.getElementById('sourceStatus').textContent = error.message; console.error(error); });
