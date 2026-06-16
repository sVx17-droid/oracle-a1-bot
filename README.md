# Super Monitor Bandarmotologi

Sistem monitoring whale/crypto 24/7 multi-exchange untuk mendeteksi manipulasi order book (bandarmotologi) secara real-time.

## Arsitektur

Binance/Bybit/OKX WebSocket -> WebSocketManager -> OrderBookBuffer -> Engine Pipeline:
1. WallDetector — deteksi wall (qty > median * multiplier)
2. SpoofDetector — tracking wall hilang < 10 detik
3. FlowAnalyzer — Order Flow Imbalance 1m/5m/15m
4. CrossValidator — bandingkan 3 exchange
5. WhaleScorer — composite score 0-100

Output: SQLite DB + HTTP API:3099 + Telegram Alert

## Cara Install & Run

```bash
cp .env.example .env
npm install
npm run dev      # development
npm start        # production
npm run setup    # generate pair list dari Binance
```

## Deploy VPS

```bash
chmod +x deploy/setup-vps.sh
./deploy/setup-vps.sh
pm2 start ecosystem.config.js
pm2 save
```

## API Endpoints (port 3099)

| GET /api/state          | Ringkasan semua pair      |
| GET /api/pair/BTCUSDT   | Detail satu pair          |
| GET /api/stats          | Statistik global          |
| GET /api/alerts         | Alert feed                |
| GET /api/heatmap        | Whale heatmap             |
| GET /api/fwd            | Forward-test stats        |
| GET /api/export/csv     | Export data CSV           |

## Alert Levels

| Score    | Level    | Action               |
|----------|----------|----------------------|
| >= 80   | EXTREME  | Telegram + Dashboard |
| 70-79   | HIGH     | Telegram + Dashboard |
| 50-69   | MEDIUM   | Dashboard only       |
| 30-49   | LOW      | Dashboard only       |
| < 30    | NORMAL   | No alert             |
