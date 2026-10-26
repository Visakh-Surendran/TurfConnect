import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import BrowseTurfs from "./pages/BrowseTurfs";
import TurfDetail from "./pages/TurfDetail";
import MyBookings from "./pages/MyBookings";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Teams from "./pages/Teams";
import Tournaments from "./pages/Tournaments";
import CreateTournament from "./pages/CreateTournament";
import TournamentDetail from "./pages/TournamentDetail";
import PlayerProfile from "./pages/PlayerProfile";
import SearchPlayers from "./pages/SearchPlayers";
import PlayerRequests from "./pages/PlayerRequests";



function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/turfs" element={<ProtectedRoute><BrowseTurfs /></ProtectedRoute>} />
        <Route path="/turfs/:id" element={<ProtectedRoute><TurfDetail /></ProtectedRoute>} />
        <Route path="/my-bookings" element={<ProtectedRoute><MyBookings /></ProtectedRoute>} />
        <Route path="/owner" element={<ProtectedRoute roles={["owner", "admin"]}><OwnerDashboard /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
        <Route path="/tournaments" element={<ProtectedRoute><Tournaments /></ProtectedRoute>} />
        <Route path="/tournaments/new" element={<ProtectedRoute><CreateTournament /></ProtectedRoute>} />
        <Route path="/tournaments/:id" element={<ProtectedRoute><TournamentDetail /></ProtectedRoute>} />
        <Route path="/player-profile" element={<ProtectedRoute roles={["player"]}><PlayerProfile /></ProtectedRoute>} />
        <Route path="/find-players" element={<ProtectedRoute roles={["player"]}><SearchPlayers /></ProtectedRoute>} />
        <Route path="/player-requests" element={<ProtectedRoute roles={["player"]}><PlayerRequests /></ProtectedRoute>} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}