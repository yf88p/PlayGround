/* GEMA YF entry point: wires settings/i18n/audio/input + Game + UI.
   Playable immediately: canvas renders the island behind the start screen. */
import './style.css';
import { Settings } from './core/Settings';
import { I18n } from './core/i18n';
import { AudioSys } from './core/AudioSys';
import { Input } from './core/Input';
import { Game } from './game/Game';
import { UI } from './ui/UI';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const settings = new Settings();
const i18n = new I18n();
i18n.applyDir();
const audio = new AudioSys();
audio.setVolumes(settings.data.sound, settings.data.music);
const input = new Input(canvas);
const ui = new UI(settings, i18n, audio, input);

// HUD hooks bridge Game -> UI
const game = new Game(canvas, settings, i18n, audio, input, {
  onHud: (s) => ui.onHud(s),
  onHit: (dmg, kill) => { ui.onHit(dmg, kill); },
  onKill: (msg) => ui.onKill(msg),
  onEnd: (win, stats) => ui.showEnd(win, stats),
  onTutorialStep: () => { /* rendered inside onHud */ },
  onZoneWarn: () => { /* banner handled in onHud */ },
});

// damage vignette: poll player hp drop cheaply
let lastHp = 100;
setInterval(() => {
  try {
    const hp = game.player?.hp ?? 100;
    if (game.state === 'playing' && hp < lastHp) ui.onDamage();
    lastHp = hp;
  } catch { /* menu */ }
}, 200);

ui.attach(game);
game.loop();
// debug/testing handle
(window as unknown as { gemaGame: Game }).gemaGame = game;

// pause on tab hide (mobile-friendly)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.paused) ui.showPause();
});
// first touch unlocks audio on iOS
window.addEventListener('touchstart', () => audio.ensure(), { passive: true });
window.addEventListener('mousedown', () => audio.ensure());
