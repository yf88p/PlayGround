/* Player & Bot entities: low-poly humanoid (body+head+gun), health/armor,
   weapon slots, abilities. Bot AI has 3 levels: 0 beginner, 1 cover-seeker, 2 flanker+healer. */
import * as THREE from 'three';
import { WEAPONS, CHARACTER_DEFS, type CharacterId, type WeaponId } from '../core/types';

export interface WeaponState { id: WeaponId; mag: number; reserve: number; reloading: number }

export function makeWeaponState(id: WeaponId): WeaponState {
  const d = WEAPONS[id];
  return { id, mag: d.magSize, reserve: d.reserveStart, reloading: 0 };
}

export class Fighter {
  group = new THREE.Group();
  body!: THREE.Mesh; head!: THREE.Mesh; gun!: THREE.Mesh; shieldMesh!: THREE.Mesh;
  pos: THREE.Vector3;
  yaw = 0; pitch = 0;
  hp = 100; armor = 0; alive = true;
  vy = 0; grounded = true; crouch = false;
  weapons: WeaponState[] = [];
  slot = 0;
  fireCd = 0;
  speedMul = 1;
  abilityCd = 0; abilityActive = 0;
  shield = false; // nova
  revealed = 0; // rakan pulse marks enemies
  isPlayer = false;
  // bot AI
  aiLevel = 0; aiTimer = 0; aiTarget = new THREE.Vector3();
  aiState: 'wander' | 'chase' | 'cover' | 'flank' | 'heal' = 'wander';
  combatCd = 1 + Math.random(); // volley gate so bots can't melt targets every frame
  healKits = 1;
  kills = 0; team = 0;
  name = 'BOT';
  color = 0xff5d5d;
  deadTimer = 0;

  constructor(public charId: CharacterId, start: THREE.Vector3, isPlayer = false) {
    this.isPlayer = isPlayer;
    this.pos = start.clone();
    const c = CHARACTER_DEFS[charId];
    this.color = isPlayer ? c.color : [0xff5d5d, 0xffb347, 0xc39bff][Math.floor(Math.random() * 3)];
    const mat = new THREE.MeshLambertMaterial({ color: this.color });
    const dark = new THREE.MeshLambertMaterial({ color: 0x11182e });
    this.body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.4), mat);
    this.body.position.y = 1.0;
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), dark);
    this.head.position.y = 1.75;
    this.gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0x39ff88 }));
    this.gun.position.set(0.35, 1.2, 0.5);
    // name-free: add neon visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0x39ff88 }));
    visor.position.set(0, 1.75, 0.24);
    // shield bubble (nova)
    this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.3 }));
    this.shieldMesh.visible = false;
    this.group.add(this.body, this.head, this.gun, visor, this.shieldMesh);
    this.group.position.copy(this.pos);
  }

  get weapon(): WeaponState { return this.weapons[this.slot]; }

  giveDefaults(mode: string) {
    if (this.isPlayer) {
      // Rifle first: more fun immediately; pistol backup.
      this.weapons = [makeWeaponState('rifle'), makeWeaponState('pistol')];
      if (mode === 'tutorial') this.weapons = [makeWeaponState('pistol')];
    } else {
      // Bots use everything except the sniper (one-shot kills ruin pacing).
      const pool: WeaponId[] = ['pistol', 'smg', 'rifle', 'shotgun', 'energy'];
      const w = pool[Math.floor(Math.random() * pool.length)];
      this.weapons = [makeWeaponState(w)];
    }
    this.slot = 0;
  }

  maxHp() { return 100; }

  /** Returns actual damage taken after armor/shield. */
  damage(amount: number, fromFront: boolean): number {
    if (!this.alive) return 0;
    if (this.shield && fromFront) amount *= 0.25; // nova aegis blocks front
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount * 0.5);
      this.armor -= absorbed; amount -= absorbed;
    }
    this.hp -= amount;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.deadTimer = 2.5; }
    return amount;
  }

  heal(n: number) { this.hp = Math.min(this.maxHp(), this.hp + n); }

  useAbility(): boolean {
    if (this.abilityCd > 0 || !this.alive) return false;
    if (this.charId === 'yf01') { this.speedMul = 1.8; this.abilityActive = 5; this.abilityCd = 18; }
    if (this.charId === 'nova') { this.shield = true; this.shieldMesh.visible = true; this.abilityActive = 6; this.abilityCd = 20; }
    if (this.charId === 'rakan') { this.revealed = 8; this.abilityActive = 0.5; this.abilityCd = 16; }
    return true;
  }

  tickAbility(dt: number) {
    this.abilityCd = Math.max(0, this.abilityCd - dt);
    if (this.abilityActive > 0) {
      this.abilityActive -= dt;
      if (this.abilityActive <= 0) { this.speedMul = 1; this.shield = false; this.shieldMesh.visible = false; }
    }
    if (this.revealed > 0) this.revealed -= dt;
  }

  /** Update mesh transform + death fall animation. */
  syncMesh(dt: number, moving: boolean, t: number) {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    const crouchScale = this.crouch ? 0.75 : 1;
    this.body.scale.y += (crouchScale - this.body.scale.y) * Math.min(1, dt * 10);
    if (!this.alive) {
      this.group.rotation.x += (Math.PI / 2 - this.group.rotation.x) * Math.min(1, dt * 4);
      this.group.position.y = Math.max(-0.4, this.group.position.y - dt * 0.5);
    } else {
      this.group.rotation.x = 0;
      // run bob
      if (moving) this.body.position.y = 1.0 + Math.abs(Math.sin(t * 10)) * 0.06;
      else this.body.position.y = 1.0;
    }
    // shield pulse
    if (this.shieldMesh.visible) this.shieldMesh.scale.setScalar(1 + Math.sin(t * 6) * 0.05);
  }
}
