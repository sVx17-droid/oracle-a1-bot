// Global constants for Super Monitor
export const PORT = parseInt(process.env.PORT || '3099', 10);
export const MAX_PAIRS = parseInt(process.env.MAX_PAIRS || '150', 10);
export const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30', 10);
export const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || '';
export const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

export const WS = {
  BINANCE: 'wss://stream.binance.com:9443/stream',
  BINANCE_REST_BASE: 'https://api.binance.com/api/v3',
  BYBIT: 'wss://stream.bybit.com/v5/public/linear',
  OKX: 'wss://ws.okx.com:8443/ws/v5/public',
};

export const BINANCE_STREAMS_PER_CONN = 100;
export const BYBIT_TOPICS_PER_SUB = 50;
export const BYBIT_CONNS = 3;
export const OKX_CHANNEL_LIMIT = 480;

export const RECONNECT = {
  initialDelayMs: 500, maxDelayMs: 30_000, jitterMs: 500, backoffMultiplier: 1.5,
};

export const DEPTH_LEVELS = 20;
export const BINANCE_SNAPSHOT_LIMIT = 1000;

export const ANALYSIS_INTERVAL_MS = 2000;
export const SNAPSHOT_INTERVAL_MS = 5000;
export const HEALTH_CHECK_INTERVAL_MS = 30000;
export const CLEANUP_INTERVAL_MS = 3600000;
export const PAIR_REFRESH_INTERVAL_MS = 21600000;

export const WALL_THRESHOLD = 5;
export const SPOOF_WINDOW_SEC = 10;
export const WALL_HISTORY_MAX_AGE_MS = 120000;
export const ALERT_COOLDOWN_MIN = 15;

export const TG_RATE_LIMIT = 30;
export const TG_MIN_GAP_MS = 20000;
export const TG_QUEUE_MAX = 10;
export const TG_QUEUE_FLUSH_MS = 25000;

export const FT_COOLDOWN_MS = 900000;
export const FT_CHECKPOINTS = [15, 30, 60, 120, 240];
export const FT_EVAL_INTERVAL_MS = 60000;
export const FT_MAX_EVENTS = 500;

export const DB_PATH = process.env.DB_PATH || './data/bandarmotologi.db';

export const SCORE_WEIGHTS = {
  walls: 25, imbalance: 20, spoofActivity: 15, crossExDiscrepancy: 15,
  flowPressure: 10, depthDecay: 5, spreadAnomaly: 5, nearPriceWall: 5,
};

export const ALERT_LEVEL = {
  EXTREME: { min: 80, emoji: '\u{1F534}', label: 'EXTREME', telegram: true },
  HIGH:    { min: 70, max: 79, emoji: '\u{1F7E0}', label: 'HIGH', telegram: true },
  MEDIUM:  { min: 50, max: 69, emoji: '\u{1F7E1}', label: 'MEDIUM', telegram: false },
  LOW:     { min: 30, max: 49, emoji: '\u{1F7E2}', label: 'LOW', telegram: false },
  NORMAL:  { min: 0,  max: 29, emoji: '\\u26AA', label: 'NORMAL', telegram: false },
};
