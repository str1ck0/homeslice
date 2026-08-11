-- Add currency column to houses table
ALTER TABLE houses ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD';

-- Update existing houses to use USD as default
UPDATE houses SET currency = 'USD' WHERE currency IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN houses.currency IS 'ISO 4217 currency code (e.g., USD, ZAR, EUR, GBP)';
