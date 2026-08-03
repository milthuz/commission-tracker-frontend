import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePassAuth } from '../context/PassAuthContext';

// Garde des écrans membres de La Passe. Volontairement distinct de ProtectedRoute et de
// PartnerProtectedRoute : chaque surface d'identité garde la sienne, pour qu'aucune ne
// puisse ouvrir les écrans d'une autre par accident de configuration de route.
const PassProtectedRoute = () => {
  const { isAuthenticated, isLoading } = usePassAuth();
  const location = useLocation();

  // Tant que la session n'est pas résolue, on n'affiche rien : rediriger tout de suite
  // renverrait vers l'adhésion un membre déjà connecté, à chaque rafraîchissement.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/pass/connexion" replace state={{ from: location }} />;

  return <Outlet />;
};

export default PassProtectedRoute;
