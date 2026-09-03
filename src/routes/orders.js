const express = require('express');
const { nanoid } = require('nanoid');
const QRCode = require('qrcode');
const db = require('../db');
const { reserveTickets, remainingTickets } = require('../services/tickets');
const { createCheckoutSession } = require('../services/stripe');

const router = express.Router();

const TICKET_PRICE_MINOR = parseInt(process.env.TICKET_PRICE_MINOR || '200', 10);
const ORDER_TTL_SECONDS = parseInt(process.env.ORDER_TTL_SECONDS || '300', 10);

// POST /api/orders  { sellerId, sellerName, quantity }
router.post('/', async (req, res) => {
  try {
    const { sellerId, sellerName, quantity } = req.body;
    const qty = parseInt(quantity, 10);

    if (!sellerId || !sellerName) return res.status(400).json({ error: 'sellerId and sellerName are required' });
    if (!qty || qty < 1 || qty > 500) return res.status(400).json({ error: 'quantity must be between 1 and 500' });

    db.prepare(
      `INSERT INTO sellers (id, name) VALUES (?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).run(sellerId, sellerName);

    const { ticketStart, ticketEnd } = reserveTickets(qty);
    const amountMinor = qty * TICKET_PRICE_MINOR;
    const orderId = nanoid(12);
    const expiresAt = new Date(Date.now() + ORDER_TTL_SECONDS * 1000).toISOString();

    const session = await createCheckoutSession({
      orderId,
      quantity: qty,
      amountMinor,
      ticketStart,
      ticketEnd,
    });

    db.prepare(
      `INSERT INTO orders
       (id, seller_id, quantity, ticket_start, ticket_end, amount_minor, currency,
        status, stripe_session_id, stripe_session_url, expires_at)
       VALUES (@id, @seller_id, @quantity, @ticket_start, @ticket_end, @amount_minor, @currency,
               'pending', @stripe_session_id, @stripe_session_url, @expires_at)`
    ).run({
      id: orderId,
      seller_id: sellerId,
      quantity: qty,
      ticket_start: ticketStart,
      ticket_end: ticketEnd,
      amount_minor: amountMinor,
      currency: process.env.CURRENCY || 'gbp',
      stripe_session_id: session.id,
      stripe_session_url: session.url,
      expires_at: expiresAt,
    });

    const qrDataUrl = await QRCode.toDataURL(session.url, { margin: 1, width: 320 });

    res.json({
      orderId,
      ticketStart,
      ticketEnd,
      quantity: qty,
      amountMinor,
      checkoutUrl: session.url,
      qrDataUrl,
      expiresAt,
      ttlSeconds: ORDER_TTL_SECONDS,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/orders/:id  -- seller's phone polls this to see live status
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'not found' });
  res.json(order);
});

// GET /api/tickets/remaining
router.get('/meta/remaining', (req, res) => {
  res.json({ remaining: remainingTickets() });
});

module.exports = router;
