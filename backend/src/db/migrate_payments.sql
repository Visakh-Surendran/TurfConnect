ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'online';

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
