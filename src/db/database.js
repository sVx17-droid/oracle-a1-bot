import Database from 'better-sqlite3';
import { DB_PATH } from '../config/constants.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

let db;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function migrate() {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS price_ticks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      price REAL NOT NULL,
      volume_24h REAL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ticks_symbol_ts ON price_ticks(symbol, timestamp);

    CREATE TABLE IF NOT EXISTS order_book_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      best_bid REAL,
      best_ask REAL,
      spread_pct REAL,
      bid_volume REAL,
      ask_volume REAL,
      imbalance REAL,
      depth_json TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_obs_symbol_ts ON order_book_snapshots(symbol, timestamp);

    CREATE TABLE IF NOT EXISTS wall_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      ratio REAL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER,
      duration_sec INTEGER,
      is_spoof INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_walls_symbol ON wall_events(symbol);

    CREATE TABLE IF NOT EXISTS spoof_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      exchange TEXT NOT NULL,
      side TEXT NOT NULL,
      price REAL NOT NULL,
      qty REAL NOT NULL,
      disappear_ms INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whale_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      score REAL NOT NULL,
      score_breakdown TEXT,
      price REAL,
      imbalance REAL,
      wall_count INTEGER,
      spoof_count INTEGER,
      cross_ex_discrepancy REAL,
      direction TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS forward_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      whale_event_id INTEGER REFERENCES whale_events(id),
      symbol TEXT NOT NULL,
      entry_price REAL,
      entry_score REAL,
      direction TEXT,
      outcome_15m_pct REAL,
      outcome_30m_pct REAL,
      outcome_1h_pct REAL,
      outcome_2h_pct REAL,
      outcome_4h_pct REAL,
      completed INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS pair_stats (
      symbol TEXT PRIMARY KEY,
      avg_score_24h REAL,
      max_score_24h REAL,
      whale_events_24h INTEGER,
      spoof_events_24h INTEGER,
      wall_events_24h INTEGER,
      fwd_win_rate REAL,
      last_update INTEGER
    );
  `);
  console.log('[db] Migrated');
}
