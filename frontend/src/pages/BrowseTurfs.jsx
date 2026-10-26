import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function BrowseTurfs() {
  const [turfs, setTurfs] = useState([]);
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);

  async function fetchTurfs(loc = "") {
    setLoading(true);
    try {
      const res = await api.get("/turfs", { params: loc ? { location: loc } : {} });
      setTurfs(res.data.turfs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    api
      .get("/turfs")
      .then((res) => {
        if (isMounted) setTurfs(res.data.turfs || []);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    fetchTurfs(location);
  }

  return (
    <div className="page-container">
      <div style={{ marginBottom: 20 }}>
        <h2>Available Turfs</h2>
        <p className="muted-text">Explore and book available slots at top turfs near you.</p>
      </div>

      <form onSubmit={handleSearch} className="search-bar" style={{ marginBottom: 28 }}>
        <input
          placeholder="Search by location (e.g. Kochi, Pattambi, Malampuzha)..."
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
        <button type="submit">Search</button>
      </form>

      {loading ? (
        <p>Loading turfs...</p>
      ) : turfs.length === 0 ? (
        <p className="muted-text">No turfs found for this location.</p>
      ) : (
        <div className="turf-grid">
          {turfs.map((turf) => (
            <div key={turf.id} className="turf-card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                {turf.photo_url ? (
                  <img
                    src={turf.photo_url}
                    alt={turf.name}
                    style={{
                      width: "100%",
                      height: 140,
                      objectFit: "cover",
                      borderRadius: 8,
                      marginBottom: 12,
                    }}
                    onError={(e) => (e.target.style.display = "none")}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: 110,
                      background: "linear-gradient(135deg, rgba(124, 58, 237, 0.2), rgba(16, 185, 129, 0.1))",
                      border: "1px dashed var(--border)",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 32,
                      marginBottom: 12,
                    }}
                  >
                    ⚽
                  </div>
                )}

                <h3 style={{ margin: "0 0 4px 0", fontSize: 18 }}>{turf.name}</h3>
                <p className="muted-text" style={{ margin: "0 0 10px 0", fontSize: 13 }}>
                  📍 {turf.location}
                </p>

                {/* Sports tags */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                  {turf.sports && turf.sports.length > 0 ? (
                    turf.sports.map((sp, idx) => (
                      <span
                        key={idx}
                        className="status-badge"
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          background: "rgba(124, 58, 237, 0.15)",
                          color: "var(--violet-light)",
                          border: "1px solid rgba(124, 58, 237, 0.4)",
                        }}
                      >
                        {sp}
                      </span>
                    ))
                  ) : (
                    <span className="muted-text" style={{ fontSize: "12px" }}>General Sports</span>
                  )}
                </div>
              </div>

              {/* Price & Book Button */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: 14,
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Hourly Rate</span>
                  <strong style={{ color: "#4ade80", fontSize: "16px" }}>
                    {turf.starting_price ? `₹${turf.starting_price}/hr` : "Rates inside"}
                  </strong>
                </div>

                <Link
                  to={`/turfs/${turf.id}`}
                  style={{
                    background: "var(--violet)",
                    color: "white",
                    textDecoration: "none",
                    padding: "8px 16px",
                    borderRadius: 8,
                    fontSize: "13px",
                    fontWeight: 600,
                    boxShadow: "0 2px 8px var(--violet-glow)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    transition: "transform 0.15s, background 0.15s",
                  }}
                >
                  ⚡ Book Slot
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}