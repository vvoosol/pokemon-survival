window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.AssetManager = class AssetManager {
  constructor() {
    this.images = new Map();
    this.sounds = new Map();
    this.voices=new Set();this.lastSound=new Map();this.music=null;this.musicKey=null;
    this.settings={music:.25,effects:.5,reducedEffects:false};
    try {Object.assign(this.settings,JSON.parse(localStorage.getItem('scientistRpgSettings')||'{}'));}catch{}
    this.settings.music=Math.max(0,Math.min(1,Number(this.settings.music)||0));
    this.settings.effects=Math.max(0,Math.min(1,Number(this.settings.effects)||0));
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
    if(this.voices.size>=8||now-(this.lastSound.get(key)||-1000)<70||this.settings.effects===0)return;
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
    this.music=new Audio('assets/audio/'+key+'.ogg');this.music.loop=true;this.music.volume=this.settings.music;
    if(this.unlocked&&!this.paused)this.music.play().catch(()=>{});
  }

  pause(paused) {
    this.paused=paused;
    if(paused){this.music?.pause();for(const sound of this.voices)sound.pause();this.voices.clear();}
    else if(this.unlocked)this.music?.play().catch(()=>{});
  }

  configure(key,value) {
    this.settings[key]=key==='reducedEffects'?!!value:Math.max(0,Math.min(1,Number(value)||0));
    if(this.music)this.music.volume=this.settings.music;
    try{localStorage.setItem('scientistRpgSettings',JSON.stringify(this.settings));}catch{}
  }
};
