window.SurvivorRPG = window.SurvivorRPG || {};
window.SurvivorRPG.SaveStore = {
  key:'scientistRpgSave', backup:'scientistRpgSave.backup', journalKey:'scientistRpgResearch',
  currentVersion() { return window.SurvivorRPG.BuildConfig?.SAVE_VERSION || 5; },
  forMode(mode) {
    if (!['story', 'battle'].includes(mode)) throw Error('Invalid game mode');
    const prefix = mode === 'story' ? 'scientistRpgStory' : 'scientistRpg';
    return Object.assign(Object.create(this), {mode, key: `${prefix}Save`, backup: `${prefix}Save.backup`, journalKey: `${prefix}Research`});
  },
  remove() {
    localStorage.removeItem(this.key);
    localStorage.removeItem(this.backup);
    localStorage.removeItem(this.journalKey);
  },
  migrateStory(state) {
    const R=window.SurvivorRPG;
    if(!state || typeof state!=='object' || Array.isArray(state))return state;
    const start={map:Number.isInteger(state.mapId)&&state.mapId>0?state.mapId:1,x:Number.isFinite(state.x)?state.x:9,y:Number.isFinite(state.y)?state.y:7};
    const base=R.StoryState.create(start,()=>.5);
    const badges=Array.isArray(state.badges)&&state.badges.length===3?state.badges.map(Boolean):base.badges;
    const inferredRewards=[];
    for(let i=0;i<badges.length&&badges[i];i++)inferredRewards.push(i+1);
    const story={...base,...state,badges,
      switches:{...base.switches,...(state.switches||{})},variables:{...base.variables,...(state.variables||{})},
      selfSwitches:{...base.selfSwitches,...(state.selfSwitches||{})},keyItems:{...base.keyItems,...(state.keyItems||{})},
      gymRewards:Array.isArray(state.gymRewards)?state.gymRewards:inferredRewards};
    if(typeof state.expShareEnabled!=='boolean')story.expShareEnabled=story.gymRewards.includes(1);
    if(![1,2,3].includes(state.activeCount))story.activeCount=story.gymRewards.includes(3)?3:story.gymRewards.includes(2)?2:1;
    return story;
  },
  migrate(data) {
    const R=window.SurvivorRPG;
    if(!data || typeof data!=='object' || Array.isArray(data))throw Error('Invalid report');
    const copy=typeof structuredClone==='function'?structuredClone(data):JSON.parse(JSON.stringify(data));
    const sourceVersion=Number(copy.version ?? 1),current=this.currentVersion();
    if(!Number.isInteger(sourceVersion)||sourceVersion<1||sourceVersion>current)throw Error('Unsupported save version');
    copy.gameMode=copy.gameMode || (copy.story ? 'story' : 'battle');
    copy.playTime=Number.isFinite(copy.playTime)&&copy.playTime>=0?copy.playTime:(Number.isFinite(copy.story?.playTime)&&copy.story.playTime>=0?copy.story.playTime:0);
    copy.settings=R.normalizeSettings?R.normalizeSettings(copy.settings||{}):(copy.settings||{});
    copy.balls={pokeBall:10,...(copy.balls||{})};
    copy.items={potion:0,expShare:false,expShareEnabled:false,doubleBattle:false,tripleBattle:false,...(copy.items||{})};
    if(copy.money===undefined)copy.money=0;
    copy.ownedPokemon=Array.isArray(copy.ownedPokemon)?copy.ownedPokemon.map(p=>({growthBonuses:{},equippedMoves:[],teraType:null,hasTerastallized:false,fainted:false,...p})):[];
    copy.partyIds=Array.isArray(copy.partyIds)?copy.partyIds:[];
    copy.reserveIds=Array.isArray(copy.reserveIds)?copy.reserveIds:[];
    copy.selectedId=copy.selectedId ?? copy.partyIds[0] ?? null;
    copy.trainer={x:100,y:100,direction:'down',...(copy.trainer||{})};
    copy.currentMapId=copy.currentMapId || 'hub';
    copy.currentHuntingArea=copy.currentHuntingArea ?? null;
    if(copy.story)copy.story=this.migrateStory(copy.story);
    copy.version=current;
    return copy;
  },
  preserveInvalid(raw,error) {
    if(!raw)return;
    try {
      const invalidKey=`${this.key}.invalidBackup`;
      if(localStorage.getItem(invalidKey)!==raw)localStorage.setItem(invalidKey,raw);
      localStorage.setItem(`${invalidKey}.timestamp`,String(Date.now()));
      if(error?.message)localStorage.setItem(`${invalidKey}.reason`,String(error.message).slice(0,160));
    } catch {}
  },
  validate(data) {
    const R=window.SurvivorRPG;
    const mode = this.mode || 'battle';
    data=this.migrate(data);
    if (data.gameMode !== mode) throw Error('Save belongs to another mode');
    if (mode === 'story') R.StoryState.validate(data.story);
    if(!data || data.version!==this.currentVersion() || !Number.isFinite(data.playTime)||data.playTime<0 || !Array.isArray(data.ownedPokemon) || mode === 'battle' && !data.ownedPokemon.length)throw Error('Invalid report');
    if(!Array.isArray(data.partyIds)||mode === 'battle' && !data.partyIds.length||!Array.isArray(data.reserveIds))throw Error('Invalid party');
    const ids=new Set();
    for(const p of data.ownedPokemon) {
      if(!R.PokemonData[p.speciesId] || typeof p.uniqueId!=='string'||ids.has(p.uniqueId)||!Number.isInteger(p.level)||p.level<1||p.level>100||!Number.isFinite(p.hp)||p.hp<0)throw Error('Invalid Pokemon');
      if(p.teraType&&!R.DataAdapter.getAllTypes().includes(p.teraType))throw Error('Invalid type');
      if(p.nickname && (typeof p.nickname!=='string'||p.nickname.length>24||/[<>&]/.test(p.nickname)))throw Error('Invalid nickname');
      if(p.exp!==undefined&&(!Number.isFinite(p.exp)||p.exp<0))throw Error('Invalid experience');
      if(p.expToNext!==undefined&&(!Number.isFinite(p.expToNext)||p.expToNext<=0))throw Error('Invalid experience');
      if(p.baseTypes&&(!Array.isArray(p.baseTypes)||!p.baseTypes.length||p.baseTypes.some(type=>!R.DataAdapter.getAllTypes().includes(type))))throw Error('Invalid types');
      if(p.megaFormId&&!R.EvolutionSystem.megaOptions(p.speciesId).some(f=>f.id===p.megaFormId))throw Error('Invalid mega');
      if(p.equippedMoves && (!Array.isArray(p.equippedMoves)||p.equippedMoves.length>4||p.equippedMoves.some(s=>!R.MoveData[typeof s==='string'?s:s.moveId])))throw Error('Invalid moves');
      for(const slot of p.equippedMoves || [])if(typeof slot==='object') {
        if(slot.upgradeLevel!==undefined&&(!Number.isInteger(slot.upgradeLevel)||slot.upgradeLevel<0||slot.upgradeLevel>100))throw Error('Invalid upgrade');
        if(slot.cooldownRemaining!==undefined&&(!Number.isFinite(slot.cooldownRemaining)||slot.cooldownRemaining<0))throw Error('Invalid cooldown');
      }
      for(const n of Object.values(p.growthBonuses || {}))if(!Number.isFinite(n)||n<0||n>100)throw Error('Invalid stats');
      ids.add(p.uniqueId);
    }
    const roster=[...data.partyIds,...data.reserveIds];
    if(data.partyIds.length>6||new Set(roster).size!==roster.length||roster.some(id=>!ids.has(id)))throw Error('Invalid roster');
    if(data.selectedId&&!data.partyIds.includes(data.selectedId))throw Error('Invalid selection');
    if(data.trainer&&(!Number.isFinite(data.trainer.x)||!Number.isFinite(data.trainer.y)||!['up','down','left','right'].includes(data.trainer.direction)))throw Error('Invalid position');
    if(data.items?.potion!==undefined&&(!Number.isInteger(data.items.potion)||data.items.potion<0))throw Error('Invalid inventory');
    if(!Number.isFinite(data.money)||data.money<0||!Number.isFinite(data.balls?.pokeBall)||data.balls.pokeBall<0)throw Error('Invalid inventory');
    if(data.exp!==undefined && !Number.isFinite(data.exp))throw Error('Invalid experience');
    if(data.survival) {
      if(!Number.isFinite(data.survival.elapsed)||data.survival.elapsed<0||data.survival.elapsed>900)throw Error('Invalid survival');
      for(const key of ['milestones','rewardedElites'])if(data.survival[key]&&!Array.isArray(data.survival[key]))throw Error('Invalid milestones');
    }
    for(const stats of [data.runStats,data.survival?.stats].filter(Boolean)) {
      if(!Number.isFinite(stats.earned)||!Array.isArray(stats.caught)||!Array.isArray(stats.rewards)||!stats.damage||typeof stats.damage!=='object')throw Error('Invalid results');
      if(stats.earned<0||stats.caught.some(id=>!R.PokemonData[id])||stats.rewards.some(label=>typeof label!=='string'||label.length>100||/[<>&]/.test(label))||Object.values(stats.damage).some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid results');
    }
    return data;
  },
  write(data) {
    const normalized=this.validate(data);
    const old=localStorage.getItem(this.key);
    if(old)try {this.validate(JSON.parse(old));localStorage.setItem(this.backup,old);}catch{}
    localStorage.setItem(this.key,JSON.stringify(normalized));
  },
  read() {
    for(const key of [this.key,this.backup]) {
      let raw=null;
      try {
        raw=localStorage.getItem(key);if(!raw)continue;
        return {data:this.validate(JSON.parse(raw)),recovered:key===this.backup};
      }catch(error){if(key===this.key)this.preserveInvalid(raw,error);}
    }
    return null;
  },
  readJournal() {
    try {
      const data=JSON.parse(localStorage.getItem(this.journalKey)||'{}');
      return {dex:data.dex||{},firstRewards:data.firstRewards||{},defeats:Number(data.defeats)||0,goals:data.goals||{},clears:Number(data.clears)||0,awaitingStarter:data.awaitingStarter===true};
    } catch {return {dex:{},firstRewards:{},defeats:0,goals:{},clears:0};}
  },
  writeJournal(journal) {try{localStorage.setItem(this.journalKey,JSON.stringify(journal));return true;}catch{return false;}},
  export(data) {
    this.validate(data);
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=this.mode === 'story' ? 'pokemon-story-report.json' : 'pokemon-report.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
};
