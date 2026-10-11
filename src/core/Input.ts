/* Unified input: keyboard+mouse (desktop) and touch state (mobile).
   Touch UI writes into this.state; Game reads it every frame. */
export interface TouchState {
  moveX: number; moveY: number;   // joystick -1..1
  lookDX: number; lookDY: number; // accumulated look delta (consumed per frame)
  fire: boolean; aim: boolean;
  jump: boolean; crouch: boolean; reload: boolean; ability: boolean;
  switchReq: number; // weapon slot request 0..2, -1 = none
}

export class Input {
  keys = new Set<string>();
  mouseDownL = false; mouseDownR = false;
  mouseDX = 0; mouseDY = 0;
  pointerLocked = false;
  touch: TouchState = { moveX:0, moveY:0, lookDX:0, lookDY:0, fire:false, aim:false, jump:false, crouch:false, reload:false, ability:false, switchReq:-1 };
  jumpPressed = false; // edge-trigger for keyboard
  reloadPressed = false;
  abilityPressed = false;
  switchPressed = -1;
  sprint = false;
  enabled = false; // true while in a match
  el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === ' ') { this.jumpPressed = true; e.preventDefault(); }
      if (k === 'r') this.reloadPressed = true;
      if (k === 'q' || k === 'e') this.abilityPressed = true;
      if (k === '1') this.switchPressed = 0;
      if (k === '2') this.switchPressed = 1;
      if (k === '3') this.switchPressed = 2;
      if (k === 'shift') this.sprint = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      if (e.key.toLowerCase() === 'shift') this.sprint = false;
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDownL = false; this.mouseDownR = false; });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouseDownL = true;
      if (e.button === 2) this.mouseDownR = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownL = false;
      if (e.button === 2) this.mouseDownR = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.pointerLocked) return;
      this.mouseDX += e.movementX; this.mouseDY += e.movementY;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Ask for pointer lock on desktop (click canvas). */
  lockPointer() {
    try {
      const c = this.el as HTMLCanvasElement;
      if (c.requestPointerLock && !this.isTouch()) c.requestPointerLock();
    } catch { /* ignore */ }
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.el;
    });
  }

  isTouch() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  moveVector(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    x += this.touch.moveX; y += this.touch.moveY;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  consumeLook(sensitivity: number): { dx: number; dy: number } {
    const dx = (this.mouseDX + this.touch.lookDX) * 0.0022 * sensitivity;
    const dy = (this.mouseDY + this.touch.lookDY) * 0.0022 * sensitivity;
    this.mouseDX = 0; this.mouseDY = 0;
    this.touch.lookDX = 0; this.touch.lookDY = 0;
    return { dx, dy };
  }

  firing(): boolean { return this.mouseDownL || this.touch.fire; }
  aiming(): boolean { return this.mouseDownR || this.touch.aim || this.keys.has('shift') && false; }

  /** Edge-triggered one-shots, cleared at end of frame by Game. */
  endFrame() {
    this.jumpPressed = false; this.reloadPressed = false;
    this.abilityPressed = false; this.switchPressed = -1;
    this.touch.jump = false; this.touch.reload = false;
    this.touch.ability = false; this.touch.switchReq = -1;
  }
}
