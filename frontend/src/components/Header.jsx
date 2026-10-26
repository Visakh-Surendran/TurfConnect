import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/register";

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <header className="site-header">
      <Link to="/" className="brand">
        <span className="brand-icon">⚽</span>
        <span className="brand-name">TurfConnect</span>
      </Link>

      {!isAuthPage && user && (
        <nav className="site-nav">
          <Link to="/turfs" className="nav-link">Turfs</Link>
          <Link to="/my-bookings" className="nav-link">My Bookings</Link>
          <Link to="/teams" className="nav-link">Teams</Link>
          <Link to="/tournaments" className="nav-link">Tournaments</Link>
          {(user.role === "owner" || user.role === "admin") && (
            <Link to="/owner" className="nav-link">Owner Dashboard</Link>
          )}
          {user.role === "player" && (
           <>
         <Link to="/player-profile" className="nav-link">My Profile</Link>
         <Link to="/find-players" className="nav-link">Find Players</Link>
         <Link to="/player-requests" className="nav-link">Requests</Link>
         </>
      )}

          {user.role === "admin" && <Link to="/admin" className="nav-link">Admin</Link>}
        </nav>
      )}

      <div className="header-actions">
        {isAuthPage ? (
          location.pathname === "/login" ? (
            <Link to="/register" className="header-btn-link">Register</Link>
          ) : (
            <Link to="/login" className="header-btn-link">Login</Link>
          )
        ) : user ? (
          <>
            <span className="header-user">{user.name}</span>
            <button className="header-btn" onClick={handleLogout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" className="header-link">Login</Link>
            <Link to="/register" className="header-btn-link">Register</Link>
          </>
        )}
      </div>
    </header>
  );
}