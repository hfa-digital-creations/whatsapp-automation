import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { ClientLayout } from './components/ClientLayout';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Landing from './pages/landing/Landing';
import Privacy from './pages/landing/Privacy';
import Terms from './pages/landing/Terms';

import AdminDashboard from './pages/admin/Dashboard';
import AdminClients from './pages/admin/Clients';
import AdminClientDetail from './pages/admin/ClientDetail';
import AdminPlans from './pages/admin/Plans';
import AdminVouchers from './pages/admin/Vouchers';
import AdminFeatures from './pages/admin/Features';
import AdminWhatsapp from './pages/admin/WhatsappAccounts';
import AdminSystemWhatsapp from './pages/admin/SystemWhatsapp';
import AdminEnquiries from './pages/admin/Enquiries';
import AdminAuditLogs from './pages/admin/AuditLogs';
import AdminOffers from './pages/admin/Offers';
import AdminUsers from './pages/admin/Users';

import ClientChangePassword from './pages/client/ChangePassword';
import ClientDashboard from './pages/client/Dashboard';
import ClientWhatsapp from './pages/client/WhatsappAccounts';
import ClientTraining from './pages/client/Training';
import ClientConversations from './pages/client/Conversations';
import ClientContacts from './pages/client/Contacts';
import ClientTrash from './pages/client/Trash';
import ClientQuotations from './pages/client/Quotations';
import ClientSettings from './pages/client/Settings';

function RequireClientAuth({ children }: { children: JSX.Element }) {
  const { auth } = useAuth();
  if (!auth || auth.role !== 'CLIENT') return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route
        path="/app/change-password"
        element={
          <RequireClientAuth>
            <ClientChangePassword />
          </RequireClientAuth>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={['SUPER_ADMIN', 'ADMIN']}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<AdminClients />} />
        <Route path="clients/:id" element={<AdminClientDetail />} />
        <Route path="plans" element={<AdminPlans />} />
        <Route path="vouchers" element={<AdminVouchers />} />
        <Route path="features" element={<AdminFeatures />} />
        <Route path="whatsapp" element={<AdminWhatsapp />} />
        <Route path="system-whatsapp" element={<AdminSystemWhatsapp />} />
        <Route path="enquiries" element={<AdminEnquiries />} />
        <Route path="offers" element={<AdminOffers />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
      </Route>

      <Route
        path="/app"
        element={
          <ProtectedRoute roles={['CLIENT']}>
            <ClientLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<ClientDashboard />} />
        <Route path="whatsapp" element={<ClientWhatsapp />} />
        <Route path="training" element={<ClientTraining />} />
        <Route path="conversations" element={<ClientConversations />} />
        <Route path="contacts" element={<ClientContacts />} />
        <Route path="trash" element={<ClientTrash />} />
        <Route path="quotations" element={<ClientQuotations />} />
        <Route path="settings" element={<ClientSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
