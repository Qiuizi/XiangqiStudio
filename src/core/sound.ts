class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private enabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const soundFiles = ['begin', 'check', 'eat', 'end', 'engine', 'move', 'pick', 'undo'];
      for (const name of soundFiles) {
        const audio = new Audio(`/sound/${name}.wav`);
        audio.preload = 'auto';
        this.sounds.set(name, audio);
      }
    }
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public play(name: string) {
    if (!this.enabled) return;
    const audio = this.sounds.get(name);
    if (audio) {
      try {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } catch {}
    }
  }
}

export const sound = new SoundManager();
