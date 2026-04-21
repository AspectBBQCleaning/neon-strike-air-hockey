# NEON STRIKE — High-Stakes Air Hockey

Real-time browser air hockey with a casino aesthetic. Play vs an AI on three difficulties, or invite a friend anywhere in the world for a peer-to-peer WebRTC match. Virtual chips only — no real-money gambling.

**Live demo:** see GitHub Pages link in the repo settings.

## Features

- **Smooth 60fps canvas physics** — paddle velocity transfer, friction, wall bounce, particle goals
- **Three AI difficulties** — Easy / Medium / Hard with payout multipliers (1.5× / 2.0× / 3.0×)
- **Live multiplayer** — peer-to-peer WebRTC via PeerJS public broker, share a room code
- **Virtual wallet** — start with 1,000 chips, persisted in `localStorage`, auto top-up if you go bust
- **Casino UI** — neon palette, animated chips, win/loss modal with payout
- **Mobile-friendly** — touch input, responsive layout, no-zoom viewport
- **Lightweight** — vanilla HTML/CSS/JS, no build step, single PeerJS dependency from CDN

## How multiplayer works

1. **Host** clicks `CREATE ROOM` and shares the displayed code
2. **Friend** opens the same site, picks `JOIN GAME`, pastes the code
3. They connect peer-to-peer (no game server) through a free public PeerJS broker
4. Host runs authoritative physics and streams snapshots at ~30 Hz
5. Client streams paddle position back at ~50 Hz; client mirrors the table so each player sees themselves at the bottom

## Run locally

Any static file server works:

```bash
python3 -m http.server 5577
# then open http://localhost:5577
```

## Deploy to GitHub Pages

1. Push to `main`
2. Settings → Pages → Source: `Deploy from a branch` → Branch: `main` / `/ (root)`
3. Wait ~30 seconds for the first deploy

## Disclaimer

For entertainment only. Uses **demo chips**. No real-money gambling, transfer of value, or wagering of any kind.
