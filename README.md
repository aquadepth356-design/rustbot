# Rustbot Ops Bot (TypeScript)

This repo contains a Discord “Ops” bot for a Rust server.

## What it does (v1)

- Updates a **single live status message** in Discord (polls server via RCON)
- Sends **wipe countdown** announcements (bi-weekly: every other Thursday @ 5:00 PM Central)
- Sends **restart countdown** announcements (every day @ 12:00 AM / 12:00 PM Central)

Account linking is handled by off-the-shelf uMod plugins (not this bot).

## Requirements

- Node.js (LTS recommended)
- Discord bot token
- RCON access to your Rust server

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

- Copy `.env.example` → `.env`
- Fill in `DISCORD_TOKEN`, IDs, and `RCON_PASSWORD`

3. Run in dev mode:

```bash
npm run dev
```

## First-time Discord setup

- Invite the bot with OAuth2 scopes: `bot`, `applications.commands`
- Bot permissions (minimum): View Channels, Send Messages, Embed Links, Read Message History

## Commands

### Staff
- `/setup status` posts a status message in the configured channel and starts updating it.

### Public
- `/wipe` shows next wipe time and countdown
- `/restart` shows next restart time and countdown

## Notes

- Timezone is **America/Chicago** (Central Time).
- Wipe anchor is `2026-05-28 17:00 CT` (bi-weekly schedule).
- Restart schedule is fixed at `00:00 CT` and `12:00 CT`.
