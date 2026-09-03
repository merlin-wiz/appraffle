const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'raffle.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sellers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- single-row counter that hands out ticket numbers atomically
  CREATE TABLE IF NOT EXISTS ticket_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    next_ticket INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    ticket_start INTEGER NOT NULL,
    ticket_end INTEGER NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | expired
    stripe_session_id TEXT,
    stripe_session_url TEXT,
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    paid_at TEXT,
    FOREIGN KEY (seller_id) REFERENCES sellers(id)
  );

  CREATE TABLE IF NOT EXISTS prizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rank INTEGER NOT NULL,      -- 1 = first prize, 2 = second prize, ...
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prize_id INTEGER NOT NULL,
    ticket_number INTEGER NOT NULL,
    order_id TEXT NOT NULL,
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    drawn_at TEXT NOT NULL DEFAULT (datetime('now')),
    notified_at TEXT,
    FOREIGN KEY (prize_id) REFERENCES prizes(id),
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_expires ON orders(expires_at);
`);

// seed the ticket counter once
const row = db.prepare('SELECT next_ticket FROM ticket_counter WHERE id = 1').get();
if (!row) {
  db.prepare('INSERT INTO ticket_counter (id, next_ticket) VALUES (1, 1)').run();
}

module.exports = db;
