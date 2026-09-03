const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const CURRENCY = process.env.CURRENCY || 'gbp';

/**
 * Create a Checkout Session that collects payment AND the buyer's name,
 * email and mobile number on a single hosted page.
 *
 * Notes:
 * - Stripe enforces a 30-minute MINIMUM on expires_at, so we can't ask
 *   Stripe itself to expire the link at 5 minutes. Instead we set Stripe's
 *   expiry to the minimum (30 min) as a safety net, and our own backend
 *   enforces the real 5-minute rule (see services/expiry.js), calling
 *   Stripe's manual "expire" endpoint the moment our own TTL is up so the
 *   buyer sees "This QR code has expired" well before Stripe's own timer
 *   would have closed it anyway.
 */
async function createCheckoutSession({ orderId, quantity, amountMinor, ticketStart, ticketEnd }) {
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          unit_amount: amountMinor / quantity,
          product_data: {
            name: `Raffle ticket${quantity > 1 ? 's' : ''} #${ticketStart}${
              ticketEnd !== ticketStart ? `-${ticketEnd}` : ''
            }`,
          },
        },
        quantity,
      },
    ],
    phone_number_collection: { enabled: true },
    custom_fields: [
      {
        key: 'full_name',
        label: { type: 'custom', custom: 'Full name' },
        type: 'text',
        text: { minimum_length: 2, maximum_length: 100 },
      },
    ],
    client_reference_id: orderId,
    metadata: { orderId, ticketStart: String(ticketStart), ticketEnd: String(ticketEnd) },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // Stripe's own 30-min floor
    success_url: `${process.env.BASE_URL}/order/${orderId}/success`,
    cancel_url: `${process.env.BASE_URL}/order/${orderId}/cancelled`,
  });

  return session;
}

async function expireSession(sessionId) {
  try {
    await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    // Already completed, already expired, or never fully opened — fine to ignore.
    if (!/already expired|No such checkout|cannot be expired/i.test(err.message || '')) {
      console.error('Failed to force-expire Stripe session', sessionId, err.message);
    }
  }
}

function extractBuyerDetails(session) {
  const name = session.custom_fields?.find((f) => f.key === 'full_name')?.text?.value || null;
  const email = session.customer_details?.email || null;
  const phone = session.customer_details?.phone || null;
  return { name, email, phone };
}

module.exports = { stripe, createCheckoutSession, expireSession, extractBuyerDetails };
