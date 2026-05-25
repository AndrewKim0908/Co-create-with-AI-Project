import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Btn from '@/components/Btn';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

// ── Layout constants ──────────────────────────────────────────
const NODE_R       = 28;
const H_STEP       = 220;              // horizontal gap between node centers (desktop)
const V_ZIGZAG     = 55;              // vertical zigzag offset from CY
const PAD_H        = 130;             // left/right canvas padding (chips need space)
const CONTAINER_H  = 420;            // fixed desktop canvas height
const CY           = 180;             // vertical center Y for nodes (desktop)
const CHIP_W       = 100;             // individual chip width in 2-col grid
const CHIP_GAP     = 6;
const CHIP_ROW_H   = 30;
const CARD_GAP     = 14;             // gap between node edge and chip group
const CHIP_GROUP_W = CHIP_W * 2 + CHIP_GAP;  // 206 px
const CHIP_GROUP_H = CHIP_ROW_H * 2 + CHIP_GAP; // 66 px
const MOBILE_BP    = 600;
const V_STEP_MB    = 120;             // mobile vertical step

// ── InfoChip ──────────────────────────────────────────────────
function InfoChip({ label, value, animDelay, width = 148 }) {
  return (
    <div
      style={{
        width,
        background: C.white,
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 6,
        padding: '5px 10px',
        boxShadow: '0 1px 3px rgba(30,42,53,0.05)',
        animation: `tl-appear-h 0.4s cubic-bezier(0.2,0,0,1) ${animDelay}s both`,
      }}
    >
      <div
        style={{
          fontSize: 9,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: C.fg4,
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: C.fg2 }}>{value}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────
export default function TimelinePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const project = getProjectById(projectId) || DEFAULT_PROJECT;
  const containerRef = useRef(null);

  const [sprintNumber, setSprintNumber] = useState(null);
  const [loading, setLoading] = useState(true);
  const [containerW, setContainerW] = useState(700);

  // Fetch current sprint_number from Supabase
  useEffect(() => {
    if (!projectId) { setLoading(false); return undefined; }
    let alive = true;
    setLoading(true);
    supabase
      .from('projects')
      .select('sprint_number')
      .eq('id', projectId)
      .single()
      .then(({ data, error }) => {
        if (!alive) return;
        if (!error && data?.sprint_number != null) {
          setSprintNumber(Math.trunc(Number(data.sprint_number)));
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [projectId]);

  // Measure outer scroll container width (for mobile detection)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(Math.max(1, Math.round(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentSprint = sprintNumber ?? Math.trunc(Number(project.sprint ?? 0));
  const isMobile = containerW < MOBILE_BP;

  // ── Desktop: horizontal nodes (Sprint #1 left → active right) ─
  const desktopNodes = currentSprint >= 1
    ? Array.from({ length: currentSprint }, (_, i) => {
        const sprintNum = i + 1;
        const yOff = i % 2 === 0 ? -V_ZIGZAG : V_ZIGZAG;
        return {
          sprintNum,
          isActive: sprintNum === currentSprint,
          x: PAD_H + i * H_STEP,
          y: CY + yOff,
          index: i,
          chipsAbove: yOff < 0,
        };
      })
    : [];

  const totalW = PAD_H + Math.max(0, currentSprint - 1) * H_STEP + NODE_R + PAD_H;

  const desktopPaths = desktopNodes.slice(0, -1).map((node, i) => {
    const next = desktopNodes[i + 1];
    const x1 = node.x + NODE_R, y1 = node.y;
    const x2 = next.x - NODE_R, y2 = next.y;
    const ctrl = H_STEP * 0.45;
    return `M${x1},${y1} C${x1 + ctrl},${y1} ${x2 - ctrl},${y2} ${x2},${y2}`;
  });

  // ── Mobile: vertical nodes (active top → oldest bottom) ──────
  const cx = containerW / 2;
  const mobileNodes = currentSprint >= 1
    ? Array.from({ length: currentSprint }, (_, i) => {
        const sprintNum = currentSprint - i;
        return {
          sprintNum,
          isActive: sprintNum === currentSprint,
          x: cx,
          y: 64 + i * V_STEP_MB,
          index: i,
          chipsAbove: false,
        };
      })
    : [];

  const mobileTotalH = 64 + Math.max(0, currentSprint - 1) * V_STEP_MB + NODE_R * 2 + 64;

  const mobilePaths = mobileNodes.slice(0, -1).map((node, i) => {
    const next = mobileNodes[i + 1];
    const x1 = node.x, y1 = node.y + NODE_R;
    const x2 = next.x, y2 = next.y - NODE_R;
    const ctrl = V_STEP_MB * 0.45;
    return `M${x1},${y1} C${x1},${y1 + ctrl} ${x2},${y2 - ctrl} ${x2},${y2}`;
  });

  // Chip content per node
  function getChips(node) {
    return node.isActive
      ? { conflict: 'Pending',  resolution: 'In review', outcome: 'Active',   approvals: 'Awaiting' }
      : { conflict: '–',        resolution: 'Approved',  outcome: 'Resolved', approvals: 'Approved' };
  }

  const activeNodes = isMobile ? mobileNodes : desktopNodes;
  const activePaths = isMobile ? mobilePaths : desktopPaths;
  const svgW        = isMobile ? containerW  : totalW;
  const svgH        = isMobile ? mobileTotalH : CONTAINER_H;
  const canvasW     = isMobile ? '100%'       : totalW;
  const canvasH     = isMobile ? mobileTotalH : CONTAINER_H;

  return (
    <>
      <Header
        title={`${t('sprintLabel')} #${currentSprint || project.sprint} — ${project.name}`}
        subtitle={`${t('timelineTitle')} · ${t('sprintHistory')}`}
      />

      <style>{`
        @keyframes tl-appear {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes tl-appear-h {
          from { opacity: 0; transform: translateX(-20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes tl-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>

      {/* Outer scroll container — ref here for ResizeObserver */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflowX: isMobile ? 'hidden' : 'auto',
          overflowY: isMobile ? 'auto'   : 'hidden',
          paddingTop: 24,
          paddingBottom: 24,
          paddingLeft:  isMobile ? 40 : 0,
          paddingRight: isMobile ? 40 : 0,
          boxSizing: 'border-box',
        }}
      >
        {loading ? (
          <div style={{ color: C.fg3, fontSize: 13, padding: '0 40px' }}>Loading…</div>
        ) : currentSprint < 1 ? (
          <div style={{ color: C.fg3, fontSize: 13, padding: '0 40px' }}>No sprints yet.</div>
        ) : (
          /* Canvas — absolutely positioned nodes sit inside */
          <div
            style={{
              position: 'relative',
              width: canvasW,
              height: canvasH,
              minWidth: isMobile ? undefined : totalW,
            }}
          >
            {/* SVG curve layer */}
            <svg
              width={svgW}
              height={svgH}
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              {activePaths.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  pathLength="1"
                  fill="none"
                  stroke={C.emeraldBorder}
                  strokeWidth={2}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `tl-draw 0.5s ease-out ${Math.min((i + 1) * 0.1, 1.6)}s both`,
                  }}
                />
              ))}
            </svg>

            {/* Nodes, chips, button */}
            {activeNodes.map((node) => {
              const chips    = getChips(node);
              const delay    = Math.min(node.index * 0.1, 1.5);
              const anim     = isMobile ? 'tl-appear' : 'tl-appear-h';

              // Desktop chip group top
              const chipGroupTop = node.chipsAbove
                ? node.y - NODE_R - CARD_GAP - CHIP_GROUP_H  // above node
                : node.y + NODE_R + CARD_GAP;                // below node

              // Desktop "Open sprint" button: opposite side of chips
              const btnTop  = node.chipsAbove
                ? node.y + NODE_R + CARD_GAP      // chips above → btn below
                : node.y - NODE_R - CARD_GAP - 32; // chips below → btn above
              const btnLeft = node.x - 55;

              // Mobile button: below label
              const mobileBtnTop = node.y + NODE_R + 28;

              return (
                <Fragment key={node.sprintNum}>
                  {/* Node wrapper (handles translateX/Y appear) */}
                  <div
                    style={{
                      position: 'absolute',
                      left: node.x - NODE_R,
                      top: node.y - NODE_R,
                      width: NODE_R * 2,
                      height: NODE_R * 2,
                      animation: `${anim} 0.4s cubic-bezier(0.2,0,0,1) ${delay}s both`,
                      zIndex: 2,
                    }}
                  >
                    <button
                      type="button"
                      title={`Sprint #${node.sprintNum}`}
                      onClick={() =>
                        navigate(`/project/${projectId}/sprints?sprint=${node.sprintNum}`)
                      }
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        background: node.isActive ? C.emerald : C.emeraldLight,
                        border: `2px solid ${C.emerald}`,
                        color: node.isActive ? '#fff' : C.emerald,
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: node.isActive
                          ? '0 0 0 6px rgba(6,182,212,0.12)'
                          : '0 1px 4px rgba(30,42,53,0.08)',
                        animation: node.isActive
                          ? `pulse-dot 2s ${delay + 0.4}s infinite`
                          : 'none',
                        transition: 'box-shadow 150ms',
                      }}
                    >
                      #{node.sprintNum}
                    </button>
                  </div>

                  {/* Desktop: 2×2 chip grid (above or below node, zigzag) */}
                  {!isMobile && (
                    <div
                      style={{
                        position: 'absolute',
                        left: node.x - CHIP_GROUP_W / 2,
                        top: chipGroupTop,
                        display: 'grid',
                        gridTemplateColumns: `${CHIP_W}px ${CHIP_W}px`,
                        gap: CHIP_GAP,
                      }}
                    >
                      <InfoChip label="Conflict"   value={chips.conflict}   animDelay={delay + 0.07} width={CHIP_W} />
                      <InfoChip label="Outcome"    value={chips.outcome}    animDelay={delay + 0.07} width={CHIP_W} />
                      <InfoChip label="Resolution" value={chips.resolution} animDelay={delay + 0.12} width={CHIP_W} />
                      <InfoChip label="Approvals"  value={chips.approvals}  animDelay={delay + 0.12} width={CHIP_W} />
                    </div>
                  )}

                  {/* Mobile: compact label below node */}
                  {isMobile && (
                    <div
                      style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: node.y + NODE_R + 6,
                        fontSize: 10,
                        fontWeight: 600,
                        color: node.isActive ? C.emerald : C.fg3,
                        whiteSpace: 'nowrap',
                        animation: `tl-appear 0.4s cubic-bezier(0.2,0,0,1) ${delay}s both`,
                      }}
                    >
                      #{node.sprintNum} · {node.isActive ? 'Active' : 'Resolved'}
                    </div>
                  )}

                  {/* "Open sprint" button — active sprint only */}
                  {node.isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: isMobile ? '50%'   : btnLeft,
                        top:  isMobile ? mobileBtnTop : btnTop,
                        transform: isMobile ? 'translateX(-50%)' : 'none',
                        animation: `${anim} 0.4s cubic-bezier(0.2,0,0,1) ${delay + 0.18}s both`,
                        zIndex: 2,
                      }}
                    >
                      <Btn
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/project/${projectId}/sprints?sprint=${node.sprintNum}`);
                        }}
                      >
                        <Icon name="arrow-right" size={12} /> {t('openSprint')}
                      </Btn>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
