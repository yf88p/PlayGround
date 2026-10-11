/* Minimal EN/AR localization. Toggle from menu or HUD. RTL applied for Arabic. */
import type { Lang } from './types';

const STR: Record<string, { en: string; ar: string }> = {
  title: { en: 'GEMA YF', ar: 'جيما YF' },
  subtitle: { en: 'GEMA Island • Last One Standing', ar: 'جزيرة جيما • البقاء للأخير' },
  play: { en: 'PLAY', ar: 'العب' },
  characters: { en: 'Characters', ar: 'الشخصيات' },
  weapons: { en: 'Arsenal', ar: 'الأسلحة' },
  settings: { en: 'Settings', ar: 'الإعدادات' },
  missions: { en: 'Missions', ar: 'المهام' },
  profile: { en: 'Profile', ar: 'الملف' },
  tutorial: { en: 'Tutorial', ar: 'التدريب' },
  start: { en: 'DEPLOY', ar: 'انزال' },
  victory: { en: 'VICTORY — Last One Standing!', ar: 'النصر — آخر الناجين!' },
  defeat: { en: 'ELIMINATED', ar: 'تم إقصاؤك' },
  pause: { en: 'PAUSED', ar: 'إيقاف مؤقت' },
  resume: { en: 'Resume', ar: 'استئناف' },
  quit: { en: 'Quit to Menu', ar: 'خروج للقائمة' },
  alive: { en: 'ALIVE', ar: 'أحياء' },
  kills: { en: 'KILLS', ar: 'قتلى' },
  hp: { en: 'HP', ar: 'صحة' },
  armor: { en: 'ARMOR', ar: 'درع' },
  ability: { en: 'ABILITY', ar: 'القدرة' },
  reload: { en: 'Reload', ar: 'إعادة تلقيم' },
  zoneWarn: { en: '⚠ Get inside the GEMA zone!', ar: '⚠ ادخل منطقة جيما!' },
  langToggle: { en: 'عربي', ar: 'EN' },
};

export class I18n {
  lang: Lang = 'en';
  t(key: string): string {
    const e = STR[key];
    if (!e) return key;
    return this.lang === 'ar' ? e.ar : e.en;
  }
  toggle() { this.lang = this.lang === 'en' ? 'ar' : 'en'; this.applyDir(); }
  applyDir() {
    document.documentElement.lang = this.lang;
    document.documentElement.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
  }
}
