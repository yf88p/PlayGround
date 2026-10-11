/* UI layer: menus, HUD, minimap canvas, touch controls, tutorial overlay.
   All DOM is created here; Game pushes state via hooks. EN/AR supported. */
import { WEAPONS, CHARACTER_DEFS, type CharacterId, type GameModeId } from '../core/types';
import type { Settings } from '../core/Settings';
import type { I18n } from '../core/i18n';
import type { AudioSys } from '../core/AudioSys';
import type { Input } from '../core/Input';
import type { Game, HudState } from '../game/Game';

const TUT_STEPS = [
  { en: 'Move with joystick / WASD', ar: 'تحرك بالعصا أو WASD' },
  { en: 'Drag right side / mouse to look', ar: 'اسحب اليمين / الفأرة للنظر' },
  { en: 'Tap FIRE / left-click to shoot', ar: 'اضغط إطلاق / زر أيسر للرمي' },
  { en: 'Walk over glowing loot to pick up', ar: 'امشِ فوق الغنائم لأخذها' },
  { en: 'Press ABILITY / Q to use your power', ar: 'اضغط القدرة / Q لاستخدام قوتك' },
];

export class UI {
  root: HTMLElement;
  game!: Game;
  char: CharacterId = 'yf01';
  mode: GameModeId = 'br';
  private view: string = 'start'; // current menu screen (restored after language toggle)
  private hudEl!: HTMLElement;
  private map!: HTMLCanvasElement;
  private feed: string[] = [];
  private hitT = 0;
  private dmgT = 0;

  constructor(private settings: Settings, private i18n: I18n, private audio: AudioSys, private input: Input) {
    this.root = document.getElementById('ui-root')!;
    document.body.classList.toggle('lefty', settings.data.layout === 'lefty');
  }

  attach(game: Game) { this.game = game; this.render(); this.buildTouch(); setInterval(() => this.drawMinimap(), 100); }

  t(k: string) { return this.i18n.t(k); }

  // ---------------- screens ----------------
  render() {
    this.root.innerHTML = `
      <button id="lang-btn">🌐 ${this.t('langToggle')}</button>
      <button id="pause-btn" class="hidden">⏸</button>
      <div id="hud">
        <div id="topbar"><span id="h-alive">👥 12</span><span id="h-kills">☠ 0</span><span id="h-time">0:00</span><span id="h-score"></span><span id="h-zone">🌀 95</span></div>
        <canvas id="minimap" width="170" height="170"></canvas>
        <div id="killfeed"></div>
        <div id="vitals">
          <div style="font-size:12px">❤ <span id="hp-num">100</span> &nbsp; 🛡 <span id="ar-num">0</span></div>
          <div class="bar"><div id="hp-fill" style="width:100%"></div></div>
          <div class="bar"><div id="ar-fill" style="width:0%"></div></div>
        </div>
        <div id="ammo-box"><div id="wname">AR-7</div><span id="ammo-mag">30</span> <span id="ammo-res">/ 150</span><div id="slots"></div></div>
        <div id="hitmarker">✕</div>
        <div id="dmg-vignette"></div>
        <div id="zone-banner">${this.t('zoneWarn')}</div>
        <div id="tutorial-box"></div>
        <div id="desk-hint">WASD move • Mouse look • LMB fire • RMB aim • R reload • Q ability • 1/2/3 weapons</div>
      </div>
      <div id="touch-ui">
        <div id="look-zone"></div>
        <div id="joy-zone"><div id="joy-base"></div><div id="joy-knob"></div></div>
      </div>
      <div id="screen"></div>`;
    this.hudEl = this.root.querySelector('#hud')!;
    this.map = this.root.querySelector('#minimap')!;
    (this.root.querySelector('#lang-btn') as HTMLButtonElement).onclick = () => {
      this.audio.ensure(); this.audio.click();
      this.i18n.toggle(); this.settings.save();
      const v = this.view;
      const wasPlaying = this.game.state === 'playing';
      if (wasPlaying) this.game.paused = false; // avoid soft-lock under pause overlay
      this.render(); this.buildTouch();
      if (wasPlaying) this.showHud(true);
      else this.showView(v);
    };
    (this.root.querySelector('#pause-btn') as HTMLButtonElement).onclick = () => this.showPause();
    if (this.input.isTouch()) this.root.querySelector('#desk-hint')?.remove();
    this.showStart();
  }

  private setScreen(html: string) {
    const s = this.root.querySelector('#screen')!;
    s.innerHTML = html ? `<div class="screen">${html}</div>` : '';
    this.showHud(false);
    (this.root.querySelector('#pause-btn') as HTMLElement).classList.add('hidden');
  }

  showHud(on: boolean) {
    this.hudEl.classList.toggle('on', on);
    this.root.querySelector('#touch-ui')?.classList.toggle('on', on && this.input.isTouch());
    if (!on) this.root.querySelector('#touch-ui')?.classList.remove('on');
    (this.root.querySelector('#pause-btn') as HTMLElement).classList.toggle('hidden', !on);
    if (on) this.root.querySelector('#screen')!.innerHTML = '';
  }

  // ---- start + main menu ----
  showStart() {
    this.view = 'start';
    this.setScreen(`
      <h1 class="logo">GEMA YF</h1>
      <p class="tagline">${this.t('subtitle')} • v1.0 prototype</p>
      <button class="btn" id="b-play">▶ ${this.t('play')}</button>
      <button class="btn secondary" id="b-tut">🎓 ${this.t('tutorial')}</button>
      <p class="tagline" style="margin-top:14px">📱 portrait menus • 🔄 landscape gameplay recommended</p>`);
    this.click('#b-play', () => this.showMenu());
    this.click('#b-tut', () => this.deploy('tutorial'));
  }

  showMenu() {
    this.view = 'menu';
    this.setScreen(`
      <h1 class="logo" style="font-size:42px">GEMA YF</h1>
      <p class="tagline">${this.t('subtitle')}</p>
      <div class="menu-grid">
        <button class="btn" id="m-play">▶ ${this.t('play')}</button>
        <button class="btn" id="m-char">🦸 ${this.t('characters')}</button>
        <button class="btn" id="m-weap">🔫 ${this.t('weapons')}</button>
        <button class="btn" id="m-set">⚙️ ${this.t('settings')}</button>
        <button class="btn" id="m-mis">🎯 ${this.t('missions')}</button>
        <button class="btn" id="m-prof">👤 ${this.t('profile')}</button>
      </div>
      <button class="btn secondary" id="m-tut" style="margin-top:12px">🎓 ${this.t('tutorial')}</button>`);
    this.click('#m-play', () => this.showModes());
    this.click('#m-char', () => this.showChars());
    this.click('#m-weap', () => this.showArsenal());
    this.click('#m-set', () => this.showSettings());
    this.click('#m-mis', () => this.showMissions());
    this.click('#m-prof', () => this.showProfile());
    this.click('#m-tut', () => this.deploy('tutorial'));
  }

  showModes() {
    this.view = 'modes';
    this.setScreen(`<div class="panel"><h2>▶ ${this.t('play')} — GEMA Island</h2>
      ${(['br', 'tdm', 'capture'] as GameModeId[]).map(m => `
        <div class="char-card ${this.mode === m ? 'sel' : ''}" data-mode="${m}">
          <h3>${m === 'br' ? '👑 Battle Royale vs bots (12 players)' : m === 'tdm' ? '⚔️ Team Deathmatch (5v5, first to 20)' : '🔋 Energy Capture (hold 3 points, first to 100)'}</h3>
          <p>${m === 'br' ? 'Shrinking GEMA zone • last one standing wins' : m === 'tdm' ? 'Respawns on • teammates are bots' : 'Stand in green rings to charge your team score'}</p>
        </div>`).join('')}
      <div class="row"><button class="btn secondary" id="back">←</button>
      <button class="btn" id="go">${this.t('start')}</button></div></div>`);
    this.root.querySelectorAll('[data-mode]').forEach(el => (el as HTMLElement).onclick = () => {
      this.mode = (el as HTMLElement).dataset.mode as GameModeId; this.audio.click(); this.showModes();
    });
    this.click('#back', () => this.showMenu());
    this.click('#go', () => this.deploy(this.mode));
  }

  showChars() {
    this.view = 'chars';
    const cards = (Object.keys(CHARACTER_DEFS) as CharacterId[]).map(id => {
      const c = CHARACTER_DEFS[id];
      return `<div class="char-card ${this.char === id ? 'sel' : ''}" data-char="${id}">
        <h3><span style="color:#${c.color.toString(16).padStart(6, '0')}">⬢</span> ${c.name} — ${c.ability}</h3>
        <p>${c.desc}</p>
        <p>${id === 'yf01' ? '⚡ +80% speed for 5s (18s cooldown)' : id === 'nova' ? '🛡 75% frontal damage block for 6s (20s cooldown)' : '📡 Enemy radar for 8s (16s cooldown)'}</p></div>`;
    }).join('');
    this.setScreen(`<div class="panel"><h2>🦸 ${this.t('characters')}</h2>${cards}
      <div class="row"><button class="btn secondary" id="back">←</button><button class="btn" id="go">${this.t('start')}</button></div></div>`);
    this.root.querySelectorAll('[data-char]').forEach(el => (el as HTMLElement).onclick = () => {
      this.char = (el as HTMLElement).dataset.char as CharacterId; this.audio.click(); this.showChars();
    });
    this.click('#back', () => this.showMenu());
    this.click('#go', () => this.deploy(this.mode));
  }

  showArsenal() {
    this.view = 'arsenal';
    const rows = Object.values(WEAPONS).map(w =>
      `<div class="char-card"><h3>🔫 ${w.name}</h3><p>DMG ${w.damage} • MAG ${w.magSize} • ${w.auto ? 'AUTO' : 'SEMI'} • ${w.pellets > 1 ? w.pellets + ' pellets • ' : ''}range ${w.range}m</p></div>`).join('');
    this.setScreen(`<div class="panel"><h2>🔫 ${this.t('weapons')}</h2>${rows}
      <p style="color:var(--muted);font-size:12px">Walk over glowing weapon loot in-match to equip (3 slots). Ammo / armor / medkits also scattered. Green crystals reset your ability cooldown.</p>
      <button class="btn secondary" id="back">←</button></div>`);
    this.click('#back', () => this.showMenu());
  }

  showSettings() {
    this.view = 'settings';
    const s = this.settings.data;
    this.setScreen(`<div class="panel"><h2>⚙️ ${this.t('settings')}</h2>
      <div class="row"><span>Graphics</span><select id="s-q"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <div class="row"><span>Sensitivity ${s.sensitivity.toFixed(1)}</span><input type="range" id="s-sens" min="0.2" max="3" step="0.1" value="${s.sensitivity}"></div>
      <div class="row"><span>🔊 Sound</span><input type="range" id="s-snd" min="0" max="1" step="0.05" value="${s.sound}"></div>
      <div class="row"><span>🎵 Music</span><input type="range" id="s-mus" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="row"><span>Damage indicators</span><div class="toggle ${s.damageIndicators ? 'on' : ''}" id="s-dmg"></div></div>
      <div class="row"><span>Layout (lefty flips sticks)</span><div class="toggle ${s.layout === 'lefty' ? 'on' : ''}" id="s-lay"></div></div>
      <div class="row"><span>Gyroscope (placeholder)</span><div class="toggle ${s.gyro ? 'on' : ''}" id="s-gyr"></div></div>
      <div class="row"><span>Performance mode</span><div class="toggle ${s.performance ? 'on' : ''}" id="s-perf"></div></div>
      <button class="btn secondary" id="back">← ${this.t('resume')}</button></div>`);
    const q = this.root.querySelector('#s-q') as HTMLSelectElement; q.value = s.quality;
    q.onchange = () => { s.quality = q.value as typeof s.quality; this.settings.save(); this.game.applyQuality(); };
    const bind = (id: string, fn: (v: number) => void) => {
      const el = this.root.querySelector(id) as HTMLInputElement;
      el.oninput = () => { fn(parseFloat(el.value)); this.audio.setVolumes(s.sound, s.music); this.settings.save(); };
    };
    bind('#s-sens', v => s.sensitivity = v); bind('#s-snd', v => s.sound = v); bind('#s-mus', v => s.music = v);
    const tg = (id: string, fn: () => void) => {
      const el = this.root.querySelector(id) as HTMLElement;
      el.onclick = () => { fn(); this.settings.save(); this.showSettings(); };
    };
    tg('#s-dmg', () => s.damageIndicators = !s.damageIndicators);
    tg('#s-lay', () => { s.layout = s.layout === 'lefty' ? 'default' : 'lefty'; document.body.classList.toggle('lefty', s.layout === 'lefty'); });
    tg('#s-gyr', () => s.gyro = !s.gyro);
    tg('#s-perf', () => { s.performance = !s.performance; this.game.applyQuality(); });
    this.click('#back', () => this.showMenu());
  }

  showMissions() {
    this.view = 'missions';
    const prof = this.profile();
    const ms = [
      { en: 'Play 1 match', ar: 'العب مباراة', done: prof.matches >= 1 },
      { en: 'Get 3 kills in one match', ar: 'احصل على 3 قتلى', done: prof.bestKills >= 3 },
      { en: 'Win a Battle Royale', ar: 'افوز بباتل رويال', done: prof.wins >= 1 },
      { en: 'Use your ability 5 times', ar: 'استخدم قدرتك 5 مرات', done: prof.abilities >= 5 },
    ];
    this.setScreen(`<div class="panel"><h2>🎯 ${this.t('missions')}</h2>
      ${ms.map(m => `<div class="char-card"><h3>${m.done ? '✅' : '⬜'} ${this.i18n.lang === 'ar' ? m.ar : m.en}</h3></div>`).join('')}
      <button class="btn secondary" id="back">←</button></div>`);
    this.click('#back', () => this.showMenu());
  }

  showProfile() {
    this.view = 'profile';
    const p = this.profile();
    this.setScreen(`<div class="panel"><h2>👤 ${this.t('profile')} — ${CHARACTER_DEFS[this.char].name}</h2>
      <div class="row"><span>Matches</span><b>${p.matches}</b></div>
      <div class="row"><span>Wins</span><b>${p.wins}</b></div>
      <div class="row"><span>Best kills</span><b>${p.bestKills}</b></div>
      <div class="row"><span>Total kills</span><b>${p.kills}</b></div>
      <button class="btn secondary" id="back">←</button></div>`);
    this.click('#back', () => this.showMenu());
  }

  profile() {
    try { return { matches: 0, wins: 0, bestKills: 0, kills: 0, abilities: 0, ...JSON.parse(localStorage.getItem('gema-yf-profile') || '{}') }; }
    catch { return { matches: 0, wins: 0, bestKills: 0, kills: 0, abilities: 0 }; }
  }
  saveProfile(patch: Partial<ReturnType<UI['profile']>>) {
    try { localStorage.setItem('gema-yf-profile', JSON.stringify({ ...this.profile(), ...patch })); } catch { /* ignore */ }
  }

  /** Re-show a menu screen by id (used after language toggle). */
  showView(v: string) {
    if (v === 'menu') this.showMenu();
    else if (v === 'modes') this.showModes();
    else if (v === 'chars') this.showChars();
    else if (v === 'arsenal') this.showArsenal();
    else if (v === 'settings') this.showSettings();
    else if (v === 'missions') this.showMissions();
    else if (v === 'profile') this.showProfile();
    else this.showStart();
  }

  // ---------------- match flow ----------------
  deploy(mode: GameModeId) {
    this.view = 'match';
    this.audio.ensure(); this.audio.click(); this.audio.startMusic();
    this.mode = mode;
    this.game.applyQuality();
    this.game.startMatch(mode, this.char);
    this.showHud(true);
    const p = this.profile(); p.matches++;
    this.saveProfile(p);
    if (this.input.isTouch() && !this.input.enabled) { /* enabled by game */ }
    // desktop: click canvas to lock pointer
    if (!this.input.isTouch()) this.input.lockPointer();
    this.feed = [];
    this.renderFeed();
  }

  showPause() {
    if (this.game.state !== 'playing') return;
    this.game.paused = true;
    const s = this.root.querySelector('#screen')!;
    s.innerHTML = `<div class="screen" style="background:#070b1acc"><div class="panel" style="text-align:center">
      <h2>⏸ ${this.t('pause')}</h2>
      <button class="btn" id="p-res">${this.t('resume')}</button><br>
      <button class="btn secondary" id="p-set">⚙️ ${this.t('settings')}</button>
      <button class="btn secondary" id="p-quit">🏳 ${this.t('quit')}</button></div></div>`;
    this.click('#p-res', () => { s.innerHTML = ''; this.game.paused = false; });
    this.click('#p-set', () => { s.innerHTML = ''; this.showSettingsInMatch(); });
    this.click('#p-quit', () => { this.game.quitToMenu(); this.audio.stopMusic(); this.showMenu(); });
  }

  showSettingsInMatch() {
    const s = this.root.querySelector('#screen')!;
    s.innerHTML = `<div class="screen" style="background:#070b1acc"><div class="panel">
      <h2>⚙️ ${this.t('settings')}</h2>
      <div class="row"><span>Sensitivity ${this.settings.data.sensitivity.toFixed(1)}</span>
      <input type="range" id="s-sens" min="0.2" max="3" step="0.1" value="${this.settings.data.sensitivity}"></div>
      <div class="row"><span>🔊 Sound</span><input type="range" id="s-snd" min="0" max="1" step="0.05" value="${this.settings.data.sound}"></div>
      <button class="btn" id="p-res">${this.t('resume')}</button></div></div>`;
    (this.root.querySelector('#s-sens') as HTMLInputElement).oninput = (e) => {
      this.settings.data.sensitivity = parseFloat((e.target as HTMLInputElement).value); this.settings.save();
    };
    (this.root.querySelector('#s-snd') as HTMLInputElement).oninput = (e) => {
      this.settings.data.sound = parseFloat((e.target as HTMLInputElement).value);
      this.audio.setVolumes(this.settings.data.sound, this.settings.data.music); this.settings.save();
    };
    this.click('#p-res', () => { s.innerHTML = ''; this.game.paused = false; });
  }

  showEnd(win: boolean, stats: string) {
    this.showHud(false);
    this.audio.stopMusic();
    const p = this.profile();
    p.kills += this.game.kills; p.bestKills = Math.max(p.bestKills, this.game.kills);
    if (win) p.wins++;
    this.saveProfile(p);
    const s = this.root.querySelector('#screen')!;
    s.innerHTML = `<div class="screen"><div class="panel" style="text-align:center;border-color:${win ? '#39ff88' : '#ff5d5d'}">
      <h1 class="logo" style="font-size:40px">${win ? '👑' : '💀'}</h1>
      <h2>${win ? this.t('victory') : this.t('defeat')}</h2>
      <p style="color:var(--muted)">${stats}</p>
      <button class="btn" id="e-again">▶ ${this.t('play')}</button><br>
      <button class="btn secondary" id="e-menu">🏠 Menu</button></div></div>`;
    this.click('#e-again', () => this.deploy(this.mode));
    this.click('#e-menu', () => { this.game.quitToMenu(); this.showMenu(); });
  }

  // ---------------- HUD hooks ----------------
  onHud(s: HudState) {
    const set = (id: string, v: string) => { const e = this.root.querySelector(id); if (e) e.textContent = v; };
    set('#h-alive', `👥 ${s.alive}`); set('#h-kills', `☠ ${s.kills}`);
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    set('#h-time', `${m}:${String(sec).padStart(2, '0')}`);
    set('#h-zone', `🌀 ${Math.round(s.zoneR)}`);
    set('#h-score', s.mode === 'br' ? '' : `🔵${s.scoreA} : 🔴${s.scoreB}`);
    set('#hp-num', String(s.hp)); set('#ar-num', String(s.armor));
    (this.root.querySelector('#hp-fill') as HTMLElement).style.width = `${s.hp}%`;
    (this.root.querySelector('#ar-fill') as HTMLElement).style.width = `${Math.min(100, s.armor)}%`;
    set('#ammo-mag', s.mag < 0 ? '—' : String(s.mag)); set('#ammo-res', `/ ${s.reserve}`);
    set('#wname', s.weaponName + (this.game.player.weapon.reloading > 0 ? ' ⟳…' : ''));
    const slots = this.root.querySelector('#slots')!;
    slots.innerHTML = s.slots.map((w, i) => `<span class="slot ${i === s.slot ? 'sel' : ''}">${i + 1}:${w.slice(0, 3).toUpperCase()}</span>`).join('');
    (this.root.querySelector('#zone-banner') as HTMLElement).style.display = s.zoneWarn ? 'block' : 'none';
    // hitmarker/damage fade
    const now = performance.now();
    (this.root.querySelector('#hitmarker') as HTMLElement).style.opacity = now - this.hitT < 180 ? '1' : '0';
    (this.root.querySelector('#dmg-vignette') as HTMLElement).style.opacity = now - this.dmgT < 400 ? '1' : '0';
    // ability button cooldown text
    const ab = document.getElementById('btn-ability');
    if (ab) ab.textContent = s.abilityCd > 0 ? `${Math.ceil(s.abilityCd)}s` : '⚡';
    // tutorial overlay
    if (s.mode === 'tutorial') {
      const box = this.root.querySelector('#tutorial-box') as HTMLElement;
      box.style.display = 'block';
      const steps = this.game.tutDone;
      const next = steps.findIndex(d => !d);
      const L = this.i18n.lang;
      box.innerHTML = next === -1 ? '✅' : `🎓 ${TUT_STEPS[next][L]} (${steps.filter(Boolean).length}/5)`;
    } else {
      (this.root.querySelector('#tutorial-box') as HTMLElement).style.display = 'none';
    }
  }

  onHit(dmg: number, kill: boolean) {
    if (!this.settings.data.damageIndicators) return;
    this.hitT = performance.now();
    const h = this.root.querySelector('#hitmarker') as HTMLElement;
    h.textContent = kill ? '☠' : `✕ ${dmg}`;
    h.style.color = kill ? '#ffd54d' : '#39ff88';
  }

  onDamage() { this.dmgT = performance.now(); }

  onKill(msg: string) {
    this.feed.unshift(msg);
    this.feed = this.feed.slice(0, 4);
    this.renderFeed();
  }

  onZoneWarn(on: boolean) { void on; /* banner handled in onHud */ }

  private renderFeed() {
    const f = this.root.querySelector('#killfeed');
    if (f) f.innerHTML = this.feed.map(m => `<div class="feed-item">${m}</div>`).join('');
  }

  // ---------------- minimap ----------------
  private drawMinimap() {
    if (!this.game || this.game.state !== 'playing') return;
    const c = this.map; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const W = c.width, S = 220; // island size
    const px = (x: number) => (x / S + 0.5) * W;
    const pz = (z: number) => (z / S + 0.5) * W;
    ctx.clearRect(0, 0, W, W);
    ctx.fillStyle = '#0d1530'; ctx.fillRect(0, 0, W, W);
    const d = this.game.mapData();
    // districts dots
    ctx.fillStyle = '#2a3560';
    for (const dt of d.districts) { ctx.beginPath(); ctx.arc(px(dt.x), pz(dt.z), 3, 0, 7); ctx.fill(); }
    // zone circle (safe)
    ctx.strokeStyle = '#39ff88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px(d.zone.x), pz(d.zone.z), (d.zone.r / S) * W, 0, 7); ctx.stroke();
    // capture points
    d.caps.forEach(cp => {
      ctx.fillStyle = cp.owner === 0 ? '#39ff88' : cp.owner === 1 ? '#ff5d5d' : '#8a93b2';
      ctx.fillRect(px(cp.x) - 3, pz(cp.z) - 3, 6, 6);
    });
    // bots (red dots; revealed by Rakan pulse shows all, else nearby only)
    for (const b of d.bots) {
      const dist = Math.hypot(b.x - d.player.x, b.z - d.player.z);
      if (!d.revealed && dist > 45) continue;
      ctx.fillStyle = b.foe ? '#ff5d5d' : '#39ff88';
      ctx.beginPath(); ctx.arc(px(b.x), pz(b.z), 2.5, 0, 7); ctx.fill();
    }
    // player arrow
    ctx.save();
    ctx.translate(px(d.player.x), pz(d.player.z));
    ctx.rotate(-d.player.yaw);
    ctx.fillStyle = '#39ff88';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------------- touch controls ----------------
  private buildTouch() {
    document.querySelectorAll('.tbtn').forEach(e => e.remove());
    const layer = this.root.querySelector('#touch-ui')!;
    const lefty = this.settings.data.layout === 'lefty';
    // right-side buttons (mirror for lefty via CSS zones; buttons anchored right side normally)
    const defs: { id: string; label: string; right: number; bottom: number; hold?: boolean }[] = [
      { id: 'btn-fire', label: 'FIRE', right: 18, bottom: 96, hold: true },
      { id: 'btn-aim', label: 'AIM', right: 116, bottom: 60, hold: true },
      { id: 'btn-jump', label: '⤒', right: 30, bottom: 196 },
      { id: 'btn-crouch', label: '⬇', right: 104, bottom: 150 },
      { id: 'btn-reload', label: '⟳', right: 178, bottom: 96 },
      { id: 'btn-switch', label: '⇄', right: 186, bottom: 160 },
      { id: 'btn-ability', label: '⚡', right: 40, bottom: 270 },
    ];
    for (const b of defs) {
      const el = document.createElement('div');
      el.className = 'tbtn'; el.id = b.id; el.textContent = b.label;
      el.style.right = b.right + 'px'; el.style.bottom = `calc(${b.bottom}px + env(safe-area-inset-bottom, 0px))`;
      if (lefty) { el.style.right = 'auto'; el.style.left = b.right + 'px'; }
      layer.appendChild(el);
      const t = this.input.touch;
      if (b.hold) {
        const key = b.id === 'btn-fire' ? 'fire' : 'aim';
        el.addEventListener('touchstart', (e) => { e.preventDefault(); t[key] = true; el.classList.add('held'); }, { passive: false });
        el.addEventListener('touchend', (e) => { e.preventDefault(); t[key] = false; el.classList.remove('held'); }, { passive: false });
      } else {
        el.addEventListener('touchstart', (e) => {
          e.preventDefault(); this.audio.ensure();
          if (b.id === 'btn-jump') t.jump = true;
          if (b.id === 'btn-crouch') { t.crouch = !t.crouch; el.classList.toggle('held', t.crouch); }
          if (b.id === 'btn-reload') t.reload = true;
          if (b.id === 'btn-ability') t.ability = true;
          if (b.id === 'btn-switch') {
            const n = this.game?.player?.weapons.length ?? 1;
            t.switchReq = n > 0 ? ((this.game.player.slot + 1) % n) : -1;
          }
        }, { passive: false });
      }
      // mouse fallback for testing touch UI on desktop
      el.addEventListener('mousedown', () => { if (b.id === 'btn-fire') t.fire = true; if (b.id === 'btn-aim') t.aim = true; });
      el.addEventListener('mouseup', () => { if (b.id === 'btn-fire') t.fire = false; if (b.id === 'btn-aim') t.aim = false; });
    }
    this.bindStick(); this.bindLook();
  }

  private bindStick() {
    const zone = this.root.querySelector('#joy-zone') as HTMLElement;
    const base = this.root.querySelector('#joy-base') as HTMLElement;
    const knob = this.root.querySelector('#joy-knob') as HTMLElement;
    let id: number | null = null, cx = 0, cy = 0;
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault(); this.audio.ensure();
      const t = e.changedTouches[0]; id = t.identifier; cx = t.clientX; cy = t.clientY;
      base.style.display = knob.style.display = 'block';
      base.style.left = (cx - 55) + 'px'; base.style.top = (cy - 55) + 'px';
      knob.style.left = (cx - 26) + 'px'; knob.style.top = (cy - 26) + 'px';
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== id) continue;
        let dx = (t.clientX - cx) / 45, dy = (cy - t.clientY) / 45;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.input.touch.moveX = dx; this.input.touch.moveY = dy;
        knob.style.left = (cx + dx * 40 - 26) + 'px'; knob.style.top = (cy - dy * 40 - 26) + 'px';
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== id) continue;
        id = null; this.input.touch.moveX = 0; this.input.touch.moveY = 0;
        base.style.display = knob.style.display = 'none';
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  }

  private bindLook() {
    const zone = this.root.querySelector('#look-zone') as HTMLElement;
    let id: number | null = null, lx = 0, ly = 0;
    zone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; id = t.identifier; lx = t.clientX; ly = t.clientY;
    }, { passive: true });
    zone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== id) continue;
        this.input.touch.lookDX += (t.clientX - lx) * 2.2;
        this.input.touch.lookDY += (t.clientY - ly) * 2.2;
        lx = t.clientX; ly = t.clientY;
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === id) id = null;
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  }

  private click(sel: string, fn: () => void) {
    const el = this.root.querySelector(sel) as HTMLElement;
    if (el) el.onclick = () => { this.audio.ensure(); this.audio.click(); fn(); };
  }
}
