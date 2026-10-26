import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";

// Helper to format ISO date to YYYY-MM-DD
function toDateInputValue(date) {
  if (!date) return "";
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Format readable date
function formatDisplayDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const parts = dateStr.split("T")[0].split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString("en-IN", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

// Format 24hr time to 12hr AM/PM
function formatTime12(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  let hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${ampm}`;
}

export default function BookingRevenueReport({ role = "owner", turfName = null }) {
  const [activeReportTab, setActiveReportTab] = useState("daily"); // "daily" | "bookings"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [datePreset, setDatePreset] = useState("all"); // "all" | "today" | "yesterday" | "last7" | "thisMonth" | "single" | "custom"
  const [singleDate, setSingleDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dateType, setDateType] = useState("slot_date"); // "slot_date" | "booking_date"
  const [turfId, setTurfId] = useState("all");
  const [sport, setSport] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  // Report Data
  const [reportData, setReportData] = useState({
    summary: {
      totalBookings: 0,
      confirmedBookings: 0,
      cancelledBookings: 0,
      totalGrossRevenue: 0,
      totalRefunded: 0,
      totalNetRevenue: 0,
      totalPendingRevenue: 0,
      onlineRevenue: 0,
      cashRevenue: 0,
      avgBookingValue: "0.00",
      uniqueCustomers: 0,
      turfsCount: 0,
    },
    daily: [],
    bookings: [],
    filterOptions: {
      turfs: [],
      sports: [],
    },
  });

  // Calculate preset dates
  function applyDatePreset(preset) {
    setDatePreset(preset);
    const today = new Date();

    if (preset === "all") {
      setSingleDate("");
      setStartDate("");
      setEndDate("");
    } else if (preset === "today") {
      const tStr = toDateInputValue(today);
      setSingleDate(tStr);
      setStartDate("");
      setEndDate("");
    } else if (preset === "yesterday") {
      const yDate = new Date();
      yDate.setDate(yDate.getDate() - 1);
      const yStr = toDateInputValue(yDate);
      setSingleDate(yStr);
      setStartDate("");
      setEndDate("");
    } else if (preset === "last7") {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 6);
      setSingleDate("");
      setStartDate(toDateInputValue(past7));
      setEndDate(toDateInputValue(today));
    } else if (preset === "thisMonth") {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setSingleDate("");
      setStartDate(toDateInputValue(firstOfMonth));
      setEndDate(toDateInputValue(today));
    } else if (preset === "single") {
      if (!singleDate) setSingleDate(toDateInputValue(today));
      setStartDate("");
      setEndDate("");
    } else if (preset === "custom") {
      setSingleDate("");
      if (!startDate) setStartDate(toDateInputValue(today));
      if (!endDate) setEndDate(toDateInputValue(today));
    }
  }

  // Fetch Report Data from Backend API
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        dateType,
        turfId,
        sport,
        status,
        search: search.trim(),
      };

      if (datePreset === "single" || singleDate) {
        if (singleDate) params.singleDate = singleDate;
      } else {
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
      }

      const res = await api.get("/reports/bookings", { params });
      setReportData(res.data);
    } catch (err) {
      console.error("Report fetch error:", err);
      setError(err.response?.data?.error || "Failed to load booking revenue report.");
    } finally {
      setLoading(false);
    }
  }, [dateType, turfId, sport, status, search, datePreset, singleDate, startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Reset all filters to view all dates irrespective of bounds
  function handleResetFilters() {
    setDatePreset("all");
    setSingleDate("");
    setStartDate("");
    setEndDate("");
    setDateType("slot_date");
    setTurfId("all");
    setSport("all");
    setStatus("all");
    setSearch("");
  }

  // Drill down from a daily summary row to see individual bookings for that day
  function handleDrillDownDay(dateStr) {
    setSingleDate(dateStr);
    setDatePreset("single");
    setStartDate("");
    setEndDate("");
    setActiveReportTab("bookings");
  }

  // CSV Export for Daily Report
  function exportDailyCSV() {
    if (!reportData.daily || reportData.daily.length === 0) {
      alert("No daily report data available to export.");
      return;
    }

    const headers = [
      "Date",
      "Total Bookings",
      "Confirmed Bookings",
      "Cancelled Bookings",
      "Gross Revenue (INR)",
      "Refunded Amount (INR)",
      "Net Revenue (INR)",
      "Pending Cash (INR)",
      "Online Revenue (INR)",
      "Cash Revenue (INR)",
    ];

    const rows = reportData.daily.map((d) => [
      d.date,
      d.totalBookings,
      d.confirmedBookings,
      d.cancelledBookings,
      d.grossRevenue.toFixed(2),
      d.refundedAmount.toFixed(2),
      d.netRevenue.toFixed(2),
      d.pendingRevenue.toFixed(2),
      d.onlineRevenue.toFixed(2),
      d.cashRevenue.toFixed(2),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((val) => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `daily_booking_revenue_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // CSV Export for Detailed Bookings Report
  function exportBookingsCSV() {
    if (!reportData.bookings || reportData.bookings.length === 0) {
      alert("No booking data available to export.");
      return;
    }

    const headers = [
      "Booking ID",
      "Turf Name",
      "Turf Location",
      "Sport",
      "Slot Date",
      "Slot Start",
      "Slot End",
      "Booking Created At",
      "Customer Name",
      "Customer Email",
      "Customer Phone",
      "Booking Status",
      "Payment Status",
      "Payment Method",
      "Gross Amount (INR)",
      "Refund Amount (INR)",
      "Net Revenue (INR)",
      "Pending Amount (INR)",
      "Transaction Ref",
      "Refund ID",
      "Cancellation / Refund Reason",
    ];

    const rows = reportData.bookings.map((b) => [
      b.booking_id,
      b.turf_name,
      b.turf_location,
      b.sport_type,
      b.slot_date,
      b.start_time,
      b.end_time,
      b.booking_created_at ? new Date(b.booking_created_at).toLocaleString("en-IN") : "",
      b.customer_name,
      b.customer_email,
      b.customer_phone || "",
      b.booking_status,
      b.payment_status,
      b.payment_method === "pay_at_venue" ? "Pay at Venue (Cash)" : "Online (Razorpay)",
      b.gross_revenue.toFixed(2),
      b.refund_amount.toFixed(2),
      b.net_revenue.toFixed(2),
      b.pending_amount.toFixed(2),
      b.transaction_ref || "",
      b.refund_id || "",
      b.cancellation_reason || b.refund_reason || "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.map((val) => `"${val}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `bookings_revenue_details_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Trigger Print Report
  function handlePrintReport() {
    window.print();
  }

  const { summary, daily, bookings, filterOptions } = reportData;

  // Active filter label description
  let filterDescription = "All dates (All-time)";
  if (datePreset === "today") filterDescription = `Today (${singleDate})`;
  else if (datePreset === "yesterday") filterDescription = `Yesterday (${singleDate})`;
  else if (datePreset === "single" && singleDate) filterDescription = `Exact Date: ${singleDate}`;
  else if (startDate && endDate) filterDescription = `Date Range: ${startDate} to ${endDate}`;
  else if (startDate) filterDescription = `From: ${startDate}`;
  else if (endDate) filterDescription = `To: ${endDate}`;

  return (
    <div className="report-container">
      {/* Printable Report Header (visible only when printing) */}
      <div className="printable-report-header">
        <div className="print-brand">
          <h1>⚽ TurfConnect — {role === "admin" ? "Platform Admin" : "Turf Owner"} Booking & Revenue Report</h1>
          <p className="print-meta">
            Generated on: {new Date().toLocaleString("en-IN", { dateStyle: "full", timeStyle: "medium" })} · Scope: {filterDescription}
            {turfId !== "all" && ` · Turf ID: ${turfId}`}
            {sport !== "all" && ` · Sport: ${sport}`}
          </p>
        </div>
      </div>

      {/* Top Header Card */}
      <div className="report-header-card no-print">
        <div className="report-header-info">
          <div className="report-title-badge">
            <span className="badge-icon">📊</span>
            <span>{role === "admin" ? "Platform Management" : "Turf Analytics"}</span>
          </div>
          <h2 className="report-title">
            {role === "admin" ? "Admin Booking & Revenue Report" : "Daily Booking & Revenue Report"}
          </h2>
          <p className="report-subtitle">
            Generate, filter, and export daily booking histories and revenue collected for each booking across all dates.
          </p>
        </div>

        <div className="report-actions-row">
          <button
            type="button"
            className="report-action-btn secondary"
            onClick={exportDailyCSV}
            title="Download daily history as CSV"
          >
            📥 Export Daily CSV
          </button>
          <button
            type="button"
            className="report-action-btn secondary"
            onClick={exportBookingsCSV}
            title="Download detailed bookings list as CSV"
          >
            📥 Export Bookings CSV
          </button>
          <button
            type="button"
            className="report-action-btn primary"
            onClick={handlePrintReport}
            title="Print or Save as PDF"
          >
            🖨️ Print / Save PDF
          </button>
        </div>
      </div>

      {/* Filter Control Center */}
      <div className="report-filter-panel no-print">
        {/* Preset Date Selector Chips */}
        <div className="filter-presets-section">
          <span className="filter-label">Quick Date Ranges:</span>
          <div className="preset-chips-list">
            <button
              type="button"
              className={`preset-chip ${datePreset === "all" ? "active" : ""}`}
              onClick={() => applyDatePreset("all")}
            >
              🌐 All Dates (Irrespective)
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "today" ? "active" : ""}`}
              onClick={() => applyDatePreset("today")}
            >
              📅 Today
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "yesterday" ? "active" : ""}`}
              onClick={() => applyDatePreset("yesterday")}
            >
              ⏮️ Yesterday
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "last7" ? "active" : ""}`}
              onClick={() => applyDatePreset("last7")}
            >
              7️⃣ Last 7 Days
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "thisMonth" ? "active" : ""}`}
              onClick={() => applyDatePreset("thisMonth")}
            >
              🗓️ This Month
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "single" ? "active" : ""}`}
              onClick={() => applyDatePreset("single")}
            >
              🎯 Single Exact Date
            </button>
            <button
              type="button"
              className={`preset-chip ${datePreset === "custom" ? "active" : ""}`}
              onClick={() => applyDatePreset("custom")}
            >
              ↔️ Custom Date Range (From - To)
            </button>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="filter-inputs-grid">
          {/* Conditional Date Pickers based on preset */}
          {datePreset === "single" && (
            <div className="filter-group">
              <label htmlFor="report-single-date">Search Specific Date:</label>
              <input
                id="report-single-date"
                type="date"
                className="filter-control"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
              />
            </div>
          )}

          {datePreset === "custom" && (
            <>
              <div className="filter-group">
                <label htmlFor="report-from-date">From Date:</label>
                <input
                  id="report-from-date"
                  type="date"
                  className="filter-control"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label htmlFor="report-to-date">To Date:</label>
                <input
                  id="report-to-date"
                  type="date"
                  className="filter-control"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Date Basis Filter */}
          <div className="filter-group">
            <label htmlFor="report-date-type">Date Basis:</label>
            <select
              id="report-date-type"
              className="filter-control"
              value={dateType}
              onChange={(e) => setDateType(e.target.value)}
            >
              <option value="slot_date">Slot / Match Day (Scheduled)</option>
              <option value="booking_date">Booking Date (Transaction)</option>
            </select>
          </div>

          {/* Turf Filter */}
          <div className="filter-group">
            <label htmlFor="report-turf">Turf Facility:</label>
            <select
              id="report-turf"
              className="filter-control"
              value={turfId}
              onChange={(e) => setTurfId(e.target.value)}
            >
              <option value="all">
                {role === "admin" ? "🏢 All Turfs (Platform-wide)" : "🏟️ All My Turfs"}
              </option>
              {(filterOptions.turfs || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.location ? `(${t.location})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Sport Filter */}
          <div className="filter-group">
            <label htmlFor="report-sport">Sport Type:</label>
            <select
              id="report-sport"
              className="filter-control"
              value={sport}
              onChange={(e) => setSport(e.target.value)}
            >
              <option value="all">⚡ All Sports</option>
              {(filterOptions.sports || []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-group">
            <label htmlFor="report-status">Booking / Payment Status:</label>
            <select
              id="report-status"
              className="filter-control"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed Bookings</option>
              <option value="cancelled">Cancelled Bookings</option>
              <option value="completed">✓ Paid / Completed Revenue</option>
              <option value="pending">⏳ Pending Cash (Pay at Turf)</option>
              <option value="refunded">↩️ Refunded</option>
            </select>
          </div>

          {/* Search Keyword */}
          <div className="filter-group search-group">
            <label htmlFor="report-search">Search Keyword:</label>
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                id="report-search"
                type="text"
                className="filter-control search-input"
                placeholder="Customer, email, phone, turf, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch("")}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Action Status Row */}
        <div className="filter-status-row">
          <div className="active-filters-summary">
            <span className="status-dot"></span>
            <span>
              Active Scope: <strong>{filterDescription}</strong>
              {turfId !== "all" && (
                <> · Turf: <strong>{(filterOptions.turfs || []).find((t) => String(t.id) === String(turfId))?.name || turfId}</strong></>
              )}
              {sport !== "all" && <> · Sport: <strong>{sport}</strong></>}
              {status !== "all" && <> · Status: <strong>{status}</strong></>}
              {search && <> · Query: &ldquo;<strong>{search}</strong>&rdquo;</>}
            </span>
          </div>

          <button
            type="button"
            className="filter-reset-link"
            onClick={handleResetFilters}
          >
            ↻ Reset All Filters
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="report-error-banner">
          <span>⚠️ {error}</span>
          <button type="button" onClick={fetchReport}>Retry</button>
        </div>
      )}

      {/* Summary KPI Cards Grid */}
      <div className="report-kpi-grid">
        <div className="kpi-card revenue-collected">
          <div className="kpi-card-header">
            <span className="kpi-title">💰 Total Gross Revenue</span>
            <span className="kpi-icon">₹</span>
          </div>
          <div className="kpi-value">₹{summary.totalGrossRevenue.toLocaleString("en-IN")}</div>
          <div className="kpi-meta">
            From {summary.confirmedBookings} confirmed bookings
          </div>
        </div>

        <div className="kpi-card net-revenue">
          <div className="kpi-card-header">
            <span className="kpi-title">📈 Net Revenue Collected</span>
            <span className="kpi-icon">🏷️</span>
          </div>
          <div className="kpi-value highlight-green">
            ₹{summary.totalNetRevenue.toLocaleString("en-IN")}
          </div>
          <div className="kpi-meta">
            After ₹{summary.totalRefunded.toLocaleString("en-IN")} refunds
          </div>
        </div>

        <div className="kpi-card pending-revenue">
          <div className="kpi-card-header">
            <span className="kpi-title">⏳ Pay at Turf (Pending)</span>
            <span className="kpi-icon">💵</span>
          </div>
          <div className="kpi-value highlight-yellow">
            ₹{summary.totalPendingRevenue.toLocaleString("en-IN")}
          </div>
          <div className="kpi-meta">
            Cash to collect at venue
          </div>
        </div>

        <div className="kpi-card total-bookings">
          <div className="kpi-card-header">
            <span className="kpi-title">📦 Total Bookings</span>
            <span className="kpi-icon">⚽</span>
          </div>
          <div className="kpi-value">{summary.totalBookings}</div>
          <div className="kpi-meta">
            <span style={{ color: "#4ade80" }}>{summary.confirmedBookings} active</span> ·{" "}
            <span style={{ color: "#fb7185" }}>{summary.cancelledBookings} cancelled</span>
          </div>
        </div>

        <div className="kpi-card avg-value">
          <div className="kpi-card-header">
            <span className="kpi-title">📊 Avg. Booking Value</span>
            <span className="kpi-icon">💎</span>
          </div>
          <div className="kpi-value">₹{summary.avgBookingValue}</div>
          <div className="kpi-meta">
            Across {summary.uniqueCustomers} unique customers
          </div>
        </div>

        <div className="kpi-card payment-channels">
          <div className="kpi-card-header">
            <span className="kpi-title">💳 Revenue Channels</span>
            <span className="kpi-icon">⚡</span>
          </div>
          <div className="kpi-channel-row">
            <span>Online: <strong>₹{summary.onlineRevenue.toLocaleString("en-IN")}</strong></span>
            <span>Cash: <strong>₹{summary.cashRevenue.toLocaleString("en-IN")}</strong></span>
          </div>
          <div className="kpi-meta">
            {role === "admin" && `${summary.turfsCount} turfs active in period`}
          </div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div className="report-view-tabs no-print">
        <button
          type="button"
          className={`report-tab-btn ${activeReportTab === "daily" ? "active" : ""}`}
          onClick={() => setActiveReportTab("daily")}
        >
          📅 Daily Booking & Revenue History ({daily.length} dates)
        </button>
        <button
          type="button"
          className={`report-tab-btn ${activeReportTab === "bookings" ? "active" : ""}`}
          onClick={() => setActiveReportTab("bookings")}
        >
          📋 Individual Bookings & Revenue Detail ({bookings.length} records)
        </button>
      </div>

      {/* Loading Overlay */}
      {loading ? (
        <div className="report-loading-container">
          <div className="report-spinner"></div>
          <p>Generating report and aggregating revenue data...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: DAILY AGGREGATE REPORT */}
          {activeReportTab === "daily" && (
            <div className="report-table-section">
              <div className="section-header-row">
                <h3 className="section-heading">
                  Daily Booking History & Revenue Aggregations
                </h3>
                <span className="section-badge">{daily.length} Dates Found</span>
              </div>

              {daily.length === 0 ? (
                <div className="report-empty-state">
                  <div className="empty-icon">📅</div>
                  <h4>No Daily Records Found</h4>
                  <p>No bookings or revenue records match your specified dates and criteria.</p>
                  <button type="button" className="tab-btn small" onClick={handleResetFilters}>
                    Clear Filters & View All Dates
                  </button>
                </div>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Daily Booking History and Revenue Table"
                  className="responsive-table-wrapper"
                >
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Bookings Count</th>
                        <th>Confirmed</th>
                        <th>Cancelled</th>
                        <th>Gross Revenue Collected</th>
                        <th>Refunds</th>
                        <th>Net Revenue</th>
                        <th>Pending Cash</th>
                        <th>Payment Split</th>
                        <th className="no-print">Drill-Down</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((day) => (
                        <tr key={day.date}>
                          <td className="bold-cell">
                            <div>{formatDisplayDate(day.date)}</div>
                            <span className="sub-text">{day.date}</span>
                          </td>
                          <td>
                            <span className="metric-pill count-pill">{day.totalBookings}</span>
                          </td>
                          <td>
                            <span className="metric-pill success-pill">{day.confirmedBookings}</span>
                          </td>
                          <td>
                            <span className="metric-pill danger-pill">{day.cancelledBookings}</span>
                          </td>
                          <td className="amount-cell gross">
                            ₹{day.grossRevenue.toLocaleString("en-IN")}
                          </td>
                          <td className="amount-cell refund">
                            {day.refundedAmount > 0 ? `-₹${day.refundedAmount.toLocaleString("en-IN")}` : "₹0"}
                          </td>
                          <td className="amount-cell net bold-cell">
                            ₹{day.netRevenue.toLocaleString("en-IN")}
                          </td>
                          <td className="amount-cell pending">
                            {day.pendingRevenue > 0 ? `₹${day.pendingRevenue.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="split-cell">
                            <div className="split-badge online">
                              ⚡ ₹{day.onlineRevenue}
                            </div>
                            <div className="split-badge cash">
                              💵 ₹{day.cashRevenue}
                            </div>
                          </td>
                          <td className="no-print action-cell">
                            <button
                              type="button"
                              className="drilldown-btn"
                              onClick={() => handleDrillDownDay(day.date)}
                              title="View all individual bookings for this day"
                            >
                              View Bookings ➔
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="table-total-row">
                        <th>Total ({daily.length} days)</th>
                        <th>{summary.totalBookings}</th>
                        <th>{summary.confirmedBookings}</th>
                        <th>{summary.cancelledBookings}</th>
                        <th className="amount-cell gross">₹{summary.totalGrossRevenue.toLocaleString("en-IN")}</th>
                        <th className="amount-cell refund">-₹{summary.totalRefunded.toLocaleString("en-IN")}</th>
                        <th className="amount-cell net bold-cell">₹{summary.totalNetRevenue.toLocaleString("en-IN")}</th>
                        <th className="amount-cell pending">₹{summary.totalPendingRevenue.toLocaleString("en-IN")}</th>
                        <th>⚡ ₹{summary.onlineRevenue} | 💵 ₹{summary.cashRevenue}</th>
                        <th className="no-print"></th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INDIVIDUAL BOOKINGS REVENUE DETAIL */}
          {activeReportTab === "bookings" && (
            <div className="report-table-section">
              <div className="section-header-row">
                <h3 className="section-heading">
                  Revenue Collected in Each Booking
                </h3>
                <span className="section-badge">{bookings.length} Bookings</span>
              </div>

              {bookings.length === 0 ? (
                <div className="report-empty-state">
                  <div className="empty-icon">📋</div>
                  <h4>No Individual Bookings Found</h4>
                  <p>No bookings match the applied date range or search keyword.</p>
                  <button type="button" className="tab-btn small" onClick={handleResetFilters}>
                    Clear Filters & View All Dates
                  </button>
                </div>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-label="Individual Bookings and Revenue Detail Table"
                  className="responsive-table-wrapper"
                >
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Booking ID</th>
                        <th>Turf & Sport</th>
                        <th>Slot Schedule</th>
                        <th>Customer Details</th>
                        <th>Booking Status</th>
                        <th>Payment Mode</th>
                        <th>Payment Status</th>
                        <th>Amount Collected</th>
                        <th>Refund</th>
                        <th>Net Revenue</th>
                        <th>Reference / Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b) => (
                        <tr key={b.booking_id}>
                          <td className="bold-cell">
                            #{b.booking_id}
                            <div className="sub-text">
                              {b.booking_created_at
                                ? new Date(b.booking_created_at).toLocaleDateString("en-IN", {
                                    month: "short",
                                    day: "numeric",
                                  })
                                : ""}
                            </div>
                          </td>
                          <td>
                            <div className="bold-cell">{b.turf_name}</div>
                            <span className="sub-text">
                              {b.sport_type} · {b.turf_location}
                            </span>
                          </td>
                          <td>
                            <div className="bold-cell">{formatDisplayDate(b.slot_date)}</div>
                            <span className="sub-text">
                              {formatTime12(b.start_time)} - {formatTime12(b.end_time)}
                            </span>
                          </td>
                          <td>
                            <div className="customer-name">{b.customer_name}</div>
                            <div className="sub-text">{b.customer_email}</div>
                            {b.customer_phone && (
                              <div className="sub-text phone-text">📞 {b.customer_phone}</div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                b.booking_status === "confirmed" ? "confirmed" : "cancelled"
                              }`}
                            >
                              {b.booking_status === "confirmed" ? "✓ Confirmed" : "✕ Cancelled"}
                            </span>
                          </td>
                          <td>
                            <span className="payment-method-badge">
                              {b.payment_method === "pay_at_venue" ? "💵 Cash (Turf)" : "⚡ Razorpay"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`payment-status-pill ${
                                b.payment_status === "completed"
                                  ? "completed"
                                  : b.payment_status === "refunded"
                                  ? "refunded"
                                  : "pending"
                              }`}
                            >
                              {b.payment_status === "completed"
                                ? "✓ Paid"
                                : b.payment_status === "refunded"
                                ? "↩️ Refunded"
                                : "⏳ Pending Cash"}
                            </span>
                          </td>
                          <td className="amount-cell gross">
                            ₹{b.gross_revenue.toLocaleString("en-IN")}
                          </td>
                          <td className="amount-cell refund">
                            {b.refund_amount > 0 ? `-₹${b.refund_amount.toLocaleString("en-IN")}` : "—"}
                          </td>
                          <td className="amount-cell net bold-cell">
                            ₹{b.net_revenue.toLocaleString("en-IN")}
                          </td>
                          <td className="notes-cell">
                            {b.transaction_ref && (
                              <div className="ref-tag" title={b.transaction_ref}>
                                Ref: <code>{b.transaction_ref.slice(-12)}</code>
                              </div>
                            )}
                            {b.refund_id && (
                              <div className="refund-tag" title={b.refund_reason || "Refund issued"}>
                                ↩️ {b.refund_id.slice(-10)}
                              </div>
                            )}
                            {b.cancellation_reason && (
                              <div className="cancel-note">
                                {b.cancellation_reason}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="table-total-row">
                        <th colSpan={7}>Total ({bookings.length} bookings)</th>
                        <th className="amount-cell gross">₹{summary.totalGrossRevenue.toLocaleString("en-IN")}</th>
                        <th className="amount-cell refund">-₹{summary.totalRefunded.toLocaleString("en-IN")}</th>
                        <th className="amount-cell net bold-cell">₹{summary.totalNetRevenue.toLocaleString("en-IN")}</th>
                        <th></th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
