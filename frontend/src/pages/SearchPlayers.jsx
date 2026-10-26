import { useState, useEffect, useCallback } from "react";
import api from "../api/axios";

export default function SearchPlayers() {
  const [players, setPlayers] = useState([]);
  const [myTeams, setMyTeams] = useState([]);
  const [filters, setFilters] = useState({ search: "", sport: "", position: "", skill_level: "", location: "" });
  const [selectedTeam, setSelectedTeam] = useState({});
  const [message, setMessage] = useState("");

  const fetchPlayers = useCallback(() => {
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    api.get("/players", { params }).then((res) => setPlayers(res.data.players || [])).catch(console.error);
  }, [filters]);

  useEffect(() => {
    fetchPlayers();
    api.get("/teams/mine").then((res) => setMyTeams(res.data.teams || [])).catch(console.error);
  }, [fetchPlayers]);

  function handleFilterChange(e) {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  }

  async function handleInvite(playerId) {
    const teamId = selectedTeam[playerId];
    if (!teamId) {
      alert("Select one of your teams first");
      return;
    }
    try {
      await api.post("/player-requests", { player_id: playerId, team_id: Number(teamId) });
      setMessage("Invite sent!");
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to send invite");
    }
  }

  return (
    <div className="page-container">
      <h2>Find Players</h2>
      {message && <p className="info-text">{message}</p>}

      <div className="search-bar" style={{ flexWrap: "wrap" }}>
        <input
          name="search"
          placeholder="Search by name or email..."
          value={filters.search}
          onChange={handleFilterChange}
          style={{ flexBasis: "100%" }}
        />
        <input name="sport" placeholder="Sport" value={filters.sport} onChange={handleFilterChange} />
        <input name="position" placeholder="Position" value={filters.position} onChange={handleFilterChange} />
        <select name="skill_level" value={filters.skill_level} onChange={handleFilterChange}>
          <option value="">Any skill level</option>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="pro">Pro</option>
        </select>
        <input name="location" placeholder="Location" value={filters.location} onChange={handleFilterChange} />
        <button onClick={fetchPlayers}>Search</button>
      </div>

      {players.length === 0 ? (
        <p className="muted-text">No available players match your filters.</p>
      ) : (
        <div className="turf-list">
          {players.map((p) => (
            <div key={p.id} className="turf-row">
              <div>
                <strong>{p.name}</strong>
                <p className="muted-text">{p.email}</p>
                <p className="muted-text">{p.sport} · {p.position || "—"} · {p.skill_level}</p>
                <p className="muted-text">{p.location || "Location not set"}</p>
              </div>
              {myTeams.length > 0 && (
                <div className="slot-inline-form">
                  <select
                    value={selectedTeam[p.id] || ""}
                    onChange={(e) => setSelectedTeam({ ...selectedTeam, [p.id]: e.target.value })}
                  >
                    <option value="">Invite to team...</option>
                    {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button onClick={() => handleInvite(p.id)}>Invite</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}