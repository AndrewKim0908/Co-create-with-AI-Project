import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import StatusBadge from '@/components/StatusBadge';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';

const OUTCOME = {
  in_progress: { color: '#C88A1A', icon: 'loader' },
  approved:    { color: '#1E8A5A', icon: 'check-circle' },
  rejected:    { color: '#D05045', icon: 'x-circle' },
};

export default function TimelinePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;

  const events = [
    { id: 1, sprint: 14, date: 'Apr 24, 2026', title: t('ev1title'), desc: t('ev1desc'), consensus: null, outcome: 'in_progress' },
    { id: 2, sprint: 13, date: 'Apr 21, 2026', title: t('ev2title'), desc: t('ev2desc'), consensus: 89,   outcome: 'approved',  drawing: 'V3' },
    { id: 3, sprint: 12, date: 'Apr 18, 2026', title: t('ev3title'), desc: t('ev3desc'), consensus: 94,   outcome: 'approved',  drawing: 'V2' },
    { id: 4, sprint: 11, date: 'Apr 12, 2026', title: t('ev4title'), desc: t('ev4desc'), consensus: 71,   outcome: 'rejected',  drawing: 'V1', rejectedReason: t('ev4reject') },
    { id: 5, sprint: 10, date: 'Apr 08, 2026', title: t('ev5title'), desc: t('ev5desc'), consensus: 97,   outcome: 'approved',  drawing: 'V2' },
  ];

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${project.sprint} — ${project.name}`}
        subtitle={`${t('timelineTitle')} · ${t('sprintHistory')}`}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.08em', color: C.fg3, marginBottom: 20,
            }}
          >
            {t('timelineHistory')}
          </div>
          <div style={{ position: 'relative', paddingLeft: 32 }}>
            <div
              style={{
                position: 'absolute', left: 9, top: 0, bottom: 0,
                width: 2, background: C.borderSubtle,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {events.map((ev, i) => {
                const o = OUTCOME[ev.outcome];
                const isActive = ev.outcome === 'in_progress';
                return (
                  <div
                    key={ev.id}
                    style={{ position: 'relative', paddingBottom: i < events.length - 1 ? 24 : 0 }}
                  >
                    <div
                      style={{
                        position: 'absolute', left: -32, top: 16,
                        width: 20, height: 20, borderRadius: '50%',
                        background: isActive ? C.emerald : ev.outcome === 'approved' ? C.emeraldLight : C.coralLight,
                        border: `2px solid ${isActive ? C.emerald : ev.outcome === 'approved' ? C.emerald : C.coral}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: isActive ? '0 0 0 4px rgba(30,138,90,0.15)' : 'none',
                        animation: isActive ? 'pulse-dot 2s infinite' : 'none',
                      }}
                    >
                      <Icon name={o.icon} size={10} color={isActive ? '#fff' : o.color} />
                    </div>
                    <div
                      onClick={() => isActive && navigate('/workspace')}
                      style={{
                        background: C.white,
                        border: `1px solid ${isActive ? C.emerald : C.borderSubtle}`,
                        borderRadius: 6,
                        boxShadow: isActive
                          ? '0 0 0 3px rgba(30,138,90,0.1), 0 2px 8px rgba(30,42,53,0.08)'
                          : '0 1px 3px rgba(30,42,53,0.06)',
                        cursor: isActive ? 'pointer' : 'default',
                      }}
                    >
                      <div
                        style={{
                          padding: '12px 16px', display: 'flex',
                          alignItems: 'flex-start', gap: 12,
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10, fontFamily: 'monospace',
                                color: C.fg3, fontWeight: 600,
                              }}
                            >
                              Sprint #{ev.sprint}
                            </span>
                            <span style={{ fontSize: 10, color: C.fg4 }}>·</span>
                            <span style={{ fontSize: 10, color: C.fg4 }}>{ev.date}</span>
                            <StatusBadge
                              status={isActive ? 'active' : ev.outcome === 'approved' ? 'resolved' : 'conflict'}
                            />
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.fg1, marginBottom: 4 }}>
                            {ev.title}
                          </div>
                          <div style={{ fontSize: 12, color: C.fg3, lineHeight: 1.55 }}>
                            {ev.desc}
                          </div>
                          {ev.rejectedReason && (
                            <div
                              style={{
                                marginTop: 8, padding: '6px 10px',
                                background: C.coralLight, borderRadius: 4,
                                borderLeft: `3px solid ${C.coral}`,
                                fontSize: 11, color: C.coral,
                              }}
                            >
                              {t('rejectionReason')} {ev.rejectedReason}
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'flex-end', gap: 6, flexShrink: 0,
                          }}
                        >
                          {ev.drawing && (
                            <span
                              style={{
                                fontSize: 10, fontFamily: 'monospace',
                                fontWeight: 600, padding: '2px 7px', borderRadius: 3,
                                background: C.subtle, color: C.fg2,
                                border: `1px solid ${C.border}`,
                              }}
                            >
                              {ev.drawing}
                            </span>
                          )}
                          {ev.consensus && (
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 16, fontWeight: 700, color: C.emerald }}>
                                {ev.consensus}%
                              </div>
                              <div style={{ fontSize: 10, color: C.fg3 }}>
                                {t('consensusLabel')}
                              </div>
                            </div>
                          )}
                          {isActive && (
                            <Btn variant="primary" size="sm" onClick={() => navigate('/workspace')}>
                              <Icon name="arrow-right" size={12} /> {t('openSprint')}
                            </Btn>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
