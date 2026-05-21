import Database from 'better-sqlite3';

export type Db = {
  raw: Database.Database;
};

export function openDb(path = 'rustbot.sqlite'): Db {
  const raw = new Database(path);
  raw.pragma('journal_mode = WAL');

  raw.exec(`
    create table if not exists kv (
      key text primary key,
      value text not null
    );

    create table if not exists fired_announcements (
      kind text not null,
      event_at_utc text not null,
      offset_seconds integer not null,
      fired_at_utc text not null,
      primary key (kind, event_at_utc, offset_seconds)
    );
  `);

  return { raw };
}

export function kvGet(db: Db, key: string): string | undefined {
  const row = db.raw
    .prepare('select value from kv where key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function kvSet(db: Db, key: string, value: string): void {
  db.raw
    .prepare(
      `insert into kv(key, value) values(?, ?)
       on conflict(key) do update set value = excluded.value`
    )
    .run(key, value);
}

export function markFired(
  db: Db,
  kind: 'wipe' | 'restart',
  eventAtUtcIso: string,
  offsetSeconds: number,
  firedAtUtcIso: string
): void {
  db.raw
    .prepare(
      `insert or ignore into fired_announcements(kind, event_at_utc, offset_seconds, fired_at_utc)
       values(?, ?, ?, ?)`
    )
    .run(kind, eventAtUtcIso, offsetSeconds, firedAtUtcIso);
}

export function hasFired(
  db: Db,
  kind: 'wipe' | 'restart',
  eventAtUtcIso: string,
  offsetSeconds: number
): boolean {
  const row = db.raw
    .prepare(
      `select 1 as one from fired_announcements
       where kind = ? and event_at_utc = ? and offset_seconds = ?`
    )
    .get(kind, eventAtUtcIso, offsetSeconds) as { one: number } | undefined;
  return !!row;
}
