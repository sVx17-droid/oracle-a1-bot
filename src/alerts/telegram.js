import https from 'https';
import { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, TG_RATE_LIMIT, TG_MIN_GAP_MS, TG_QUEUE_MAX, TG_QUEUE_FLUSH_MS, ALERT_LEVEL } from '../config/constants.js';

let tgHourCount = 0;
let tgLastSent = 0;
let tgHourReset = Date.now();
const tgQueue = [];

export function sendTelegram(message, level = 'HIGH') {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return false;

  // Reset hourly counter
  if (Date.now() - tgHourReset > 3600000) {
    tgHourCount = 0;
    tgHourReset = Date.now();
  }

  // Format based on alert level
  const lvl = Object.values(ALERT_LEVEL).find(l => l.label === level) || ALERT_LEVEL.HIGH;
  const text = lvl.emoji + ' *' + lvl.label + '*\n' + message;

  const doSend = () => {
    const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage?' +
      'chat_id=' + TELEGRAM_CHAT_ID + '&text=' + encodeURIComponent(text) +
      '&parse_mode=Markdown&disable_web_page_preview=true';

    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const r = JSON.parse(body);
          if (!r.ok) console.error('[tg] Send failed:', r.description);
        } catch (e) { /* ignore */ }
      });
    }).on('error', (e) => {
      console.error('[tg] Request error:', e.message);
    });
  };

  // Priority: EXTREME always sends immediately
  if (level === 'EXTREME') {
    doSend();
    tgHourCount++;
    tgLastSent = Date.now();
    return true;
  }

  // Rate limiting
  const now = Date.now();
  const gapOk = now - tgLastSent >= TG_MIN_GAP_MS;

  if (tgHourCount < TG_RATE_LIMIT && gapOk) {
    doSend();
    tgHourCount++;
    tgLastSent = now;
    return true;
  }

  // Queue
  if (tgQueue.length < TG_QUEUE_MAX) {
    tgQueue.push(text);
    return false;
  }

  return false;
}

// Queue flusher
setInterval(() => {
  if (tgQueue.length > 0 && tgHourCount < TG_RATE_LIMIT) {
    const text = tgQueue.shift();
    if (text) {
      const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage?' +
        'chat_id=' + TELEGRAM_CHAT_ID + '&text=' + encodeURIComponent(text) +
        '&parse_mode=Markdown&disable_web_page_preview=true';
      https.get(url, () => {}).on('error', () => {});
      tgHourCount++;
      tgLastSent = Date.now();
    }
  }
}, TG_QUEUE_FLUSH_MS);
