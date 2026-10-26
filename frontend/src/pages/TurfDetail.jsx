import { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import PaymentModal from "../components/PaymentModal";

const POPULAR_SPORTS = [
  { name: "Football", emoji: "⚽", defaultPrice: 800, peakPrice: 1000 },
  { name: "Cricket", emoji: "🏏", defaultPrice: 900, peakPrice: 1200 },
  { name: "Badminton", emoji: "🏸", defaultPrice: 600, peakPrice: 800 },
  { name: "Basketball", emoji: "🏀", defaultPrice: 700, peakPrice: 900 },
  { name: "Tennis", emoji: "🎾", defaultPrice: 800, peakPrice: 1000 },
  { name: "Volleyball", emoji: "🏐", defaultPrice: 600, peakPrice: 800 },
];

function getSportEmoji(sportName = "") {
  const s = sportName.toLowerCase();
  if (s.includes("foot") || s.includes("soccer")) return "⚽";
  if (s.includes("crick")) return "🏏";
  if (s.includes("badmin")) return "🏸";
  if (s.includes("basket")) return "🏀";
  if (s.includes("tenn")) return "🎾";
  if (s.includes("volley")) return "🏐";
  if (s.includes("table")) return "🏓";
  return "🎯";
}

function getAmenityIcon(amenity = "") {
  const a = amenity.toLowerCase();
  if (a.includes("washroom") || a.includes("shower") || a.includes("toilet")) return "🚿";
  if (a.includes("food") || a.includes("cafeteria") || a.includes("canteen")) return "🍽️";
  if (a.includes("park")) return "🅿️";
  if (a.includes("light") || a.includes("flood")) return "💡";
  if (a.includes("water")) return "💧";
  if (a.includes("lock")) return "🔒";
  if (a.includes("wifi")) return "📶";
  return "✨";
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function TurfDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [turf, setTurf] = useState(null);
  const [turfError, setTurfError] = useState("");
  const [date, setDate] = useState(() => formatDate(new Date()));
  const [slots, setSlots] = useState([]);
  const [loadingTurf, setLoadingTurf] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSport, setSelectedSport] = useState("Football");
  const [selectedSlotForPayment, setSelectedSlotForPayment] = useState(null);
  const [bookingSuccessInfo, setBookingSuccessInfo] = useState(null);
  const [timeFilter, setTimeFilter] = useState("all"); // "all" | "morning" | "afternoon" | "evening"

  // Load Turf details
  useEffect(() => {
    let isMounted = true;

    api
      .get(`/turfs/${id}`)
      .then((res) => {
        if (!isMounted) return;
        const loadedTurf = res.data.turf;
        setTurf(loadedTurf);

        // Pick preferred sport from loaded turf sports
        if (loadedTurf?.sports && loadedTurf.sports.length > 0) {
          const firstSport = loadedTurf.sports[0].sport_type?.trim();
          if (firstSport) {
            setSelectedSport(firstSport);
          }
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Error loading turf:", err);
        setTurfError(err.response?.data?.error || "Failed to load this turf");
      })
      .finally(() => {
        if (isMounted) setLoadingTurf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Load slots whenever turf, date, or selected sport changes
  useEffect(() => {
    if (!id || !date || !selectedSport) return;
    let isMounted = true;

    api
      .get(`/turfs/${id}/slots`, {
        params: { date, sport_type: selectedSport },
      })
      .then((res) => {
        if (isMounted) setSlots(res.data.slots || []);
      })
      .catch((err) => {
        console.error("Error loading slots:", err);
        if (isMounted) setSlots([]);
      })
      .finally(() => {
        if (isMounted) setLoadingSlots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id, date, selectedSport]);

  // Combine sports configured on the turf with standard available sports
  const availableSports = useMemo(() => {
    const list = [];
    const seen = new Set();

    // 1. Add sports configured in turf.sports
    if (turf?.sports && Array.isArray(turf.sports)) {
      turf.sports.forEach((s) => {
        const name = (s.sport_type || "").trim();
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          list.push({
            name,
            emoji: getSportEmoji(name),
            price: Number(s.price_per_hour),
            peakPrice: s.peak_price ? Number(s.peak_price) : null,
          });
        }
      });
    }

    // 2. Add standard popular sports if not already listed
    POPULAR_SPORTS.forEach((pop) => {
      if (!seen.has(pop.name.toLowerCase())) {
        list.push({
          name: pop.name,
          emoji: pop.emoji,
          price: pop.defaultPrice,
          peakPrice: pop.peakPrice,
        });
      }
    });

    return list;
  }, [turf]);

  // Quick date presets
  const datePresets = useMemo(() => {
    const now = new Date();
    const todayStr = formatDate(now);

    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    const tmrwStr = formatDate(tmrw);

    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = formatDate(dayAfter);

    return [
      { label: "Today", dateStr: todayStr, display: now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) },
      { label: "Tomorrow", dateStr: tmrwStr, display: tmrw.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) },
      { label: "Day After", dateStr: dayAfterStr, display: dayAfter.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) },
    ];
  }, []);

  // Filter slots by morning/afternoon/evening
  const filteredSlots = useMemo(() => {
    if (!slots || slots.length === 0) return [];
    return slots.filter((slot) => {
      const hour = parseInt(String(slot.start_time).slice(0, 2), 10);
      if (timeFilter === "morning") return hour >= 6 && hour < 12;
      if (timeFilter === "afternoon") return hour >= 12 && hour < 17;
      if (timeFilter === "evening") return hour >= 17;
      return true;
    });
  }, [slots, timeFilter]);

  // Open payment modal
  function handleInitiateBooking(slot) {
    if (!user) {
      navigate("/login");
      return;
    }
    setBookingSuccessInfo(null);
    setSelectedSlotForPayment({
      ...slot,
      sport_type: selectedSport,
    });
  }

  // Handle successful payment or Pay-at-venue
  function handlePaymentSuccess(booking, details) {
    const isPayAtVenue = details?.transaction_ref?.startsWith("VEN_");
    setBookingSuccessInfo({
      slot: selectedSlotForPayment,
      sport: selectedSport,
      date,
      booking,
      details,
      isPayAtVenue,
    });

    // Mark slot as booked in UI
    setSlots((prev) =>
      prev.map((s) => (s.id === selectedSlotForPayment?.id ? { ...s, status: "booked" } : s))
    );
    setSelectedSlotForPayment(null);
  }

  if (turfError) {
    return (
      <div className="page-container">
        <div className="payment-error-banner" style={{ margin: "30px 0" }}>
          <h3>⚠️ Unable to load turf</h3>
          <p>{turfError}</p>
        </div>
        <Link to="/turfs" className="tab-btn small">← Back to Turfs</Link>
      </div>
    );
  }

  if (loadingTurf || !turf) {
    return (
      <div className="page-container">
        <p className="muted-text" style={{ padding: "40px 0", textAlign: "center" }}>
          🏟️ Loading turf details and available slots...
        </p>
      </div>
    );
  }

  const amenitiesList = (turf.amenities || "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  return (
    <div className="page-container turf-booking-page">
      <Link to="/turfs" className="muted-text back-link">
        ← Back to Turfs
      </Link>

      {/* Turf Hero Card */}
      <div className="turf-hero-card">
        {turf.photo_url ? (
          <img src={turf.photo_url} alt={turf.name} className="turf-hero-image" />
        ) : (
          <div className="turf-hero-banner-placeholder">
            <span className="hero-emoji">🏟️</span>
          </div>
        )}

        <div className="turf-hero-content">
          <div className="turf-hero-header">
            <div>
              <h1 className="turf-hero-title">{turf.name}</h1>
              <p className="turf-hero-location">📍 {turf.location}</p>
            </div>
            <span className="status-badge status-approved">✓ Verified & Ready</span>
          </div>

          {/* Amenities Chips */}
          {amenitiesList.length > 0 && (
            <div className="amenities-container">
              {amenitiesList.map((am, idx) => (
                <span key={idx} className="amenity-chip">
                  <span>{getAmenityIcon(am)}</span>
                  <span>{am}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Booking Success Banner */}
      {bookingSuccessInfo && (
        <div className="booking-confirmed-card">
          <div className="confirmed-icon">🎉</div>
          <div className="confirmed-body">
            <h3>
              {bookingSuccessInfo.isPayAtVenue ? "Reservation Confirmed! (Pay at Turf)" : "Booking & Payment Confirmed!"}
            </h3>
            <p>
              You booked <strong>{bookingSuccessInfo.sport}</strong> on{" "}
              <strong>{bookingSuccessInfo.date}</strong> at{" "}
              <strong>
                {bookingSuccessInfo.slot?.start_time?.slice(0, 5)} - {bookingSuccessInfo.slot?.end_time?.slice(0, 5)}
              </strong>{" "}
              for <strong>₹{bookingSuccessInfo.slot?.price}</strong>.
            </p>
            {bookingSuccessInfo.details?.transaction_ref && (
              <p className="confirmed-ref">
                Reference ID: <code>{bookingSuccessInfo.details.transaction_ref}</code>
              </p>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <Link to="/my-bookings" className="tab-btn small active">
                🎟️ View My Bookings
              </Link>
              <button
                className="tab-btn small"
                onClick={() => setBookingSuccessInfo(null)}
              >
                + Book Another Slot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 1: Select Sport */}
      <section className="booking-step-section">
        <div className="step-header">
          <span className="step-number">1</span>
          <div>
            <h3>Select Sport</h3>
            <p className="step-sub">Pick any sport to load customized hourly rates and availability</p>
          </div>
        </div>

        <div className="sports-pills-grid">
          {availableSports.map((sport) => {
            const isSelected = selectedSport.toLowerCase() === sport.name.toLowerCase();
            return (
              <div
                key={sport.name}
                className={`sport-select-card ${isSelected ? "selected" : ""}`}
                onClick={() => {
                  setSelectedSport(sport.name);
                  setBookingSuccessInfo(null);
                }}
              >
                <span className="sport-emoji">{sport.emoji}</span>
                <div className="sport-info">
                  <strong className="sport-name">{sport.name}</strong>
                  <span className="sport-rate">
                    ₹{sport.price}/hr
                    {sport.peakPrice ? <small className="peak-hint"> · peak ₹{sport.peakPrice}</small> : null}
                  </span>
                </div>
                {isSelected && <span className="sport-check">✓</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* STEP 2: Select Date */}
      <section className="booking-step-section">
        <div className="step-header">
          <span className="step-number">2</span>
          <div>
            <h3>Select Date</h3>
            <p className="step-sub">Pick a day to view real-time available time slots</p>
          </div>
        </div>

        <div className="date-selection-row">
          <div className="date-presets-group">
            {datePresets.map((preset) => {
              const isSelected = date === preset.dateStr;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`date-preset-btn ${isSelected ? "active" : ""}`}
                  onClick={() => {
                    setDate(preset.dateStr);
                    setBookingSuccessInfo(null);
                  }}
                >
                  <span className="preset-label">{preset.label}</span>
                  <span className="preset-date">{preset.display}</span>
                </button>
              );
            })}
          </div>

          <div className="custom-date-box">
            <label htmlFor="custom-date-input">Or Pick Date:</label>
            <input
              id="custom-date-input"
              type="date"
              value={date}
              min={formatDate(new Date())}
              onChange={(e) => {
                setDate(e.target.value);
                setBookingSuccessInfo(null);
              }}
              className="custom-date-picker"
            />
          </div>
        </div>
      </section>

      {/* STEP 3: Choose Time Slot */}
      <section className="booking-step-section">
        <div className="step-header" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="step-number">3</span>
            <div>
              <h3>Choose a Time Slot</h3>
              <p className="step-sub">
                Click any available slot to book and pay instantly for <strong>{selectedSport}</strong>
              </p>
            </div>
          </div>

          {/* Time of Day Filters */}
          <div className="time-filters-pills">
            <button
              className={`time-pill ${timeFilter === "all" ? "active" : ""}`}
              onClick={() => setTimeFilter("all")}
            >
              All Slots ({slots.length})
            </button>
            <button
              className={`time-pill ${timeFilter === "morning" ? "active" : ""}`}
              onClick={() => setTimeFilter("morning")}
            >
              🌅 Morning
            </button>
            <button
              className={`time-pill ${timeFilter === "afternoon" ? "active" : ""}`}
              onClick={() => setTimeFilter("afternoon")}
            >
              ☀️ Afternoon
            </button>
            <button
              className={`time-pill ${timeFilter === "evening" ? "active" : ""}`}
              onClick={() => setTimeFilter("evening")}
            >
              🌙 Evening (Peak)
            </button>
          </div>
        </div>

        {/* Slot Cards Grid */}
        {loadingSlots ? (
          <div className="slots-loading-state">
            <p>⚡ Fetching real-time slot availability for {date}...</p>
          </div>
        ) : filteredSlots.length === 0 ? (
          <div className="slots-empty-state">
            <p>No slots found for this time filter. Try selecting "All Slots".</p>
          </div>
        ) : (
          <div className="slots-modern-grid">
            {filteredSlots.map((slot) => {
              const isAvailable = slot.status === "available";
              const startHour = parseInt(String(slot.start_time).slice(0, 2), 10);
              const isPeak = startHour >= 18;

              return (
                <div
                  key={slot.id}
                  className={`modern-slot-card ${isAvailable ? "available" : "booked"}`}
                  onClick={() => isAvailable && handleInitiateBooking(slot)}
                >
                  <div className="slot-card-top">
                    <span className="slot-time-range">
                      {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                    </span>
                    {isPeak && isAvailable && <span className="peak-badge">🔥 Peak</span>}
                  </div>

                  <div className="slot-card-middle">
                    <span className="slot-sport-tag">
                      {getSportEmoji(selectedSport)} {selectedSport}
                    </span>
                    <strong className="slot-price-tag">₹{slot.price}</strong>
                  </div>

                  <button
                    type="button"
                    className={`slot-action-btn ${isAvailable ? "btn-available" : "btn-booked"}`}
                    disabled={!isAvailable}
                  >
                    {isAvailable ? "⚡ Book & Pay" : "🔒 Booked"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={Boolean(selectedSlotForPayment)}
        onClose={() => setSelectedSlotForPayment(null)}
        slot={selectedSlotForPayment}
        turf={turf}
        user={user}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}