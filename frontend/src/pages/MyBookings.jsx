import { useState, useEffect } from "react";
import api from "../api/axios";

export default function MyBookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState(null);
  const [bookingToCancel, setBookingToCancel] = useState(null);
  const [refundResultModal, setRefundResultModal] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);
  const [filter, setFilter] = useState("all"); // "all" | "active" | "cancelled"

  function fetchBookings() {
    setLoading(true);
    api.get("/bookings/mine")
      .then((res) => setBookings(res.data.bookings || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchBookings();
  }, []);

  async function handleConfirmCancel() {
    if (!bookingToCancel) return;
    setCancellingId(bookingToCancel.booking_id);

    try {
      const res = await api.put(`/bookings/${bookingToCancel.booking_id}/cancel`);
      setBookingToCancel(null);
      setRefundResultModal({
        turfName: bookingToCancel.turf_name,
        date: bookingToCancel.date,
        time: `${bookingToCancel.start_time?.slice(0, 5)} - ${bookingToCancel.end_time?.slice(0, 5)}`,
        message: res.data.message,
        refund: res.data.refund,
      });
      fetchBookings();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (filter === "active") return b.booking_status === "confirmed";
    if (filter === "cancelled") return b.booking_status === "cancelled";
    return true;
  });

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2>My Bookings</h2>
          <p className="muted-text">Track your confirmed games, receipts, and refund requests</p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            className={`tab-btn small ${filter === "all" ? "active" : ""}`}
            onClick={() => setFilter("all")}
          >
            All ({bookings.length})
          </button>
          <button
            className={`tab-btn small ${filter === "active" ? "active" : ""}`}
            onClick={() => setFilter("active")}
          >
            Active ({bookings.filter((b) => b.booking_status === "confirmed").length})
          </button>
          <button
            className={`tab-btn small ${filter === "cancelled" ? "active" : ""}`}
            onClick={() => setFilter("cancelled")}
          >
            Cancelled & Refunded ({bookings.filter((b) => b.booking_status === "cancelled").length})
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading your bookings...</p>
      ) : filteredBookings.length === 0 ? (
        <div className="slots-empty-state" style={{ marginTop: 24 }}>
          <p className="muted-text">No bookings found for this filter.</p>
        </div>
      ) : (
        <div className="booking-list">
          {filteredBookings.map((b) => {
            const isConfirmed = b.booking_status === "confirmed";
            const isCancelled = b.booking_status === "cancelled";
            const hasRefund = Boolean(b.refund_id || b.payment_status === "refunded");

            return (
              <div
                key={b.booking_id}
                className="booking-row"
                style={{
                  alignItems: "center",
                  borderLeft: isConfirmed ? "4px solid #4ade80" : "4px solid #fb7185",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 16 }}>{b.turf_name}</strong>
                    <span
                      className="status-badge"
                      style={
                        isConfirmed
                          ? { background: "rgba(74, 222, 128, 0.15)", color: "#4ade80", border: "1px solid #4ade80" }
                          : { background: "rgba(244, 63, 94, 0.15)", color: "#fb7185", border: "1px solid #fb7185" }
                      }
                    >
                      {isConfirmed ? "✓ Confirmed" : "✕ Cancelled"}
                    </span>
                  </div>

                  <p className="muted-text" style={{ margin: "3px 0", fontSize: 13 }}>
                    📍 {b.location}
                  </p>

                  <p style={{ margin: "4px 0", fontSize: 13.5 }}>
                    📅 <strong>{b.date}</strong> · ⏰ {b.start_time.slice(0, 5)} - {b.end_time.slice(0, 5)}
                    {b.sport_type ? ` · 🎯 ${b.sport_type}` : ""}
                  </p>

                  {/* Payment & Refund Badges */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                    {b.payment_amount && (
                      <span
                        className="status-badge"
                        style={
                          b.payment_status === "completed"
                            ? { background: "rgba(74, 222, 128, 0.15)", color: "#4ade80", border: "1px solid #4ade80" }
                            : b.payment_status === "refunded"
                            ? { background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "1px solid #c084fc" }
                            : { background: "rgba(234, 179, 8, 0.15)", color: "#fbbf24", border: "1px solid #fbbf24" }
                        }
                      >
                        ₹{b.payment_amount}{" "}
                        {b.payment_status === "completed"
                          ? "Paid Online"
                          : b.payment_status === "refunded"
                          ? "Refunded"
                          : "Pay at Turf (Pending)"}
                      </span>
                    )}

                    {hasRefund && (
                      <span className="refund-badge success">
                        ↩️ Full Refund Processed (₹{b.refund_amount || b.payment_amount})
                      </span>
                    )}
                  </div>

                  {/* Refund & Reference details */}
                  {b.refund_id && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <span>
                        Refund ID: <code className="receipt-ref-code">{b.refund_id}</code>
                      </span>
                      {b.refund_reason && <span>Reason: {b.refund_reason}</span>}
                      {b.refunded_at && (
                        <span>Refunded: {new Date(b.refunded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      )}
                    </div>
                  )}

                  {!hasRefund && b.payment_ref && (
                    <p className="muted-text" style={{ fontSize: "12px", marginTop: "4px" }}>
                      Ref: <code>{b.payment_ref}</code>
                    </p>
                  )}
                </div>

                {/* Cancel Booking Action */}
                {isConfirmed && (
                  <button
                    className="tab-btn small"
                    style={{
                      background: "rgba(244, 63, 94, 0.1)",
                      borderColor: "#fb7185",
                      color: "#fb7185",
                      minWidth: 120,
                    }}
                    onClick={() => setBookingToCancel(b)}
                  >
                    Cancel Booking
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal to Cancel & Refund */}
      {bookingToCancel && (
        <div className="payment-modal-backdrop" onClick={() => setBookingToCancel(null)}>
          <div className="payment-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3 style={{ color: "#fb7185" }}>Cancel Booking</h3>
              <button className="payment-modal-close" onClick={() => setBookingToCancel(null)}>✕</button>
            </div>

            <div className="payment-summary">
              <div className="payment-summary-row">
                <span className="label">Turf</span>
                <span className="value">{bookingToCancel.turf_name}</span>
              </div>
              <div className="payment-summary-row">
                <span className="label">Date & Time</span>
                <span className="value">
                  {bookingToCancel.date} · {bookingToCancel.start_time?.slice(0, 5)} - {bookingToCancel.end_time?.slice(0, 5)}
                </span>
              </div>
              <div className="payment-summary-row">
                <span className="label">Amount Paid</span>
                <span className="value highlight">₹{bookingToCancel.payment_amount || 0}</span>
              </div>
            </div>

            {bookingToCancel.payment_status === "completed" ? (
              <div className="false-booking-banner" style={{ background: "rgba(74, 222, 128, 0.1)", borderColor: "rgba(74, 222, 128, 0.3)" }}>
                <p style={{ margin: "0 0 6px 0", color: "#4ade80", fontWeight: 700, fontSize: 14 }}>
                  ⚡ Instant Automatic Refund Policy
                </p>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                  Cancelling this booking will immediately initiate a <strong>100% full refund of ₹{bookingToCancel.payment_amount}</strong> back to your original payment method.
                </p>
              </div>
            ) : (
              <div className="payment-venue-notice" style={{ marginTop: 0, marginBottom: 16 }}>
                <p className="venue-title">📍 Pay-at-Turf Reservation</p>
                <p className="venue-desc">
                  This reservation has not been charged. Cancelling will release the slot back to the public without any penalty.
                </p>
              </div>
            )}

            <div className="success-actions-row">
              <button
                className="payment-btn"
                style={{ background: "#e11d48" }}
                disabled={cancellingId === bookingToCancel.booking_id}
                onClick={handleConfirmCancel}
              >
                {cancellingId === bookingToCancel.booking_id
                  ? "Processing Cancellation & Refund..."
                  : "Yes, Cancel Booking & Issue Refund"}
              </button>
              <button
                type="button"
                className="success-btn-secondary"
                onClick={() => setBookingToCancel(null)}
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation & Refund Success Result Modal */}
      {refundResultModal && (
        <div className="payment-modal-backdrop" onClick={() => setRefundResultModal(null)}>
          <div className="payment-modal-card success-mode" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header" style={{ marginBottom: 0 }}>
              <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✓ CANCELLATION COMPLETED</span>
              <button className="payment-modal-close" onClick={() => setRefundResultModal(null)}>✕</button>
            </div>

            <div className="payment-success-header">
              <div className="success-badge-container">
                <div className="success-badge-glow" style={{ background: "radial-gradient(circle, rgba(168, 85, 247, 0.3) 0%, transparent 70%)" }}>
                  <div className="success-badge-circle" style={{ background: "linear-gradient(135deg, #a855f7, #7c3aed)" }}>↩️</div>
                </div>
              </div>
              <h2 className="payment-success-title" style={{ color: "#c084fc" }}>
                Booking Cancelled Successfully
              </h2>
              <p className="payment-success-subtitle">
                {refundResultModal.message}
              </p>
            </div>

            {refundResultModal.refund && (
              <div className="success-receipt-card">
                <div className="receipt-highlight-row">
                  <div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>
                      Refunded Amount
                    </span>
                    <span className="receipt-amount">₹{refundResultModal.refund.amount}</span>
                  </div>
                  <span className="receipt-badge-status">
                    ✓ Refund {refundResultModal.refund.status || "Processed"}
                  </span>
                </div>

                <div className="receipt-row">
                  <span className="receipt-label">Turf</span>
                  <span className="receipt-val">{refundResultModal.turfName}</span>
                </div>

                <div className="receipt-row">
                  <span className="receipt-label">Slot</span>
                  <span className="receipt-val">📅 {refundResultModal.date} · ⏰ {refundResultModal.time}</span>
                </div>

                <div className="receipt-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255, 255, 255, 0.1)" }}>
                  <span className="receipt-label">Refund Reference ID</span>
                  <span className="receipt-val">
                    <code className="receipt-ref-code">{refundResultModal.refund.refund_id}</code>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      onClick={() => {
                        if (refundResultModal.refund?.refund_id) {
                          navigator.clipboard.writeText(refundResultModal.refund.refund_id);
                          setCopiedRef(true);
                          setTimeout(() => setCopiedRef(false), 2000);
                        }
                      }}
                    >
                      {copiedRef ? "✓ Copied" : "Copy"}
                    </button>
                  </span>
                </div>
              </div>
            )}

            <button
              type="button"
              className="payment-btn"
              onClick={() => setRefundResultModal(null)}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}