# rustbot

Discord "Ops" bot for a Rust server.

## Features (v1)

- Live **server status** message updated on a timer (via RCON)
- **Wipe countdown** announcements (bi-weekly: every other Thursday @ 5:00 PM Central)
- **Restart countdown** announcements (every day @ 12:00 AM / 12:00 PM Central)

> Account linking is handled by off-the-shelf uMod plugins (not this bot).

## Local setup

1. Create a Discord application + bot and invite it to your server.
2. Copy `.env.example` to `.env` and fill values.
3. Install dependencies and run.

```bash
npm install
npm run dev
```

## Configuration

- Timezone: `America/Chicago`
- RCON host/port: `167.160.93.169:28026`
- Wipe anchor: `2026-05-28 17:00 CT`

See `.env.example` for all settings.
