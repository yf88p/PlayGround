/* Game orchestrator: render loop, third-person controller, shooting,
   bot AI (3 levels), shrinking GEMA zone, 4 modes, pickups & abilities.
   All original code; hitscan combat with object-pooled tracers. */
import * as THREE from 'three';
import { World, DISTRICTS } from './World';
import { TracerPool, SparkPool, PickupManager } from './Effects';
import { Fighter, makeWeaponState } from './Entities';
import { WEAPONS, ISLAND_SIZE, type CharacterId, type GameModeId, type WeaponId } from '../core/types';
import type { Settings } from '../core/Settings';
import type { I18n } from '../core/i18n';
import type { AudioSys } from '../core/AudioSys';
import type { Input } from '../core/Input';

export interface HudState {
  hp: number; armor: number; mag: number; reserve: number; weaponName: string;
  alive: number; kills: number; time: number; zoneR: number; zoneWarn: boolean;
  abilityCd: number; abilityMax: number; slot: number; slots: string[];
  mode: GameModeId; scoreA: number; scoreB: number; capture: number[];
}

export interface UiHooks {
  onHud(s: HudState): void;
  onHit(dmg: number, kill: boolean, dirX: number): void;
  onKill(msg: string): void;
  onEnd(win: boolean, stats: string): void;
  onTutorialStep(i: number, done: boolean[]): void;
  onZoneWarn(w: boolean): void;
}

const BOT_NAMES = ['Vex', 'Kilo', 'Drax', 'Mira', 'Juno', 'Pax', 'Onyx', 'Zed', 'Luma', 'Rook', 'Sable', 'Echo'];

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  tracers: TracerPool; sparks: SparkPool; pickups: PickupManager;
  player!: Fighter;
  bots: Fighter[] = [];
  mode: GameModeId = 'br';
  charId: CharacterId = 'yf01';
  state: 'menu' | 'playing' | 'paused' | 'over' = 'menu';
  time = 0; matchTime = 0;
  // zone
  zoneX = 0; zoneZ = 0; zoneR = 100; zoneTargetR = 100; zoneTX = 0; zoneTZ = 0; zoneTimer = 30; zonePhase = 0;
  zoneDps = 4;
  // tdm / capture
  scoreA = 0; scoreB = 0;
  capPoints: { x: number; z: number; owner: number; prog: number }[] = [];
  capHold: number[] = [0, 0, 0];
  // tutorial
  tutDone: boolean[] = [false, false, false, false, false];
  camYaw = 0; camPitch = -0.25;
  camDist = 4.6;
  clock = new THREE.Clock();
  tmpV = new THREE.Vector3(); tmpV2 = new THREE.Vector3(); tmpV3 = new THREE.Vector3();
  botCount = 11;
  kills = 0;
  paused = false;
  spawnProt = 0; // seconds of player invulnerability after deploy
  private regenT = 0; private lastPhp = 100;

  constructor(
    private canvas: HTMLCanvasElement,
    private settings: Settings, private i18n: I18n,
    private audio: AudioSys, private input: Input,
    private hooks: UiHooks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
    this.world = new World(this.scene);
    this.world.build(settings.effectiveQuality());
    this.tracers = new TracerPool(this.scene, 48);
    this.sparks = new SparkPool(this.scene, 28);
    this.pickups = new PickupManager(this.scene);
    this.applyQuality();
    window.addEventListener('resize', () => this.resize());
    // static camera for menu backdrop
    this.camera.position.set(0, 40, 90);
    this.camera.lookAt(0, 0, 0);
  }

  applyQuality() {
    const q = this.settings.effectiveQuality();
    const pr = q === 'low' ? Math.min(1, window.devicePixelRatio) : q === 'medium' ? Math.min(1.5, window.devicePixelRatio) : Math.min(2, window.devicePixelRatio);
    this.renderer.setPixelRatio(this.settings.data.performance ? 1 : pr);
    this.renderer.shadowMap.enabled = false; // keep cheap everywhere for mobile
    this.camDist = q === 'low' ? 5.2 : 4.6;
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  // ---------- match setup ----------
  startMatch(mode: GameModeId, char: CharacterId) {
    this.mode = mode; this.charId = char;
    this.scene.remove(this.player?.group);
    for (const b of this.bots) this.scene.remove(b.group);
    this.bots = []; this.pickups.clear();
    this.time = 0; this.matchTime = 0; this.kills = 0;
    this.zonePhase = 0; this.zoneTimer = mode === 'br' ? 30 : 9999;
    this.zoneX = 0; this.zoneZ = 0; this.zoneR = 95; this.zoneTargetR = 95; this.zoneTX = 0; this.zoneTZ = 0;
    this.zoneDps = 4; this.scoreA = 0; this.scoreB = 0;
    this.tutDone = [false, false, false, false, false];
    // player spawn: forest edge, with spawn protection + starting armor
    const spawn = new THREE.Vector3((Math.random() - 0.5) * 40, 0, 20 + Math.random() * 20);
    this.player = new Fighter(char, spawn, true);
    this.player.giveDefaults(mode);
    this.player.armor = 25;
    this.spawnProt = 4;
    this.regenT = 0; this.lastPhp = 100;
    this.scene.add(this.player.group);
    this.camYaw = Math.PI; this.camPitch = -0.22;
    // bots
    const n = mode === 'tutorial' ? 0 : mode === 'tdm' ? 9 : this.botCount;
    const chars: CharacterId[] = ['yf01', 'nova', 'rakan'];
    for (let i = 0; i < n; i++) {
      // Spawn bots well away from the player so nobody dies in the first seconds.
      let p = new THREE.Vector3();
      for (let tries = 0; tries < 12; tries++) {
        p.set((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160);
        if (p.distanceTo(spawn) > 48) break;
      }
      const b = new Fighter(chars[i % 3], p, false);
      b.giveDefaults(mode);
      b.name = BOT_NAMES[i % BOT_NAMES.length] + '-' + (i + 1);
      // AI level distribution: 40% beginner, 35% medium, 25% advanced
      const r = Math.random();
      b.aiLevel = this.mode === 'tdm' ? (i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2) : r < 0.4 ? 0 : r < 0.75 ? 1 : 2;
      b.team = mode === 'tdm' ? (i % 2 === 0 ? 1 : 0) : 0;
      if (mode === 'tdm' && i < 4) b.team = 0; // ensure player team has mates
      b.aiTarget.copy(p);
      this.scene.add(b.group);
      this.bots.push(b);
    }
    if (mode === 'tdm') this.player.team = 0;
    // weapon/ammo/med pickups scattered
    const wids: WeaponId[] = ['smg', 'rifle', 'shotgun', 'sniper', 'energy', 'rifle', 'smg'];
    this.world.pickupSpots.forEach((s, i) => {
      const roll = Math.random();
      if (roll < 0.35) this.pickups.spawnAt(s, 'weapon', wids[i % wids.length]);
      else if (roll < 0.6) this.pickups.spawnAt(s, 'ammo');
      else if (roll < 0.72) this.pickups.spawnAt(s, 'armor');
      else if (roll < 0.84) this.pickups.spawnAt(s, 'med');
    });
    // capture points: lab / city / port
    this.capPoints = [
      { x: 45, z: -55, owner: -1, prog: 0 },
      { x: -55, z: -55, owner: -1, prog: 0 },
      { x: 70, z: -10, owner: -1, prog: 0 },
    ];
    this.capHold = [0, 0, 0];
    // capture point beacons
    this.state = 'playing'; this.paused = false;
    this.input.enabled = true;
    this.clock.start();
  }

  pauseToggle() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
  }
  quitToMenu() { this.state = 'menu'; this.input.enabled = false; }

  aliveCount() { return (this.player.alive ? 1 : 0) + this.bots.filter(b => b.alive).length; }

  // ---------- per-frame ----------
  loop = () => {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing' && !this.paused) {
      this.time += dt; this.matchTime += dt;
      this.spawnProt = Math.max(0, this.spawnProt - dt);
      this.updatePlayer(dt);
      this.updateBots(dt);
      this.updateZone(dt);
      this.updateModes(dt);
      this.world.update(dt);
      this.tracers.update(dt); this.sparks.update(dt);
      this.pickups.update(this.time);
      this.checkPickups();
      this.checkTutorial();
      this.pushHud();
      // victory / defeat
      if (this.mode === 'br' && this.aliveCount() <= 1 && this.matchTime > 5) this.endMatch(this.player.alive);
      if (!this.player.alive && this.mode !== 'tdm') {
        this.player.deadTimer -= dt;
        if (this.player.deadTimer <= 0 && this.state === 'playing') this.endMatch(false);
      }
      if (this.mode === 'tdm') {
        if (this.scoreA >= 20 || this.scoreB >= 20 || this.matchTime > 300) this.endMatch(this.scoreA >= this.scoreB && this.player.alive);
      }
      if (this.mode === 'capture') {
        if (this.scoreA >= 100 || this.matchTime > 300) this.endMatch(this.scoreA >= 100 || this.scoreA >= this.scoreB);
      }
    } else if (this.state === 'menu') {
      this.time += dt;
      // slow orbit menu backdrop
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 95, 42, Math.cos(a) * 95);
      this.camera.lookAt(0, 0, 0);
      this.world.update(dt);
      this.tracers.update(dt); this.sparks.update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  };

  endMatch(win: boolean) {
    if (this.state !== 'playing') return;
    this.state = 'over'; this.input.enabled = false;
    if (win) this.audio.win(); else this.audio.lose();
    const mins = Math.floor(this.matchTime / 60), secs = Math.floor(this.matchTime % 60);
    this.hooks.onEnd(win, `Kills ${this.kills} • Alive ${this.aliveCount()} • ${mins}:${String(secs).padStart(2, '0')}`);
  }

  // ---------- player ----------
  private updatePlayer(dt: number) {
    const p = this.player;
    if (!p.alive) return;
    // out-of-combat regen (mobile-shooter feel): +4 HP/s after 4s without damage
    if (p.hp < this.lastPhp) { this.regenT = 4; }
    else {
      this.regenT -= dt;
      if (this.regenT <= 0 && p.hp < p.maxHp()) p.hp = Math.min(p.maxHp(), p.hp + 4 * dt);
    }
    this.lastPhp = p.hp;
    // look
    const { dx, dy } = this.input.consumeLook(this.settings.data.sensitivity);
    this.camYaw -= dx; this.camPitch -= dy;
    this.camPitch = Math.max(-1.1, Math.min(0.5, this.camPitch));
    p.yaw = this.camYaw + Math.PI; // model faces away from camera
    const aiming = this.input.aiming();
    p.crouch = this.input.keys.has('c') || this.input.touch.crouch;
    // move relative to camera
    const mv = this.input.moveVector();
    if (mv.x !== 0 || mv.y !== 0) this.tutDone[0] = true;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) this.tutDone[1] = true;
    let speed = 6;
    if (this.input.sprint && mv.y > 0) speed = 8.6;
    if (p.crouch) speed = 3;
    if (aiming) speed = 3.6;
    speed *= p.speedMul;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const wx = (mv.x * cos - mv.y * sin) * speed * dt;
    const wz = (-mv.x * sin - mv.y * cos) * speed * dt;
    p.pos.x += wx; p.pos.z += wz;
    // jump / gravity
    if ((this.input.jumpPressed || this.input.touch.jump) && p.grounded) { p.vy = 6.5; p.grounded = false; }
    if (!p.grounded || p.pos.y > 0) {
      p.vy -= 18 * dt; p.pos.y += p.vy * dt;
      if (p.pos.y <= 0) { p.pos.y = 0; p.vy = 0; p.grounded = true; }
    }
    p.group.position.y = p.pos.y;
    this.world.collide(p.pos, 0.6);
    p.tickAbility(dt);
    if (this.input.abilityPressed || this.input.touch.ability) {
      if (p.useAbility()) { this.audio.ability(); this.tutDone[4] = true; }
    }
    // weapon switching
    const sw = this.input.switchPressed !== -1 ? this.input.switchPressed : this.input.touch.switchReq;
    if (sw !== -1 && sw !== undefined && sw < p.weapons.length) { p.slot = sw; this.audio.click(); }
    // reload
    const w = p.weapon, def = WEAPONS[w.id];
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const need = def.magSize - w.mag, take = Math.min(need, w.reserve);
        w.mag += take; w.reserve -= take;
      }
    } else if ((this.input.reloadPressed || this.input.touch.reload) && w.mag < def.magSize && w.reserve > 0) {
      w.reloading = def.reloadTime; this.audio.reload();
    }
    p.fireCd -= dt;
    const wantFire = this.input.firing();
    if (wantFire && w.reloading <= 0 && p.fireCd <= 0) {
      if (w.mag <= 0) { // auto reload
        if (w.reserve > 0) { w.reloading = def.reloadTime; this.audio.reload(); }
      } else if (!def.auto && !this.input.mouseDownL && !this.input.touch.fire) {
        // semi: require fresh press — simplified: allow hold at lower rate
        this.tryFire(p);
      } else {
        this.tryFire(p);
        if (!def.auto) { this.input.mouseDownL = false; this.input.touch.fire = false; }
      }
    }
    p.syncMesh(dt, mv.x !== 0 || mv.y !== 0, this.time);
    // camera: third person with aim zoom
    const dist = aiming ? 2.4 : this.camDist;
    const cx = p.pos.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = p.pos.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = p.pos.y + 2.1 + Math.sin(-this.camPitch) * dist;
    this.tmpV.set(cx, cy, cz);
    this.camera.position.lerp(this.tmpV, 1 - Math.pow(0.0001, dt));
    // keep the camera out of buildings/mountains (cheap 2D push-out)
    this.world.collide(this.camera.position, 0.5);
    if (this.camera.position.y < 0.6) this.camera.position.y = 0.6;
    this.tmpV2.set(p.pos.x, p.pos.y + (p.crouch ? 1.2 : 1.6), p.pos.z);
    this.camera.lookAt(this.tmpV2);
    // recoil recovery handled implicitly (pitch kick applied to camPitch at fire)
    this.input.endFrame();
  }

  /** Hitscan shot with spread + recoil + LOS check. Used by player and bots. */
  tryFire(shooter: Fighter) {
    const w = shooter.weapons[shooter.slot];
    const def = WEAPONS[w.id];
    if (w.mag <= 0) return;
    w.mag--; shooter.fireCd = def.fireInterval;
    const from = this.tmpV.copy(shooter.pos); from.y += 1.4;
    // targets: everyone alive except shooter (+ teammates in tdm)
    const targets: Fighter[] = [];
    if (shooter !== this.player && this.player.alive) targets.push(this.player);
    for (const b of this.bots) if (b !== shooter && b.alive && !(this.mode === 'tdm' && b.team === shooter.team)) targets.push(b);
    if (shooter === this.player && this.mode === 'tdm') { /* teammates aren't targets */ }
    // forward dir from yaw (+ pitch for player)
    const baseYaw = shooter.isPlayer ? this.camYaw + Math.PI : shooter.yaw;
    const basePitch = shooter.isPlayer ? this.camPitch : -0.05;
    for (let pel = 0; pel < def.pellets; pel++) {
      const spread = def.spread * (shooter.isPlayer ? 1 : 2.2); // bots less accurate
      const yaw = baseYaw + (Math.random() - 0.5) * spread * 2;
      const pitch = basePitch + (Math.random() - 0.5) * spread * 2;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(-pitch), Math.cos(yaw) * Math.cos(pitch));
      // find nearest hit
      let best: Fighter | null = null; let bestD = def.range;      for (const t of targets) {
        this.tmpV2.copy(t.pos); this.tmpV2.y += 1.1;
        this.tmpV3.copy(this.tmpV2).sub(from);
        const d = this.tmpV3.length();
        if (d > def.range) continue;
        this.tmpV3.normalize();
        const angle = this.tmpV3.dot(dir);
        if (angle < 0.985 - spread) continue; // outside cone
        if (this.blocked(from, this.tmpV2)) continue;
        if (d < bestD) { bestD = d; best = t; }
      }
      // wall hit distance (simple: ray vs colliders)
      let endD = def.range;
      // spawn protection: tracers still fly, but the player takes no damage
      if (best === this.player && this.spawnProt > 0) best = null;
      if (best) endD = bestD;
      else endD = this.wallDist(from, dir, def.range);
      const to = from.clone().addScaledVector(dir, endD);
      this.tracers.fire(from.clone(), to, def.color);
      if (best) {
        const headshot = Math.random() < (shooter.aiLevel === 2 ? 0.22 : 0.12);
        let dmg = def.damage * (headshot ? def.headshotMult : 1);
        // balance: bots hit softer (softest vs the player) so fights feel fair
        if (!shooter.isPlayer) dmg *= best === this.player ? 0.3 : 0.5;
        // no one-shot bot kills: keeps BR pacing in the minutes, not seconds
        if (!shooter.isPlayer) dmg = Math.min(dmg, 34);
        // distance falloff
        if (bestD > def.range * 0.6) dmg *= 0.7;
        const toVictim = this.tmpV3.copy(best.pos).sub(shooter.pos).normalize();
        const facing = new THREE.Vector3(Math.sin(best.yaw), 0, Math.cos(best.yaw));
        const front = toVictim.dot(facing) < 0;
        const dealt = best.damage(dmg, front);
        this.sparks.burst(to, headshot ? 0xffd54d : 0xff5d5d);
        if (shooter === this.player) {
          this.tutDone[2] = true;
          this.audio.hit();
          this.hooks.onHit(Math.round(dealt), !best.alive, 0);
          if (!best.alive) {
            this.kills++; shooter.kills++;
            this.hooks.onKill(`Eliminated ${best.name}`);
            this.audio.pickup();
            if (this.mode === 'tdm') this.scoreA++;
          }
        } else if (best === this.player) {
          this.audio.hurt();
          this.hooks.onHit(Math.round(dealt), false, Math.sign(Math.random() - 0.5));
        } else if (!best.alive && this.mode === 'tdm') {
          // bot kills credit team score
          if (shooter.team === 0) this.scoreA++; else this.scoreB++;
        }
      }
    }
    if (shooter === this.player) {
      this.camPitch = Math.min(0.5, this.camPitch + def.recoil * (this.input.aiming() ? 0.6 : 1));
      this.audio.shoot(w.id);
    }
  }

  private blocked(a: THREE.Vector3, b: THREE.Vector3): boolean {
    // segment vs circle colliders (2D) — cheap LOS
    for (const c of this.world.colliders) {
      if (c.r < 2) continue; // trees/trunks don't block bullets much
      const abx = b.x - a.x, abz = b.z - a.z;
      const l2 = abx * abx + abz * abz;
      if (l2 < 0.001) continue;
      let t = ((c.x - a.x) * abx + (c.z - a.z) * abz) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + abx * t - c.x, pz = a.z + abz * t - c.z;
      if (px * px + pz * pz < c.r * c.r * 0.7) return true;
    }
    return false;
  }

  private wallDist(from: THREE.Vector3, dir: THREE.Vector3, maxD: number): number {
    let best = maxD;
    for (const c of this.world.colliders) {
      if (c.r < 2) continue;
      // ray-circle 2D
      const ox = from.x - c.x, oz = from.z - c.z;
      const dx = dir.x, dz = dir.z;
      const a = dx * dx + dz * dz; if (a < 1e-6) continue;
      const b = 2 * (ox * dx + oz * dz);
      const cc = ox * ox + oz * oz - c.r * c.r * 0.7;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && t < best) best = t;
    }
    return best;
  }

  // ---------- bots ----------
  private updateBots(dt: number) {
    const q = this.settings.effectiveQuality();
    const thinkEvery = q === 'low' ? 0.5 : 0.3;
    for (const b of this.bots) {
      if (!b.alive) {
        // respawn in tdm
        if (this.mode === 'tdm') {
          b.deadTimer -= dt;
          if (b.deadTimer <= 0) {
            b.alive = true; b.hp = 100; b.armor = 25;
            b.pos.set((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160);
            b.weapons = [makeWeaponState(['smg', 'rifle', 'shotgun'][Math.floor(Math.random() * 3)] as WeaponId)];
            b.slot = 0;
          } else { b.syncMesh(dt, false, this.time); continue; }
        } else { b.syncMesh(dt, false, this.time); continue; }
      }
      b.tickAbility(dt);
      b.fireCd -= dt;
      b.aiTimer -= dt;
      // find nearest enemy
      let foe: Fighter | null = null; let foeD = Infinity;
      const consider = (f: Fighter) => {
        if (!f.alive || f === b) return;
        if (this.mode === 'tdm' && f.team === b.team) return;
        const d = b.pos.distanceTo(f.pos);
        // opening grace: bots don't hunt the player across the map at spawn
        if (f === this.player && this.mode === 'br' && this.matchTime < 25 && d > 34) return;
        if (d < foeD) { foeD = d; foe = f; }
      };
      consider(this.player);
      // bots fight each other in BR (cheap: only nearest 3 checks via sampling)
      if (this.mode === 'br') {
        for (let i = 0; i < this.bots.length; i += 2) { const o = this.bots[i]; if (o !== b) consider(o); }
      } else {
        for (const o of this.bots) if (o !== b) consider(o);
      }
      if (b.aiTimer <= 0) {
        b.aiTimer = thinkEvery + Math.random() * 0.4;
        this.think(b, foe, foeD);
      }
      this.steer(b, foe, foeD, dt);
      // combat: volley-gated fire, only when foe is close & visible.
      // Engage ranges by level keep early game calm and fair on mobile.
      const engageR = b.aiLevel === 0 ? 20 : b.aiLevel === 1 ? 26 : 32;
      b.combatCd -= dt;
      if (foe && foeD < engageR && b.combatCd <= 0) {
        const vis = !this.blocked(this.tmpV.set(b.pos.x, 1.4, b.pos.z), this.tmpV2.set((foe as Fighter).pos.x, 1.1, (foe as Fighter).pos.z));
        if (vis) {
          // face foe
          const dx = (foe as Fighter).pos.x - b.pos.x, dz = (foe as Fighter).pos.z - b.pos.z;
          b.yaw = Math.atan2(dx, dz);
          // volley interval by level (beginners are slow, advanced press harder)
          b.combatCd = (b.aiLevel === 0 ? 1.6 : b.aiLevel === 1 ? 1.1 : 0.8) + Math.random() * 0.5;
          if (b.fireCd <= 0) {
            this.tryFire(b);
            if (b.weapon.mag <= 0 && b.weapon.reserve > 0 && b.weapon.reloading <= 0) b.weapon.reloading = WEAPONS[b.weapon.id].reloadTime;
          }
        } else {
          b.combatCd = 0.25; // retry LOS soon
        }
      }
      // reload tick
      const w = b.weapon, def = WEAPONS[w.id];
      if (w.reloading > 0) {
        w.reloading -= dt;
        if (w.reloading <= 0) { const need = def.magSize - w.mag, take = Math.min(need, w.reserve); w.mag += take; w.reserve -= take; }
      }
      // zone damage + heal kits (advanced)
      const zd = Math.hypot(b.pos.x - this.zoneX, b.pos.z - this.zoneZ);
      if (zd > this.zoneR) b.damage(this.zoneDps * dt, false);
      if (b.aiLevel === 2 && b.hp < 45 && b.healKits > 0 && (!foe || foeD > 12)) {
        b.healKits--; b.heal(50);
      }
      b.syncMesh(dt, true, this.time);
    }
    // player zone damage
    const pzd = Math.hypot(this.player.pos.x - this.zoneX, this.player.pos.z - this.zoneZ);
    if (this.player.alive && pzd > this.zoneR) {
      this.player.damage(this.zoneDps * dt, false);
      this.hooks.onZoneWarn(true);
      if (Math.floor(this.time * 2) % 2 === 0) this.audio.zone();
      if (this.player.hp <= 0) { this.hooks.onKill('Consumed by the GEMA storm'); }
    } else this.hooks.onZoneWarn(false);
  }

  private think(b: Fighter, foe: Fighter | null, foeD: number) {
    // In BR bots play it cool: only chase nearby foes, otherwise loot toward the zone.
    const chaseR = this.mode === 'br' ? 30 : 55;
    if (!foe || foeD > chaseR) { b.aiState = 'wander'; b.aiTarget.set((Math.random() - 0.5) * 160, 0, (Math.random() - 0.5) * 160); return; }
    if (b.aiLevel === 0) b.aiState = 'chase';
    else if (b.aiLevel === 1) {
      // medium: seek cover when weak or reloading, else chase
      b.aiState = (b.hp < 50 || b.weapon.mag < 4) ? 'cover' : 'chase';
      if (b.aiState === 'cover') {
        // nearest cover spot away from foe
        let best: THREE.Vector3 | null = null; let bs = -Infinity;
        for (const c of this.world.coverSpots) {
          const dFoe = Math.hypot(c.x - (foe as Fighter).pos.x, c.z - (foe as Fighter).pos.z);
          const dMe = Math.hypot(c.x - b.pos.x, c.z - b.pos.z);
          const s = dFoe - dMe * 0.5;
          if (s > bs && dMe < 40) { bs = s; best = c; }
        }
        if (best) b.aiTarget.copy(best);
      }
    } else {
      // advanced: flank when healthy, heal/cover when weak
      if (b.hp < 40 && b.healKits > 0) b.aiState = 'heal';
      else b.aiState = Math.random() < 0.6 ? 'flank' : 'chase';
      if (b.aiState === 'flank' && foe) {
        const a = Math.atan2(b.pos.x - foe.pos.x, b.pos.z - foe.pos.z) + (Math.random() < 0.5 ? 1.2 : -1.2);
        const r = Math.max(10, foeD * 0.8);
        b.aiTarget.set(foe.pos.x + Math.sin(a) * r, 0, foe.pos.z + Math.cos(a) * r);
      }
    }
  }

  private steer(b: Fighter, foe: Fighter | null, foeD: number, dt: number) {
    const speed = (b.aiLevel === 2 ? 5.6 : b.aiLevel === 1 ? 5.0 : 4.2) * (this.mode === 'tdm' ? 1.1 : 1);
    let tx = b.aiTarget.x, tz = b.aiTarget.z;
    if ((b.aiState === 'chase' || b.aiState === 'flank') && foe) {
      if (b.aiState === 'chase') {
        // keep ideal range ~12
        const dx = b.pos.x - (foe as Fighter).pos.x, dz = b.pos.z - (foe as Fighter).pos.z;
        const d = Math.max(0.1, foeD);
        const want = 11;
        tx = (foe as Fighter).pos.x + (dx / d) * want;
        tz = (foe as Fighter).pos.z + (dz / d) * want;
      } else { tx = b.aiTarget.x; tz = b.aiTarget.z; }
    }
    if (b.aiState === 'heal') { // run away from foe
      if (foe) { tx = b.pos.x + (b.pos.x - foe.pos.x); tz = b.pos.z + (b.pos.z - foe.pos.z); }
    }
    const dx = tx - b.pos.x, dz = tz - b.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) {
      b.pos.x += (dx / d) * speed * dt;
      b.pos.z += (dz / d) * speed * dt;
      if (!foe || foeD > 20) b.yaw = Math.atan2(dx, dz);
    }
    // simple jump over nothing; keep grounded
    b.pos.y = 0;
    this.world.collide(b.pos, 0.6);
    // clamp target inside zone pull (bots prefer zone)
    const zd = Math.hypot(b.pos.x - this.zoneX, b.pos.z - this.zoneZ);
    if (zd > this.zoneR && b.aiTimer <= 0.01) {
      b.aiTarget.set(this.zoneX + (Math.random() - 0.5) * this.zoneR, 0, this.zoneZ + (Math.random() - 0.5) * this.zoneR);
      b.aiState = 'chase';
    }
  }

  // ---------- zone & modes ----------
  private updateZone(dt: number) {
    if (this.mode !== 'br') {
      this.zoneR = 95; this.zoneX = 0; this.zoneZ = 0;
      this.world.zoneMesh.position.set(0, 15, 0);
      this.world.zoneMesh.scale.set(95, 1, 95);
      return;
    }
    this.zoneTimer -= dt;
    if (this.zoneTimer <= 0) {
      this.zonePhase++;
      this.zoneTargetR = Math.max(8, this.zoneR * 0.62);
      const a = Math.random() * Math.PI * 2, rr = (this.zoneR - this.zoneTargetR) * 0.5;
      this.zoneTX = this.zoneX + Math.sin(a) * rr;
      this.zoneTZ = this.zoneZ + Math.cos(a) * rr;
      this.zoneTimer = this.zonePhase < 3 ? 30 : 22;
      this.zoneDps = 4 + this.zonePhase * 2;
      this.audio.zone();
    }
    // smooth shrink
    this.zoneR += (this.zoneTargetR - this.zoneR) * Math.min(1, dt * 0.15);
    this.zoneX += (this.zoneTX - this.zoneX) * Math.min(1, dt * 0.15);
    this.zoneZ += (this.zoneTZ - this.zoneZ) * Math.min(1, dt * 0.15);
    this.world.zoneMesh.position.set(this.zoneX, 15, this.zoneZ);
    this.world.zoneMesh.scale.set(Math.max(0.1, this.zoneR), 1, Math.max(0.1, this.zoneR));
  }

  private updateModes(dt: number) {
    if (this.mode === 'capture') {
      // standing near point captures for team 0 (player team); bots capture for team 1
      this.capPoints.forEach((cp, i) => {
        let a = 0, e = 0;
        if (this.player.alive && Math.hypot(this.player.pos.x - cp.x, this.player.pos.z - cp.z) < 7) a++;
        for (const b of this.bots) {
          if (!b.alive) continue;
          if (Math.hypot(b.pos.x - cp.x, b.pos.z - cp.z) < 7) { if (b.team === 0) a++; else e++; }
        }
        if (a > e) { cp.owner = 0; this.capHold[i] += dt * a; }
        else if (e > a) { cp.owner = 1; }
        if (cp.owner === 0) this.scoreA += dt * 2;
        else if (cp.owner === 1) this.scoreB += dt * 2;
      });
    }
    if (this.mode === 'tutorial') {
      // keep player inside, slow timer
    }
  }

  // ---------- pickups & crystals ----------
  private checkPickups() {
    const p = this.player;
    if (!p.alive) return;
    for (const it of this.pickups.items) {
      if (it.taken) continue;
      const d = Math.hypot(p.pos.x - it.mesh.position.x, p.pos.z - it.mesh.position.z);
      if (d > 2.2) continue;
      if (it.kind === 'weapon' && it.wid) {
        const id = it.wid as WeaponId;
        const existing = p.weapons.find(w => w.id === id);
        if (existing) { existing.reserve += WEAPONS[id].magSize * 2; }
        else if (p.weapons.length < 3) { p.weapons.push(makeWeaponState(id)); p.slot = p.weapons.length - 1; }
        else { p.weapons[p.slot] = makeWeaponState(id); }
        this.tutDone[3] = true;
        this.audio.pickup();
        it.taken = true; this.pickups.group.remove(it.mesh);
      } else if (it.kind === 'ammo') {
        p.weapons.forEach(w => w.reserve += WEAPONS[w.id].magSize);
        this.audio.pickup(); it.taken = true; this.pickups.group.remove(it.mesh);
      } else if (it.kind === 'armor') {
        p.armor = Math.min(100, p.armor + 50);
        this.audio.pickup(); it.taken = true; this.pickups.group.remove(it.mesh);
      } else if (it.kind === 'med') {
        p.heal(40);
        this.audio.pickup(); it.taken = true; this.pickups.group.remove(it.mesh);
      }
    }
    // energy crystals: restore ability cooldown + small heal
    for (const c of this.world.crystals) {
      if (!c.visible) continue;
      const d = Math.hypot(p.pos.x - c.position.x, p.pos.z - c.position.z);
      if (d < 2.4) {
        c.visible = false;
        p.abilityCd = 0; p.heal(15);
        this.sparks.burst(c.position.clone(), 0x39ff88);
        this.audio.ability();
        setTimeout(() => { c.visible = true; }, 25000);
      }
    }
  }

  private checkTutorial() {
    if (this.mode !== 'tutorial') return;
    this.hooks.onTutorialStep(-1, this.tutDone);
    if (this.tutDone.every(Boolean) && this.state === 'playing') {
      this.endMatch(true);
    }
  }

  private pushHud() {
    const p = this.player;
    const w = p.weapons[p.slot];
    const def = WEAPONS[w.id];
    this.hooks.onHud({
      hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
      mag: w.mag, reserve: w.reserve, weaponName: def.name,
      alive: this.aliveCount(), kills: this.kills,
      time: this.matchTime, zoneR: this.zoneR,
      zoneWarn: Math.hypot(p.pos.x - this.zoneX, p.pos.z - this.zoneZ) > this.zoneR,
      abilityCd: p.abilityCd, abilityMax: 18, slot: p.slot,
      slots: p.weapons.map(x => x.id), mode: this.mode,
      scoreA: Math.floor(this.scoreA), scoreB: Math.floor(this.scoreB),
      capture: this.capPoints.map(c => c.owner),
    });
  }

  /** Expose positions for minimap. */
  mapData() {
    return {
      player: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.camYaw, alive: this.player.alive },
      bots: this.bots.filter(b => b.alive).map(b => ({ x: b.pos.x, z: b.pos.z, foe: this.mode === 'tdm' ? b.team !== this.player.team : true, revealed: this.player.revealed > 0 })),
      zone: { x: this.zoneX, z: this.zoneZ, r: this.zoneR },
      caps: this.capPoints,
      districts: DISTRICTS,
      revealed: this.player.revealed > 0,
    };
  }

  districtAt(x: number, z: number): string {
    let best = '', bd = 1e9;
    for (const d of DISTRICTS) { const dd = Math.hypot(x - d.x, z - d.z); if (dd < bd) { bd = dd; best = d.name; } }
    return best;
  }
}
