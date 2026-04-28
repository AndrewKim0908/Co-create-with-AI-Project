import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';

// ─── Blueprint viewer ────────────────────────────────────────
function PulsePin({ pin, active, onClick }) {
  const [hov, setHov] = useState(false);
  const isConflict = pin.status === 'conflict';
  const color = isConflict ? C.coral : C.amber;
  const posMap = {
    1: { top: 135, left: 120 },
    2: { top: 71,  left: 230 },
    3: { top: 208, left: 174 },
  };
  const pos = posMap[pin.id];

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'absolute', top: pos.top, left: pos.left,
        cursor: 'pointer', zIndex: 10,
      }}
    >
      <div
        style={{
          width: 24, height: 24, borderRadius: '50%',
          background: color, border: '2px solid white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: '#fff',
          animation: isConflict ? 'pulse-ring 2s ease-out infinite' : 'none',
          boxShadow: `0 2px 8px ${color}60`,
          transition: 'transform 120ms',
          transform: hov || active ? 'scale(1.2)' : 'scale(1)',
        }}
      >
        {pin.id}
      </div>
      {(hov || active) && (
        <div
          style={{
            position: 'absolute', left: 28, top: -4,
            background: C.fg1, color: '#fff', fontSize: 10, fontWeight: 500,
            padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(30,42,53,0.2)',
            animation: 'fadeIn 0.15s ease both',
          }}
        >
          {pin.label} · {pin.title}
        </div>
      )}
    </div>
  );
}

function BlueprintViewer({ activePin, onPinClick }) {
  const { t, lang } = useLang();
  const pins = [
    { id: 1, label: 'CF-01', status: 'conflict', title: t('cfTitle') },
    { id: 2, label: 'CF-02', status: 'pending',  title: 'PCB connector J4' },
    { id: 3, label: 'CF-03', status: 'conflict', title: lang === 'ko' ? '벽 두께' : lang === 'zh' ? '壁厚' : 'Wall thickness' },
  ];

  return (
    <div
      style={{
        flex: 1, background: '#F8FAFC', position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <defs>
          <pattern id="smallGrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E2E8ED" strokeWidth="0.5" />
          </pattern>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#smallGrid)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#C5D0D9" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div style={{ position: 'relative' }}>
        <svg
          width="460" height="340" viewBox="0 0 460 340"
          style={{ filter: 'drop-shadow(0 8px 32px rgba(30,42,53,0.12))' }}
        >
          <rect x="30" y="30" width="400" height="280" rx="4" fill="white" stroke="#3A4A58" strokeWidth="2" />
          <rect x="55" y="55" width="350" height="230" rx="2" fill="none" stroke="#62788A" strokeWidth="1" strokeDasharray="6,3" />
          <rect x="70" y="70" width="200" height="140" fill="#EDF7F2" stroke="#1E8A5A" strokeWidth="1.5" />
          <text x="170" y="145" textAnchor="middle" style={{ fontSize: 9, fill: '#1E8A5A', fontFamily: 'monospace', fontWeight: 600 }}>
            PCB-A · Rev.3
          </text>
          <rect x="255" y="78" width="28" height="14" rx="2" fill="#FEF0CC" stroke="#C88A1A" strokeWidth="1" />
          <text x="269" y="87" textAnchor="middle" style={{ fontSize: 7, fill: '#7A5500', fontFamily: 'monospace', fontWeight: 600 }}>
            J4
          </text>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={300 + i * 14} y="70" width="8" height="140" fill="#EAF0F5" stroke="#9BAAB7" strokeWidth="0.8" />
          ))}
          <text x="385" y="145" textAnchor="middle" style={{ fontSize: 8, fill: '#62788A', fontFamily: 'monospace' }}>
            COOLING
          </text>
          {[[68, 68], [270, 68], [68, 208], [270, 208]].map(([cx, cy], i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r="5"
              fill="white"
              stroke={i === 0 ? C.coral : '#3A4A58'}
              strokeWidth={i === 0 ? 2 : 1.5}
            />
          ))}
          <rect x="130" y="170" width="60" height="36" rx="2" fill="#EDF7F2" stroke="#1E8A5A" strokeWidth="1" />
          <text x="160" y="192" textAnchor="middle" style={{ fontSize: 8, fill: '#1E8A5A', fontFamily: 'monospace' }}>
            THERMAL
          </text>
          <line x1="70" y1="240" x2="270" y2="240" stroke="#9BAAB7" strokeWidth="0.8" strokeDasharray="4,2" />
          <text x="170" y="254" textAnchor="middle" style={{ fontSize: 8, fill: '#9BAAB7', fontFamily: 'monospace' }}>
            200mm
          </text>
          <line x1="290" y1="70" x2="290" y2="210" stroke="#9BAAB7" strokeWidth="0.8" strokeDasharray="4,2" />
          <text x="302" y="143" style={{ fontSize: 8, fill: '#9BAAB7', fontFamily: 'monospace' }}>
            140mm
          </text>
          <line x1="68" y1="68" x2="100" y2="40" stroke={C.coral} strokeWidth="1" strokeDasharray="3,2" />
          <rect x="100" y="24" width="96" height="20" rx="2" fill={C.coralLight} stroke={C.coralBorder} strokeWidth="1" />
          <text x="148" y="37" textAnchor="middle" style={{ fontSize: 8.5, fill: C.coral, fontFamily: 'monospace', fontWeight: 600 }}>
            ±0.3mm — CONFLICT
          </text>
        </svg>
        {pins.map((pin) => (
          <PulsePin key={pin.id} pin={pin} active={activePin === pin.id} onClick={() => onPinClick(pin.id)} />
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 4 }}>
        {['zoom-in', 'zoom-out', 'maximize-2', 'layers'].map((icon) => (
          <button
            key={icon}
            style={{
              width: 30, height: 30, borderRadius: 4,
              background: C.white, border: `1px solid ${C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
            }}
          >
            <Icon name={icon} size={13} color={C.fg3} />
          </button>
        ))}
      </div>

      <div
        style={{
          position: 'absolute', bottom: 18, left: 16,
          fontSize: 10, color: C.fg3, fontFamily: 'monospace',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <div style={{ width: 40, height: 2, background: C.fg3 }} /> 20mm
      </div>
    </div>
  );
}

// ─── Chat panel ──────────────────────────────────────────────
function ChatPanel() {
  const { t, lang } = useLang();
  const [input, setInput] = useState('');
  const scrollRef = useRef(null);

  const messages = [
    { type: 'system', text: t('chatSys1') },
    { type: 'user',   name: 'Andrew Kim',  role: lang === 'ko' ? '디자이너' : lang === 'zh' ? '设计师' : 'Designer', initials: 'AK', color: '#3A6EA5', text: t('chatMsg1') },
    { type: 'user',   name: 'Lee Sungmin', role: lang === 'ko' ? '엔지니어' : lang === 'zh' ? '工程师' : 'Engineer', initials: 'LS', color: C.emerald,  text: t('chatMsg2') },
    { type: 'user',   name: 'Andrew Kim',  role: lang === 'ko' ? '디자이너' : lang === 'zh' ? '设计师' : 'Designer', initials: 'AK', color: '#3A6EA5', text: t('chatMsg3') },
    { type: 'system', text: t('chatDeadlock') },
    { type: 'ai',     text: t('chatAI1') },
    { type: 'ai',     isOptionC: true, text: t('chatOptionC') },
  ];

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lang]);

  return (
    <div
      style={{
        width: 220, background: C.white,
        borderLeft: `1px solid ${C.borderSubtle}`,
        borderRight: `1px solid ${C.borderSubtle}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '10px 12px', borderBottom: `1px solid ${C.borderSubtle}`,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <Icon name="message-square" size={13} color={C.fg3} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.fg2 }}>{t('aiMediation')}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <div
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: C.emerald, animation: 'pulse-dot 2s infinite',
            }}
          />
          <span style={{ fontSize: 10, color: C.fg3 }}>{t('live')}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: 'auto', padding: '10px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {messages.map((msg, i) => {
          if (msg.type === 'system') {
            return (
              <div
                key={i}
                style={{ textAlign: 'center', fontSize: 10, color: C.fg4, padding: '2px 0' }}
              >
                {msg.text}
              </div>
            );
          }
          if (msg.type === 'user') {
            return (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <div
                  style={{
                    width: 22, height: 22, borderRadius: 3,
                    background: msg.color, color: '#fff',
                    fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {msg.initials}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.fg2, marginBottom: 2 }}>
                    {msg.name}{' '}
                    <span style={{ fontWeight: 400, color: C.fg4 }}>· {msg.role}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 11, color: C.fg2, lineHeight: 1.5,
                      background: C.subtle, padding: '6px 8px',
                      borderRadius: '0 5px 5px 5px',
                      border: `1px solid ${C.borderSubtle}`,
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          }
          // ai
          return (
            <div key={i} style={{ display: 'flex', gap: 6 }}>
              <div
                style={{
                  width: 22, height: 22, borderRadius: 3,
                  background: 'linear-gradient(135deg,#1E8A5A,#25A46C)',
                  color: '#fff', fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                AI
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.emerald, marginBottom: 2 }}>
                  Co-Create AI
                </div>
                <div
                  style={{
                    fontSize: 11, color: msg.isOptionC ? C.fg1 : C.fg2, lineHeight: 1.5,
                    background: msg.isOptionC ? C.emeraldLight : C.subtle,
                    padding: '6px 8px', borderRadius: '0 5px 5px 5px',
                    border: `1px solid ${msg.isOptionC ? C.emeraldBorder : C.borderSubtle}`,
                    animation: msg.isOptionC ? 'fadeIn 0.4s ease both' : 'none',
                  }}
                >
                  {msg.isOptionC && (
                    <div
                      style={{
                        fontSize: 10, fontWeight: 700, color: C.emerald,
                        marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Icon name="sparkles" size={11} color={C.emerald} /> {t('optionCProposed')}
                    </div>
                  )}
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('addComment')}
            style={{
              flex: 1, fontSize: 11, padding: '6px 8px',
              borderRadius: 4, border: `1px solid ${C.border}`,
              outline: 'none', fontFamily: 'inherit',
              background: C.subtle, color: C.fg1,
            }}
          />
          <button
            style={{
              width: 28, height: 28, borderRadius: 4,
              background: C.emerald, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="send" size={12} color="#fff" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Radar chart ─────────────────────────────────────────────
function RadarChart() {
  const { t } = useLang();
  const axes = [
    t('radarCost'), t('radarPerf'), t('radarDura'),
    t('radarMfg'),  t('radarTime'), t('radarSafe'),
  ];
  const n = axes.length;
  const cx = 90;
  const cy = 90;
  const r  = 65;
  const engineer = [0.55, 0.85, 0.75, 0.95, 0.5,  0.8];
  const designer = [0.7,  0.7,  0.95, 0.55, 0.4,  0.9];
  const optionC  = [0.75, 0.82, 0.88, 0.85, 0.78, 0.87];

  const pt = (val, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * val * Math.cos(a), y: cy + r * val * Math.sin(a) };
  };
  const pts = (vals) =>
    vals.map((v, i) => pt(v, i)).map((p) => `${p.x},${p.y}`).join(' ');
  const axisEnd = (i) => pt(1.08, i);

  return (
    <svg width="180" height="180" viewBox="0 0 180 180">
      {[0.25, 0.5, 0.75, 1].map((lvl) => (
        <polygon
          key={lvl}
          points={axes.map((_, i) => pt(lvl, i)).map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#E2E8ED"
          strokeWidth="0.8"
        />
      ))}
      {axes.map((ax, i) => {
        const end = axisEnd(i);
        return (
          <g key={ax}>
            <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#C5D0D9" strokeWidth="0.8" />
            <text
              x={end.x + (end.x - cx) * 0.12}
              y={end.y + (end.y - cy) * 0.12 + 3}
              textAnchor="middle"
              style={{ fontSize: 8, fill: '#62788A', fontFamily: 'Inter,sans-serif' }}
            >
              {ax}
            </text>
          </g>
        );
      })}
      <polygon points={pts(engineer)} fill="rgba(62,106,165,0.10)" stroke="#3A6EA5" strokeWidth="1.5" strokeDasharray="3,2" />
      <polygon points={pts(designer)} fill="rgba(208,80,69,0.08)"  stroke="#D05045" strokeWidth="1.5" strokeDasharray="3,2" />
      <polygon points={pts(optionC)}  fill="rgba(30,138,90,0.12)"  stroke="#1E8A5A" strokeWidth="2" />
      {[
        { color: '#3A6EA5', label: 'Engineer' },
        { color: C.coral,   label: 'Designer' },
        { color: C.emerald, label: 'Option C' },
      ].map((l, i) => (
        <g key={l.label} transform={`translate(4,${155 + i * 9})`}>
          <rect width="10" height="2" y="3" fill={l.color} rx="1" />
          <text x="14" y="8" style={{ fontSize: 8, fill: '#62788A', fontFamily: 'Inter,sans-serif' }}>
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Conflict panel ──────────────────────────────────────────
function ConflictPanel({ onApprove, onReject }) {
  const { t, lang } = useLang();
  const [appHov, setAppHov] = useState(false);
  const [rejHov, setRejHov] = useState(false);

  const positions = [
    { who: lang === 'ko' ? '엔지니어' : lang === 'zh' ? '工程师' : 'Engineer', text: t('posEngineer'), icon: 'cpu',      color: C.emerald },
    { who: lang === 'ko' ? '디자이너' : lang === 'zh' ? '设计师' : 'Designer', text: t('posDesigner'), icon: 'pen-tool', color: '#3A6EA5' },
  ];

  return (
    <div
      style={{
        width: 230, background: C.white,
        borderLeft: `1px solid ${C.borderSubtle}`,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.borderSubtle}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <Icon name="alert-triangle" size={13} color={C.coral} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.fg2 }}>{t('cfHeader')}</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.fg1 }}>{t('cfTitle')}</div>
        <div style={{ fontSize: 10, color: C.fg3, marginTop: 2 }}>{t('cfMeta')}</div>
      </div>

      <div
        style={{
          flex: 1, overflow: 'auto', padding: 12,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.fg3, marginBottom: 8,
            }}
          >
            {t('positions')}
          </div>
          {positions.map((p) => (
            <div
              key={p.who}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px', borderRadius: 4,
                background: C.subtle, border: `1px solid ${C.borderSubtle}`,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 20, height: 20, borderRadius: 3,
                  background: `${p.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}
              >
                <Icon name={p.icon} size={11} color={p.color} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: p.color, marginBottom: 1 }}>
                  {p.who}
                </div>
                <div style={{ fontSize: 11, color: C.fg2 }}>{p.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <div
            style={{
              fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.fg3, marginBottom: 4,
            }}
          >
            {t('valueMatrix')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <RadarChart />
          </div>
        </div>

        <div
          style={{
            borderRadius: 6, border: `2px solid ${C.emerald}`,
            padding: '10px 12px', background: C.emeraldLight,
            animation: 'option-glow 2.5s ease-in-out infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Icon name="sparkles" size={13} color={C.emerald} />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.emerald }}>
              {t('optionCLabel')}
            </span>
            <span
              style={{
                fontSize: 9, fontWeight: 600,
                padding: '1px 5px', borderRadius: 9999,
                background: C.emerald, color: '#fff', marginLeft: 'auto',
              }}
            >
              {t('optionCNew')}
            </span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.fg1, marginBottom: 4 }}>
            {t('optionCTitle')}
          </div>
          <div style={{ fontSize: 11, color: C.fg2, lineHeight: 1.55, marginBottom: 8 }}>
            {t('optionCDesc')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { label: t('metaLeadTime'), value: '+3d',  good: false },
              { label: t('metaRisk'),     value: '−72%', good: true },
              { label: t('metaConf'),     value: '91%',  good: true },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  flex: 1, background: 'white', borderRadius: 4,
                  padding: '5px 6px', textAlign: 'center',
                  border: `1px solid ${C.emeraldBorder}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: m.good ? C.emerald : C.amber }}>
                  {m.value}
                </div>
                <div style={{ fontSize: 9, color: C.fg3 }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '12px', borderTop: `1px solid ${C.borderSubtle}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        <button
          onClick={onApprove}
          onMouseEnter={() => setAppHov(true)}
          onMouseLeave={() => setAppHov(false)}
          style={{
            width: '100%', padding: '10px', borderRadius: 5,
            fontSize: 13, fontWeight: 600, color: '#fff',
            background: appHov ? C.emeraldHover : C.emerald,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            boxShadow: appHov
              ? '0 4px 12px rgba(30,138,90,0.35)'
              : '0 2px 6px rgba(30,138,90,0.25)',
            transition: 'all 160ms',
            transform: appHov ? 'translateY(-1px)' : 'none',
          }}
        >
          <Icon name="check" size={15} color="#fff" /> {t('approveBtn')}
        </button>
        <button
          onClick={onReject}
          onMouseEnter={() => setRejHov(true)}
          onMouseLeave={() => setRejHov(false)}
          style={{
            width: '100%', padding: '9px', borderRadius: 5,
            fontSize: 12, fontWeight: 500, color: C.coral,
            background: rejHov ? C.coralLight : C.white,
            border: `1px solid ${C.coralBorder}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 160ms',
          }}
        >
          <Icon name="x" size={14} /> {t('rejectBtn')}
        </button>
      </div>
    </div>
  );
}

// ─── Workspace screen ────────────────────────────────────────
export default function WorkspacePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;
  const [activePin, setActivePin] = useState(1);

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${project.sprint} — ${project.name}`}
        subtitle={t('workspaceSub')}
        status="deadlock"
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <BlueprintViewer activePin={activePin} onPinClick={setActivePin} />
        <ChatPanel />
        <ConflictPanel
          onApprove={() => navigate(`/project/${project.id}/consensus`)}
          onReject={() => {}}
        />
      </div>
    </>
  );
}
