import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function PaymentModal({
  isOpen,
  onClose,
  slot,
  turf,
  tournament,
  team,
  user,
  onSuccess,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("online"); // "online" | "pay_at_venue"
  const [isMockMode, setIsMockMode] = useState(false);
  const [mockOrderData, setMockOrderData] = useState(null);
  const [successData, setSuccessData] = useState(null);
  const [falseBookingData, setFalseBookingData] = useState(null);
  const [copiedRef, setCopiedRef] = useState(false);

  if (!isOpen) return null;
  if (!slot && !tournament) return null;

  const isTournament = Boolean(tournament);
  const title = isTournament ? "Confirm Tournament Entry" : "Confirm Slot Booking";
  const turfName = tournament
    ? tournament.turf_name || "Tournament Turf"
    : turf?.name || slot?.turf_name || "Turf";
  const turfLocation = tournament
    ? tournament.location || ""
    : turf?.location || slot?.location || "";
  const sportType = isTournament ? tournament.sport : slot?.sport_type;
  const price = isTournament ? Number(tournament.entry_fee || 0) : Number(slot?.price || 0);
  const displayDate = isTournament ? tournament.start_date : slot?.date;
  const timeRange = isTournament
    ? `${tournament.format?.replace("_", " ")} Format`
    : `${slot?.start_time?.slice(0, 5)} - ${slot?.end_time?.slice(0, 5)}`;

  function handleCompleteClose() {
    setSuccessData(null);
    setFalseBookingData(null);
    setError("");
    setIsMockMode(false);
    setMockOrderData(null);
    onClose();
  }

  // Helper to load Razorpay checkout.js dynamically if needed
  function loadRazorpayScript() {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        return resolve(true);
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  // Handle Pay at Turf / Cash on Arrival
  async function handlePayAtVenue() {
    if (!user) {
      setError("Please log in to continue booking.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const payload = isTournament
        ? { tournament_id: tournament.id, team_id: team?.id, purpose: "tournament_entry" }
        : { slot_id: slot.id, sport_type: slot?.sport_type, purpose: "slot_booking" };

      const res = await api.post("/payments/pay-at-venue", payload);

      if (onSuccess) {
        onSuccess(res.data.booking || res.data.registration, res.data);
      }

      setSuccessData({
        isPayAtVenue: true,
        booking: res.data.booking || res.data.registration,
        details: res.data,
        ref: res.data.transaction_ref,
      });
    } catch (err) {
      console.error("Pay at venue error:", err);
      setError(err.response?.data?.error || "Failed to confirm pay-at-venue reservation.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Online Payment (Razorpay)
  async function handleProceedOnlinePay() {
    if (!user) {
      setError("Please log in to continue booking.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const payload = isTournament
        ? { tournament_id: tournament.id, team_id: team?.id, purpose: "tournament_entry" }
        : { slot_id: slot.id, sport_type: slot?.sport_type, purpose: "slot_booking" };

      // 1. Create order on the backend
      const res = await api.post("/payments/create-order", payload);
      const orderData = res.data;

      // 2. Check if running in test mock fallback mode
      if (orderData.isMock) {
        setIsMockMode(true);
        setMockOrderData(orderData);
        setLoading(false);
        return;
      }

      // 3. Ensure Razorpay checkout script is loaded
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !window.Razorpay) {
        setError("Unable to load Razorpay gateway. Please check your internet connection.");
        setLoading(false);
        return;
      }

      // 4. Configure Razorpay options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency || "INR",
        name: "TurfConnect",
        description: isTournament
          ? `Entry for ${tournament.name} (${team?.name || "Team"})`
          : `Booking for ${turfName} (${sportType})`,
        order_id: orderData.orderId,
        handler: async function (response) {
          try {
            setLoading(true);
            const verifyPayload = isTournament
              ? {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  tournament_id: tournament.id,
                  team_id: team?.id,
                  purpose: "tournament_entry",
                }
              : {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  slot_id: slot.id,
                  purpose: "slot_booking",
                };

            const verifyRes = await api.post("/payments/verify", verifyPayload);

            // Check if false booking conflict triggered an automatic refund
            if (verifyRes.data.false_booking) {
              setFalseBookingData(verifyRes.data);
              return;
            }

            if (onSuccess) {
              onSuccess(verifyRes.data.booking || verifyRes.data.registration, verifyRes.data);
            }

            setSuccessData({
              isPayAtVenue: false,
              booking: verifyRes.data.booking || verifyRes.data.registration,
              details: verifyRes.data,
              ref: verifyRes.data.transaction_ref || response.razorpay_payment_id,
            });
          } catch (verifyErr) {
            console.error("Verification error:", verifyErr);
            if (verifyErr.response?.data?.false_booking) {
              setFalseBookingData(verifyErr.response.data);
            } else {
              setError(
                verifyErr.response?.data?.error ||
                  "Payment was captured with Razorpay, but confirmation failed. Please contact support."
              );
            }
          } finally {
            setLoading(false);
          }
        },
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
          contact: user?.phone || "",
        },
        theme: {
          color: "#7c3aed",
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
          },
        },
      };

      const rzpInstance = new window.Razorpay(options);
      rzpInstance.on("payment.failed", function (response) {
        console.error("Payment failed:", response.error);
        setError(response.error.description || "Payment was rejected or cancelled.");
        setLoading(false);
      });

      rzpInstance.open();
    } catch (err) {
      console.error("Order creation error:", err);
      setError(err.response?.data?.error || "Failed to initiate payment order.");
      setLoading(false);
    }
  }

  // Handle Mock payment completion for development when test keys are placeholders
  async function handleSimulateMockPayment() {
    if (!mockOrderData) return;
    setLoading(true);
    setError("");

    try {
      const mockPaymentId = `pay_mock_${Date.now()}`;
      const verifyPayload = isTournament
        ? {
            razorpay_order_id: mockOrderData.orderId,
            razorpay_payment_id: mockPaymentId,
            razorpay_signature: "mock_signature_success",
            tournament_id: tournament.id,
            team_id: team?.id,
            purpose: "tournament_entry",
          }
        : {
            razorpay_order_id: mockOrderData.orderId,
            razorpay_payment_id: mockPaymentId,
            razorpay_signature: "mock_signature_success",
            slot_id: slot.id,
            purpose: "slot_booking",
          };

      const verifyRes = await api.post("/payments/verify", verifyPayload);

      // Check if false booking conflict triggered an automatic refund
      if (verifyRes.data.false_booking) {
        setFalseBookingData(verifyRes.data);
        return;
      }

      if (onSuccess) {
        onSuccess(verifyRes.data.booking || verifyRes.data.registration, verifyRes.data);
      }

      setSuccessData({
        isPayAtVenue: false,
        isMock: true,
        booking: verifyRes.data.booking || verifyRes.data.registration,
        details: verifyRes.data,
        ref: verifyRes.data.transaction_ref || mockPaymentId,
      });
    } catch (err) {
      console.error("Mock verify error:", err);
      if (err.response?.data?.false_booking) {
        setFalseBookingData(err.response.data);
      } else {
        setError(err.response?.data?.error || "Mock verification failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  // 1. PAYMENT SUCCESSFUL POP-UP
  if (successData) {
    return (
      <div className="payment-modal-backdrop" onClick={handleCompleteClose}>
        <div className="payment-modal-card success-mode" onClick={(e) => e.stopPropagation()}>
          <div className="payment-modal-header" style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 13, color: "#4ade80", fontWeight: 700 }}>✓ VERIFIED & CONFIRMED</span>
            <button className="payment-modal-close" onClick={handleCompleteClose}>✕</button>
          </div>

          <div className="payment-success-header">
            <div className="success-badge-container">
              <div className="success-badge-glow">
                <div className="success-badge-circle">✓</div>
              </div>
            </div>
            <h2 className="payment-success-title">
              {successData.isPayAtVenue ? "Reservation Confirmed!" : "Payment Successful!"}
            </h2>
            <p className="payment-success-subtitle">
              {successData.isPayAtVenue
                ? "Your slot is reserved. Please pay the turf manager when you arrive."
                : "Your transaction was verified and slot confirmed!"}
            </p>
          </div>

          <div className="success-receipt-card">
            <div className="receipt-highlight-row">
              <div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block" }}>
                  Amount {successData.isPayAtVenue ? "To Pay at Turf" : "Paid Online"}
                </span>
                <span className="receipt-amount">₹{price}</span>
              </div>
              <span className={`receipt-badge-status ${successData.isPayAtVenue ? "venue" : ""}`}>
                {successData.isPayAtVenue ? "💵 Pay at Turf" : "✓ Paid Online"}
              </span>
            </div>

            <div className="receipt-row">
              <span className="receipt-label">{isTournament ? "Tournament" : "Turf"}</span>
              <span className="receipt-val">{isTournament ? tournament.name : turfName}</span>
            </div>

            {turfLocation && (
              <div className="receipt-row">
                <span className="receipt-label">Location</span>
                <span className="receipt-val">{turfLocation}</span>
              </div>
            )}

            <div className="receipt-row">
              <span className="receipt-label">Sport</span>
              <span className="receipt-val" style={{ color: "var(--violet-light)", fontWeight: 600 }}>{sportType}</span>
            </div>

            <div className="receipt-row">
              <span className="receipt-label">Date & Time</span>
              <span className="receipt-val">📅 {displayDate} · ⏰ {timeRange}</span>
            </div>

            <div className="receipt-row" style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed rgba(255, 255, 255, 0.1)" }}>
              <span className="receipt-label">Reference ID</span>
              <span className="receipt-val">
                <code className="receipt-ref-code">{successData.ref}</code>
                <button
                  type="button"
                  className="copy-mini-btn"
                  onClick={() => {
                    if (successData.ref) {
                      navigator.clipboard.writeText(successData.ref);
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

          <div className="success-actions-row">
            <Link
              to="/my-bookings"
              className="success-btn-primary"
              onClick={handleCompleteClose}
            >
              🎟️ View in My Bookings
            </Link>
            <button
              type="button"
              className="success-btn-secondary"
              onClick={handleCompleteClose}
            >
              + Book Another Slot
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. FALSE BOOKING / SLOT CONFLICT POP-UP
  if (falseBookingData) {
    return (
      <div className="payment-modal-backdrop" onClick={handleCompleteClose}>
        <div className="payment-modal-card" style={{ borderColor: "#f43f5e" }} onClick={(e) => e.stopPropagation()}>
          <div className="payment-modal-header">
            <h3 style={{ color: "#fb7185" }}>⚠️ False Booking Refund</h3>
            <button className="payment-modal-close" onClick={handleCompleteClose}>✕</button>
          </div>

          <div className="false-booking-banner">
            <div className="false-booking-icon">↩️</div>
            <h3 className="false-booking-title">Slot Conflict Detected</h3>
            <p className="false-booking-desc">
              {falseBookingData.error ||
                "This slot was booked by another user right while your payment was in progress. We have automatically processed a full refund to your account."}
            </p>

            {falseBookingData.refund && (
              <div className="refund-info-box">
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="receipt-label">Refund Status:</span>
                  <span className="refund-badge success">✓ Processed</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span className="receipt-label">Refund Amount:</span>
                  <strong style={{ color: "#4ade80" }}>₹{falseBookingData.refund.amount}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="receipt-label">Refund ID:</span>
                  <span>
                    <code className="receipt-ref-code">{falseBookingData.refund.refund_id}</code>
                    <button
                      type="button"
                      className="copy-mini-btn"
                      onClick={() => {
                        if (falseBookingData.refund?.refund_id) {
                          navigator.clipboard.writeText(falseBookingData.refund.refund_id);
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
          </div>

          <button
            type="button"
            className="payment-btn"
            style={{ background: "var(--violet)" }}
            onClick={handleCompleteClose}
          >
            Choose Another Available Slot
          </button>
        </div>
      </div>
    );
  }

  // 3. STANDARD PAYMENT SELECTION / CHECKOUT
  return (
    <div className="payment-modal-backdrop" onClick={onClose}>
      <div className="payment-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="payment-modal-header">
          <h3>{title}</h3>
          <button className="payment-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {error && (
          <div className="payment-error-banner">
            <p>{error}</p>
          </div>
        )}

        {!user && (
          <div
            className="payment-error-banner"
            style={{
              background: "rgba(234, 179, 8, 0.15)",
              borderColor: "#fbbf24",
              color: "#fbbf24",
            }}
          >
            <p>
              You need to be logged in to book or register.{" "}
              <Link
                to="/login"
                style={{ color: "white", textDecoration: "underline", fontWeight: "bold" }}
              >
                Click here to Log in
              </Link>
            </p>
          </div>
        )}

        {/* Booking Summary */}
        <div className="payment-summary">
          <div className="payment-summary-row">
            <span className="label">{isTournament ? "Tournament" : "Turf"}</span>
            <span className="value">{isTournament ? tournament.name : turfName}</span>
          </div>

          {turfLocation && (
            <div className="payment-summary-row">
              <span className="label">Location</span>
              <span className="value muted">{turfLocation}</span>
            </div>
          )}

          {isTournament && team && (
            <div className="payment-summary-row">
              <span className="label">Registering Team</span>
              <span className="value highlight">{team.name}</span>
            </div>
          )}

          <div className="payment-summary-row">
            <span className="label">Sport</span>
            <span className="value highlight">{sportType}</span>
          </div>

          <div className="payment-summary-row">
            <span className="label">Date</span>
            <span className="value">{displayDate}</span>
          </div>

          <div className="payment-summary-row">
            <span className="label">{isTournament ? "Format" : "Time"}</span>
            <span className="value">{timeRange}</span>
          </div>

          <div className="payment-divider" />

          <div className="payment-summary-row total-row">
            <span className="label">Total Amount</span>
            <span className="value total-price">₹{price}</span>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: "block",
              fontSize: 13,
              color: "var(--text-muted)",
              marginBottom: 8,
              fontWeight: 600,
            }}
          >
            Select Payment Method:
          </label>
          <div className="payment-methods-grid">
            <div
              className={`payment-method-card ${paymentMethod === "online" ? "active" : ""}`}
              onClick={() => {
                setPaymentMethod("online");
                setIsMockMode(false);
              }}
            >
              <div className="method-header">
                <span className="method-radio">{paymentMethod === "online" ? "●" : "○"}</span>
                <strong>⚡ Online Payment</strong>
              </div>
              <p className="method-sub">Razorpay · UPI, Cards, Netbanking</p>
            </div>

            <div
              className={`payment-method-card ${paymentMethod === "pay_at_venue" ? "active" : ""}`}
              onClick={() => {
                setPaymentMethod("pay_at_venue");
                setIsMockMode(false);
              }}
            >
              <div className="method-header">
                <span className="method-radio">{paymentMethod === "pay_at_venue" ? "●" : "○"}</span>
                <strong>💵 Pay at Turf</strong>
              </div>
              <p className="method-sub">Pay Cash or UPI on Arrival</p>
            </div>
          </div>
        </div>

        {/* Action Button depending on Selected Method */}
        {paymentMethod === "pay_at_venue" ? (
          <div className="payment-venue-notice">
            <p className="venue-title">📍 Reserve Now, Pay at the Turf</p>
            <p className="venue-desc">
              Your booking will be confirmed immediately. You can pay ₹{price} directly to the turf
              manager when you arrive.
            </p>
            <button
              className="payment-btn"
              disabled={loading || !user}
              onClick={handlePayAtVenue}
            >
              {loading ? "Confirming Reservation..." : `Confirm Booking (Pay ₹${price} at Venue)`}
            </button>
          </div>
        ) : isMockMode ? (
          <div className="payment-mock-notice">
            <p className="mock-title">⚡ Razorpay Test Notice</p>
            <p className="mock-desc">
              Your backend is currently using placeholder Razorpay credentials. To enable live
              Razorpay Checkout, add valid test keys in <code>backend/.env</code>.
            </p>
            <button
              className="payment-btn"
              disabled={loading || !user}
              onClick={handleSimulateMockPayment}
            >
              {loading ? "Processing..." : `Simulate Successful Test Payment (₹${price})`}
            </button>
          </div>
        ) : (
          <button
            className="payment-btn"
            disabled={loading || !user}
            onClick={handleProceedOnlinePay}
          >
            {loading ? "Initializing Gateway..." : `Pay ₹${price} with Razorpay`}
          </button>
        )}

        <p className="payment-secure-badge">
          🔒 Instant confirmation · 100% Conflict-safe locking
        </p>
      </div>
    </div>
  );
}
