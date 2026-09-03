const crypto = require('crypto');
const db = require('../db');
const { sendWinnerEmail } = require('./email');

/**
 * Cryptographically-seeded shuffle (Fisher-Yates using crypto.randomInt,
 * which is unbiased, unlike Math.random()).
 */
function secureShuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Run the draw: one winning ticket per prize, highest rank (1st prize)
 * drawn first, no ticket can win twice. Persists winners and emails them.
 * Returns the list of winners.
 */
async function runDraw() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM winners').get();
  if (existing.c > 0) {
    throw new Error('Draw has already been run. Clear the winners table to re-run (see README).');
  }

  const paidOrders = db
    .prepare(`SELECT * FROM orders WHERE status = 'paid' ORDER BY ticket_start`)
    .all();

  // expand orders into individual ticket numbers, each mapped back to its order
  const tickets = [];
  for (const order of paidOrders) {
    for (let n = order.ticket_start; n <= order.ticket_end; n++) {
      tickets.push({ ticketNumber: n, order });
    }
  }

  const prizes = db.prepare('SELECT * FROM prizes ORDER BY rank ASC').all();
  if (prizes.length === 0) throw new Error('No prizes configured. Add prizes before drawing.');
  if (tickets.length < prizes.length) {
    throw new Error(`Not enough paid tickets (${tickets.length}) for ${prizes.length} prize(s).`);
  }

  const shuffled = secureShuffle(tickets);
  const winners = [];

  const insertWinner = db.prepare(`
    INSERT INTO winners (prize_id, ticket_number, order_id, buyer_name, buyer_email, buyer_phone)
    VALUES (@prize_id, @ticket_number, @order_id, @buyer_name, @buyer_email, @buyer_phone)
  `);

  for (let i = 0; i < prizes.length; i++) {
    const draw = shuffled[i];
    const record = {
      prize_id: prizes[i].id,
      ticket_number: draw.ticketNumber,
      order_id: draw.order.id,
      buyer_name: draw.order.buyer_name,
      buyer_email: draw.order.buyer_email,
      buyer_phone: draw.order.buyer_phone,
    };
    insertWinner.run(record);
    winners.push({ ...record, prizeName: prizes[i].name, prizeRank: prizes[i].rank });
  }

  // notify winners (best-effort; failures are logged, not fatal)
  const markNotified = db.prepare(
    `UPDATE winners SET notified_at = datetime('now') WHERE order_id = ? AND ticket_number = ?`
  );
  for (const w of winners) {
    try {
      const result = await sendWinnerEmail({
        to: w.buyer_email,
        name: w.buyer_name,
        prizeName: w.prizeName,
        ticketNumber: w.ticket_number,
      });
      if (!result.skipped) markNotified.run(w.order_id, w.ticket_number);
    } catch (err) {
      console.error(`Failed to email winner of prize "${w.prizeName}":`, err.message);
    }
  }

  return winners;
}

module.exports = { runDraw };
