const db = require('../db');

const TOTAL_TICKETS = parseInt(process.env.TOTAL_TICKETS || '2000', 10);

/**
 * Atomically reserve `quantity` sequential ticket numbers.
 * Returns { ticketStart, ticketEnd } or throws if not enough tickets remain.
 * better-sqlite3 is synchronous, so this transaction is safe from races
 * even with many sellers hitting it concurrently.
 */
function reserveTickets(quantity) {
  const reserve = db.transaction((qty) => {
    const row = db.prepare('SELECT next_ticket FROM ticket_counter WHERE id = 1').get();
    const ticketStart = row.next_ticket;
    const ticketEnd = ticketStart + qty - 1;

    if (ticketEnd > TOTAL_TICKETS) {
      throw new Error(
        `Only ${TOTAL_TICKETS - ticketStart + 1} ticket(s) remain, cannot reserve ${qty}.`
      );
    }

    db.prepare('UPDATE ticket_counter SET next_ticket = ? WHERE id = 1').run(ticketEnd + 1);
    return { ticketStart, ticketEnd };
  });

  return reserve(quantity);
}

/**
 * Return a range of ticket numbers to the pool. Only safe to call for the
 * *most recently reserved, still-unsold* block — since ticket numbers are
 * handed out sequentially, releasing anything other than the tail would
 * create a gap. In practice this is fine here because expiry only ever
 * releases the specific order that just timed out; gaps are cosmetically
 * fine (a ticket number simply never gets reissued) rather than harmful,
 * so we do NOT try to rewind the counter. This keeps allocation logic
 * simple and avoids any risk of double-issuing a number.
 */
function releaseTickets() {
  // Intentionally a no-op: see comment above. Expired orders are simply
  // marked 'expired' and their ticket numbers are excluded from the draw.
  // If you want expired ticket numbers to be resellable, see README.md
  // ("Re-using expired ticket numbers") for the trade-offs.
}

function remainingTickets() {
  const row = db.prepare('SELECT next_ticket FROM ticket_counter WHERE id = 1').get();
  return Math.max(0, TOTAL_TICKETS - (row.next_ticket - 1));
}

module.exports = { reserveTickets, releaseTickets, remainingTickets, TOTAL_TICKETS };
