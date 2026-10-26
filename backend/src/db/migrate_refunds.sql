-- Add refund columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;

-- Add cancellation columns to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_payments_refund_status ON payments(refund_status);
