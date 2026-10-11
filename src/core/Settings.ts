/* Settings store: quality, sensitivity, volumes, toggles. Persisted to localStorage. */
import type { Quality } from './types';

export interface SettingsData {
  quality: Quality;
  sensitivity: number; // 0.2 .. 3
  sound: number; // 0..1
  music: number; // 0..1
  damageIndicators: boolean;
  layout: 'default' | 'lefty';
  gyro: boolean; // placeholder (no real gyro aiming yet)
  performance: boolean; // performance mode caps particles/pixel-ratio
}

const KEY = 'gema-yf-settings-v1';

export const DEFAULT_SETTINGS: SettingsData = {
  quality: 'medium',
  sensitivity: 1.0,
  sound: 0.7,
  music: 0.5,
  damageIndicators: true,
  layout: 'default',
  gyro: false,
  performance: false,
};

export class Settings {
  data: SettingsData = { ...DEFAULT_SETTINGS };
  constructor() { this.load(); }
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
  }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
  }
  // Resolve effective quality: performance mode forces low-ish rendering.
  effectiveQuality(): Quality {
    if (this.data.performance && this.data.quality === 'high') return 'medium';
    if (this.data.performance && this.data.quality === 'medium') return 'low';
    return this.data.quality;
  }
}
