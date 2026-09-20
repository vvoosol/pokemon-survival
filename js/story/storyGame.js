window.SurvivorRPG.StoryGame = class StoryGame extends window.SurvivorRPG.Game {
  constructor(canvas) {
    super(canvas);
    this.store = window.SurvivorRPG.SaveStore.forMode('story');
    this.journal = this.store.readJournal();
    this.story = window.SurvivorRPG.StoryState.create();
    this.storyBusy = true;
    this.storyError = null;
    this.autoruns = new Set();
    this.storyPositions = {};
    this.storySourceMaps = new Map();
    this.storySourcePositions = {};
    this.storySourceErased = new Set();
    this.storyProxyNpcs = [];
    this.storyProxyImages = new Map();
    this.proxyContext = null;
    this.erasedStoryEvents = new Set();
    this.storyPictures = new Map();
    this.storyRecoverySnapshot = null;
    this.storyRecoveryFailure = null;
    this.storyPreviousMapState = null;
    this.storyEntryPoint = null;
    this.storyFailedEvent = null;
    this.storyBaseColliders = [];
  }
  reset() { super.reset({starterPending: true}); }
  resetAtProfessor() {
    if (this.menuView !== 'resetConfirm') return false;
    localStorage.removeItem(this.store.key);
    localStorage.removeItem(this.store.backup);
    if (this.journal) {
      this.journal.awaitingStarter = false;
      this.store.writeJournal(this.journal);
    }
    const url = new URL(location.href);
    url.searchParams.set('mode', 'story');
    url.hash = '';
    location.assign(url.href);
    return true;
  }
  async init() {
    this.storyData = await window.SurvivorRPG.loadStoryJSON('assets/story/battle-data.json');
    // Keep curated Korean names and expansion learnsets when the source overlaps.
    for (const [id, data] of Object.entries(this.storyData.pokemon))
      if (!window.SurvivorRPG.PokemonData[id]) window.SurvivorRPG.PokemonData[id] = data;
    Object.assign(window.SurvivorRPG.MoveData, this.storyData.moves);
    await super.init();
    this.spawnSystem = new window.SurvivorRPG.StorySpawnSystem(this.map);
    this.ownedPokemon = []; this.partyPokemon = []; this.reservePokemon = [];
    this.activePokemon = null; this.selectedPokemon = null;
    this.journal = this.store.readJournal(); this.pokedex = {};
    this.money = 3000; this.balls.pokeBall = 0; this.items.potion = 1;
    this.storyRenderer = new window.SurvivorRPG.StoryMapRenderer(await window.SurvivorRPG.loadStoryJSON('assets/story/manifest.json'));
    await Promise.all(Object.entries(this.storyRenderer.manifest.pictures || {}).map(async ([name, url]) => {
      this.storyPictures.set(name, await this.storyRenderer.image(url));
    }));
    this.pictures = new Map();
    this.createStoryDialog();
    this.interpreter = new window.SurvivorRPG.StoryEventInterpreter(this.story, this.storyHost());
    const saved = this.store.read(), freshStory = !saved;
    if (saved) await this.loadGame(saved.data);
    else await this.transferStory(2, 14, 16, 2);
    this.storyBusy = false;
    if (freshStory) {
      await this.askStory('모험을 시작하기 전에 오박사에게 가 보자.\n마을 남쪽 연구소 앞에서 기다리고 있다.');
      this.showStoryObjective(6);
    }
  }
  createStoryDialog() {
    const box = document.createElement('section'); box.className = 'story-dialog'; box.hidden = true;
    box.setAttribute('aria-label', '스토리 대화');
    const text = document.createElement('div'), choices = document.createElement('div');
    choices.className = 'story-dialog-choices'; box.append(text, choices);
    document.getElementById('screenFrame').append(box);
    this.storyDialog = {box, text, choices, resolve: null, selected: 0, buttons: [], navCooldown: 0, recovery: false};
    document.getElementById('switchActionBtn')?.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !this.storyDialog?.resolve) return;
      event.preventDefault();
      this.answerStory(this.storyDialog.selected);
    });
  }
  storyText(text) {
    const translated = this.translateStoryText(String(text));
    return translated.replace(/<[^>]*>/g, '').replace(/\\PN/g, this.story.playerName)
      .replace(/\\v\[(\d+)\]/g, (_, id) => this.story.variables[id] ?? 0)
      .replace(/\\[cwl]\[\d+\]/gi, '').replace(/\\n/g, '\n');
  }
  translateStoryText(text) {
    const exact = {
      '¿Qué aspecto tienes?': '어떤 모습으로 시작할까요?', 'Chica': '여자', 'Chico': '남자',
      'Selecciona el modo de juego.': '게임 모드를 선택하세요.', 'Modo Clásico': '클래식 모드',
      'Modo Completo': '컴플리트 모드', 'Modo Radical': '래디컬 모드', 'Sí': '예', 'No': '아니오',
      '¿Necesitar curar a tus Pokémon?': '포켓몬을 치료할까요?', '¿Necesitas que cure a tus Pokémon?': '포켓몬을 치료할까요?',
      '¡Eso está hecho!': '좋아요. 바로 치료해 드릴게요!', '¡Listo! ¡Están como nuevos!': '치료가 끝났습니다. 모두 건강해졌어요!',
      'Aquí solo hay basura.': '여기에는 쓰레기밖에 없다.',
      'Tienda de Bicis': '자전거 상점', 'Museo Plateado': '회색시티 박물관',
      'Club de Fans Pokémon': '포켓몬 팬클럽', 'Monte Plateado': '은빛산',
      'Es un Pokémon del <b>Prof. Oak</b>.': '오박사의 포켓몬이다.',
      '<b>Prof. Oak:</b> Elige a tu Pokémon sabiamente, \\PN. ¡Estoy seguro de que seréis grandes compañeros!': '<b>오박사:</b> 신중하게 포켓몬을 고르렴, \\PN. 분명 좋은 동료가 될 거야!',
      '<b>Prof. Oak</b>: ¡Es un Pokémon muy amigable, te llevarás de maravilla con él!': '<b>오박사:</b> 아주 친근한 포켓몬이란다. 분명 좋은 파트너가 될 거야!'
    };
    if (exact[text]) return exact[text];
    const storyKorean = {
      '¡La tecnología de hoy en día es increíble!\nUna pena que nos la perdamos porque internet no llega bien hasta <b>Pueblo Paleta</b>.': '요즘 기술은 정말 대단해!\n다만 태초마을은 인터넷이 잘 안 들어와서 아쉽지.',
      'Me gustan las flores, ¡qué bien que haya tantas por aquí!\nAunque si algún día llega una persona alérgica, lo va a pasar bastante mal...': '나는 꽃을 좋아해. 이 주변에 꽃이 많아서 정말 좋아!\n알레르기가 있는 사람에게는 조금 힘들겠지만...',
      '¡Pronto me convertiré en Entrenador Pokémon! Solo me faltan unos meses para cumplir los 10 años...\n¡No puedo esperar a saber cuál será mi Pokémon inicial!': '나도 곧 포켓몬 트레이너가 될 거야! 열 살이 되기까지 몇 달만 남았어...\n첫 포켓몬이 누가 될지 정말 기대돼!',
      'Casa de \\PN': '\\PN의 집',
      '¡Cuidado con los Pokémon salvajes!': '야생 포켓몬을 조심하자!',
      '<b>Pueblo Paleta</b>, ¡el inicio de una aventura comienza siempre aquí!': '<b>태초마을</b> — 모든 모험은 이곳에서 시작된다!',
      'Laboratorio del Prof. Oak': '오박사 연구소',
      '¿Acabas de empezar tu aventura Pokémon? ¡Pues no olvides visitar la tienda!\nLa encontrarás dentro de cada Centro Pokémon. ¡Mira, te daré una Poción de muestra!': '포켓몬 모험을 막 시작했니? 상점을 꼭 이용해 봐!\n포켓몬센터에서 필요한 물건을 살 수 있어. 자, 이 상처약은 선물이야!',
      '¡No olvides visitar la tienda de vez en cuando! La encontrarás dentro del Centro Pokémon de cada ciudad.': '가끔 상점에 들르는 걸 잊지 마. 각 도시의 포켓몬센터에서 필요한 물건을 구할 수 있어.',
      '¿Ves esos pequeños bordillos? Pueden dar un poco de miedo, pero puedes saltarlos si no eres demasiado torpe.\n¡Vamos, que yo por ejemplo mejor me voy olvidando!': '저 낮은 턱이 보이지? 아래쪽으로는 뛰어넘을 수 있어.\n길을 빠르게 이동할 때 잘 활용해 봐!',
      '<b>Norte:</b> Ciudad Verde\\n<b>Sur:</b> Pueblo Paleta': '<b>북쪽:</b> 상록시티\\n<b>남쪽:</b> 태초마을',
      '<b>PISTA DE ENTRENADOR:</b> Los Pokémon que normalmente evolucionan por intercambio, aquí lo hacen por nivel.': '<b>트레이너 팁:</b> 원래 통신교환으로 진화하는 포켓몬은 이곳에서는 레벨이 오르면 진화한다.',
      '¡Adelante, Caterpie! ¡Usa Disparo Demora para bajarle la Velocidad!': '가라, 캐터피! 실뿜기로 상대의 스피드를 낮춰!',
      '¡Vamos, Nidoran! ¡Pondremos en práctica todo lo que hemos aprendido en la escuela!': '가자, 니도란! 학교에서 배운 걸 전부 써 보자!',
      '<b>Ciudad Verde</b>, el paraíso del eterno verdor': '<b>상록시티</b> — 푸른 빛이 언제나 이어지는 도시',
      'Escuela Pokémon': '포켓몬 학교',
      '<b>Pista para Entrenadores:</b> Asegúrate de comprar objetos en la tienda del <b>Centro Pokémon</b> antes de salir de la ciudad.': '<b>트레이너 팁:</b> 도시를 떠나기 전에 포켓몬센터에서 필요한 도구를 준비하자.',
      'El líder de gimnasio se encuentra fuera en estos momentos, ¿podrías volver dentro de un tiempo?': '체육관 관장은 지금 밖에 나가 있습니다. 잠시 후 다시 찾아와 주세요.',
      '¿Vas a enfrentarte al líder <b>Brock</b>? Sus Pokémon de tipo Roca son muy defensivos.\nTe aconsejo que vayas con algo de tipo Agua o de tipo Planta.': '브록에게 도전할 거니? 바위타입 포켓몬은 방어가 단단해.\n물타입이나 풀타입 포켓몬을 준비하면 유리할 거야.',
      '<b>Ciudad Plateada</b>, una ciudad de roca grisácea.': '<b>회색시티</b> — 회색 바위의 도시',
      '¿Has estado en el museo?': '박물관에 가 봤니?',
      '¿A que están chulos los fósiles del <b>Mt. Moon</b>? A mí me han abierto mucho la mente.': '달맞이산의 화석들, 정말 멋지지? 보고 있으면 상상력이 넓어져.',
      '¿No? Pues deberías ir, es una experiencia muy bonita.': '아직 안 가 봤다면 한번 들러 봐. 꽤 좋은 경험이 될 거야.',
      'Dime, ¿a qué inicial escogiste?': '처음에 어떤 타입의 포켓몬을 골랐니?',
      'El de tipo Planta': '풀타입',
      'El de tipo Fuego': '불꽃타입',
      'El de tipo Agua': '물타입',
      'El de tipo Eléctrico': '전기타입',
      'El de tipo Normal': '노말타입',
      'Salir': '나가기',
      '¡Ah! Elegiste a ese Pokémon. Entonces te vendrá bien este objeto.': '그 포켓몬을 골랐구나. 그렇다면 이 도구가 도움이 될 거야.',
      'Existen objetos potenciadores de los 18 tipos elementales. ¡Deberías intentar conseguirlos todos!': '18가지 타입의 위력을 높여 주는 도구가 있어. 하나씩 모아 보는 것도 좋아!',
      'Cuando terminemos nuestra estancia en <b>Ciudad Celeste</b>, nos iremos a un crucero romántico que sale de <b>Ciudad Carmín</b>.': '블루시티 여행이 끝나면 갈색시티에서 출항하는 유람선을 탈 거야.',
      '¿Te gusta mi bici? La he comprado en la <b>Tienda de Bicis</b>, pero te advierto de que los precios son algo caros.': '내 자전거 멋지지? 자전거 상점에서 샀는데 가격은 꽤 비싸더라.',
      '<b>Ciudad Celeste</b>, ¡el azul del agua nos rodea!': '<b>블루시티</b> — 푸른 물빛이 도시를 감싸는 곳',
      '<b>Este:</b> Túnel Roca': '<b>동쪽:</b> 돌산터널',
      'Puente Pepita': '너겟다리',
      'Al norte de la ciudad vive un famoso Pokémaniaco llamado <b>Bill</b>.\nYo fui profesor suyo en el colegio. La verdad es que de pequeño ya demostró tener una gran inteligencia.': '도시 북쪽에는 빌이라는 유명한 포켓몬 마니아가 살고 있어.\n어릴 때부터 아주 영리한 아이였지.',
      'Hemos cortado la salida de <b>Ciudad Celeste</b> hasta que terminemos una operación contra el <b>Team Rocket</b>.\n¡Disculpa las molestias!': '로켓단 관련 작전이 끝날 때까지 블루시티 출구를 통제하고 있습니다.\n불편을 드려 죄송합니다!',
      'El <b>S.S. Anne</b> es un crucero que llega a <b>Ciudad Carmín</b> una vez al año, ¡y justo es hoy!': 'S.S. 안느호는 1년에 한 번 갈색시티에 들어오는 유람선인데, 바로 오늘이 그날이야!',
      'Paseo Marítimo de Ciudad Carmín': '갈색시티 해안 산책로',
      '<b>Ciudad Carmín</b>, sus tonos rojizos evocan la puesta de sol.': '<b>갈색시티</b> — 붉은 노을빛이 떠오르는 항구도시',
      'El líder <b>Surge</b> ha embarcado en el crucero <b>S.S. Anne</b>. Quería tomarse unas merecidas vacaciones.': '마티스 관장은 휴가를 보내기 위해 S.S. 안느호에 탔다고 해.',
      '¿Vas a luchar contra <b>Surge</b>? Te aconsejo que intentes conseguir un buen Pokémon de tipo Tierra para maximizar tus posibilidades.': '마티스에게 도전할 거라면 땅타입 포켓몬을 준비해. 전기타입을 상대하기 훨씬 수월할 거야.',
      '<b>Oeste:</b> Monte Plateado\\n<b>Este:</b> Ruta \n23': '<b>서쪽:</b> 은빛산\\n<b>동쪽:</b> 23번도로',
      '¿Quieres hacerlo salir?': '포켓몬을 밖으로 나오게 할까요?',
      '¡El Pokémon Alfa ha huido! Pero ha soltado un objeto tras de sí.': '알파 포켓몬이 도망쳤다! 대신 도구 하나를 떨어뜨렸다.',
      'El <b>Nido Alfa</b> está vacío...': '알파 둥지는 비어 있다...'
    };
    if (storyKorean[text]) return storyKorean[text];
    const storyLineKorean = {
      'El <b>Prof. Oak</b> se instaló en <b>Pueblo Paleta</b> junto a su familia hará unos 30 años.': '오박사는 약 30년 전 가족과 함께 태초마을에 정착했어.',
      'Él dice que fue la mejor decisión de su vida, ya que el clima rural le ayuda en sus investigaciones.': '한적한 마을 환경이 연구에 도움이 돼서 인생 최고의 선택이었다고 하시지.',
      '¡Hasta ha construido un jardín secreto en su laboratorio! O eso dicen los rumores...': '연구소에 비밀 정원까지 만들었다는 소문도 있어...',
      '¡Pasar tiempo junto a tus Pokémon es lo mejor que puedes hacer en la vida! Incluso sacrificaría el tiempo que he pasado junto a algún familiar a cambio de más ': '포켓몬과 함께 보내는 시간은 정말 소중하지! 나는 사랑하는 라플레시아와 더 오래 함께할 수 있다면',
      'tiempo con mi querido Vileplume.': '다른 시간을 조금 줄여도 좋을 것 같아.',
      'Si vas a salir por ahí, no olvides alimentarte bien. ¡Y tampoco descuides la alimentación de tus Pokémon!': '여행을 떠날 거라면 너도 잘 먹고, 포켓몬의 먹이도 잊지 마!',
      'Las bayas como esta, por ejemplo, los vuelven locos.': '이런 나무열매는 포켓몬들이 아주 좋아한단다.',
      'Tanto tus Pokémon como tú necesitaréis muchas calorías para recorrer la región. ¡Comed bien!': '긴 여행에는 너와 포켓몬 모두 체력이 필요해. 든든히 먹어!',
      'Casa de \\v[12]': '\\v[12]의 집',

      'El otro día un Cazabichos me dijo que existen dos Pokémon oruga.': '얼마 전 곤충채집소년에게 애벌레 포켓몬이 두 종류라고 들었어.',
      'Caterpie no es venenoso, pero Weedle sí. ¡Ten cuidado y trata de que no te pique!': '캐터피는 독이 없지만 뿔충이는 독이 있으니 찔리지 않게 조심해!',
      'Algún día mi hijo también saldrá por ahí de aventuras... pero me da un poco de miedo.': '언젠가 우리 아이도 모험을 떠나겠지만... 조금 걱정되네.',
      '¿No son demasiado jóvenes para viajar solos por ahí? Deberían esperarse por lo menos hasta los 18 años...': '아이들이 혼자 여행하기엔 너무 어리지 않나? 적어도 열여덟 살은 되어야 할 것 같은데...',
      'Me gustaría ir a <b>Ciudad Plateada</b> con más frecuencia para visitar a mis nietos, pero me agota tener que atravesar el sinuoso <b>Bosque Verde</b>.': '손주들을 보러 회색시티에 자주 가고 싶지만, 구불구불한 상록숲을 지나는 게 힘들구나.',
      '¡Eres joven, tienes que vivir la vida a tope! Ojalá me hubieran dado a mí el mismo consejo cuando tenía tu edad...': '젊을 때는 힘껏 살아 봐야지! 나도 네 나이 때 이런 말을 들었으면 좋았을 텐데...',
      'Mira, te daré esta MT para que le saques todo el jugo a la vida.': '자, 이 기술머신을 줄게. 모험에 잘 써 봐.',
      'Con la MT Avivar, tus Pokémon podrán mejorar sus capacidades ofensivas.': '기술머신 분발을 사용하면 포켓몬의 공격 능력을 높일 수 있어.',
      '¡Si la utilizas sabiamente, no habrá oponente que se te resista!': '잘 활용하면 어떤 상대와도 멋지게 싸울 수 있을 거야!',
      'Dime, joven, ¿te gustaría atrapar a muchos Pokémon de tipo Agua?': '얘야, 물타입 포켓몬을 많이 잡아 보고 싶니?',
      '¡Genial! Los Pokémon de tipo Agua, además de fuertes, también son muy bonitos...': '좋지! 물타입 포켓몬은 강하면서도 매력적이란다...',
      '¡Con una <b>Caña de Pescar</b> te podrás hacer con todos!': '낚싯대가 있으면 물가에서 다양한 포켓몬을 만날 수 있어!',
      '¿No? Pues es una lástima, porque además de fuertes, también son muy bonitos...': '아니라고? 아쉽구나. 물타입 포켓몬은 강하고 멋진데...',
      'Los Pokémon de tipo Agua, además de fuertes, también son muy bonitos...': '물타입 포켓몬은 강하면서도 매력적이란다...',
      '¡Pesca siempre que puedas para hacerte con todos!': '낚시할 수 있는 곳에서는 자주 낚시해서 여러 포켓몬을 만나 봐!',
      '¿Tienes una Pokédex? ¿Te propones capturar a todos los Pokémon de la región?': '포켓몬 도감을 가지고 있구나? 이 지역의 포켓몬을 모두 모을 생각이니?',
      'En ese caso, te aconsejo que te pases con frecuencia por la tienda que hay dentro del <b>Centro Pokémon</b> para comprar todas las Poké Ball que puedas.': '그렇다면 포켓몬센터의 상점을 자주 이용해서 몬스터볼을 충분히 준비해 두는 게 좋아.',
      '¡Te acompaña tu Pokémon! ¡Buah, qué envidia!': '포켓몬이 너를 따라다니네! 정말 부럽다!',
      'Tiene que ser genial poder pasear junto a tu Pokémon favorito, ¡lástima que yo no sea capaz de atrapar a ninguno!': '좋아하는 포켓몬과 함께 걷는 건 정말 멋질 것 같아. 나는 아직 한 마리도 못 잡았지만!',
      'Creo que mi abuelo se ha pasado con la bebida... ¿puedes volver más tarde? Estoy intentando reanimarlo.': '할아버지가 너무 취하신 것 같아... 지금 깨워 드리는 중이니 나중에 다시 와 줄래?',
      'Uff... todo me da vueltas...': '으으... 세상이 빙글빙글 도는구먼...',
      '¡Uff! Menuda siesta me he echado, aunque he tenido un sueño bastante perturbador.': '휴! 푹 잤네. 조금 이상한 꿈을 꾸긴 했지만.',
      '¡Mira, me he encontrado con esta MT al despertarme!': '일어나 보니 이런 기술머신이 있더군! 자, 가져가.',
      'Creo que me volveré a dormir, así cojo energías para la siguiente siesta.': '난 다시 좀 자야겠어. 다음 낮잠을 위해 힘을 비축해야지.',
      '¡Te doy la bienvenida a <b>Ciudad Verde</b>, paletense!': '상록시티에 온 걸 환영해, 태초마을 친구!',
      'Además de <b>Gimnasio Pokémon</b>, también tenemos una escuela para entrenadores novatos.': '여기에는 포켓몬 체육관뿐 아니라 초보 트레이너를 위한 학교도 있어.',
      '¿Estás entrenando Pokémon? ¡Guau! Eres muy ': '포켓몬을 훈련하고 있니? 와, 정말',
      'valiente.': '용감하구나.',
      'Entonces esto te podría venir de fábula.': '그렇다면 이게 도움이 될 거야.',
      'Los objetos de combate te permiten aumentar la ': '배틀용 도구를 사용하면 싸우는 동안',
      'estadística de un Pokémon mientras está ': '포켓몬의 능력치를',
      'combatiendo.': '높일 수 있어.',
      'Si le das Velocidad X a un Pokémon, su velocidad ': '예를 들어 스피드업을 사용하면 포켓몬의 스피드가',
      'aumentará notablemente.': '크게 올라가지.',
      '¡Espero que ganes muchos combates en el futuro!': '앞으로 많은 배틀에서 이기길 바랄게!',
      'Casa de <b>Hoja</b>': '<b>리프</b>의 집',
      'Casa de <b>Rojo</b>': '<b>레드</b>의 집',
      'El Líder de Gimnasio se encuentra fuera en estos ': '체육관 관장은 지금',
      'momentos, ¿podrías volver dentro de un tiempo?': '자리를 비웠습니다. 나중에 다시 와 주세요.',
      '\\c[3]<b>???:</b>\\c[0] ¡Ah! Esto... eh... ¿qué quieres?': '\\c[3]<b>???:</b>\\c[0] 아! 저기... 무슨 일이야?',
      'T-tengo mucho en lo que pensar ahora mismo.': '지-지금 생각할 게 너무 많아서...',
      '¿Vienes de parte del <b>Prof. Oak</b>?': '오박사님이 보내서 온 거야?',
      '\\c[3]<b>???:</b>\\c[0] Es verdad. Habíamos quedado en que hoy iría a su laboratorio para que me entregara mi Pokémon inicial.': '\\c[3]<b>???:</b>\\c[0] 맞아. 오늘 연구소에 가서 첫 포켓몬을 받기로 했어.',
      'El problema es...': '그런데 문제가...',
      '\\c[3]<b>???:</b>\\c[0] Es que nunca he salido de <b>Ciudad Verde</b>. ¡No... no sé en qué dirección está <b>Pueblo Paleta</b>!': '\\c[3]<b>???:</b>\\c[0] 난 상록시티 밖으로 나가 본 적이 없어. 태초마을이... 어느 방향인지 모르겠어!',
      '\\c[3]<b>???:</b>\\c[0] ¿En esa dirección, dices?': '\\c[3]<b>???:</b>\\c[0] 그쪽이라고?',
      '\\c[3]<b>???:</b>\\c[0] Jo... y has tenido que venir a buscarme desde tan lejos. Anda que empiezo bien...': '\\c[3]<b>???:</b>\\c[0] 이런... 나 때문에 여기까지 와 준 거구나. 시작부터 이 모양이라니...',
      '\\c[3]<b>???:</b>\\c[0] Mi-mi nombre es <b>Hoja</b>.': '\\c[3]<b>???:</b>\\c[0] 내-내 이름은 <b>리프</b>야.',
      '\\c[3]<b>Hoja:</b>\\c[0] Yo... ¡te agradezco de veras que hayas venido a recogerme!': '\\c[3]<b>리프:</b>\\c[0] 나를 데리러 와 줘서 정말 고마워!',
      'Iré a ver al <b>Prof. Oak</b> en seguida, ¡te lo prometo!': '바로 오박사님께 갈게. 약속해!',
      'De hecho... creo que tú también tienes que volver, ¿no?': '그러고 보니... 너도 다시 돌아가야 하는 거 아니야?',
      '\\c[2]<b>???:</b>\\c[0] ¡Ah! Esto... eh... ¿qué quieres?': '\\c[2]<b>???:</b>\\c[0] 아! 저기... 무슨 일이야?',
      'Te-tengo mucho en lo que pensar ahora mismo.': '지-지금 생각할 게 너무 많아서...',
      '\\c[2]<b>???:</b>\\c[0] Es verdad. Habíamos quedado en que hoy iría a su laboratorio para que me entregara mi Pokémon inicial.': '\\c[2]<b>???:</b>\\c[0] 맞아. 오늘 연구소에 가서 첫 포켓몬을 받기로 했어.',
      '\\c[2]<b>???:</b>\\c[0] Es que nunca he salido de <b>Ciudad Verde</b>. ¡No... no sé en qué dirección está <b>Pueblo Paleta</b>!': '\\c[2]<b>???:</b>\\c[0] 난 상록시티 밖으로 나가 본 적이 없어. 태초마을이... 어느 방향인지 모르겠어!',
      '\\c[2]<b>???:</b>\\c[0] ¿En esa dirección, dices?': '\\c[2]<b>???:</b>\\c[0] 그쪽이라고?',
      '\\c[2]<b>???:</b>\\c[0] Jo... y has tenido que venir a buscarme desde tan lejos. Anda que empiezo bien...': '\\c[2]<b>???:</b>\\c[0] 이런... 나 때문에 여기까지 와 준 거구나. 시작부터 이 모양이라니...',
      '\\c[2]<b>???:</b>\\c[0] Mi-mi nombre es <b>Rojo</b>.': '\\c[2]<b>???:</b>\\c[0] 내-내 이름은 <b>레드</b>야.',
      '\\c[2]<b>Rojo:</b>\\c[0] Yo... ¡te agradezco de veras que hayas venido a recogerme!': '\\c[2]<b>레드:</b>\\c[0] 나를 데리러 와 줘서 정말 고마워!',
      '¡Vaya resaca he pillado! Pero ya me encuentro mucho mejor.': '아이고, 숙취가 심했군! 그래도 이제 훨씬 나아졌어.',
      'Siento haber cortado la calle, ¿eh? Te daré esto como disculpa.': '길을 막아서 미안하구나. 사과의 뜻으로 이걸 줄게.',
      'Yo también fui entrenador hace mucho tiempo.': '나도 아주 오래전에는 트레이너였단다.',
      'Mi único consejo es que disfrutes de la experiencia, es lo mejor que te va a pasar en la vida.': '내 조언은 하나야. 이 모험을 마음껏 즐기렴. 아주 소중한 경험이 될 테니까.',

      '¿Sabes que dicen que los Clefairy vienen de la luna? ¡Aparecieron tras una lluvia de meteoritos en el <b>Mt. Moon</b>!': '삐삐가 달에서 왔다는 이야기를 들어 봤니? 달맞이산에 운석이 떨어진 뒤 나타났대!',
      '¡El despilfarro nunca es bueno! Pero reconozco que a veces se me ha ido la mano comprando más Pokéball de la cuenta.': '낭비는 좋지 않지! 나도 가끔 몬스터볼을 너무 많이 사 버리긴 하지만.',
      '<b>Ciudad Plateada</b> ha crecido mucho en los últimos años gracias al turismo cultural del museo.': '회색시티는 박물관을 찾는 관광객 덕분에 최근 몇 년 사이 크게 발전했어.',
      '¡Ahora estamos construyendo un cine!': '지금은 영화관도 짓고 있지!',
      'Al estar tan cerca del <b>Mt. Moon</b>, de vez en cuando hemos desenterrado algún que otro fósil por aquí.': '달맞이산과 가까워서 이 근처에서도 가끔 화석이 발굴돼.',
      'Me gusta observar el cuerpo musculoso de los obreros, ¡me hace recordar mi juventud! Ya que yo también era muy atlético.': '힘차게 일하는 인부들을 보면 젊은 시절이 떠오르는구나. 나도 꽤 운동을 잘했지.',
      '¡Cuando yo era chiquitito, esta ciudad solo tenía dos casas!': '내가 어릴 때만 해도 이 도시는 집이 두 채뿐이었단다!',
      'No hay muchos Entrenadores avezados por aquí, la mayoría son Cazabichos y Campistas.': '이 근처에는 노련한 트레이너가 많지 않아. 대부분 곤충채집소년이나 캠프보이 정도지.',
      'Sin embargo, tenemos al Líder de Gimnasio <b>Brock</b>, ¡y él sí que es de armas tomar!': '하지만 체육관 관장 브록은 정말 강한 상대야!',
      '¿Has visto mi Magnemite? Se trata de un Pokémon de tipo Acero.': '내 코일을 봤니? 강철타입 포켓몬이야.',
      'Dicho tipo tiene muchas resistencias, pero es raro de ': '강철타입은 여러 공격에 강하지만',
      'encontrar.': '만나기 쉽지 않아.',
      '¡Qué fresquito hace siempre por aquí! Se nota que estamos en clima de montaña.': '이곳은 늘 선선하네! 산악 지역이라는 게 느껴져.',
      'Aunque en invierno preferiría vivir en un lugar más cálido, como por ejemplo <b>Ciudad Fucsia</b>.': '겨울이라면 연분홍시티처럼 좀 더 따뜻한 곳에서 살고 싶지만.',
      'Parque Plateado': '회색시티 공원',
      '¿Tienes un Pokémon muy lento? ¡Eso no es un problema! Puedes usar esto.': '아주 느린 포켓몬이 있니? 괜찮아, 이걸 써 봐.',
      'Con la Garra Rápida, hasta los Pokémon lentos pueden atacar primero. Aunque necesitarás algo de suerte.': '선제공격손톱이 있으면 느린 포켓몬도 가끔 먼저 공격할 수 있어. 운이 조금 필요하지만.',
      '¿Buscas al líder <b>Brock</b>? Ahora mismo se encuentra disfrutando de su tiempo libre en el <b>Museo Pokémon</b>.': '브록 관장을 찾고 있니? 지금은 포켓몬 박물관에서 쉬고 있어.',
      'Aunque creo que le va tocando reincorporarse al trabajo, ¿por qué no vas a buscarle?': '이제 슬슬 체육관으로 돌아올 시간일 텐데. 한번 찾아가 볼래?',
      'Oye, ¿has pensado en retar al líder <b>Brock</b> antes de irte? ¡Es realmente fuerte!': '떠나기 전에 브록 관장에게 도전해 보는 건 어때? 정말 강해!',
      '<b>Brock</b> es muy fuerte, pero como es el primer líder suele ser benevolente con los nuevos Aspirantes.': '브록은 강하지만 첫 체육관 관장답게 새 도전자에게 맞춰 승부해 주는 편이야.',
      '¡Qué dilema! Tengo que irme a hacer un recado pero mi Slowpoke se ha puesto a descansar en este sitio y no hay quien lo mueva...': '곤란하네! 볼일을 보러 가야 하는데 야돈이 여기서 쉬기 시작해서 꿈쩍도 하지 않아...',
      '¡Pues tendré que irme a hacer los recados sin él! Pero necesito que alguien le eche un ojo mientras no estoy, no sea que se pierda.': '그럼 야돈은 두고 다녀와야겠어! 내가 없는 동안 길을 잃지 않게 누군가 좀 봐 줬으면 좋겠는데.',
      '¿Podrías vigilar a mi Slowpoke durante un ratito pequeñín?': '잠깐만 내 야돈을 지켜봐 줄래?',
      'En seguida vuelvo, ¿vale?': '금방 돌아올게, 알겠지?',
      'Y así pasó un "ratito pequeñín".': '그렇게 "잠깐"의 시간이 흘렀다.',
      '¡Menos mal que ha aparecido un alma bondadosa para cuidar de mi querido Pokémon!': '다행이다! 내 소중한 포켓몬을 돌봐 준 친절한 사람이 있었네!',
      'Toma esto que he comprado, por ser tan cuqui.': '고마우니까 내가 산 이걸 받아 줘.',
      '¡Vaya! Y yo que quería darte algo a cambio.': '이런! 답례로 뭔가 주고 싶었는데.',
      'Tenemos que volver a casa, pero mi Slowpoke sigue aquí tirado sin querer moverse.': '이제 집에 가야 하는데 야돈은 여전히 누워서 움직이려 하지 않네.',
      '¡Pero es que es tan mono cuando se pone a descansar! Cualquiera intenta molestarle.': '그래도 쉬고 있는 모습이 너무 귀여워서 차마 깨울 수가 없어!',
      'Mi Pikachu se ha escapado. Creo que se ha ido al <b>Bosque Verde</b>. ': '내 피카츄가 도망쳤어. 아마 상록숲으로 간 것 같아.',
      'Desde que me dieron este Togepi, se ha puesto muy celoso...': '이 토게피를 받은 뒤부터 질투가 심해졌거든...',
      'Me pregunto si estará bien.': '괜찮아야 할 텐데.',
      'Has encontrado a mi Pikachu, ¡gracias!': '내 피카츄를 찾아 줬구나! 고마워!',
      '¿Sabes? Creo que no me veo capaz de cuidar de dos Pokémon todavía.': '있잖아, 아직은 포켓몬 두 마리를 동시에 돌볼 자신이 없는 것 같아.',
      'Me gustaría que alguien cuidara de mi Togepi, ¿lo quieres?': '누군가 내 토게피를 잘 돌봐 줬으면 하는데, 네가 맡아 줄래?',
      'Tendré que esperar a otro Entrenador que sea capaz de cuidar a este Togepi.': '이 토게피를 맡아 줄 다른 트레이너를 기다려야겠네.',
      '¡Cuida bien de Togepi! Puede llegar a convertirse en un Pokémon muy fuerte.': '토게피를 잘 부탁해! 아주 강한 포켓몬으로 자랄 수도 있어.',
      'Vaya... pues tendré que buscar otra solución.': '그렇구나... 다른 방법을 찾아봐야겠네.',
      'Mi Pikachu y yo estamos muy bien últimamente.': '요즘은 피카츄와 아주 잘 지내고 있어.',
      '¿Cómo está Togepi? ¿Sabías que puede evolucionar si se siente feliz con su entrenador?': '토게피는 잘 지내니? 트레이너와 충분히 친해지면 진화할 수 있다는 거 알고 있었어?',
      'Aún no he encontrado a ningún Entrenador que pueda hacerse cargo de Togepi. Supongo que de a poco Pikachu le irá tomando cariño.': '아직 토게피를 맡아 줄 트레이너를 못 찾았어. 시간이 지나면 피카츄도 조금씩 정이 들겠지.',
      '¿Sabías que puedes revisar cómo evoluciona cualquier Pokémon que tengas capturado en tu <b>Pokédex</b>? ': '포획한 포켓몬의 진화 방법은 포켓몬 도감에서 확인할 수 있다는 거 알고 있었니?',
      '¡Oh, hola! Mi nombre es <b>Casimiro</b>, y soy fotógrafo. Vengo desde la región de Galar y me encanta retratar a los Entrenadores y sus Pokémon durante su ': '안녕! 내 이름은 <b>카시미로</b>, 사진작가야. 가라르지방에서 왔고 여행 중인 트레이너와 포켓몬의 모습을 찍는 걸 좋아하지.',
      'viaje.': '멋진 여행의 순간을 사진으로 남겨 주고 있어.',
      '¡Hola de nuevo! ¿Te acuerdas de mí? Soy <b>Casimiro</b>, el fotógrafo.': '또 만났네! 나 기억하지? 사진작가 <b>카시미로</b>야.',
      '\\G¿Te gustaría tomarte una foto con tu equipo de recuerdo? Solo son 500$.': '\\G팀과 함께 기념사진을 찍을래? 500원만 받으면 돼.',
      'Vaya, parece que no tienes suficiente dinero... ¡Vuelve cuando quieras!': '이런, 돈이 조금 부족한 것 같네... 언제든 다시 와!',
      '\\G¡Perfecto! Ve a colocarte para la foto.': '\\G좋아! 사진 찍을 자리에 서 줘.',
      'Bien, saca a tus Pokémon para poder tomaros la foto.': '좋아, 사진을 찍을 수 있게 포켓몬들을 꺼내 줘.',
      '¡Perfecto, ha quedado muy bien!': '좋아, 아주 잘 나왔어!',
      'Habéis salido muy favorecidos. ¡Espero que te guste!': '너희 모두 멋지게 찍혔어. 마음에 들면 좋겠다!',
      'Por cierto, ya que es la primera vez que hablamos... Voy a hacerte entrega de un objeto con el que vas a poder ver todas las fotos que te vayas haciendo. ¡Invita la ': '참, 처음 만난 기념으로 지금까지 찍은 사진을 확인할 수 있는 도구를 하나 줄게. 이건 내가 서비스로',
      'casa!': '주는 거야!',
      'Con el <b>Álbum</b> podrás revisar todas las fotos que te hagas. ¡Viene muy bien para rememorar tus aventuras por la región!': '<b>앨범</b>을 사용하면 찍은 사진을 다시 볼 수 있어. 모험의 추억을 떠올리기 좋지!',
      '¡Hasta la próxima!': '다음에 또 보자!',
      'Vaya, es una pena. Si cambias de parecer no dudes en hablar conmigo.': '아쉽네. 마음이 바뀌면 언제든 나에게 말해 줘.',

      '¿Has entrado en la Cafetería? Hay gente intercambiando Pokémon y esas cosas.': '카페에 가 봤니? 포켓몬을 교환하는 사람들도 있더라.',
      'Mmm... mi Pokémon nota la presencia de un campo psíquico enorme en la <b>Cueva Celeste</b>.': '음... 내 포켓몬이 블루시티동굴 쪽에서 아주 강한 사이코 에너지를 느끼고 있어.',
      '¿Qué lo estará causando?': '대체 무엇 때문일까?',
      '¿Estás llenando una Enciclopedia Pokémon para el <b>Prof. Oak</b>? Suena bastante divertido, pero prefiero dar un paseo con la bici.': '오박사님을 위해 포켓몬 도감을 채우고 있니? 재미있겠지만 난 자전거 타는 게 더 좋아.',
      'Atrapar, entrenar, combatir... ¡Nunca pensé que la vida de Entrenador sería tan dura! ': '포획하고, 훈련하고, 배틀하고... 트레이너 생활이 이렇게 힘든 줄 몰랐어!',
      '¿Hay recompensa al final de esto?': '끝까지 가면 뭔가 보상이 있겠지?',
      'Mi novio me dio esto el otro día, se lo trajo del <b>Mt. Moon</b>.': '남자친구가 얼마 전 달맞이산에서 가져왔다며 이걸 줬어.',
      'La verdad es que solo es un puñado de polvo.': '사실 보기에는 그냥 가루 한 줌 같지만.',
      'Tal vez las cosas sean más de lo que aparentan a simple vista. También se aplica a personas y Pokémon.': '겉보기보다 더 큰 가치가 있을지도 몰라. 사람이나 포켓몬도 마찬가지겠지.',
      'Le estoy tomando declaración a este señor. Le ha entrado a robar el <b>Team Rocket</b> en su casa. ': '이분에게 피해 상황을 듣는 중이야. 로켓단이 집에 침입했거든.',
      '¿Que te gustaría saber más? ¡Esto es trabajo de la policía! Tú deberías estar consiguiendo medallas.': '더 알고 싶다고? 이건 경찰의 일이야! 너는 체육관 배지에 집중하도록 해.',
      '¡Esos malnacidos del <b>Team Rocket</b>...! Se metieron en mi casa durante una persecución policial y me la dejaron llena de destrozos.': '그 로켓단 녀석들...! 경찰에게 쫓기다가 우리 집에 들어와서는 엉망으로 만들어 놨어.',
      '¡Te doy la bienvenida a <b>Ciudad Celeste</b>! Dicen que aquí bebemos el agua más pura de toda la región, directamente de la montaña.': '블루시티에 온 걸 환영해! 이곳에서는 산에서 내려오는 아주 맑은 물을 마실 수 있어.',
      'Supongo que por esa razón nuestra líder se especializa en el tipo Agua.': '그래서 우리 체육관 관장이 물타입 전문가가 된 걸지도 모르지.',
      'La historia de cómo conocí a mi Voltorb es graciosa, ¡lo confundí con una Pokéball!': '내 찌리리공을 처음 만났을 때 몬스터볼인 줄 착각했어!',
      'Al menos la Pokéball la hubiera podido usar para capturar a un Pokémon más fuerte. Pero bueno, así son las cosas.': '진짜 몬스터볼이었다면 더 강한 포켓몬을 잡는 데 썼겠지만... 뭐, 이것도 인연이지.',
      '¿Has estado en la <b>Cueva Celeste</b>? Seguramente no, porque la entrada está cerrada.': '블루시티동굴에 가 본 적 있니? 아마 없을 거야. 입구가 닫혀 있거든.',
      'Los Pokémon de esa cueva son <b>peligrosísimos</b>. ¡Hasta un Líder de Gimnasio estaría en problemas ahí dentro!': '그 동굴의 포켓몬은 아주 위험해. 체육관 관장도 방심하면 곤란할 정도야!',
      '<b>Misty:</b> ¿Te vienes al mirador del faro de la <b>Ruta 21</b>?': '<b>이슬:</b> 21번도로 등대 전망대에 같이 갈래?',
      '¡De vez en cuando se pueden ver Pokémon de tipo Agua muy raros!': '가끔 아주 희귀한 물타입 포켓몬을 볼 수 있대!',
      '<b>Chica:</b> ¡Sí! ¡Suena genial! Así pasamos un rato divertido.': '<b>소녀:</b> 좋아! 재미있겠다. 같이 놀다 오자!',
      '¡Ey!': '어이!',
      '\\c[1]<b>\\v[12]:</b>\\c[0] ¡Hombre, \\PN! ¿Al final has conseguido tu primera medalla?': '\\c[1]<b>\\v[12]:</b>\\c[0] 오, \\PN! 드디어 첫 번째 배지를 얻었구나?',
      '¡Me dejas muy sorprendido!': '제법인데! 놀랐어.',
      '¿Y la <b>Pokédex</b>? ¿La estás llenando como nos pidió mi abuelo? ¡Yo ya tengo más de 30 especies diferentes!': '포켓몬 도감은 어때? 할아버지가 부탁한 대로 채우고 있지? 난 벌써 30종 넘게 모았어!',
      '\\c[1]<b>\\v[12]:</b>\\c[0] Se podría decir que he nacido para ser Entrenador. Atraigo a los Pokémon con mi instinto natural.': '\\c[1]<b>\\v[12]:</b>\\c[0] 난 트레이너가 되려고 태어났다고 해도 되겠지. 감각만으로도 포켓몬이 모여든다니까.',
      '\\c[1]<b>\\v[12]:</b>\\c[0] ¿Quieres ver el equipo Pokémon que me he formado?': '\\c[1]<b>\\v[12]:</b>\\c[0] 내가 만든 포켓몬 팀을 한번 볼래?',
      '\\c[1]<b>\\v[12]:</b>\\c[0] Como veo que has progresado, aunque sea penosamente, te contaré algo.': '\\c[1]<b>\\v[12]:</b>\\c[0] 그래도 조금은 성장한 것 같으니 좋은 정보를 하나 알려 주지.',
      '\\c[1]<b>\\v[12]:</b>\\c[0] Al otro lado del puente vive un famoso <b>Pokémaniaco</b> llamado <b>Bill</b>.': '\\c[1]<b>\\v[12]:</b>\\c[0] 다리 건너편에는 빌이라는 유명한 포켓몬 마니아가 살고 있어.',
      'Conseguí convencerle para que me enseñara unos cuantos Pokémon raros y así he conseguido llenar un poco la <b>Pokédex</b>.': '빌에게 희귀한 포켓몬을 몇 마리 보여 달라고 해서 도감도 꽤 채웠지.',
      '\\c[1]<b>\\v[12]:</b>\\c[0] ¡Es lo que tiene tener don de gentes! En la vida hay otras cualidades, aparte de la fuerza.': '\\c[1]<b>\\v[12]:</b>\\c[0] 사람을 잘 사귀는 것도 능력이야! 세상에는 힘 말고도 중요한 게 많다고.',
      'En fin, mejor me voy. ¡Hasta luego!': '그럼 난 이만 갈게. 또 보자!',

      'El mar... ¿Qué secretos por descubrir guardará todavía este vasto lienzo azul?': '바다라... 이 끝없는 푸른빛 속에는 아직 어떤 비밀이 숨어 있을까?',
      'He comprado este terreno para iniciar mi gran proyecto urbanístico, el cual será el primer <b>Frente Batalla</b> de <b>Kanto</b>.': '이 땅을 사서 관동 최초의 배틀프런티어를 세울 거야.',
      'Si vuelves en algún momento indeterminado del futuro y cumples con una serie de condiciones aleatorias impredecibles, a lo mejor te lo encuentras construido.': '언젠가 먼 훗날 여러 조건이 맞는다면 완성된 모습을 볼 수도 있겠지.',
      'Cuando termino de hacer deporte estoy tan pegajosa que parezco un Grimer.': '운동을 끝내면 땀범벅이 돼서 질퍽이처럼 느껴질 때가 있어.',
      'Por cierto, ¿sabías que los Grimer se originan a partir del lodo depositado en el fondo del mar?': '그런데 질퍽이가 바다 밑바닥의 오염된 진흙에서 생겨난다는 이야기 알고 있었어?',
      'En <b>Ciudad Carmín</b> los barcos vienen y van. Todos los días ves caras nuevas y exóticas de otras partes del mundo.': '갈색시티에는 배가 끊임없이 드나들어서 매일 세계 각지의 새로운 사람들을 볼 수 있어.',
      'El líder <b>Surge</b> luchó en la guerra con una región lejana del otro lado del mar.': '마티스 관장은 바다 건너 먼 지역에서 벌어진 전쟁에 참전했다고 해.',
      'Siempre dice que los jóvenes deberíamos apreciar más estos tiempos de paz.': '그래서 젊은 사람들은 지금의 평화를 더 소중히 여겨야 한다고 늘 말하지.',
      '¿Has estado en el <b>Túnel Diglett</b>? Atraviesa decenas de kilómetros bajo el suelo.': '디그다의굴에 가 봤니? 땅속으로 수십 킬로미터나 이어져 있어.',
      'Por lo visto, los Diglett tienen galerías como esas por todo el mundo.': '디그다는 세계 곳곳에 그런 굴을 만들어 놓는 모양이야.',
      '¿Tú eres más de Growlithe, el Pokémon perrito, o de Meowth, el Pokémon gatito?': '너는 강아지포켓몬 가디가 좋아, 아니면 고양이포켓몬 나옹이 좋아?',
      'Bueno, ¿para qué elegir si puedes tener los dos? Son Pokémon bastante comunes.': '뭐, 둘 다 키우면 되지! 둘 다 비교적 흔한 포켓몬이니까.',
      '¡Vaya! He pescado un objeto interesante, ¿lo quieres?': '오! 재미있는 물건을 낚았는데, 너 가질래?',
      'Parece algún tipo de recuerdo, ¿a quién pertenecería?': '기념품 같은데... 원래 누구 물건이었을까?',
      'Tal vez algún día pesque un billete de lotería premiado.': '언젠가는 당첨된 복권도 낚을 수 있겠지.',
      'Aunque ahora mismo estoy más cerca de pescar un resfriado. ¡Achís!': '지금은 감기나 낚을 것 같지만. 에취!',
      'Los reportes de delitos del <b>Team Rocket</b> se han disparado. Robos, extorsiones, vandalismo...': '로켓단 관련 범죄 신고가 급증했어. 절도, 갈취, 기물 파손까지...',
      'Sospecho que están maquinando un plan catastrófico y que buscan recursos para llevarlo a cabo.': '큰일을 꾸미면서 필요한 자원을 모으고 있는 게 아닌가 의심하고 있어.',
      'El <b>S.S. Anne</b> es un barco de alta categoría, una de las mejores obras de ingeniería naval que he presenciado.': 'S.S. 안느호는 최고급 여객선이야. 내가 본 선박 중에서도 손꼽히는 작품이지.',
      'En esta playa puedes encontrar una buena variedad de Pokémon de tipo Agua.': '이 해변에서는 여러 종류의 물타입 포켓몬을 만날 수 있어.',
      'Es la diferencia con otras playas más desoladas como la de <b>Ciudad Fucsia</b>, en la que solo encuentras Tentacool.': '왕눈해만 잔뜩 보이는 연분홍시티 쪽 해변과는 다르지.',
      'Este es el muelle reservado para el <b>S.S. Anne</b>, el crucero más lujoso y exclusivo del mundo.': '이곳은 세계적인 호화 여객선 S.S. 안느호 전용 부두입니다.',
      'No puedo dejarte pasar si no tienes un <b>Ticket Barco</b>.': '승선권이 없으면 들어갈 수 없습니다.',
      'Veo que tienes un <b>Ticket Barco</b>. ¡Adelante, pasa!': '승선권을 가지고 있군요. 들어가셔도 좋습니다!',
      'El <b>S.S. Anne</b> te espera.': 'S.S. 안느호가 기다리고 있습니다.',
      'El <b>S.S. Anne</b> es el crucero más lujoso y exclusivo del mundo, ¡no hay otro igual!': 'S.S. 안느호는 세계 최고급 여객선입니다. 그만한 배는 또 없죠!',

      '<b>Vito:</b> Las energías de este lugar son...': '<b>비토:</b> 이곳의 에너지는...',
      '<b>Leti:</b> ¡Místicas! ¡Vibrantes! ¡Estimulantes!': '<b>레티:</b> 신비롭고! 생동감 넘치고! 자극적이야!',
      '<b>Vito:</b> ¿Será por la presencia del <b>Monte Plateado</b>?': '<b>비토:</b> 은빛산의 영향일까?',
      '<b>Leti:</b> En cualquier caso, tanta estimulación mental nos lleva...': '<b>레티:</b> 어쨌든 이 강렬한 기운을 느끼니...',
      '<b>Vito:</b> A querer combatir con toda nuestra energía. ¿Aceptas nuestro reto?': '<b>비토:</b> 온 힘을 다해 싸우고 싶어지는군. 우리와 승부할래?',
      '<b>Vito:</b> Nunca antes nos habían derrotado así. Pensábamos que éramos...': '<b>비토:</b> 이렇게 진 적은 처음이야. 우리는 스스로를...',
      '<b>Leti:</b> Invencibles. Tendremos que trabajar nuestro orgullo cuando volvamos a casa. Mientras tanto...': '<b>레티:</b> 무적이라고 생각했지. 돌아가면 자만심부터 고쳐야겠어. 그 전에...',
      '<b>Vito:</b> Puedes quedarte con esto, por haber logrado una hazaña tan magnífica.': '<b>비토:</b> 멋진 승부를 보여 줬으니 이걸 받아.',
      '<b>Vito:</b> No te preocupes, no todo el mundo está listo para...': '<b>비토:</b> 괜찮아. 누구나 준비되어 있는 건 아니니까...',
      '<b>Leti:</b> Nuestros poderes psíquicos combinados. ¡Vuelve si cambias de idea!': '<b>레티:</b> 우리의 합동 초능력에 말이야! 마음이 바뀌면 다시 와!',
      '¡Es un <b>Nido Alfa</b>! En él vive un Pokémon muy fuerte.': '알파 둥지다! 아주 강한 포켓몬이 살고 있다.',
      'En concreto, sientes la presencia de un Pokémon Dragón muy poderoso.': '특히 강력한 드래곤타입 포켓몬의 기척이 느껴진다.',

      '¡La tecnología de hoy en día es increíble!': '요즘 기술은 정말 대단해!',
      'Una pena que nos la perdamos porque internet no llega bien hasta <b>Pueblo Paleta</b>.': '다만 태초마을은 인터넷이 잘 안 들어와서 아쉽지.',
      'Me gustan las flores, ¡qué bien que haya tantas por aquí!': '나는 꽃을 좋아해. 이 주변에 꽃이 많아서 정말 좋아!',
      'Aunque si algún día llega una persona alérgica, lo va a pasar bastante mal...': '알레르기가 있는 사람에게는 조금 힘들겠지만...',
      '¡Pronto me convertiré en Entrenador Pokémon! Solo me faltan unos meses para cumplir los 10 años...': '나도 곧 포켓몬 트레이너가 될 거야! 열 살이 되기까지 몇 달만 남았어...',
      '¡No puedo esperar a saber cuál será mi Pokémon inicial!': '첫 포켓몬이 누가 될지 정말 기대돼!',
      '¡Espera, \\PN!': '잠깐, \\PN!',
      '<b>Prof. Oak:</b> ¿Pero a dónde vas, insensato? ¿No sabes lo peligroso que es meterse en la hierba alta sin tener Pokémon?': '<b>오박사:</b> 어디 가는 거니? 포켓몬도 없이 풀숲에 들어가면 위험하단다!',
      '<b>Prof. Oak:</b> ¿Pero a dónde vas, insensata? ¿No sabes lo peligroso que es meterse en la hierba alta sin tener Pokémon?': '<b>오박사:</b> 어디 가는 거니? 포켓몬도 없이 풀숲에 들어가면 위험하단다!',
      '<b>Prof. Oak:</b> ¿Pero a dónde crees que vas? ¿No sabes lo peligroso que es meterse en la hierba alta sin tener Pokémon?': '<b>오박사:</b> 어디 가는 거니? 포켓몬도 없이 풀숲에 들어가면 위험하단다!',
      '<b>Prof. Oak:</b> Vamos a ponerle remedio a eso, anda. ¡Acompáñame al laboratorio! ': '<b>오박사:</b> 그럼 해결해 보자. 연구소로 같이 가자!',
      '¿Acabas de empezar tu aventura Pokémon? ¡Pues no olvides visitar la tienda!': '포켓몬 모험을 막 시작했니? 상점을 꼭 이용해 봐!',
      'La encontrarás dentro de cada Centro Pokémon. ¡Mira, te daré una Poción de muestra!': '포켓몬센터에서 필요한 물건을 살 수 있어. 자, 이 상처약은 선물이야!',
      '¿Ves esos pequeños bordillos? Pueden dar un poco de miedo, pero puedes saltarlos si no eres demasiado torpe.': '저 낮은 턱이 보이지? 아래쪽으로는 뛰어넘을 수 있어.',
      '¡Vamos, que yo por ejemplo mejor me voy olvidando!': '길을 빠르게 이동할 때 잘 활용해 봐!',
      '¿Vas a enfrentarte al líder <b>Brock</b>? Sus Pokémon de tipo Roca son muy defensivos.': '브록에게 도전할 거니? 바위타입 포켓몬은 방어가 단단해.',
      'Te aconsejo que vayas con algo de tipo Agua o de tipo Planta.': '물타입이나 풀타입 포켓몬을 준비하면 유리할 거야.',
      'Al norte de la ciudad vive un famoso Pokémaniaco llamado <b>Bill</b>.': '도시 북쪽에는 빌이라는 유명한 포켓몬 마니아가 살고 있어.',
      'Yo fui profesor suyo en el colegio. La verdad es que de pequeño ya demostró tener una gran inteligencia.': '내가 학교에서 가르쳤는데, 어릴 때부터 아주 영리한 아이였지.',
      'Hemos cortado la salida de <b>Ciudad Celeste</b> hasta que terminemos una operación contra el <b>Team Rocket</b>.': '로켓단 관련 작전이 끝날 때까지 블루시티 출구를 통제하고 있습니다.',
      '¡Disculpa las molestias!': '불편을 드려 죄송합니다!',
      '¡El Pokémon que te indicó el profesor Gabriel ha huido tras ser derrotado!': '가브리엘 박사가 알려 준 포켓몬이 패배한 뒤 도망쳤다!',
      '¡Has capturado uno de los legendarios que te pidió el profesor Gabriel!': '가브리엘 박사가 부탁한 전설의 포켓몬 한 마리를 포획했다!',
      '¡Has encontrado a los 2 Pokémon Legendarios! Ve a hablar con el profesor en el Laboratorio de Pueblo Paleta.': '전설의 포켓몬 2마리를 모두 찾았다! 태초마을 연구소의 가브리엘 박사에게 가 보자.',
      '¡Has encontrado a los 3 Pokémon Legendarios! Ve a hablar con el profesor en el Laboratorio de Pueblo Paleta.': '전설의 포켓몬 3마리를 모두 찾았다! 태초마을 연구소의 가브리엘 박사에게 가 보자.',
      '¡Has encontrado a los 4 Pokémon Legendarios! Ve a hablar con el profesor en el Laboratorio de Pueblo Paleta.': '전설의 포켓몬 4마리를 모두 찾았다! 태초마을 연구소의 가브리엘 박사에게 가 보자.',
      'Todavía quedan Pokémon Legendarios por ser encontrados. Habla con el profesor Gabriel si necesitas más información.': '아직 찾지 못한 전설의 포켓몬이 남아 있다. 더 자세한 정보는 가브리엘 박사에게 물어보자.',
      'Has perdido el reto Nuzlocke, has fallado a todos los Pokémon que te han acompañado durante': '너즐록 도전에 실패했다. 함께 모험한 모든 포켓몬에게',
      'la aventura.': '미안한 결과가 되어 버렸다.',
      'Puedes seguir jugando de forma normal, pero ': '게임은 계속 정상적으로 진행할 수 있지만,',
      'recuerda que has fracasado.': '너즐록 도전에는 실패했다는 점을 기억하자.',
      '<b>Bill:</b> ¡A ti te estaba yo buscando, \\PN!': '<b>빌:</b> 마침 널 찾고 있었어, \\PN!',
      '<b>Bill:</b> Sé que no has tenido mucho tiempo a descansar, pero quiero proponerte algo.': '<b>빌:</b> 쉴 틈이 별로 없었겠지만, 한 가지 제안하고 싶은 게 있어.',
      'Me voy a marchar una temporadita a tierras exóticas para desarrollar una investigación que estimo que será apasionante.': '한동안 먼 지역으로 가서 아주 흥미로운 연구를 진행할 생각이야.',
      'Y me gustaría que me acompañaras.': '네가 함께 가 줬으면 해.',
      'Dime, ¿has oído hablar de la <b>Isla Prisma</b>?': '프리즘섬이라는 곳을 들어 본 적 있니?',
      'Es un misterioso lugar que se encuentra al este de <b>Kanto</b>. Una pequeña región de costumbres tradicionales que hasta hace poco había estado': '관동 동쪽에 있는 신비로운 섬이야. 전통적인 풍습을 간직한 작은 지역인데 최근까지는',
      'cerrada a los turistas.': '관광객의 출입이 제한되어 있었지.',
      'La propia gobernadora de la isla me ha convocado para que le ayude en unos enigmas, y le gustaría que tú también vinieras.': '섬의 총독이 직접 수수께끼 조사에 도움을 요청했어. 너도 함께 와 주길 바란다고 하더군.',
      '¿Qué me dices? ¿Te embarcas conmigo en una aventura más?': '어때? 나와 함께 새로운 모험을 떠나 볼래?',
      'En ese caso, cogeremos mi barco... ¡rumbo a la <b>Isla Prisma</b>!': '그럼 내 배를 타고 프리즘섬으로 출발하자!',
      'De acuerdo, aún tienes cosas que hacer. Seguiré por aquí para cuando lo tengas todo listo.': '알겠어. 아직 할 일이 있구나. 준비가 끝날 때까지 여기서 기다릴게.'
    };
    const translated = text.split('\n').map(line => storyLineKorean[line] || line).join('\n');
    return translated
      .replace(/Prof\. Oak/gi, '오박사').replace(/Profesor Oak/gi, '오박사')
      .replace(/Pueblo Paleta/gi, '태초마을').replace(/Ciudad Verde/gi, '상록시티')
      .replace(/Ciudad Plateada/gi, '회색시티').replace(/Ciudad Celeste/gi, '블루시티')
      .replace(/Ciudad Carmín/gi, '갈색시티').replace(/Medalla Cascada/gi, '블루배지')
      .replace(/Medalla Roca/gi, '회색배지').replace(/Pokémon inicial/gi, '첫 번째 포켓몬')
      .replace(/Centro Pokémon/gi, '포켓몬센터').replace(/Gimnasio Pokémon/gi, '포켓몬 체육관')
      .replace(/Team Rocket/gi, '로켓단').replace(/Ticket Barco/gi, '승선권')
      .replace(/Mt\. Moon/gi, '달맞이산').replace(/Monte Plateado/gi, '은빛산')
      .replace(/Ruta 24/gi, '24번도로').replace(/Ruta 21/gi, '21번도로')
      .replace(/Bosque Verde/gi, '상록숲').replace(/Ciudad Fucsia/gi, '연분홍시티')
      .replace(/Túnel Roca/gi, '돌산터널').replace(/Túnel Diglett/gi, '디그다의굴')
      .replace(/Cueva Celeste/gi, '블루시티동굴').replace(/Pokémaniaco/gi, '포켓몬 마니아')
      .replace(/Oeste/gi, '서쪽').replace(/Este/gi, '동쪽').replace(/Ruta\s+(\d+)/gi, '$1번도로')
      .replace(/Kanto/gi, '관동')
      .replace(/Surge/gi, '마티스').replace(/Brock/gi, '브록').replace(/Misty/gi, '이슬');
  }
  async askStory(text, options = ['Z'], cancel = 0, recovery = false) {
    const d = this.storyDialog;
    this.input.switchPressed = this.input.ballPressed = this.input.menuPressed = false;
    d.text.textContent = this.storyText(text); d.choices.replaceChildren(); d.selected = 0; d.cancel = cancel;
    d.navCooldown = 0; d.recovery = recovery;
    d.buttons = options.map((label, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = this.storyText(label);
      let armed = false;
      button.addEventListener('pointerdown', () => { armed = true; });
      button.addEventListener('pointercancel', () => { armed = false; });
      button.addEventListener('click', event => { if (armed || event.detail === 0) this.answerStory(index); armed = false; });
      d.choices.append(button); return button;
    });
    this.selectStoryChoice(0);
    d.box.hidden = false;
    return new Promise(resolve => { d.resolve = resolve; });
  }
  selectStoryChoice(index) {
    const d = this.storyDialog;
    if (!d?.buttons?.length) return;
    d.selected = (index + d.buttons.length) % d.buttons.length;
    d.buttons.forEach((button, i) => {
      button.classList.toggle('is-selected', i === d.selected);
      button.setAttribute('aria-selected', String(i === d.selected));
    });
  }
  answerStory(index) {
    const d = this.storyDialog;
    if (!d.resolve) return;
    const resolve = d.resolve; d.resolve = null; d.box.hidden = true;
    d.recovery = false; d.navCooldown = 0;
    this.input.switchPressed = this.input.ballPressed = this.input.menuPressed = false;
    resolve(index);
  }
  captureStorySafeState() {
    if (!this.storyRenderer || !this.story?.mapId) return null;
    const actor = this.activePokemon || this.trainer;
    const direction = ({down: 2, left: 4, right: 6, up: 8})[actor.direction] || this.story.direction || 2;
    const snapshot = JSON.parse(JSON.stringify(this.story));
    snapshot.mapId = this.story.mapId;
    snapshot.x = Math.floor(actor.x / 32); snapshot.y = Math.floor(actor.y / 32); snapshot.direction = direction;
    snapshot.eventCheckpoint = null;
    snapshot.mapEvents = {mapId: snapshot.mapId, positions: structuredClone(this.storyPositions), erased: [...this.erasedStoryEvents]};
    return {story: snapshot, mapId: snapshot.mapId, x: snapshot.x, y: snapshot.y, direction,
      positions: structuredClone(this.storyPositions), erased: [...this.erasedStoryEvents]};
  }
  async recoverStoryState() {
    const snapshot = this.storyRecoverySnapshot;
    if (!snapshot || this.recovering) return false;
    this.recovering = true; this.storyBusy = true;
    try {
      this.story = JSON.parse(JSON.stringify(snapshot.story));
      this.story.eventCheckpoint = null; this.interpreter.state = this.story;
      this.interpreter.error = null; this.interpreter.frames = []; this.interpreter.running = false;
      this.storyError = null; this.proxyContext = null; this.storyBattle = null; this.gymArena = null;
      this.combatSystem.clear(); this.partyBattle.clear(); this.enemies = [];
      this.levelUpQueue = []; this.currentLevelEvent = this.currentMoveLearn = null;
      this.transition = null; this.captureTarget = null; this.captureSystem.lockedTarget = null;
      this.ui.hideLevelChoices(); this.ui.hideGameMenu(); this.menuOpen = false;
      for (const pokemon of this.partyPokemon) pokemon.inField = false;
      await this.transferStory(snapshot.mapId, snapshot.x, snapshot.y, snapshot.direction);
      this.storyPositions = structuredClone(snapshot.positions); this.erasedStoryEvents = new Set(snapshot.erased);
      this.story.mapEvents = {mapId: snapshot.mapId, positions: structuredClone(snapshot.positions), erased: [...snapshot.erased]};
      this.mode = 'trainer'; this.activePokemon = null; this.camera.follow(this.trainer, 1);
      this.storyFailedEvent = this.storyRecoveryFailure ? {...this.storyRecoveryFailure, x: snapshot.x, y: snapshot.y} : null;
      this.storyRecoverySnapshot = null; this.storyRecoveryFailure = null;
      this.storyPreviousMapState = null; this.storyEntryPoint = null;
      this.message('미구현 구간을 벗어나 이전 위치로 돌아왔습니다.', 3);
      return true;
    } catch (error) {
      this.storyError = error; this.message(`복구 오류: ${error.message}`, 4); return false;
    } finally { this.recovering = false; this.storyBusy = false; }
  }
  async handleStoryFailure(error, snapshot, failure = null) {
    this.storyError = error;
    const actor = this.activePokemon || this.trainer;
    const atEntry = this.storyEntryPoint?.mapId === this.story.mapId &&
      Math.floor(actor.x / 32) === this.storyEntryPoint.x && Math.floor(actor.y / 32) === this.storyEntryPoint.y;
    this.storyRecoverySnapshot = failure && atEntry && this.storyPreviousMapState ? this.storyPreviousMapState : snapshot;
    this.storyRecoveryFailure = this.storyRecoverySnapshot === snapshot ? failure : null;
    await this.askStory(`스토리 미구현 구간입니다.\nX 또는 뒤로가기를 누르면 이전 위치로 돌아갑니다.\n${error.message}`,
      ['이전 위치로 돌아가기'], 0, true);
    await this.recoverStoryState();
  }
  async transferStory(id, x, y, direction = 2) {
    const previousMapId = Number(this.story?.mapId);
    if (!this.recovering && this.storyRenderer?.map && this.story?.mapId && id !== this.story.mapId)
      this.storyPreviousMapState = this.captureStorySafeState();
    const map = await this.storyRenderer.load(id);
    const colliders = [], tileset = this.storyRenderer.tileset;
    for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) {
      for (let z = map.data.z - 1; z >= 0; z--) {
        const tile = this.storyRenderer.tileAt(tx, ty, z); if (!tile) continue;
        if ((tileset.passages.values[tile] & 15) === 15) { colliders.push({x: tx * 32, y: ty * 32, width: 32, height: 32}); break; }
        if (!tileset.priorities.values[tile]) break;
      }
    }
    this.storyBaseColliders = colliders;
    this.map = {id: `story_${id}`, name: this.storyMapName(map.name), width: map.width * 32, height: map.height * 32,
      tileSize: 32, playerStart: {x: (x + .5) * 32, y: (y + .5) * 32}, colliders: [...colliders], npcs: [], objects: [], spawnZones: []};
    const wildLevelRange = window.SurvivorRPG.StoryState.wildLevelRange(this.story, id);
    this.map.spawnZones = window.SurvivorRPG.StorySpawnSystem.zones(this.storyRenderer,
      this.storyData.encounters[id] || {}, !!this.story.switches[64], wildLevelRange);
    this.currentMapId = this.map.id; this.currentHuntingArea = null; this.survival = null;
    this.camera.world = this.map; this.combatSystem.world = this.map;
    this.spawnSystem.setMap(this.map); this.combatSystem.clear(); this.partyBattle.clear(); this.enemies = [];
    this.trainer.x = this.map.playerStart.x; this.trainer.y = this.map.playerStart.y;
    this.trainer.radius = 10; this.trainer.movementSpeed = 140;
    this.trainer.direction = ({2: 'down', 4: 'left', 6: 'right', 8: 'up'})[direction] || this.trainer.direction;
    this.mode = 'trainer'; this.activePokemon = null;
    this.story.mapId = id; this.story.x = x; this.story.y = y; this.story.direction = direction || 2;
    this.storyEntryPoint = {mapId: id, x, y};
    this.camera.x = this.trainer.x - this.camera.width / 2; this.camera.y = this.trainer.y - this.camera.height / 2; this.camera.clamp();
    this.autoruns.clear(); this.storyPositions = {}; this.erasedStoryEvents.clear();
    if (this.story.mapEvents?.mapId !== id) delete this.story.mapEvents;
    await this.prepareStoryProxies(id);
    this.placeStoryNpcsAtDoors();
    this.refreshStoryColliders();
    if (id === 4 && !this.story.reachedViridian) {
      this.story.reachedViridian = true;
      this.story.healingSpot = {mapId: 4, x: 52, y: 38, direction: 2};
      this.storyAutoSavePending = true;
      this.message('상록시티에 도착했다! 이제 쓰러지면 포켓몬센터 앞에서 회복한다. 다음은 북쪽 2번도로와 상록숲이다.', 7);
    } else if (!this.recovering && previousMapId !== id && this.partyPokemon?.length) this.showStoryObjective(5);
  }
  storyOutdoorPlan(mapId = this.story.mapId) {
    const plans = {
      2: {blocked: [5, 6, 7, 8, 11, 12, 13, 14], proxies: [
        {id: 'oak-starter', label: '오박사', x: 27, y: 30, sourceMapId: 29, eventId: 1, action: 'starter'}
      ]},
      4: {blocked: [44], proxies: [
        {id: 'viridian-joy', label: '간호순', x: 52, y: 37, sourceMapId: 31, eventId: 6, choicePrompt: '포켓몬을 치료할까요?'},
        {id: 'viridian-ball-seller', label: '몬스터볼 상인', x: 48, y: 37, sourceMapId: 31, eventId: 8, action: 'ball-shop'}
      ]},
      5: {blocked: [11], proxies: []},
      9: {blocked: [35, 36, 37], proxies: [
        {id: 'pewter-joy', label: '간호순', x: 24, y: 46, sourceMapId: 36, eventId: 7, choicePrompt: '포켓몬을 치료할까요?'},
        {id: 'brock', label: '브록', x: 23, y: 27, sourceMapId: 42, eventId: 16, intro: '브록: 회색시티 체육관 승부를 시작하자!'}
      ]},
      15: {blocked: [68, 69, 70, 71, 72], proxies: [
        {id: 'cerulean-joy', label: '간호순', x: 40, y: 52, sourceMapId: 43, eventId: 7, choicePrompt: '포켓몬을 치료할까요?'},
        {id: 'misty', label: '이슬', x: 52, y: 54, sourceMapId: 57, eventId: 11, intro: '이슬: 블루시티 체육관 승부를 시작하자!'},
        {id: 'bike-shop', label: '자전거 상점', x: 20, y: 67, sourceMapId: 60, eventId: 6, intro: '자전거 상점 주인: 자전거 교환권이 있다면 여기서 바로 교환해 줄게.'}
      ]},
      19: {blocked: [24, 33, 34, 35, 36], proxies: [
        {id: 'vermilion-joy', label: '간호순', x: 29, y: 13, sourceMapId: 48, eventId: 4, choicePrompt: '포켓몬을 치료할까요?'},
        {id: 'fan-president', label: '팬클럽 회장', x: 25, y: 28, sourceMapId: 63, eventId: 9, choicePrompt: '팬클럽 회장의 이야기를 들어볼까요?', intro: '팬클럽 회장: 내 포켓몬 이야기를 들어주면 좋은 걸 하나 주지.'},
        {id: 'surge', label: '마티스', x: 25, y: 42, sourceMapId: 56, eventId: 7, intro: '마티스: 갈색시티 체육관 승부를 시작하자!'}
      ]},
      158: {blocked: [20], proxies: [
        {id: 'bill', label: '빌', x: 86, y: 23, sourceMapId: 62, eventId: 3, action: 'bill', choicePrompt: '빌을 도와 장치를 작동할까요?', intro: '빌: 집 안으로 들어올 필요 없어. 여기서 내 실험을 좀 도와줘!'}
      ]}
    };
    plans[107] = {blocked: [1], proxies: [{id: 'route3-joy', label: '간호순', x: 23, y: 13,
      sourceMapId: 70, eventId: 6, choicePrompt: '포켓몬을 치료할까요?'}]};
    return plans[mapId] || {blocked: [], proxies: []};
  }
  storyMapName(name) {
    const names = {'Pueblo Paleta': '태초마을', 'Ciudad Verde': '상록시티', 'Ciudad Plateada': '회색시티',
      'Ciudad Celeste': '블루시티', 'Ciudad Carmín': '갈색시티', 'Ruta 1': '1번도로', 'Ruta 22': '22번도로',
      'Ruta 2 Sur': '2번도로 남쪽', 'Ruta 2 Norte': '2번도로 북쪽', 'Bosque Verde': '상록숲',
      'Ruta 3': '3번도로', 'Monte Moon': '달맞이산', 'Monte Moon Exterior': '달맞이산 외부',
      'Ruta 4': '4번도로', 'Ruta 5': '5번도로', 'Ruta 6': '6번도로', 'Ruta 9': '9번도로',
      'Ruta 10 Norte': '10번도로 북쪽', 'Ruta 10 Sur': '10번도로 남쪽', 'Túnel Diglett': '디그다의굴',
      'Túnel Roca': '돌산터널', 'Ruta 24': '24번도로', 'Ruta 25 Sur': '25번도로 남쪽'};
    return names[name] || name;
  }
  normalizeStoryMilestones() {
    if (typeof this.story.reachedViridian !== 'boolean') {
      const mapId = Number(this.story.mapId);
      const healedMap = Number(this.story.healingSpot?.mapId || 0);
      this.story.reachedViridian = mapId >= 4 || healedMap >= 4;
    }
  }
  storyObjective() {
    if (!this.partyPokemon?.length) return '목표: 마을 남쪽 연구소 앞의 오박사에게 가서 첫 포켓몬을 받자.';
    if (!this.story.reachedViridian) return this.story.mapId === 2
      ? '목표: 태초마을 북쪽 출구로 나가 1번도로를 따라 상록시티로 가자.'
      : '목표: 1번도로를 따라 북쪽의 상록시티로 가자.';
    if (!this.story.badges[0]) return '목표: 상록시티 북쪽 2번도로와 상록숲을 지나 회색시티의 브록에게 도전하자.';
    if (!this.story.badges[1]) return '목표: 회색시티 동쪽 3번도로와 달맞이산을 지나 블루시티로 가자.';
    if (!this.story.badges[2]) return '목표: 블루시티에서 남쪽 길을 따라 갈색시티로 향하자.';
    return '목표: 세 번째 배지까지의 스토리를 완료했다.';
  }
  showStoryObjective(seconds = 5) { this.message(this.storyObjective(), seconds); }
  isLockedPalletExit(event) {
    return this.story.mapId === 2 && !this.partyPokemon.length && [1, 44, 45, 46].includes(event.id);
  }
  async loadStorySourceMap(id) {
    if (this.storyRenderer.map?.id === id) return this.storyRenderer.map;
    if (this.storySourceMaps.has(id)) return this.storySourceMaps.get(id);
    const entry = this.storyRenderer.manifest.maps[id];
    if (!entry) throw Error(`Story source map not packaged: ${id}`);
    const map = await window.SurvivorRPG.loadStoryJSON(entry.url); this.storySourceMaps.set(id, map); return map;
  }
  async prepareStoryProxies(mapId) {
    const plan = this.storyOutdoorPlan(mapId), proxies = [];
    for (const config of plan.proxies) {
      const sourceMap = await this.loadStorySourceMap(config.sourceMapId);
      const event = sourceMap.events[config.eventId]; if (!event) continue;
      const pageIndex = window.SurvivorRPG.StoryState.pageIndex(event, this.story, config.sourceMapId);
      const page = event.pages[Math.max(0, pageIndex)] || event.pages[0];
      const characterName = page?.graphic?.character_name;
      if (characterName && !this.storyProxyImages.has(characterName)) {
        const url = this.storyRenderer.manifest.characters[characterName];
        if (url) this.storyProxyImages.set(characterName, await this.storyRenderer.image(url));
      }
      proxies.push({...config, proxy: true, event, pageIndex});
    }
    this.storyProxyNpcs = proxies;
  }
  storyHost() {
    return {
      commonEvent: async id => {
        if (!this.commonEvents) {
          this.commonEvents = await window.SurvivorRPG.loadStoryJSON('assets/story/common-events.json');
        }
        return this.commonEvents[id];
      },
      dialogue: text => this.proxyContext?.suppressDialogue ? Promise.resolve(0) : this.askStory(text),
      choices: (options, cancel) => this.askStory(this.proxyContext?.choicePrompt || this.storyDialog.text.textContent, options, cancel),
      wait: seconds => new Promise(resolve => setTimeout(resolve, Math.min(seconds, 1) * 1000)),
      transfer: (...args) => this.proxyContext?.suppressTransfers ? {suppressed: true} : this.transferStory(...args),
      command: (command, frame) => this.storyCommand(command, frame),
      script: (script, frame) => this.storyScript(script, frame),
      scriptCondition: (script, frame) => this.storyCondition(script, frame),
      condition: (p, frame) => {
        if (p[0] === 6) return this.storyDirection(p[1], frame) === p[2];
        throw Error(`Unadapted condition ${JSON.stringify(p)}`);
      },
      variableOperand: (p, frame) => {
        if (p[3] === 6) { const point = this.storyPosition(p[4], frame); return p[5] === 0 ? point.x : p[5] === 1 ? point.y : this.storyDirection(p[4], frame); }
        throw Error(`Unadapted variable operand ${JSON.stringify(p)}`);
      }
    };
  }
  storyPosition(id, frame) {
    if (id === -1) return {x: Math.floor(this.trainer.x / 32), y: Math.floor(this.trainer.y / 32)};
    const eventId = id === 0 ? frame.eventId : id;
    const map = frame.mapId === this.storyRenderer.map?.id ? this.storyRenderer.map : this.storySourceMaps.get(frame.mapId);
    const event = map?.events?.[eventId];
    if (!event) throw Error(`Event position missing: ${eventId}`);
    const local = frame.mapId === this.storyRenderer.map?.id;
    const key = `${frame.mapId}:${eventId}`;
    return (local ? this.storyPositions[eventId] : this.storySourcePositions[key]) || {x: event.x, y: event.y};
  }
  storyDirection(id, frame) {
    if (id === -1) return ({down: 2, left: 4, right: 6, up: 8})[this.trainer.direction];
    const eventId = id === 0 ? frame.eventId : id;
    const map = frame.mapId === this.storyRenderer.map?.id ? this.storyRenderer.map : this.storySourceMaps.get(frame.mapId);
    const event = map?.events?.[eventId];
    if (!event) throw Error(`Event direction missing: ${eventId}`);
    const page = window.SurvivorRPG.StoryState.pageIndex(event, this.story, frame.mapId);
    const local = frame.mapId === this.storyRenderer.map?.id, key = `${frame.mapId}:${eventId}`;
    return (local ? this.storyPositions[eventId] : this.storySourcePositions[key])?.direction || event.pages[page]?.graphic.direction || 2;
  }
  storyEventContains(event, x, y) {
    const pos = this.storyPositions[event.id] || event;
    const size = event.name.match(/size\((\d+),\s*(\d+)\)/i);
    return x >= pos.x && x < pos.x + Number(size?.[1] || 1) &&
      y <= pos.y && y > pos.y - Number(size?.[2] || 1);
  }
  storyPlayableMapIds() {
    // Story mode currently supports the outdoor/cave route through the third gym,
    // plus the transition maps that are required to keep that route continuous.
    return new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 33, 55, 66, 107, 158]);
  }
  isStoryTransferTargetAllowed(mapId) {
    return this.storyPlayableMapIds().has(Number(mapId)) && !!this.storyRenderer.manifest.maps[mapId];
  }
  unsupportedStoryTransfer(event, pageIndex) {
    const page = event?.pages?.[pageIndex];
    return page?.list?.find(command => command.code === 201 && command.parameters?.[0] === 0 &&
      !this.isStoryTransferTargetAllowed(command.parameters[1])) || null;
  }
  isCutTreeEvent(event, page) {
    const activePage = typeof page === 'number' ? event?.pages?.[page] : page;
    return !!activePage && activePage.through === false &&
      (/cuttree/i.test(String(event?.name || '')) || /arbolito/i.test(String(activePage.graphic?.character_name || '')));
  }
  isNativeHumanEvent(event, page) {
    const graphic = String(page?.graphic?.character_name || '');
    if (page?.trigger !== 0 || !graphic || this.isCutTreeEvent(event, page) || /objeto/i.test(graphic)) return false;
    return !/door|puerta|item|objeto|ball|tree|arbol|rock|roca|follower|sign|cartel|boulder|smash|cut|arbusto|plant|planta/i
      .test(`${event?.name || ''} ${graphic}`);
  }
  hiddenStoryNativeEvents() {
    const hidden = new Set(), blocked = new Set(this.storyOutdoorPlan().blocked);
    for (const {event, page} of this.storyRenderer.activeEvents(this.story)) {
      if (this.erasedStoryEvents.has(event.id) || blocked.has(event.id)) continue;
      if (this.isNativeHumanEvent(event, page)) hidden.add(event.id);
    }
    return hidden;
  }
  refreshStoryColliders() {
    if (!this.map || !this.storyRenderer?.map) return;
    const dynamic = [], blocked = new Set(this.storyOutdoorPlan().blocked);
    for (const {event, pageIndex, page} of this.storyRenderer.activeEvents(this.story)) {
      if (this.erasedStoryEvents.has(event.id) || blocked.has(event.id)) continue;
      if (!this.isCutTreeEvent(event, page) && !this.unsupportedStoryTransfer(event, pageIndex)) continue;
      const pos = this.storyPositions[event.id] || event;
      const size = String(event.name || '').match(/size\((\d+),\s*(\d+)\)/i);
      const width = Number(size?.[1] || 1), height = Number(size?.[2] || 1);
      for (let dx = 0; dx < width; dx++) for (let dy = 0; dy < height; dy++)
        dynamic.push({x: (pos.x + dx) * 32, y: (pos.y - dy) * 32, width: 32, height: 32});
    }
    this.map.colliders = [...this.storyBaseColliders, ...dynamic];
  }
  async storyCommand(command, frame) {
    const p = command.parameters;
    if (command.code === 116) {
      if (frame.mapId === this.storyRenderer.map?.id) this.erasedStoryEvents.add(frame.eventId);
      else this.storySourceErased.add(`${frame.mapId}:${frame.eventId}`);
      if (frame.mapId === this.storyRenderer.map?.id) this.refreshStoryColliders();
      return;
    }
    if (command.code === 202) {
      const point = p[1] === 0 ? {x: p[2], y: p[3]} : p[1] === 1
        ? {x: Number(this.story.variables[p[2]] || 0), y: Number(this.story.variables[p[3]] || 0)}
        : {...this.storyPosition(p[2], frame)};
      if (p[1] === 2) this.setStoryPosition(p[2], this.storyPosition(p[0], frame), frame);
      if (p[4]) point.direction = p[4];
      this.setStoryPosition(p[0], point, frame); return;
    }
    if (command.code === 231 || command.code === 232) {
      const name = command.code === 231 ? p[1] : this.pictures.get(p[0])?.name;
      if (name && this.storyPictures.has(name)) this.pictures.set(p[0], {name, parameters: p});
      return;
    }
    if (command.code === 235) { this.pictures.delete(p[0]); return; }
    // Presentation commands keep source event ordering; original pictures are not yet ported.
    if ([104, 135, 207, 210, 223, 225, 231, 232, 235, 236, 241, 242, 245, 246, 249, 250, 251, 509].includes(command.code)) return;
    if (command.code === 314) { this.healParty(); return; }
    if (command.code === 209) {
      const pos = {...this.storyPosition(p[0], frame)};
      for (const move of p[1].list) {
        const vector = {1: [0, 1], 2: [-1, 0], 3: [1, 0], 4: [0, -1], 5: [-1, 1], 6: [1, 1], 7: [-1, -1], 8: [1, -1]}[move.code];
        if (vector) { pos.x += vector[0]; pos.y += vector[1]; }
        else if (move.code === 12 || move.code === 13) {
          const direction = pos.direction || this.storyDirection(p[0], frame);
          const vectorByDirection = {2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1]}[direction] || [0, 0];
          const sign = move.code === 12 ? 1 : -1;
          pos.x += vectorByDirection[0] * sign; pos.y += vectorByDirection[1] * sign;
        }
        else if (move.code === 14) { pos.x += move.parameters[0]; pos.y += move.parameters[1]; }
        else if (move.code >= 16 && move.code <= 19) pos.direction = [2, 4, 6, 8][move.code - 16];
        else if (move.code >= 20 && move.code <= 26) pos.direction = pos.direction || this.storyDirection(p[0], frame);
        else if (![0, 15, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44].includes(move.code)) throw Error(`Unadapted move route ${move.code}`);
      }
      if (p[0] === -1) {
        this.trainer.x = (pos.x + .5) * 32; this.trainer.y = (pos.y + .5) * 32;
        if (pos.direction) this.trainer.direction = ({2: 'down', 4: 'left', 6: 'right', 8: 'up'})[pos.direction];
      } else this.setStoryPosition(p[0], pos, frame);
      return;
    }
    throw Error(`Unadapted event command ${command.code}`);
  }
  async storyScript(script, frame) {
    const text = script.trim();
    if (/^pb(?:Erase|Smash)ThisEvent(?:\(\))?$/.test(text)) {
      if (frame.mapId === this.storyRenderer.map?.id) {
        this.erasedStoryEvents.add(frame.eventId);
        this.refreshStoryColliders();
      } else this.storySourceErased.add(`${frame.mapId}:${frame.eventId}`);
      return true;
    }
    // A 355/655 block may contain several independent native calls.
    if (text.includes('\n') && text.split('\n').every(line => /^(pbReceiveItem|pbItemBall|pbGetKeyItem|pbSetSelfSwitch)\(/.test(line.trim()))) {
      for (const line of text.split('\n')) await this.storyScript(line, frame);
      return;
    }
    const badge = text.match(/^\$player\.badges\[([0-2])\]\s*=\s*true$/);
    if (badge) { this.story.badges[Number(badge[1])] = true; return; }
    const badgeAnimation = text.match(/^renderBadgeAnimation\(([0-2])\)$/);
    if (badgeAnimation) { this.notifyProgress(`배지 ${Number(badgeAnimation[1]) + 1} 획득!`, 'reward'); return; }
    const fieldItem = text.match(/^pbItemBall\(:(\w+)(?:,\s*(\d+))?\)$/);
    if (fieldItem) return this.receiveFieldItem(fieldItem[1], Number(fieldItem[2] || 1), frame);
    const item = text.match(/^pbReceiveItem\(:(\w+)(?:,\s*(\d+))?\)$/);
    if (item) return this.receiveStoryItem(item[1], Number(item[2] || 1));
    const keyItem = text.match(/^pbGetKeyItem\("(\w+)"\)$/);
    if (keyItem) { this.story.keyItems[keyItem[1]] = 1; return true; }
    if (text.includes('BONOBICI') && text.includes('bag')) { this.story.keyItems.BONOBICI = 0; return true; }
    const selfSwitch = text.match(/^pbSetSelfSwitch\((\d+),\s*"([ABCD])",\s*(true|false)(?:,\s*(\d+))?\)$/);
    if (selfSwitch) { this.story.selfSwitches[`${selfSwitch[4] || frame.mapId}:${selfSwitch[1]}:${selfSwitch[2]}`] = selfSwitch[3] === 'true'; return; }
    const addPokemon = text.match(/^pbAddPokemon\(:(\w+),\s*(\d+)\)$/);
    if (addPokemon) { this.addStoryPokemon(addPokemon[1], Number(addPokemon[2])); return true; }
    if (/^(?:Kernel\.)?pbSetPokemonCenter$/.test(text)) {
      this.story.healingSpot = {mapId: this.story.mapId, ...this.storyPosition(-1, frame), direction: this.storyDirection(-1, frame)};
      return;
    }
    if (text === '$player.heal' || text === 'pbHealAll') { this.healParty(); return; }
    if (text === 'LevelCapsEX.toggle if !LevelCapsEX.enabled?') { this.story.levelCapsEnabled = true; return; }
    if (text === 'recharge_vial') { this.story.vialCharges = 1; return; }
    if (text === 'todas_entrenadores_importantes_hechos?' || text === '$player.stars = 5 if $player.stars > 5') return;
    if (text.startsWith('#')) return;
    if (/^(pbEventScreen\(ButtonEventScene\)|pbToneChangeAll\(|Pokemon.play_cry\(|pbChangePlayer\(|pbTermninarPkmnAnimado|pbMostrarListaStarters\(\)|pbPokemonFollow\(|FollowingPkmn\.|pbSetPokemonCenter|pbPanoramaMove\(|pbZoomMap\()/.test(text)) return;
    if (/^\$(PokemonSystem\.(salvajes_visibles_en_ow|battlestyle)|player.has_running_shoes|PokemonGlobal.diving)\s*=/.test(text)) return;
    if (text === 'pbTrainerName') { this.story.playerName = 'Red'; return; }
    if (text.startsWith('pbSet(12, pbEnterNPCName(')) { this.story.variables[12] = this.story.rivalName; return; }
    if (text.startsWith('$game_variables[31] = STARTER_REGIONS')) return;
    const starter = text.match(/^species = pbGet\(31\)\[(\d)\]/);
    if (starter) {
      this.story.pendingStarter = ['bulbasaur', 'charmander', 'squirtle'][Number(starter[1])];
      this.story.variables[3] = window.SurvivorRPG.PokemonData[this.story.pendingStarter].name; return;
    }
    if (text.startsWith('pokemon = pbGet(1)')) return;
    if (text.startsWith('setBattleRule(')) { if (text.includes('canLose')) this.story.canLoseBattle = true; return; }
    if (text === 'pbAddPokemon(pbGet(1))') {
      if (!this.story.pendingStarter || this.ownedPokemon.length) throw Error('Invalid starter event');
      const p = this.createPartyPokemon(window.SurvivorRPG.PokemonData[this.story.pendingStarter], this.trainer.x, this.trainer.y);
      this.ownedPokemon = [p]; this.partyPokemon = [p]; this.player = this.selectedPokemon = p;
      this.starterId = p.uniqueId; this.markPokedex(p.speciesId, 'caught'); return;
    }
    throw Error(`Unadapted Ruby: ${text}`);
  }
  async storyCondition(script, frame) {
    if (script === 'false' || script.startsWith('false #')) return false;
    if (/^ChallengeModes\.on\?(?:\(:(?:MODOASISTIDO|PERMALOCKE_RESTORES)\))?$/.test(script)) return false;
    if (script === '$PokemonSystem.guardar_al_curar?') return false;
    if (script.includes('quantity(:CUTITEM)') && script.includes('>')) return Number(this.story.keyItems.CUTITEM || 0) > 0;
    if (/^pbCut(?:\(\))?$/.test(script)) return Number(this.story.keyItems.CUTITEM || 0) > 0;
    const playerY = script.match(/^\$game_player\.y == (\d+)$/);
    if (playerY) return this.storyPosition(-1, frame).y === Number(playerY[1]);
    if (/^(pbItemBall|pbReceiveItem|pbAddPokemon)\(/.test(script)) return this.storyScript(script, frame);
    const trainer = script.match(/^TrainerBattle\.start\(:(\w+),\s*"([^"]+)"(?:,\s*(\d+))?\)$/);
    if (trainer) {
      const key = `${trainer[1]}|${trainer[2]}|${trainer[3] || 0}`;
      const data = this.storyData.trainers[key];
      if (!data) throw Error(`Original trainer data missing: ${key}`);
      if (!this.partyPokemon.length) throw Error('No Pokemon for trainer battle');
      this.storyBattle = new window.SurvivorRPG.StoryTrainerBattle(this, data);
      const won = await this.storyBattle.start();
      if (!won && this.story.canLoseBattle && !/^LIDER/.test(data.type)) { this.healParty(); this.mode = 'trainer'; }
      this.story.canLoseBattle = false;
      return won;
    }
    throw Error(`Unadapted Ruby condition: ${script}`);
  }
  isPokeballFieldEvent(event, pageIndex) {
    const page = event?.pages?.[pageIndex];
    return /objeto/i.test(String(page?.graphic?.character_name || ''));
  }
  collectPokeballFieldEvent(event, pageIndex) {
    if (!this.isPokeballFieldEvent(event, pageIndex)) return false;
    this.erasedStoryEvents.add(event.id);
    this.receiveStoryItem('POKEBALL', 1);
    this.story.mapEvents = {
      mapId: this.story.mapId,
      positions: structuredClone(this.storyPositions),
      erased: [...this.erasedStoryEvents]
    };
    this.message('몬스터볼을 1개 얻었다!', 2.5);
    return true;
  }
  async runStoryEvent(event, pageIndex) {
    if (this.storyBusy || this.storyError || this.storyBattle || !['trainer', 'pokemon'].includes(this.mode)) return;
    if (this.collectPokeballFieldEvent(event, pageIndex)) return;
    const blockedTransfer = this.unsupportedStoryTransfer(event, pageIndex);
    if (blockedTransfer) return;
    if (this.isLockedPalletExit(event)) {
      this.storyBusy = true;
      try {
        const actor = this.activePokemon || this.trainer;
        actor.y = Math.max(actor.y, 48);
        this.camera.follow(actor, 1);
        await this.askStory('아직 태초마을을 떠날 수 없다.\n먼저 마을 남쪽 연구소 앞의 오박사에게 가서 첫 포켓몬을 받자.');
        this.showStoryObjective(6);
      } finally { this.storyBusy = false; }
      return;
    }
    const snapshot = this.captureStorySafeState();
    this.storyBusy = true;
    try { await this.interpreter.run(this.story.mapId, event, pageIndex); this.applyStoryGymRewards(); }
    catch (error) { await this.handleStoryFailure(error, snapshot, {mapId: snapshot?.mapId, eventId: event.id, pageIndex}); }
    finally { this.storyBusy = false; }
  }
  async runStoryProxy(sourceMapId, eventId, pageIndex, proxy = {}) {
    if (this.storyBusy || this.storyError || this.storyBattle || !['trainer', 'pokemon'].includes(this.mode)) return;
    const snapshot = this.captureStorySafeState();
    const sourceMap = await this.loadStorySourceMap(sourceMapId), event = sourceMap.events[eventId];
    if (!event) throw Error(`Story proxy event missing: ${sourceMapId}:${eventId}`);
    const selectedPage = pageIndex ?? window.SurvivorRPG.StoryState.pageIndex(event, this.story, sourceMapId);
    if (selectedPage < 0) return;
    this.storyBusy = true;
    this.proxyContext = {suppressTransfers: true, suppressDialogue: true, choicePrompt: proxy.choicePrompt || ''};
    try {
      if (proxy.intro) await this.askStory(proxy.intro);
      await this.interpreter.run(sourceMapId, event, selectedPage); this.applyStoryGymRewards();
    } catch (error) { await this.handleStoryFailure(error, snapshot); }
    finally { this.proxyContext = null; this.storyBusy = false; }
  }
  async chooseOutdoorStarter() {
    if (this.partyPokemon.length) { await this.askStory('오박사: 좋아. 이제 북쪽 1번도로로 출발해 보렴!'); return; }
    this.storyBusy = true;
    try {
      const choice = await this.askStory('오박사: 긴 소개는 생략하자. 함께 모험할 첫 번째 포켓몬을 고르렴.', ['이상해씨', '파이리', '꼬부기']);
      const ids = ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE'], switches = [60, 61, 62];
      this.addStoryPokemon(ids[choice], 5); this.story.switches[switches[choice]] = true;
      this.story.switches[347] = true;
      this.story.variables[56] = choice; this.story.variables[55] = 4;
      await this.askStory('오박사: 선택이 끝났구나. 이제 북쪽 출구로 나가 1번도로를 따라 상록시티로 가 보렴!');
      this.showStoryObjective(6);
    } finally { this.storyBusy = false; }
  }
  async runBillProxy(npc) {
    const firstDone = !!this.story.switches[81], rewardDone = !!this.story.switches[83];
    if (rewardDone) { await this.askStory('빌: 덕분에 실험은 끝났어. 갈색시티에서 S.S. 안느호 티켓을 써 봐!'); return; }
    await this.runStoryProxy(62, firstDone ? 4 : 3, undefined, npc);
  }
  async runViridianBallShop() {
    if (this.storyBusy) return;
    this.storyBusy = true;
    try {
      const price = Number(window.SurvivorRPG.ItemData?.pokeBall?.price || 50);
      const quantities = [1, 5, 10];
      const choice = await this.askStory(`몬스터볼은 1개 ${price}원입니다. 현재 소지금: ${this.money}원`,
        quantities.map(qty => `${qty}개 · ${qty * price}원`).concat('취소'), 3);
      const qty = quantities[choice];
      if (!qty) return;
      const cost = qty * price;
      if (this.money < cost) { await this.askStory(`${cost}원이 필요합니다.`); return; }
      this.money -= cost;
      this.receiveStoryItem('POKEBALL', qty);
      await this.askStory(`몬스터볼 ${qty}개를 샀습니다. 남은 소지금: ${this.money}원`);
    } finally { this.storyBusy = false; }
  }
  update(dt) {
    if (!this.storyRenderer || this.suspended) return;
    const d = this.storyDialog;
    if (d?.resolve) {
      d.navCooldown = Math.max(0, (d.navCooldown || 0) - dt);
      const vector = this.input.movementVector();
      if (d.buttons.length > 1 && d.navCooldown <= 0 && Math.max(Math.abs(vector.x), Math.abs(vector.y)) > .55) {
        const delta = Math.abs(vector.y) >= Math.abs(vector.x) ? Math.sign(vector.y) : Math.sign(vector.x);
        this.selectStoryChoice(d.selected + delta); d.navCooldown = .18;
      } else if (Math.max(Math.abs(vector.x), Math.abs(vector.y)) < .2) d.navCooldown = 0;
      if (this.input.consumeSwitch()) this.answerStory(d.selected);
      const back = this.input.consumeBall() || this.input.consumeMenu();
      if (back && (d.recovery || d.cancel)) this.answerStory(-1);
      const index = this.input.consumeChoiceIndex(); if (index !== null && d.buttons[index]) this.answerStory(index);
      return;
    }
    if (this.storyBattle) { super.update(dt); this.storyBattle?.update(); return; }
    if (this.storyError) {
      if (this.input.consumeBall() || this.input.consumeMenu() || this.input.consumeSwitch()) this.recoverStoryState();
      return;
    }
    if (this.storyBusy) return;
    if (this.storyAutoSavePending) { this.storyAutoSavePending = false; this.saveGame(true); }
    if (this.menuOpen) { super.update(dt); return; }
    if (this.mode === 'gameOver') { this.restartAfterDefeat(); return; }
    document.getElementById('gameRoot').dataset.storyNoParty = String(this.partyPokemon.length === 0);
    const actor = this.activePokemon || this.trainer, tx = Math.floor(actor.x / 32), ty = Math.floor(actor.y / 32);
    if (this.storyPreviousMapState && this.storyEntryPoint?.mapId === this.story.mapId &&
      (tx !== this.storyEntryPoint.x || ty !== this.storyEntryPoint.y)) { this.storyPreviousMapState = null; this.storyEntryPoint = null; }
    if (this.storyFailedEvent && (this.storyFailedEvent.mapId !== this.story.mapId || tx !== this.storyFailedEvent.x || ty !== this.storyFailedEvent.y))
      this.storyFailedEvent = null;
    const blocked = new Set(this.storyOutdoorPlan().blocked);
    const active = this.storyRenderer.activeEvents(this.story).filter(({event}) => !this.erasedStoryEvents.has(event.id) && !blocked.has(event.id) &&
      !(this.storyFailedEvent?.mapId === this.story.mapId && this.storyFailedEvent.eventId === event.id));
    const autorun = active.find(({event, pageIndex, page}) => page.trigger === 3 && !this.autoruns.has(`${event.id}:${pageIndex}`));
    if (autorun) { this.autoruns.add(`${autorun.event.id}:${autorun.pageIndex}`); this.runStoryEvent(autorun.event, autorun.pageIndex); return; }
    if (this.story.mapId === 1 && this.story.switches[179] && !this.story.switches[180]) {
      this.storyBusy = true;
      this.askStory('어떤 모습으로 시작할까요?', ['여자', '남자']).then(index => {
        this.story.variables[150] = index + 1; this.story.switches[180] = true; this.storyBusy = false;
      }); return;
    }
    if (this.story.mapId === 104 && this.story.switches[323] && ![109, 110, 111].some(id => this.story.switches[id])) {
      this.storyBusy = true;
      this.askStory('게임 모드를 선택하세요.', ['클래식 모드', '완전 모드', '래디컬 모드']).then(index => {
        this.story.switches[109 + index] = true; this.storyBusy = false;
      }); return;
    }
    this.story.playTime += dt;
    const touching = active.find(({event, page}) => [1, 2].includes(page.trigger) && this.storyEventContains(event, tx, ty) && page.list.some(c => c.code !== 0));
    if (touching) { this.runStoryEvent(touching.event, touching.pageIndex); return; }
    const vector = this.input.movementVector();
    if (Math.hypot(vector.x, vector.y) > 0) {
      const dx = Math.abs(vector.x) > Math.abs(vector.y) ? Math.sign(vector.x) : 0;
      const dy = dx ? 0 : Math.sign(vector.y);
      const blocked = !window.SurvivorRPG.MovementSystem.canStand(this.map, (tx + dx + .5) * 32, (ty + dy + .5) * 32, actor.radius);
      const bump = blocked && active.find(({event, page}) => [1, 2].includes(page.trigger) && this.storyEventContains(event, tx + dx, ty + dy) && page.list.some(c => c.code !== 0));
      if (bump) { this.runStoryEvent(bump.event, bump.pageIndex); return; }
    }
    const cutTargets = active.filter(({page}) => page.trigger === 0).filter(({event, page}) => this.isCutTreeEvent(event, page)).map(({event, pageIndex}) => {
      const pos = this.storyPositions[event.id] || event;
      return {id: `cut-${event.id}`, type: 'STORY_OBJECT', x: (pos.x + .5) * 32, y: (pos.y + .5) * 32, event, pageIndex};
    });
    const proxyNpcs = this.storyProxyNpcs.map(proxy => ({...proxy, name: proxy.label,
      x: (proxy.x + .5) * 32, y: (proxy.y + .5) * 32}));
    this.map.npcs = [...cutTargets, ...proxyNpcs];
    super.update(dt);
  }
  updateNearbyNpc() {
    if (this.storyBattle) { this.nearbyNpc = null; return; }
    const actor = this.activePokemon || this.trainer;
    this.nearbyNpc = this.map.npcs.filter(n => Math.hypot(actor.x - n.x, actor.y - n.y) <= 72)
      .sort((a, b) => Math.hypot(actor.x - a.x, actor.y - a.y) - Math.hypot(actor.x - b.x, actor.y - b.y))[0] || null;
  }
  interactNpc(npc) {
    if (!npc.proxy) { this.runStoryEvent(npc.event, npc.pageIndex); return; }
    if (npc.action === 'starter') { this.chooseOutdoorStarter(); return; }
    if (npc.action === 'bill') { this.runBillProxy(npc); return; }
    if (npc.action === 'ball-shop') { this.runViridianBallShop(); return; }
    this.runStoryProxy(npc.sourceMapId, npc.eventId, undefined, npc);
  }
  handleBallAction() {
    if (this.storyBattle && this.mode === 'trainer') { this.message('트레이너의 포켓몬은 잡을 수 없습니다.', 2); return; }
    super.handleBallAction();
  }
  awardParticipantExp(enemy) {
    const participants = enemy.participants || new Set(); this.lastExpAwards = [];
    for (const pokemon of this.partyPokemon) {
      if (pokemon.dead) continue;
      const direct = participants.has(pokemon.uniqueId);
      if (!direct && !(this.story.gymRewards.includes(1) && this.items.expShareEnabled)) continue;
      const amount = direct ? enemy.expReward : Math.floor(enemy.expReward * .7);
      this.lastExpAwards.push({id: pokemon.uniqueId, direct, amount});
      pokemon.gainExp(amount).forEach(event => this.enqueueLevelUp({...event, pokemon}));
    }
    this.assets.play('exp', .28);
  }
  startDeploy() { if (this.partyPokemon.length) super.startDeploy(); }
  setStoryPosition(id, point, frame) {
    if (id === -1) {
      this.trainer.x = (point.x + .5) * 32; this.trainer.y = (point.y + .5) * 32;
      if (point.direction) this.trainer.direction = ({2: 'down', 4: 'left', 6: 'right', 8: 'up'})[point.direction];
    } else {
      const eventId = id || frame.eventId, local = frame.mapId === this.storyRenderer.map?.id;
      const key = `${frame.mapId}:${eventId}`;
      const previous = this.storyPosition(id, frame);
      if (local) this.storyPositions[eventId] = {...previous, ...point};
      else this.storySourcePositions[key] = {...previous, ...point};
      if (local) this.refreshStoryColliders();
    }
  }
  receiveStoryItem(id, amount = 1) {
    const data = this.storyData.items[id];
    if (!data || !Number.isInteger(amount) || amount < 1) throw Error(`Invalid native item: ${id}`);
    this.story.keyItems[id] = (this.story.keyItems[id] || 0) + amount;
    const ball = {POKEBALL: 'pokeBall', GREATBALL: 'greatBall', ULTRABALL: 'ultraBall'}[id];
    if (ball) this.balls[ball] = (this.balls[ball] || 0) + amount;
    if (id === 'POTION') this.items.potion = (this.items.potion || 0) + amount;
    this.notifyProgress(`${data.Name} ×${amount}`, 'reward');
    return true;
  }
  receiveFieldItem(sourceId, amount = 1, frame = null) {
    if (!Number.isInteger(amount) || amount < 1) throw Error(`Invalid field item amount: ${amount}`);
    const sourceMap = frame && (this.storyRenderer?.map?.id === frame.mapId
      ? this.storyRenderer.map : this.storySourceMaps?.get(frame.mapId));
    const graphic = sourceMap?.events?.[frame?.eventId]?.pages?.[frame?.pageIndex]?.graphic?.character_name || '';
    return this.receiveStoryItem(/objeto/i.test(graphic) ? 'POKEBALL' : sourceId, amount);
  }
  addStoryPokemon(id, level) {
    const species = window.SurvivorRPG.PokemonData[id.toLowerCase()];
    if (!species || !Number.isInteger(level) || level < 1 || level > 100) throw Error(`Invalid native Pokemon: ${id}`);
    const pokemon = this.createPartyPokemon({...species, level}, this.trainer.x, this.trainer.y);
    this.ownedPokemon.push(pokemon);
    (this.partyPokemon.length < 6 ? this.partyPokemon : this.reservePokemon).push(pokemon);
    if (!this.selectedPokemon) { this.player = this.selectedPokemon = pokemon; this.starterId = pokemon.uniqueId; }
    this.markPokedex(pokemon.speciesId, 'caught');
    return pokemon;
  }
  applyStoryGymRewards() {
    for (const order of [1, 2, 3]) {
      if (!this.story.badges[order - 1] || !this.story.switches[183 + order]) break;
      if (window.SurvivorRPG.StoryState.unlockGym(this.story, order))
        this.notifyProgress(order === 1 ? '학습장치 해금 · 비참여 경험치 70%' : `동시 출전 ${order}마리 해금`, 'reward');
    }
    this.syncStoryUnlocks();
  }
  syncStoryUnlocks() {
    this.items.expShare = this.story.gymRewards.includes(1);
    this.items.expShareEnabled = this.items.expShare && this.story.expShareEnabled;
    this.items.doubleBattle = this.story.gymRewards.includes(2);
    this.items.tripleBattle = this.story.gymRewards.includes(3);
    this.battleFormation = ['single', 'double', 'triple'][this.story.activeCount - 1];
    this.partyBattle.sync(this);
  }
  toggleExpShare() {
    if (!this.story.gymRewards.includes(1)) return false;
    this.story.expShareEnabled = !this.story.expShareEnabled;
    this.syncStoryUnlocks(); this.ui.showGameMenu(this); return true;
  }
  setBattleFormation(mode) {
    const count = ['single', 'double', 'triple'].indexOf(mode) + 1;
    if (!count || count > window.SurvivorRPG.StoryState.maxActive(this.story)) return false;
    this.story.activeCount = count;
    this.syncStoryUnlocks(); this.ui.showGameMenu(this); return true;
  }
  buyItem(id) {
    if (['expShare', 'doubleBattle', 'tripleBattle'].includes(id)) {
      this.message('체육관 승리로 해금됩니다.', 2); return false;
    }
    return super.buyItem(id);
  }
  saveGame(quiet = false) {
    if (!this.storyRenderer || this.storyBusy || this.storyError || this.storyBattle || this.levelUpQueue.length || !['trainer', 'pokemon'].includes(this.mode)) return false;
    const actor = this.activePokemon || this.trainer;
    this.story.x = Math.floor(actor.x / 32); this.story.y = Math.floor(actor.y / 32);
    this.story.direction = ({down: 2, left: 4, right: 6, up: 8})[actor.direction];
    this.story.mapEvents = {mapId: this.story.mapId, positions: structuredClone(this.storyPositions), erased: [...this.erasedStoryEvents]};
    const data = this.serializeRun();
    try { this.store.write(data); if (!quiet) this.message('스토리 리포트를 작성했다.', 2); return true; }
    catch (error) { this.message(error.message, 2); return false; }
  }
  serializeRun() {
    const data = super.serializeRun();
    if (data) { data.gameMode = 'story'; data.story = this.story; }
    return data;
  }
  async loadGame(imported = null) {
    let data;
    try { data = imported ? this.store.validate(imported) : this.store.read()?.data; }
    catch (error) { this.message(error.message, 2); return false; }
    if (!data) return false;
    this.storyBusy = true;
    try {
      this.story = JSON.parse(JSON.stringify(data.story));
      this.normalizeStoryMilestones();
      window.SurvivorRPG.StoryState.ensureWildLevelProfile(this.story);
      this.interpreter.state = this.story;
      await this.transferStory(data.story.mapId, data.story.x, data.story.y, data.story.direction);
      if (data.ownedPokemon.length) {
        this.maps[this.map.id] = this.map;
        super.loadGame(data);
      } else {
        this.ownedPokemon = []; this.partyPokemon = []; this.reservePokemon = [];
        this.activePokemon = null; this.selectedPokemon = null;
        this.money = data.money; this.balls = data.balls; this.items = data.items || {potion: 1};
        this.pokedex = data.pokedex || {};
      }
      if (this.story.mapEvents?.mapId === this.story.mapId) {
        this.storyPositions = structuredClone(this.story.mapEvents.positions);
        this.erasedStoryEvents = new Set(this.story.mapEvents.erased);
      }
      this.placeStoryNpcsAtDoors();
      this.refreshStoryColliders();
      this.syncStoryUnlocks();
      this.storyError = null;
      return true;
    } catch (error) { this.storyError = error; this.message(error.message, 3); return false; }
    finally { this.storyBusy = false; }
  }
  draw() {
    if (this.gymArena) { this.drawGymArena(); return; }
    if (!this.storyRenderer) return super.draw();
    const ctx = this.ctx; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.width, this.height); ctx.save(); ctx.scale(this.worldZoom, this.worldZoom);
    const entities = [this.activePokemon || this.trainer, ...this.partyBattle.members, ...this.enemies];
    const actors = entities.map(entity => ({y: entity.y, order: 3, draw: () => {
      entity.draw(ctx, this.camera, this.assets, this.combatSystem.poseFor(entity));
      if (entity !== this.trainer) {
        this.drawPokemonOverheadLabel(entity, entity === this.activePokemon || this.partyBattle.members.includes(entity));
      }
      if (this.enemies.includes(entity)) {
        this.drawEnemyHp(entity);
        entity.drawOverhead(ctx, this.camera);
      }
    }}));
    this.storyRenderer.draw(ctx, this.camera, this.story, performance.now() / 1000, actors, this.storyPositions,
      this.erasedStoryEvents, this.hiddenStoryNativeEvents());
    this.drawStoryProxies(ctx);
    this.combatSystem.drawEffects(ctx, this.camera); this.drawSwitchFlash(); ctx.restore();
    for (const {name, parameters: p} of [...this.pictures.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1])) {
      const image = this.storyPictures.get(name); if (!image) continue;
      const width = image.width * p[6] / 100, height = image.height * p[7] / 100;
      const x = (p[3] ? this.story.variables[p[4]] : p[4]) || 0, y = (p[3] ? this.story.variables[p[5]] : p[5]) || 0;
      ctx.save(); ctx.translate(160, 0); ctx.scale(1.875, 1.875); ctx.globalAlpha = p[8] / 255;
      ctx.drawImage(image, x - (p[2] ? width / 2 : 0), y - (p[2] ? height / 2 : 0), width, height); ctx.restore();
    }
  }
  drawStoryProxies(ctx) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (const proxy of this.storyProxyNpcs) {
      const event = proxy.event, pageIndex = window.SurvivorRPG.StoryState.pageIndex(event, this.story, proxy.sourceMapId);
      const page = event.pages[pageIndex >= 0 ? pageIndex : proxy.pageIndex] || event.pages[0], g = page?.graphic || {};
      const image = this.storyProxyImages.get(g.character_name);
      const x = proxy.x * 32 - this.camera.x, y = proxy.y * 32 - this.camera.y;
      if (image) {
        const width = image.width / 4, height = image.height / 4;
        ctx.drawImage(image, (g.pattern || 0) * width, ((g.direction || 2) / 2 - 1) * height, width, height,
          x + 16 - width / 2, y + 32 - height, width, height);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fillRect(x + 6, y + 6, 20, 20);
      }
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(proxy.label, x + 16, y - 4); ctx.fillStyle = '#fff'; ctx.fillText(proxy.label, x + 16, y - 4);
    }
    ctx.restore();
  }
};
