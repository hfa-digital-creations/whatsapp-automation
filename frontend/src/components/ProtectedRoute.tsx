import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({
  roles,
  children,
}: {
  roles: Array<'SUPER_ADMIN' | 'ADMIN' | 'CLIENT'>;
  children: ReactNode;
}) {
  const { auth } = useAuth();

  if (!auth) return <Navigate to="/login" replace />;
  if (!roles.includes(auth.role)) return <Navigate to="/login" replace />;

  if (auth.role === 'CLIENT' && auth.mustChangePassword) {
    return <Navigate to="/app/change-password" replace />;
  }

  return <>{children}</>;
}
