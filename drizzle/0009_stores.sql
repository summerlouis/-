CREATE TABLE IF NOT EXISTS stores(id TEXT PRIMARY KEY,name TEXT NOT NULL,address TEXT NOT NULL DEFAULT '',open INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
ALTER TABLE sales ADD COLUMN pickup_no INTEGER;
UPDATE sales SET pickup_no=sequence WHERE pickup_no IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_store_pickup ON sales(user_id,pickup_no);
CREATE TABLE IF NOT EXISTS store_counters(user_id TEXT PRIMARY KEY,value INTEGER NOT NULL);
INSERT OR IGNORE INTO store_counters SELECT user_id,MAX(pickup_no) FROM sales GROUP BY user_id;
CREATE TABLE IF NOT EXISTS catalog_seeds(user_id TEXT PRIMARY KEY,body TEXT NOT NULL);
