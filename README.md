# PlayGround — GEMA YF

**GEMA YF** is an original mobile-friendly 3D battle-royale shooter prototype
(Three.js + Vite + TypeScript, no backend, all procedural placeholder assets).
Land on GEMA Island, loot 6 weapon types, use character abilities
(YF-01 speed, Nova shield, Rakan radar), survive bot squads and the shrinking
GEMA energy zone — be the last one standing.

Modes: Battle Royale (12 players vs bots) • Team Deathmatch (first to 20) •
Energy Capture (hold 3 points) • Tutorial (5 steps).
EN/AR localization, touch + WASD/mouse controls, Low/Med/High quality scaling.

```bash
npm install
npm run dev      # → http://localhost:3002
npm run build    # → dist/
```

Desktop: WASD move • mouse look (click canvas) • LMB fire • RMB aim •
R reload • Q ability • 1/2/3 weapons • Space jump.
Mobile: left joystick • drag right side to look • FIRE/AIM/jump/crouch/reload/switch/ability buttons.

Code map: `src/core/` (settings, i18n, audio, input) •
`src/game/` (World island, Effects pools, Entities, Game loop/AI/zone) •
`src/ui/` (menus, HUD, minimap, touch controls) • `src/main.ts` (bootstrap).

<!-- omgithub:readme:start -->
## 🚀 Build, play, and remix with OMGithub

**Created using [OMGithub.com](https://omgithub.com).**

[![OMGithub](https://img.shields.io/badge/OMGithub-Open%20project-orange?style=for-the-badge)](https://omgithub.com/yf88p/PlayGround)
[![GitHub](https://img.shields.io/badge/GitHub-Source-181717?logo=github&style=for-the-badge)](https://github.com/yf88p/PlayGround)

- 🎮 [Open the project](https://omgithub.com/yf88p/PlayGround).
- ✨ [Remix this project](https://omgithub.com/?remix=yf88p%2FPlayGround).
- 💻 [Explore the source](https://github.com/yf88p/PlayGround).
- 🛠️ [Check build runs](https://github.com/yf88p/PlayGround/actions).
- 🐛 [Report an issue](https://github.com/yf88p/PlayGround/issues).
- 👤 [Explore the creator's projects](https://omgithub.com/yf88p).
- 🌍 [Create with OMGithub](https://omgithub.com).
<!-- omgithub:readme:end -->
