const express = require('express');
const db = require('../db');
const { runDraw } = require('../services/draw');
const { remainingTickets } = require('../services/tickets');

const router = express.Router();

// very light shared-password gate - fine for a single-event internal tool;
// swap for real auth if this app will be reused beyond one event.
router.use((req, res, next) => {
  const provided = req.headers['x-admin-password'];
  if (provided !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

router.get('/stats', (req, res) => {
  const paid = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(amount_minor),0) total FROM orders WHERE status='paid'`).get();
  const pending = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status='pending'`).get();
  const expired = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status='expired'`).get();
  const ticketsSold = db.prepare(`SELECT COALESCE(SUM(quantity),0) q FROM orders WHERE status='paid'`).get();
  const bySeller = db.prepare(`
    SELECT s.name AS seller, COUNT(o.id) AS orders, COALESCE(SUM(o.quantity),0) AS tickets, COALESCE(SUM(o.amount_minor),0) AS revenue
    FROM sellers s LEFT JOIN orders o ON o.seller_id = s.id AND o.status = 'paid'
    GROUP BY s.id ORDER BY revenue DESC
  `).all();

  res.json({
    paidOrders: paid.c,
    pendingOrders: pending.c,
    expiredOrders: expired.c,
    ticketsSold: ticketsSold.q,
    ticketsRemaining: remainingTickets(),
    revenueMinor: paid.total,
    bySeller,
  });
});

router.get('/prizes', (req, res) => {
  res.json(db.prepare('SELECT * FROM prizes ORDER BY rank ASC').all());
});

router.post('/prizes', (req, res) => {
  const { name, rank } = req.body;
  if (!name || !rank) return res.status(400).json({ error: 'name and rank are required' });
  db.prepare('INSERT INTO prizes (rank, name) VALUES (?, ?)').run(rank, name);
  res.json(db.prepare('SELECT * FROM prizes ORDER BY rank ASC').all());
});

router.delete('/prizes/:id', (req, res) => {
  db.prepare('DELETE FROM prizes WHERE id = ?').run(req.params.id);
  res.json(db.prepare('SELECT * FROM prizes ORDER BY rank ASC').all());
});

router.get('/winners', (req, res) => {
  const winners = db.prepare(`
    SELECT w.*, p.name AS prize_name, p.rank AS prize_rank
    FROM winners w JOIN prizes p ON p.id = w.prize_id
    ORDER BY p.rank ASC
  `).all();
  res.json(winners);
});

router.post('/draw', async (req, res) => {
  try {
    const winners = await runDraw();
    res.json({ winners });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
