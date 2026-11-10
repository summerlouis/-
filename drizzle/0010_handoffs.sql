CREATE TABLE IF NOT EXISTS cash_handoffs(store TEXT NOT NULL,id TEXT NOT NULL,day TEXT NOT NULL,created TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(store,id));
CREATE INDEX IF NOT EXISTS cash_handoffs_store_day ON cash_handoffs(store,day,created);
