import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api/axios";

export default function PlayerRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [ratingInputs, setRatingInputs] = useState({});

  function fetchRequests() {
    api.get("/player-requests/mine").then((res) => setRequests(res.data.requests)).catch(console.error);
  }

  useEffect(() => { fetchRequests(); }, []);

  async function handleRespond(id, status) {
    try {
      await api.put(`/player-requests/${id}/respond`, { status });
      fetchRequests();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to respond");
    }
  }

  function handleRatingChange(id, field, value) {
    setRatingInputs({ ...ratingInputs, [id]: { ...ratingInputs[id], [field]: value } });
  }

  async function handleSubmitRating(ratedId, requestId) {
    const data = ratingInputs[requestId];
    if (!data?.score) {
      alert("Pick a score first");
      return;
    }
    try {
      await api.post("/ratings", {
        rated_id: ratedId,
        context: "player",
        context_id: ratedId,
        score: Number(data.score),
        comment: data.comment || "",
      });
      alert("Rating submitted!");
    } catch (err) {
      alert(err.response?.data?.error || "Failed to submit rating");
    }
  }

  return (
    <div className="page-container">
      <h2>Player Requests</h2>

      {requests.length === 0 ? (
        <p className="muted-text">No requests yet.</p>
      ) : (
        <div className="turf-list">
          {requests.map((r) => {
            const isIncoming = r.requested_by !== user.id;
            return (
              <div key={r.id} className="turf-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <strong>{r.player_name}</strong> ↔ <strong>{r.team_name}</strong>
                    <p className="muted-text">{isIncoming ? "Needs your response" : "Sent by you"}</p>
                    <span className={`status-badge status-${r.status === "accepted" ? "confirmed" : r.status === "declined" ? "cancelled" : "pending"}`}>
                      {r.status}
                    </span>
                  </div>

                  {isIncoming && r.status === "pending" && (
                    <div className="slot-inline-form">
                      <button className="approve-btn" onClick={() => handleRespond(r.id, "accepted")}>Accept</button>
                      <button className="reject-btn" onClick={() => handleRespond(r.id, "declined")}>Decline</button>
                    </div>
                  )}
                </div>

                {r.status === "accepted" && r.player_user_id !== user.id && (
                  <div className="slot-inline-form" style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <select onChange={(e) => handleRatingChange(r.id, "score", e.target.value)}>
                      <option value="">Rate {r.player_name}...</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}
                    </select>
                    <input
                      placeholder="Comment (optional)"
                      onChange={(e) => handleRatingChange(r.id, "comment", e.target.value)}
                    />
                    <button onClick={() => handleSubmitRating(r.player_user_id, r.id)}>Submit Rating</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}