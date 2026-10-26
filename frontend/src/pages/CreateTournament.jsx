import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import api from "../api/axios";

function formatDate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function CreateTournament() {
  const [turfs, setTurfs] = useState([]);
  const [form, setForm] = useState({
    turf_id: "", name: "", sport: "", format: "round_robin",
    max_teams: "", entry_fee: "", start_date: null, end_date: null,
  });
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/turfs").then((res) => setTurfs(res.data.turfs)).catch(console.error);
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!form.start_date || !form.end_date) {
      setMessage("Please select both start and end dates");
      return;
    }

    const payload = {
      ...form,
      start_date: formatDate(form.start_date),
      end_date: formatDate(form.end_date),
    };

    try {
      const res = await api.post("/tournaments", payload);
      navigate(`/tournaments/${res.data.tournament.id}`);
    } catch (err) {
      setMessage(err.response?.data?.error || "Failed to create tournament");
    }
  }

  return (
    <div className="page-container">
      <h2>Create Tournament</h2>
      <div className="form-card">
        {message && (
          <p className="info-text" style={{ borderColor: "var(--error)", color: "var(--error)" }}>
            {message}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <select name="turf_id" value={form.turf_id} onChange={handleChange} required>
            <option value="">-- select a turf --</option>
            {turfs.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.location})</option>
            ))}
          </select>
          <input name="name" placeholder="Tournament name" value={form.name} onChange={handleChange} required />
          <input name="sport" placeholder="Sport" value={form.sport} onChange={handleChange} required />
          <select name="format" value={form.format} onChange={handleChange}>
            <option value="round_robin">Round Robin</option>
            <option value="knockout">Knockout</option>
            <option value="league">League</option>
          </select>
          <input name="max_teams" type="number" placeholder="Max teams" value={form.max_teams} onChange={handleChange} required />
          <input name="entry_fee" type="number" placeholder="Entry fee (optional)" value={form.entry_fee} onChange={handleChange} />

          <div className="slot-inline-form" style={{ marginBottom: 12 }}>
            <div>
              <label className="muted-text" style={{ display: "block", marginBottom: 4 }}>Start date</label>
              <DatePicker
                selected={form.start_date}
                onChange={(date) => setForm({ ...form, start_date: date })}
                selectsStart
                startDate={form.start_date}
                endDate={form.end_date}
                minDate={new Date()}
                placeholderText="Start date"
                dateFormat="dd MMM yyyy"
                className="tc-datepicker-input"
              />
            </div>
            <div>
              <label className="muted-text" style={{ display: "block", marginBottom: 4 }}>End date</label>
              <DatePicker
                selected={form.end_date}
                onChange={(date) => setForm({ ...form, end_date: date })}
                selectsEnd
                startDate={form.start_date}
                endDate={form.end_date}
                minDate={form.start_date || new Date()}
                placeholderText="End date"
                dateFormat="dd MMM yyyy"
                className="tc-datepicker-input"
              />
            </div>
          </div>

          <button type="submit">Create Tournament</button>
        </form>
      </div>
    </div>
  );
}