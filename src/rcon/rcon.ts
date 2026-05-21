import { Rcon } from 'rcon-srcds';

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
  // Rust servers typically support 'status' which includes player info.
  // We'll parse max/online if possible; otherwise keep raw.
  const rcon = new Rcon({
    address: cfg.host,
    port: cfg.port,
    password: cfg.password
  });

  return await new Promise<ServerPop>((resolve, reject) => {
    let resolved = false;

    rcon.on('authenticated', async () => {
      try {
        const out = await rcon.execute('status');
        rcon.disconnect();

        // Try to parse patterns like "players : 12 (100 max)" depending on Rust output.
        const text = String(out);
        const m = /players\s*:\s*(\d+)\s*\(\s*(\d+)\s*max\s*\)/i.exec(text);
        if (m) {
          resolve({ online: Number(m[1]), max: Number(m[2]), raw: text });
        } else {
          resolve({ raw: text });
        }
      } catch (e) {
        rcon.disconnect();
        reject(e);
      }
    });

    rcon.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        try {
          rcon.disconnect();
        } catch {
          // ignore
        }
        reject(err);
      }
    });

    rcon.connect();
  });
}
