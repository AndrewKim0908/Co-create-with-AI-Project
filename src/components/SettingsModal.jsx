import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import { ROLES, getRoleLabel, EXPERTISE_OPTIONS } from '@/constants/roles';
import { baseColorForUser } from '@/utils/userColors';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

const DROPDOWN_HEIGHT = 264;

// ─── Section row ──────────────────────────────────────────────
function SectionRow({ label, children, last }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 24,
      padding: '20px 0',
      borderBottom: last ? 'none' : '1px solid #f3f4f6',
    }}>
      <div style={{ width: 96, flexShrink: 0, paddingTop: 2, fontSize: 13, fontWeight: 500, color: '#6b7280' }}>
        {label}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

// ─── Inline error / success notice ───────────────────────────
function Notice({ msg, type }) {
  if (!msg) return null;
  const isErr = type === 'error';
  return (
    <div style={{
      marginTop: 8, padding: '7px 10px', borderRadius: 6, fontSize: 12.5,
      background: isErr ? '#fef2f2' : '#f0fdf4',
      color:      isErr ? '#ef4444' : '#16a34a',
    }}>
      {msg}
    </div>
  );
}

// ─── Skeleton line ────────────────────────────────────────────
function Skeleton({ w = '60%', h = 16 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s infinite',
    }} />
  );
}

// ─── Password change sub-modal ────────────────────────────────
function PasswordModal({ onClose, userEmail }) {
  const { lang } = useLang();
  const [cur, setCur]         = useState('');
  const [next, setNext]       = useState('');
  const [conf, setConf]       = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [show, setShow]       = useState({ cur: false, next: false, conf: false });
  const ko = lang === 'ko';

  async function handleSubmit() {
    if (!cur)          { setError(ko ? '현재 비밀번호를 입력하세요.' : 'Enter your current password.'); return; }
    if (next.length < 6) { setError(ko ? '새 비밀번호는 6자 이상이어야 합니다.' : 'Password must be at least 6 characters.'); return; }
    if (next !== conf) { setError(ko ? '새 비밀번호가 일치하지 않습니다.' : 'Passwords do not match.'); return; }

    setSaving(true);
    setError('');
    try {
      // 1. Verify current password
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: cur });
      if (signInErr) {
        setError(ko ? '현재 비밀번호가 올바르지 않습니다.' : 'Current password is incorrect.');
        return;
      }
      // 2. Update to new password
      const { error: updateErr } = await supabase.auth.updateUser({ password: next });
      if (updateErr) throw updateErr;
      onClose(true); // true = success
    } catch {
      setError(ko ? '비밀번호 변경에 실패했습니다.' : 'Failed to update password.');
    } finally {
      setSaving(false);
    }
  }

  const baseInput = {
    width: '100%', padding: '8px 12px', paddingRight: 36, borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 13.5, fontFamily: 'inherit',
    outline: 'none', color: '#111827', background: '#fff', boxSizing: 'border-box',
  };

  function PwField({ label, value, onChange, vis, onToggle }) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 5 }}>{label}</div>
        <div style={{ position: 'relative' }}>
          <input type={vis ? 'text' : 'password'} value={value}
            onChange={e => onChange(e.target.value)}
            style={baseInput} autoComplete="new-password" />
          <button type="button" onClick={onToggle} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex',
          }}>
            <Icon name={vis ? 'eye-off' : 'eye'} size={14} color="#9ca3af" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', margin: '0 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
            {ko ? '비밀번호 변경' : 'Change Password'}
          </div>
          <button type="button" onClick={() => onClose(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
            <Icon name="x" size={16} color="#9ca3af" />
          </button>
        </div>

        <PwField label={ko ? '현재 비밀번호' : 'Current password'}
          value={cur} onChange={setCur} vis={show.cur} onToggle={() => setShow(s => ({ ...s, cur: !s.cur }))} />
        <PwField label={ko ? '새 비밀번호' : 'New password'}
          value={next} onChange={setNext} vis={show.next} onToggle={() => setShow(s => ({ ...s, next: !s.next }))} />
        <PwField label={ko ? '새 비밀번호 확인' : 'Confirm new password'}
          value={conf} onChange={setConf} vis={show.conf} onToggle={() => setShow(s => ({ ...s, conf: !s.conf }))} />

        {error && (
          <div style={{ fontSize: 12.5, color: '#ef4444', marginBottom: 14, padding: '8px 10px', background: '#fef2f2', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button type="button" onClick={() => onClose(false)} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            {ko ? '취소' : 'Cancel'}
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving ? '#6b7280' : '#1E2A35', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            {saving && <Icon name="loader" size={13} color="#fff" />}
            {ko ? '변경' : 'Change'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Settings Modal ──────────────────────────────────────
export default function SettingsModal({ user, onClose, onProfileUpdate }) {
  const { lang } = useLang();
  const ko = lang === 'ko';

  // Loading
  const [loading, setLoading]   = useState(true);

  // Name
  const [email, setEmail]           = useState(user?.email || '');
  const [nameValue, setNameValue]   = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft]   = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg]       = useState(null); // { text, type }

  // Password sub-modal
  const [pwOpen, setPwOpen]   = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  // Role
  const [roleValue, setRoleValue]       = useState(user?.role || 'engineer');
  const [roleDropdown, setRoleDropdown] = useState(false);
  const [customRole, setCustomRole]     = useState('');
  const [dropPos, setDropPos]           = useState(null);
  const btnRef = useRef(null);
  const ddRef  = useRef(null);

  // Expertise (multi-select, stored as profiles.expertise TEXT[])
  const [expertise, setExpertise] = useState([]);

  // ── Load profile from DB ───────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        setEmail(authUser.email || '');

        const { data } = await supabase
          .from('profiles')
          .select('full_name, role, expertise')
          .eq('id', authUser.id)
          .single();

        if (data) {
          const name = data.full_name || authUser.email || '';
          setNameValue(name);
          setNameDraft(name);
          if (data.role) setRoleValue(data.role);
          if (Array.isArray(data.expertise)) setExpertise(data.expertise);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Save name ──────────────────────────────────────────────
  async function handleSaveName() {
    if (!nameDraft.trim()) return;
    const newName = nameDraft.trim();
    setSavingName(true);
    setNameMsg(null);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      // 1) profiles is the canonical source — update it first.
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: newName })
        .eq('id', authUser.id);
      if (error) throw error;

      // 2) Mirror into auth user_metadata so paths that still read
      //    user_metadata.full_name (legacy helpers, AI participant lookup) stay in sync.
      //    Soft-fail: a metadata write failure shouldn't block the profile save.
      try {
        await supabase.auth.updateUser({ data: { full_name: newName } });
      } catch (metaErr) {
        // eslint-disable-next-line no-console
        console.warn('[SettingsModal] auth.updateUser metadata sync failed', metaErr);
      }

      // 3) Propagate to existing chat messages across all projects.
      //    messages has no user_id column; sender_email is the stable identifier.
      if (authUser?.email) {
        await supabase
          .from('messages')
          .update({ sender_name: newName })
          .eq('sender_email', authUser.email);
      }

      setNameValue(newName);
      setNameEditing(false);
      onProfileUpdate?.({ fullName: newName });
      setNameMsg({ text: ko ? '저장되었습니다.' : 'Saved.', type: 'success' });
      setTimeout(() => setNameMsg(null), 2500);
    } catch {
      setNameMsg({ text: ko ? '저장에 실패했습니다.' : 'Failed to save.', type: 'error' });
    } finally {
      setSavingName(false);
    }
  }

  // ── Save role (immediate on select) ───────────────────────
  async function handleRoleSelect(roleId) {
    setRoleValue(roleId);
    if (roleId !== 'other') setRoleDropdown(false);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      await supabase
        .from('profiles')
        .update({ role: roleId })
        .eq('id', authUser.id);
      onProfileUpdate?.({ role: roleId });
    } catch {
      // local state already updated; silently fail
    }
  }

  // ── Toggle an expertise tag (immediate save, like role) ────
  async function handleExpertiseToggle(tag) {
    const next = expertise.includes(tag)
      ? expertise.filter((t) => t !== tag)
      : [...expertise, tag];
    setExpertise(next);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      await supabase
        .from('profiles')
        .update({ expertise: next })
        .eq('id', authUser.id);
      onProfileUpdate?.({ expertise: next });
    } catch {
      // local state already updated; silently fail
    }
  }

  // ── Role dropdown portal ───────────────────────────────────
  const openDropdown = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const upward = r.top - DROPDOWN_HEIGHT > 8;
    setDropPos({
      left: r.left,
      width: Math.max(r.width, 220),
      ...(upward
        ? { bottom: window.innerHeight - r.top + 4, top: 'auto' }
        : { top: r.bottom + 4, bottom: 'auto' }),
    });
    setRoleDropdown(true);
  }, []);

  useEffect(() => {
    if (!roleDropdown) return;
    function h(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        ddRef.current  && !ddRef.current.contains(e.target)
      ) setRoleDropdown(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [roleDropdown]);

  // ── Escape closes dropdown first, then modal ───────────────
  useEffect(() => {
    function h(e) {
      if (e.key !== 'Escape') return;
      if (roleDropdown) setRoleDropdown(false);
      else onClose();
    }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose, roleDropdown]);

  const roleLabelDisplay = roleValue === 'other'
    ? (customRole || (ko ? '기타' : 'Other'))
    : getRoleLabel(roleValue, lang);

  const rolePortal = roleDropdown && dropPos && createPortal(
    <div ref={ddRef} style={{
      position: 'fixed',
      top: dropPos.top, bottom: dropPos.bottom, left: dropPos.left, width: dropPos.width,
      zIndex: 9999, background: '#fff', borderRadius: 12,
      border: '1px solid #e5e7eb', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '6px',
    }}>
      {ROLES.map(r => {
        const label  = lang === 'ko' ? r.ko : r.en;
        const active = roleValue === r.id;
        return (
          <button key={r.id} type="button"
            onClick={() => handleRoleSelect(r.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '7px 10px', borderRadius: 7,
              background: active ? '#f5f3ff' : 'transparent',
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? '#4f46e5' : '#374151',
              textAlign: 'left', transition: 'background 100ms',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = active ? '#f5f3ff' : 'transparent'; }}
          >
            <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {active && <Icon name="check" size={14} color="#4f46e5" />}
            </span>
            {label}
          </button>
        );
      })}
      {roleValue === 'other' && (
        <div style={{ padding: '4px 10px 6px' }}>
          <input autoFocus
            placeholder={ko ? '역할을 입력하세요' : 'Enter your role'}
            value={customRole}
            onChange={e => setCustomRole(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setRoleDropdown(false); }}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: '1.5px solid #6366f1', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}
    </div>,
    document.body
  );

  return (
    <>
      {/* shimmer keyframe — injected once */}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>

      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }} />

      {/* Modal */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: '#fff', borderRadius: 20,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          width: '100%', maxWidth: 560, margin: '0 16px', pointerEvents: 'auto',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '28px 32px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', letterSpacing: '-0.02em' }}>
              {ko ? '설정' : 'Settings'}
            </div>
            <button type="button" onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
              onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
            >
              <Icon name="x" size={15} color="#6b7280" />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '8px 32px 32px' }}>

            {/* Section 1 — Name */}
            <SectionRow label={ko ? '이름' : 'Name'}>
              {loading ? (
                <Skeleton w="55%" />
              ) : nameEditing ? (
                <div>
                  <input autoFocus value={nameDraft}
                    onChange={e => setNameDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  handleSaveName();
                      if (e.key === 'Escape') { setNameDraft(nameValue); setNameEditing(false); }
                    }}
                    style={{ width: '100%', padding: '7px 11px', borderRadius: 8, border: '1.5px solid #6366f1', fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#111827', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <button type="button" onClick={handleSaveName} disabled={savingName}
                      style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: savingName ? '#6b7280' : '#1E2A35', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: savingName ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {savingName && <Icon name="loader" size={12} color="#fff" />}
                      {ko ? '저장' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setNameDraft(nameValue); setNameEditing(false); setNameMsg(null); }}
                      style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {ko ? '취소' : 'Cancel'}
                    </button>
                  </div>
                  {nameMsg && <Notice msg={nameMsg.text} type={nameMsg.type} />}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{nameValue}</span>
                    <button type="button" onClick={() => { setNameDraft(nameValue); setNameEditing(true); setNameMsg(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, color: '#6b7280', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = '#9ca3af'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
                    >
                      <Icon name="pencil" size={12} color="#9ca3af" />
                      {ko ? '편집' : 'Edit'}
                    </button>
                  </div>
                  {nameMsg && <Notice msg={nameMsg.text} type={nameMsg.type} />}
                  {pwSuccess && <Notice msg={ko ? '비밀번호가 변경되었습니다.' : 'Password updated.'} type="success" />}
                </div>
              )}
            </SectionRow>

            {/* Section 2 — Account */}
            <SectionRow label={ko ? '계정' : 'Account'}>
              {loading ? (
                <Skeleton w="70%" />
              ) : (
                <>
                  <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 10 }}>{email}</div>
                  <button type="button" onClick={() => { setPwOpen(true); setPwSuccess(false); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12.5, color: '#374151', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.background = '#f9fafb'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
                  >
                    <Icon name="lock" size={12} color="#9ca3af" />
                    {ko ? '비밀번호 변경' : 'Change password'}
                  </button>
                </>
              )}
            </SectionRow>

            {/* Section 3 — Role */}
            <SectionRow label={ko ? '역할' : 'Role'}>
              {loading ? (
                <Skeleton w="40%" h={32} />
              ) : (
                <button ref={btnRef} type="button"
                  onClick={() => roleDropdown ? setRoleDropdown(false) : openDropdown()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '6px 12px', borderRadius: 8,
                    border: `1.5px solid ${roleDropdown ? '#6366f1' : '#e5e7eb'}`,
                    background: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13.5, fontWeight: 500, color: '#111827', transition: 'border-color 140ms',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: email ? baseColorForUser(email) : '#06b6d4' }} />
                  {roleLabelDisplay}
                  <Icon name={roleDropdown ? 'chevron-up' : 'chevron-down'} size={13} color="#9ca3af" />
                </button>
              )}
            </SectionRow>

            {/* Section 4 — Expertise (multi-select) */}
            <SectionRow label={ko ? '전문분야' : 'Expertise'} last>
              {loading ? (
                <Skeleton w="80%" h={32} />
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {EXPERTISE_OPTIONS.map((opt) => {
                    const active = expertise.includes(opt);
                    return (
                      <button key={opt} type="button"
                        onClick={() => handleExpertiseToggle(opt)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '5px 11px', borderRadius: 9999,
                          border: `1.5px solid ${active ? '#6366f1' : '#e5e7eb'}`,
                          background: active ? '#f5f3ff' : '#fff',
                          color: active ? '#4f46e5' : '#374151',
                          fontSize: 12.5, fontWeight: active ? 600 : 500,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 120ms',
                        }}
                        onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = '#9ca3af'; }}
                        onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = '#e5e7eb'; }}
                      >
                        {active && <Icon name="check" size={12} color="#4f46e5" />}
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </SectionRow>

          </div>
        </div>
      </div>

      {rolePortal}

      {pwOpen && (
        <PasswordModal
          userEmail={email}
          onClose={(success) => {
            setPwOpen(false);
            if (success) setPwSuccess(true);
          }}
        />
      )}
    </>
  );
}
