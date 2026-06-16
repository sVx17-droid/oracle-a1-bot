import http from 'http';
import fs from 'fs';
import { PAIRS, PAIR_CONFIG } from './config/pairs.js';
import {
  PORT, ANALYSIS_INTERVAL_MS, SNAPSHOT_INTERVAL_MS, CLEANUP_INTERVAL_MS,
  FT_EVAL_INTERVAL_MS, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
  ALERT_LEVEL, ALERT_COOLDOWN_MIN
} from './config/constants.js';
import { WebSocketManager } from './websocket/ws-manager.js';
import { SymbolState } from './core/symbol-state.js';
import { migrate, getDb } from './db/database.js';
import {
  insertOrderBookSnapshot, insertWallEvent,
  insertSpoofEvent, insertWhaleEvent, insertForwardTest,
  getFwdStats, getWhaleHistory, cleanup, maybeVacuum
} from './db/repository.js';
import { sendTelegram } from './alerts/telegram.js';
import { startScheduler } from './scheduler.js';

// Initialize database
migrate();

// Initialize state per pair
const states = new Map();
PAIRS.forEach((p) => {
  states.set(p.symbol, new SymbolState(p.symbol, PAIR_CONFIG[p.symbol] || {}));
});

// Global alerts feed (last 50 across all pairs)
let globalAlerts = [];

// Start WebSocket connections
const wsManager = new WebSocketManager(PAIRS, (data) => {
  const state = states.get(data.symbol);
  if (!state) return;
  state.applyDepth(data);
});
wsManager.start();

// ===== Analysis Loop =====
let snapshotCounter = 0;
function runAnalysis() {
  snapshotCounter++;

  for (const [symbol, state] of states) {
    // Consolidated engine analysis via SymbolState
    state.runAnalysis();
    checkAlert(state);

    // Save order book snapshot to DB every 5s
    if (snapshotCounter % Math.ceil(SNAPSHOT_INTERVAL_MS / ANALYSIS_INTERVAL_MS) === 0) {
      for (const ex of ['binance', 'bybit', 'okx']) {
        const book = state.books[ex];
        if (book.ready) {
          insertOrderBookSnapshot(symbol, ex, book.summarize());
        }
      }
    }
  }
}

function checkAlert(state) {
  const score = state.whaleScore;
  const now = Date.now();

  let level = null;
  for (const [name, cfg] of Object.entries(ALERT_LEVEL)) {
    if (score >= cfg.min && (cfg.max === undefined || score <= cfg.max)) {
      level = name;
      break;
    }
  }
  if (!level || level === 'NORMAL' || level === 'LOW') return;

  const cooldownMs = ALERT_COOLDOWN_MIN * 60 * 1000;
  if (now - state.lastAlertTime < cooldownMs) return;

  const breakdown = state.scoreBreakdown;
  const bnb = state.books.binance.summarize();
  const wallsSummary = state.wallDetector.summarize();
  const priceStr = state.price ? '$' + Math.round(state.price * 100) / 100 : 'N/A';

  const message = state.symbol + '\n' +
    'Score: ' + score + '/100 | Imbalance: ' + bnb.imbalance + 'x | Walls: ' + wallsSummary.wallCount + '\n' +
    'Cross-Ex: ' + state.crossExDiscrepancy + ' | Spoofs: ' + breakdown.spoofs + '\n' +
    'Price: ' + priceStr + ' | Spread: ' + bnb.spread + '%\n' +
    'OFI 5m: ' + breakdown.flow + ' | Source: ' + (state.priceSource || 'N/A');

  if (ALERT_LEVEL[level].telegram) {
    sendTelegram(message, level);
  }

  const alert = state.addAlert(level, message);
  globalAlerts.unshift(alert);
  if (globalAlerts.length > 50) globalAlerts.pop();

  if (score >= 70) {
    let direction = 'NEUTRAL';
    if (bnb.imbalance > 1.2) direction = 'LONG';
    else if (bnb.imbalance < 0.8) direction = 'SHORT';

    const whaleId = insertWhaleEvent(
      state.symbol, score, JSON.stringify(state.scoreBreakdown),
      state.price, bnb.imbalance, wallsSummary.wallCount,
      breakdown.spoofs, state.crossExDiscrepancy, direction
    );

    const fwdEvent = state.trackWhaleEvent();
    if (fwdEvent) {
      insertForwardTest(whaleId, state.symbol, state.price, score, direction);
    }
  }
}

// ===== Forward-test Evaluation =====
function evaluateFwd() {
  for (const [symbol, state] of states) {
    state.evaluateFwd();
  }
}

// ===== Cleanup =====
function runCleanup() {
  cleanup();
  const now = new Date();
  if (now.getHours() === 3) maybeVacuum();
}

// ===== HTTP Server =====
function buildStateResponse() {
  const pairsSummary = [];
  for (const [symbol, state] of states) {
    pairsSummary.push(state.summary());
  }
  pairsSummary.sort((a, b) => b.whaleScore - a.whaleScore);

  return {
    gold: null,
    sources: wsManager.getStatus(),
    pairs: pairsSummary,
    alerts: globalAlerts,
    uptime: Math.round(process.uptime()),
    pairCount: PAIRS.length,
    timestamp: Date.now(),
  };
}

// Read dashboard HTML
let DASHBOARD_HTML = '';
try {
  DASHBOARD_HTML = fs.readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');
} catch(e) {
  DASHBOARD_HTML = '<html><body><h1>Super Monitor</h1><p>Dashboard file missing</p></body></html>';
}

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost:' + PORT);
  const path = url.pathname;

  try {
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { ...cors, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(DASHBOARD_HTML);
      return;
    }

    if (path === '/api/state') {
      res.writeHead(200, cors);
      res.end(JSON.stringify(buildStateResponse()));
      return;
    }

    if (path.startsWith('/api/pair/')) {
      const symbol = path.split('/api/pair/')[1].toUpperCase();
      const state = states.get(symbol);
      if (!state) {
        res.writeHead(404, cors);
        res.end(JSON.stringify({ error: 'Pair not found' }));
        return;
      }

      if (path.includes('/depth')) {
        res.writeHead(200, cors);
        res.end(JSON.stringify(state.depthDetail()));
      } else if (path.includes('/history')) {
        const hours = parseInt(url.searchParams.get('hours') || '24', 10);
        res.writeHead(200, cors);
        res.end(JSON.stringify(getWhaleHistory(symbol, hours)));
      } else {
        res.writeHead(200, cors);
        res.end(JSON.stringify(state.summary()));
      }
      return;
    }

    if (path === '/api/fwd') {
      const dbStats = getFwdStats();
      const recent = [];
      for (const [symbol, state] of states) {
        for (const ev of state.fwdEvents) {
          if (ev.complete) recent.push(ev);
        }
      }
      recent.sort((a, b) => b.ts - a.ts);
      res.writeHead(200, cors);
      res.end(JSON.stringify({ stats: dbStats, recent: recent.slice(0, 20) }));
      return;
    }

    if (path === '/api/alerts') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      res.writeHead(200, cors);
      res.end(JSON.stringify(globalAlerts.slice(0, limit)));
      return;
    }

    if (path === '/api/heatmap') {
      const data = [];
      for (const [symbol, state] of states) {
        data.push({
          symbol, score: state.whaleScore, price: state.price,
          walls: state.wallDetector.walls.length,
          spoofs: state.spoofDetector.recentCount(),
          lowLiquidity: state.lowLiquidity,
        });
      }
      res.writeHead(200, cors);
      res.end(JSON.stringify(data));
      return;
    }

    if (path === '/api/stats') {
      const db = getDb();
      const cutoff = Date.now() - 86400000;
      const totalWhales = db.prepare('SELECT COUNT(*) as c FROM whale_events WHERE timestamp > ?').get(cutoff).c;
      const avgScore = db.prepare('SELECT AVG(score) as a FROM whale_events WHERE timestamp > ?').get(cutoff).a || 0;
      const totalSpoofs = db.prepare('SELECT COUNT(*) as c FROM spoof_events WHERE timestamp > ?').get(cutoff).c;

      res.writeHead(200, cors);
      res.end(JSON.stringify({
        totalWhales24h: totalWhales,
        avgScore24h: Math.round(avgScore * 10) / 10,
        totalSpoofs24h: totalSpoofs,
        wsStatus: wsManager.getStatus(),
        pairCount: PAIRS.length,
        uptime: Math.round(process.uptime()),
      }));
      return;
    }

    if (path === '/api/export/csv') {
      const type = url.searchParams.get('type') || 'whales';
      const db = getDb();
      if (type === 'whales') {
        const rows = db.prepare('SELECT * FROM whale_events ORDER BY timestamp DESC LIMIT 1000').all();
        const csv = ['symbol,score,price,imbalance,wall_count,spoof_count,direction,timestamp'];
        for (const r of rows) {
          csv.push([r.symbol, r.score, r.price, r.imbalance, r.wall_count, r.spoof_count, r.direction, r.timestamp].join(','));
        }
        res.writeHead(200, { 'Content-Type': 'text/csv', ...cors });
        res.end(csv.join('\n'));
      }
      return;
    }

    res.writeHead(404, cors);
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (e) {
    console.error('[http]', e);
    res.writeHead(500, cors);
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('  SUPER MONITOR BANDARMOTOLOGI');
  console.log('  Port: ' + PORT + ' | Pairs: ' + PAIRS.length);
  console.log('  Exchanges: Binance + Bybit + OKX');
  console.log('  Engines: Wall | Spoof | Flow | Cross-Ex | WhaleScorer');
  console.log('=================================');
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
    console.log('  Telegram: ENABLED');
  } else {
    console.log('  Telegram: DISABLED');
  }
  console.log('');

  startScheduler();
  setInterval(runAnalysis, ANALYSIS_INTERVAL_MS);
  setInterval(evaluateFwd, FT_EVAL_INTERVAL_MS);
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  runCleanup();

  console.log('[server] All engines started!');
});

process.on('SIGTERM', () => {
  console.log('[server] Shutting down...');
  wsManager.stop();
  server.close();
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[server] Shutting down...');
  wsManager.stop();
  server.close();
  process.exit(0);
});
