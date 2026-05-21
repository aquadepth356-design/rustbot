export type Env = {
  DISCORD_TOKEN: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_GUILD_ID: string;
  STATUS_CHANNEL_ID: string;
  ANNOUNCE_CHANNEL_ID: string;
  STAFF_ROLE_ID?: string;

  RCON_HOST: string;
  RCON_PORT: number;
  RCON_PASSWORD: string;

  TIMEZONE: string;

  WIPE_ANCHOR_AT_CT: string;
  WIPE_PERIOD_DAYS: number;
  WIPE_OFFSETS: string;

  RESTART_OFFSETS: string;

  STATUS_POLL_SECONDS: number;
};

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function loadEnv(): Env {
  const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

  return {
    DISCORD_TOKEN: req('DISCORD_TOKEN'),
    DISCORD_APPLICATION_ID: req('DISCORD_APPLICATION_ID'),
    DISCORD_GUILD_ID: req('DISCORD_GUILD_ID'),
    STATUS_CHANNEL_ID: req('STATUS_CHANNEL_ID'),
    ANNOUNCE_CHANNEL_ID: req('ANNOUNCE_CHANNEL_ID'),
    STAFF_ROLE_ID: STAFF_ROLE_ID && STAFF_ROLE_ID.trim().length ? STAFF_ROLE_ID : undefined,

    RCON_HOST: process.env.RCON_HOST ?? '127.0.0.1',
    RCON_PORT: Number(process.env.RCON_PORT ?? '28016'),
    RCON_PASSWORD: req('RCON_PASSWORD'),

    TIMEZONE: process.env.TIMEZONE ?? 'America/Chicago',

    WIPE_ANCHOR_AT_CT: process.env.WIPE_ANCHOR_AT_CT ?? '2026-05-28 17:00',
    WIPE_PERIOD_DAYS: Number(process.env.WIPE_PERIOD_DAYS ?? '14'),
    WIPE_OFFSETS: process.env.WIPE_OFFSETS ?? '48h,24h,6h,1h,10m',

    RESTART_OFFSETS: process.env.RESTART_OFFSETS ?? '10m,1m',

    STATUS_POLL_SECONDS: Number(process.env.STATUS_POLL_SECONDS ?? '60')
  };
}
