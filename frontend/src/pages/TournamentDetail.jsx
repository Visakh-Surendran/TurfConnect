import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";
import PaymentModal from "../components/PaymentModal";

export default function TournamentDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [registeredTeams, setRegisteredTeams] = useState([]);
  const [fixtures, setFixtures] = useState([]);
  const [standings, setStandings] = useState([]);
  const [myTeams, setMyTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [message, setMessage] = useState("");
  const [resultInputs, setResultInputs] = useState({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const isOrganizer = tournament && user && (tournament.organizer_id === user.id || user.role === "admin");

  const fetchAll = useCallback(() => {
    api.get(`/tournaments/${id}`).then((res) => setTournament(res.data.tournament));
    api.get(`/tournaments/${id}/teams`).then((res) => setRegisteredTeams(res.data.teams));
    api.get(`/tournaments/${id}/fixtures`).then((res) => setFixtures(res.data.fixtures));
    api.get(`/tournaments/${id}/standings`).then((res) => setStandings(res.data.standings)).catch(() => {});
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    api.get("/teams/mine").then((res) => setMyTeams(res.data.teams)).catch(console.error);
  }, []);

  async function handleRegister() {
    if (!selectedTeam) return;

    if (Number(tournament.entry_fee) > 0) {
      setShowPaymentModal(true);
      return;
    }

    try {
      const res = await api.post(`/tournaments/${id}/register`, { team_id: Number(selectedTeam) });
      setMessage(`Registered — status: ${res.data.registration.status}`);
      fetchAll();
    } catch (err) {
      setMessage(err.response?.data?.error || "Registration failed");
    }
  }

  function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

  async function handleGenerateFixtures() {
    try {
      const res = await api.post(`/tournaments/${id}/fixtures/generate`);
      alert(res.data.message);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to generate fixtures");
    }
  }

  async function handleNextRound() {
    try {
      const res = await api.post(`/tournaments/${id}/fixtures/next-round`);
      alert(res.data.message || `Champion: team #${res.data.champion_team_id}`);
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to advance round");
    }
  }

  function handleResultChange(fixtureId, field, value) {
    setResultInputs({ ...resultInputs, [fixtureId]: { ...resultInputs[fixtureId], [field]: value } });
  }

  async function handleSubmitResult(fixtureId) {
    const data = resultInputs[fixtureId];
    if (!data?.team1_score || data.team1_score === "" || !data?.team2_score || data.team2_score === "") {
      alert("Enter both scores");
      return;
    }
    try {
      await api.put(`/fixtures/${fixtureId}/result`, {
        team1_score: Number(data.team1_score),
        team2_score: Number(data.team2_score),
      });
      fetchAll();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to submit result");
    }
  }

  if (!tournament) return <div className="page-container"><p>Loading...</p></div>;

  const rounds = [...new Set(fixtures.map((f) => f.round_number))].sort((a, b) => a - b);

  return (
    <div className="page-container">
      <h2>{tournament.name}</h2>
      <p className="muted-text">{tournament.turf_name} · {tournament.location}</p>
      <p>{tournament.sport} · {tournament.format.replace("_", " ")} · {formatDisplayDate(tournament.start_date)} → {formatDisplayDate(tournament.end_date)}</p>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: 12 }}>
        <span className="status-badge status-approved">{tournament.status}</span>
        <span className="status-badge" style={{ background: "rgba(124, 58, 237, 0.2)", color: "var(--violet-light)", border: "1px solid var(--violet)" }}>
          {Number(tournament.entry_fee) > 0 ? `Entry Fee: ₹${tournament.entry_fee}` : "Free Entry"}
        </span>
      </div>

      {message && <p className="info-text">{message}</p>}

      {/* Registration */}
      {tournament.status === "upcoming" && myTeams.length > 0 && (
        <div className="form-card" style={{ marginTop: 20 }}>
          <h3>Register Your Team</h3>
          <div className="slot-inline-form">
            <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
              <option value="">-- select your team --</option>
              {myTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button onClick={handleRegister}>
              {Number(tournament.entry_fee) > 0 ? `Pay Entry Fee & Register (₹${tournament.entry_fee})` : "Register Team"}
            </button>
          </div>
        </div>
      )}

      {/* Registered teams */}
      <h3 style={{ marginTop: 24 }}>Registered Teams ({registeredTeams.length}/{tournament.max_teams})</h3>
      <div className="turf-list">
        {registeredTeams.map((t) => (
          <div key={t.id} className="turf-row">
            <strong>{t.name}</strong>
            <span className={`status-badge status-${t.registration_status === "registered" ? "approved" : "pending"}`}>
              {t.registration_status}
            </span>
          </div>
        ))}
      </div>

      {/* Organizer controls */}
      {isOrganizer && (
        <div className="form-card" style={{ marginTop: 20 }}>
          <h3>Organizer Controls</h3>
          {fixtures.length === 0 ? (
            <button onClick={handleGenerateFixtures}>Generate Fixtures</button>
          ) : tournament.format === "knockout" && tournament.status === "ongoing" ? (
            <button onClick={handleNextRound}>Advance to Next Round</button>
          ) : (
            <p className="muted-text">Fixtures already generated.</p>
          )}
        </div>
      )}

      {/* Fixtures grouped by round */}
      {fixtures.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Fixtures</h3>
          {rounds.map((round) => (
            <div key={round} style={{ marginBottom: 20 }}>
              <h4>Round {round}</h4>
              <div className="turf-list">
                {fixtures.filter((f) => f.round_number === round).map((f) => (
                  <div key={f.id} className="turf-row">
                    <div>
                      <strong>
                        {f.team1_name || "TBD"} {f.team2_name ? `vs ${f.team2_name}` : "— BYE"}
                      </strong>
                      {f.winner_id && (
                        <p className="muted-text">
                          {f.team1_score} - {f.team2_score}
                        </p>
                      )}
                      <span className={`status-badge status-${f.status === "completed" ? "confirmed" : "pending"}`}>
                        {f.status}
                      </span>
                    </div>

                    {isOrganizer && f.team2_id && f.status !== "completed" && (
                      <div className="slot-inline-form">
                        <input
                          type="number"
                          placeholder="Score 1"
                          style={{ width: 70 }}
                          onChange={(e) => handleResultChange(f.id, "team1_score", e.target.value)}
                        />
                        <input
                          type="number"
                          placeholder="Score 2"
                          style={{ width: 70 }}
                          onChange={(e) => handleResultChange(f.id, "team2_score", e.target.value)}
                        />
                        <button onClick={() => handleSubmitResult(f.id)}>Submit</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* Standings — round robin/league only */}
      {(tournament.format === "round_robin" || tournament.format === "league") && standings.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Standings</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: 8 }}>Team</th>
                <th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.team_id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{s.name}</td>
                  <td>{s.played}</td><td>{s.won}</td><td>{s.drawn}</td><td>{s.lost}</td>
                  <td><strong>{s.points}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Tournament Registration Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        tournament={tournament}
        team={myTeams.find((t) => String(t.id) === String(selectedTeam))}
        user={user}
        onSuccess={(reg, details) => {
          const refText = details?.transaction_ref ? ` (Ref: ${details.transaction_ref})` : "";
          setMessage(
            `Registration submitted for team ${myTeams.find((t) => String(t.id) === String(selectedTeam))?.name || ""}! Status: ${reg?.status || "registered"}.${refText}`
          );
          fetchAll();
        }}
      />
    </div>
  );
}