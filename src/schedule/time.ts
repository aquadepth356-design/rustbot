import { DateTime, Duration } from 'luxon';

export function parseCtAnchor(ct: string, tz: string): DateTime {
  // ct format: 'YYYY-MM-DD HH:mm'
  const dt = DateTime.fromFormat(ct, 'yyyy-MM-dd HH:mm', { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid WIPE_ANCHOR_AT_CT: ${ct}`);
  return dt;
}

export function nextRecurringEvent(
  anchorInTz: DateTime,
  period: Duration,
  now: DateTime
): DateTime {
  if (now < anchorInTz) return anchorInTz;

  const diffMillis = now.toMillis() - anchorInTz.toMillis();
  const periodMillis = period.as('milliseconds');
  const n = Math.floor(diffMillis / periodMillis) + 1;
  return anchorInTz.plus(period.mapUnits((v) => v * n));
}

export function nextRestartTime(now: DateTime): DateTime {
  // restarts at 00:00 and 12:00 in the zone of 'now'
  const startOfDay = now.startOf('day');
  const midnight = startOfDay;
  const noon = startOfDay.plus({ hours: 12 });

  if (now < midnight.plus({ seconds: 1 })) return midnight; // just in case
  if (now < noon) return noon;
  return startOfDay.plus({ days: 1 }); // next midnight
}

export function parseOffsets(offsetsCsv: string): number[] {
  // returns seconds
  const parts = offsetsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const seconds: number[] = [];
  for (const p of parts) {
    const m = /^([0-9]+)([smhd])$/.exec(p);
    if (!m) throw new Error(`Invalid offset: ${p} (expected like 10m, 6h, 48h)`);
    const n = Number(m[1]);
    const unit = m[2];
    const sec =
      unit === 's'
        ? n
        : unit === 'm'
          ? n * 60
          : unit === 'h'
            ? n * 3600
            : n * 86400;
    seconds.push(sec);
  }

  // sort descending (largest first) for nicer messaging
  seconds.sort((a, b) => b - a);
  return seconds;
}

export function humanizeCountdown(target: DateTime, now: DateTime): string {
  const dur = target.diff(now, ['days', 'hours', 'minutes']);
  const d = Math.max(0, Math.floor(dur.days));
  const h = Math.max(0, Math.floor(dur.hours));
  const m = Math.max(0, Math.floor(dur.minutes));

  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h || d) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}
