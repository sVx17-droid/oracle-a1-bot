import { getDb } from './database.js';
import { RETENTION_DAYS } from '../config/constants.js';

const inserts = {
  priceTick: null,
  orderBookSnapshot: null,
  wallEvent: null,
  spoofEvent: null,
  whaleEvent: null,
  forwardTest: null,
};

function prepare() {
  const db = getDb();
  inserts.priceTick = db.prepare('INSERT INTO price_ticks (symbol, exchange, price, volume_24h, timestamp) VALUES (?, ?, ?, ?, ?)');
  inserts.orderBookSnapshot = db.prepare('INSERT INTO order_book_snapshots (symbol, exchange, best_bid, best_ask, spread_pct, bid_volume, ask_volume, imbalance, depth_json, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  inserts.wallEvent = db.prepare('INSERT INTO wall_events (symbol, exchange, side, price, qty, ratio, first_seen, last_seen, duration_sec, is_spoof) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  inserts.spoofEvent = db.prepare('INSERT INTO spoof_events (symbol, exchange, side, price, qty, disappear_ms, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
  inserts.whaleEvent = db.prepare('INSERT INTO whale_events (symbol, score, score_breakdown, price, imbalance, wall_count, spoof_count, cross_ex_discrepancy, direction, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  inserts.forwardTest = db.prepare('INSERT INTO forward_tests (whale_event_id, symbol, entry_price, entry_score, direction) VALUES (?, ?, ?, ?, ?)');
}

export function insertPriceTick(symbol, exchange, price, volume) {
  if (!inserts.priceTick) prepare();
  inserts.priceTick.run(symbol, exchange || 'binance', price, volume || null, Date.now());
}

export function insertOrderBookSnapshot(symbol, exchange, summary) {
  if (!inserts.orderBookSnapshot) prepare();
  inserts.orderBookSnapshot.run(
    symbol, exchange,
    summary.bestBid, summary.bestAsk, summary.spread,
    summary.bidVolume, summary.askVolume, summary.imbalance,
    null, Date.now()
  );
}

export function insertWallEvent(symbol, exchange, side, price, qty, ratio, firstSeen, lastSeen, durationSec, isSpoof) {
  if (!inserts.wallEvent) prepare();
  inserts.wallEvent.run(symbol, exchange, side, price, qty, ratio, firstSeen, lastSeen, durationSec, isSpoof ? 1 : 0);
}

export function insertSpoofEvent(symbol, exchange, side, price, qty, disappearMs) {
  if (!inserts.spoofEvent) prepare();
  inserts.spoofEvent.run(symbol, exchange, side, price, qty, disappearMs, Date.now());
}

export function insertWhaleEvent(symbol, score, breakdown, price, imbalance, wallCount, spoofCount, crossExDisc, direction) {
  if (!inserts.whaleEvent) prepare();
  const result = inserts.whaleEvent.run(symbol, score, JSON.stringify(breakdown), price, imbalance, wallCount, spoofCount, crossExDisc, direction, Date.now());
  return result.lastInsertRowid;
}

export function insertForwardTest(whaleEventId, symbol, price, score, direction) {
  if (!inserts.forwardTest) prepare();
  inserts.forwardTest.run(whaleEventId, symbol, price, score, direction);
}

export function updateForwardTest(id, outcomes) {
  const db = getDb();
  db.prepare(`UPDATE forward_tests SET
    outcome_15m_pct = ?, outcome_30m_pct = ?, outcome_1h_pct = ?, outcome_2h_pct = ?, outcome_4h_pct = ?,
    completed = 1 WHERE id = ?`).run(
    outcomes[15]?.changePct || null,
    outcomes[30]?.changePct || null,
    outcomes[60]?.changePct || null,
    outcomes[120]?.changePct || null,
    outcomes[240]?.changePct || null,
    id
  );
}

export function getFwdStats() {
  const db = getDb();
  const stats = {};
  for (const tf of [15, 30, 60, 120, 240]) {
    const row = db.prepare(`SELECT COUNT(*) as total,
      SUM(CASE WHEN outcome_${tf}m_pct IS NOT NULL THEN 1 ELSE 0 END) as completed,
      AVG(outcome_${tf}m_pct) as avg_change ` + 
      `FROM forward_tests WHERE completed = 1`).get();
    stats['t' + tf + 'm'] = {
      total: row.total, completed: row.completed,
      avgChange: row.avg_change ? Math.round(row.avg_change * 100) / 100 : 0,
    };
  }
  return stats;
}

export function getWhaleHistory(symbol, hours = 24) {
  const db = getDb();
  const cutoff = Date.now() - hours * 3600000;
  return db.prepare('SELECT * FROM whale_events WHERE symbol = ? AND timestamp > ? ORDER BY timestamp DESC').all(symbol, cutoff);
}

export function cleanup() {
  const db = getDb();
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  db.prepare('DELETE FROM price_ticks WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM order_book_snapshots WHERE timestamp < ?').run(cutoff);
  db.prepare('DELETE FROM wall_events WHERE first_seen < ?').run(cutoff);
  db.prepare('DELETE FROM spoof_events WHERE timestamp < ?').run(cutoff);
  console.log('[db] Cleanup done, retention: ' + RETENTION_DAYS + ' days');
}

let vacuumScheduled = false;
export function maybeVacuum() {
  if (vacuumScheduled) return;
  vacuumScheduled = true;
  setTimeout(() => {
    const db = getDb();
    db.exec('VACUUM');
    vacuumScheduled = false;
    console.log('[db] VACUUM done');
  }, 1000);
}
