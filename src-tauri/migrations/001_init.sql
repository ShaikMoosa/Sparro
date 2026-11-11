-- Sparro schema v1. All money columns are integer paise (₹1 = 100).

CREATE TABLE accounts (
    id               INTEGER PRIMARY KEY,
    name             TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    kind             TEXT    NOT NULL CHECK (kind IN ('savings', 'current', 'cash', 'credit_card')),
    opening_balance  INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE categories (
    id        INTEGER PRIMARY KEY,
    name      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    bucket    TEXT    NOT NULL CHECK (bucket IN ('needs', 'wants', 'savings')),
    color     TEXT    NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL,
    category_id  INTEGER NOT NULL REFERENCES categories (id),
    bucket       TEXT    NOT NULL CHECK (bucket IN ('needs', 'wants', 'savings')),
    cycle        TEXT    NOT NULL CHECK (cycle IN ('monthly', 'quarterly', 'yearly')),
    amount       INTEGER NOT NULL CHECK (amount > 0),
    renews_on    TEXT    NOT NULL,
    account_id   INTEGER NOT NULL REFERENCES accounts (id),
    status       TEXT    NOT NULL CHECK (status IN ('active', 'paused', 'cancelled'))
);

CREATE TABLE expenses (
    id               INTEGER PRIMARY KEY,
    description      TEXT    NOT NULL,
    category_id      INTEGER NOT NULL REFERENCES categories (id),
    account_id       INTEGER NOT NULL REFERENCES accounts (id),
    bucket           TEXT    NOT NULL CHECK (bucket IN ('needs', 'wants', 'savings')),
    date             TEXT    NOT NULL,
    amount           INTEGER NOT NULL CHECK (amount > 0),
    subscription_id  INTEGER REFERENCES subscriptions (id) ON DELETE SET NULL
);
CREATE INDEX idx_expenses_date ON expenses (date);
CREATE INDEX idx_expenses_account ON expenses (account_id);

CREATE TABLE incomes (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    account_id  INTEGER NOT NULL REFERENCES accounts (id),
    date        TEXT    NOT NULL,
    amount      INTEGER NOT NULL CHECK (amount > 0)
);
CREATE INDEX idx_incomes_date ON incomes (date);

CREATE TABLE transfers (
    id               INTEGER PRIMARY KEY,
    from_account_id  INTEGER NOT NULL REFERENCES accounts (id),
    to_account_id    INTEGER NOT NULL REFERENCES accounts (id),
    date             TEXT    NOT NULL,
    amount           INTEGER NOT NULL CHECK (amount > 0),
    note             TEXT    NOT NULL DEFAULT '',
    CHECK (from_account_id <> to_account_id)
);
CREATE INDEX idx_transfers_date ON transfers (date);

CREATE TABLE stocks (
    id             INTEGER PRIMARY KEY,
    name           TEXT    NOT NULL,
    ticker         TEXT    NOT NULL,
    exchange       TEXT    NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
    units          REAL    NOT NULL CHECK (units > 0),
    avg_price      INTEGER NOT NULL CHECK (avg_price > 0),
    current_price  INTEGER NOT NULL CHECK (current_price > 0),
    purchase_date  TEXT    NOT NULL
);

CREATE TABLE funds (
    id           INTEGER PRIMARY KEY,
    name         TEXT    NOT NULL,
    plan         TEXT    NOT NULL DEFAULT 'Direct · Growth',
    units        REAL    NOT NULL CHECK (units > 0),
    avg_nav      INTEGER NOT NULL CHECK (avg_nav > 0),
    current_nav  INTEGER NOT NULL CHECK (current_nav > 0),
    sip_amount   INTEGER NOT NULL DEFAULT 0 CHECK (sip_amount >= 0),
    sip_day      INTEGER NOT NULL DEFAULT 1 CHECK (sip_day BETWEEN 1 AND 28),
    sip_start    TEXT    NOT NULL
);

CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
