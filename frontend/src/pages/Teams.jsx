import { useState, useEffect } from "react";
import api from "../api/axios";

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ name: "", sport: "" });
  const [message, setMessage] = useState("");
  const [activeTeam, setActiveTeam] = useState(null);
  const [roster, setRoster] = useState({});
  const [emailInput, setEmailInput] = useState({});

  function fetchTeams() {
    api.get("/teams/mine").then((res) => setTeams(res.data.teams)).catch(console.error);
  }

  useEffect(() => { fetchTeams(); }, []);

  async function handleCreateTeam(e) {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/teams", form);
      setMessage("Team created!");
      setForm({ name: "", sport: "" });
      fetchTeams();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to create team");
    }
  }

  function toggleRoster(teamId) {
    if (activeTeam === teamId) {
      setActiveTeam(null);
    } else {
      setActiveTeam(teamId);
      api.get(`/teams/${teamId}`).then((res) =>
        setRoster((prev) => ({ ...prev, [teamId]: res.data.team.players }))
      );
    }
  }

  async function handleAddPlayer(teamId) {
    const email = emailInput[teamId];
    if (!email) return;
    try {
      await api.post(`/teams/${teamId}/players`, { email });
      const res = await api.get(`/teams/${teamId}`);
      setRoster((prev) => ({ ...prev, [teamId]: res.data.team.players }));
      setEmailInput({ ...emailInput, [teamId]: "" });
    } catch (err) {
      alert(err.response?.data?.error || "Failed to add player");
    }
  }

  return (
    <div className="page-container">
      <h2>My Teams</h2>

      <div className="form-card">
        <h3>Create a Team</h3>
        {message && <p className="info-text">{message}</p>}
        <form onSubmit={handleCreateTeam}>
          <input
            placeholder="Team name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <input
            placeholder="Sport (e.g. football)"
            value={form.sport}
            onChange={(e) => setForm({ ...form, sport: e.target.value })}
            required
          />
          <button type="submit">Create Team</button>
        </form>
      </div>

      <div className="turf-list">
        {teams.length === 0 && <p className="muted-text">You haven't created any teams yet.</p>}
        {teams.map((team) => (
          <div key={team.id} className="turf-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <strong>{team.name}</strong>
                <p className="muted-text">{team.sport}</p>
              </div>
              <button onClick={() => toggleRoster(team.id)}>
                {activeTeam === team.id ? "Close" : "View Roster"}
              </button>
            </div>

            {activeTeam === team.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <h4>Players</h4>
                {(roster[team.id] || []).map((p) => (
                  <p key={p.id}>{p.name} ({p.email}) {p.role_in_team === "captain" && "— Captain"}</p>
                ))}
                <div className="slot-inline-form">
                  <input
                    placeholder="Player's email"
                    value={emailInput[team.id] || ""}
                    onChange={(e) => setEmailInput({ ...emailInput, [team.id]: e.target.value })}
                  />
                  <button onClick={() => handleAddPlayer(team.id)}>Add Player</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}