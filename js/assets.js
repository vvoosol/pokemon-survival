window.SurvivorRPG = window.SurvivorRPG || {};

window.SurvivorRPG.AssetManager = class AssetManager {
  constructor() {
    this.images = new Map();
    this.sounds = new Map();
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
    const sound = original.cloneNode(true);
    sound.volume = volume;
    sound.play().catch(() => {});
  }
};
