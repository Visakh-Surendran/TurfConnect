import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import api from "../api/axios";

function formatDate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date) {
  if (!date) return "";
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export default function OwnerDashboard() {
  const [activeTab, setActiveTab] = useState("turfs"); // "turfs" | "payments"
  const [turfs, setTurfs] = useState([]);
  const [form, setForm] = useState({ name: "", location: "", amenities: "", photo_url: "" });
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const [sportForm, setSportForm] = useState({});
  const [activeSportTurf, setActiveSportTurf] = useState(null);
  const [turfSports, setTurfSports] = useState({});

  const [slotForm, setSlotForm] = useState({});

  // Payment & Revenue State
  const [paymentData, setPaymentData] = useState({
    summary: { totalRevenue: 0, totalRefunded: 0, pendingRevenue: 0, totalTransactions: 0, completedCount: 0, refundedCount: 0, pendingCount: 0 },
    payments: [],
  });
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [collectingId, setCollectingId] = useState(null);
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [refundPaymentTarget, setRefundPaymentTarget] = useState(null);
  const [refundReason, setRefundReason] = useState("False booking / slot conflict");
  const [refunding, setRefunding] = useState(false);

  function fetchMyTurfs() {
    api.get("/turfs/mine").then((res) => setTurfs(res.data.turfs)).catch(console.error);
  }

  function fetchOwnerPayments() {
    setPaymentsLoading(true);
    api
      .get("/payments/owner")
      .then((res) => setPaymentData(res.data))
      .catch(console.error)
      .finally(() => setPaymentsLoading(false));
  }

  useEffect(() => {
    let isMounted = true;
    api
      .get("/turfs/mine")
      .then((res) => {
        if (isMounted) setTurfs(res.data.turfs || []);
      })
      .catch(console.error);

    api
      .get("/payments/owner")
      .then((res) => {
        if (isMounted) setPaymentData(res.data);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setPaymentsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function fetchSportsFor(turfId) {
    api.get(`/turfs/${turfId}/sports`).then((res) =>
      setTurfSports((prev) => ({ ...prev, [turfId]: res.data.sports }))
    );
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleCreateTurf(e) {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/turfs", form);
      setMessageType("success");
      setMessage("Turf submitted — awaiting admin approval.");
      setForm({ name: "", location: "", amenities: "", photo_url: "" });
      fetchMyTurfs();
    } catch (err) {
      setMessageType("error");
      setMessage(err.response?.data?.error || "Failed to create turf");
    }
  }

  function handleSportFormChange(turfId, field, value) {
    setSportForm({ ...sportForm, [turfId]: { ...sportForm[turfId], [field]: value } });
  }

  async function handleAddSport(turfId) {
    const data = sportForm[turfId];
    if (!data?.sport_type || !data?.price_per_hour) {
      alert("Fill in sport and price");
      return;
    }
    try {
      await api.post(`/turfs/${turfId}/sports`, data);
      fetchSportsFor(turfId);
      setSportForm({ ...sportForm, [turfId]: {} });
    } catch (err) {
      alert(err.response?.data?.error || "Failed to add sport");
    }
  }

  function handleSlotFormChange(turfId, field, value) {
    setSlotForm({ ...slotForm, [turfId]: { ...slotForm[turfId], [field]: value } });
  }

  async function handleGenerateSlots(turfId) {
    const data = slotForm[turfId];
    if (
      !data?.turf_sport_id ||
      !data?.date_from ||
      !data?.date_to ||
      !data?.start_time ||
      !data?.end_time ||
      !data?.slot_duration_minutes
    ) {
      alert("Fill all slot fields, including which sport");
      return;
    }

    const payload = {
      turf_sport_id: data.turf_sport_id,
      date_from: formatDate(data.date_from),
      date_to: formatDate(data.date_to),
      start_time: formatTime(data.start_time),
      end_time: formatTime(data.end_time),
      slot_duration_minutes: data.slot_duration_minutes,
    };

    try {
      const res = await api.post(`/turfs/${turfId}/slots/generate`, payload);
      alert(res.data.message);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to generate slots");
    }
  }

  function toggleManage(turfId) {
    if (activeSportTurf === turfId) {
      setActiveSportTurf(null);
    } else {
      setActiveSportTurf(turfId);
      fetchSportsFor(turfId);
    }
  }

  async function handleMarkCollected(paymentId) {
    setCollectingId(paymentId);
    try {
      await api.put(`/payments/${paymentId}/collect`);
      fetchOwnerPayments();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to mark payment as collected");
    } finally {
      setCollectingId(null);
    }
  }

  async function handleExecuteRefund() {
    if (!refundPaymentTarget) return;
    setRefunding(true);
    try {
      const res = await api.post(`/payments/${refundPaymentTarget.payment_id}/refund`, {
        reason: refundReason,
      });
      alert(res.data.message || "Refund issued successfully!");
      setRefundPaymentTarget(null);
      fetchOwnerPayments();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to process refund");
    } finally {
      setRefunding(false);
    }
  }

  const filteredPayments = (paymentData.payments || []).filter((p) => {
    if (paymentFilter === "completed") return p.payment_status === "completed";
    if (paymentFilter === "pending") return p.payment_status === "pending";
    if (paymentFilter === "refunded") return p.payment_status === "refunded";
    return true;
  });

  return (
    <div className="page-container">
      <h2>Owner Dashboard</h2>

      {/* Tabs */}
      <div className="dashboard-tabs" style={{ display: "flex", gap: "10px", marginBottom: "24px" }}>
        <button
          className={`tab-btn ${activeTab === "turfs" ? "active" : ""}`}
          onClick={() => setActiveTab("turfs")}
        >
          🏟️ My Turfs & Slots
        </button>
        <button
          className={`tab-btn ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("payments");
            fetchOwnerPayments();
          }}
        >
          💳 Revenue & Payments
        </button>
      </div>

      {activeTab === "turfs" ? (
        <>
          <div className="form-card">
            <h3>Add a New Turf</h3>

            {message && (
              <p
                className="info-text"
                style={
                  messageType === "error"
                    ? { borderColor: "var(--error)", color: "var(--error)" }
                    : messageType === "success"
                    ? { borderColor: "#4ade80", color: "#4ade80" }
                    : {}
                }
              >
                {message}
              </p>
            )}

            <form onSubmit={handleCreateTurf}>
              <input name="name" placeholder="Turf name" value={form.name} onChange={handleChange} required />
              <input name="location" placeholder="Location" value={form.location} onChange={handleChange} required />
              <input name="amenities" placeholder="Amenities" value={form.amenities} onChange={handleChange} />
              <input name="photo_url" placeholder="Photo URL (optional)" value={form.photo_url} onChange={handleChange} />

              {form.photo_url && (
                <img
                  src={form.photo_url}
                  alt="Preview"
                  style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
                  onError={(e) => (e.target.style.display = "none")}
                  onLoad={(e) => (e.target.style.display = "block")}
                />
              )}

              <button type="submit">Submit Turf</button>
            </form>
          </div>

          <h3>My Turfs</h3>
          <div className="turf-list">
            {turfs.length === 0 && <p className="muted-text">You haven't added any turfs yet.</p>}

            {turfs.map((turf) => (
              <div key={turf.id} className="turf-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{turf.name}</strong>
                    <p className="muted-text">{turf.location}</p>
                    <span className={`status-badge status-${turf.status}`}>{turf.status}</span>
                  </div>
                  {turf.status === "approved" && (
                    <button onClick={() => toggleManage(turf.id)}>
                      {activeSportTurf === turf.id ? "Close" : "Manage Sports & Slots"}
                    </button>
                  )}
                </div>

                {turf.status === "pending" && (
                  <p className="muted-text" style={{ marginTop: 8 }}>
                    Waiting on admin approval before you can add sports and slots.
                  </p>
                )}
                {turf.status === "rejected" && (
                  <p className="info-text" style={{ borderColor: "var(--error)", color: "var(--error)", marginTop: 8 }}>
                    This turf listing was rejected by the admin.
                  </p>
                )}

                {activeSportTurf === turf.id && (
                  <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                    <h4>Sports offered</h4>
                    {(turfSports[turf.id] || []).length === 0 && (
                      <p className="muted-text">No sports added yet — add one below.</p>
                    )}
                    {(turfSports[turf.id] || []).map((s) => (
                      <p key={s.id}>
                        {s.sport_type} — ₹{s.price_per_hour}/hr
                        {s.peak_price ? ` (peak ₹${s.peak_price})` : ""}
                      </p>
                    ))}

                    <div className="slot-inline-form">
                      <input
                        placeholder="Sport (e.g. football)"
                        value={sportForm[turf.id]?.sport_type || ""}
                        onChange={(e) => handleSportFormChange(turf.id, "sport_type", e.target.value)}
                      />
                      <input
                        type="number"
                        placeholder="Price/hr"
                        value={sportForm[turf.id]?.price_per_hour || ""}
                        onChange={(e) => handleSportFormChange(turf.id, "price_per_hour", Number(e.target.value))}
                      />
                      <input
                        type="number"
                        placeholder="Peak price (optional)"
                        value={sportForm[turf.id]?.peak_price || ""}
                        onChange={(e) => handleSportFormChange(turf.id, "peak_price", Number(e.target.value))}
                      />
                      <button onClick={() => handleAddSport(turf.id)}>Add Sport</button>
                    </div>

                    <h4 style={{ marginTop: 16 }}>Generate slots</h4>
                    {(turfSports[turf.id] || []).length === 0 ? (
                      <p className="muted-text">Add a sport above first before generating slots.</p>
                    ) : (
                      <div className="slot-inline-form" style={{ alignItems: "center" }}>
                        <select
                          value={slotForm[turf.id]?.turf_sport_id || ""}
                          onChange={(e) =>
                            handleSlotFormChange(turf.id, "turf_sport_id", Number(e.target.value))
                          }
                        >
                          <option value="">-- select sport --</option>
                          {(turfSports[turf.id] || []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.sport_type} (₹{s.price_per_hour}/hr)
                            </option>
                          ))}
                        </select>

                        <DatePicker
                          selected={slotForm[turf.id]?.date_from || null}
                          onChange={(date) => handleSlotFormChange(turf.id, "date_from", date)}
                          dateFormat="yyyy-MM-dd"
                          placeholderText="From date"
                          className="tc-datepicker-input"
                        />

                        <DatePicker
                          selected={slotForm[turf.id]?.date_to || null}
                          onChange={(date) => handleSlotFormChange(turf.id, "date_to", date)}
                          dateFormat="yyyy-MM-dd"
                          placeholderText="To date"
                          className="tc-datepicker-input"
                        />

                        <DatePicker
                          selected={slotForm[turf.id]?.start_time || null}
                          onChange={(date) => handleSlotFormChange(turf.id, "start_time", date)}
                          showTimeSelect
                          showTimeSelectOnly
                          timeIntervals={30}
                          timeCaption="Start"
                          dateFormat="h:mm aa"
                          placeholderText="Start time"
                          className="tc-datepicker-input"
                        />

                        <DatePicker
                          selected={slotForm[turf.id]?.end_time || null}
                          onChange={(date) => handleSlotFormChange(turf.id, "end_time", date)}
                          showTimeSelect
                          showTimeSelectOnly
                          timeIntervals={30}
                          timeCaption="End"
                          dateFormat="h:mm aa"
                          placeholderText="End time"
                          className="tc-datepicker-input"
                        />

                        <input
                          type="number"
                          placeholder="Minutes/slot"
                          style={{ width: 110 }}
                          onChange={(e) =>
                            handleSlotFormChange(turf.id, "slot_duration_minutes", Number(e.target.value))
                          }
                        />
                        <button onClick={() => handleGenerateSlots(turf.id)}>Generate</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Revenue & Payments Tab */
        <div>
          {/* Revenue Stat Cards */}
          <div className="revenue-stats-grid">
            <div className="revenue-card collected">
              <span className="revenue-card-title">💰 Total Revenue Collected</span>
              <span className="revenue-card-value">₹{paymentData.summary.totalRevenue}</span>
              <span className="revenue-card-sub">{paymentData.summary.completedCount} completed transactions</span>
            </div>

            <div className="revenue-card pending">
              <span className="revenue-card-title">⏳ Pay at Turf to Collect</span>
              <span className="revenue-card-value">₹{paymentData.summary.pendingRevenue}</span>
              <span className="revenue-card-sub">{paymentData.summary.pendingCount} cash payments pending</span>
            </div>

            <div className="revenue-card refunded" style={{ borderColor: "rgba(244, 63, 94, 0.3)" }}>
              <span className="revenue-card-title">↩️ Total Refunds Processed</span>
              <span className="revenue-card-value" style={{ color: "#fb7185" }}>₹{paymentData.summary.totalRefunded || 0}</span>
              <span className="revenue-card-sub">{paymentData.summary.refundedCount || 0} refunds / false bookings</span>
            </div>

            <div className="revenue-card total">
              <span className="revenue-card-title">📦 Total Bookings / Entries</span>
              <span className="revenue-card-value">{paymentData.summary.totalTransactions}</span>
              <span className="revenue-card-sub">All-time booking volume</span>
            </div>
          </div>

          {/* Filter options */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "24px 0 16px 0", flexWrap: "wrap", gap: 12 }}>
            <h3>Transactions & Payments ({filteredPayments.length})</h3>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                className={`tab-btn small ${paymentFilter === "all" ? "active" : ""}`}
                onClick={() => setPaymentFilter("all")}
              >
                All
              </button>
              <button
                className={`tab-btn small ${paymentFilter === "completed" ? "active" : ""}`}
                onClick={() => setPaymentFilter("completed")}
              >
                Completed ({paymentData.summary.completedCount})
              </button>
              <button
                className={`tab-btn small ${paymentFilter === "pending" ? "active" : ""}`}
                onClick={() => setPaymentFilter("pending")}
              >
                Pending Cash ({paymentData.summary.pendingCount})
              </button>
              <button
                className={`tab-btn small ${paymentFilter === "refunded" ? "active" : ""}`}
                onClick={() => setPaymentFilter("refunded")}
              >
                Refunded ({paymentData.summary.refundedCount || 0})
              </button>
            </div>
          </div>

          {paymentsLoading ? (
            <p>Loading transactions...</p>
          ) : filteredPayments.length === 0 ? (
            <p className="muted-text">No payment records found for this filter.</p>
          ) : (
            <div className="booking-list">
              {filteredPayments.map((p) => (
                <div key={p.payment_id} className="booking-row" style={{ alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong>{p.turf_name || p.tournament_name || "Turf Booking"}</strong>
                      <span className="status-badge" style={{ fontSize: "11px" }}>
                        {p.purpose === "tournament_entry" ? "🏆 Tournament Entry" : "⚡ Slot Booking"}
                      </span>
                    </div>

                    <p className="muted-text" style={{ fontSize: "13px", marginTop: "2px" }}>
                      Customer: <strong>{p.user_name}</strong> {p.user_phone ? `(${p.user_phone})` : ""} · {p.user_email}
                    </p>

                    {p.slot_date && (
                      <p style={{ fontSize: "13px", margin: "2px 0" }}>
                        Slot: {p.slot_date} · {p.start_time?.slice(0, 5)} - {p.end_time?.slice(0, 5)} ({p.sport_type})
                      </p>
                    )}

                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px", flexWrap: "wrap" }}>
                      <span
                        className="status-badge"
                        style={
                          p.payment_status === "completed"
                            ? { background: "rgba(74, 222, 128, 0.15)", color: "#4ade80", border: "1px solid #4ade80" }
                            : p.payment_status === "refunded"
                            ? { background: "rgba(168, 85, 247, 0.15)", color: "#c084fc", border: "1px solid #c084fc" }
                            : { background: "rgba(234, 179, 8, 0.15)", color: "#fbbf24", border: "1px solid #fbbf24" }
                        }
                      >
                        {p.payment_status === "completed"
                          ? "✓ Paid"
                          : p.payment_status === "refunded"
                          ? "↩️ Refunded"
                          : "⏳ Pending Cash"}
                      </span>

                      <span
                        className="status-badge"
                        style={{
                          background: p.payment_method === "pay_at_venue" ? "rgba(234, 179, 8, 0.1)" : "rgba(124, 58, 237, 0.15)",
                          color: p.payment_method === "pay_at_venue" ? "#fbbf24" : "var(--violet-light)",
                          border: `1px solid ${p.payment_method === "pay_at_venue" ? "#fbbf24" : "var(--violet)"}`,
                        }}
                      >
                        {p.payment_method === "pay_at_venue" ? "💵 Pay at Turf" : "⚡ Online Razorpay"}
                      </span>

                      <span style={{ fontWeight: "bold", color: p.payment_status === "refunded" ? "#fb7185" : "#4ade80", fontSize: "15px" }}>
                        ₹{p.amount}
                      </span>
                    </div>

                    <p className="muted-text" style={{ fontSize: "11px", marginTop: "4px" }}>
                      Ref: {p.transaction_ref} · {new Date(p.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>

                    {p.refund_id && (
                      <p className="muted-text" style={{ fontSize: "11px", marginTop: "2px", color: "#fb7185" }}>
                        Refund ID: <code>{p.refund_id}</code> · Reason: {p.refund_reason || "False booking refund"}
                      </p>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {p.payment_status === "pending" && (
                      <button
                        className="approve-btn"
                        disabled={collectingId === p.payment_id}
                        onClick={() => handleMarkCollected(p.payment_id)}
                        style={{ minWidth: 150 }}
                      >
                        {collectingId === p.payment_id ? "Saving..." : "✓ Mark as Collected"}
                      </button>
                    )}

                    {p.payment_status === "completed" && (
                      <button
                        className="tab-btn small"
                        style={{
                          background: "rgba(244, 63, 94, 0.1)",
                          borderColor: "#fb7185",
                          color: "#fb7185",
                        }}
                        onClick={() => {
                          setRefundPaymentTarget(p);
                          setRefundReason("False booking / slot conflict");
                        }}
                      >
                        ↩️ Issue Refund / False Booking
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Owner Issue Refund / False Booking Modal */}
      {refundPaymentTarget && (
        <div className="payment-modal-backdrop" onClick={() => setRefundPaymentTarget(null)}>
          <div className="payment-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3 style={{ color: "#fb7185" }}>Issue Refund (False Booking)</h3>
              <button className="payment-modal-close" onClick={() => setRefundPaymentTarget(null)}>✕</button>
            </div>

            <div className="payment-summary">
              <div className="payment-summary-row">
                <span className="label">Customer</span>
                <span className="value">{refundPaymentTarget.user_name} ({refundPaymentTarget.user_email})</span>
              </div>
              <div className="payment-summary-row">
                <span className="label">Turf / Event</span>
                <span className="value">{refundPaymentTarget.turf_name || refundPaymentTarget.tournament_name}</span>
              </div>
              <div className="payment-summary-row">
                <span className="label">Refund Amount</span>
                <span className="value highlight" style={{ color: "#fb7185" }}>₹{refundPaymentTarget.amount}</span>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 8, fontWeight: 600 }}>
                Select Refund Reason:
              </label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 8,
                  background: "#0c0e14",
                  border: "1px solid var(--border)",
                  color: "#fff",
                }}
              >
                <option value="False booking / slot conflict">False booking / slot conflict</option>
                <option value="Duplicate booking charged in error">Duplicate booking charged in error</option>
                <option value="Customer requested cancellation">Customer requested cancellation</option>
                <option value="Turf maintenance / closed unexpectedly">Turf maintenance / closed unexpectedly</option>
                <option value="Weather disruption / rain">Weather disruption / rain</option>
              </select>
            </div>

            <div className="success-actions-row">
              <button
                className="payment-btn"
                style={{ background: "#e11d48" }}
                disabled={refunding}
                onClick={handleExecuteRefund}
              >
                {refunding ? "Processing Refund..." : `Confirm Full Refund of ₹${refundPaymentTarget.amount}`}
              </button>
              <button
                type="button"
                className="success-btn-secondary"
                onClick={() => setRefundPaymentTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}