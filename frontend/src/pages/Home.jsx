import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

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
        <h2>Welcome to TurfConnect</h2>
        <p>{user?.name} · {user?.role}</p>
        <p>{user?.email}</p>
        <button onClick={handleLogout}>Logout</button>
      </div>
    </div>
  );
}