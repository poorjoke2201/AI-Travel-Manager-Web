import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TravelAssistant from '../components/assistant/TravelAssistant';
import TravelHeader from '../components/common/TravelHeader';

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-stone">
      <TravelHeader user={user} isAuthenticated={Boolean(user)} onLogout={handleLogout} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
      <TravelAssistant />
    </div>
  );
}