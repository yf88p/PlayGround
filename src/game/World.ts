/* GEMA Island: procedural low-poly map with 7 named districts.
   All geometry is original boxes/cones/cylinders with shared materials
   (few draw calls, vertex colors). Includes colliders list for movement. */
import * as THREE from 'three';
import { ISLAND_SIZE } from '../core/types';

export interface Collider { x: number; z: number; r: number; h?: number }
export interface District { name: string; x: number; z: number; color: number }

export const DISTRICTS: District[] = [
  { name: 'Abandoned City', x: -55, z: -55, color: 0x2a3a66 },
  { name: 'Energy Lab', x: 45, z: -55, color: 0x3d2a66 },
  { name: 'Military Base', x: -55, z: 45, color: 0x2a4a3a },
  { name: 'Desert Village', x: 55, z: 45, color: 0x6b5a2a },
  { name: 'Forest', x: 0, z: 0, color: 0x1d4a2d },
  { name: 'Industrial Port', x: 70, z: -10, color: 0x3a3a4a },
  { name: 'Mountain', x: -20, z: 75, color: 0x4a4a5a },
];

export class World {
  group = new THREE.Group();
  colliders: Collider[] = [];
  crystals: THREE.Mesh[] = [];
  pickupSpots: THREE.Vector3[] = [];
  coverSpots: THREE.Vector3[] = [];
  zoneMesh!: THREE.Mesh;
  time = 0;

  constructor(private scene: THREE.Scene) {}

  build(quality: string) {
    const S = ISLAND_SIZE;
    // --- Ground: big plane with subtle grid texture via vertex colors ---
    const groundGeo = new THREE.PlaneGeometry(S * 1.6, S * 1.6, 1, 1);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x1a2547 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = false;
    this.group.add(ground);

    // Water ring (island feel)
    const water = new THREE.Mesh(
      new THREE.RingGeometry(S * 0.72, S * 1.4, 40),
      new THREE.MeshBasicMaterial({ color: 0x0a2a4a, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    water.rotation.x = -Math.PI / 2; water.position.y = -0.4;
    this.group.add(water);

    // --- Lighting: hemisphere + directional (no shadows on low) ---
    const hemi = new THREE.HemisphereLight(0x9a8bff, 0x1a2440, 1.5);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xbfd4ff, 1.8);
    sun.position.set(60, 90, 30);
    this.scene.add(sun);
    // Neon fog + background
    this.scene.background = new THREE.Color(0x070b1a);
    this.scene.fog = new THREE.Fog(0x070b1a, 60, 220);

    const boxMat = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    const neonMat = new THREE.MeshBasicMaterial({ color: 0x39ff88 });

    // helper: add building/collider
    const addBox = (x: number, z: number, w: number, h: number, d: number, color: number, collide = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat(color));
      m.position.set(x, h / 2, z);
      this.group.add(m);
      if (collide) { this.colliders.push({ x, z, r: Math.max(w, d) * 0.55 }); this.coverSpots.push(new THREE.Vector3(x, 0, z)); }
      // neon roof strip
      if (Math.random() < 0.6) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.12, 0.3), neonMat);
        strip.position.set(x, h + 0.06, z);
        this.group.add(strip);
      }
    };

    // 1) Abandoned City — broken towers grid
    for (let i = 0; i < 10; i++) {
      const x = -55 + (i % 4) * 12 - 12 + Math.random() * 3;
      const z = -55 + Math.floor(i / 4) * 12 - 8 + Math.random() * 3;
      const h = 6 + Math.random() * 10;
      addBox(x, z, 6, h, 6, 0x2a3a66);
    }
    // 2) Energy Lab — glowing cylinders + dome
    for (let i = 0; i < 4; i++) {
      const x = 45 + (i % 2) * 14 - 7, z = -55 + Math.floor(i / 2) * 14 - 7;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 8, 8), boxMat(0x3d2a66));
      cyl.position.set(x, 4, z); this.group.add(cyl);
      this.colliders.push({ x, z, r: 3.5 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.18, 6, 18), neonMat);
      ring.position.set(x, 8.2, z); ring.rotation.x = Math.PI / 2; this.group.add(ring);
    }
    // 3) Military Base — walls + bunkers
    for (let i = 0; i < 6; i++) addBox(-70 + i * 6, 45, 4, 2.5, 8, 0x2f4a34);
    addBox(-55, 55, 14, 4, 10, 0x33455a);
    // 4) Desert Village — small huts
    for (let i = 0; i < 8; i++) {
      const x = 55 + (Math.random() - 0.5) * 36, z = 45 + (Math.random() - 0.5) * 30;
      addBox(x, z, 4, 2.6, 4, 0x7a6a3a);
    }
    // 5) Forest — low-poly cones (no collide on thin trunks: small radius)
    const treeGeo = new THREE.ConeGeometry(2.2, 6, 6);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1f7a3d });
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2, 5);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
    const treeCount = quality === 'low' ? 22 : quality === 'medium' ? 40 : 60;
    const treeIM = new THREE.InstancedMesh(treeGeo, treeMat, treeCount);
    const trunkIM = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      const x = (Math.random() - 0.5) * 60, z = (Math.random() - 0.5) * 60;
      dummy.position.set(x, 5, z); dummy.updateMatrix(); treeIM.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 1, z); dummy.updateMatrix(); trunkIM.setMatrixAt(i, dummy.matrix);
      if (i % 3 === 0) this.colliders.push({ x, z, r: 0.8 });
    }
    this.group.add(treeIM, trunkIM);
    // 6) Industrial Port — containers
    const contColors = [0xb04040, 0x40a0b0, 0x70b040, 0xb0a040];
    for (let i = 0; i < 12; i++) {
      const x = 70 + (i % 4) * 6 - 9, z = -10 + Math.floor(i / 4) * 5 - 5;
      addBox(x, z, 5, 2.4, 2.4, contColors[i % 4]);
    }
    // 7) Mountain — big cones + rocks
    const rockMat = boxMat(0x555566);
    [[-30, 75], [-12, 80], [-20, 65]].forEach(([x, z]) => {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(14, 20, 7), rockMat);
      peak.position.set(x, 10, z); this.group.add(peak);
      this.colliders.push({ x, z, r: 11 });
    });

    // --- Energy crystals: neon green octahedrons (ability pickups) ---
    const cryGeo = new THREE.OctahedronGeometry(0.9);
    const cryMat = new THREE.MeshBasicMaterial({ color: 0x39ff88 });
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(cryGeo, cryMat);
      const x = (Math.random() - 0.5) * (S - 30), z = (Math.random() - 0.5) * (S - 30);
      m.position.set(x, 1.2, z);
      m.userData.spin = Math.random() * Math.PI;
      this.group.add(m); this.crystals.push(m);
      this.pickupSpots.push(new THREE.Vector3(x, 0, z));
    }

    // --- Weapon pickup spots near districts ---
    DISTRICTS.forEach(d => {
      for (let i = 0; i < 3; i++) {
        this.pickupSpots.push(new THREE.Vector3(d.x + (Math.random() - 0.5) * 20, 0, d.z + (Math.random() - 0.5) * 20));
      }
    });

    // --- Shrinking-zone wall: translucent cylinder, resized by Game ---
    const zoneGeo = new THREE.CylinderGeometry(1, 1, 30, 48, 1, true);
    const zoneMat = new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    this.zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    this.zoneMesh.position.y = 15;
    this.group.add(this.zoneMesh);

    // District beacons: floating labels via sprite-less poles (cheap)
    DISTRICTS.forEach(d => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 12, 5), neonMat);
      pole.position.set(d.x, 6, d.z); this.group.add(pole);
    });

    this.scene.add(this.group);
  }

  update(dt: number) {
    this.time += dt;
    // spin/bob crystals (cheap, no per-frame allocation)
    for (const c of this.crystals) {
      if (!c.visible) continue;
      c.rotation.y += dt * 2;
      c.position.y = 1.2 + Math.sin(this.time * 2 + c.userData.spin) * 0.25;
    }
    (this.zoneMesh.material as THREE.MeshBasicMaterial).opacity = 0.18 + Math.sin(this.time * 3) * 0.06;
  }

  /** Push a circle out of box/cylinder colliders (players & bots). */
  collide(pos: THREE.Vector3, radius: number) {
    const S = ISLAND_SIZE / 2;
    pos.x = Math.max(-S, Math.min(S, pos.x));
    pos.z = Math.max(-S, Math.min(S, pos.z));
    for (const c of this.colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz), min = c.r + radius;
      if (d < min && d > 0.001) {
        const push = (min - d) / d;
        pos.x += dx * push; pos.z += dz * push;
      }
    }
  }
}
