require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db');
const ordersRouter = require('./routes/orders');
const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');
const { startExpirySweeper } = require('./services/expiry');

const app = express();

// --- Stripe webhook MUST receive the raw body for signature verification,
// so this is mounted before express.json() and given its own raw parser.
app.use('/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// everything else parses JSON normally
app.use(express.json());

app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

// simple order-status pages Stripe redirects to after checkout
app.get('/order/:id/success', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const tickets = order ? `#${order.ticket_start}${order.ticket_end !== order.ticket_start ? `-${order.ticket_end}` : ''}` : '';
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment received</title>
    <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#0f172a;color:#f1f5f9}
    h1{color:#4ade80}.tix{font-size:1.4em;margin-top:12px}</style></head>
    <body><h1>&#10003; Payment received</h1><p>Thank you for supporting the raffle.</p>
    <p class="tix">Your ticket${order && order.quantity > 1 ? 's' : ''}: <strong>${tickets}</strong></p>
    <p>Good luck!</p></body></html>`);
});

app.get('/order/:id/cancelled', (req, res) => {
  res.send(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Payment cancelled</title>
    <style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 20px;background:#0f172a;color:#f1f5f9}
    h1{color:#f87171}</style></head>
    <body><h1>Payment cancelled</h1><p>No charge was made. Please ask the seller to start a new sale.</p></body></html>`);
});

// static front ends
app.use('/seller', express.static(path.join(__dirname, '..', 'public', 'seller')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));
app.get('/', (req, res) => res.redirect('/seller'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Raffle app listening on port ${PORT}`);
  startExpirySweeper();
});
