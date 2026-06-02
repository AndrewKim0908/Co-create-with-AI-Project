import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '@/components/Icon';
import LangSwitcher from '@/components/LangSwitcher';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import { ROLES, getRoleLabel, EXPERTISE_OPTIONS } from '@/constants/roles';
import { baseColorForUser } from '@/utils/userColors';

// Shared control tokens — mirror SettingsModal so the signup form reads as the
// same family (inputs / role dropdown / expertise dropdown).
const FIELD_LABEL = {
  display: 'block',
  marginBottom: 6,
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
} as const;

const INPUT_BASE = {
  width: '100%',
  padding: '11px 12px',
  borderRadius: 8,
  border: '1px solid #e5e7eb',
  fontSize: 13.5,
  fontFamily: 'inherit',
  outline: 'none',
  color: '#111827',
  background: '#fff',
  boxSizing: 'border-box',
  boxShadow: 'none',
  transition: 'border-color 140ms, box-shadow 140ms',
} as const;

const DROPDOWN_TRIGGER = (open: boolean) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    padding: '11px 12px',
    borderRadius: 8,
    border: `1px solid ${open ? '#06b6d4' : '#e5e7eb'}`,
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: 500,
    color: '#111827',
    boxShadow: open ? '0 0 0 3px rgba(6,182,212,0.15)' : 'none',
    transition: 'border-color 140ms, box-shadow 140ms',
  }) as const;

const DROPDOWN_PANEL = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  zIndex: 50,
  background: '#fff',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
  padding: 6,
  maxHeight: 260,
  overflowY: 'auto',
} as const;

export default function Signup() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isKo = lang === 'ko';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('engineer');
  const [expertise, setExpertise] = useState<string[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: 'idle', text: '' });

  // Dropdown open state + outside-click refs.
  const [roleOpen, setRoleOpen] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const roleWrapRef = useRef<HTMLDivElement>(null);
  const expWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roleOpen && !expOpen) return undefined;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (roleOpen && roleWrapRef.current && !roleWrapRef.current.contains(target)) {
        setRoleOpen(false);
      }
      if (expOpen && expWrapRef.current && !expWrapRef.current.contains(target)) {
        setExpOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [roleOpen, expOpen]);

  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = useMemo(
    () =>
      fullName.trim().length > 0 &&
      email.trim().length > 0 &&
      password.length >= 6 &&
      confirmPassword.length > 0 &&
      passwordsMatch,
    [fullName, email, password, confirmPassword, passwordsMatch],
  );

  function toggleExpertise(opt: string) {
    setExpertise((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;

    setBusy(true);
    setMsg({ type: 'idle', text: '' });

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          role,
          expertise,
        },
      },
    });

    if (error) {
      setMsg({ type: 'error', text: error.message });
      setBusy(false);
      return;
    }

    // The handle_new_user trigger creates the profiles row with full_name+email
    // only, so persist role + expertise directly. Auto-confirm means a session
    // exists right after signUp, so this update passes RLS. Soft-fail: a write
    // error must not block the success message.
    const newUserId = data?.user?.id;
    if (newUserId) {
      await supabase
        .from('profiles')
        .update({ role, expertise })
        .eq('id', newUserId);
    }

    setMsg({
      type: 'success',
      text: isKo
        ? '회원가입이 완료되었습니다. 이메일 인증 후 로그인해 주세요.'
        : 'Account created. Please verify your email and sign in.',
    });
    setBusy(false);
  }

  const roleDotColor = email.trim() ? baseColorForUser(email) : '#9ca3af';

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-white px-4 py-10 font-sans">
      <div className="absolute left-6 top-5 z-10">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-sm font-medium text-fg-2 shadow-sm backdrop-blur-sm transition-colors hover:border-slate-300 hover:bg-white hover:text-fg-1 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        >
          <span aria-hidden>←</span>
          Back to home
        </button>
      </div>
      <div className="absolute right-6 top-5 z-10">
        <LangSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="flex w-full max-w-md flex-col items-center gap-8"
      >
        <header className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white shadow-sm">
            <img src="/assets/logo-v2.png" alt="Co-Create AI" className="h-10 w-10 rounded-md object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-1">
            {isKo ? '계정 만들기' : 'Create your account'}
          </h1>
          <p className="mt-1 text-sm text-fg-3">
            {isKo ? '전문 하드웨어 협업 도구를 시작해 보세요.' : 'Get started with professional hardware tools.'}
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="w-full rounded-xl bg-white p-7"
        >
          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="fullName" style={FIELD_LABEL}>
              {isKo ? '이름' : 'Full Name'}
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder={isKo ? '홍길동' : 'Alex Rivera'}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              style={INPUT_BASE}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.15)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Email */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="email" style={FIELD_LABEL}>
              {isKo ? '이메일' : 'Email'}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder={isKo ? 'name@company.com' : 'alex@forgecore.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={INPUT_BASE}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.15)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="password" style={FIELD_LABEL}>
              {isKo ? '비밀번호' : 'Password'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={6}
                placeholder={isKo ? '6자 이상 입력' : 'At least 6 characters'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ ...INPUT_BASE, paddingRight: 38 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#06b6d4'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.15)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex',
                }}
              >
                <Icon name={showPassword ? 'eye' : 'eye-off'} size={16} color="#9ca3af" />
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="confirmPassword" style={FIELD_LABEL}>
              {isKo ? '비밀번호 확인' : 'Confirm Password'}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                placeholder={isKo ? '비밀번호를 다시 입력' : 'Re-enter your password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  ...INPUT_BASE,
                  paddingRight: 38,
                  border: `1.5px solid ${confirmPassword.length > 0 && !passwordsMatch ? '#f2b8b4' : '#e5e7eb'}`,
                }}
                onFocus={(e) => {
                  const err = confirmPassword.length > 0 && !passwordsMatch;
                  e.currentTarget.style.borderColor = err ? '#D05045' : '#06b6d4';
                  e.currentTarget.style.boxShadow = err
                    ? '0 0 0 3px rgba(208,80,69,0.15)'
                    : '0 0 0 3px rgba(6,182,212,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor =
                    confirmPassword.length > 0 && !passwordsMatch ? '#f2b8b4' : '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 6, display: 'flex',
                }}
              >
                <Icon name={showConfirmPassword ? 'eye' : 'eye-off'} size={16} color="#9ca3af" />
              </button>
            </div>
            {confirmPassword.length > 0 && !passwordsMatch ? (
              <p style={{ marginTop: 6, fontSize: 12, color: '#D05045' }}>
                {isKo ? '비밀번호가 일치하지 않습니다.' : 'Passwords do not match.'}
              </p>
            ) : null}
          </div>

          {/* Role — shared dropdown (ROLES + getRoleLabel) */}
          <div style={{ marginBottom: 16 }}>
            <label style={FIELD_LABEL}>{isKo ? '역할' : 'Role'}</label>
            <div ref={roleWrapRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setRoleOpen((v) => !v); setExpOpen(false); }}
                style={DROPDOWN_TRIGGER(roleOpen)}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: roleDotColor }} />
                <span style={{ flex: 1, textAlign: 'left' }}>{getRoleLabel(role, lang)}</span>
                <Icon name={roleOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
              </button>
              {roleOpen ? (
                <div style={DROPDOWN_PANEL}>
                  {ROLES.map((r) => {
                    const active = role === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setRole(r.id); setRoleOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '7px 10px', borderRadius: 7,
                          background: active ? '#ecfeff' : 'transparent',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 13, fontWeight: active ? 600 : 400,
                          color: active ? '#0891b2' : '#374151', textAlign: 'left',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = active ? '#ecfeff' : 'transparent'; }}
                      >
                        <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {active && <Icon name="check" size={14} color="#0891b2" />}
                        </span>
                        {getRoleLabel(r.id, lang)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          {/* Expertise — compact multi-select dropdown */}
          <div style={{ marginBottom: 20 }}>
            <label style={FIELD_LABEL}>{isKo ? '전문분야' : 'Expertise'}</label>
            <div ref={expWrapRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => { setExpOpen((v) => !v); setRoleOpen(false); }}
                style={{ ...DROPDOWN_TRIGGER(expOpen), alignItems: 'center' }}
              >
                <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
                  {expertise.length === 0 ? (
                    <span style={{ color: '#9ca3af', fontWeight: 400 }}>
                      {isKo ? '전문분야 선택 (선택)' : 'Select expertise (optional)'}
                    </span>
                  ) : (
                    <>
                      {expertise.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '2px 8px', borderRadius: 9999,
                            background: '#ecfeff', color: '#0891b2',
                            border: '1px solid #a5f3fc',
                            fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {expertise.length > 3 ? (
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6b7280', alignSelf: 'center' }}>
                          +{expertise.length - 3}
                        </span>
                      ) : null}
                    </>
                  )}
                </div>
                <Icon name={expOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
              </button>
              {expOpen ? (
                <div style={DROPDOWN_PANEL}>
                  {EXPERTISE_OPTIONS.map((opt) => {
                    const active = expertise.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleExpertise(opt)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                          padding: '7px 10px', borderRadius: 7,
                          background: active ? '#ecfeff' : 'transparent',
                          border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          fontSize: 13, fontWeight: active ? 600 : 400,
                          color: active ? '#0891b2' : '#374151', textAlign: 'left',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f9fafb'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = active ? '#ecfeff' : 'transparent'; }}
                      >
                        <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {active && <Icon name="check" size={14} color="#0891b2" />}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:hover:bg-slate-100 disabled:hover:shadow-none"
          >
            <span>{busy ? (isKo ? '처리 중...' : 'Processing...') : (isKo ? '회원가입 완료' : 'Create Account')}</span>
            <Icon
              name="arrow-right"
              size={15}
              className="transition-transform group-hover:translate-x-0.5 group-disabled:transform-none"
            />
          </button>

          {msg.type !== 'idle' ? (
            <div className={`mt-3 text-xs ${msg.type === 'error' ? 'text-coral-600' : 'text-emerald-700'}`}>
              {msg.text}
            </div>
          ) : null}

          <p className="mt-5 text-center text-xs text-fg-3">
            {isKo ? '이미 계정이 있으신가요?' : 'Already have an account?'}{' '}
            <Link to="/" className="font-semibold text-emerald-600 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline">
              {isKo ? '로그인하기' : 'Sign in'}
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
