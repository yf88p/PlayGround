/* Original placeholder audio: WebAudio oscillator beeps (no copyrighted sounds).
   Provides shoot / hit / pickup / zone / music-drone hooks. */
export class AudioSys {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  musicTimer: number | null = null;
  soundVol = 0.7; musicVol = 0.5;

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.soundVol;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVol * 0.25;
      this.musicGain.connect(this.ctx.destination);
    } catch { /* audio unsupported */ }
  }
  setVolumes(s: number, m: number) {
    this.soundVol = s; this.musicVol = m;
    if (this.master && this.ctx) this.master.gain.value = s;
    if (this.musicGain && this.ctx) this.musicGain.gain.value = m * 0.25;
  }
  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  shoot(kind = 'rifle') {
    const f = kind === 'shotgun' ? 140 : kind === 'sniper' ? 900 : kind === 'energy' ? 620 : 320;
    this.blip(f, 0.12, 'square', 0.25, -180);
  }
  hit() { this.blip(1200, 0.07, 'sine', 0.3, -300); }
  hurt() { this.blip(110, 0.2, 'sawtooth', 0.3, -40); }
  pickup() { this.blip(520, 0.12, 'sine', 0.3, 320); }
  reload() { this.blip(300, 0.09, 'triangle', 0.25, 120); }
  ability() { this.blip(440, 0.3, 'sine', 0.35, 440); }
  zone() { this.blip(220, 0.4, 'sawtooth', 0.2, -80); }
  click() { this.blip(700, 0.05, 'sine', 0.2); }
  win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sine', 0.3), i * 140)); }
  lose() { [400, 300, 220, 150].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'sawtooth', 0.22), i * 160)); }
  startMusic() {
    if (!this.ctx || !this.musicGain || this.musicTimer !== null) return;
    const notes = [55, 65.4, 82.4, 98]; let i = 0;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = notes[i % notes.length]; i++;
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 1.7);
    }, 900);
  }
  stopMusic() { if (this.musicTimer !== null) { clearInterval(this.musicTimer); this.musicTimer = null; } }
}
