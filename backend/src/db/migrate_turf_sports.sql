-- Create the new pricing table

CREATE TABLE IF NOT EXISTS turf_sports (
    id              SERIAL PRIMARY KEY,
    turf_id         INTEGER NOT NULL REFERENCES turfs(id) ON DELETE CASCADE,
    sport_type      VARCHAR(50) NOT NULL,
    price_per_hour  NUMERIC(10,2) NOT NULL CHECK (price_per_hour >= 0),
    peak_price      NUMERIC(10,2) CHECK (peak_price >= 0),
    UNIQUE (turf_id, sport_type)
);

-- Migrate any existing turf sport/price data into the new table

INSERT INTO turf_sports (turf_id, sport_type, price_per_hour, peak_price)
SELECT id, sport_type, price_per_hour, peak_price
FROM turfs  
WHERE sport_type IS NOT NULL AND price_per_hour IS NOT NULL
ON CONFLICT (turf_id, sport_type) DO NOTHING;

-- Now remove the old single-sport/price columns from turfs
ALTER TABLE turfs DROP COLUMN IF EXISTS sport_type;
ALTER TABLE turfs DROP COLUMN IF EXISTS price_per_hour;
ALTER TABLE turfs DROP COLUMN IF EXISTS peak_price;

-- Slots need to know which sport (and at what price) each was generated for
ALTER TABLE slots ADD COLUMN IF NOT EXISTS sport_type VARCHAR(50);
ALTER TABLE slots ADD COLUMN IF NOT EXISTS price NUMERIC(10,2);

