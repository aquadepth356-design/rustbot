import { WebSocket } from 'ws';

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

type WebRconPacket = {
  Identifier?: number;
  Message?: string;
  Type?: string;
  Stacktrace?: string;
};

function parsePlayers(text: string): Pick<ServerPop, 'online' | 'max'> {
  // Common Rust output patterns vary. Try a few.
  // Example: "players : 12 (50 max)"
  const m1 = /players\s*:\s*(\d+)\s*\(\s*(\d+)\s*max\s*\)/i.exec(text);
  if (m1) return { online: Number(m1[1]), max: Number(m1[2]) };

  // Some builds: "players: 12 / 50"
  const m2 = /players\s*:\s*(\d+)\s*\/\s*(\d+)/i.exec(text);
  if (m2) return { online: Number(m2[1]), max: Number(m2[2]) };

  return {};
}

async function fetchPopulationWeb(cfg: RconConfig): Promise<ServerPop> {
  // Rust WebRCON uses WebSockets. Many hosts expose it at ws://host:port/<password>
  // (and sometimes require rcon.web 1 server-side; some hosts proxy WebRCON regardless).
  const url = `ws://${cfg.host}:${cfg.port}/${encodeURIComponent(cfg.password)}`;

  return await new Promise<ServerPop>((resolve, reject) => {
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(new Error('WebRCON timeout'));
    }, 8000);

    function cleanup() {
      clearTimeout(timeout);
      try {
        ws.removeAllListeners();
      } catch {
        // ignore
      }
    }

    ws.on('open', () => {
      // Send a command packet. Rust WebRCON commonly expects JSON:
      // { Identifier: number, Message: string, Name?: string }
      const packet = { Identifier: 1, Message: 'status' };
      ws.send(JSON.stringify(packet));
    });

    ws.on('message', (data) => {
      const text = data.toString();
      let pkt: WebRconPacket | null = null;
      try {
        pkt = JSON.parse(text) as WebRconPacket;
      } catch {
        // Not JSON; just treat raw.
      }

      const msg = pkt?.Message ?? text;
      const raw = String(msg);
      const parsed = parsePlayers(raw);

      cleanup();
      try {
        ws.close();
      } catch {
        // ignore
      }

      resolve({ ...parsed, raw });
    });

    ws.on('error', (err) => {
      cleanup();
      try {
        ws.close();
      } catch {
        // ignore
      }
      reject(err);
    });

    ws.on('close', () => {
      // If it closed before we resolved, let the timeout/error handle it.
    });
  });
}

async function fetchPopulationTcp(cfg: RconConfig): Promise<ServerPop> {
  // Keep the previous TCP client as a fallback, but lazy-load so ws-only users don't require it.
  const { Rcon } = await import('rcon-client');

  const rcon = await Rcon.connect({
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    timeout: 8000
  });

  try {
    const out = await rcon.send('status');
    const raw = String(out);
    const parsed = parsePlayers(raw);
    return { ...parsed, raw };
  } finally {
    try {
      await rcon.end();
    } catch {
      // ignore
    }
  }
}

export async function fetchPopulation(cfg: RconConfig): Promise<ServerPop> {
  // Default to WebRCON because many Rust hosts proxy WebRCON on the RCON port.
  // Allow forcing TCP via env.
  const mode = (process.env.RCON_MODE ?? 'web').toLowerCase();
  if (mode === 'tcp') return await fetchPopulationTcp(cfg);
  return await fetchPopulationWeb(cfg);
}
