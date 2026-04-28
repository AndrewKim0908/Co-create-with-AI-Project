import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.vite';
import { C } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

/**
 * Authenticated layout: Sidebar + main content area.
 * Header is rendered by each page so titles/status can vary.
 */
export default function Layout({ user }) {
  if (!user) return <Navigate to="/" replace />;

  async function onLogout() {
    await supabase.auth.signOut();
  }

  return (
    <div
      style={{
        display: 'flex', height: '100vh',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <Sidebar user={user} onLogout={onLogout} />
      <main
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', background: C.bg,
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
