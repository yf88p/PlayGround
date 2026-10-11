/* GEMA YF — shared types & constants.
   Original sci-fi battle-royale prototype. All assets procedural. */

export type Lang = 'en' | 'ar';
export type GameModeId = 'br' | 'tdm' | 'capture' | 'tutorial';
export type Quality = 'low' | 'medium' | 'high';
export type CharacterId = 'yf01' | 'nova' | 'rakan';
export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'energy';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: number;
  headshotMult: number;
  magSize: number;
  reserveStart: number;
  fireInterval: number; // seconds between shots
  auto: boolean;
  spread: number; // radians
  recoil: number; // camera kick
  range: number;
  reloadTime: number;
  pellets: number; // shotgun
  color: number;
  speed: number; // projectile speed (hitscan-ish tracer)
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { id:'pistol',  name:'P-9 Sidearm',   damage:16, headshotMult:1.8, magSize:12, reserveStart:60,  fireInterval:0.28, auto:false, spread:0.02,  recoil:0.012, range:60,  reloadTime:1.1, pellets:1, color:0x9be8ff, speed:120 },
  smg:     { id:'smg',     name:'VK SMG',        damage:11, headshotMult:1.6, magSize:32, reserveStart:160, fireInterval:0.09, auto:true,  spread:0.045, recoil:0.010, range:45,  reloadTime:1.5, pellets:1, color:0x39ff88, speed:110 },
  rifle:   { id:'rifle',   name:'AR-7 Falcon',   damage:20, headshotMult:1.9, magSize:30, reserveStart:150, fireInterval:0.13, auto:true,  spread:0.03,  recoil:0.018, range:90,  reloadTime:1.8, pellets:1, color:0xffb347, speed:140 },
  shotgun: { id:'shotgun', name:'SG Scrapper',   damage:9,  headshotMult:1.5, magSize:6,  reserveStart:30,  fireInterval:0.85, auto:false, spread:0.09,  recoil:0.05,  range:22,  reloadTime:2.2, pellets:7, color:0xff5d5d, speed:90 },
  sniper:  { id:'sniper',  name:'LR Lynx',       damage:85, headshotMult:2.2, magSize:5,  reserveStart:20,  fireInterval:1.2,  auto:false, spread:0.001, recoil:0.06,  range:160, reloadTime:2.6, pellets:1, color:0xc39bff, speed:220 },
  energy:  { id:'energy',  name:'GEMA Coilgun',  damage:26, headshotMult:2.0, magSize:20, reserveStart:100, fireInterval:0.22, auto:true,  spread:0.015, recoil:0.014, range:110, reloadTime:1.9, pellets:1, color:0x39ff88, speed:160 },
};

export const CHARACTER_DEFS: Record<CharacterId, { name: string; ability: string; desc: string; color: number }> = {
  yf01:  { name: 'YF-01', ability: 'Overdrive', desc: 'Temporary speed boost', color: 0x39ff88 },
  nova:  { name: 'Nova',  ability: 'Aegis',     desc: 'Temporary front shield', color: 0x4db8ff },
  rakan: { name: 'Rakan', ability: 'Pulse',     desc: 'Reveals nearby enemies', color: 0xc39bff },
};

export const ISLAND_SIZE = 220; // world is 220x220 units
