# Community Raffle App

A webapp for running an in-person raffle: sellers use a phone-based PWA to
start a sale, the buyer scans one QR code that combines payment (Stripe
Checkout) and contact-detail capture on a single page, and admins run a
random prize draw that emails winners automatically.

No Apple Developer account, App Store submission, or native app is needed —
everything here is a normal website, installable to the home screen on
iPhone and Android alike.

## How it works

1. Seller opens `/seller` on their phone, enters a quantity, taps **Sell**.
2. The backend reserves that many sequential ticket numbers and creates a
   Stripe Checkout Session with the price, plus a required "Full name"
   field and native phone-number collection. The seller's screen shows this
   as a QR code with a live **5-minute countdown**.
3. The buyer scans it with their own phone's camera and lands on Stripe's
   hosted checkout page, enters name, phone and pays (email is collected by
   Stripe automatically as part of checkout).
4. Stripe calls our webhook the instant payment succeeds; the backend marks
   the order paid and stores the buyer's ticket numbers and contact details.
5. The seller's screen updates to "Payment received" automatically (it's
   polling in the background) — no seller action needed.
6. If the buyer doesn't finish within 5 minutes, the order is marked
   expired and the seller sees "QR code expired, start a new sale."
7. After sales close, an organiser opens `/admin`, enters the prize list,
   and clicks **Run the draw**. It draws one winning ticket per prize
   (no repeats), stores the results, and emails every winner automatically.

## Why 5 minutes when Stripe's own minimum is 30

Stripe Checkout Sessions can't be configured to expire in under 30 minutes
— that's a hard floor Stripe enforces. To honour your actual 5-minute rule,
this app tracks its own `expires_at` per order and runs a sweeper every 15
seconds that (a) marks any order past 5 minutes as `expired` in our own
database, immediately freeing the seller to start a new sale, and (b) calls
Stripe's manual "expire session" endpoint so the buyer's page also shows
"expired" rather than staying live for the full 30 minutes. See
`src/services/expiry.js`.

One edge case worth knowing: if a buyer has the checkout page open and
completes payment in the few seconds between our 5-minute cutoff and
Stripe's force-expire call actually landing, the webhook will still honour
that payment (it's real money) — the order flips to `paid`, with a warning
logged. This is intentional; the alternative (refusing a real payment) is
worse.

## Setup

```bash
npm install
cp .env.example .env
# edit .env with your real Stripe keys, SMTP details, admin password, etc.
```

### Required environment variables (see `.env.example` for all of them)

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from your Stripe dashboard.
- `BASE_URL` — your real HTTPS domain once deployed (buyers' phones must be
  able to reach it — `localhost` will not work for anyone but you).
- `TICKET_PRICE_MINOR` — price per ticket in pence/cents.
- `TOTAL_TICKETS` — size of the ticket pool (set comfortably above what
  you expect to sell).
- `ADMIN_PASSWORD` — protects `/admin` and the draw trigger.
- SMTP settings for winner emails.

### Stripe webhook setup

Stripe needs to call your server the moment a payment completes.

1. **While testing locally**, install the [Stripe CLI](https://docs.stripe.com/stripe-cli)
   and run:
   ```bash
   stripe listen --forward-to localhost:3000/webhook
   ```
   This prints a `whsec_...` value — put that in `.env` as
   `STRIPE_WEBHOOK_SECRET` while testing.
2. **Once deployed** to a real HTTPS domain, go to
   Stripe Dashboard → Developers → Webhooks → **Add endpoint**, set the URL
   to `https://your-domain/webhook`, select the `checkout.session.completed`
   event, and copy the signing secret it gives you into your production
   `.env`.

### Run it

```bash
npm start
```

- Seller app: `http://localhost:3000/seller`
- Admin dashboard: `http://localhost:3000/admin`

### Before the event

- Switch `STRIPE_SECRET_KEY` from `sk_test_...` to `sk_live_...` and re-do
  the webhook registration step against the live endpoint.
- Deploy somewhere with a real HTTPS domain (Render, Fly.io, a small VPS,
  etc. all work fine for this traffic level — it's a lightweight Node app
  with a file-based SQLite database, no separate database server needed).
- Do a full test sale end-to-end with a real card in live mode for a small
  amount before the doors open.
- Add real PWA icons in `public/icons/` (placeholders are provided —
  replace `icon-192.png` / `icon-512.png` with your own artwork).
- Have each seller open `/seller` on their iPhone once beforehand and use
  Safari's "Add to Home Screen" so it behaves like an app on the day.

### Re-running the draw (testing only)

The draw can only be run once by design — that's a safeguard, not a bug.
To reset it while testing:

```bash
node -e "require('./src/db').prepare('DELETE FROM winners').run()"
```

### Re-using expired ticket numbers

By design, this app does **not** recycle ticket numbers from expired
orders back into the pool — ticket numbers are handed out sequentially and
never reused, which makes the ledger simple to reason about and impossible
to double-issue. The practical effect is that a handful of ticket numbers
may simply never be sold if buyers abandon checkouts. If you'd rather
reclaim those numbers, that requires a small change to
`src/services/tickets.js` and a decision about how to handle a ticket
number that was already shown to a different buyer on a stale screen —
happy to add this if you want it, but the sequential/no-reuse approach is
the safer default for a live event.

## Project structure

```
src/
  server.js          - Express app, route wiring
  db.js               - SQLite schema
  routes/
    orders.js         - seller creates/polls orders
    webhook.js         - Stripe payment confirmation
    admin.js           - stats, prizes, draw, winners
  services/
    tickets.js         - atomic ticket number reservation
    stripe.js           - Checkout Session creation
    expiry.js           - 5-minute reservation sweeper
    draw.js              - cryptographically random prize draw
    email.js             - winner notification emails
public/
  seller/             - seller-facing PWA
  admin/               - organiser dashboard
```

## What's been tested vs. what you should test yourself

Tested in this build: ticket reservation (including concurrent-style
allocation), the 5-minute expiry sweeper, the admin stats/prizes API, and
the draw logic (verified it draws distinct tickets per prize, blocks a
second run, and survives an individual email failure without crashing).

**Not testable in this environment and worth doing yourself before the
event:** the live Stripe Checkout flow end-to-end (needs real Stripe keys
and network access to `api.stripe.com`), the webhook signature
verification against a real Stripe event, and actual email delivery
through your SMTP provider. Run a handful of real test-mode sales and one
real live-mode sale for a small amount before relying on this at the
event.
# appraffle
