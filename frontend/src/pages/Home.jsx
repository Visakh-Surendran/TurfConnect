import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Home() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="home-page">
      <div className="home-card">
        <div style={{ fontSize: "42px", marginBottom: "8px" }}>⚽</div>
        <h2 style={{ margin: "0 0 10px 0" }}>Welcome to TurfConnect</h2>
        <p style={{ fontWeight: 600, color: "var(--text)", fontSize: "16px", margin: "4px 0" }}>
          {user?.name}
        </p>
        <p style={{ textTransform: "capitalize", fontSize: "13px", color: "var(--violet-light)", margin: "0 0 4px 0" }}>
          Role: {user?.role}
        </p>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 24px 0" }}>
          {user?.email}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Link
            to="/turfs"
            style={{
              background: "var(--violet)",
              color: "white",
              padding: "12px 20px",
              borderRadius: "8px",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: "14px",
              display: "inline-block",
              boxShadow: "0 4px 14px var(--violet-glow)",
              transition: "transform 0.15s, background 0.15s"
            }}
          >
            ⚡ Explore & Book Turfs
          </Link>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
