import { useState, useEffect } from "react";
import api from "../api/axios";

export default function PlayerProfile() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ sport: "", position: "", skill_level: "beginner", location: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  function fetchProfile() {
    api.get("/players/me")
      .then((res) => {
        setProfile(res.data.profile);
        setForm({
          sport: res.data.profile.sport || "",
          position: res.data.profile.position || "",
          skill_level: res.data.profile.skill_level || "beginner",
          location: res.data.profile.location || "",
        });
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchProfile(); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    try {
      await api.post("/players", form);
      setMessage("Profile saved!");
      fetchProfile();
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to save profile");
    }
  }

  async function toggleAvailability() {
    try {
      const res = await api.put("/players/availability", { availability_status: !profile.availability_status });
      setProfile(res.data.profile);
    } catch (err) {
      alert(err.response?.data?.error || "Failed to update availability");
    }
  }

  if (loading) return <div className="page-container"><p>Loading...</p></div>;

  return (
    <div className="page-container">
      <h2>My Player Profile</h2>

      {profile && (
        <div className="form-card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="muted-text">Available for team invites</p>
              <span className={`status-badge status-${profile.availability_status ? "approved" : "rejected"}`}>
                {profile.availability_status ? "Available" : "Not available"}
              </span>
            </div>
            <button onClick={toggleAvailability}>
              {profile.availability_status ? "Mark Unavailable" : "Mark Available"}
            </button>
          </div>
        </div>
      )}

      <div className="form-card">
        <h3>{profile ? "Update Profile" : "Create Your Player Profile"}</h3>
        {message && <p className="info-text">{message}</p>}
        <form onSubmit={handleSubmit}>
          <input
            placeholder="Sport (e.g. football)"
            value={form.sport}
            onChange={(e) => setForm({ ...form, sport: e.target.value })}
            required
          />
          <input
            placeholder="Position (e.g. striker, goalkeeper)"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />
          <select value={form.skill_level} onChange={(e) => setForm({ ...form, skill_level: e.target.value })}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="pro">Pro</option>
          </select>
          <input
            placeholder="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <button type="submit">{profile ? "Update" : "Create Profile"}</button>
        </form>
      </div>
    </div>
  );
}