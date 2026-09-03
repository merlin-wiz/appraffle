const express = require('express');
const db = require('../db');
const { stripe, extractBuyerDetails } = require('../services/stripe');

const router = express.Router();

// NOTE: this route is mounted with express.raw() body parsing in server.js
// (Stripe signature verification requires the raw, unparsed request body).
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.client_reference_id || session.metadata?.orderId;
    if (!orderId) {
      console.error('checkout.session.completed with no orderId on it', session.id);
      return res.json({ received: true });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) {
      console.error('checkout.session.completed for unknown order', orderId);
      return res.json({ received: true });
    }
    if (order.status === 'paid') {
      // duplicate webhook delivery - Stripe retries are expected, just ack
      return res.json({ received: true });
    }
    if (order.status === 'expired') {
      // Buyer somehow paid after our 5-minute cutoff (edge case: they had
      // the page open and Stripe still processed it before we force-expired
      // it). Honour the payment - it's real money - but flag it clearly.
      console.warn(`Order ${orderId} was marked expired but payment succeeded anyway; honouring it.`);
    }

    const { name, email, phone } = extractBuyerDetails(session);

    db.prepare(
      `UPDATE orders
       SET status = 'paid', buyer_name = ?, buyer_email = ?, buyer_phone = ?, paid_at = datetime('now')
       WHERE id = ?`
    ).run(name, email, phone, orderId);

    console.log(`Order ${orderId} paid: tickets #${order.ticket_start}-${order.ticket_end} -> ${email}`);
  }

  res.json({ received: true });
});

module.exports = router;
