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
const V_ZIGZAG     = 55;               // initial wave amplitude from CY (root start)
const V_ZIGZAG_STEP = V_ZIGZAG * 2;    // per-step vertical delta on linear chains
const FAN_GAP_Y    = 150;              // vertical gap between adjacent siblings on a fan
const PAD_H        = 130;              // left/right canvas padding (chips need space)
const CONTAINER_H  = 420;              // fixed desktop canvas height (single-row min)
const CY           = 210;              // anchor y for the root sub-tree
const SUMMARY_H    = 78;               // estimated summary-card height
const Y_PAD        = NODE_R + 14 + SUMMARY_H + 12; // safe top/bottom margin in canvas
const CHIP_W       = 100;              // legacy chip width (kept for layout math)
const CHIP_GAP     = 6;
const CHIP_ROW_H   = 30;
const CARD_GAP     = 14;               // gap between node edge and summary card
const CHIP_GROUP_W = CHIP_W * 2 + CHIP_GAP;  // 206 px — summary card width
const CHIP_GROUP_H = CHIP_ROW_H * 2 + CHIP_GAP; // 66 px — legacy baseline height
const MOBILE_BP    = 600;
const V_STEP_MB    = 120;              // mobile vertical step
const PAN_EDGE_PAD = 80;               // allowed pan slack past the content bounds
const LINK_COLOR   = '#00b6d4';        // connector line stroke

// ── SummaryCard ──────────────────────────────────────────────
// Single card replacing the legacy CONFLICT/OUTCOME/RESOLUTION/APPROVALS
// 2×2 chip grid. Title summarises the sprint's topic; two body lines hold
// the conflict and the resolution. Sprints without a saved consensus
// degrade to "In progress" / "Pending" copy.
function SummaryCard({ summary, animDelay, width, archived = false }) {
  return (
    <div
      style={{
        width,
        background: archived ? '#F8FAFC' : C.white,
        border: `1px solid ${C.borderSubtle}`,
        borderRadius: 6,
        padding: '8px 12px',
        boxShadow: '0 1px 3px rgba(30,42,53,0.05)',
        animation: `tl-appear-h 0.4s cubic-bezier(0.2,0,0,1) ${animDelay}s both`,
        opacity: archived ? 0.75 : 1,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: C.fg1,
          lineHeight: 1.3,
          marginBottom: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={summary.title}
      >
        {summary.title}
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.fg2,
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={summary.conflictLine}
      >
        {summary.conflictLine}
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.fg2,
          lineHeight: 1.4,
          marginTop: 2,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
        title={summary.resolutionLine}
      >
        {summary.resolutionLine}
      </div>
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
  const [sprintsMeta, setSprintsMeta] = useState([]);
  const [analysisMap, setAnalysisMap] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [containerW, setContainerW] = useState(700);
  const [containerH, setContainerH] = useState(500);
  // Pan offset for the timeline canvas. Drag on the background to move; node
  // clicks still register because the buttons stop propagation.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDragRef = useRef(null);

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

  // Sprint registry — same shape WorkspacePage uses. Drives branch topology.
  useEffect(() => {
    if (!projectId) { setSprintsMeta([]); return undefined; }
    let alive = true;
    supabase
      .from('sprints')
      .select('sprint_number, label, parent_sprint_number, archived')
      .eq('project_id', projectId)
      .order('sprint_number', { ascending: true })
      .then(({ data }) => {
        if (alive) setSprintsMeta(Array.isArray(data) ? data : []);
      });
    return () => { alive = false; };
  }, [projectId]);

  // Per-sprint analysis + consensus, fetched in one shot. Drives the summary
  // card. `consensus_record` (saved consensus) takes priority over
  // `analysis_result` (work-in-progress AI proposal).
  useEffect(() => {
    if (!projectId) { setAnalysisMap(new Map()); return undefined; }
    let alive = true;
    supabase
      .from('sprint_ai_analysis')
      .select('sprint_number, analysis_result, consensus_record')
      .eq('project_id', projectId)
      .then(({ data }) => {
        if (!alive) return;
        const m = new Map();
        for (const r of data || []) {
          const n = Number(r.sprint_number);
          if (!Number.isFinite(n)) continue;
          m.set(n, {
            analysis_result: r.analysis_result ?? null,
            consensus_record: r.consensus_record ?? null,
          });
        }
        setAnalysisMap(m);
      });
    return () => { alive = false; };
  }, [projectId]);

  // Measure outer scroll container width (for mobile detection)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(Math.max(1, Math.round(entry.contentRect.width)));
      setContainerH(Math.max(1, Math.round(entry.contentRect.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentSprint = sprintNumber ?? Math.trunc(Number(project.sprint ?? 0));
  const isMobile = containerW < MOBILE_BP;

  // ── Branch topology (parent_sprint_number tree) ─────────────────
  const byNum = new Map(
    (sprintsMeta || []).map((r) => [Number(r.sprint_number), r]),
  );
  const childrenByParent = (() => {
    const m = new Map();
    for (const r of sprintsMeta || []) {
      const p = r.parent_sprint_number;
      if (p == null) continue;
      const pn = Number(p);
      if (!m.has(pn)) m.set(pn, []);
      m.get(pn).push(Number(r.sprint_number));
    }
    return m;
  })();

  // ── Desktop: recursive layout — single-child = continue wave (mirror y
  // by ±V_ZIGZAG_STEP), multi-child = equal vertical fan around parent.
  // Older (smaller sprint_number) children sit above, newer below. After a
  // fan, each sub-tree resumes its own zigzag in the direction that pulls
  // it back toward its parent's y.
  const desktopLayoutRaw = (() => {
    const out = new Map();
    function place(num, x, y, lastDir) {
      const r = byNum.get(num);
      if (!r) return;
      out.set(num, {
        sprintNum: num,
        label:
          typeof r.label === 'string' && r.label.trim()
            ? r.label
            : String(num),
        archived: Boolean(r.archived),
        isActive: num === currentSprint,
        x,
        y,
        index: out.size,
      });
      const kids = (childrenByParent.get(num) || []).slice().sort((a, b) => a - b);
      if (kids.length === 0) return;
      const childX = x + H_STEP;
      if (kids.length === 1) {
        const nextDir = -lastDir;
        place(kids[0], childX, y + nextDir * V_ZIGZAG_STEP, nextDir);
      } else {
        const n = kids.length;
        const span = (n - 1) * FAN_GAP_Y;
        for (let i = 0; i < n; i += 1) {
          const fanY = y - span / 2 + i * FAN_GAP_Y;
          // Above-parent → next step heads down; below-parent → next step
          // heads up. Keeps sub-tree zigzag tame around the branch's level.
          const subDir = fanY < y ? +1 : -1;
          place(kids[i], childX, fanY, subDir);
        }
      }
    }
    const roots = (sprintsMeta || [])
      .filter((r) => r.parent_sprint_number == null)
      .map((r) => Number(r.sprint_number))
      .sort((a, b) => a - b);
    // Each root starts at the standard wave top (CY - V_ZIGZAG) with
    // lastDir = -1 so the next step goes down — preserving the original
    // single-chain look on linear projects.
    let rootStack = 0;
    for (const rn of roots) {
      const startY = (CY - V_ZIGZAG) + rootStack * (V_ZIGZAG_STEP + FAN_GAP_Y);
      place(rn, PAD_H, startY, -1);
      rootStack += 1;
    }
    return Array.from(out.values());
  })();

  // Shift the entire layout so the topmost node sits at Y_PAD inside the
  // canvas, then compute totals. Without the shift, branches that fan
  // upward could land at negative y and clip outside the canvas.
  const layoutMinY =
    desktopLayoutRaw.length > 0
      ? desktopLayoutRaw.reduce((m, n) => Math.min(m, n.y), Infinity)
      : 0;
  const layoutMaxY =
    desktopLayoutRaw.length > 0
      ? desktopLayoutRaw.reduce((m, n) => Math.max(m, n.y), -Infinity)
      : 0;
  const yShift = Number.isFinite(layoutMinY) ? -layoutMinY + Y_PAD : 0;
  const desktopNodes = desktopLayoutRaw.map((n) => ({ ...n, y: n.y + yShift }));
  const desktopNodeByNum = new Map(desktopNodes.map((n) => [n.sprintNum, n]));

  const maxNodeX = desktopNodes.reduce((m, n) => Math.max(m, n.x), PAD_H);
  const totalW = maxNodeX + NODE_R + PAD_H;
  const totalH = Math.max(
    CONTAINER_H,
    Number.isFinite(layoutMaxY) ? (layoutMaxY - layoutMinY) + 2 * Y_PAD : CONTAINER_H,
  );
  // Decide chip side per node off the canvas midline so the strip alternates
  // up/down naturally even after fans pull nodes off the original wave.
  const desktopCenterY = totalH / 2;
  desktopNodes.forEach((n) => { n.chipsAbove = n.y < desktopCenterY; });

  // Parent → child curve per sprint with a parent (skips roots).
  const desktopPaths = (() => {
    const arr = [];
    for (const node of desktopNodes) {
      const meta = byNum.get(node.sprintNum);
      if (!meta || meta.parent_sprint_number == null) continue;
      const parent = desktopNodeByNum.get(Number(meta.parent_sprint_number));
      if (!parent) continue;
      const x1 = parent.x + NODE_R;
      const y1 = parent.y;
      const x2 = node.x - NODE_R;
      const y2 = node.y;
      const ctrl = H_STEP * 0.45;
      arr.push(`M${x1},${y1} C${x1 + ctrl},${y1} ${x2 - ctrl},${y2} ${x2},${y2}`);
    }
    return arr;
  })();

  // ── Mobile: linear list sorted by sprint_number DESC (newest first).
  // Branches still render as nodes; their topology is reflected via the
  // parent-curve below instead of via 2D positioning.
  const cx = containerW / 2;
  const mobileNodes = (() => {
    const sorted = [...(sprintsMeta || [])].sort(
      (a, b) => Number(b.sprint_number) - Number(a.sprint_number),
    );
    return sorted.map((r, i) => ({
      sprintNum: Number(r.sprint_number),
      label:
        typeof r.label === 'string' && r.label.trim()
          ? r.label
          : String(r.sprint_number),
      archived: Boolean(r.archived),
      isActive: Number(r.sprint_number) === currentSprint,
      x: cx,
      y: 64 + i * V_STEP_MB,
      index: i,
      chipsAbove: false,
    }));
  })();
  const mobileNodeByNum = new Map(mobileNodes.map((n) => [n.sprintNum, n]));

  const mobileTotalH =
    64 + Math.max(0, mobileNodes.length - 1) * V_STEP_MB + NODE_R * 2 + 96;

  const mobilePaths = (() => {
    const arr = [];
    for (const node of mobileNodes) {
      const meta = byNum.get(node.sprintNum);
      if (!meta || meta.parent_sprint_number == null) continue;
      const parent = mobileNodeByNum.get(Number(meta.parent_sprint_number));
      if (!parent) continue;
      // Parents render BELOW their children in mobile (DESC order), so the
      // curve goes from child → parent. Swap so the path always points from
      // the upper node to the lower node visually.
      const fromY = Math.min(node.y, parent.y);
      const toY = Math.max(node.y, parent.y);
      const x1 = node.x, y1 = fromY + NODE_R;
      const x2 = parent.x, y2 = toY - NODE_R;
      const ctrl = V_STEP_MB * 0.45;
      arr.push(`M${x1},${y1} C${x1},${y1 + ctrl} ${x2},${y2 - ctrl} ${x2},${y2}`);
    }
    return arr;
  })();

  // Summary card content per node — consensus_record wins; analysis_result
  // covers AI-in-flight sprints; otherwise gracefully degrade.
  function getSummary(node) {
    const rec = analysisMap.get(node.sprintNum);
    const cr = rec?.consensus_record;
    if (cr && typeof cr === 'object') {
      const conflictTitle =
        (cr.conflict && cr.conflict.title) ||
        (cr.conflict && cr.conflict.summary) ||
        '';
      const conflictSummary =
        (cr.conflict && cr.conflict.summary) ||
        conflictTitle ||
        '';
      const resolutionTitle = (cr.resolution && cr.resolution.title) || '';
      const resolutionDesc = (cr.resolution && cr.resolution.description) || '';
      const note = (typeof cr.note === 'string' && cr.note.trim()) || '';
      const title = conflictTitle || resolutionTitle || `Sprint ${node.label}`;
      const conflictLine = conflictSummary || 'Conflict recorded.';
      let resolutionLine = '';
      if (resolutionTitle && resolutionDesc) {
        resolutionLine = `${resolutionTitle} — ${resolutionDesc}`;
      } else if (resolutionTitle) {
        resolutionLine = resolutionTitle;
      } else if (note) {
        resolutionLine = note;
      } else {
        resolutionLine = 'Resolution recorded.';
      }
      return { title, conflictLine, resolutionLine };
    }
    const ar = rec?.analysis_result;
    if (ar && typeof ar === 'object' && ar.activeConflict) {
      return {
        title: ar.activeConflict.title || 'Conflict in review',
        conflictLine:
          ar.activeConflict.summary ||
          ar.activeConflict.title ||
          'Open conflict — discussion in progress.',
        resolutionLine: ar.alternative?.title
          ? `Proposed: ${ar.alternative.title}`
          : 'Awaiting resolution.',
      };
    }
    if (node.archived) {
      return {
        title: `Sprint ${node.label} · Archived`,
        conflictLine: 'Branch archived without consensus.',
        resolutionLine: 'No outcome recorded.',
      };
    }
    if (node.isActive) {
      return {
        title: `Sprint ${node.label} · Active`,
        conflictLine: 'In progress — collaborators discussing.',
        resolutionLine: 'Awaiting consensus.',
      };
    }
    return {
      title: `Sprint ${node.label}`,
      conflictLine: 'Pending — no conflict captured yet.',
      resolutionLine: 'No consensus recorded.',
    };
  }

  const activeNodes = isMobile ? mobileNodes : desktopNodes;
  const activePaths = isMobile ? mobilePaths : desktopPaths;
  const svgW        = isMobile ? containerW  : totalW;
  const svgH        = isMobile ? mobileTotalH : totalH;
  const canvasW     = isMobile ? '100%'       : totalW;
  const canvasH     = isMobile ? mobileTotalH : totalH;
  const hasAnyNodes = activeNodes.length > 0;

  // Pan clamp — when content is smaller than view, allow only a little drag
  // slack (so the user can't fling it off-screen). When content overflows,
  // permit dragging the off-screen part into view plus the same slack.
  function clampPan(p, contentSize, viewSize, edge) {
    if (contentSize <= viewSize) {
      return Math.max(-edge, Math.min(edge, p));
    }
    const minP = -(contentSize - viewSize) - edge;
    const maxP = edge;
    return Math.max(minP, Math.min(maxP, p));
  }

  function startPan(e) {
    if (isMobile) return;
    if (e.button !== 0) return;
    // Let clicks on real interactive children (sprint dot, Open sprint
    // button) reach their own handlers instead of stealing them for pan.
    const tgt = e.target;
    if (tgt && typeof tgt.closest === 'function' &&
        tgt.closest('button, a, input, [role="button"]')) {
      return;
    }
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const basePanX = pan.x;
    const basePanY = pan.y;
    panDragRef.current = true;
    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setPan({
        x: clampPan(basePanX + dx, totalW, containerW, PAN_EDGE_PAD),
        y: clampPan(basePanY + dy, totalH, containerH, PAN_EDGE_PAD),
      });
    }
    function onUp() {
      panDragRef.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Shared node renderer — used by both the desktop pan-canvas and the
  // mobile vertical scroll. Same body the original inline `.map` used,
  // just moved into a helper so both code paths render identically.
  function renderNode(node) {
    const summary = getSummary(node);
    const delay   = Math.min(node.index * 0.1, 1.5);
    const anim    = isMobile ? 'tl-appear' : 'tl-appear-h';

    const cardTop = node.chipsAbove
      ? node.y - NODE_R - CARD_GAP - SUMMARY_H
      : node.y + NODE_R + CARD_GAP;

    const btnTop = node.chipsAbove
      ? node.y + NODE_R + CARD_GAP
      : node.y - NODE_R - CARD_GAP - 32;
    const btnLeft = node.x - 55;
    const mobileBtnTop = node.y + NODE_R + 28;

    const nodeBg = node.archived
      ? C.subtle
      : node.isActive
        ? C.emerald
        : C.emeraldLight;
    const nodeBorder = node.archived ? C.border : C.emerald;
    const nodeColor = node.archived
      ? C.fg3
      : node.isActive
        ? '#fff'
        : C.emerald;

    return (
      <Fragment key={node.sprintNum}>
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
            title={`Sprint ${node.label}${node.archived ? ' (archived)' : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/project/${projectId}/sprints?sprint=${node.sprintNum}`);
            }}
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: nodeBg,
              border: `2px solid ${nodeBorder}`,
              color: nodeColor,
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
            #{node.label}
          </button>
        </div>

        {!isMobile && (
          <div
            style={{
              position: 'absolute',
              left: node.x - CHIP_GROUP_W / 2,
              top: cardTop,
            }}
          >
            <SummaryCard
              summary={summary}
              animDelay={delay + 0.08}
              width={CHIP_GROUP_W}
              archived={node.archived}
            />
          </div>
        )}

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
            #{node.label} · {node.archived ? 'Archived' : node.isActive ? 'Active' : 'Resolved'}
          </div>
        )}

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
  }

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

      {/* Outer container — ref here for ResizeObserver. Desktop suppresses
          native scroll so the manual pan transform fully drives positioning
          (mobile keeps native scroll for the simpler vertical list). */}
      <div
        ref={containerRef}
        onMouseDown={isMobile ? undefined : startPan}
        style={{
          flex: 1,
          overflowX: isMobile ? 'hidden' : 'hidden',
          overflowY: isMobile ? 'auto'   : 'hidden',
          position: 'relative',
          paddingTop: isMobile ? 24 : 0,
          paddingBottom: isMobile ? 24 : 0,
          paddingLeft:  isMobile ? 40 : 0,
          paddingRight: isMobile ? 40 : 0,
          boxSizing: 'border-box',
          cursor: isMobile ? 'default' : 'grab',
          userSelect: isMobile ? 'auto' : 'none',
        }}
      >
        {loading ? (
          <div style={{ color: C.fg3, fontSize: 13, padding: '24px 40px' }}>Loading…</div>
        ) : !hasAnyNodes ? (
          <div style={{ color: C.fg3, fontSize: 13, padding: '24px 40px' }}>No sprints yet.</div>
        ) : !isMobile ? (
          // Desktop: flex-centered pan wrapper. The canvas is translated by
          // the live pan state, vertically centered in the viewport when
          // the canvas is shorter than the container.
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                position: 'relative',
                width: totalW,
                height: totalH,
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                flexShrink: 0,
                pointerEvents: 'auto',
              }}
            >
              {/* SVG curve layer */}
              <svg
                width={totalW}
                height={totalH}
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  overflow: 'visible',
                }}
              >
                {desktopPaths.map((d, i) => (
                  <path
                    key={i}
                    d={d}
                    pathLength="1"
                    fill="none"
                    stroke={LINK_COLOR}
                    strokeWidth={2}
                    style={{
                      strokeDasharray: 1,
                      strokeDashoffset: 1,
                      animation: `tl-draw 0.5s ease-out ${Math.min((i + 1) * 0.1, 1.6)}s both`,
                    }}
                  />
                ))}
              </svg>

              {desktopNodes.map((node) => renderNode(node))}
            </div>
          </div>
        ) : (
          /* Mobile: native vertical scroll, same canvas footprint as before */
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
                  stroke={LINK_COLOR}
                  strokeWidth={2}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: 1,
                    animation: `tl-draw 0.5s ease-out ${Math.min((i + 1) * 0.1, 1.6)}s both`,
                  }}
                />
              ))}
            </svg>

            {activeNodes.map(renderNode)}
          </div>
        )}
      </div>
    </>
  );
}
