import { Rcon } from 'rcon-client';

export type RconConfig = {
  host: string;
  port: number;
  password: string;
};

export type ServerPop = {
  online?: number;
  max?: number;
  raw?: string;
};

export async function fetchPopulation(cfg: RconConfig): Promise<ServerPop> {
  // Rust servers support `status` via RCON.
  // We'll parse online/max if possible; otherwise keep raw.
  const rcon = await Rcon.connect({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password
  });

  try {
    const out = await rcon.send('status');

    const text = String(out);
    const m = /players\s*:\s*(\d+)\s*\(\s*(\d+)\s*max\s*\)/i.exec(text);
    if (m) {
      return { online: Number(m[1]), max: Number(m[2]), raw: text };
    }
    return { raw: text };
  } finally {
    // Ensure the socket is always closed and never crashes the process.
    try {
      await rcon.end();
    } catch {
      // ignore
    }
  }
}
