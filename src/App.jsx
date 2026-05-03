import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import Signup from '@/pages/Signup';
import HubPage from '@/pages/HubPage';
import CreateProjectPage from '@/pages/CreateProjectPage';
import TimelinePage from '@/pages/TimelinePage';
import WorkspacePage from '@/pages/WorkspacePage';
import ConsensusPage from '@/pages/ConsensusPage';
import StakeholdersPage from '@/pages/StakeholdersPage';
import DemoPage from '@/pages/DemoPage';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

export default function App() {
  const { lang } = useLang();
  const [authUser, setAuthUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setAuthUser(data.session?.user ?? null);
      setReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const user = useMemo(() => {
    if (!authUser) return null;
    const email = authUser.email || 'User';
    const initials = email
      .split('@')[0]
      .split(/[._-]/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 2) || 'U';
    return {
      id: authUser.id,
      name: email,
      initials,
      role: 'engineer',
      roleLabel: lang === 'ko' ? 'Authenticated User' : lang === 'zh' ? 'Authenticated User' : 'Authenticated User',
      email,
    };
  }, [authUser, lang]);

  if (!ready) return null;

  return (
    <Routes>
      <Route
        path="/"
        element={user ? <Navigate to="/hub" replace /> : <LoginPage />}
      />
      <Route
        path="/signup"
        element={user ? <Navigate to="/hub" replace /> : <Signup />}
      />
      <Route path="/demo" element={<DemoPage />} />

      <Route element={<Layout user={user} />}>
        <Route path="/hub" element={<HubPage user={user} />} />
        <Route path="/create" element={<CreateProjectPage user={user} />} />

        {/* Project-scoped routes — sidebar + page headers stay
            in sync with the :projectId param. */}
        <Route path="/project/:projectId/sprints"      element={<WorkspacePage />} />
        <Route path="/project/:projectId/timeline"     element={<TimelinePage />} />
        <Route path="/project/:projectId/stakeholders" element={<StakeholdersPage />} />
        <Route path="/project/:projectId/consensus"    element={<ConsensusPage />} />

        <Route path="/workspace"    element={<Navigate to="/hub" replace />} />
        <Route path="/timeline"     element={<Navigate to="/hub" replace />} />
        <Route path="/stakeholders" element={<Navigate to="/hub" replace />} />
        <Route path="/consensus"    element={<Navigate to="/hub" replace />} />

        <Route path="/reports"  element={<HubPage user={user} />} />
        <Route path="/settings" element={<HubPage user={user} />} />
        <Route path="/help"     element={<HubPage user={user} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
