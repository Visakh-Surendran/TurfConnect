import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios";

export default function Tournaments() {
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    api.get("/tournaments").then((res) => setTournaments(res.data.tournaments)).catch(console.error);
  }, []);


  function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

  return (
    <div className="page-container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>Tournaments</h2>
        <Link to="/tournaments/new" className="header-btn-link">+ Create Tournament</Link>
      </div>

      {tournaments.length === 0 ? (
        <p className="muted-text">No tournaments yet.</p>
      ) : (
        <div className="turf-grid">
          {tournaments.map((t) => (
            <Link to={`/tournaments/${t.id}`} key={t.id} className="turf-card">
              <h3>{t.name}</h3>
              <p className="muted-text">{t.turf_name} · {t.location}</p>
              <p>{t.sport} · {t.format.replace("_", " ")}</p>
              <p className="muted-text">{formatDisplayDate(t.start_date)} → {formatDisplayDate(t.end_date)}</p>
              <p className="turf-price">{t.registered_count}/{t.max_teams} teams</p>
              <span className={`status-badge status-${t.status === "upcoming" ? "pending" : t.status === "ongoing" ? "approved" : "cancelled"}`}>
                {t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}