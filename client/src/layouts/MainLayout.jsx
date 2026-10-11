import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import TravelAssistant from '../components/assistant/TravelAssistant';
import TravelHeader from '../components/common/TravelHeader';

export default function MainLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <TravelHeader
        user={user}
        isAuthenticated={isAuthenticated}
        onLogout={() => {
          logout();
          navigate('/login');
        }}
      />
      <main>
        <Outlet />
      </main>
      {isAuthenticated && <TravelAssistant />}
    </div>
  );
}