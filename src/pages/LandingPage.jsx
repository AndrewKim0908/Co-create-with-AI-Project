import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const THEME_STORAGE_KEY = 'co-create-landing-theme';

function readStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [theme, setTheme] = useState(readStoredTheme);
  const observerRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.15 },
    );
    document.querySelectorAll('.landing-root .reveal').forEach((el) => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, []);

  const navStyle = useMemo(
    () => ({
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 48px',
      height: 64,
      background:
        scrollY > 40
          ? theme === 'dark'
            ? 'rgba(15,22,36,0.92)'
            : 'rgba(248,250,252,0.92)'
          : 'transparent',
      backdropFilter: scrollY > 40 ? 'blur(16px)' : 'none',
      borderBottom:
        scrollY > 40
          ? theme === 'dark'
            ? '1px solid rgba(6,182,212,0.12)'
            : '1px solid rgba(6,182,212,0.2)'
          : 'none',
      transition: 'all 0.3s ease',
    }),
    [scrollY, theme],
  );

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <div className="landing-root" data-theme={theme}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300;0,400;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        .landing-root * { box-sizing: border-box; margin: 0; padding: 0; }

        .landing-root[data-theme="dark"] {
          --em: #06b6d4;
          --em-d: #0891b2;
          --em-l: rgba(6,182,212,0.12);
          --bg: #0a1628;
          --bg2: #0f1e30;
          --bg3: #14243a;
          --txt: #f0f4f8;
          --muted: #7a9bb5;
          --border: rgba(255,255,255,0.07);
          --nav-fade: rgba(15,22,36,0.92);
          --ghost-border: rgba(255,255,255,0.18);
          --ghost-hover-bg: rgba(255,255,255,0.05);
        }

        .landing-root[data-theme="light"] {
          --em: #0891b2;
          --em-d: #0e7490;
          --em-l: rgba(6,182,212,0.14);
          --bg: #f8fafc;
          --bg2: #f1f5f9;
          --bg3: #e2e8f0;
          --txt: #0f172a;
          --muted: #64748b;
          --border: rgba(15,23,42,0.1);
          --nav-fade: rgba(248,250,252,0.92);
          --ghost-border: rgba(15,23,42,0.18);
          --ghost-hover-bg: rgba(15,23,42,0.06);
        }

        .landing-root {
          min-height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          background: var(--bg);
          color: var(--txt);
          font-family: 'DM Sans', sans-serif;
        }

        .landing-root .reveal {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .landing-root .reveal.visible { opacity: 1; transform: translateY(0); }
        .landing-root .reveal-d1 { transition-delay: 0.1s; }
        .landing-root .reveal-d2 { transition-delay: 0.2s; }
        .landing-root .reveal-d3 { transition-delay: 0.3s; }

        .landing-root .hero-glow {
          position: absolute;
          width: 900px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(6,182,212,0.15) 0%, transparent 70%);
          top: -100px; left: 50%; transform: translateX(-50%);
          pointer-events: none;
        }
        .landing-root[data-theme="light"] .hero-glow {
          background: radial-gradient(ellipse, rgba(6,182,212,0.12) 0%, transparent 70%);
        }

        .landing-root .grid-bg {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 0%, transparent 70%);
          pointer-events: none;
        }
        .landing-root[data-theme="light"] .grid-bg {
          background-image:
            linear-gradient(rgba(6,182,212,0.08) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6,182,212,0.08) 1px, transparent 1px);
        }

        .landing-root .badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 14px; border-radius: 999px;
          border: 1px solid rgba(6,182,212,0.35);
          background: rgba(6,182,212,0.08);
          font-size: 13px; color: var(--em);
          font-family: 'DM Sans', sans-serif;
        }

        .landing-root .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--em); animation: landing-pulse 2s infinite; }
        @keyframes landing-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }

        .landing-root h1 {
          font-family: 'Fraunces', serif;
          font-size: clamp(48px, 6.5vw, 82px);
          font-weight: 300; line-height: 1.08; letter-spacing: -2px;
          color: var(--txt);
        }
        .landing-root h1 em { font-style: italic; color: var(--em); }

        .landing-root .btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 10px;
          background: var(--em); color: white;
          font-size: 15px; font-weight: 500; font-family: 'DM Sans', sans-serif;
          border: none; cursor: pointer; text-decoration: none;
          transition: all 0.2s;
        }
        .landing-root .btn-primary:hover { background: var(--em-d); transform: translateY(-2px); box-shadow: 0 8px 24px rgba(6,182,212,0.3); }

        .landing-root .btn-ghost {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 10px;
          background: transparent; color: var(--txt);
          font-size: 15px; font-weight: 400; font-family: 'DM Sans', sans-serif;
          border: 1px solid var(--ghost-border); cursor: pointer; text-decoration: none;
          transition: all 0.2s;
        }
        .landing-root .btn-ghost:hover { border-color: var(--em); background: var(--ghost-hover-bg); }

        .landing-root .theme-toggle {
          display: inline-flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 10px;
          border: 1px solid var(--ghost-border);
          background: transparent; color: var(--txt);
          cursor: pointer;
          transition: all 0.2s;
        }
        .landing-root .theme-toggle:hover {
          border-color: var(--em);
          background: var(--ghost-hover-bg);
        }

        .landing-root .mockup-wrap {
          width: 100%; max-width: 960px; margin: 0 auto;
          border-radius: 18px; overflow: hidden;
          border: 1px solid var(--border);
          box-shadow: 0 48px 96px rgba(0,0,0,0.35), 0 0 0 1px rgba(6,182,212,0.05);
        }
        .landing-root[data-theme="light"] .mockup-wrap {
          box-shadow: 0 24px 48px rgba(15,23,42,0.12), 0 0 0 1px rgba(6,182,212,0.08);
        }

        .landing-root .mockup-bar {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .landing-root[data-theme="dark"] .mockup-bar {
          background: #071220;
        }
        .landing-root[data-theme="light"] .mockup-bar {
          background: #e2e8f0;
          border-bottom-color: #cbd5e1;
        }

        .landing-root .dot { width: 10px; height: 10px; border-radius: 50%; }
        .landing-root .url-bar {
          flex: 1;
          border-radius: 5px;
          padding: 3px 12px;
          font-size: 11px;
          margin: 0 12px;
          text-align: center;
          font-family: 'DM Sans', sans-serif;
        }
        .landing-root[data-theme="dark"] .url-bar {
          background: rgba(255,255,255,0.05);
          color: var(--muted);
        }
        .landing-root[data-theme="light"] .url-bar {
          background: rgba(255,255,255,0.85);
          color: #64748b;
        }

        .landing-root .mockup-inner {
          display: flex;
          flex-direction: column;
          min-height: 400px;
          font-family: 'DM Sans', sans-serif;
        }
        .landing-root[data-theme="dark"] .mockup-inner {
          background: #0d1b2e;
        }
        .landing-root[data-theme="light"] .mockup-inner {
          background: #f8fafc;
        }

        .landing-root[data-theme="dark"] .mockup-sidebar {
          background: #071220;
        }
        .landing-root[data-theme="light"] .mockup-sidebar {
          background: #1e2b3c;
        }
        .landing-root[data-theme="light"] .mockup-sidebar .mockup-text {
          color: #f1f5f9;
        }
        .landing-root[data-theme="light"] .mockup-sidebar .mockup-muted {
          color: #94a3b8;
        }
        .landing-root[data-theme="light"] .mockup-sidebar .ws-chat-bubble {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.12);
          color: #f1f5f9;
        }

        .landing-root[data-theme="dark"] .mockup-kpi {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
        }
        .landing-root[data-theme="light"] .mockup-kpi {
          background: #f1f5f9;
          border-color: #e2e8f0;
        }

        .landing-root[data-theme="dark"] .mockup-text {
          color: #f0f4f8;
        }
        .landing-root[data-theme="light"] .mockup-text {
          color: #1e293b;
        }

        .landing-root[data-theme="dark"] .mockup-muted {
          color: #7a9bb5;
        }
        .landing-root[data-theme="light"] .mockup-muted {
          color: #64748b;
        }

        .landing-root .ws-app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          font-size: 10px;
        }
        .landing-root[data-theme="light"] .ws-app-header {
          border-bottom-color: #e2e8f0;
        }

        .landing-root .ws-body {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .landing-root .mockup-sidebar {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          border-right: 1px solid rgba(255,255,255,0.07);
        }
        .landing-root[data-theme="light"] .mockup-sidebar {
          border-right-color: #334155;
        }

        .landing-root .ws-timeline {
          padding: 8px 10px 6px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .landing-root[data-theme="light"] .ws-timeline {
          border-bottom-color: rgba(51,65,85,0.5);
        }

        .landing-root .ws-timeline-dots {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 6px;
        }
        .landing-root .ws-timeline-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
        }
        .landing-root[data-theme="light"] .ws-timeline-dot {
          background: rgba(255,255,255,0.25);
        }
        .landing-root .ws-timeline-dot.active {
          background: var(--em);
          box-shadow: 0 0 0 2px rgba(6,182,212,0.35);
        }

        .landing-root .ws-canvas-wrap {
          flex: 1;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .landing-root .ws-canvas {
          flex: 1;
          border-radius: 8px;
          border: 1px dashed rgba(6,182,212,0.35);
          background: rgba(6,182,212,0.06);
          position: relative;
          min-height: 120px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .landing-root[data-theme="light"] .ws-canvas {
          background: rgba(241,245,249,0.9);
          border-color: rgba(6,182,212,0.35);
        }

        .landing-root .ws-canvas-hint {
          font-size: 9px;
          text-align: center;
          padding: 0 12px;
          line-height: 1.4;
        }

        .landing-root .ws-marker-pin {
          position: absolute;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #f87171;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        .landing-root .ws-marker-pin.emerald { background: var(--em); }
        .landing-root .ws-marker-pin.amber { background: #fbbf24; }

        .landing-root .ws-chat {
          padding: 6px 10px 8px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .landing-root[data-theme="light"] .ws-chat {
          border-top-color: rgba(51,65,85,0.5);
        }

        .landing-root .ws-chat-row {
          display: flex;
          gap: 6px;
          align-items: flex-end;
        }
        .landing-root .ws-chat-bubble {
          max-width: 72%;
          padding: 5px 8px;
          border-radius: 8px 8px 8px 2px;
          font-size: 9px;
          line-height: 1.35;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.06);
        }
        .landing-root[data-theme="light"] .ws-chat-bubble {
          background: #fff;
          border-color: #e2e8f0;
        }

        .landing-root .ws-right-panel {
          width: 124px;
          flex-shrink: 0;
          padding: 8px 8px 8px 6px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          background: rgba(0,0,0,0.12);
        }
        .landing-root[data-theme="light"] .ws-right-panel {
          background: rgba(241,245,249,0.95);
          border-left: 1px solid #e2e8f0;
        }

        .landing-root .ws-ai-btn {
          width: 100%;
          padding: 6px 6px;
          border-radius: 6px;
          border: none;
          font-size: 8px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          background: var(--em);
          color: #fff;
          cursor: default;
          line-height: 1.25;
        }

        .landing-root .mockup-kpi {
          border-radius: 6px;
          padding: 6px 7px;
          font-size: 8px;
          line-height: 1.35;
        }

        .landing-root .mockup-kpi-title {
          font-size: 7px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 4px;
        }

        .landing-root .feat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; max-width: 1060px; margin: 0 auto; }

        .landing-root .feat-card {
          background: var(--bg2);
          border: 1px solid var(--border);
          border-radius: 16px; padding: 30px;
          transition: all 0.3s; position: relative; overflow: hidden;
        }
        .landing-root .feat-card::after {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, var(--em), transparent);
          opacity: 0; transition: opacity 0.3s;
        }
        .landing-root .feat-card:hover { border-color: rgba(6,182,212,0.25); transform: translateY(-5px); }
        .landing-root .feat-card:hover::after { opacity: 1; }

        .landing-root .feat-icon {
          width: 44px; height: 44px; border-radius: 11px;
          background: var(--em-l); border: 1px solid rgba(6,182,212,0.2);
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 18px;
        }
        .landing-root .feat-title { font-size: 17px; font-weight: 500; margin-bottom: 10px; font-family: 'DM Sans', sans-serif; color: var(--txt); }
        .landing-root .feat-desc { font-size: 14px; line-height: 1.75; color: var(--muted); font-family: 'DM Sans', sans-serif; }

        .landing-root .stats-row {
          display: grid; grid-template-columns: repeat(4,1fr);
          max-width: 860px; margin: 0 auto; gap: 0;
        }
        .landing-root .stat-item { text-align: center; padding: 40px 20px; border-right: 1px solid var(--border); }
        .landing-root .stat-item:last-child { border-right: none; }
        .landing-root .stat-num {
          font-family: 'Fraunces', serif;
          font-size: 52px; font-weight: 300; color: var(--em); line-height: 1; margin-bottom: 8px;
        }
        .landing-root .stat-label { font-size: 14px; color: var(--muted); font-family: 'DM Sans', sans-serif; }

        .landing-root .how-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 0; max-width: 900px; margin: 0 auto; }
        .landing-root .how-step {
          padding: 32px; text-align: center;
          border-right: 1px solid var(--border);
          position: relative;
        }
        .landing-root .how-step:last-child { border-right: none; }
        .landing-root .how-num {
          font-family: 'Fraunces', serif;
          font-size: 56px; font-weight: 300; color: rgba(6,182,212,0.2);
          line-height: 1; margin-bottom: 16px;
        }
        .landing-root[data-theme="light"] .how-num { color: rgba(6,182,212,0.25); }
        .landing-root .how-title { font-size: 16px; font-weight: 500; margin-bottom: 10px; font-family: 'DM Sans', sans-serif; color: var(--txt); }
        .landing-root .how-desc { font-size: 14px; color: var(--muted); line-height: 1.7; font-family: 'DM Sans', sans-serif; }

        .landing-root footer {
          border-top: 1px solid var(--border);
          padding: 36px 60px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .landing-root .footer-copy { font-size: 13px; color: var(--muted); font-family: 'DM Sans', sans-serif; }
        .landing-root .footer-links { display: flex; gap: 24px; }
        .landing-root .footer-links a { font-size: 13px; color: var(--muted); text-decoration: none; font-family: 'DM Sans', sans-serif; transition: color 0.2s; }
        .landing-root .footer-links a:hover { color: var(--txt); }

        @keyframes landing-fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <nav style={navStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: 'var(--em)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'DM Sans', sans-serif",
              fontWeight: 700,
              fontSize: 14,
              color: 'white',
            }}
          >
            C
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, fontFamily: "'DM Sans', sans-serif" }}>Co-Create AI</div>
            <div
              style={{
                fontSize: 9,
                color: 'var(--muted)',
                letterSpacing: '1.2px',
                textTransform: 'uppercase',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Decision Sprint Platform
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32 }}>
          {['Features', 'How it works', 'Results'].map((l) => (
            <a
              key={l}
              href={`#${l.toLowerCase().replace(/ /g, '-')}`}
              style={{
                fontSize: 14,
                color: 'var(--muted)',
                textDecoration: 'none',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.color = 'var(--txt)';
              }}
              onMouseLeave={(e) => {
                e.target.style.color = 'var(--muted)';
              }}
            >
              {l}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="theme-toggle"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <button className="btn-ghost" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => navigate('/login')}>
            Log in
          </button>
          <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 14 }} onClick={() => navigate('/signup')}>
            Get started
          </button>
        </div>
      </nav>

      <section
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '120px 48px 80px',
          position: 'relative',
          textAlign: 'center',
          overflow: 'hidden',
        }}
      >
        <div className="hero-glow" />
        <div className="grid-bg" />

        <div className="badge" style={{ marginBottom: 32, animation: 'landing-fadeUp 0.6s ease both' }}>
          <span className="pulse" />
          AI-powered design collaboration
        </div>

        <h1
          style={{
            marginBottom: 28,
            animation: 'landing-fadeUp 0.6s 0.1s ease both',
            opacity: 0,
            animationFillMode: 'forwards',
          }}
        >
          Where design teams
          <br />
          reach <em>consensus</em> faster
        </h1>

        <p
          style={{
            fontSize: 18,
            lineHeight: 1.75,
            color: 'var(--muted)',
            maxWidth: 520,
            margin: '0 auto 48px',
            animation: 'landing-fadeUp 0.6s 0.2s ease both',
            opacity: 0,
            animationFillMode: 'forwards',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Structured decision sprints that resolve conflicts, align priorities, and build consensus — powered by AI that
          understands your project&apos;s core values.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            marginBottom: 72,
            animation: 'landing-fadeUp 0.6s 0.3s ease both',
            opacity: 0,
            animationFillMode: 'forwards',
          }}
        >
          <button className="btn-primary" onClick={() => navigate('/signup')}>
            Start for free
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <a href="#features" className="btn-ghost">
            See how it works
          </a>
        </div>

        <div
          className="mockup-wrap reveal"
          style={{ animation: 'landing-fadeUp 0.9s 0.4s ease both', opacity: 0, animationFillMode: 'forwards' }}
        >
          <div className="mockup-bar">
            <span className="dot" style={{ background: '#ff5f57' }} />
            <span className="dot" style={{ background: '#ffbd2e' }} />
            <span className="dot" style={{ background: '#28c840' }} />
            <div className="url-bar">app.example.com/project/purifier-01/sprints</div>
          </div>
          <div className="mockup-inner">
            <div className="ws-app-header">
              <span className="mockup-text" style={{ fontWeight: 600 }}>
                ← Back
              </span>
              <span className="mockup-text" style={{ fontWeight: 600, flex: 1, textAlign: 'center' }}>
                Modular Air Purifier — Sprint #2
              </span>
              <span className="mockup-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Overview <span aria-hidden>🌐</span>
              </span>
            </div>
            <div className="ws-body">
              <div className="mockup-sidebar">
                <div className="ws-timeline">
                  <div className="mockup-muted" style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Sprint timeline
                  </div>
                  <div className="ws-timeline-dots">
                    <div className="ws-timeline-dot" title="Sprint 1" />
                    <div className="ws-timeline-dot active" title="Sprint 2" />
                    <div className="ws-timeline-dot" title="Sprint 3" />
                  </div>
                </div>
                <div className="ws-canvas-wrap">
                  <div className="mockup-muted" style={{ fontSize: 8, marginBottom: 4, fontWeight: 600 }}>
                    Design canvas
                  </div>
                  <div className="ws-canvas">
                    <div className="ws-canvas-hint mockup-muted">
                      Drop a design file or paste an image — teammates add markers on the blueprint.
                    </div>
                    <div className="ws-marker-pin" style={{ top: '28%', left: '34%' }} />
                    <div className="ws-marker-pin emerald" style={{ top: '52%', left: '58%' }} />
                    <div className="ws-marker-pin amber" style={{ top: '68%', left: '42%' }} />
                  </div>
                </div>
                <div className="ws-chat">
                  <div className="mockup-muted" style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Team chat
                  </div>
                  <div className="ws-chat-row">
                    <div className="ws-chat-bubble mockup-text">
                      <strong className="mockup-muted">Alex ·</strong> Can we soften the corner radius on the intake grille?
                    </div>
                  </div>
                </div>
              </div>
              <div className="ws-right-panel">
                <button type="button" className="ws-ai-btn">
                  Request AI Analysis
                </button>
                <div className="mockup-kpi">
                  <div className="mockup-kpi-title mockup-muted">Active conflict</div>
                  <div className="mockup-text" style={{ fontWeight: 600 }}>
                    Finish vs. tool-less assembly
                  </div>
                </div>
                <div className="mockup-kpi">
                  <div className="mockup-kpi-title mockup-muted">Positions</div>
                  <div className="mockup-text" style={{ fontSize: 7, lineHeight: 1.4 }}>
                    <span className="mockup-muted">Design:</span> soft-touch coat
                    <br />
                    <span className="mockup-muted">Eng:</span> snap-fit tolerance
                  </div>
                </div>
                <div className="mockup-kpi">
                  <div className="mockup-kpi-title mockup-muted">Alternative proposal</div>
                  <div className="mockup-text" style={{ fontSize: 7, lineHeight: 1.4 }}>
                    Hybrid snap-fit + textured grip ring; ±0.2 mm on critical snaps.
                  </div>
                  <div className="mockup-muted" style={{ fontSize: 6, marginTop: 4 }}>
                    Awaiting votes · 2 of 3 approved
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          background: 'var(--bg2)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '0',
        }}
        id="results"
      >
        <div className="stats-row reveal">
          {[
            { num: '3×', label: 'faster decisions' },
            { num: '91%', label: 'avg consensus rate' },
            { num: '50%', label: 'fewer revision cycles' },
            { num: '∞', label: 'AI-powered sprints' },
          ].map((s, i) => (
            <div className="stat-item reveal" style={{ transitionDelay: `${i * 0.1}s` }} key={s.label}>
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" style={{ padding: '100px 48px', textAlign: 'center' }}>
        <div className="badge reveal" style={{ marginBottom: 20 }}>
          How it works
        </div>
        <h2
          className="reveal reveal-d1"
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(32px,4vw,50px)',
            fontWeight: 300,
            letterSpacing: -1,
            marginBottom: 64,
            lineHeight: 1.15,
            color: 'var(--txt)',
          }}
        >
          Three steps to consensus
        </h2>
        <div className="how-grid">
          {[
            {
              n: '01',
              title: 'Set your North Star',
              desc: "Define your project's non-negotiable goal and conflict priorities. AI uses these as the foundation for all mediation.",
            },
            {
              n: '02',
              title: 'Sprint through conflicts',
              desc: 'Team members share positions, upload designs, and discuss in real-time. AI reads every message and image.',
            },
            {
              n: '03',
              title: 'Reach consensus',
              desc: 'AI proposes data-driven alternatives. The team votes. When all approve, the sprint closes and the next begins.',
            },
          ].map((s, i) => (
            <div className="how-step reveal" style={{ transitionDelay: `${i * 0.15}s` }} key={s.n}>
              <div className="how-num">{s.n}</div>
              <div className="how-title">{s.title}</div>
              <div className="how-desc">{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" style={{ padding: '100px 48px', background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div className="badge reveal" style={{ marginBottom: 20 }}>
            Features
          </div>
          <h2
            className="reveal reveal-d1"
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 'clamp(32px,4vw,50px)',
              fontWeight: 300,
              letterSpacing: -1,
              lineHeight: 1.15,
              marginBottom: 16,
              color: 'var(--txt)',
            }}
          >
            Everything your team needs
            <br />
            to align faster
          </h2>
          <p
            className="reveal reveal-d2"
            style={{
              fontSize: 17,
              color: 'var(--muted)',
              maxWidth: 480,
              margin: '0 auto',
              lineHeight: 1.75,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Structured sprints, AI mediation, and real-time collaboration — all in one place.
          </p>
        </div>
        <div className="feat-grid">
          {[
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: 'Decision Sprints',
              desc: 'Structured, time-boxed sessions that guide teams from conflict to consensus. Every sprint tracks positions, votes, and outcomes.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.091z" />
                </svg>
              ),
              title: 'AI Analysis',
              desc: "AI reads your team's chat and uploaded designs, then proposes a data-driven alternative aligned with your project's North Star.",
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5" />
                </svg>
              ),
              title: 'Value Conflict Matrix',
              desc: 'Visualize where each team member stands against your core values — aesthetics vs function, cost vs quality, speed vs stability.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              ),
              title: 'Real-time Collaboration',
              desc: 'Invite team members, vote on proposals, and watch consensus form live. No async delays — decisions happen together.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                </svg>
              ),
              title: 'Design Upload & Markers',
              desc: 'Upload design files directly into the sprint. Leave pinned comments, annotate conflicts, and keep all feedback in context.',
            },
            {
              icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--em)' }}>
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              ),
              title: 'North Star Alignment',
              desc: 'Define your non-negotiable goal. AI uses it as a red card — flagging any alternative that compromises your core vision.',
            },
          ].map((f, i) => (
            <div className="feat-card reveal" style={{ transitionDelay: `${(i % 3) * 0.1}s` }} key={f.title}>
              <div className="feat-icon">{f.icon}</div>
              <div className="feat-title">{f.title}</div>
              <div className="feat-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '120px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(6,182,212,0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <h2
          className="reveal"
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 'clamp(36px,5vw,60px)',
            fontWeight: 300,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            marginBottom: 20,
            position: 'relative',
            color: 'var(--txt)',
          }}
        >
          Ready to end
          <br />
          <em style={{ fontStyle: 'italic', color: 'var(--em)' }}>decision gridlock?</em>
        </h2>
        <p
          className="reveal reveal-d1"
          style={{
            fontSize: 17,
            color: 'var(--muted)',
            marginBottom: 40,
            position: 'relative',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Join design teams already running faster, clearer sprints.
        </p>
        <div className="reveal reveal-d2" style={{ display: 'flex', gap: 14, justifyContent: 'center', position: 'relative' }}>
          <button className="btn-primary" onClick={() => navigate('/signup')} style={{ padding: '14px 32px', fontSize: 16 }}>
            Start free today
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
          <button className="btn-ghost" onClick={() => navigate('/login')} style={{ padding: '14px 32px', fontSize: 16 }}>
            Log in
          </button>
        </div>
      </section>

      <footer>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'var(--em)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'DM Sans',sans-serif",
              fontWeight: 700,
              fontSize: 12,
              color: 'white',
            }}
          >
            C
          </div>
          <div className="footer-copy">© 2026 Co-Create AI · All rights reserved</div>
        </div>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </div>
  );
}
