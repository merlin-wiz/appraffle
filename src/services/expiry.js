const db = require('../db');
const { expireSession } = require('./stripe');

const SWEEP_INTERVAL_MS = 15 * 1000; // check every 15 seconds

async function sweepExpiredOrders() {
  const stale = db
    .prepare(
      `SELECT id, stripe_session_id FROM orders
       WHERE status = 'pending' AND expires_at <= datetime('now')`
    )
    .all();

  if (stale.length === 0) return;

  const markExpired = db.prepare(`UPDATE orders SET status = 'expired' WHERE id = ?`);

  for (const order of stale) {
    markExpired.run(order.id);
    if (order.stripe_session_id) {
      // Best-effort: close the Stripe session early so a buyer who is slow
      // to open the link (but within Stripe's own 30-min window) still
      // sees "expired" per the 5-minute rule, not a live payment page.
      await expireSession(order.stripe_session_id);
    }
  }
  console.log(`Expired ${stale.length} stale order(s).`);
}

function startExpirySweeper() {
  setInterval(() => {
    sweepExpiredOrders().catch((err) => console.error('Expiry sweep failed:', err));
  }, SWEEP_INTERVAL_MS);
  console.log(`Expiry sweeper running every ${SWEEP_INTERVAL_MS / 1000}s.`);
}

module.exports = { startExpirySweeper, sweepExpiredOrders };
