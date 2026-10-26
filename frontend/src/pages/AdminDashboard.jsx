import { useState, useEffect } from "react";
import api from "../api/axios";

export default function AdminDashboard() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  function fetchPending() {
    setLoading(true);
    api.get("/turfs/pending")
      .then((res) => setPending(res.data.turfs))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let isMounted = true;
    api.get("/turfs/pending")
      .then((res) => {
        if (isMounted) setPending(res.data.turfs || []);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDecision(turfId, status) {
    try {
      await api.put(`/turfs/${turfId}/status`, { status });
      fetchPending();
    } catch (err) {
      alert(err.response?.data?.error || "Action failed");
    }
  }

  return (
    <div className="page-container">
      <h2>Admin Dashboard — Pending Turfs</h2>
      {loading ? (
        <p>Loading...</p>
      ) : pending.length === 0 ? (
        <p className="muted-text">No pending turfs. All caught up.</p>
      ) : (
        <div className="turf-list">
          {pending.map((turf) => (
            <div key={turf.id} className="turf-row">
              <div>
                <strong>{turf.name}</strong>
                <p className="muted-text">{turf.location} · {turf.sport_type}</p>
                <p>₹{turf.price_per_hour}/hr</p>
              </div>
              <div className="admin-actions">
                <button className="approve-btn" onClick={() => handleDecision(turf.id, "approved")}>Approve</button>
                <button className="reject-btn" onClick={() => handleDecision(turf.id, "rejected")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}