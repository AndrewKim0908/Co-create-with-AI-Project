import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import Layout from '@/components/Layout';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import SignupPage from '@/pages/Signup';
import HubPage from '@/pages/HubPage';
import CreateProjectPage from '@/pages/CreateProjectPage';
import TimelinePage from '@/pages/TimelinePage';
import WorkspacePage from '@/pages/WorkspacePage';
import ConsensusPage from '@/pages/ConsensusPage';
import StakeholdersPage from '@/pages/StakeholdersPage';
import DemoPage from '@/pages/DemoPage';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

const ROLE_LABELS = {
  pm:          { en: 'Project Manager',  ko: '프로젝트 매니저' },
  designer:    { en: 'Product Designer', ko: '제품 디자이너' },
  engineer:    { en: 'Engineer',         ko: '엔지니어' },
  marketer:    { en: 'Marketer',         ko: '마케터' },
  manufacture: { en: 'Manufacture',      ko: 'Manufacture' },
  other:       { en: 'Member',           ko: '멤버' },
};

function makeInitials(name = '') {
  return name
    .split(/[\s._@-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2) || 'U';
}

export default function App() {
  const { lang } = useLang();
  const [authUser, setAuthUser]     = useState(null);
  const [ready, setReady]           = useState(false);
  const [profileData, setProfileData] = useState({ fullName: null, role: null });

  // Load profile row (full_name, role) for the given user id
  const fetchProfile = useCallback(async (uid) => {
    if (!uid) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', uid)
      .single();
    if (data) {
      setProfileData({
        fullName: data.full_name ?? null,
        role:     data.role     ?? null,
      });
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const u = data.session?.user ?? null;
      setAuthUser(u);
      setReady(true);
      if (u) fetchProfile(u.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setAuthUser(u);
      setReady(true);
      if (u) fetchProfile(u.id);
      else setProfileData({ fullName: null, role: null });
    });

    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [fetchProfile]);

  // Called by SettingsModal after a successful DB save
  const handleProfileUpdate = useCallback((updates) => {
    setProfileData(prev => ({ ...prev, ...updates }));
  }, []);

  const user = useMemo(() => {
    if (!authUser) return null;
    const email    = authUser.email || 'User';
    const display  = profileData.fullName || email;
    const roleId   = profileData.role || 'engineer';
    const roleMeta = ROLE_LABELS[roleId];
    return {
      id:        authUser.id,
      name:      display,
      initials:  makeInitials(display),
      role:      roleId,
      roleLabel: roleMeta ? (lang === 'ko' ? roleMeta.ko : roleMeta.en) : roleId,
      email,
    };
  }, [authUser, profileData, lang]);

  if (!ready) return null;

  return (
    <Routes>
      <Route path="/" element={user ? <Navigate to="/hub" replace /> : <LandingPage />} />
      <Route path="/login" element={user ? <Navigate to="/hub" replace /> : <LoginPage />} />
      <Route path="/signup" element={user ? <Navigate to="/hub" replace /> : <SignupPage />} />
      <Route path="/demo" element={<DemoPage />} />

      <Route element={<Layout user={user} onProfileUpdate={handleProfileUpdate} />}>
        <Route path="/hub"    element={<HubPage user={user} />} />
        <Route path="/create" element={<CreateProjectPage user={user} />} />

        <Route path="/project/:projectId/sprints"      element={<WorkspacePage />} />
        <Route path="/project/:projectId/timeline"     element={<TimelinePage />} />
        <Route path="/project/:projectId/stakeholders" element={<StakeholdersPage />} />
        <Route path="/project/:projectId/consensus"    element={<ConsensusPage />} />

        <Route path="/workspace"    element={<Navigate to="/hub" replace />} />
        <Route path="/timeline"     element={<Navigate to="/hub" replace />} />
        <Route path="/stakeholders" element={<Navigate to="/hub" replace />} />
        <Route path="/consensus"    element={<Navigate to="/hub" replace />} />

        <Route path="/reports"  element={<HubPage user={user} />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
