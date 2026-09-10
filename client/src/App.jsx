import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import DashboardLayout from './layouts/DashboardLayout';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import VerifyOTPPage from './pages/VerifyOTPPage';
import DashboardPage from './pages/DashboardPage';
import CreateTripPage from './pages/CreateTripPage';
import TripDetailsPage from './pages/TripDetailsPage';
import ExplorePage from './pages/ExplorePage';
import PublicTripsPage from './pages/PublicTripsPage';
import PublicTripDetailsPage from './pages/PublicTripDetailsPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import Loader from './components/common/Loader';

/** Blocks authenticated-only routes until the auth bootstrap check finishes, then redirects if needed. */
function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loader label="Loading your account..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/public-trips" element={<PublicTripsPage />} />
        <Route path="/public-trips/:id" element={<PublicTripDetailsPage />} />
      </Route>

      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOTPPage />} />
      </Route>

      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/create-trip" element={<CreateTripPage />} />
        <Route path="/trip/:id" element={<TripDetailsPage />} />
        <Route path="/trip/:id/pre-trip" element={<TripDetailsPage initialTab="pre-trip" />} />
        <Route path="/trip/:id/transport" element={<TripDetailsPage initialTab="transport" />} />
        <Route path="/trip/:id/itinerary" element={<TripDetailsPage initialTab="itinerary" />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}