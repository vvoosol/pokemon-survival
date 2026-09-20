window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.DefaultSettings = Object.freeze({music:.25,effects:.5,mute:false,reducedEffects:false,effectQuality:'normal'});
window.SurvivorRPG.normalizeSettings = (raw = {}) => {
  const defaults=window.SurvivorRPG.DefaultSettings;
  const number=(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Math.min(1,Number(value))):fallback;
  const low=raw.effectQuality==='low'||raw.reducedEffects===true;
  return {
    music:number(raw.music,defaults.music),
    effects:number(raw.effects,defaults.effects),
    mute:raw.mute===true,
    reducedEffects:low,
    effectQuality:low?'low':'normal'
  };
};

window.SurvivorRPG.AssetManager = class AssetManager {
  constructor() {
    this.images = new Map();
    this.sounds = new Map();
    this.voices=new Set();this.lastSound=new Map();this.music=null;this.musicKey=null;
    let stored={};
    try {stored=JSON.parse(localStorage.getItem('scientistRpgSettings')||'{}');}catch{}
    this.settings=window.SurvivorRPG.normalizeSettings(stored);
    this.unlocked=false;
    const unlock=()=>{this.unlocked=true;if(this.music && !this.paused)this.music.play().catch(()=>{});};
    window.addEventListener('pointerdown',unlock,{once:true});window.addEventListener('keydown',unlock,{once:true});
  }

  loadImage(key, src) {
    if (this.images.has(key)) return Promise.resolve(this.images.get(key));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  loadSound(key, src) {
    const audio = new Audio(src);
    audio.preload = "auto";
    this.sounds.set(key, audio);
  }

  image(key) {
    return this.images.get(key);
  }

  play(key, volume = 0.45) {
    const original = this.sounds.get(key);
    if (!original) return;
    const now=performance.now();
    if(this.settings.mute||this.voices.size>=8||now-(this.lastSound.get(key)||-1000)<70||this.settings.effects===0)return;
    this.lastSound.set(key,now);
    const sound = original.cloneNode(true);
    sound.volume = Math.min(1,volume*this.settings.effects*2);
    this.voices.add(sound);
    const release=()=>this.voices.delete(sound);sound.onended=release;sound.onerror=release;
    sound.play().catch(release);
  }

  setMusic(key) {
    if(this.musicKey===key)return;
    this.music?.pause();this.musicKey=key;
    this.music=new Audio('assets/audio/'+key+'.ogg');this.music.loop=true;this.music.volume=this.settings.mute?0:this.settings.music;
    if(this.unlocked&&!this.paused)this.music.play().catch(()=>{});
  }

  pause(paused) {
    this.paused=paused;
    if(paused){this.music?.pause();for(const sound of this.voices)sound.pause();this.voices.clear();}
    else if(this.unlocked)this.music?.play().catch(()=>{});
  }

  configure(key,value) {
    if(key==='mute')this.settings.mute=!!value;
    else if(key==='reducedEffects'||key==='effectQuality') {
      const low=key==='effectQuality'?value==='low':!!value;
      this.settings.reducedEffects=low;this.settings.effectQuality=low?'low':'normal';
    } else this.settings[key]=Math.max(0,Math.min(1,Number(value)||0));
    this.settings=window.SurvivorRPG.normalizeSettings(this.settings);
    if(this.music)this.music.volume=this.settings.mute?0:this.settings.music;
    try{localStorage.setItem('scientistRpgSettings',JSON.stringify(this.settings));}catch{}
  }

  applySettings(settings) {
    this.settings=window.SurvivorRPG.normalizeSettings(settings);
    if(this.music)this.music.volume=this.settings.mute?0:this.settings.music;
    try{localStorage.setItem('scientistRpgSettings',JSON.stringify(this.settings));}catch{}
  }
};
