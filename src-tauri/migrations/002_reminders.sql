-- Renewal reminders (SUB-09): one row per subscription renewal already notified,
-- so each renewal produces at most one Windows notification.
CREATE TABLE renewal_notices (
    subscription_id  INTEGER NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
    renews_on        TEXT    NOT NULL,
    notified_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (subscription_id, renews_on)
);
