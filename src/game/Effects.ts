/* Object pooling for tracers, hit sparks, pickups and damage numbers.
   Avoids per-frame allocation to stay smooth on low-end mobile. */
import * as THREE from 'three';

export class TracerPool {
  private pool: THREE.Mesh[] = [];
  private idx = 0;
  private geo = new THREE.BoxGeometry(0.08, 0.08, 1);
  constructor(private scene: THREE.Scene, n = 40) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      m.visible = false; scene.add(m); this.pool.push(m);
    }
  }
  fire(from: THREE.Vector3, to: THREE.Vector3, color: number) {
    const m = this.pool[this.idx++ % this.pool.length];
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    m.visible = true;
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.lookAt(to); m.scale.set(1, 1, from.distanceTo(to));
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9;
    m.userData.life = 0.08;
  }
  update(dt: number) {
    for (const m of this.pool) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      if (m.userData.life <= 0) m.visible = false;
      else (m.material as THREE.MeshBasicMaterial).opacity = m.userData.life / 0.08;
    }
  }
}

export class SparkPool {
  private pool: THREE.Points[] = [];
  private idx = 0;
  constructor(private scene: THREE.Scene, n = 24) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    for (let i = 0; i < n; i++) {
      const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x39ff88, size: 0.6, transparent: true, opacity: 1 }));
      p.visible = false; scene.add(p); this.pool.push(p);
    }
  }
  burst(pos: THREE.Vector3, color = 0x39ff88) {
    const p = this.pool[this.idx++ % this.pool.length];
    (p.material as THREE.PointsMaterial).color.setHex(color);
    p.position.copy(pos); p.visible = true;
    (p.material as THREE.PointsMaterial).opacity = 1;
    p.userData.life = 0.3;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (!p.visible) continue;
      p.userData.life -= dt;
      (p.material as THREE.PointsMaterial).opacity = Math.max(0, p.userData.life / 0.3);
      p.position.y += dt * 3;
      if (p.userData.life <= 0) p.visible = false;
    }
  }
}

export interface Pickup { mesh: THREE.Mesh; kind: 'weapon' | 'ammo' | 'armor' | 'med'; wid?: string; taken: boolean }

export class PickupManager {
  items: Pickup[] = [];
  group = new THREE.Group();
  constructor(private scene: THREE.Scene) { scene.add(this.group); }

  spawnAt(pos: THREE.Vector3, kind: Pickup['kind'], wid?: string) {
    let color = 0xffb347, geo: THREE.BufferGeometry = new THREE.BoxGeometry(0.9, 0.5, 0.4);
    if (kind === 'ammo') { color = 0x9be8ff; geo = new THREE.BoxGeometry(0.6, 0.4, 0.6); }
    if (kind === 'armor') { color = 0x4db8ff; geo = new THREE.SphereGeometry(0.45, 8, 6); }
    if (kind === 'med') { color = 0xff5d7a; geo = new THREE.SphereGeometry(0.4, 8, 6); }
    if (kind === 'weapon') {
      const colors: Record<string, number> = { pistol: 0x9be8ff, smg: 0x39ff88, rifle: 0xffb347, shotgun: 0xff5d5d, sniper: 0xc39bff, energy: 0x39ff88 };
      color = colors[wid ?? 'rifle'] ?? 0xffffff;
      geo = new THREE.BoxGeometry(1.1, 0.3, 0.3);
    }
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    mesh.position.set(pos.x, 0.8, pos.z);
    mesh.userData.baseY = 0.8;
    this.group.add(mesh);
    this.items.push({ mesh, kind, wid, taken: false });
  }

  update(t: number) {
    for (const p of this.items) {
      if (p.taken) continue;
      p.mesh.rotation.y += 0.02;
      p.mesh.position.y = p.mesh.userData.baseY + Math.sin(t * 2 + p.mesh.position.x) * 0.15;
    }
  }

  clear() { for (const p of this.items) this.group.remove(p.mesh); this.items = []; }
}
