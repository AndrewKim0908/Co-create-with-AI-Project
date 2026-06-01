import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import ProjectOverviewModal from '@/components/ProjectOverviewModal';
import ConsensusModal from '@/components/ConsensusModal';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import {
  REALTIME_BROADCAST_EVENTS,
  REALTIME_CHANNELS,
  VOTE_STATUS,
} from '@/constants/realtime';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';
import { projectShortDescription } from '@/utils/projectDisplay';
import { getProjectPriorities } from '@/utils/projectPriorities';
import { mockAIAnalysisResult, mockInsufficientChat } from '@/utils/mockAIAnalysis';
import { requestGeminiAnalysis, requestGeminiAlternative } from '@/utils/geminiApi';
import {
  isEditableKeyboardTarget,
  extractStorageObjectFromPublicUrl,
  mapDesignFileRow,
  normalizeParticipantUserId,
  participantVoteDisplayName,
  pickLinkedMemberUid,
  resolveSprintVotesSprintNumber,
} from '@/utils/helpers';
import { baseColorForUser } from '@/utils/userColors';
import { useProjectColors } from '@/utils/useProjectColors';
import {
  createMarkersRealtimeChannel,
  createVoteSyncRealtimeChannel,
  createWorkspaceProjectMetaChannel,
  eqColumnFilter,
  fetchProfileFullNamesMap,
} from '@/utils/supabaseHelpers';

/** Prevents duplicate onApprove under React StrictMode / double effects (module-scoped). */
let conflictUnanimousNavToken = null;

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;

// Page (A4 @ 96dpi) — see scripts/migrations/add_pages_to_design_files.sql
// A4 @ 96 dpi — the page is always rendered at portrait dimensions regardless of
// orientation. Horizontal mode just changes how multiple pages flow on the canvas
// (row vs column); each individual page keeps its 794 × 1123 size.
const A4_W = 794;
const A4_H = 1123;
const PAGE_GAP = 80;
const IMG_DEFAULT_W = 460;
const IMG_DEFAULT_H = 340;
const PAGE_SCROLL_MARGIN = 80; // top margin (px) when navigating to a page

function miniBtnStyle() {
  return {
    width: 22,
    height: 22,
    padding: 0,
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1,
    fontFamily: 'inherit',
    color: '#4b5563',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function pillBtnStyle(active) {
  return {
    height: 24,
    padding: '0 10px',
    border: `1px solid ${active ? '#06b6d4' : '#e5e7eb'}`,
    background: active ? '#ecfeff' : '#fff',
    color: active ? '#0891b2' : '#4b5563',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

// ─── Blueprint viewer ────────────────────────────────────────
function getAvatarInitials(name, email) {
  const n = String(name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const local = String(email || '').split('@')[0] || '';
  return (local.slice(0, 2) || 'US').toUpperCase();
}

function DesignMarker({
  marker,
  isPending,
  draftNote,
  onDraftChange,
  onConfirmNote,
  onCancelPending,
  onDelete,
  canDelete = false,
  myEmail = '',
  isReadOnlySprint = false,
  markerColor = C.coral,
  authorName = '',
  authorEmail = '',
  canDrag = false,
  onDragStart,
  isActive = false,
  onActivate,
  zoom = 1,
}) {
  // Compensate for canvas zoom so the marker icon and view popup stay at fixed screen-pixel size.
  const safeZoom = Number(zoom) > 0 ? Number(zoom) : 1;
  const { lang } = useLang();
  const rootRef = useRef(null);
  const [pendingPopPos, setPendingPopPos] = useState({ left: 0, top: 0 });
  const [viewPopPos, setViewPopPos] = useState({ left: 0, top: 0 });
  const hasNote = Boolean(marker.note && marker.note.trim());
  const notePh = lang === 'ko' ? '의견 입력…' : 'Add a comment';
  const deleteAsk = lang === 'ko' ? '이 마커를 삭제할까요?' : 'Delete this marker?';

  useEffect(() => {
    if (!isActive) return undefined;
    function onDocDown(ev) {
      if (rootRef.current && !rootRef.current.contains(ev.target)) {
        if (typeof onActivate === 'function') onActivate(null);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [isActive, onActivate]);

  useLayoutEffect(() => {
    if (!isPending || !rootRef.current) return undefined;
    function updatePos() {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPendingPopPos({ left: r.right + 8, top: r.top + r.height / 2 });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isPending, marker.xPct, marker.yPct]);

  // Same screen-coord tracking for the view popup so it can be portaled out of the
  // page frame's overflow:hidden box.
  useLayoutEffect(() => {
    if (!isActive || !rootRef.current) return undefined;
    function updatePos() {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setViewPopPos({ left: r.left, top: r.top });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isActive, marker.xPct, marker.yPct, safeZoom]);

  // ── Speech-bubble marker icon (cyan fill, thick white outline via SVG stroke) ──
  const markerIcon = (
    <svg
      width="28"
      height="26"
      viewBox="0 0 70 65"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path
        d="M61 1C65.4183 1 69 4.58172 69 9V42C69 46.4183 65.4183 50 61 50H15.9268L1 62V9C1 4.58172 4.58172 1 9 1H61Z"
        fill="#06B6D4"
        stroke="white"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    </svg>
  );

  const avatarBg = markerColor;
  const initials = getAvatarInitials(authorName, authorEmail);

  // ── Pending input bubble — 1.4× scale (262×73, viewBox 749×208) ──
  const BUBBLE_W = 262;
  const BUBBLE_H = 73;
  // Tail tip in container ≈ (0.35, 71.9) — bottom-LEFT.
  const PENDING_TAIL_X = 0.35;
  const PENDING_TAIL_Y = 71.9;
  const pendingPopover =
    isPending &&
    createPortal(
      <div
        data-placement-ui
        role="dialog"
        aria-label={notePh}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          // Tail tip should land near the click position. pendingPopPos.left = marker.right + 8.
          left: pendingPopPos.left - 8 - PENDING_TAIL_X,
          top: pendingPopPos.top - PENDING_TAIL_Y,
          zIndex: 99999,
          width: BUBBLE_W,
          height: BUBBLE_H,
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.12))',
        }}
      >
        {/* Full bubble SVG (outline + input rect + OK button rect) — drawn beneath real controls */}
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 749 208"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          style={{ display: 'block', position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <path
            d="M717 1C734.121 1 748 14.8793 748 32V127C748 144.121 734.121 158 717 158H48.1309L1 204.754V32C1.00018 14.8793 14.8793 1 32 1H717Z"
            fill="white"
          />
          <path
            d="M748 32H749V32L748 32ZM717 158V159V159V158ZM48.1309 158V157H47.719L47.4266 157.29L48.1309 158ZM1 204.754H0V207.154L1.70426 205.464L1 204.754ZM1 32L0 32V32H1ZM32 1V0V1ZM717 1V2C733.568 2 747 15.4316 747 32L748 32L749 32C749 14.327 734.673 0 717 0V1ZM748 32H747V127H748H749V32H748ZM748 127H747C747 143.569 733.569 157 717 157V158V159C734.673 159 749 144.673 749 127H748ZM717 158V157H48.1309V158V159H717V158ZM48.1309 158L47.4266 157.29L0.295738 204.044L1 204.754L1.70426 205.464L48.8351 158.71L48.1309 158ZM1 204.754H2V32H1H0V204.754H1ZM1 32L2 32C2.00017 15.4316 15.4316 2 32 2V1V0C14.327 1.78814e-07 0.000185132 14.327 0 32L1 32ZM32 1V2H717V1V0H32V1Z"
            fill="#06B6D4"
          />
          {/* OK button background (rendered by SVG; the real button sits on top transparently) */}
          <rect x="622" y="36.2539" width="87" height="87" rx="20" fill="#69B5D1" />
          {/* Input outline (gray pill) */}
          <rect x="143" y="32.2539" width="446" height="95" rx="19" stroke="#C2C2C0" strokeWidth="2" />
        </svg>

        {/* Avatar — 1.4× scale */}
        <div
          style={{
            position: 'absolute',
            left: 13,
            top: 13,
            width: 31,
            height: 31,
            borderRadius: 15,
            background: avatarBg,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textTransform: 'uppercase',
          }}
        >
          {initials}
        </div>

        {/* Real input — transparent over SVG outline rect */}
        <input
          value={draftNote}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={notePh}
          autoFocus
          style={{
            position: 'absolute',
            left: 52,
            top: 11,
            width: 157,
            height: 32,
            boxSizing: 'border-box',
            padding: '0 11px',
            fontSize: 14,
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            color: C.fg1,
            background: 'transparent',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onConfirmNote();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancelPending();
            }
          }}
        />

        {/* Real OK button — transparent over the blue SVG rect */}
        <button
          type="button"
          onClick={onConfirmNote}
          disabled={!String(draftNote || '').trim()}
          style={{
            position: 'absolute',
            left: 218,
            top: 13,
            width: 31,
            height: 31,
            padding: 0,
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: String(draftNote || '').trim() ? 'pointer' : 'not-allowed',
            opacity: String(draftNote || '').trim() ? 1 : 0.55,
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {lang === 'ko' ? '확인' : 'OK'}
        </button>
      </div>,
      document.body,
    );

  // ── View popup — CSS bubble (width fixed, height auto). Tail tip anchors to
  //    the marker's click point on screen. Portaled to document.body so the page
  //    frame's overflow:hidden can't clip it.
  const VIEW_BUBBLE_W = 207;
  // Tail is now an absolutely positioned SVG that protrudes 13 px below the
  // container's bottom edge. VIEW_TAIL_X = tail.left in container coords (= tip x);
  // VIEW_TAIL_PROTRUDE = tail.bottom protrusion (used to shift the container so the
  // tip lands exactly on viewPopPos.top).
  const VIEW_TAIL_X = 16;
  const VIEW_TAIL_PROTRUDE = 13;
  const viewPopup = isActive && !isPending && hasNote ? createPortal(
    // CSS-based bubble (replaces the fixed-size SVG). The body grows with the note
    // content; the tail is absolutely positioned below the container so its bottom-left
    // tip lands on the marker's click point. The whole container is shifted by
    // `translateY(calc(-100% - VIEW_TAIL_PROTRUDE px))` so the tail tip aligns even as
    // the body height changes.
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: viewPopPos.left - VIEW_TAIL_X,
        top: viewPopPos.top,
        width: VIEW_BUBBLE_W,
        transform: `translateY(calc(-100% - ${VIEW_TAIL_PROTRUDE}px))`,
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.12))',
        pointerEvents: 'auto',
        zIndex: 99999,
        // Defensive: ensure nothing in this subtree clips the absolutely-positioned tail.
        overflow: 'visible',
      }}
    >
      {/* Bubble body — auto height, padding for avatar/close gutter. */}
      <div
        style={{
          position: 'relative',
          background: '#fff',
          border: '1.5px solid #06B6D4',
          borderRadius: 11,
          padding: '11px 38px 10px 41px',
          minHeight: 53,
          boxSizing: 'border-box',
          overflow: 'visible',
        }}
      >
        {/* Avatar */}
        <div
          style={{
            position: 'absolute',
            left: 10,
            top: 12,
            width: 25,
            height: 25,
            borderRadius: 14,
            background: avatarBg,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textTransform: 'uppercase',
          }}
        >
          {initials}
        </div>

        {/* Author name */}
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: C.fg1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.15,
            marginBottom: 2,
          }}
        >
          {authorName || (authorEmail ? authorEmail.split('@')[0] : 'User')}
        </div>

        {/* Close (gray circle ×) — top right */}
        <button
          type="button"
          aria-label="Close"
          title="Close"
          onClick={(e) => {
            e.stopPropagation();
            if (typeof onActivate === 'function') onActivate(null);
          }}
          style={{
            position: 'absolute',
            right: 8,
            top: 12,
            width: 17,
            height: 17,
            padding: 0,
            background: '#E5E7EB',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            color: '#6B7280',
            fontSize: 13,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        {/* Note body — full-text wrap, no clamp. */}
        <div
          style={{
            fontSize: 11,
            color: C.fg1,
            lineHeight: 1.4,
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {marker.note}
        </div>

        {/* Trash button — positioned just below the close button (same right gutter). */}
        {canDelete ? (
          <button
            type="button"
            aria-label="Delete marker"
            title="Delete marker"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(deleteAsk)) {
                onDelete(marker.id);
                if (typeof onActivate === 'function') onActivate(null);
              }
            }}
            style={{
              position: 'absolute',
              right: 7,
              top: 31,
              width: 20,
              height: 20,
              padding: 0,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: C.fg3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = C.coral; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.fg3; }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M5 6V12M8 6V12M11 6V12M2 4H14M6 4V2.5C6 2.22386 6.22386 2 6.5 2H9.5C9.77614 2 10 2.22386 10 2.5V4M3.5 4L4 13.5C4 13.7761 4.22386 14 4.5 14H11.5C11.7761 14 12 13.7761 12 13.5L12.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        ) : null}
      </div>

      {/* Tail — absolutely positioned so the container is free to scroll/clip without
         affecting it. Sits VIEW_TAIL_PROTRUDE px below the container's bottom edge; the
         outer container's translateY adjustment keeps the tip on the click point.
         `bottom: -13` makes the tail extend below the box; `left: 16` matches VIEW_TAIL_X. */}
      <svg
        width={14}
        height={14}
        viewBox="0 0 14 14"
        style={{
          position: 'absolute',
          bottom: -VIEW_TAIL_PROTRUDE,
          left: VIEW_TAIL_X,
          display: 'block',
          pointerEvents: 'none',
        }}
      >
        {/* Fill: white triangle. */}
        <path d="M0 0 L14 0 L0 14 Z" fill="#ffffff" />
        {/* Outline: hypotenuse + left vertical edge get the cyan stroke; the top edge
           sits flush against the body's bottom border so we skip it. */}
        <path
          d="M14 0 L0 14 L0 0"
          fill="none"
          stroke="#06B6D4"
          strokeWidth="1.5"
          strokeLinejoin="miter"
          strokeLinecap="butt"
        />
      </svg>
    </div>,
    document.body
  ) : null;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${marker.xPct}%`,
        top: `${marker.yPct}%`,
        width: 0,
        height: 0,
        zIndex: isActive ? 60 : 25,
        pointerEvents: 'none',
      }}
    >
      <div
        ref={rootRef}
        data-marker-root
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          // Bottom-left of the marker icon anchors to the click coordinate, AND scale(1/zoom)
          // cancels the canvas zoom so the marker icon and view popup stay at fixed screen size.
          transform: `translate(0, -100%) scale(${1 / safeZoom})`,
          transformOrigin: '0 100%',
          pointerEvents: 'auto',
          cursor: canDrag ? 'grab' : (isPending ? 'default' : 'pointer'),
          filter: (isPending || isActive) ? 'none' : 'drop-shadow(0px 2px 4px rgba(0,0,0,0.25))',
        }}
        onMouseDown={(e) => {
          if (!canDrag) return;
          if (e.button !== 0) return;
          if (typeof onDragStart === 'function') onDragStart(e, marker);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isPending) return;
          if (hasNote && typeof onActivate === 'function') {
            onActivate(isActive ? null : marker.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isPending) return;
          if (isReadOnlySprint) {
            window.alert('현재 스프린트에서만 삭제 가능합니다');
            return;
          }
          if (!canDelete) return;
          if (window.confirm(deleteAsk)) onDelete(marker.id);
        }}
      >
        {/* Hide the icon while composing a comment (input bubble) or viewing one (popup). */}
        {!isPending && !isActive && markerIcon}
        {pendingPopover}
        {viewPopup}
      </div>
    </div>
  );
}

function BlueprintViewer({
  projectId,
  timelineAnchorSeed,
  designImageUrl,
  onUploadImage,
  onDeleteImage,
  uploadState,
  currentSprint,
  projectMetaLoading = false,
  viewingSprint,
  onSprintSelect,
  onRequestDeleteSprint,
  onSelectedPageChange,
  hasConsensusRecord = false,
  onOpenConsensusPanel = null,
  onDropImageFiles = null,
  onPagesInitialLoaded = null,
  sprintsMeta = [],
  onOpenSprintSettings = null,
}) {
  const { t } = useLang();
  const canvasRef = useRef(null);
  // Always points at the latest `onPagesInitialLoaded` prop, so the pages-load
  // effect can fire it without re-binding on every parent re-render.
  const onPagesInitialLoadedRef = useRef(onPagesInitialLoaded);
  onPagesInitialLoadedRef.current = onPagesInitialLoaded;
  const viewportRef = useRef(null);
  const contextMenuRef = useRef(null);
  const skipNextMarkerClick = useRef(false);
  const panSession = useRef(null);
  const panXRef = useRef(0);
  const panYRef = useRef(0);

  const [markerMode, setMarkerMode] = useState(false);
  const [handTool, setHandTool] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [designMarkers, setDesignMarkers] = useState([]);
  const [pendingMarker, setPendingMarker] = useState(null);
  const [draftNote, setDraftNote] = useState('');
  const [imageMenu, setImageMenu] = useState({ open: false, x: 0, y: 0, imgId: null });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserFullName, setCurrentUserFullName] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState(''); // 'engineer' | 'designer' | 'lead'
  const [markerProfiles, setMarkerProfiles] = useState({}); // email → { full_name }
  const [activeMarkerId, setActiveMarkerId] = useState(null); // id of marker whose view popup is open

  // ── Pages (multi-page artboard) ──────────────────────────────
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [pageImages, setPageImages] = useState([]); // design_files rows for this sprint
  const [pageEditingId, setPageEditingId] = useState(null); // navigator input
  const [pageEditDraft, setPageEditDraft] = useState('');
  const [artboardEditingId, setArtboardEditingId] = useState(null); // artboard label input
  const [artboardEditDraft, setArtboardEditDraft] = useState('');
  const artboardInputRef = useRef(null);
  const [imageDrag, setImageDrag] = useState(null); // { imgId, pageId, startMouseX, startMouseY, startX, startY }
  const [markerDrag, setMarkerDrag] = useState(null); // { markerId, pageEl, startMouseX, startMouseY, startXPct, startYPct }
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [imageResize, setImageResize] = useState(null); // { imgId, corner, startX, startY, startW, startH, startImgX, startImgY }
  const pageRefsMap = useRef({});
  // Multi-select: keys like 'image:<uuid>' / 'text:<uuid>'. Single selections (selectedImageId/selectedTextId)
  // are kept for backward-compatible UX (panel, single resize). Group ops read both.
  const [multiSelection, setMultiSelection] = useState(() => new Set());
  const [marqueeBox, setMarqueeBox] = useState(null); // { pageId, x0, y0, x1, y1 } in unscaled page coords
  const [groupDrag, setGroupDrag] = useState(null); // { pageId, startMouseX, startMouseY, items: [{kind, id, startX, startY}] }
  const [guideLines, setGuideLines] = useState([]); // [{ pageId, axis: 'h'|'v', pos }]
  const [undoStack, setUndoStack] = useState([]); // max 50 actions
  const undoStackRef = useRef([]);
  useEffect(() => { undoStackRef.current = undoStack; }, [undoStack]);
  const [pagesPanelOpen, setPagesPanelOpen] = useState(true);
  const [pageContextMenu, setPageContextMenu] = useState({ open: false, x: 0, y: 0, pageId: null, source: null });
  const pageRenameInputRef = useRef(null);
  // Tracks the sprint for which we've already centered on the first page (one-time init per sprint).
  const initialPanSetForSprintRef = useRef(null);
  const [selectMode, setSelectMode] = useState(true);
  const pageContextMenuRef = useRef(null);
  const [gridMode, setGridMode] = useState('grid'); // 'grid' | 'dots' | 'none'
  // Page orientation — drives the active page dimensions and the canvas flex direction.
  // Persisted in localStorage so reload restores the user's chosen mode.
  const [pageOrientation, setPageOrientation] = useState(() => {
    try {
      const v = typeof window !== 'undefined' ? window.localStorage.getItem('workspace.pageOrientation') : null;
      return v === 'horizontal' ? 'horizontal' : 'vertical';
    } catch { return 'vertical'; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('workspace.pageOrientation', pageOrientation); } catch { /* ignore */ }
  }, [pageOrientation]);
  // Reset pan when orientation flips so the user lands on the first page in the new layout.
  // Skips the initial mount (which is handled by the initial-view effect below).
  const lastOrientationRef = useRef(pageOrientation);
  useEffect(() => {
    if (lastOrientationRef.current === pageOrientation) return;
    lastOrientationRef.current = pageOrientation;
    setPanX(0);
    setPanY(0);
  }, [pageOrientation]);
  // Each page is always portrait A4 (794 × 1123). Orientation only flips the layout
  // direction (column vs row) — the page itself never rotates.
  const isHorizontal = pageOrientation === 'horizontal';
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const gridMenuRef = useRef(null);
  // Mirror menu rendered at the canvas top-right (same options as navigator gridMenu).
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const canvasMenuRef = useRef(null);
  const canvasMenuBtnRef = useRef(null);
  // Drag-and-drop upload UI state.
  const [isDragOver, setIsDragOver] = useState(false);
  // dragenter fires once for every child the cursor crosses; track depth so we only
  // dismiss the overlay when the cursor truly leaves the viewport.
  const dragDepthRef = useRef(0);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [scrollbarDrag, setScrollbarDrag] = useState(null);

  // ── Text tool ────────────────────────────────────────────────
  const [textMode, setTextMode] = useState(false);
  const [texts, setTexts] = useState([]); // text_elements rows
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [textEditingId, setTextEditingId] = useState(null);
  const [textEditDraft, setTextEditDraft] = useState('');
  const [textDrag, setTextDrag] = useState(null);
  const [defaultTextStyle, setDefaultTextStyle] = useState({
    font_size: 16,
    font_weight: 400,
    color: '#1f2937',
    italic: false,
    strikethrough: false,
    text_align: 'left',
    width: 200,
    height: 60,
  });
  // Drag-resize state for text boxes (mirrors imageResize for images).
  const [textResize, setTextResize] = useState(null);
  // Multi-selection resize — proportional scale across the bbox of all selected items.
  // Shape: { pageId, corner, startMouseX, startMouseY, bbox: { x, y, w, h }, items: [...] }
  // where each item snapshots its kind, id, page-relative {x, y, w, h} at drag start so we
  // can recompute its scaled position/size every mousemove without losing precision.
  const [multiResize, setMultiResize] = useState(null);
  // Image settings: Replace Image (hidden file input ref) + Crop mode.
  const imageReplaceInputRef = useRef(null);
  // cropState: { imgId, x, y, w, h } in image-local px (relative to the rendered image box).
  const [cropState, setCropState] = useState(null);
  const [cropDrag, setCropDrag] = useState(null);
  const [imageReplaceState, setImageReplaceState] = useState({ status: 'idle', message: '' });
  const editingTextareaRef = useRef(null);
  const textMeasurerRef = useRef(null);
  const currentSprintNum = Number(currentSprint);
  /** Timeline `viewingSprint` can be null/0 before meta loads — treat as canonical sprint so markers work. */
  const effectiveViewingSprint = (() => {
    const raw = viewingSprint;
    if (raw == null || raw === '') {
      return Number.isFinite(currentSprintNum) ? currentSprintNum : 0;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      return Number.isFinite(currentSprintNum) ? currentSprintNum : 0;
    }
    if (v < 1 && Number.isFinite(currentSprintNum) && currentSprintNum >= 1) {
      return currentSprintNum;
    }
    return v;
  })();
  // Clear the "already centered" marker whenever the viewing sprint changes so the
  // initial-view effect re-runs once for the new sprint (after its pages load + viewport
  // is measured). zoom/pages updates within the same sprint still skip via the guard.
  useEffect(() => {
    initialPanSetForSprintRef.current = null;
  }, [effectiveViewingSprint]);
  const isReadOnlySprint =
    viewingSprint != null &&
    viewingSprint !== '' &&
    Number(viewingSprint) >= 1 &&
    Number.isFinite(currentSprintNum) &&
    currentSprintNum >= 1 &&
    Number(viewingSprint) !== currentSprintNum;

  const readOnlyDebug = {
    currentSprint,
    currentSprintNum,
    viewingSprint,
    effectiveViewingSprint,
    isReadOnlySprint,
  };

  /** 버튼 활성화 확인용: 항상 켜 둠. 실제 찍기는 `designImageUrl` / read-only에서 제한. */
  const canAddMarker = true;

  useEffect(() => {
    panXRef.current = panX;
  }, [panX]);
  useEffect(() => {
    panYRef.current = panY;
  }, [panY]);

  // Refs so the (mount-only) wheel handler can read current zoom & page count.
  const zoomRef = useRef(zoom);
  const pageCountRef = useRef(pages.length);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { pageCountRef.current = pages.length; }, [pages.length]);
  // Page dims are constants (A4 portrait), but the mount-only wheel handler still needs
  // to read the current orientation so it can ignore horizontal scroll in horizontal mode.
  const isHorizontalRef = useRef(isHorizontal);
  useEffect(() => { isHorizontalRef.current = isHorizontal; }, [isHorizontal]);

  // Refs so drag handlers can read fresh state without re-binding (which would reset closure-local lastX/lastY).
  const pageImagesRef = useRef(pageImages);
  const textsRef = useRef(texts);
  useEffect(() => { pageImagesRef.current = pageImages; }, [pageImages]);
  useEffect(() => { textsRef.current = texts; }, [texts]);
  // Live DOM refs for text boxes — let textResize measure scrollWidth/Height to enforce
  // a content-size minimum (you can't shrink a text box smaller than what fits inside).
  const textRefsMap = useRef({});
  // Hidden measurer used during text resize to compute the minimum size that still
  // shows all of the text. Single shared element — its font is set per-resize.
  const textResizeMeasurerRef = useRef(null);

  // In-flight refs — let realtime callbacks know which row is being locally manipulated
  // so we don't overwrite an in-progress drag/resize/edit with a stale echo from the server.
  const imageDragRef = useRef(null);
  const imageResizeRef = useRef(null);
  const cropStateRef = useRef(null);
  const textDragRef = useRef(null);
  const textResizeRef = useRef(null);
  const textEditingIdRef = useRef(null);
  const pageEditingIdRef = useRef(null);
  const artboardEditingIdRef = useRef(null);
  useEffect(() => { imageDragRef.current = imageDrag; }, [imageDrag]);
  useEffect(() => { imageResizeRef.current = imageResize; }, [imageResize]);
  useEffect(() => { cropStateRef.current = cropState; }, [cropState]);
  useEffect(() => { textDragRef.current = textDrag; }, [textDrag]);
  useEffect(() => { textResizeRef.current = textResize; }, [textResize]);
  useEffect(() => { textEditingIdRef.current = textEditingId; }, [textEditingId]);
  useEffect(() => { pageEditingIdRef.current = pageEditingId; }, [pageEditingId]);
  useEffect(() => { artboardEditingIdRef.current = artboardEditingId; }, [artboardEditingId]);

  // ── Live cursors (Figma-style) ─────────────────────────────
  // remoteCursors: { [userId]: { name, color, pageId, x, y } } in page-relative px.
  const [remoteCursors, setRemoteCursors] = useState({});
  const presenceChannelRef = useRef(null);
  // Throttle handle: { last: timestamp, pending: payload|null, timeout: id|null }
  const cursorThrottleRef = useRef({ last: 0, pending: null, timeout: null });

  // ── Element locks (Figma-style "someone else is editing this") ─────
  // lockedElements: { [`image:<id>` | `text:<id>`]: { userId, userName, color, lockedAt } }
  const [lockedElements, setLockedElements] = useState({});
  const lockedElementsRef = useRef({});
  useEffect(() => { lockedElementsRef.current = lockedElements; }, [lockedElements]);
  // Refs for selection state so broadcast callbacks (which close over stale state) can
  // perform rollback when they lose a lock race.
  const selectedImageIdRef = useRef(null);
  const selectedTextIdRef = useRef(null);
  useEffect(() => { selectedImageIdRef.current = selectedImageId; }, [selectedImageId]);
  useEffect(() => { selectedTextIdRef.current = selectedTextId; }, [selectedTextId]);

  // Returns true if the given element is currently locked by someone other than us.
  function isLockedByOther(kind, id) {
    const key = `${kind}:${id}`;
    const rec = lockedElementsRef.current[key];
    if (!rec) return false;
    const myEmail = String(currentUserEmail || '').trim().toLowerCase();
    return rec.userId !== myEmail;
  }

  // Local rollback when we lose a lock race: drop the element from our selection state.
  function rollbackSelectionFor(kind, id) {
    if (kind === 'image') {
      if (selectedImageIdRef.current === id) setSelectedImageId(null);
      if (imageDragRef.current?.imgId === id) setImageDrag(null);
      if (imageResizeRef.current?.imgId === id) setImageResize(null);
      if (cropStateRef.current?.imgId === id) setCropState(null);
    } else if (kind === 'text') {
      if (selectedTextIdRef.current === id) setSelectedTextId(null);
      if (textDragRef.current?.id === id) setTextDrag(null);
      if (textResizeRef.current?.id === id) setTextResize(null);
      if (textEditingIdRef.current === id) {
        setTextEditingId(null);
        setTextEditDraft('');
      }
    }
    const k = `${kind}:${id}`;
    setMultiSelection((prev) => {
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      return next;
    });
  }

  // What we currently claim — derived from single + multi selection.
  const myClaimKeys = useMemo(() => {
    const s = new Set();
    if (selectedImageId) s.add(`image:${selectedImageId}`);
    if (selectedTextId) s.add(`text:${selectedTextId}`);
    for (const k of multiSelection) s.add(k);
    return s;
  }, [selectedImageId, selectedTextId, multiSelection]);
  // Previous claims snapshot for diffing on each render. Initialised to an empty set.
  const prevClaimKeysRef = useRef(new Set());

  // Expose selectedPageId to parent so upload can target the right page.
  useEffect(() => {
    if (typeof onSelectedPageChange === 'function') {
      onSelectedPageChange(selectedPageId);
    }
  }, [selectedPageId, onSelectedPageChange]);

  useEffect(() => {
    const down = (e) => {
      if (e.code !== 'Space') return;
      if (isEditableKeyboardTarget(e.target)) return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const up = (e) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const blur = () => setSpaceHeld(false);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Tool shortcuts: V = Select, T = Text, M = Marker.
  // Ref pattern so the listener is bound once but always reads the latest
  // mode flags and toggle functions (the toggles read state like
  // `isReadOnlySprint`, `designImageUrl`, `pageImages` via closure and are
  // recreated each render — calling a stale capture would skip those guards).
  const toolShortcutRef = useRef(null);
  toolShortcutRef.current = {
    selectMode,
    textMode,
    markerMode,
    toggleSelectMode,
    toggleTextMode,
    toggleMarkerMode,
  };
  useEffect(() => {
    const onKey = (e) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typeof e.key !== 'string' || e.key.length !== 1) return;
      const k = e.key.toLowerCase();
      const s = toolShortcutRef.current;
      if (!s) return;
      if (k === 'v') {
        if (!s.selectMode) s.toggleSelectMode();
      } else if (k === 't') {
        if (!s.textMode) s.toggleTextMode();
      } else if (k === 'm') {
        if (!s.markerMode) s.toggleMarkerMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!isPanning) return undefined;
    const move = (e) => {
      const s = panSession.current;
      if (!s) return;
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      if (Math.abs(dx) + Math.abs(dy) > 2) s.moved = true;
      setPanX(s.px0 + dx);
      setPanY(s.py0 + dy);
    };
    const up = () => {
      if (panSession.current?.moved) skipNextMarkerClick.current = true;
      panSession.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isPanning]);

  useEffect(() => {
    if (!imageMenu.open) return undefined;
    const close = (e) => {
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target)) return;
      setImageMenu({ open: false, x: 0, y: 0, imgId: null });
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [imageMenu.open]);

  useEffect(() => {
    let alive = true;
    let channel = null;
    async function loadCurrentUser() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const email = String(data?.user?.email || '').trim().toLowerCase();
      const userId = data?.user?.id || null;
      setCurrentUserEmail(email);
      // Seed from auth user_metadata first (may be empty), then fetch from profiles for the canonical value.
      const metaName = String(data?.user?.user_metadata?.full_name || '');
      setCurrentUserFullName(metaName);
      if (email) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('email', email)
          .maybeSingle();
        if (!alive) return;
        const profName = String(profileRow?.full_name || '').trim();
        if (profName) setCurrentUserFullName(profName);
        const role = String(profileRow?.role || '').trim().toLowerCase();
        if (role) setCurrentUserRole(role);
      }
      // Subscribe to profiles UPDATE for this user so a name change in SettingsModal
      // propagates to live cursors and lock labels without a refresh. Mirrors ChatPanel.
      if (userId) {
        channel = supabase
          .channel(`profile-realtime-${userId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            (payload) => {
              const next = payload.new || {};
              const nextName = String(next.full_name || '').trim();
              if (nextName) setCurrentUserFullName(nextName);
              const nextRole = String(next.role || '').trim().toLowerCase();
              if (nextRole) setCurrentUserRole(nextRole);
            },
          )
          .subscribe();
      }
    }
    loadCurrentUser();
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Fetch profiles (full_name) for any new marker authors so the popup can show their names.
  useEffect(() => {
    let alive = true;
    const uniqueEmails = new Set();
    for (const m of designMarkers) {
      const email = String(m.createdBy || '').trim().toLowerCase();
      if (email && !markerProfiles[email]) uniqueEmails.add(email);
    }
    if (uniqueEmails.size === 0) return;
    (async () => {
      const list = [...uniqueEmails];
      const { data } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('email', list);
      if (!alive) return;
      if (data && data.length > 0) {
        setMarkerProfiles((prev) => {
          const next = { ...prev };
          for (const p of data) {
            const e = String(p.email || '').trim().toLowerCase();
            if (e) next[e] = { full_name: p.full_name || '' };
          }
          return next;
        });
      }
    })();
    return () => { alive = false; };
  }, [designMarkers, markerProfiles]);

  // Viewer-relative color resolver (email-keyed) — the single entry point every
  // surface (markers, cursors, locks) uses to resolve a user's color.
  const colorFor = useProjectColors(projectId, currentUserEmail);

  function normalizeMarkerRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      xPct: Number(row.x_pct ?? row.xPct ?? 0),
      yPct: Number(row.y_pct ?? row.yPct ?? 0),
      note: String(row.note ?? ''),
      createdBy: String(row.created_by ?? row.createdBy ?? '').trim().toLowerCase(),
      pageId: row.page_id != null ? String(row.page_id) : (row.pageId != null ? String(row.pageId) : null),
    };
  }

  useEffect(() => {
    let alive = true;

    async function loadMarkers() {
      if (!projectId || !Number.isFinite(Number(effectiveViewingSprint)) || effectiveViewingSprint < 1) {
        setDesignMarkers([]);
        return;
      }
      const { data, error } = await supabase
        .from('markers')
        .select('id, project_id, sprint_number, x_pct, y_pct, note, created_by, created_at, page_id')
        .eq('project_id', projectId)
        .eq('sprint_number', Number(effectiveViewingSprint))
        .order('created_at', { ascending: true });
      if (!alive) return;
      if (error) {
        console.error('[BlueprintViewer] Failed to load markers', error);
        return;
      }
      setDesignMarkers((data || []).map(normalizeMarkerRow).filter(Boolean));
    }

    loadMarkers();

    if (!projectId) return () => { alive = false; };
    /**
     * Realtime: `public.markers` for this project — INSERT (filtered by project_id),
     * DELETE (full-table; filter client-side by removed row id), UPDATE (filtered).
     * Keeps on-canvas pins in sync when collaborators add/remove/edit notes.
     */
    const channel = createMarkersRealtimeChannel(supabase, projectId, {
      onInsert: (payload) => {
        if (import.meta.env.DEV) {
          console.log('[markers realtime] INSERT payload', payload);
        }
        const payloadSprint = Number(payload?.new?.sprint_number);
        if (payloadSprint !== Number(effectiveViewingSprint)) return;
        const next = normalizeMarkerRow(payload.new);
        if (!next) return;
        setDesignMarkers((prev) => (prev.some((m) => String(m.id) === String(next.id)) ? prev : [...prev, next]));
      },
      onDelete: (payload) => {
        if (import.meta.env.DEV) {
          console.log('[markers realtime] DELETE payload', payload, {
            oldRow: payload?.old,
            removedId: payload?.old?.id,
            projectId,
          });
        }
        const removedId = payload?.old?.id;
        if (!removedId) {
          console.warn('[markers realtime] DELETE received without id in payload.old. ' +
            'Set REPLICA IDENTITY FULL on public.markers to receive full old row.');
          return;
        }
        setDesignMarkers((prev) => prev.filter((m) => String(m.id) !== String(removedId)));
      },
      onUpdate: (payload) => {
        if (import.meta.env.DEV) {
          console.log('[markers realtime] UPDATE payload', payload, {
            newRow: payload?.new,
            oldRow: payload?.old,
            newNote: payload?.new?.note,
            id: payload?.new?.id,
            projectId,
          });
        }
        const payloadSprint = Number(payload?.new?.sprint_number);
        if (payloadSprint !== Number(effectiveViewingSprint)) return;
        const next = normalizeMarkerRow(payload.new);
        if (!next) {
          console.warn('[markers realtime] UPDATE received without normalizable payload.new', payload);
          return;
        }
        setDesignMarkers((prev) => {
          const exists = prev.some((m) => String(m.id) === String(next.id));
          if (!exists) {
            if (import.meta.env.DEV) {
              console.log('[markers realtime] UPDATE for unknown marker; appending', next);
            }
            return [...prev, next];
          }
          return prev.map((m) =>
            String(m.id) === String(next.id)
              ? {
                  ...m,
                  ...next,
                  note: next.note,
                }
              : m,
          );
        });
      },
    }).subscribe((status) => {
      if (import.meta.env.DEV) {
        console.log('[markers realtime] channel status', status, { projectId });
      }
    });

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [projectId, viewingSprint, currentSprint, effectiveViewingSprint]);

  // ── Pages: load (auto-create Page 1 if empty) ──────────────
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const sprintN = Number(effectiveViewingSprint);
        if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) {
          setPages([]);
          setSelectedPageId(null);
          return;
        }
        const { data, error } = await supabase
          .from('pages')
          .select('id, project_id, sprint_number, page_number, title, width, height, x_position, y_position')
          .eq('project_id', projectId)
          .eq('sprint_number', sprintN)
          .order('page_number', { ascending: true });
        if (!alive) return;
        if (error) {
          console.error('[BlueprintViewer] pages load failed', error);
          return;
        }
        let rows = data || [];
        if (rows.length === 0) {
          const { data: ins, error: insErr } = await supabase
            .from('pages')
            .insert({
              project_id: projectId,
              sprint_number: sprintN,
              page_number: 1,
              title: 'Page 1',
              width: A4_W,
              height: A4_H,
            })
            .select('id, project_id, sprint_number, page_number, title, width, height, x_position, y_position')
            .single();
          if (!alive) return;
          if (insErr) {
            console.error('[BlueprintViewer] page auto-create failed', insErr);
            return;
          }
          rows = ins ? [ins] : [];
        }
        setPages(rows);
        setSelectedPageId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? null));
      } finally {
        // Signals "initial pages picture is stable" to the parent loading gate,
        // including the no-sprint and error paths (otherwise the spinner would
        // hang in those states). Idempotent on the parent side.
        if (alive) onPagesInitialLoadedRef.current?.();
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, effectiveViewingSprint]);

  // ── Pages Realtime: INSERT / UPDATE / DELETE for this project + sprint ──
  // Keeps collaborators' navigators in sync when pages are added, renamed, or removed.
  useEffect(() => {
    if (!projectId) return undefined;
    const sprintN = Number(effectiveViewingSprint);
    if (!Number.isFinite(sprintN) || sprintN < 1) return undefined;
    const channel = supabase
      .channel(`pages-realtime-${projectId}-${sprintN}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pages', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          setPages((prev) => {
            if (prev.some((p) => String(p.id) === String(row.id))) return prev;
            // Insert in page_number order so the navigator + artboard stay sorted.
            const next = [...prev, row];
            next.sort((a, b) => (Number(a.page_number) || 0) - (Number(b.page_number) || 0));
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pages', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          const id = String(row.id);
          // Skip echoes for a page the user is renaming locally so their in-progress
          // input isn't yanked away by their own (or anyone else's) UPDATE.
          if (pageEditingIdRef.current && String(pageEditingIdRef.current) === id) return;
          if (artboardEditingIdRef.current && String(artboardEditingIdRef.current) === id) return;
          setPages((prev) => {
            let changed = false;
            const merged = prev.map((p) => {
              if (String(p.id) !== id) return p;
              changed = true;
              return { ...p, ...row };
            });
            if (!changed) return prev;
            // page_number could have changed — re-sort defensively.
            merged.sort((a, b) => (Number(a.page_number) || 0) - (Number(b.page_number) || 0));
            return merged;
          });
        },
      )
      .on(
        'postgres_changes',
        // DELETE filter on `old` columns requires REPLICA IDENTITY FULL; accept all DELETEs
        // for `pages` and filter client-side by id membership in local state.
        { event: 'DELETE', schema: 'public', table: 'pages' },
        (payload) => {
          const oldRow = payload.old || {};
          const deletedId = oldRow.id;
          if (deletedId == null) return;
          let nextPages = null;
          setPages((prev) => {
            const next = prev.filter((p) => String(p.id) !== String(deletedId));
            if (next.length === prev.length) {
              nextPages = prev;
              return prev; // not in local state
            }
            nextPages = next;
            return next;
          });
          // If the navigator/canvas was focused on the deleted page, move to the first
          // remaining page (mirrors the local delete handler's selection fallback).
          setSelectedPageId((prevSel) => {
            if (prevSel == null || String(prevSel) !== String(deletedId)) return prevSel;
            return (nextPages && nextPages[0]?.id) ?? null;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, effectiveViewingSprint]);

  // ── Pages: load images (design_files for this sprint) ──────
  useEffect(() => {
    let alive = true;
    async function load() {
      const sprintN = Number(effectiveViewingSprint);
      if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) {
        setPageImages([]);
        return;
      }
      const { data, error } = await supabase
        .from('design_files')
        .select('id, file_url, file_name, project_id, page_id, page_number, x_in_page, y_in_page, width, height, sprint_number')
        .eq('project_id', projectId)
        .eq('sprint_number', sprintN);
      if (!alive) return;
      if (error) {
        console.error('[BlueprintViewer] images load failed', error);
        return;
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[design_files load]', {
          projectId,
          sprint: sprintN,
          count: data?.length,
          positions: (data || []).map((r) => ({ id: r.id, page_id: r.page_id, x: r.x_in_page, y: r.y_in_page })),
        });
      }
      setPageImages(data || []);
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, effectiveViewingSprint, uploadState?.status]);

  // Realtime sync for design_files (pageImages) — INSERT/UPDATE/DELETE.
  // Channel keyed on (projectId, sprint); sprint is also checked client-side so cross-sprint
  // echoes are dropped early. Echoes for an item the user is currently dragging/resizing/cropping
  // are skipped so in-flight local state isn't overwritten by stale server values.
  useEffect(() => {
    if (!projectId) return undefined;
    const sprintN = Number(effectiveViewingSprint);
    if (!Number.isFinite(sprintN) || sprintN < 1) return undefined;
    const channel = supabase
      .channel(`design_files-realtime-${projectId}-${sprintN}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'design_files', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          setPageImages((prev) => (prev.some((im) => String(im.id) === String(row.id)) ? prev : [...prev, row]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'design_files', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          const id = String(row.id);
          // Skip echoes for items the user is actively manipulating locally.
          if (imageDragRef.current && String(imageDragRef.current.imgId) === id) return;
          if (imageResizeRef.current && String(imageResizeRef.current.imgId) === id) return;
          if (cropStateRef.current && String(cropStateRef.current.imgId) === id) return;
          setPageImages((prev) => prev.map((im) => (String(im.id) === id ? { ...im, ...row } : im)));
        },
      )
      .on(
        'postgres_changes',
        // DELETE filter on old columns requires REPLICA IDENTITY FULL; we accept all DELETEs
        // for `design_files` and rely on id-membership in local state to filter.
        { event: 'DELETE', schema: 'public', table: 'design_files' },
        (payload) => {
          const oldRow = payload.old || {};
          const deletedId = oldRow.id;
          if (deletedId == null) return;
          setPageImages((prev) => prev.filter((im) => String(im.id) !== String(deletedId)));
          if (selectedImageId && String(selectedImageId) === String(deletedId)) setSelectedImageId(null);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, effectiveViewingSprint]);

  // Legacy safety net: attach orphan design_files (page_id NULL) to selected page.
  // Position is preserved — DO NOT override x_in_page/y_in_page (new uploads now set them at insert time).
  useEffect(() => {
    if (!selectedPageId) return;
    const orphans = pageImages.filter((im) => !im.page_id);
    if (orphans.length === 0) return;
    (async () => {
      for (const im of orphans) {
        await supabase
          .from('design_files')
          .update({ page_id: selectedPageId })
          .eq('id', im.id);
      }
      setPageImages((prev) =>
        prev.map((im) => (im.page_id ? im : { ...im, page_id: selectedPageId })),
      );
    })();
  }, [pageImages, selectedPageId]);

  async function addPage(refPageNumber, before) {
    const sprintN = Number(effectiveViewingSprint);
    if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) return;
    const targetNum = before ? refPageNumber : refPageNumber + 1;
    // Shift existing pages out of the way.
    const toShift = pages.filter((p) => p.page_number >= targetNum);
    for (const p of toShift) {
      await supabase.from('pages').update({ page_number: p.page_number + 1 }).eq('id', p.id);
    }
    // Generate a non-conflicting "Page N" title: max(existing N) + 1.
    const usedNs = pages
      .map((p) => {
        const m = /^Page\s+(\d+)\s*$/.exec(String(p.title || ''));
        return m ? parseInt(m[1], 10) : null;
      })
      .filter((n) => Number.isFinite(n));
    const nextN = usedNs.length > 0 ? Math.max(...usedNs) + 1 : 1;
    const { data, error } = await supabase
      .from('pages')
      .insert({
        project_id: projectId,
        sprint_number: sprintN,
        page_number: targetNum,
        title: `Page ${nextN}`,
        width: A4_W,
        height: A4_H,
      })
      .select('id, project_id, sprint_number, page_number, title, width, height, x_position, y_position')
      .single();
    if (error) {
      console.error('[BlueprintViewer] addPage failed', error);
      return;
    }
    setPages((prev) => {
      const shifted = prev.map((p) =>
        p.page_number >= targetNum ? { ...p, page_number: p.page_number + 1 } : p,
      );
      return [...shifted, data].sort((a, b) => a.page_number - b.page_number);
    });
    setSelectedPageId(data.id);
  }

  async function renamePage(pageId, newTitle) {
    if (!pageId) {
      console.warn('[BlueprintViewer] renamePage: missing pageId');
      return;
    }
    const title = String(newTitle ?? '').trim() || 'Untitled';
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, title } : p)));
    const { data, error } = await supabase
      .from('pages')
      .update({ title })
      .eq('id', pageId)
      .select('id, title')
      .single();
    if (error) {
      console.error('[BlueprintViewer] renamePage failed', { pageId, title, error });
      return;
    }
    if (import.meta.env.DEV) {
      console.log('[BlueprintViewer] renamePage OK', data);
    }
    // Sync local state with server-confirmed value.
    if (data?.title != null) {
      setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, title: data.title } : p)));
    }
  }

  // Guards against multiple blur events firing commit handlers in rapid succession
  // (StrictMode double-fires, focus competition between inputs, etc.).
  const commitInProgressRef = useRef(false);
  const commitArtboardInProgressRef = useRef(false);

  function commitPageEdit() {
    if (commitInProgressRef.current) return;
    const pid = pageEditingId;
    if (!pid) return;
    commitInProgressRef.current = true;
    const title = pageEditDraft;
    setPageEditingId(null);
    setPageEditDraft('');
    renamePage(pid, title);
    setTimeout(() => { commitInProgressRef.current = false; }, 100);
  }

  function commitArtboardEdit() {
    if (commitArtboardInProgressRef.current) return;
    const pid = artboardEditingId;
    if (!pid) return;
    commitArtboardInProgressRef.current = true;
    const title = artboardEditDraft;
    setArtboardEditingId(null);
    setArtboardEditDraft('');
    renamePage(pid, title);
    setTimeout(() => { commitArtboardInProgressRef.current = false; }, 100);
  }

  // Mutual-exclusion entry points — opening one editor closes the other.
  function startNavigatorEdit(page) {
    setArtboardEditingId(null);
    setArtboardEditDraft('');
    setPageEditingId(page.id);
    setPageEditDraft(page.title || '');
  }

  function startArtboardEdit(page) {
    setPageEditingId(null);
    setPageEditDraft('');
    setArtboardEditingId(page.id);
    setArtboardEditDraft(page.title || '');
  }

  function handleRenamePageFromNavigator(pageId) {
    const target = pages.find((p) => p.id === pageId);
    if (!target) return;
    setSelectedPageId(target.id);
    startNavigatorEdit(target);
    setPageContextMenu({ open: false, x: 0, y: 0, pageId: null, source: null });
  }

  function handleRenamePageFromArtboard(pageId) {
    const target = pages.find((p) => p.id === pageId);
    if (!target) return;
    startArtboardEdit(target);
    setPageContextMenu({ open: false, x: 0, y: 0, pageId: null, source: null });
  }

  // Force-focus the navigator rename input whenever editing starts (autoFocus alone is unreliable
  // when other re-renders or scroll events fire in the same tick).
  useEffect(() => {
    if (!pageEditingId) return;
    const id = window.requestAnimationFrame(() => {
      const el = pageRenameInputRef.current;
      if (el) {
        try {
          el.focus();
          el.select();
        } catch (err) {
          // ignore
        }
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [pageEditingId]);

  // Same safety net for the artboard label input.
  useEffect(() => {
    if (!artboardEditingId) return;
    const id = window.requestAnimationFrame(() => {
      const el = artboardInputRef.current;
      if (el) {
        try {
          el.focus();
          el.select();
        } catch (err) {
          // ignore
        }
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [artboardEditingId]);

  async function handleDeletePage(pageId) {
    setPageContextMenu({ open: false, x: 0, y: 0, pageId: null, source: null });
    if (pages.length <= 1) {
      window.alert(t('pageDeleteLastWarning'));
      return;
    }
    if (!window.confirm(t('pageDeleteConfirm'))) return;
    const deletedNum = pages.find((p) => p.id === pageId)?.page_number ?? null;
    // ON DELETE SET NULL on design_files.page_id is already in place; just delete the row.
    const { error } = await supabase.from('pages').delete().eq('id', pageId);
    if (error) {
      console.error('[BlueprintViewer] handleDeletePage failed', error);
      return;
    }
    // Re-number remaining pages whose page_number > deletedNum (close the gap).
    if (Number.isFinite(deletedNum)) {
      const toShift = pages.filter((p) => p.id !== pageId && p.page_number > deletedNum);
      for (const p of toShift) {
        await supabase.from('pages').update({ page_number: p.page_number - 1 }).eq('id', p.id);
      }
    }
    setPages((prev) => {
      const next = prev
        .filter((p) => p.id !== pageId)
        .map((p) =>
          Number.isFinite(deletedNum) && p.page_number > deletedNum
            ? { ...p, page_number: p.page_number - 1 }
            : p,
        )
        .sort((a, b) => a.page_number - b.page_number);
      return next;
    });
    setSelectedPageId((prev) => {
      if (prev !== pageId) return prev;
      const remaining = pages.filter((p) => p.id !== pageId).sort((a, b) => a.page_number - b.page_number);
      return remaining[0]?.id ?? null;
    });
    // Detach images from the deleted page locally (their page_id was set to NULL by the FK).
    setPageImages((prev) => prev.map((im) => (im.page_id === pageId ? { ...im, page_id: null } : im)));
  }

  // Close page context menu on outside click.
  useEffect(() => {
    if (!pageContextMenu.open) return undefined;
    function onDocDown(ev) {
      if (pageContextMenuRef.current && pageContextMenuRef.current.contains(ev.target)) return;
      setPageContextMenu({ open: false, x: 0, y: 0, pageId: null, source: null });
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [pageContextMenu.open]);

  // Close grid-mode dropdown on outside click.
  useEffect(() => {
    if (!gridMenuOpen) return undefined;
    function onDocDown(ev) {
      if (gridMenuRef.current && gridMenuRef.current.contains(ev.target)) return;
      setGridMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [gridMenuOpen]);

  // Close canvas top-right dropdown on outside click.
  useEffect(() => {
    if (!canvasMenuOpen) return undefined;
    function onDocDown(ev) {
      if (canvasMenuRef.current && canvasMenuRef.current.contains(ev.target)) return;
      if (canvasMenuBtnRef.current && canvasMenuBtnRef.current.contains(ev.target)) return;
      setCanvasMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [canvasMenuOpen]);

  async function persistImagePosition(imgId, x, y, w, h) {
    if (!imgId) {
      console.warn('[persistImagePosition] missing imgId');
      return null;
    }
    // Clamp using the actual image width/height so resized images can reach the
    // right/bottom edges. Falls back to the current pageImages row, then to the
    // hard-coded defaults if the row is missing for any reason.
    const row = pageImages.find((im) => im.id === imgId);
    const imgW = Number(w ?? row?.width) || IMG_DEFAULT_W;
    const imgH = Number(h ?? row?.height) || IMG_DEFAULT_H;
    const px = Math.max(0, Math.min(A4_W - imgW, Math.round(x)));
    const py = Math.max(0, Math.min(A4_H - imgH, Math.round(y)));
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[persistImagePosition] UPDATE', { imgId, px, py });
    }
    const { data, error } = await supabase
      .from('design_files')
      .update({ x_in_page: px, y_in_page: py })
      .eq('id', imgId)
      .select('id, x_in_page, y_in_page')
      .single();
    if (error) {
      console.error('[persistImagePosition] failed', { imgId, px, py, error });
      return null;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[persistImagePosition] OK (server-confirmed)', data);
    }
    if (data) {
      setPageImages((prev) =>
        prev.map((im) =>
          im.id === imgId ? { ...im, x_in_page: data.x_in_page, y_in_page: data.y_in_page } : im,
        ),
      );
    }
    return data;
  }

  // ── Replace image: upload new file + remove old storage object + update DB row ──
  async function handleReplaceImage(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !selectedImageId) return;
    const row = pageImages.find((im) => im.id === selectedImageId);
    if (!row) return;
    setImageReplaceState({ status: 'uploading', message: '' });
    try {
      const filePath = `${projectId || 'global'}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from('design-bucket')
        .upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('design-bucket').getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl || '';
      if (!publicUrl) throw new Error('Public URL generation failed.');
      const { data, error } = await supabase
        .from('design_files')
        .update({ file_url: publicUrl, file_name: file.name })
        .eq('id', selectedImageId)
        .select('id, file_url, file_name')
        .single();
      if (error) throw error;
      // Best-effort cleanup of the old storage object.
      const old = extractStorageObjectFromPublicUrl(row.file_url || '');
      if (old?.path) {
        const bucket = old.bucket || 'design-bucket';
        supabase.storage.from(bucket).remove([old.path]).catch(() => {});
      }
      setPageImages((prev) =>
        prev.map((im) => (im.id === selectedImageId ? { ...im, ...data } : im)),
      );
      setImageReplaceState({ status: 'success', message: '' });
      setTimeout(() => setImageReplaceState({ status: 'idle', message: '' }), 1500);
    } catch (err) {
      console.error('[handleReplaceImage] failed', err);
      setImageReplaceState({ status: 'error', message: err?.message || 'Replace failed.' });
    }
  }

  // ── Crop: enter mode, drag handles, then apply via offscreen canvas ──
  function startCropForSelected() {
    if (!selectedImageId) return;
    const row = pageImages.find((im) => im.id === selectedImageId);
    if (!row) return;
    const w = Number(row.width) || IMG_DEFAULT_W;
    const h = Number(row.height) || IMG_DEFAULT_H;
    // Default crop = inset 10% from each edge so the handles are easy to grab.
    const inset = Math.round(Math.min(w, h) * 0.1);
    setCropState({
      imgId: selectedImageId,
      x: inset,
      y: inset,
      w: Math.max(20, w - inset * 2),
      h: Math.max(20, h - inset * 2),
    });
  }

  function cancelCrop() {
    setCropState(null);
    setCropDrag(null);
  }

  async function applyCrop() {
    if (!cropState) return;
    const row = pageImages.find((im) => im.id === cropState.imgId);
    if (!row) { setCropState(null); return; }
    const displayW = Number(row.width) || IMG_DEFAULT_W;
    const displayH = Number(row.height) || IMG_DEFAULT_H;
    try {
      // Load the source image at natural resolution.
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = row.file_url;
      });
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      // Crop rect is in display px; scale to natural px.
      const sx = Math.max(0, Math.round((cropState.x / displayW) * natW));
      const sy = Math.max(0, Math.round((cropState.y / displayH) * natH));
      const sw = Math.max(1, Math.round((cropState.w / displayW) * natW));
      const sh = Math.max(1, Math.round((cropState.h / displayH) * natH));
      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Canvas blob generation failed.');
      const fileName = `cropped-${Date.now()}.png`;
      const filePath = `${projectId || 'global'}/${fileName}`;
      const { error: upErr } = await supabase.storage
        .from('design-bucket')
        .upload(filePath, blob, { upsert: true, contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('design-bucket').getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl || '';
      if (!publicUrl) throw new Error('Public URL generation failed.');
      // Reposition + resize: keep the crop's top-left in absolute page coords; new size matches crop.
      const newX = (Number(row.x_in_page) || 0) + Math.round(cropState.x);
      const newY = (Number(row.y_in_page) || 0) + Math.round(cropState.y);
      const newW = Math.round(cropState.w);
      const newH = Math.round(cropState.h);
      const { data, error } = await supabase
        .from('design_files')
        .update({ file_url: publicUrl, file_name: fileName, x_in_page: newX, y_in_page: newY, width: newW, height: newH })
        .eq('id', cropState.imgId)
        .select('id, file_url, file_name, x_in_page, y_in_page, width, height')
        .single();
      if (error) throw error;
      // Best-effort cleanup of the prior storage object.
      const old = extractStorageObjectFromPublicUrl(row.file_url || '');
      if (old?.path) {
        const bucket = old.bucket || 'design-bucket';
        supabase.storage.from(bucket).remove([old.path]).catch(() => {});
      }
      setPageImages((prev) => prev.map((im) => (im.id === cropState.imgId ? { ...im, ...data } : im)));
      setCropState(null);
    } catch (err) {
      console.error('[applyCrop] failed', err);
      setCropState(null);
    }
  }

  // Crop drag: move whole rect or drag a corner.
  useEffect(() => {
    if (!cropDrag) return undefined;
    const row = pageImages.find((im) => im.id === cropDrag.imgId);
    if (!row) return undefined;
    const displayW = Number(row.width) || IMG_DEFAULT_W;
    const displayH = Number(row.height) || IMG_DEFAULT_H;
    function onMove(e) {
      const dx = (e.clientX - cropDrag.startMouseX) / zoom;
      const dy = (e.clientY - cropDrag.startMouseY) / zoom;
      let x = cropDrag.startX;
      let y = cropDrag.startY;
      let w = cropDrag.startW;
      let h = cropDrag.startH;
      if (cropDrag.corner === 'move') {
        x = cropDrag.startX + dx;
        y = cropDrag.startY + dy;
      } else {
        switch (cropDrag.corner) {
          case 'se': w = cropDrag.startW + dx; h = cropDrag.startH + dy; break;
          case 'sw': w = cropDrag.startW - dx; h = cropDrag.startH + dy; x = cropDrag.startX + dx; break;
          case 'ne': w = cropDrag.startW + dx; h = cropDrag.startH - dy; y = cropDrag.startY + dy; break;
          case 'nw': w = cropDrag.startW - dx; h = cropDrag.startH - dy; x = cropDrag.startX + dx; y = cropDrag.startY + dy; break;
          default: break;
        }
        if (w < 20) {
          if (cropDrag.corner === 'sw' || cropDrag.corner === 'nw') x = cropDrag.startX + (cropDrag.startW - 20);
          w = 20;
        }
        if (h < 20) {
          if (cropDrag.corner === 'ne' || cropDrag.corner === 'nw') y = cropDrag.startY + (cropDrag.startH - 20);
          h = 20;
        }
      }
      if (x < 0) { if (cropDrag.corner === 'move') x = 0; else { w += x; x = 0; } }
      if (y < 0) { if (cropDrag.corner === 'move') y = 0; else { h += y; y = 0; } }
      if (x + w > displayW) {
        if (cropDrag.corner === 'move') x = displayW - w;
        else w = displayW - x;
      }
      if (y + h > displayH) {
        if (cropDrag.corner === 'move') y = displayH - h;
        else h = displayH - y;
      }
      setCropState((prev) => (prev ? { ...prev, x, y, w, h } : prev));
    }
    function onUp() {
      setCropDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [cropDrag, zoom, pageImages]);

  // Exit crop mode automatically when selection changes (e.g., user clicks elsewhere).
  useEffect(() => {
    if (cropState && cropState.imgId !== selectedImageId) {
      setCropState(null);
      setCropDrag(null);
    }
  }, [selectedImageId, cropState]);

  // ── Text elements: load for current sprint ────────────────
  useEffect(() => {
    let alive = true;
    async function load() {
      const sprintN = Number(effectiveViewingSprint);
      if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) {
        setTexts([]);
        return;
      }
      let { data, error } = await supabase
        .from('text_elements')
        .select('id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough, width, height, text_align')
        .eq('project_id', projectId)
        .eq('sprint_number', sprintN);
      // Pre-migration DB: fall back to a SELECT without the new box columns.
      if (error && /(width|height|text_align)/i.test(error.message || '')) {
        const fb = await supabase
          .from('text_elements')
          .select('id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough')
          .eq('project_id', projectId)
          .eq('sprint_number', sprintN);
        data = fb.data;
        error = fb.error;
      }
      if (!alive) return;
      if (error) {
        console.error('[BlueprintViewer] texts load failed', error);
        return;
      }
      setTexts(data || []);
    }
    load();
    return () => {
      alive = false;
    };
  }, [projectId, effectiveViewingSprint]);

  // Realtime sync for text_elements — INSERT/UPDATE/DELETE.
  // Same in-flight guard as design_files: don't overwrite a row the user is editing,
  // dragging, or resizing locally.
  useEffect(() => {
    if (!projectId) return undefined;
    const sprintN = Number(effectiveViewingSprint);
    if (!Number.isFinite(sprintN) || sprintN < 1) return undefined;
    const channel = supabase
      .channel(`text_elements-realtime-${projectId}-${sprintN}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'text_elements', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          setTexts((prev) => (prev.some((tt) => String(tt.id) === String(row.id)) ? prev : [...prev, row]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'text_elements', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          if (Number(row.sprint_number) !== sprintN) return;
          const id = String(row.id);
          if (textDragRef.current && String(textDragRef.current.id) === id) return;
          if (textResizeRef.current && String(textResizeRef.current.id) === id) return;
          if (textEditingIdRef.current && String(textEditingIdRef.current) === id) return;
          setTexts((prev) =>
            prev.map((tt) => {
              if (String(tt.id) !== id) return tt;
              // Merge all incoming columns; explicitly normalize box dims as numbers so a
              // numeric `"123"` (legacy string from older drivers) is coerced into the
              // shape the rendering code expects.
              const merged = { ...tt, ...row };
              if (row.width != null) merged.width = Number(row.width);
              if (row.height != null) merged.height = Number(row.height);
              return merged;
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        // DELETE: rely on id-membership in local state (REPLICA IDENTITY FULL not guaranteed).
        { event: 'DELETE', schema: 'public', table: 'text_elements' },
        (payload) => {
          const oldRow = payload.old || {};
          const deletedId = oldRow.id;
          if (deletedId == null) return;
          setTexts((prev) => prev.filter((tt) => String(tt.id) !== String(deletedId)));
          if (selectedTextId && String(selectedTextId) === String(deletedId)) setSelectedTextId(null);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, effectiveViewingSprint]);

  // Live-cursor channel: Presence tracks who's here (join/leave) while a Broadcast
  // event "cursor" carries the per-move coordinates. Coordinates are page-relative
  // (untransformed); the renderer counter-scales by 1/zoom so cursors stay screen-sized.
  useEffect(() => {
    if (!projectId) return undefined;
    const sprintN = Number(effectiveViewingSprint);
    if (!Number.isFinite(sprintN) || sprintN < 1) return undefined;
    const email = String(currentUserEmail || '').trim().toLowerCase();
    if (!email) return undefined;

    const channel = supabase.channel(
      `workspace-presence-${projectId}-${sprintN}`,
      { config: { presence: { key: email } } },
    );

    channel.on('broadcast', { event: 'cursor' }, ({ payload }) => {
      if (!payload || !payload.userId) return;
      if (payload.userId === email) return; // ignore self echo
      if (payload.pageId == null) {
        // Sentinel for "cursor left canvas" — remove the entry.
        setRemoteCursors((prev) => {
          if (!prev[payload.userId]) return prev;
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        return;
      }
      setRemoteCursors((prev) => ({
        ...prev,
        [payload.userId]: {
          name: payload.name || prev[payload.userId]?.name || payload.userId,
          pageId: payload.pageId,
          x: Number(payload.x) || 0,
          y: Number(payload.y) || 0,
        },
      }));
    });

    channel.on('presence', { event: 'leave' }, (event) => {
      const left = event?.leftPresences || [];
      const keys = new Set();
      for (const p of left) {
        if (p?.userId) keys.add(p.userId);
        else if (p?.email) keys.add(p.email);
      }
      // Presence key (the second-arg `key`) is also exposed as the event key.
      if (event?.key) keys.add(event.key);
      if (keys.size === 0) return;
      setRemoteCursors((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k of keys) {
          if (next[k]) { delete next[k]; changed = true; }
        }
        return changed ? next : prev;
      });
      // Drop any locks owned by users that left so abandoned selections don't strand items.
      setLockedElements((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (keys.has(next[k]?.userId)) { delete next[k]; changed = true; }
        }
        return changed ? next : prev;
      });
    });

    // Remote lock: another user has claimed an element. If we also claim it locally,
    // resolve the race deterministically (earlier lockedAt wins; tie → lower userId wins).
    channel.on('broadcast', { event: 'lock' }, ({ payload }) => {
      if (!payload || !payload.elementId || !payload.elementType) return;
      if (payload.userId === email) return; // ignore our own echo
      const key = `${payload.elementType}:${payload.elementId}`;
      const ours = lockedElementsRef.current[key];
      if (ours && ours.userId === email) {
        const remoteWins =
          payload.lockedAt < ours.lockedAt
          || (payload.lockedAt === ours.lockedAt && String(payload.userId) < email);
        if (!remoteWins) return; // we keep, ignore remote
        // Remote wins → roll back our claim so the element doesn't appear selected on our side.
        rollbackSelectionFor(payload.elementType, payload.elementId);
      }
      setLockedElements((prev) => ({
        ...prev,
        [key]: {
          userId: payload.userId,
          userName: payload.userName || payload.userId,
          lockedAt: payload.lockedAt || Date.now(),
        },
      }));
    });

    // Remote unlock: clear the entry only if the sender is the recorded owner.
    channel.on('broadcast', { event: 'unlock' }, ({ payload }) => {
      if (!payload || !payload.elementId || !payload.elementType) return;
      const key = `${payload.elementType}:${payload.elementId}`;
      setLockedElements((prev) => {
        const cur = prev[key];
        if (!cur || cur.userId !== payload.userId) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    });

    const myName = String(currentUserFullName || '').trim() || email.split('@')[0] || email;

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        try {
          // Identity only — no color in the payload. Each viewer resolves the
          // sender's color locally via colorFor(userId) so colors are viewer-relative.
          await channel.track({ userId: email, name: myName });
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[presence] track failed', err);
        }
      }
    });

    presenceChannelRef.current = channel;
    return () => {
      presenceChannelRef.current = null;
      if (cursorThrottleRef.current.timeout) {
        clearTimeout(cursorThrottleRef.current.timeout);
        cursorThrottleRef.current.timeout = null;
      }
      supabase.removeChannel(channel);
    };
  }, [projectId, effectiveViewingSprint, currentUserEmail, currentUserFullName]);

  // Throttled cursor broadcast — fires immediately if 50ms has passed since last send,
  // otherwise schedules a trailing-edge flush so the final position lands once the user stops.
  function broadcastCursor(pageId, x, y) {
    const ch = presenceChannelRef.current;
    if (!ch) return;
    const email = String(currentUserEmail || '').trim().toLowerCase();
    if (!email) return;
    const name = String(currentUserFullName || '').trim() || email.split('@')[0] || email;
    // Identity only — receivers resolve color from userId (viewer-relative).
    const payload = { userId: email, name, pageId, x, y };
    const ref = cursorThrottleRef.current;
    const now = performance.now();
    const elapsed = now - ref.last;
    if (elapsed >= 50) {
      ref.last = now;
      ref.pending = null;
      if (ref.timeout) { clearTimeout(ref.timeout); ref.timeout = null; }
      ch.send({ type: 'broadcast', event: 'cursor', payload });
    } else {
      ref.pending = payload;
      if (!ref.timeout) {
        ref.timeout = setTimeout(() => {
          const r = cursorThrottleRef.current;
          r.timeout = null;
          const p = r.pending;
          r.pending = null;
          if (!p) return;
          r.last = performance.now();
          const ch2 = presenceChannelRef.current;
          if (ch2) ch2.send({ type: 'broadcast', event: 'cursor', payload: p });
        }, Math.max(0, 50 - elapsed));
      }
    }
  }

  // Reconcile our local selection with broadcast locks. When our claim set changes,
  // diff against the previous snapshot and emit lock/unlock events for the difference.
  useEffect(() => {
    const ch = presenceChannelRef.current;
    const email = String(currentUserEmail || '').trim().toLowerCase();
    const prev = prevClaimKeysRef.current;
    // Released claims → unlock (if we owned the lock).
    const removed = [];
    for (const key of prev) if (!myClaimKeys.has(key)) removed.push(key);
    for (const key of removed) {
      const sep = key.indexOf(':');
      const kind = key.slice(0, sep);
      const id = key.slice(sep + 1);
      const cur = lockedElementsRef.current[key];
      if (cur && cur.userId === email) {
        if (ch) {
          ch.send({
            type: 'broadcast',
            event: 'unlock',
            payload: { elementType: kind, elementId: id, userId: email },
          });
        }
        setLockedElements((p) => {
          if (!p[key]) return p;
          const next = { ...p };
          delete next[key];
          return next;
        });
      }
    }
    // New claims → optimistic lock + broadcast.
    if (ch && email) {
      const myName = String(currentUserFullName || '').trim() || email.split('@')[0] || email;
      const added = [];
      for (const key of myClaimKeys) if (!prev.has(key)) added.push(key);
      for (const key of added) {
        const sep = key.indexOf(':');
        const kind = key.slice(0, sep);
        const id = key.slice(sep + 1);
        const existing = lockedElementsRef.current[key];
        if (existing && existing.userId !== email) continue; // someone else owns it; click guards should've stopped this
        const lockedAt = Date.now();
        ch.send({
          type: 'broadcast',
          event: 'lock',
          payload: { elementType: kind, elementId: id, userId: email, userName: myName, lockedAt },
        });
        setLockedElements((p) => ({
          ...p,
          [key]: { userId: email, userName: myName, lockedAt },
        }));
      }
    }
    prevClaimKeysRef.current = new Set(myClaimKeys);
  }, [myClaimKeys, currentUserEmail, currentUserFullName]);

  async function createTextOnPage(page, xRaw, yRaw) {
    const sprintN = Number(effectiveViewingSprint);
    if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) return null;
    const x = Math.max(0, Math.min(A4_W - 40, Math.round(xRaw)));
    const y = Math.max(0, Math.min(A4_H - 24, Math.round(yRaw)));
    const basePayload = {
      project_id: projectId,
      page_id: page.id,
      sprint_number: sprintN,
      content: '',
      x_in_page: x,
      y_in_page: y,
      font_size: defaultTextStyle.font_size,
      font_weight: defaultTextStyle.font_weight,
      color: defaultTextStyle.color,
      italic: defaultTextStyle.italic,
      strikethrough: defaultTextStyle.strikethrough,
    };
    // Initial box dimensions — matches the canonical defaults stored in the DB column
    // defaults (200 × 60). The box still auto-grows in edit mode and is persisted at
    // its measured size on commit if the user types beyond it.
    const boxFields = {
      width: 200,
      height: 60,
      text_align: defaultTextStyle.text_align || 'left',
    };
    const BASE_SELECT = 'id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough';
    const FULL_SELECT = `${BASE_SELECT}, width, height, text_align`;
    // Preferred path: insert + select with the new box columns.
    let { data, error } = await supabase
      .from('text_elements')
      .insert({ ...basePayload, ...boxFields })
      .select(FULL_SELECT)
      .single();
    // Fallback when the DB hasn't had add_text_box_dims_and_align.sql applied yet:
    // retry without the new columns so text creation still works.
    if (error && /(width|height|text_align)/i.test(error.message || '')) {
      const fb = await supabase
        .from('text_elements')
        .insert(basePayload)
        .select(BASE_SELECT)
        .single();
      data = fb.data;
      error = fb.error;
      // Hydrate the in-memory row with defaults so the UI renders a box of the expected size.
      if (data) data = { ...data, ...boxFields };
    }
    if (error) {
      console.error('[BlueprintViewer] text insert failed', error);
      return null;
    }
    setTexts((prev) => [...prev, data]);
    pushUndo({ type: 'CREATE_TEXT', id: data.id });
    return data;
  }

  async function deleteTextElement(textId) {
    setTexts((prev) => prev.filter((tt) => tt.id !== textId));
    if (selectedTextId === textId) setSelectedTextId(null);
    const { error } = await supabase.from('text_elements').delete().eq('id', textId);
    if (error) console.error('[BlueprintViewer] text delete failed', error);
  }

  // Right-click "Delete Image" — delete exactly ONE row + ONE Storage object + push undo.
  // (Previously deleted the entire sprint's design_files; that bug is fixed here.)
  async function deleteImageRow(imgId) {
    if (!imgId) {
      if (import.meta.env.DEV) console.warn('[deleteImageRow] missing imgId');
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[deleteImageRow] debug', {
        imgId,
        pageImagesIds: pageImages.map((im) => im.id),
        foundInLocal: pageImages.some((im) => im.id === imgId),
      });
    }
    // Functional update — capture latest snapshot atomically.
    let snap = null;
    setPageImages((prev) => {
      snap = prev.find((im) => im.id === imgId) || null;
      return snap ? prev.filter((im) => im.id !== imgId) : prev;
    });
    // Fallback: fetch from DB if local state didn't have it.
    if (!snap) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[deleteImageRow] row not in local state, fetching from DB', imgId);
      }
      const { data, error } = await supabase
        .from('design_files')
        .select('id, file_url, file_name, project_id, sprint_number, page_id, page_number, x_in_page, y_in_page, width, height')
        .eq('id', imgId)
        .maybeSingle();
      if (error) {
        console.error('[deleteImageRow] DB snapshot fetch failed', error);
        return;
      }
      if (!data) {
        if (import.meta.env.DEV) console.warn('[deleteImageRow] row not found in DB either', imgId);
        return;
      }
      snap = data;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[deleteImageRow] snapshot', snap);
    }
    // Storage: delete this single file_url only.
    const fromUrl = extractStorageObjectFromPublicUrl(snap.file_url || '');
    if (fromUrl.path) {
      const bucket = fromUrl.bucket || 'design-bucket';
      const { error: stErr } = await supabase.storage.from(bucket).remove([fromUrl.path]);
      if (stErr) console.warn('[deleteImageRow] storage remove failed (continuing)', stErr);
    }
    // DB: delete this single row. .select('id') makes Supabase return the deleted row(s) so we can confirm.
    const delResp = await supabase.from('design_files').delete().eq('id', imgId).select('id');
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[deleteImageRow] DB result', {
        imgId,
        deletedCount: delResp.data?.length ?? 0,
        deletedIds: (delResp.data || []).map((r) => r.id),
        error: delResp.error,
      });
    }
    if (delResp.error) {
      console.error('[deleteImageRow] db delete failed', delResp.error);
      return;
    }
    if ((delResp.data?.length ?? 0) === 0) {
      console.warn('[deleteImageRow] DELETE returned 0 rows — row may have been removed already or RLS blocked the operation', imgId);
    }
    // Clear any selection referencing this image.
    if (selectedImageId === imgId) setSelectedImageId(null);
    setMultiSelection((prev) => {
      if (!prev.has(`image:${imgId}`)) return prev;
      const next = new Set(prev);
      next.delete(`image:${imgId}`);
      return next;
    });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log('[undo] push DELETE_ITEMS (right-click)', { image: snap });
    }
    pushUndo({ type: 'DELETE_ITEMS', images: [snap], texts: [] });
  }

  async function commitTextEdit(textId) {
    const content = textEditDraft;
    // Measure the current editor box size BEFORE we tear down the editor — those dimensions
    // get persisted so the display matches what the user just saw while typing.
    const ta = editingTextareaRef.current;
    const outer = ta?.parentElement || null;
    const measuredW = outer ? Math.round(outer.offsetWidth) : null;
    const measuredH = outer ? Math.round(outer.offsetHeight) : null;
    setTextEditingId(null);
    setTextEditDraft('');
    const trimmed = String(content ?? '').trim();
    if (!textId) return;
    if (trimmed === '') {
      await deleteTextElement(textId);
      return;
    }
    const patch = { content };
    if (Number.isFinite(measuredW) && measuredW > 0) patch.width = measuredW;
    if (Number.isFinite(measuredH) && measuredH > 0) patch.height = measuredH;
    setTexts((prev) =>
      prev.map((tt) => (tt.id === textId ? { ...tt, ...patch } : tt)),
    );
    const BASE_SELECT = 'id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough';
    const FULL_SELECT = `${BASE_SELECT}, width, height, text_align`;
    let { data, error } = await supabase
      .from('text_elements')
      .update(patch)
      .eq('id', textId)
      .select(FULL_SELECT)
      .single();
    // Pre-migration DB: retry without the box columns.
    if (error && /(width|height|text_align)/i.test(error.message || '')) {
      const fb = await supabase
        .from('text_elements')
        .update({ content })
        .eq('id', textId)
        .select(BASE_SELECT)
        .single();
      data = fb.data;
      error = fb.error;
      if (data) data = { ...data, width: measuredW, height: measuredH };
    }
    if (error) {
      console.error('[BlueprintViewer] text content update failed', error);
      return;
    }
    if (data) setTexts((prev) => prev.map((tt) => (tt.id === textId ? data : tt)));
  }

  async function applyTextStyleChange(patch) {
    if (selectedTextId) {
      setTexts((prev) => prev.map((tt) => (tt.id === selectedTextId ? { ...tt, ...patch } : tt)));
      const { error } = await supabase
        .from('text_elements')
        .update(patch)
        .eq('id', selectedTextId);
      if (error) console.error('[BlueprintViewer] text style update failed', error);
    } else {
      setDefaultTextStyle((prev) => ({ ...prev, ...patch }));
    }
  }

  // Autosize the editing textarea so the text box grows with its content:
  //   width  → max(minContentW, min(maxContentW, naturalLineW + 2)) measured via a hidden span
  //   height → scrollHeight (so newly wrapped lines push the box down)
  // The outer text-root <div> uses width:auto / height:auto while editing, so it follows along.
  useLayoutEffect(() => {
    if (!textEditingId) return;
    const editing = texts.find((tt) => tt.id === textEditingId);
    if (!editing) return;
    const ta = editingTextareaRef.current;
    const m = textMeasurerRef.current;
    if (!ta || !m) return;
    // Account for the outer text-root padding (2px 4px) + 2px border so the textarea fits inside the page.
    const OUTER_OVERHEAD = 4 + 4 + 2 + 2; // L+R padding + L+R border
    const x = Number(editing.x_in_page) || 0;
    const maxOuterW = Math.max(120, A4_W - x - 8);
    const maxContentW = Math.max(60, maxOuterW - OUTER_OVERHEAD);
    const minContentW = Math.max(60, 120 - OUTER_OVERHEAD);
    const naturalW = m.scrollWidth;
    const w = Math.max(minContentW, Math.min(maxContentW, naturalW + 2));
    ta.style.width = `${w}px`;
    // Reset height first so scrollHeight reports the natural content height (not the previous size).
    ta.style.height = '0px';
    const fs = Number(editing.font_size) || 16;
    const oneLine = Math.ceil(fs * 1.25);
    ta.style.height = `${Math.max(oneLine, ta.scrollHeight)}px`;
  }, [textEditingId, textEditDraft, texts]);

  // Text drag (within page) — global mousemove/up while dragging.
  useEffect(() => {
    if (!textDrag) return undefined;
    let lastX = textDrag.startX;
    let lastY = textDrag.startY;
    // Bbox snapshot for smart guides (text bbox is approximate; use stored row)
    const draggedRow = texts.find((tt) => tt.id === textDrag.id);
    const draggedBbox = draggedRow ? bboxOfText(draggedRow) : { x: lastX, y: lastY, w: 60, h: 20 };
    const tW = draggedBbox.w;
    const tH = draggedBbox.h;
    function onMove(e) {
      const dx = (e.clientX - textDrag.startMouseX) / zoom;
      const dy = (e.clientY - textDrag.startMouseY) / zoom;
      const maxX = Math.max(0, A4_W - tW);
      const maxY = Math.max(0, A4_H - tH);
      let nx = Math.max(0, Math.min(maxX, textDrag.startX + dx));
      let ny = Math.max(0, Math.min(maxY, textDrag.startY + dy));
      const { bestX, bestY } = computeSnap(textDrag.pageId, { x: nx, y: ny, w: tW, h: tH }, `text:${textDrag.id}`);
      if (bestX) nx = Math.max(0, Math.min(maxX, bestX.newX));
      if (bestY) ny = Math.max(0, Math.min(maxY, bestY.newY));
      const guides = [];
      if (bestX) guides.push({ pageId: textDrag.pageId, axis: 'v', pos: bestX.guideAt });
      if (bestY) guides.push({ pageId: textDrag.pageId, axis: 'h', pos: bestY.guideAt });
      setGuideLines(guides);
      lastX = nx;
      lastY = ny;
      setTexts((prev) => prev.map((tt) => (tt.id === textDrag.id ? { ...tt, x_in_page: nx, y_in_page: ny } : tt)));
    }
    async function onUp() {
      const id = textDrag.id;
      const px = Math.max(0, Math.min(Math.max(0, A4_W - tW), Math.round(lastX)));
      const py = Math.max(0, Math.min(Math.max(0, A4_H - tH), Math.round(lastY)));
      setTextDrag(null);
      setGuideLines([]);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[text drag] mouseUp → persisting', { id, px, py });
      }
      const { data, error } = await supabase
        .from('text_elements')
        .update({ x_in_page: px, y_in_page: py })
        .eq('id', id)
        .select('id, x_in_page, y_in_page')
        .single();
      if (error) {
        console.error('[text drag] persist failed', { id, px, py, error });
        return;
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[text drag] persisted', data);
      }
      if (data) {
        setTexts((prev) =>
          prev.map((tt) => (tt.id === id ? { ...tt, x_in_page: data.x_in_page, y_in_page: data.y_in_page } : tt)),
        );
      }
      const startX = textDrag?.startX ?? px;
      const startY = textDrag?.startY ?? py;
      if (Math.round(startX) !== px || Math.round(startY) !== py) {
        pushUndo({ type: 'MOVE_TEXT', id, prevX: Math.round(startX), prevY: Math.round(startY), nextX: px, nextY: py });
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [textDrag, zoom]);

  // Marker drag (page-relative % coords) — global mousemove/up while dragging.
  useEffect(() => {
    if (!markerDrag) return undefined;
    let lastXPct = markerDrag.startXPct;
    let lastYPct = markerDrag.startYPct;
    function onMove(e) {
      const el = markerDrag.pageEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      lastXPct = Math.max(0, Math.min(100, xPct));
      lastYPct = Math.max(0, Math.min(100, yPct));
      setDesignMarkers((prev) =>
        prev.map((m) => (String(m.id) === String(markerDrag.markerId)
          ? { ...m, xPct: lastXPct, yPct: lastYPct }
          : m)),
      );
    }
    async function onUp() {
      const id = markerDrag.markerId;
      const fx = lastXPct;
      const fy = lastYPct;
      setMarkerDrag(null);
      const startX = markerDrag.startXPct;
      const startY = markerDrag.startYPct;
      if (Math.abs(fx - startX) < 0.05 && Math.abs(fy - startY) < 0.05) return; // no meaningful drag
      const { error } = await supabase
        .from('markers')
        .update({ x_pct: fx, y_pct: fy })
        .eq('id', id);
      if (error) console.error('[marker drag] persist failed', error);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [markerDrag]);

  // Image drag (within page) — global mousemove/up while dragging.
  useEffect(() => {
    if (!imageDrag) return undefined;
    const dragW = Number(imageDrag.startW) || IMG_DEFAULT_W;
    const dragH = Number(imageDrag.startH) || IMG_DEFAULT_H;
    let lastX = imageDrag.startX;
    let lastY = imageDrag.startY;
    function onMove(e) {
      const dx = (e.clientX - imageDrag.startMouseX) / zoom;
      const dy = (e.clientY - imageDrag.startMouseY) / zoom;
      let nx = Math.max(0, Math.min(A4_W - dragW, imageDrag.startX + dx));
      let ny = Math.max(0, Math.min(A4_H - dragH, imageDrag.startY + dy));
      // Smart-guide snap
      const { bestX, bestY } = computeSnap(imageDrag.pageId, { x: nx, y: ny, w: dragW, h: dragH }, `image:${imageDrag.imgId}`);
      if (bestX) nx = Math.max(0, Math.min(A4_W - dragW, bestX.newX));
      if (bestY) ny = Math.max(0, Math.min(A4_H - dragH, bestY.newY));
      const guides = [];
      if (bestX) guides.push({ pageId: imageDrag.pageId, axis: 'v', pos: bestX.guideAt });
      if (bestY) guides.push({ pageId: imageDrag.pageId, axis: 'h', pos: bestY.guideAt });
      setGuideLines(guides);
      lastX = nx;
      lastY = ny;
      setPageImages((prev) =>
        prev.map((im) => (im.id === imageDrag.imgId ? { ...im, x_in_page: nx, y_in_page: ny } : im)),
      );
    }
    async function onUp() {
      const imgId = imageDrag.imgId;
      const fx = lastX;
      const fy = lastY;
      const prevX = imageDrag.startX;
      const prevY = imageDrag.startY;
      setImageDrag(null);
      setGuideLines([]);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[image drag] mouseUp → persisting', { imgId, fx, fy });
      }
      const result = await persistImagePosition(imgId, fx, fy, dragW, dragH);
      if (result && (Math.round(prevX) !== Math.round(fx) || Math.round(prevY) !== Math.round(fy))) {
        pushUndo({ type: 'MOVE_IMAGE', id: imgId, prevX: Math.round(prevX), prevY: Math.round(prevY), nextX: Math.round(fx), nextY: Math.round(fy) });
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [imageDrag, zoom]);

  // ── Selection helpers (single + multi) ─────────────────────
  function getAllSelectedKeys() {
    const s = new Set(multiSelection);
    if (selectedImageId) s.add(`image:${selectedImageId}`);
    if (selectedTextId) s.add(`text:${selectedTextId}`);
    return s;
  }

  function clearAllSelection() {
    setMultiSelection((prev) => (prev.size === 0 ? prev : new Set()));
    setSelectedImageId(null);
    setSelectedTextId(null);
  }

  const UNDO_MAX = 50;
  function pushUndo(action) {
    // Update both ref (synchronous) and state (async commit). This eliminates the
    // 1-render window during which undoStackRef is stale right after a push.
    const cur = undoStackRef.current || [];
    const next = [...cur, action];
    if (next.length > UNDO_MAX) next.shift();
    undoStackRef.current = next;
    setUndoStack(next);
  }

  function isItemSelected(kind, id) {
    if (kind === 'image' && selectedImageId === id) return true;
    if (kind === 'text' && selectedTextId === id) return true;
    return multiSelection.has(`${kind}:${id}`);
  }

  // Aligns the currently selected items to a shared axis. `op` is one of:
  //   'left' | 'centerH' | 'right' | 'top' | 'middleV' | 'bottom'
  // Only items on the same page (the majority page) are aligned; cross-page noise is
  // filtered out. New positions are clamped inside the page; the resulting GROUP_MOVE
  // is pushed onto the undo stack so the user can revert with Ctrl/Cmd+Z.
  async function applyAlign(op) {
    const keys = [...getAllSelectedKeys()];
    if (keys.length < 2) return;
    // Resolve each key to a typed item with bbox info.
    const items = [];
    for (const k of keys) {
      const sep = k.indexOf(':');
      if (sep < 0) continue;
      const kind = k.slice(0, sep);
      const id = k.slice(sep + 1);
      if (kind === 'image') {
        const r = pageImages.find((p) => p.id === id);
        if (!r) continue;
        items.push({
          kind, id,
          x: Number(r.x_in_page) || 0,
          y: Number(r.y_in_page) || 0,
          w: Number(r.width) || IMG_DEFAULT_W,
          h: Number(r.height) || IMG_DEFAULT_H,
          pageId: r.page_id || null,
        });
      } else if (kind === 'text') {
        const r = texts.find((p) => p.id === id);
        if (!r) continue;
        items.push({
          kind, id,
          x: Number(r.x_in_page) || 0,
          y: Number(r.y_in_page) || 0,
          w: Number(r.width) || 200,
          h: Number(r.height) || 60,
          pageId: r.page_id || null,
        });
      }
    }
    if (items.length < 2) return;
    // Pick the page with the most selected items; align only items on that page.
    const pageCounts = new Map();
    for (const it of items) pageCounts.set(it.pageId, (pageCounts.get(it.pageId) || 0) + 1);
    let majorityPageId = null;
    let majorityCount = 0;
    for (const [pid, cnt] of pageCounts.entries()) {
      if (cnt > majorityCount) { majorityCount = cnt; majorityPageId = pid; }
    }
    const filtered = items.filter((it) => String(it.pageId) === String(majorityPageId));
    if (filtered.length < 2) return;

    // Group extents along the relevant axis.
    const minX = Math.min(...filtered.map((it) => it.x));
    const maxRight = Math.max(...filtered.map((it) => it.x + it.w));
    const minY = Math.min(...filtered.map((it) => it.y));
    const maxBottom = Math.max(...filtered.map((it) => it.y + it.h));
    const groupCx = (minX + maxRight) / 2;
    const groupCy = (minY + maxBottom) / 2;

    // Compute new positions.
    for (const it of filtered) {
      let nx = it.x;
      let ny = it.y;
      if (op === 'left')    nx = minX;
      if (op === 'right')   nx = maxRight - it.w;
      if (op === 'centerH') nx = groupCx - it.w / 2;
      if (op === 'top')     ny = minY;
      if (op === 'bottom')  ny = maxBottom - it.h;
      if (op === 'middleV') ny = groupCy - it.h / 2;
      // Page-bounds clamp using item's actual size.
      nx = Math.max(0, Math.min(Math.max(0, A4_W - it.w), Math.round(nx)));
      ny = Math.max(0, Math.min(Math.max(0, A4_H - it.h), Math.round(ny)));
      it.nx = nx;
      it.ny = ny;
    }
    // Optimistic local update.
    const imgMap = new Map();
    const txtMap = new Map();
    for (const it of filtered) {
      if (it.kind === 'image') imgMap.set(it.id, { x: it.nx, y: it.ny });
      else txtMap.set(it.id, { x: it.nx, y: it.ny });
    }
    if (imgMap.size > 0) {
      setPageImages((prev) =>
        prev.map((im) => {
          const u = imgMap.get(im.id);
          return u ? { ...im, x_in_page: u.x, y_in_page: u.y } : im;
        }),
      );
    }
    if (txtMap.size > 0) {
      setTexts((prev) =>
        prev.map((tt) => {
          const u = txtMap.get(tt.id);
          return u ? { ...tt, x_in_page: u.x, y_in_page: u.y } : tt;
        }),
      );
    }
    // Persist.
    const calls = [];
    for (const it of filtered) {
      if (Math.round(it.x) === it.nx && Math.round(it.y) === it.ny) continue;
      const table = it.kind === 'image' ? 'design_files' : 'text_elements';
      calls.push(
        supabase.from(table).update({ x_in_page: it.nx, y_in_page: it.ny }).eq('id', it.id),
      );
    }
    if (calls.length > 0) {
      const results = await Promise.all(calls);
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        // eslint-disable-next-line no-console
        console.warn('[applyAlign] some persists failed', failed);
      }
    }
    // Undo: bundle into one GROUP_MOVE so Ctrl+Z reverts the whole align in one step.
    const moves = [];
    for (const it of filtered) {
      const prevX = Math.round(it.x);
      const prevY = Math.round(it.y);
      if (prevX !== it.nx || prevY !== it.ny) {
        moves.push({ kind: it.kind, id: it.id, prevX, prevY, nextX: it.nx, nextY: it.ny });
      }
    }
    if (moves.length > 0) pushUndo({ type: 'GROUP_MOVE', moves });
  }

  function toggleInMultiSelection(kind, id) {
    // Folds any current single-selection into the multi set, then toggles the given key.
    const key = `${kind}:${id}`;
    setMultiSelection((prev) => {
      const next = new Set(prev);
      if (selectedImageId) next.add(`image:${selectedImageId}`);
      if (selectedTextId) next.add(`text:${selectedTextId}`);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Single states are no longer the primary selection in multi-mode.
    setSelectedImageId(null);
    setSelectedTextId(null);
  }

  // Bounding box helpers (in unscaled page coordinates).
  function bboxOfImage(im) {
    const x = Number(im.x_in_page) || 0;
    const y = Number(im.y_in_page) || 0;
    const w = Number(im.width) || IMG_DEFAULT_W;
    const h = Number(im.height) || IMG_DEFAULT_H;
    return { x, y, w, h };
  }
  function bboxOfText(tt) {
    const x = Number(tt.x_in_page) || 0;
    const y = Number(tt.y_in_page) || 0;
    const fs = Number(tt.font_size) || 16;
    // Prefer the stored box dimensions; fall back to a rough estimate for legacy rows.
    const storedW = Number(tt.width);
    const storedH = Number(tt.height);
    if (Number.isFinite(storedW) && storedW > 0 && Number.isFinite(storedH) && storedH > 0) {
      return { x, y, w: storedW, h: storedH };
    }
    const len = Math.max(2, (tt.content || '').length || 4);
    const w = Math.max(60, Math.min(A4_W - x, len * fs * 0.6));
    const h = Math.max(fs * 1.25, fs);
    return { x, y, w, h };
  }
  function rectsIntersect(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  // Smart-guide snapping. dragged = {x, y, w, h}.
  // excludeKeys: a Set of `image:<id>` / `text:<id>` keys to skip (the moving items),
  //              or a single string for backward compatibility with single-element drags.
  // opts.edgesX / opts.edgesY restrict which edges of `dragged` are considered as snap
  //   reference points. Defaults to all three (left/center/right and top/middle/bottom),
  //   which is the right behaviour for move drags. For resize drags only the moving
  //   edge(s) should be passed so a stationary edge doesn't get pulled by snap.
  function computeSnap(pageId, dragged, excludeKeys, opts = {}) {
    const SNAP = 4;
    const exSet = excludeKeys instanceof Set
      ? excludeKeys
      : (typeof excludeKeys === 'string' ? new Set([excludeKeys]) : new Set());
    const edgesXSpec = Array.isArray(opts.edgesX) ? opts.edgesX : ['left', 'center', 'right'];
    const edgesYSpec = Array.isArray(opts.edgesY) ? opts.edgesY : ['top', 'middle', 'bottom'];
    const xPosOf = (name) =>
      name === 'left' ? dragged.x
        : name === 'right' ? dragged.x + dragged.w
          : dragged.x + dragged.w / 2;
    const yPosOf = (name) =>
      name === 'top' ? dragged.y
        : name === 'bottom' ? dragged.y + dragged.h
          : dragged.y + dragged.h / 2;
    const refX = edgesXSpec.map((name) => ({ name, pos: xPosOf(name) }));
    const refY = edgesYSpec.map((name) => ({ name, pos: yPosOf(name) }));
    const candX = [A4_W / 2];
    const candY = [A4_H / 2];
    // Read from refs so the drag handler can call this without stale closures.
    const ims = pageImagesRef.current || pageImages;
    const tts = textsRef.current || texts;
    for (const im of ims) {
      if (im.page_id !== pageId) continue;
      if (exSet.has(`image:${im.id}`)) continue;
      const b = bboxOfImage(im);
      candX.push(b.x, b.x + b.w / 2, b.x + b.w);
      candY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    for (const tt of tts) {
      if (tt.page_id !== pageId) continue;
      if (exSet.has(`text:${tt.id}`)) continue;
      const b = bboxOfText(tt);
      candX.push(b.x, b.x + b.w / 2, b.x + b.w);
      candY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    let bestX = null;
    let bestDX = SNAP + 0.001;
    for (const r of refX) {
      for (const c of candX) {
        const d = Math.abs(r.pos - c);
        if (d < bestDX) {
          bestDX = d;
          bestX = { newX: dragged.x + (c - r.pos), guideAt: c, edge: r.name, delta: c - r.pos };
        }
      }
    }
    let bestY = null;
    let bestDY = SNAP + 0.001;
    for (const r of refY) {
      for (const c of candY) {
        const d = Math.abs(r.pos - c);
        if (d < bestDY) {
          bestDY = d;
          bestY = { newY: dragged.y + (c - r.pos), guideAt: c, edge: r.name, delta: c - r.pos };
        }
      }
    }
    return { bestX, bestY };
  }

  // ── Marquee: global mousemove/up while drawing ──────────────
  useEffect(() => {
    if (!marqueeBox) return undefined;
    const pageEl = pageRefsMap.current[marqueeBox.pageId] || canvasRef.current;
    function onMove(e) {
      if (!pageEl) return;
      const r = pageEl.getBoundingClientRect();
      const x = (e.clientX - r.left) / zoom;
      const y = (e.clientY - r.top) / zoom;
      setMarqueeBox((prev) => (prev ? { ...prev, x1: x, y1: y } : prev));
    }
    function onUp() {
      const box = marqueeBox;
      const x = Math.min(box.x0, box.x1);
      const y = Math.min(box.y0, box.y1);
      const w = Math.abs(box.x1 - box.x0);
      const h = Math.abs(box.y1 - box.y0);
      const marquee = { x, y, w, h };
      const next = new Set();
      // Drag must be more than 4px to count as a marquee — otherwise treat as a click.
      if (w > 4 || h > 4) {
        for (const im of pageImages) {
          if (im.page_id !== box.pageId) continue;
          if (rectsIntersect(marquee, bboxOfImage(im))) next.add(`image:${im.id}`);
        }
        for (const tt of texts) {
          if (tt.page_id !== box.pageId) continue;
          if (rectsIntersect(marquee, bboxOfText(tt))) next.add(`text:${tt.id}`);
        }
      }
      setMarqueeBox(null);
      if (next.size > 0) {
        setMultiSelection(next);
        setSelectedImageId(null);
        setSelectedTextId(null);
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [marqueeBox, zoom, pageImages, texts]);

  // ── Group drag (multi-selected items move together) ────────
  useEffect(() => {
    if (!groupDrag) return undefined;
    const items = groupDrag.items;
    const deltas = new Map(); // id → { x, y } last delta
    // Group bounding box at drag start (used to compute snap on the union of selected items).
    const groupStart = items.reduce((acc, it) => {
      const w = it.kind === 'image'
        ? (Number(it.startW) || IMG_DEFAULT_W)
        : (Number(it.startW) || 200);
      const h = it.kind === 'image'
        ? (Number(it.startH) || IMG_DEFAULT_H)
        : (Number(it.startH) || 60);
      if (!acc) return { minX: it.startX, minY: it.startY, maxX: it.startX + w, maxY: it.startY + h };
      return {
        minX: Math.min(acc.minX, it.startX),
        minY: Math.min(acc.minY, it.startY),
        maxX: Math.max(acc.maxX, it.startX + w),
        maxY: Math.max(acc.maxY, it.startY + h),
      };
    }, null) || { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const groupW = Math.max(0, groupStart.maxX - groupStart.minX);
    const groupH = Math.max(0, groupStart.maxY - groupStart.minY);
    // Exclude all selected items from snap candidates so the group doesn't snap to itself.
    const excludeSet = new Set(items.map((it) => `${it.kind}:${it.id}`));
    function onMove(e) {
      const dx = (e.clientX - groupDrag.startMouseX) / zoom;
      const dy = (e.clientY - groupDrag.startMouseY) / zoom;
      // Compute group-level clamp: max we can translate without any item escaping bounds.
      let minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
      for (const it of items) {
        const w = it.kind === 'image'
          ? (Number(it.startW) || IMG_DEFAULT_W)
          : (Number(it.startW) || 200);
        const h = it.kind === 'image'
          ? (Number(it.startH) || IMG_DEFAULT_H)
          : (Number(it.startH) || 60);
        minDx = Math.max(minDx, -it.startX);
        maxDx = Math.min(maxDx, A4_W - w - it.startX);
        minDy = Math.max(minDy, -it.startY);
        maxDy = Math.min(maxDy, A4_H - h - it.startY);
      }
      let cdx = Math.max(minDx, Math.min(maxDx, dx));
      let cdy = Math.max(minDy, Math.min(maxDy, dy));
      // ── Smart-guide snap on the group bounding box ─────────────────
      const guides = [];
      const { bestX, bestY } = computeSnap(
        groupDrag.pageId,
        { x: groupStart.minX + cdx, y: groupStart.minY + cdy, w: groupW, h: groupH },
        excludeSet,
      );
      if (bestX) {
        // bestX.delta is relative to the current group bbox; add to cdx then re-clamp.
        const proposed = cdx + bestX.delta;
        if (proposed >= minDx && proposed <= maxDx) {
          cdx = proposed;
          guides.push({ pageId: groupDrag.pageId, axis: 'v', pos: bestX.guideAt });
        }
      }
      if (bestY) {
        const proposed = cdy + bestY.delta;
        if (proposed >= minDy && proposed <= maxDy) {
          cdy = proposed;
          guides.push({ pageId: groupDrag.pageId, axis: 'h', pos: bestY.guideAt });
        }
      }
      setGuideLines(guides);
      for (const it of items) {
        deltas.set(it.id, { x: it.startX + cdx, y: it.startY + cdy });
      }
      // Apply locally.
      setPageImages((prev) =>
        prev.map((im) => {
          const d = deltas.get(im.id);
          if (!d) return im;
          if (!items.find((i) => i.kind === 'image' && i.id === im.id)) return im;
          return { ...im, x_in_page: d.x, y_in_page: d.y };
        }),
      );
      setTexts((prev) =>
        prev.map((tt) => {
          const d = deltas.get(tt.id);
          if (!d) return tt;
          if (!items.find((i) => i.kind === 'text' && i.id === tt.id)) return tt;
          return { ...tt, x_in_page: d.x, y_in_page: d.y };
        }),
      );
    }
    async function onUp() {
      setGroupDrag(null);
      setGuideLines([]);
      // Persist each moved item.
      const updates = [];
      for (const it of items) {
        const d = deltas.get(it.id);
        if (!d) continue;
        const x = Math.round(d.x);
        const y = Math.round(d.y);
        if (it.kind === 'image') {
          updates.push(
            supabase.from('design_files').update({ x_in_page: x, y_in_page: y }).eq('id', it.id),
          );
        } else {
          updates.push(
            supabase.from('text_elements').update({ x_in_page: x, y_in_page: y }).eq('id', it.id),
          );
        }
      }
      const results = await Promise.all(updates);
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) console.error('[group drag] some persists failed', failed);
      // Undo: bundle moves into one group action.
      const moves = [];
      for (const it of items) {
        const d = deltas.get(it.id);
        if (!d) continue;
        const nextX = Math.round(d.x);
        const nextY = Math.round(d.y);
        const prevX = Math.round(it.startX);
        const prevY = Math.round(it.startY);
        if (nextX !== prevX || nextY !== prevY) {
          moves.push({ kind: it.kind, id: it.id, prevX, prevY, nextX, nextY });
        }
      }
      if (moves.length > 0) pushUndo({ type: 'GROUP_MOVE', moves });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [groupDrag, zoom]);

  // ── Delete key: remove all selected ─────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (pageEditingId || artboardEditingId) return;
      const sel = getAllSelectedKeys();
      if (sel.size === 0) return;
      e.preventDefault();
      const imageIds = [];
      const textIds = [];
      for (const k of sel) {
        if (k.startsWith('image:')) imageIds.push(k.slice(6));
        else if (k.startsWith('text:')) textIds.push(k.slice(5));
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[delete] debug', {
          imageIds,
          textIds,
          pageImagesIds: pageImages.map((im) => im.id),
          textsIds: texts.map((tt) => tt.id),
          selectedImageId,
          selectedTextId,
          multiSelection: [...multiSelection],
        });
      }
      // Use functional setState to capture the freshest local state for the snapshot.
      let imageRowsSnap = [];
      let textRowsSnap = [];
      if (imageIds.length > 0) {
        setPageImages((prev) => {
          imageRowsSnap = prev.filter((im) => imageIds.includes(im.id));
          return prev.filter((im) => !imageIds.includes(im.id));
        });
      }
      if (textIds.length > 0) {
        setTexts((prev) => {
          textRowsSnap = prev.filter((tt) => textIds.includes(tt.id));
          return prev.filter((tt) => !textIds.includes(tt.id));
        });
      }
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[delete] local snapshot result', {
          imageRowsSnap,
          textRowsSnap,
          stackBefore: undoStackRef.current.length,
        });
      }
      (async () => {
        // Fallback: if local state didn't yield the rows, fetch fresh from DB BEFORE deleting.
        if (imageIds.length > 0 && imageRowsSnap.length === 0) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[delete] local image snapshot empty — fetching from DB', imageIds);
          }
          const { data, error } = await supabase
            .from('design_files')
            .select('id, file_url, file_name, project_id, sprint_number, page_id, page_number, x_in_page, y_in_page, width, height')
            .in('id', imageIds);
          if (error) console.error('[delete] DB snapshot fetch failed (images)', error);
          if (data && data.length > 0) imageRowsSnap = data;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[delete] DB image snapshot', { count: data?.length, data });
          }
        }
        if (textIds.length > 0 && textRowsSnap.length === 0) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.warn('[delete] local text snapshot empty — fetching from DB', textIds);
          }
          const { data, error } = await supabase
            .from('text_elements')
            .select('id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough, width, height, text_align')
            .in('id', textIds);
          if (error) console.error('[delete] DB snapshot fetch failed (texts)', error);
          if (data && data.length > 0) textRowsSnap = data;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[delete] DB text snapshot', { count: data?.length, data });
          }
        }

        if (imageIds.length > 0) {
          // .select() forces the DELETE to return the rows that were actually removed → confirms behavior.
          const delResp = await supabase
            .from('design_files')
            .delete()
            .in('id', imageIds)
            .select('id');
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[delete] DB result (images)', {
              imageIds,
              deletedCount: delResp.data?.length ?? 0,
              deletedIds: (delResp.data || []).map((r) => r.id),
              error: delResp.error,
            });
          }
          if (delResp.error) console.error('[delete] images failed', delResp.error);
          // Fallback: if bulk DELETE returned 0 rows (no error), try per-id deletion to surface the cause.
          if (!delResp.error && (delResp.data?.length ?? 0) === 0 && imageIds.length > 0) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn('[delete] bulk image DELETE returned 0 rows — retrying per-id', imageIds);
            }
            for (const id of imageIds) {
              const r = await supabase.from('design_files').delete().eq('id', id).select('id');
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[delete] per-id image DB result', { id, deleted: r.data, error: r.error });
              }
            }
          }
        }
        if (textIds.length > 0) {
          const delResp = await supabase
            .from('text_elements')
            .delete()
            .in('id', textIds)
            .select('id');
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[delete] DB result (texts)', {
              textIds,
              deletedCount: delResp.data?.length ?? 0,
              deletedIds: (delResp.data || []).map((r) => r.id),
              error: delResp.error,
            });
          }
          if (delResp.error) console.error('[delete] texts failed', delResp.error);
          if (!delResp.error && (delResp.data?.length ?? 0) === 0 && textIds.length > 0) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.warn('[delete] bulk text DELETE returned 0 rows — retrying per-id', textIds);
            }
            for (const id of textIds) {
              const r = await supabase.from('text_elements').delete().eq('id', id).select('id');
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[delete] per-id text DB result', { id, deleted: r.data, error: r.error });
              }
            }
          }
        }
        clearAllSelection();
        if (imageRowsSnap.length > 0 || textRowsSnap.length > 0) {
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[undo] push DELETE_ITEMS', { images: imageRowsSnap, texts: textRowsSnap });
          }
          pushUndo({ type: 'DELETE_ITEMS', images: imageRowsSnap, texts: textRowsSnap });
        } else if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[delete] empty snapshot — skipping undo push', { imageIds, textIds });
        }
      })();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // intentionally re-bind on selection change so we capture latest selection
  }, [multiSelection, selectedImageId, selectedTextId, pageEditingId, artboardEditingId]);

  // ── Clipboard (Ctrl+C / Ctrl+V) ─────────────────────────────
  const [clipboard, setClipboard] = useState([]); // [{ kind: 'image'|'text', data: row }]
  const pasteOffsetRef = useRef(0); // grows by 1 each paste so repeated pastes cascade

  useEffect(() => {
    async function onKey(e) {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (textEditingId || pageEditingId || artboardEditingId) return;

      // Copy: Ctrl+C
      if (e.key === 'c' || e.key === 'C') {
        const sel = getAllSelectedKeys();
        if (sel.size === 0) return;
        e.preventDefault();
        const items = [];
        const ims = pageImagesRef.current || [];
        const tts = textsRef.current || [];
        for (const k of sel) {
          if (k.startsWith('image:')) {
            const id = k.slice(6);
            const row = ims.find((im) => im.id === id);
            if (row) items.push({ kind: 'image', data: { ...row } });
          } else if (k.startsWith('text:')) {
            const id = k.slice(5);
            const row = tts.find((tt) => tt.id === id);
            if (row) items.push({ kind: 'text', data: { ...row } });
          }
        }
        if (items.length > 0) {
          setClipboard(items);
          pasteOffsetRef.current = 0;
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[copy]', { count: items.length, items });
          }
        }
        return;
      }

      // Paste: Ctrl+V
      if (e.key === 'v' || e.key === 'V') {
        if (!clipboard || clipboard.length === 0) return;
        e.preventDefault();
        pasteOffsetRef.current += 1;
        const offset = pasteOffsetRef.current * 20;

        const sprintN = Number(effectiveViewingSprint);
        if (!projectId || !Number.isFinite(sprintN) || sprintN < 1) return;
        const targetPageId = selectedPageId || pages[0]?.id || null;
        if (!targetPageId) return;

        const imagePayloads = [];
        const textPayloads = [];
        for (const item of clipboard) {
          const { kind, data } = item;
          const baseX = Number(data.x_in_page) || 0;
          const baseY = Number(data.y_in_page) || 0;
          let nx = baseX + offset;
          let ny = baseY + offset;
          if (kind === 'image') {
            const w = Number(data.width) || IMG_DEFAULT_W;
            const h = Number(data.height) || IMG_DEFAULT_H;
            nx = Math.max(0, Math.min(A4_W - w, Math.round(nx)));
            ny = Math.max(0, Math.min(A4_H - h, Math.round(ny)));
            imagePayloads.push({
              file_url: data.file_url ?? null,
              file_name: data.file_name ?? null,
              project_id: projectId,
              sprint_number: sprintN,
              page_id: targetPageId,
              x_in_page: nx,
              y_in_page: ny,
              width: w,
              height: h,
            });
          } else if (kind === 'text') {
            const tw = Number(data.width) || 200;
            const th = Number(data.height) || 60;
            nx = Math.max(0, Math.min(Math.max(0, A4_W - tw), Math.round(nx)));
            ny = Math.max(0, Math.min(Math.max(0, A4_H - th), Math.round(ny)));
            textPayloads.push({
              project_id: projectId,
              sprint_number: sprintN,
              page_id: targetPageId,
              content: data.content ?? '',
              x_in_page: nx,
              y_in_page: ny,
              font_size: Number(data.font_size) || 16,
              font_weight: Number(data.font_weight) || 400,
              color: data.color || '#1f2937',
              italic: !!data.italic,
              strikethrough: !!data.strikethrough,
              width: Number(data.width) || 200,
              height: Number(data.height) || 60,
              text_align: data.text_align || 'left',
            });
          }
        }

        const newSelection = new Set();
        if (imagePayloads.length > 0) {
          const { data: inserted, error } = await supabase
            .from('design_files')
            .insert(imagePayloads)
            .select('id, file_url, file_name, project_id, sprint_number, page_id, page_number, x_in_page, y_in_page, width, height');
          if (error) console.error('[paste] image insert failed', error);
          if (inserted && inserted.length > 0) {
            setPageImages((prev) => [...prev, ...inserted]);
            for (const im of inserted) newSelection.add(`image:${im.id}`);
          }
        }
        if (textPayloads.length > 0) {
          const { data: inserted, error } = await supabase
            .from('text_elements')
            .insert(textPayloads)
            .select('id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough, width, height, text_align');
          if (error) console.error('[paste] text insert failed', error);
          if (inserted && inserted.length > 0) {
            setTexts((prev) => [...prev, ...inserted]);
            for (const tt of inserted) newSelection.add(`text:${tt.id}`);
          }
        }

        if (newSelection.size > 0) {
          setSelectedImageId(null);
          setSelectedTextId(null);
          setMultiSelection(newSelection);
          if (import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.log('[paste]', { count: newSelection.size, pageId: targetPageId, offset });
          }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    clipboard,
    selectedImageId,
    selectedTextId,
    multiSelection,
    selectedPageId,
    projectId,
    effectiveViewingSprint,
    pages,
    textEditingId,
    pageEditingId,
    artboardEditingId,
  ]);

  // Ctrl+Z / Cmd+Z: undo the last action.
  useEffect(() => {
    async function onKey(e) {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (e.shiftKey) return; // shift+Z reserved (redo not implemented)
      if (isEditableKeyboardTarget(e.target)) return;
      if (textEditingId) return;
      if (pageEditingId || artboardEditingId) return;
      const stack = undoStackRef.current;
      if (!stack || stack.length === 0) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log('[undo] no action to pop', { stackLen: stack?.length ?? 0 });
        }
        return;
      }
      e.preventDefault();
      const action = stack[stack.length - 1];
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[undo] pop', { type: action.type, action, stackLen: stack.length });
      }
      setUndoStack((prev) => prev.slice(0, -1));
      try {
        switch (action.type) {
          case 'MOVE_IMAGE': {
            await supabase
              .from('design_files')
              .update({ x_in_page: action.prevX, y_in_page: action.prevY })
              .eq('id', action.id);
            setPageImages((prev) =>
              prev.map((im) =>
                im.id === action.id ? { ...im, x_in_page: action.prevX, y_in_page: action.prevY } : im,
              ),
            );
            break;
          }
          case 'MOVE_TEXT': {
            await supabase
              .from('text_elements')
              .update({ x_in_page: action.prevX, y_in_page: action.prevY })
              .eq('id', action.id);
            setTexts((prev) =>
              prev.map((tt) =>
                tt.id === action.id ? { ...tt, x_in_page: action.prevX, y_in_page: action.prevY } : tt,
              ),
            );
            break;
          }
          case 'RESIZE_IMAGE': {
            const { id, prev } = action;
            await supabase
              .from('design_files')
              .update({ x_in_page: prev.x, y_in_page: prev.y, width: prev.w, height: prev.h })
              .eq('id', id);
            setPageImages((p) =>
              p.map((im) =>
                im.id === id
                  ? { ...im, x_in_page: prev.x, y_in_page: prev.y, width: prev.w, height: prev.h }
                  : im,
              ),
            );
            break;
          }
          case 'RESIZE_TEXT': {
            const { id, prev } = action;
            await supabase
              .from('text_elements')
              .update({ x_in_page: prev.x, y_in_page: prev.y, width: prev.w, height: prev.h })
              .eq('id', id);
            setTexts((p) =>
              p.map((tt) =>
                tt.id === id
                  ? { ...tt, x_in_page: prev.x, y_in_page: prev.y, width: prev.w, height: prev.h }
                  : tt,
              ),
            );
            break;
          }
          case 'GROUP_MOVE': {
            // Reverse each item to its prevX/prevY.
            const imgUpdates = action.moves.filter((m) => m.kind === 'image');
            const txtUpdates = action.moves.filter((m) => m.kind === 'text');
            const calls = [];
            for (const m of imgUpdates) {
              calls.push(
                supabase
                  .from('design_files')
                  .update({ x_in_page: m.prevX, y_in_page: m.prevY })
                  .eq('id', m.id),
              );
            }
            for (const m of txtUpdates) {
              calls.push(
                supabase
                  .from('text_elements')
                  .update({ x_in_page: m.prevX, y_in_page: m.prevY })
                  .eq('id', m.id),
              );
            }
            await Promise.all(calls);
            setPageImages((p) =>
              p.map((im) => {
                const m = imgUpdates.find((x) => x.id === im.id);
                return m ? { ...im, x_in_page: m.prevX, y_in_page: m.prevY } : im;
              }),
            );
            setTexts((p) =>
              p.map((tt) => {
                const m = txtUpdates.find((x) => x.id === tt.id);
                return m ? { ...tt, x_in_page: m.prevX, y_in_page: m.prevY } : tt;
              }),
            );
            break;
          }
          case 'GROUP_RESIZE': {
            // Each move record: { kind, id, prev: {x,y,w,h}, next: {x,y,w,h} }
            const imgMoves = action.moves.filter((m) => m.kind === 'image');
            const txtMoves = action.moves.filter((m) => m.kind === 'text');
            const calls = [];
            for (const m of imgMoves) {
              calls.push(
                supabase.from('design_files')
                  .update({ x_in_page: m.prev.x, y_in_page: m.prev.y, width: m.prev.w, height: m.prev.h })
                  .eq('id', m.id),
              );
            }
            for (const m of txtMoves) {
              calls.push(
                supabase.from('text_elements')
                  .update({ x_in_page: m.prev.x, y_in_page: m.prev.y, width: m.prev.w, height: m.prev.h })
                  .eq('id', m.id),
              );
            }
            await Promise.all(calls);
            setPageImages((p) =>
              p.map((im) => {
                const m = imgMoves.find((x) => x.id === im.id);
                return m ? { ...im, x_in_page: m.prev.x, y_in_page: m.prev.y, width: m.prev.w, height: m.prev.h } : im;
              }),
            );
            setTexts((p) =>
              p.map((tt) => {
                const m = txtMoves.find((x) => x.id === tt.id);
                return m ? { ...tt, x_in_page: m.prev.x, y_in_page: m.prev.y, width: m.prev.w, height: m.prev.h } : tt;
              }),
            );
            break;
          }
          case 'DELETE_ITEMS': {
            const { images, texts: textsArr } = action;
            if (images && images.length > 0) {
              // Sanitize to columns that actually exist on design_files.
              const payload = images.map((im) => ({
                id: im.id,
                file_url: im.file_url ?? null,
                file_name: im.file_name ?? null,
                project_id: im.project_id ?? null,
                sprint_number: im.sprint_number ?? null,
                page_id: im.page_id ?? null,
                page_number: im.page_number ?? null,
                x_in_page: im.x_in_page ?? 0,
                y_in_page: im.y_in_page ?? 0,
                width: im.width ?? 460,
                height: im.height ?? 340,
              }));
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[undo DELETE_ITEMS] re-inserting images', payload);
              }
              const { data, error } = await supabase
                .from('design_files')
                .insert(payload)
                .select('id, file_url, file_name, project_id, sprint_number, page_id, page_number, x_in_page, y_in_page, width, height');
              if (error) console.error('[undo DELETE_ITEMS] image insert failed', error);
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[undo DELETE_ITEMS] image insert result', { data, error });
              }
              if (data && data.length > 0) {
                setPageImages((prev) => [...prev, ...data]);
              }
            }
            if (textsArr && textsArr.length > 0) {
              const tPayload = textsArr.map((tt) => ({
                id: tt.id,
                project_id: tt.project_id ?? null,
                page_id: tt.page_id ?? null,
                sprint_number: tt.sprint_number ?? null,
                content: tt.content ?? '',
                x_in_page: tt.x_in_page ?? 0,
                y_in_page: tt.y_in_page ?? 0,
                font_size: tt.font_size ?? 16,
                font_weight: tt.font_weight ?? 400,
                color: tt.color ?? '#1f2937',
                italic: !!tt.italic,
                strikethrough: !!tt.strikethrough,
              }));
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[undo DELETE_ITEMS] re-inserting texts', tPayload);
              }
              const { data, error } = await supabase
                .from('text_elements')
                .insert(tPayload)
                .select('id, project_id, page_id, sprint_number, content, x_in_page, y_in_page, font_size, font_weight, color, italic, strikethrough, width, height, text_align');
              if (error) console.error('[undo DELETE_ITEMS] text insert failed', error);
              if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('[undo DELETE_ITEMS] text insert result', { data, error });
              }
              if (data && data.length > 0) {
                setTexts((prev) => [...prev, ...data]);
              }
            }
            break;
          }
          case 'CREATE_TEXT': {
            await supabase.from('text_elements').delete().eq('id', action.id);
            setTexts((prev) => prev.filter((tt) => tt.id !== action.id));
            if (selectedTextId === action.id) setSelectedTextId(null);
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('[undo] failed', err);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [textEditingId, pageEditingId, artboardEditingId, selectedTextId]);

  // Image resize (corner handles) — global mousemove/up while resizing.
  useEffect(() => {
    if (!imageResize) return undefined;
    const MIN = 40;
    let lastW = imageResize.startW;
    let lastH = imageResize.startH;
    let lastX = imageResize.startImgX;
    let lastY = imageResize.startImgY;
    // Resolve the page this image belongs to so we can run smart-guide snap against siblings.
    const resizeRow = (pageImagesRef.current || pageImages).find((im) => im.id === imageResize.imgId);
    const resizePageId = resizeRow?.page_id || null;
    function onMove(e) {
      const dx = (e.clientX - imageResize.startMouseX) / zoom;
      const dy = (e.clientY - imageResize.startMouseY) / zoom;
      let w = imageResize.startW;
      let h = imageResize.startH;
      let x = imageResize.startImgX;
      let y = imageResize.startImgY;
      switch (imageResize.corner) {
        case 'se': w = imageResize.startW + dx; h = imageResize.startH + dy; break;
        case 'sw': w = imageResize.startW - dx; h = imageResize.startH + dy; x = imageResize.startImgX + dx; break;
        case 'ne': w = imageResize.startW + dx; h = imageResize.startH - dy; y = imageResize.startImgY + dy; break;
        case 'nw': w = imageResize.startW - dx; h = imageResize.startH - dy; x = imageResize.startImgX + dx; y = imageResize.startImgY + dy; break;
        case 'n':  h = imageResize.startH - dy; y = imageResize.startImgY + dy; break;
        case 's':  h = imageResize.startH + dy; break;
        case 'w':  w = imageResize.startW - dx; x = imageResize.startImgX + dx; break;
        case 'e':  w = imageResize.startW + dx; break;
        default: break;
      }
      const isCornerHandle = imageResize.corner === 'nw' || imageResize.corner === 'ne'
        || imageResize.corner === 'sw' || imageResize.corner === 'se';
      // Shift = lock aspect ratio. Only meaningful on corner handles (a single-axis side
      // handle has no companion axis to balance against, so we leave size unchanged).
      if (e.shiftKey && isCornerHandle) {
        const ratio = imageResize.startW / Math.max(1, imageResize.startH);
        const newRatio = w / Math.max(1, h);
        if (newRatio > ratio) {
          h = w / ratio;
          if (imageResize.corner === 'ne' || imageResize.corner === 'nw') {
            y = imageResize.startImgY + (imageResize.startH - h);
          }
        } else {
          w = h * ratio;
          if (imageResize.corner === 'sw' || imageResize.corner === 'nw') {
            x = imageResize.startImgX + (imageResize.startW - w);
          }
        }
      }
      // Alt = grow/shrink from center (mirror size delta on opposite side).
      if (e.altKey) {
        const dW = w - imageResize.startW;
        const dH = h - imageResize.startH;
        w = imageResize.startW + 2 * dW;
        h = imageResize.startH + 2 * dH;
        const cx = imageResize.startImgX + imageResize.startW / 2;
        const cy = imageResize.startImgY + imageResize.startH / 2;
        x = cx - w / 2;
        y = cy - h / 2;
      }
      // Enforce minimum size, adjusting position if anchor moved.
      const movesLeftEdge = imageResize.corner === 'sw' || imageResize.corner === 'nw' || imageResize.corner === 'w';
      const movesTopEdge = imageResize.corner === 'ne' || imageResize.corner === 'nw' || imageResize.corner === 'n';
      if (w < MIN) {
        const delta = MIN - w;
        w = MIN;
        if (e.altKey) x -= delta / 2;
        else if (movesLeftEdge) x -= delta;
      }
      if (h < MIN) {
        const delta = MIN - h;
        h = MIN;
        if (e.altKey) y -= delta / 2;
        else if (movesTopEdge) y -= delta;
      }
      // Clamp to page bounds.
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > A4_W) w = A4_W - x;
      if (y + h > A4_H) h = A4_H - y;
      if (w < MIN) w = MIN;
      if (h < MIN) h = MIN;
      // ── Smart-guide snap on the edge being dragged ─────────────────
      // Snap is allowed in every mode (including Shift/Alt). After the snap pulls one
      // edge to a candidate, Shift re-locks the aspect ratio from the snapped dimension
      // and Alt re-centres the box around the original centre.
      // For side handles the perpendicular axis is fixed → don't search snaps on it.
      const guides = [];
      if (resizePageId) {
        const xEdge = movesLeftEdge ? 'left' : 'right';
        const yEdge = movesTopEdge ? 'top' : 'bottom';
        const onlyXSide = imageResize.corner === 'w' || imageResize.corner === 'e';
        const onlyYSide = imageResize.corner === 'n' || imageResize.corner === 's';
        const snapOpts = {};
        if (onlyXSide) { snapOpts.edgesX = [xEdge]; snapOpts.edgesY = []; }
        else if (onlyYSide) { snapOpts.edgesX = []; snapOpts.edgesY = [yEdge]; }
        else { snapOpts.edgesX = [xEdge]; snapOpts.edgesY = [yEdge]; }
        const { bestX, bestY } = computeSnap(
          resizePageId,
          { x, y, w, h },
          `image:${imageResize.imgId}`,
          snapOpts,
        );
        if (bestX) {
          if (xEdge === 'right') {
            // Drag right edge to candidate; left edge stays.
            w = bestX.guideAt - x;
          } else {
            // Drag left edge to candidate; right edge stays.
            const right = x + w;
            x = bestX.guideAt;
            w = right - x;
          }
        }
        if (bestY) {
          if (yEdge === 'bottom') {
            h = bestY.guideAt - y;
          } else {
            const bottom = y + h;
            y = bestY.guideAt;
            h = bottom - y;
          }
        }

        // ── Re-apply Shift / Alt modifiers after snap ─────────────────
        const startX = imageResize.startImgX;
        const startY = imageResize.startImgY;
        const startW = imageResize.startW;
        const startH = imageResize.startH;
        const startRight = startX + startW;
        const startBottom = startY + startH;
        const startCx = startX + startW / 2;
        const startCy = startY + startH / 2;
        const ratio = startW / Math.max(1, startH);

        if (e.shiftKey && isCornerHandle && (bestX || bestY)) {
          // Pick the driven axis. Prefer the axis that snapped; if both snapped, the
          // one with the tighter snap (smaller delta) drives so the other side gives way.
          let driveX;
          if (bestX && !bestY) driveX = true;
          else if (bestY && !bestX) driveX = false;
          else driveX = Math.abs(bestX.delta) <= Math.abs(bestY.delta);
          if (driveX) {
            h = w / ratio;
          } else {
            w = h * ratio;
          }
          // Re-anchor the non-snapped side back to the start position (unless Alt is
          // also held, which centre-anchors below).
          if (!e.altKey) {
            x = movesLeftEdge ? (startRight - w) : startX;
            y = movesTopEdge ? (startBottom - h) : startY;
          }
        }
        if (e.altKey) {
          // Snap moved one edge; Alt mirrors the box around the original centre so the
          // opposite edge moves by the same amount. Re-derive x/y from the centre.
          x = startCx - w / 2;
          y = startCy - h / 2;
        }

        // Re-enforce minimums and page bounds after snap + modifiers
        // (snap and modifier re-application can each briefly violate either).
        if (w < MIN) {
          if (e.altKey) x = startCx - MIN / 2;
          else if (xEdge === 'left') x = (lastX + lastW) - MIN > 0 ? (Math.max(0, x + (w - MIN))) : 0;
          w = MIN;
        }
        if (h < MIN) {
          if (e.altKey) y = startCy - MIN / 2;
          else if (yEdge === 'top') y = Math.max(0, y + (h - MIN));
          h = MIN;
        }
        if (x < 0) { w += x; x = 0; }
        if (y < 0) { h += y; y = 0; }
        if (x + w > A4_W) w = A4_W - x;
        if (y + h > A4_H) h = A4_H - y;
        if (w < MIN) w = MIN;
        if (h < MIN) h = MIN;
        if (bestX) guides.push({ pageId: resizePageId, axis: 'v', pos: bestX.guideAt });
        if (bestY) guides.push({ pageId: resizePageId, axis: 'h', pos: bestY.guideAt });
      }
      setGuideLines(guides);
      lastW = w; lastH = h; lastX = x; lastY = y;
      setPageImages((prev) =>
        prev.map((im) =>
          im.id === imageResize.imgId
            ? { ...im, width: w, height: h, x_in_page: x, y_in_page: y }
            : im,
        ),
      );
    }
    async function onUp() {
      const id = imageResize.imgId;
      const fw = Math.round(lastW);
      const fh = Math.round(lastH);
      const fx = Math.round(lastX);
      const fy = Math.round(lastY);
      setImageResize(null);
      setGuideLines([]);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log('[image resize] mouseUp → persisting', { id, fw, fh, fx, fy });
      }
      const { data, error } = await supabase
        .from('design_files')
        .update({ width: fw, height: fh, x_in_page: fx, y_in_page: fy })
        .eq('id', id)
        .select('id, width, height, x_in_page, y_in_page')
        .single();
      if (error) {
        console.error('[image resize] persist failed', { id, error });
        return;
      }
      if (data) {
        setPageImages((prev) =>
          prev.map((im) =>
            im.id === id
              ? { ...im, width: data.width, height: data.height, x_in_page: data.x_in_page, y_in_page: data.y_in_page }
              : im,
          ),
        );
      }
      // Undo
      const prevX = Math.round(imageResize.startImgX);
      const prevY = Math.round(imageResize.startImgY);
      const prevW = Math.round(imageResize.startW);
      const prevH = Math.round(imageResize.startH);
      if (prevX !== fx || prevY !== fy || prevW !== fw || prevH !== fh) {
        pushUndo({
          type: 'RESIZE_IMAGE',
          id,
          prev: { x: prevX, y: prevY, w: prevW, h: prevH },
          next: { x: fx, y: fy, w: fw, h: fh },
        });
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [imageResize, zoom]);

  // ── Text box resize (corner + side handle drag changes width/height; font_size unchanged) ──
  useEffect(() => {
    if (!textResize) return undefined;
    const MIN_W = 40;
    const MIN_H = 24;
    let lastW = textResize.startW;
    let lastH = textResize.startH;
    let lastX = textResize.startTextX;
    let lastY = textResize.startTextY;
    // Which edges this handle moves — drives both the resize math and the anchor-adjustment
    // when we clamp to content size, snap, or page bounds.
    const corner = textResize.corner;
    const movesLeft = corner === 'nw' || corner === 'sw' || corner === 'w';
    const movesTop = corner === 'nw' || corner === 'ne' || corner === 'n';
    const onlyXSide = corner === 'w' || corner === 'e';
    const onlyYSide = corner === 'n' || corner === 's';
    const startRight = textResize.startTextX + textResize.startW;
    const startBottom = textResize.startTextY + textResize.startH;
    const ttRow = (textsRef.current || texts).find((t) => t.id === textResize.id);
    const resizePageId = textResize.pageId || ttRow?.page_id || null;

    // Enforce hard min + content min + page bounds. Returns adjusted dims/pos.
    // Used twice per move: once after raw drag math, once after snap.
    function enforce(wIn, hIn, xIn, yIn) {
      let w = wIn, h = hIn, x = xIn, y = yIn;
      // Hard minimum
      if (w < MIN_W) {
        if (movesLeft) x = startRight - MIN_W;
        w = MIN_W;
      }
      if (h < MIN_H) {
        if (movesTop) y = startBottom - MIN_H;
        h = MIN_H;
      }
      // Content-size guard via hidden measurer
      const meas = textResizeMeasurerRef.current;
      if (meas && ttRow) {
        const fs = Number(ttRow.font_size) || 16;
        meas.style.fontSize = `${fs}px`;
        meas.style.fontWeight = String(Number(ttRow.font_weight) || 400);
        meas.style.fontStyle = ttRow.italic ? 'italic' : 'normal';
        meas.style.textAlign = ttRow.text_align || 'left';
        meas.style.width = `${Math.max(20, w)}px`;
        meas.textContent = String(ttRow.content || '');
        const PAD = 6;
        const minContentW = meas.scrollWidth + PAD;
        if (w < minContentW) {
          if (movesLeft) x = startRight - minContentW;
          w = minContentW;
        }
        meas.style.width = `${w}px`;
        const minContentH = meas.scrollHeight + PAD;
        if (h < minContentH) {
          if (movesTop) y = startBottom - minContentH;
          h = minContentH;
        }
      }
      // Page bounds clamp
      if (x < 0) { w += x; x = 0; }
      if (y < 0) { h += y; y = 0; }
      if (x + w > A4_W) w = A4_W - x;
      if (y + h > A4_H) h = A4_H - y;
      w = Math.max(MIN_W, w);
      h = Math.max(MIN_H, h);
      return { w, h, x, y };
    }

    function onMove(e) {
      const dx = (e.clientX - textResize.startMouseX) / zoom;
      const dy = (e.clientY - textResize.startMouseY) / zoom;
      let w = textResize.startW;
      let h = textResize.startH;
      let x = textResize.startTextX;
      let y = textResize.startTextY;
      switch (corner) {
        case 'se': w = textResize.startW + dx; h = textResize.startH + dy; break;
        case 'sw': w = textResize.startW - dx; h = textResize.startH + dy; x = textResize.startTextX + dx; break;
        case 'ne': w = textResize.startW + dx; h = textResize.startH - dy; y = textResize.startTextY + dy; break;
        case 'nw': w = textResize.startW - dx; h = textResize.startH - dy; x = textResize.startTextX + dx; y = textResize.startTextY + dy; break;
        case 'n':  h = textResize.startH - dy; y = textResize.startTextY + dy; break;
        case 's':  h = textResize.startH + dy; break;
        case 'w':  w = textResize.startW - dx; x = textResize.startTextX + dx; break;
        case 'e':  w = textResize.startW + dx; break;
        default: break;
      }
      // First pass: respect minimums, content size, and page bounds before snap.
      ({ w, h, x, y } = enforce(w, h, x, y));

      // ── Smart-guide snap on the edge being dragged ─────────────────
      // Mirrors the imageResize behaviour: snap the moving edge to siblings and re-enforce
      // constraints. Side handles only carry one axis, so don't search snaps on the other.
      const guides = [];
      if (resizePageId) {
        const xEdge = movesLeft ? 'left' : 'right';
        const yEdge = movesTop ? 'top' : 'bottom';
        const snapOpts = {};
        if (onlyXSide) { snapOpts.edgesX = [xEdge]; snapOpts.edgesY = []; }
        else if (onlyYSide) { snapOpts.edgesX = []; snapOpts.edgesY = [yEdge]; }
        else { snapOpts.edgesX = [xEdge]; snapOpts.edgesY = [yEdge]; }
        const { bestX, bestY } = computeSnap(
          resizePageId,
          { x, y, w, h },
          `text:${textResize.id}`,
          snapOpts,
        );
        if (bestX) {
          if (xEdge === 'right') {
            w = bestX.guideAt - x;
          } else {
            const right = x + w;
            x = bestX.guideAt;
            w = right - x;
          }
        }
        if (bestY) {
          if (yEdge === 'bottom') {
            h = bestY.guideAt - y;
          } else {
            const bottom = y + h;
            y = bestY.guideAt;
            h = bottom - y;
          }
        }
        // Re-enforce constraints after snap (snap can briefly violate min / content / bounds).
        ({ w, h, x, y } = enforce(w, h, x, y));
        if (bestX) guides.push({ pageId: resizePageId, axis: 'v', pos: bestX.guideAt });
        if (bestY) guides.push({ pageId: resizePageId, axis: 'h', pos: bestY.guideAt });
      }
      setGuideLines(guides);

      lastW = w; lastH = h; lastX = x; lastY = y;
      setTexts((prev) =>
        prev.map((tt) =>
          tt.id === textResize.id
            ? { ...tt, width: w, height: h, x_in_page: x, y_in_page: y }
            : tt,
        ),
      );
    }
    async function onUp() {
      const id = textResize.id;
      const fx = Math.round(lastX);
      const fy = Math.round(lastY);
      const fw = Math.round(lastW);
      const fh = Math.round(lastH);
      setTextResize(null);
      setGuideLines([]);
      // Preferred path: persist x/y/w/h together.
      let { data, error } = await supabase
        .from('text_elements')
        .update({ x_in_page: fx, y_in_page: fy, width: fw, height: fh })
        .eq('id', id)
        .select('id, x_in_page, y_in_page, width, height')
        .single();
      // Pre-migration fallback: DB hasn't added width/height/text_align yet.
      // At minimum keep position synced so remote users still see the move; the box
      // size is held in memory until the migration lands.
      if (error && /(width|height)/i.test(error.message || '')) {
        const fb = await supabase
          .from('text_elements')
          .update({ x_in_page: fx, y_in_page: fy })
          .eq('id', id)
          .select('id, x_in_page, y_in_page')
          .single();
        data = fb.data;
        error = fb.error;
        if (data) data = { ...data, width: fw, height: fh };
      }
      if (error) {
        console.error('[text resize] persist failed', { id, fx, fy, fw, fh, error });
        return;
      }
      if (data) {
        setTexts((prev) =>
          prev.map((tt) => (tt.id === id ? { ...tt, ...data } : tt)),
        );
      }
      const prevX = Math.round(textResize.startTextX);
      const prevY = Math.round(textResize.startTextY);
      const prevW = Math.round(textResize.startW);
      const prevH = Math.round(textResize.startH);
      if (prevX !== fx || prevY !== fy || prevW !== fw || prevH !== fh) {
        pushUndo({
          type: 'RESIZE_TEXT',
          id,
          prev: { x: prevX, y: prevY, w: prevW, h: prevH },
          next: { x: fx, y: fy, w: fw, h: fh },
        });
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [textResize, zoom]);

  // ── Multi-selection resize ────────────────────────────────────
  // Scales every selected item proportionally inside the group bbox. Each item keeps its
  // relative position/size within the bbox: item.x = bbox.x + (item.startX - bbox.startX) * sx.
  // Supports Shift (lock bbox aspect ratio), Alt (mirror from centre), and smart-guide snap
  // — same modifier semantics as the single-element imageResize effect.
  useEffect(() => {
    if (!multiResize) return undefined;
    const { startBbox, items, corner, pageId } = multiResize;
    const MIN_BBOX_W = 40;
    const MIN_BBOX_H = 40;
    const startRight = startBbox.x + startBbox.w;
    const startBottom = startBbox.y + startBbox.h;
    const startCx = startBbox.x + startBbox.w / 2;
    const startCy = startBbox.y + startBbox.h / 2;
    const ratio = startBbox.w / Math.max(1, startBbox.h);
    const movesLeft = corner === 'nw' || corner === 'sw';
    const movesTop = corner === 'nw' || corner === 'ne';
    // Exclude every item in the group from snap candidates — we want to snap to *other*
    // page elements, not to our own bbox members.
    const excludeKeys = new Set(items.map((it) => `${it.kind}:${it.id}`));
    let last = { ...startBbox };
    function onMove(e) {
      const dx = (e.clientX - multiResize.startMouseX) / zoom;
      const dy = (e.clientY - multiResize.startMouseY) / zoom;
      // 1) Raw bbox from the dragged corner (opposite corner stays fixed).
      let nx = startBbox.x;
      let ny = startBbox.y;
      let nw = startBbox.w;
      let nh = startBbox.h;
      switch (corner) {
        case 'se': nw = startBbox.w + dx; nh = startBbox.h + dy; break;
        case 'sw': nw = startBbox.w - dx; nh = startBbox.h + dy; nx = startBbox.x + dx; break;
        case 'ne': nw = startBbox.w + dx; nh = startBbox.h - dy; ny = startBbox.y + dy; break;
        case 'nw': nw = startBbox.w - dx; nh = startBbox.h - dy; nx = startBbox.x + dx; ny = startBbox.y + dy; break;
        default: break;
      }
      // 2) Shift = lock bbox aspect ratio. Drive whichever axis moved more relative to start.
      if (e.shiftKey) {
        const curRatio = nw / Math.max(1, nh);
        if (curRatio > ratio) {
          nh = nw / ratio;
          if (movesTop) ny = startBottom - nh;
        } else {
          nw = nh * ratio;
          if (movesLeft) nx = startRight - nw;
        }
      }
      // 3) Alt = grow/shrink from the bbox centre (mirror delta on the opposite side).
      if (e.altKey) {
        const dW = nw - startBbox.w;
        const dH = nh - startBbox.h;
        nw = startBbox.w + 2 * dW;
        nh = startBbox.h + 2 * dH;
        nx = startCx - nw / 2;
        ny = startCy - nh / 2;
      }
      // 4) Minimum bbox size while preserving the stationary corner / centre.
      if (nw < MIN_BBOX_W) {
        const delta = MIN_BBOX_W - nw;
        nw = MIN_BBOX_W;
        if (e.altKey) nx -= delta / 2;
        else if (movesLeft) nx -= delta;
      }
      if (nh < MIN_BBOX_H) {
        const delta = MIN_BBOX_H - nh;
        nh = MIN_BBOX_H;
        if (e.altKey) ny -= delta / 2;
        else if (movesTop) ny -= delta;
      }
      // 5) Page-bounds clamp.
      if (nx < 0) { nw += nx; nx = 0; }
      if (ny < 0) { nh += ny; ny = 0; }
      if (nx + nw > A4_W) nw = A4_W - nx;
      if (ny + nh > A4_H) nh = A4_H - ny;
      if (nw < MIN_BBOX_W) nw = MIN_BBOX_W;
      if (nh < MIN_BBOX_H) nh = MIN_BBOX_H;
      // 6) Smart-guide snap on the bbox edges being dragged.
      const guides = [];
      if (pageId) {
        const xEdge = movesLeft ? 'left' : 'right';
        const yEdge = movesTop ? 'top' : 'bottom';
        const { bestX, bestY } = computeSnap(
          pageId,
          { x: nx, y: ny, w: nw, h: nh },
          excludeKeys,
          { edgesX: [xEdge], edgesY: [yEdge] },
        );
        if (bestX) {
          if (xEdge === 'right') {
            nw = bestX.guideAt - nx;
          } else {
            const right = nx + nw;
            nx = bestX.guideAt;
            nw = right - nx;
          }
        }
        if (bestY) {
          if (yEdge === 'bottom') {
            nh = bestY.guideAt - ny;
          } else {
            const bottom = ny + nh;
            ny = bestY.guideAt;
            nh = bottom - ny;
          }
        }
        // 7) Re-apply Shift / Alt after snap (snap shifted one edge; modifiers re-balance).
        if (e.shiftKey && (bestX || bestY)) {
          let driveX;
          if (bestX && !bestY) driveX = true;
          else if (bestY && !bestX) driveX = false;
          else driveX = Math.abs(bestX.delta) <= Math.abs(bestY.delta);
          if (driveX) nh = nw / ratio;
          else nw = nh * ratio;
          if (!e.altKey) {
            nx = movesLeft ? (startRight - nw) : startBbox.x;
            ny = movesTop ? (startBottom - nh) : startBbox.y;
          }
        }
        if (e.altKey) {
          nx = startCx - nw / 2;
          ny = startCy - nh / 2;
        }
        // 8) Re-enforce minimums + page bounds after modifier re-application.
        if (nw < MIN_BBOX_W) {
          if (e.altKey) nx = startCx - MIN_BBOX_W / 2;
          else if (movesLeft) nx = startRight - MIN_BBOX_W;
          nw = MIN_BBOX_W;
        }
        if (nh < MIN_BBOX_H) {
          if (e.altKey) ny = startCy - MIN_BBOX_H / 2;
          else if (movesTop) ny = startBottom - MIN_BBOX_H;
          nh = MIN_BBOX_H;
        }
        if (nx < 0) { nw += nx; nx = 0; }
        if (ny < 0) { nh += ny; ny = 0; }
        if (nx + nw > A4_W) nw = A4_W - nx;
        if (ny + nh > A4_H) nh = A4_H - ny;
        if (nw < MIN_BBOX_W) nw = MIN_BBOX_W;
        if (nh < MIN_BBOX_H) nh = MIN_BBOX_H;
        if (bestX) guides.push({ pageId, axis: 'v', pos: bestX.guideAt });
        if (bestY) guides.push({ pageId, axis: 'h', pos: bestY.guideAt });
      }
      setGuideLines(guides);
      const sx = nw / startBbox.w;
      const sy = nh / startBbox.h;
      last = { x: nx, y: ny, w: nw, h: nh };
      // Map each item into the new bbox.
      const imgUpdates = new Map();
      const txtUpdates = new Map();
      for (const it of items) {
        const relX = it.startX - startBbox.x;
        const relY = it.startY - startBbox.y;
        const newX = nx + relX * sx;
        const newY = ny + relY * sy;
        const newW = Math.max(20, it.startW * sx);
        const newH = Math.max(20, it.startH * sy);
        const u = { x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) };
        if (it.kind === 'image') imgUpdates.set(it.id, u);
        else txtUpdates.set(it.id, u);
      }
      if (imgUpdates.size > 0) {
        setPageImages((prev) =>
          prev.map((im) => {
            const u = imgUpdates.get(im.id);
            return u ? { ...im, x_in_page: u.x, y_in_page: u.y, width: u.w, height: u.h } : im;
          }),
        );
      }
      if (txtUpdates.size > 0) {
        setTexts((prev) =>
          prev.map((tt) => {
            const u = txtUpdates.get(tt.id);
            return u ? { ...tt, x_in_page: u.x, y_in_page: u.y, width: u.w, height: u.h } : tt;
          }),
        );
      }
    }
    async function onUp() {
      setMultiResize(null);
      setGuideLines([]);
      const sxFinal = last.w / startBbox.w;
      const syFinal = last.h / startBbox.h;
      const calls = [];
      const moves = [];
      for (const it of items) {
        const relX = it.startX - startBbox.x;
        const relY = it.startY - startBbox.y;
        const fx = Math.round(last.x + relX * sxFinal);
        const fy = Math.round(last.y + relY * syFinal);
        const fw = Math.max(20, Math.round(it.startW * sxFinal));
        const fh = Math.max(20, Math.round(it.startH * syFinal));
        const prevX = Math.round(it.startX);
        const prevY = Math.round(it.startY);
        const prevW = Math.round(it.startW);
        const prevH = Math.round(it.startH);
        const table = it.kind === 'image' ? 'design_files' : 'text_elements';
        calls.push(
          supabase.from(table)
            .update({ x_in_page: fx, y_in_page: fy, width: fw, height: fh })
            .eq('id', it.id),
        );
        if (prevX !== fx || prevY !== fy || prevW !== fw || prevH !== fh) {
          moves.push({ kind: it.kind, id: it.id, prev: { x: prevX, y: prevY, w: prevW, h: prevH }, next: { x: fx, y: fy, w: fw, h: fh } });
        }
      }
      if (calls.length > 0) {
        const results = await Promise.all(calls);
        const failed = results.filter((r) => r.error);
        if (failed.length > 0) {
          // eslint-disable-next-line no-console
          console.warn('[multi resize] some persists failed', failed);
        }
      }
      if (moves.length > 0) pushUndo({ type: 'GROUP_RESIZE', moves });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [multiResize, zoom]);

  // Custom SVG cursor for marker mode — speech-bubble (white fill, thick cyan outline via SVG stroke).
  // Hotspot: (0, 30) → bottom-left tail tip.
  const MARKER_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="30" viewBox="0 0 70 65" fill="none">' +
    '<path d="M61 1C65.4183 1 69 4.58172 69 9V42C69 46.4183 65.4183 50 61 50H15.9268L1 62V9C1 4.58172 4.58172 1 9 1H61Z" fill="white" stroke="#06B6D4" stroke-width="4" stroke-linejoin="round"/>' +
    '</svg>'
  )}") 0 30, crosshair`;

  function viewportCursor() {
    if (isPanning) return 'grabbing';
    if (handTool || spaceHeld) return 'grab';
    if (markerMode) return MARKER_CURSOR;
    if (textMode) return 'text';
    return 'default';
  }

  useEffect(() => {
    if (!isReadOnlySprint) return;
    clearPendingDraft();
    setMarkerMode(false);
  }, [isReadOnlySprint]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const onNativeWheel = (e) => {
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // Cursor-anchored zoom: keep the content point under the cursor fixed.
        e.preventDefault();
        // Smooth exponential step proportional to deltaY.
        const factor = Math.exp(-e.deltaY * 0.0015);
        setZoom((prevZ) => {
          const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZ * factor));
          if (Math.abs(nz - prevZ) < 1e-9) return prevZ;
          const ratio = nz / prevZ;
          const cx = e.clientX - rect.left - rect.width / 2;
          const cy = e.clientY - rect.top - rect.height / 2;
          // Correct anchored formula: newPan = pan*ratio - cursor*(ratio-1)
          setPanX((px) => px * ratio - cx * (ratio - 1));
          setPanY((py) => py * ratio - cy * (ratio - 1));
          return nz;
        });
      } else {
        // Plain wheel = vertical scroll. Spec says horizontal pan is scrollbar-only,
        // so in horizontal mode we ignore the deltaX path and shift-axis-swap too.
        e.preventDefault();
        const hor = !!isHorizontalRef.current;
        const dx = hor ? 0 : (e.shiftKey ? e.deltaY : e.deltaX);
        const dy = hor ? e.deltaY : (e.shiftKey ? 0 : e.deltaY);
        const pgC = pageCountRef.current || 0;
        const z = zoomRef.current || 1;
        const viewH = rect.height || 0;
        // Vertical mode: pages stack so contentH = total stack. Horizontal mode: pages lay
        // side-by-side so the Y extent is just one page tall.
        const contentH = hor
          ? A4_H
          : (pgC > 0 ? pgC * A4_H + Math.max(0, pgC - 1) * PAGE_GAP : 0);
        const scaledH = contentH * z;
        const overflowY = Math.max(0, scaledH - viewH);
        const extraY = (A4_H / 3) * z;
        const maxPanY = overflowY / 2 + extraY;
        const minPanY = -overflowY / 2 - extraY;
        if (dx) setPanX((px) => px - dx);
        if (dy) {
          setPanY((py) => {
            const next = py - dy;
            if (overflowY <= 0) return py;
            return Math.max(minPanY, Math.min(maxPanY, next));
          });
        }
      }
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // Track viewport size for the scrollbar.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const sync = () => {
      const r = el.getBoundingClientRect();
      setViewportSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    sync();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Scrollbar thumb drag → update panX or panY depending on the bar that owns the drag.
  useEffect(() => {
    if (!scrollbarDrag) return undefined;
    function onMove(e) {
      if (scrollbarDrag.axis === 'x') {
        const { startMouseX, startThumbLeft, maxThumbLeft, maxPanX, minPanX } = scrollbarDrag;
        const dx = e.clientX - startMouseX;
        const newThumbLeft = Math.max(0, Math.min(maxThumbLeft, startThumbLeft + dx));
        const tt = maxThumbLeft > 0 ? newThumbLeft / maxThumbLeft : 0;
        const newPanX = maxPanX - tt * (maxPanX - minPanX);
        setPanX(newPanX);
      } else {
        const { startMouseY, startThumbTop, maxThumbTop, maxPanY, minPanY } = scrollbarDrag;
        const dy = e.clientY - startMouseY;
        const newThumbTop = Math.max(0, Math.min(maxThumbTop, startThumbTop + dy));
        const tt = maxThumbTop > 0 ? newThumbTop / maxThumbTop : 0;
        const newPanY = maxPanY - tt * (maxPanY - minPanY);
        setPanY(newPanY);
      }
    }
    function onUp() {
      setScrollbarDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [scrollbarDrag]);

  // Initial view: center the first page horizontally and put its top 80px below the viewport top.
  // Runs once per sprint, after pages are loaded and the viewport has been measured.
  useEffect(() => {
    const sprintKey = effectiveViewingSprint;
    if (sprintKey == null || sprintKey === '') return;
    if (initialPanSetForSprintRef.current === sprintKey) return;
    if (!pages || pages.length === 0) return;
    // Stale-pages guard: when the user switches sprints, this effect can fire once with
    // the *previous* sprint's pages still in state (before the load effect replaces them).
    // Detect the mismatch and bail so the next render with fresh pages does the real work.
    if (Number(pages[0]?.sprint_number) !== Number(effectiveViewingSprint)) return;
    const viewH = viewportSize.h || (viewportRef.current?.getBoundingClientRect().height || 0);
    if (!viewH || viewH <= 0) return;
    // Drive panY from a single A4 page height (not the full stack). With
    // transform-origin: center center + flex-centered parent, the first page's screen
    // top = viewH/2 + panY - (A4_H*zoom)/2. Solving for top = 80 (PAGE_SCROLL_MARGIN)
    // gives a panY independent of page count — so 2-, 3-, N-page sprints all land the
    // first page at the same 80 px below the viewport top.
    const scaledH = A4_H * zoom;
    const targetPanY = PAGE_SCROLL_MARGIN - viewH / 2 + scaledH / 2;
    setPanX(0);
    setPanY(targetPanY);
    initialPanSetForSprintRef.current = sprintKey;
  }, [pages, viewportSize.h, zoom, effectiveViewingSprint]);

  function onViewportMouseDown(e) {
    if (e.button !== 0) return;
    if (!handTool && !spaceHeld) return;
    if (e.target.closest && e.target.closest('[data-marker-root]')) return;
    if (e.target.closest && e.target.closest('button')) return;
    panSession.current = {
      x0: e.clientX,
      y0: e.clientY,
      px0: panXRef.current,
      py0: panYRef.current,
      moved: false,
    };
    setIsPanning(true);
    e.preventDefault();
  }

  function zoomByStep(zoomIn) {
    const factor = zoomIn ? 1.15 : 1 / 1.15;
    setZoom((prevZ) => {
      const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZ * factor));
      if (Math.abs(nz - prevZ) < 1e-9) return prevZ;
      const r = nz / prevZ;
      setPanX((p) => p * r);
      setPanY((p) => p * r);
      return nz;
    });
  }

  async function deleteMarkerById(markerId) {
    if (!markerId || markerId === '__draft_marker__') return;
    const { error } = await supabase.from('markers').delete().eq('id', markerId);
    if (error) {
      console.error('[BlueprintViewer] Failed to delete marker', { markerId, error });
      return;
    }
    setDesignMarkers((prev) => prev.filter((m) => String(m.id) !== String(markerId)));
  }

  function clearPendingDraft() {
    setPendingMarker(null);
    setDraftNote('');
  }

  function toggleMarkerMode() {
    if (markerMode) {
      clearPendingDraft();
      setMarkerMode(false);
      setSelectMode(true);
    } else {
      if (isReadOnlySprint) {
        window.alert('마커는 현재 스프린트에서만 추가할 수 있습니다');
        return;
      }
      const hasAnyImage =
        String(designImageUrl || '').trim() !== '' || pageImages.length > 0;
      if (!hasAnyImage) {
        window.alert('먼저 디자인 이미지를 업로드해 주세요.');
        return;
      }
      setHandTool(false);
      setSelectMode(false);
      setTextMode(false);
      setSelectedTextId(null);
      setSelectedImageId(null);
      setMarkerMode(true);
    }
  }

  function toggleHandTool() {
    setHandTool((h) => {
      const next = !h;
      if (next) {
        if (markerMode) {
          clearPendingDraft();
          setMarkerMode(false);
        }
        setTextMode(false);
        setSelectMode(false);
        setSelectedTextId(null);
        setSelectedImageId(null);
      } else {
        setSelectMode(true);
      }
      return next;
    });
  }

  function toggleSelectMode() {
    setSelectMode((s) => {
      const next = !s;
      if (next) {
        if (markerMode) {
          clearPendingDraft();
          setMarkerMode(false);
        }
        setHandTool(false);
        setTextMode(false);
      }
      return next;
    });
  }

  function toggleTextMode() {
    setTextMode((v) => {
      const next = !v;
      if (next) {
        if (markerMode) {
          clearPendingDraft();
          setMarkerMode(false);
        }
        setHandTool(false);
        setSelectMode(false);
      } else {
        setSelectMode(true);
      }
      return next;
    });
  }

  function handleCanvasClick(e) {
    if (skipNextMarkerClick.current) {
      skipNextMarkerClick.current = false;
      return;
    }
    const hasAnyImage =
      String(designImageUrl || '').trim() !== '' || pageImages.length > 0;
    if (!hasAnyImage) return;
    if (!markerMode || handTool) return;
    if (isReadOnlySprint) return;
    if (e.target.closest('[data-marker-root]')) return;
    if (!projectId) return;
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingMarker({ xPct, yPct, pageId: selectedPageId || null });
    setDraftNote('');
    setActiveMarkerId(null); // any open view popup closes when starting a new pending marker

  }

  async function confirmPendingNote() {
    if (!pendingMarker || !projectId) return;
    const text = draftNote.trim();
    // Guard: empty input → cancel without inserting a marker.
    if (!text) {
      clearPendingDraft();
      return;
    }
    const insertPayload = {
      project_id: projectId,
      x_pct: pendingMarker.xPct,
      y_pct: pendingMarker.yPct,
      sprint_number: Number(effectiveViewingSprint),
      note: text,
      created_by: currentUserEmail || null,
      page_id: pendingMarker.pageId || selectedPageId || null,
    };
    const queryDescription = {
      table: 'markers',
      operation: 'insert',
      payload: insertPayload,
      pseudoSql:
        'insert into markers (project_id, x_pct, y_pct, sprint_number, note, created_by) ' +
        'values ($1, $2, $3, $4, $5, $6) returning *; ' +
        `-- payload=${JSON.stringify(insertPayload)}`,
    };
    if (import.meta.env.DEV) {
      console.log('[BlueprintViewer] Inserting marker (request)', queryDescription);
    }

    const { data, error, status, statusText } = await supabase
      .from('markers')
      .insert(insertPayload)
      .select('id, project_id, sprint_number, x_pct, y_pct, note, created_by, created_at, page_id')
      .single();

    if (import.meta.env.DEV) {
      console.log('[BlueprintViewer] Inserting marker (response)', {
        query: queryDescription,
        data,
        error,
        status,
        statusText,
      });
    }

    if (error) {
      console.error('[BlueprintViewer] Failed to insert marker', {
        error,
        query: queryDescription,
      });
      return;
    }

    const inserted = normalizeMarkerRow(data);
    if (inserted) {
      setDesignMarkers((prev) =>
        prev.some((m) => String(m.id) === String(inserted.id)) ? prev : [...prev, inserted],
      );
    }
    clearPendingDraft();
  }

  function cancelPending() {
    clearPendingDraft();
  }

  const canvasCursor = viewportCursor();

  // Live preview of items that the in-progress marquee would select on mouseUp.
  // Returns a Set of keys ('image:<id>' / 'text:<id>'), or null when no marquee is active.
  const pendingSelection = useMemo(() => {
    if (!marqueeBox) return null;
    const x = Math.min(marqueeBox.x0, marqueeBox.x1);
    const y = Math.min(marqueeBox.y0, marqueeBox.y1);
    const w = Math.abs(marqueeBox.x1 - marqueeBox.x0);
    const h = Math.abs(marqueeBox.y1 - marqueeBox.y0);
    if (w <= 1 && h <= 1) return null;
    const marquee = { x, y, w, h };
    const result = new Set();
    const myEmail = String(currentUserEmail || '').trim().toLowerCase();
    for (const im of pageImages) {
      if (im.page_id !== marqueeBox.pageId) continue;
      // Exclude items locked by another user from marquee selection.
      const lock = lockedElements[`image:${im.id}`];
      if (lock && lock.userId !== myEmail) continue;
      if (rectsIntersect(marquee, bboxOfImage(im))) result.add(`image:${im.id}`);
    }
    for (const tt of texts) {
      if (tt.page_id !== marqueeBox.pageId) continue;
      const lock = lockedElements[`text:${tt.id}`];
      if (lock && lock.userId !== myEmail) continue;
      if (rectsIntersect(marquee, bboxOfText(tt))) result.add(`text:${tt.id}`);
    }
    return result;
  }, [marqueeBox, pageImages, texts, lockedElements, currentUserEmail]);

  return (
    <div
      style={{
        flex: 1,
        background: '#F8FAFC',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {/* Shared hidden measurer for text-resize content clamping.
         Lives outside the zoomed canvas so its layout is unaffected. */}
      <div
        ref={textResizeMeasurerRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          left: -100000,
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
          boxSizing: 'border-box',
          padding: '2px 4px',
          lineHeight: 1.25,
          fontFamily: 'inherit',
        }}
      />
      <div
        ref={viewportRef}
        onMouseDown={onViewportMouseDown}
        onDragEnter={(e) => {
          // Only react to file drags (ignore in-app element drags).
          const types = Array.from(e.dataTransfer?.types || []);
          if (!types.includes('Files')) return;
          e.preventDefault();
          dragDepthRef.current += 1;
          if (!isDragOver) setIsDragOver(true);
        }}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer?.types || []);
          if (!types.includes('Files')) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          const types = Array.from(e.dataTransfer?.types || []);
          if (!types.includes('Files')) return;
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setIsDragOver(false);
        }}
        onDrop={async (e) => {
          const types = Array.from(e.dataTransfer?.types || []);
          if (!types.includes('Files')) return;
          e.preventDefault();
          dragDepthRef.current = 0;
          setIsDragOver(false);
          const all = Array.from(e.dataTransfer?.files || []);
          const imageFiles = all.filter((f) => typeof f.type === 'string' && f.type.startsWith('image/'));
          if (imageFiles.length === 0) return;
          if (typeof onDropImageFiles !== 'function') return;
          // Resolve which page the drop landed on by hit-testing each rendered page rect.
          // Page rects are in screen space, scaled by `zoom`, so divide back to get page-local px.
          let dropPageId = null;
          let dropX = null;
          let dropY = null;
          for (const page of pages) {
            const el = pageRefsMap.current?.[page.id];
            if (!el) continue;
            const r = el.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
              dropPageId = page.id;
              dropX = (e.clientX - r.left) / (zoom || 1);
              dropY = (e.clientY - r.top) / (zoom || 1);
              break;
            }
          }
          // Fallback: no hit (dropped in the canvas margin) → currently selected page,
          // or the first page in this sprint, with a default top-left offset.
          if (dropPageId == null) {
            dropPageId = selectedPageId || pages[0]?.id || null;
            dropX = 20;
            dropY = 20;
          } else {
            // Clamp inside page bounds with a small safety pad so the image isn't placed
            // right at the edge (default image is 460x340; keep top-left at least 4 px in).
            const DEFAULT_IMG_W = 460;
            const DEFAULT_IMG_H = 340;
            dropX = Math.max(4, Math.min(A4_W - DEFAULT_IMG_W, Math.round(dropX)));
            dropY = Math.max(4, Math.min(A4_H - DEFAULT_IMG_H, Math.round(dropY)));
            // If clamp produced negatives (page smaller than default image), just inset by 4.
            if (dropX < 0) dropX = 4;
            if (dropY < 0) dropY = 4;
          }
          await onDropImageFiles(imageFiles, { pageId: dropPageId, xInPage: dropX, yInPage: dropY });
        }}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: viewportCursor(),
        }}
      >
        {/* Background grid / dots — panned & zoomed with canvas */}
        {gridMode !== 'none' ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              backgroundColor: 'transparent',
              ...(gridMode === 'grid'
                ? {
                    backgroundImage: `
                      linear-gradient(to right, rgba(31,41,55,0.06) 0.8px, transparent 0.8px),
                      linear-gradient(to bottom, rgba(31,41,55,0.06) 0.8px, transparent 0.8px),
                      linear-gradient(to right, rgba(31,41,55,0.035) 0.5px, transparent 0.5px),
                      linear-gradient(to bottom, rgba(31,41,55,0.035) 0.5px, transparent 0.5px)
                    `,
                    backgroundSize: `${100 * zoom}px ${100 * zoom}px, ${100 * zoom}px ${100 * zoom}px, ${20 * zoom}px ${20 * zoom}px, ${20 * zoom}px ${20 * zoom}px`,
                    backgroundPosition: `${panX}px ${panY}px, ${panX}px ${panY}px, ${panX}px ${panY}px, ${panX}px ${panY}px`,
                  }
                : {
                    backgroundImage: `radial-gradient(circle, rgba(31,41,55,0.10) ${0.9 * Math.max(0.4, Math.min(1.2, zoom))}px, transparent ${0.9 * Math.max(0.4, Math.min(1.2, zoom)) + 0.5}px)`,
                    backgroundSize: `${22 * zoom}px ${22 * zoom}px`,
                    backgroundPosition: `${panX}px ${panY}px`,
                  }),
            }}
          />
        ) : null}
        <div
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center center',
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            alignItems: 'center',
            gap: PAGE_GAP,
            flexShrink: 0,
          }}
        >
          {pages.map((page, pageIdx) => {
            const isSel = page.id === selectedPageId;
            const isFirstPage = pageIdx === 0;
            const isLastPage = pageIdx === pages.length - 1;
            const imagesHere = pageImages.filter((im) => im.page_id === page.id);
            const myEmail = String(currentUserEmail || '').trim().toLowerCase();
            return (
              <div
                key={page.id}
                style={{ position: 'relative', width: A4_W, height: A4_H }}
                onMouseDown={(e) => {
                  if (e.target.closest?.('[data-page-plus]')) return;
                  if (e.target.closest?.('[data-marker-root]')) return;
                  setSelectedPageId(page.id);
                }}
                onMouseMove={(e) => {
                  // Broadcast cursor position so other users can see it. Coords are page-local,
                  // already untransformed (the rect we measure is the post-scale screen rect,
                  // so dividing by zoom brings us back to canvas units).
                  if (!presenceChannelRef.current) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const cx = (e.clientX - rect.left) / zoom;
                  const cy = (e.clientY - rect.top) / zoom;
                  // Skip if outside the page area (mouse over kebab/label etc with negative coords).
                  if (cx < 0 || cy < 0 || cx > A4_W || cy > A4_H) return;
                  broadcastCursor(page.id, cx, cy);
                }}
                onMouseLeave={() => {
                  // Tell peers our cursor left this page so they can hide it. We send pageId=null
                  // as a sentinel — listeners delete the entry. Use the immediate send path
                  // (not throttled) so the disappearance feels instant.
                  const ch = presenceChannelRef.current;
                  const email = String(currentUserEmail || '').trim().toLowerCase();
                  if (!ch || !email) return;
                  ch.send({
                    type: 'broadcast',
                    event: 'cursor',
                    payload: { userId: email, pageId: null, x: null, y: null },
                  });
                }}
              >
                {/* Page label (top-left, outside frame) + kebab menu */}
                <div
                  style={{
                    position: 'absolute',
                    top: -28,
                    left: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: isSel ? C.emerald : C.fg3,
                    pointerEvents: 'auto',
                    userSelect: 'none',
                  }}
                >
                  <Icon name="file-text" size={13} color={isSel ? C.emerald : C.fg3} />
                  {artboardEditingId === page.id ? (
                    <input
                      ref={artboardInputRef}
                      autoFocus
                      value={artboardEditDraft}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setArtboardEditDraft(e.target.value)}
                      onBlur={commitArtboardEdit}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitArtboardEdit();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setArtboardEditingId(null);
                          setArtboardEditDraft('');
                        }
                      }}
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: C.fg1,
                        background: '#fff',
                        border: `1px solid ${C.border}`,
                        borderRadius: 3,
                        padding: '2px 6px',
                        fontFamily: 'inherit',
                        outline: 'none',
                        width: 160,
                      }}
                    />
                  ) : (
                    <span
                      title="Click to rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        startArtboardEdit(page);
                      }}
                      style={{ cursor: 'text' }}
                    >
                      {page.title || 'Untitled'}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label="Page options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPageContextMenu({ open: true, x: e.clientX, y: e.clientY, pageId: page.id, source: 'artboard' });
                    }}
                    style={{
                      width: 18,
                      height: 18,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: C.fg3,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon name="more-vertical" size={13} color={C.fg3} />
                  </button>
                </div>

                {/* Top/bottom + buttons — only on first/last page */}
                {[
                  isFirstPage
                    ? { pos: isHorizontal ? 'left' : 'top',
                        style: isHorizontal
                          ? { left: -52, top: '50%', transform: 'translateY(-50%)' }
                          : { top: -52, left: '50%', transform: 'translateX(-50%)' },
                        before: true }
                    : null,
                  isLastPage
                    ? { pos: isHorizontal ? 'right' : 'bottom',
                        style: isHorizontal
                          ? { right: -52, top: '50%', transform: 'translateY(-50%)' }
                          : { bottom: -52, left: '50%', transform: 'translateX(-50%)' },
                        before: false }
                    : null,
                ].filter(Boolean).map((b) => (
                  <button
                    key={b.pos}
                    type="button"
                    data-page-plus={b.pos}
                    title={`Add page ${
                      b.pos === 'top' ? 'above'
                      : b.pos === 'bottom' ? 'below'
                      : b.pos === 'left' ? 'before'
                      : 'after'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      addPage(page.page_number, b.before);
                    }}
                    style={{
                      position: 'absolute',
                      ...b.style,
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      border: `1px solid ${C.borderSubtle}`,
                      background: '#fff',
                      color: C.fg3,
                      cursor: 'pointer',
                      fontSize: 22,
                      lineHeight: 1,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0,
                      opacity: 0.28,
                      transition: 'opacity 180ms ease, box-shadow 180ms ease, color 180ms ease, transform 180ms ease',
                      boxShadow: 'none',
                      fontFamily: 'inherit',
                      zIndex: 20,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.opacity = '1';
                      e.currentTarget.style.boxShadow = '0 6px 14px rgba(30,42,53,0.16)';
                      e.currentTarget.style.color = C.emerald;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '0.28';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.color = C.fg3;
                    }}
                  >
                    +
                  </button>
                ))}

                {/* Page frame (A4) */}
                <div
                  ref={(el) => {
                    if (isSel) canvasRef.current = el;
                    pageRefsMap.current[page.id] = el;
                  }}
                  onMouseDown={(e) => {
                    // Marquee start: select mode, empty space, no special modifier path
                    if (e.button !== 0) return;
                    if (!selectMode) return;
                    if (textMode || markerMode || handTool || spaceHeld) return;
                    if (e.target.closest?.('[data-text-root]')) return;
                    if (e.target.closest?.('[data-image-root]')) return;
                    if (e.target.closest?.('[data-marker-root]')) return;
                    if (e.target.closest?.('[data-image-handle]')) return;
                    if (e.target.closest?.('[data-page-plus]')) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / zoom;
                    const y = (e.clientY - rect.top) / zoom;
                    if (!e.shiftKey) clearAllSelection();
                    setMarqueeBox({ pageId: page.id, x0: x, y0: y, x1: x, y1: y });
                  }}
                  onClick={(e) => {
                    if (textMode) {
                      if (e.target.closest?.('[data-text-root]')) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const xRaw = (e.clientX - rect.left) / zoom;
                      const yRaw = (e.clientY - rect.top) / zoom;
                      (async () => {
                        const row = await createTextOnPage(page, xRaw, yRaw);
                        if (!row) return;
                        setSelectedTextId(row.id);
                        setTextEditingId(row.id);
                        setTextEditDraft('');
                        setSelectedPageId(page.id);
                      })();
                      return;
                    }
                    // Clicking empty area (not on text/image/marker) clears the text/image selection.
                    const onText = !!e.target.closest?.('[data-text-root]');
                    const onMarker = !!e.target.closest?.('[data-marker-root]');
                    const onImage = !!e.target.closest?.('[data-image-root]');
                    if (isSel) {
                      handleCanvasClick(e);
                      if (selectMode && !onText && !onMarker && !onImage) {
                        if (selectedTextId) setSelectedTextId(null);
                        if (selectedImageId) setSelectedImageId(null);
                      }
                    } else {
                      // Click on a non-selected page in select mode: clear selections.
                      if (selectMode) {
                        if (selectedTextId) setSelectedTextId(null);
                        if (selectedImageId) setSelectedImageId(null);
                      }
                    }
                  }}
                  style={{
                    position: 'relative',
                    width: A4_W,
                    height: A4_H,
                    background: '#fff',
                    borderRadius: 2,
                    border: `1px solid ${isSel ? C.emerald : C.borderSubtle}`,
                    boxShadow: '0 4px 16px rgba(30,42,53,0.10)',
                    overflow: 'hidden',
                    cursor: textMode ? 'text' : (isSel ? canvasCursor : 'default'),
                  }}
                >
                  {imagesHere.map((im) => {
                    const isImgSel = isItemSelected('image', im.id);
                    const isImgPending = pendingSelection?.has(`image:${im.id}`) ?? false;
                    const iw = Number(im.width) || IMG_DEFAULT_W;
                    const ih = Number(im.height) || IMG_DEFAULT_H;
                    const ix = Number(im.x_in_page) || 0;
                    const iy = Number(im.y_in_page) || 0;
                    const isCropping = !!cropState && cropState.imgId === im.id;
                    const imgLock = lockedElements[`image:${im.id}`];
                    const lockedByOtherImg = !!imgLock && imgLock.userId !== String(currentUserEmail || '').trim().toLowerCase();
                    const imgLockColor = imgLock ? colorFor(imgLock.userId) : null;
                    const showResizeHandles = selectedImageId === im.id && multiSelection.size === 0 && !isCropping && !lockedByOtherImg;
                    return (
                      <div
                        key={im.id}
                        data-image-root
                        style={{
                          position: 'absolute',
                          left: ix,
                          top: iy,
                          width: iw,
                          height: ih,
                          zIndex: isImgSel ? 27 : 24,
                          cursor: lockedByOtherImg ? 'not-allowed' : undefined,
                          // Explicit visible so the corner/side handles drawn at -50%/100%
                          // can spill outside the image edge instead of being clipped.
                          overflow: 'visible',
                        }}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          if (handTool || spaceHeld || markerMode || textMode) return;
                          if (!selectMode) return;
                          if (e.target.closest?.('[data-image-handle]')) return; // handle owns the event
                          // Lock guard: if someone else has it, swallow the event without selecting.
                          if (lockedByOtherImg) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          const key = `image:${im.id}`;
                          if (e.shiftKey) {
                            toggleInMultiSelection('image', im.id);
                            return;
                          }
                          // Decide drag mode: if part of an existing multi-selection, group drag; else single.
                          const current = getAllSelectedKeys();
                          if (current.has(key) && current.size > 1) {
                            const items = [];
                            for (const k of current) {
                              const sep = k.indexOf(':');
                              const kind = k.slice(0, sep);
                              const id = k.slice(sep + 1);
                              if (kind === 'image') {
                                const r = pageImages.find((p2) => p2.id === id);
                                if (r) items.push({ kind, id, startX: Number(r.x_in_page) || 0, startY: Number(r.y_in_page) || 0, startW: Number(r.width) || IMG_DEFAULT_W, startH: Number(r.height) || IMG_DEFAULT_H });
                              } else if (kind === 'text') {
                                const r = texts.find((p2) => p2.id === id);
                                if (r) items.push({ kind, id, startX: Number(r.x_in_page) || 0, startY: Number(r.y_in_page) || 0, startW: Number(r.width) || 200, startH: Number(r.height) || 60 });
                              }
                            }
                            setGroupDrag({ pageId: page.id, startMouseX: e.clientX, startMouseY: e.clientY, items });
                          } else {
                            setSelectedImageId(im.id);
                            setSelectedTextId(null);
                            setMultiSelection(new Set());
                            setImageDrag({
                              imgId: im.id,
                              pageId: page.id,
                              startMouseX: e.clientX,
                              startMouseY: e.clientY,
                              startX: ix,
                              startY: iy,
                              startW: iw,
                              startH: ih,
                            });
                          }
                        }}
                        onClick={(e) => {
                          if (e.shiftKey) return; // handled in mousedown
                          if (lockedByOtherImg) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          if (multiSelection.size > 0 && multiSelection.has(`image:${im.id}`)) return;
                          setSelectedImageId(im.id);
                          setSelectedTextId(null);
                          setMultiSelection(new Set());
                        }}
                        onContextMenu={(e) => {
                          if (e.target.closest?.('[data-marker-root]')) return;
                          if (lockedByOtherImg) { e.preventDefault(); e.stopPropagation(); return; }
                          e.preventDefault();
                          e.stopPropagation();
                          setImageMenu({ open: true, x: e.clientX, y: e.clientY, imgId: im.id });
                        }}
                      >
                        <img
                          src={im.file_url}
                          alt="Design"
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            background: '#fff',
                            border: lockedByOtherImg
                              ? `2px solid ${imgLockColor}`
                              : isImgPending
                                ? '2px solid #3b82f6'
                                : isImgSel
                                  ? `2px solid ${C.emerald}`
                                  : `1px solid ${C.borderSubtle}`,
                            borderRadius: 4,
                            boxShadow: '0 4px 12px rgba(30,42,53,0.10)',
                            cursor: lockedByOtherImg
                              ? 'not-allowed'
                              : ((handTool || spaceHeld) ? 'grab' : 'move'),
                            userSelect: 'none',
                            display: 'block',
                            boxSizing: 'border-box',
                          }}
                        />
                        {lockedByOtherImg ? (
                          <div
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: -20,
                              left: 0,
                              background: imgLockColor,
                              color: '#fff',
                              padding: '1px 6px',
                              borderRadius: 8,
                              fontSize: 10,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              pointerEvents: 'none',
                              zIndex: 28,
                              fontFamily: 'inherit',
                            }}
                          >
                            {imgLock.userName}
                          </div>
                        ) : null}
                        {showResizeHandles ? (
                          <>
                            {/* Visible corner dots — nw / ne / sw / se */}
                            {['nw', 'ne', 'sw', 'se'].map((corner) => {
                              const pos = {
                                nw: { left: 0,      top: 0,      cursor: 'nw-resize' },
                                ne: { left: '100%', top: 0,      cursor: 'ne-resize' },
                                sw: { left: 0,      top: '100%', cursor: 'sw-resize' },
                                se: { left: '100%', top: '100%', cursor: 'se-resize' },
                              }[corner];
                              return (
                                <div
                                  key={corner}
                                  data-image-handle={corner}
                                  onMouseDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setImageResize({
                                      imgId: im.id,
                                      corner,
                                      startMouseX: e.clientX,
                                      startMouseY: e.clientY,
                                      startW: iw,
                                      startH: ih,
                                      startImgX: ix,
                                      startImgY: iy,
                                    });
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: pos.left,
                                    top: pos.top,
                                    transform: 'translate(-50%, -50%)',
                                    cursor: pos.cursor,
                                    zIndex: 30,
                                    width: 11,
                                    height: 11,
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    border: '2px solid #fff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                  }}
                                />
                              );
                            })}
                            {/* Invisible edge drag bands — top / bottom / left / right.
                               Replaces the old n/s/w/e visible side handles. Drag a band to
                               resize the corresponding edge; the existing imageResize logic
                               (snap, modifiers, clamps) handles everything downstream. */}
                            {[
                              { corner: 'n', style: { top: 0,    left: 0, right: 0, height: 6 }, cursor: 'n-resize' },
                              { corner: 's', style: { bottom: 0, left: 0, right: 0, height: 6 }, cursor: 's-resize' },
                              { corner: 'w', style: { top: 0, bottom: 0, left: 0,  width: 6 },  cursor: 'w-resize' },
                              { corner: 'e', style: { top: 0, bottom: 0, right: 0, width: 6 },  cursor: 'e-resize' },
                            ].map((band) => (
                              <div
                                key={`edge-${band.corner}`}
                                data-image-handle={band.corner}
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setImageResize({
                                    imgId: im.id,
                                    corner: band.corner,
                                    startMouseX: e.clientX,
                                    startMouseY: e.clientY,
                                    startW: iw,
                                    startH: ih,
                                    startImgX: ix,
                                    startImgY: iy,
                                  });
                                }}
                                style={{
                                  position: 'absolute',
                                  ...band.style,
                                  cursor: band.cursor,
                                  background: 'transparent',
                                  zIndex: 29,
                                }}
                              />
                            ))}
                          </>
                        ) : null}
                        {/* Crop overlay — dark backdrop with a transparent crop rect, draggable corner handles. */}
                        {isCropping ? (
                          <div
                            data-crop-overlay
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none' }}
                          >
                            {/* Four dark strips around the crop rect. */}
                            {(() => {
                              const cx = Math.max(0, Math.min(iw, cropState.x));
                              const cy = Math.max(0, Math.min(ih, cropState.y));
                              const cw = Math.max(0, Math.min(iw - cx, cropState.w));
                              const ch = Math.max(0, Math.min(ih - cy, cropState.h));
                              const strip = { position: 'absolute', background: 'rgba(0,0,0,0.45)', pointerEvents: 'none' };
                              return (
                                <>
                                  <div style={{ ...strip, left: 0, top: 0, width: '100%', height: cy }} />
                                  <div style={{ ...strip, left: 0, top: cy + ch, width: '100%', bottom: 0 }} />
                                  <div style={{ ...strip, left: 0, top: cy, width: cx, height: ch }} />
                                  <div style={{ ...strip, left: cx + cw, top: cy, right: 0, height: ch }} />
                                </>
                              );
                            })()}
                            {/* Crop rect (draggable body) */}
                            <div
                              onMouseDown={(e) => {
                                if (e.button !== 0) return;
                                e.stopPropagation();
                                e.preventDefault();
                                setCropDrag({
                                  imgId: im.id,
                                  corner: 'move',
                                  startMouseX: e.clientX,
                                  startMouseY: e.clientY,
                                  startX: cropState.x,
                                  startY: cropState.y,
                                  startW: cropState.w,
                                  startH: cropState.h,
                                });
                              }}
                              style={{
                                position: 'absolute',
                                left: cropState.x,
                                top: cropState.y,
                                width: cropState.w,
                                height: cropState.h,
                                border: '1px dashed #ffffff',
                                boxShadow: '0 0 0 1px rgba(0,0,0,0.5) inset',
                                pointerEvents: 'auto',
                                cursor: 'move',
                              }}
                            />
                            {/* Four corner handles for the crop rect */}
                            {['nw', 'ne', 'sw', 'se'].map((corner) => {
                              const at = {
                                nw: { left: cropState.x, top: cropState.y, cursor: 'nw-resize' },
                                ne: { left: cropState.x + cropState.w, top: cropState.y, cursor: 'ne-resize' },
                                sw: { left: cropState.x, top: cropState.y + cropState.h, cursor: 'sw-resize' },
                                se: { left: cropState.x + cropState.w, top: cropState.y + cropState.h, cursor: 'se-resize' },
                              }[corner];
                              return (
                                <div
                                  key={corner}
                                  onMouseDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setCropDrag({
                                      imgId: im.id,
                                      corner,
                                      startMouseX: e.clientX,
                                      startMouseY: e.clientY,
                                      startX: cropState.x,
                                      startY: cropState.y,
                                      startW: cropState.w,
                                      startH: cropState.h,
                                    });
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: at.left,
                                    top: at.top,
                                    transform: 'translate(-50%, -50%)',
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    border: '2px solid #fff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                                    cursor: at.cursor,
                                    pointerEvents: 'auto',
                                  }}
                                />
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {/* Text elements for this page */}
                  {texts.filter((tt) => tt.page_id === page.id).map((tt) => {
                    const isTextEditing = textEditingId === tt.id;
                    const isTextSelected = isItemSelected('text', tt.id);
                    const isTextPending = pendingSelection?.has(`text:${tt.id}`) ?? false;
                    const txLock = lockedElements[`text:${tt.id}`];
                    const lockedByOtherTx = !!txLock && txLock.userId !== String(currentUserEmail || '').trim().toLowerCase();
                    const txLockColor = txLock ? colorFor(txLock.userId) : null;
                    return (
                      <div
                        key={tt.id}
                        ref={(el) => {
                          if (el) textRefsMap.current[tt.id] = el;
                          else delete textRefsMap.current[tt.id];
                        }}
                        data-text-root
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          if (handTool || spaceHeld || markerMode || textMode) return;
                          if (!selectMode) return;
                          if (isTextEditing) return;
                          if (lockedByOtherTx) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          setSelectedPageId(page.id);
                          const key = `text:${tt.id}`;
                          if (e.shiftKey) {
                            toggleInMultiSelection('text', tt.id);
                            return;
                          }
                          const current = getAllSelectedKeys();
                          if (current.has(key) && current.size > 1) {
                            const items = [];
                            for (const k of current) {
                              const sep = k.indexOf(':');
                              const kind = k.slice(0, sep);
                              const id = k.slice(sep + 1);
                              if (kind === 'image') {
                                const r = pageImages.find((p2) => p2.id === id);
                                if (r) items.push({ kind, id, startX: Number(r.x_in_page) || 0, startY: Number(r.y_in_page) || 0, startW: Number(r.width) || IMG_DEFAULT_W, startH: Number(r.height) || IMG_DEFAULT_H });
                              } else if (kind === 'text') {
                                const r = texts.find((p2) => p2.id === id);
                                if (r) items.push({ kind, id, startX: Number(r.x_in_page) || 0, startY: Number(r.y_in_page) || 0, startW: Number(r.width) || 200, startH: Number(r.height) || 60 });
                              }
                            }
                            setGroupDrag({ pageId: page.id, startMouseX: e.clientX, startMouseY: e.clientY, items });
                          } else {
                            setSelectedTextId(tt.id);
                            setSelectedImageId(null);
                            setMultiSelection(new Set());
                            setTextDrag({
                              id: tt.id,
                              pageId: page.id,
                              startMouseX: e.clientX,
                              startMouseY: e.clientY,
                              startX: Number(tt.x_in_page) || 0,
                              startY: Number(tt.y_in_page) || 0,
                            });
                          }
                        }}
                        onClick={(e) => {
                          if (textMode) return;
                          if (e.shiftKey) return;
                          if (lockedByOtherTx) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          if (multiSelection.size > 0 && multiSelection.has(`text:${tt.id}`)) return;
                          setSelectedTextId(tt.id);
                          setSelectedImageId(null);
                          setMultiSelection(new Set());
                        }}
                        onDoubleClick={(e) => {
                          if (lockedByOtherTx) { e.stopPropagation(); return; }
                          e.stopPropagation();
                          setSelectedTextId(tt.id);
                          setSelectedImageId(null);
                          setMultiSelection(new Set());
                          setTextEditingId(tt.id);
                          setTextEditDraft(tt.content || '');
                        }}
                        style={(() => {
                          const xPos = Number(tt.x_in_page) || 0;
                          const yPos = Number(tt.y_in_page) || 0;
                          const fs = Number(tt.font_size) || 16;
                          const lineH = Math.ceil(fs * 1.25);
                          const maxBoxW = Math.max(120, A4_W - xPos - 8);
                          const storedW = Number(tt.width);
                          const storedH = Number(tt.height);
                          const hasStoredW = Number.isFinite(storedW) && storedW > 0;
                          const hasStoredH = Number.isFinite(storedH) && storedH > 0;
                          // While editing, the box auto-grows around the textarea content. When idle,
                          // honour the persisted size (which is what the resize handles set, and what
                          // the auto-grown editor measured at commit time). Pre-migration legacy rows
                          // without stored dimensions fall back to the canonical 200 × 60 defaults.
                          const boxW = isTextEditing
                            ? 'auto'
                            : (hasStoredW ? Math.min(storedW, maxBoxW) : Math.min(200, maxBoxW));
                          const boxH = isTextEditing
                            ? 'auto'
                            : (hasStoredH ? storedH : 60);
                          return {
                            position: 'absolute',
                            left: xPos,
                            top: yPos,
                            width: boxW,
                            height: boxH,
                            minWidth: 120,
                            maxWidth: maxBoxW,
                            minHeight: lineH + 4,
                            fontSize: fs,
                            fontWeight: Number(tt.font_weight) || 400,
                            color: tt.color || '#1f2937',
                            fontStyle: tt.italic ? 'italic' : 'normal',
                            textDecoration: tt.strikethrough ? 'line-through' : 'none',
                            textAlign: tt.text_align || 'left',
                            padding: '2px 4px',
                            border: lockedByOtherTx
                              ? `2px solid ${txLockColor}`
                              : isTextEditing
                                ? `2px solid ${C.emerald}`
                                : isTextPending
                                  ? '2px solid #3b82f6'
                                  : isTextSelected
                                    ? `1.5px solid ${C.emerald}`
                                    : '1px solid transparent',
                            borderRadius: 3,
                            background: isTextEditing ? 'rgba(255,255,255,0.9)' : 'transparent',
                            cursor: lockedByOtherTx
                              ? 'not-allowed'
                              : (isTextEditing ? 'text' : (selectMode ? 'move' : 'default')),
                            userSelect: isTextEditing ? 'text' : 'none',
                            fontFamily: 'inherit',
                            lineHeight: 1.25,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            // Idle: hidden so the box itself defines the visible edge.
                            // Editing or selected (handles showing): visible so corner handles aren't clipped.
                            overflow: (isTextEditing || (isTextSelected && !lockedByOtherTx))
                              ? 'visible'
                              : 'hidden',
                            boxSizing: 'border-box',
                            verticalAlign: 'top',
                            zIndex: 26,
                          };
                        })()}
                      >
                        {isTextEditing ? (
                          <>
                            {/* hidden measurer — longest single line, no wrap, same font */}
                            <span
                              ref={textMeasurerRef}
                              aria-hidden="true"
                              style={{
                                position: 'absolute',
                                visibility: 'hidden',
                                whiteSpace: 'pre',
                                pointerEvents: 'none',
                                left: -99999,
                                top: 0,
                                fontSize: 'inherit',
                                fontWeight: 'inherit',
                                color: 'inherit',
                                fontStyle: 'inherit',
                                textDecoration: 'inherit',
                                fontFamily: 'inherit',
                                lineHeight: 'inherit',
                                padding: 0,
                                margin: 0,
                              }}
                            >
                              {(() => {
                                // When draft is empty, measure the placeholder so the textarea sizes to fit it.
                                const source = (textEditDraft && textEditDraft.length > 0)
                                  ? textEditDraft
                                  : t('textPlaceholder');
                                const lines = String(source).split('\n');
                                return lines.reduce((a, b) => (b.length > a.length ? b : a), '') || ' ';
                              })()}
                            </span>
                            <textarea
                              ref={editingTextareaRef}
                              autoFocus
                              rows={1}
                              value={textEditDraft}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setTextEditDraft(e.target.value)}
                              onBlur={() => commitTextEdit(tt.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  // Commit current draft (empty → delete via commitTextEdit), then deselect.
                                  commitTextEdit(tt.id);
                                  setSelectedTextId(null);
                                }
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                  e.preventDefault();
                                  commitTextEdit(tt.id);
                                  setSelectedTextId(null);
                                }
                              }}
                              placeholder={t('textPlaceholder')}
                              style={{
                                // width/height are set imperatively by the autosize layout effect.
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                resize: 'none',
                                fontSize: 'inherit',
                                fontWeight: 'inherit',
                                color: 'inherit',
                                fontStyle: 'inherit',
                                textDecoration: 'inherit',
                                textAlign: tt.text_align || 'left',
                                fontFamily: 'inherit',
                                lineHeight: 'inherit',
                                padding: 0,
                                margin: 0,
                                overflow: 'hidden',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                display: 'block',
                                boxSizing: 'content-box',
                                verticalAlign: 'top',
                              }}
                            />
                          </>
                        ) : (
                          tt.content && tt.content.length > 0 ? tt.content : (
                            <span style={{ color: C.fg4, fontStyle: 'italic' }}>{t('textPlaceholder')}</span>
                          )
                        )}
                        {lockedByOtherTx ? (
                          <div
                            aria-hidden="true"
                            style={{
                              position: 'absolute',
                              top: -20,
                              left: 0,
                              background: txLockColor,
                              color: '#fff',
                              padding: '1px 6px',
                              borderRadius: 8,
                              fontSize: 10,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              pointerEvents: 'none',
                              zIndex: 28,
                              fontFamily: 'inherit',
                            }}
                          >
                            {txLock.userName}
                          </div>
                        ) : null}
                        {/* Resize handles — visible only when selected, not editing, and not locked. */}
                        {isTextSelected && !isTextEditing && selectMode && !lockedByOtherTx ? (
                          <>
                            {/* Visible corner dots */}
                            {['nw', 'ne', 'sw', 'se'].map((corner) => {
                              const pos = {
                                nw: { left: 0,      top: 0,      cursor: 'nw-resize' },
                                ne: { left: '100%', top: 0,      cursor: 'ne-resize' },
                                sw: { left: 0,      top: '100%', cursor: 'sw-resize' },
                                se: { left: '100%', top: '100%', cursor: 'se-resize' },
                              }[corner];
                              return (
                                <div
                                  key={corner}
                                  data-text-handle={corner}
                                  onMouseDown={(e) => {
                                    if (e.button !== 0) return;
                                    e.stopPropagation();
                                    e.preventDefault();
                                    setTextResize({
                                      id: tt.id,
                                      pageId: page.id,
                                      corner,
                                      startMouseX: e.clientX,
                                      startMouseY: e.clientY,
                                      startW: Number(tt.width) || 200,
                                      startH: Number(tt.height) || 60,
                                      startTextX: Number(tt.x_in_page) || 0,
                                      startTextY: Number(tt.y_in_page) || 0,
                                    });
                                  }}
                                  style={{
                                    position: 'absolute',
                                    left: pos.left,
                                    top: pos.top,
                                    transform: 'translate(-50%, -50%)',
                                    cursor: pos.cursor,
                                    zIndex: 30,
                                    width: 11,
                                    height: 11,
                                    borderRadius: '50%',
                                    background: '#3b82f6',
                                    border: '2px solid #fff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                                  }}
                                />
                              );
                            })}
                            {/* Invisible edge drag bands — replaces the old visible n/s/w/e side handles. */}
                            {[
                              { corner: 'n', style: { top: 0,    left: 0, right: 0, height: 6 }, cursor: 'n-resize' },
                              { corner: 's', style: { bottom: 0, left: 0, right: 0, height: 6 }, cursor: 's-resize' },
                              { corner: 'w', style: { top: 0, bottom: 0, left: 0,  width: 6 },  cursor: 'w-resize' },
                              { corner: 'e', style: { top: 0, bottom: 0, right: 0, width: 6 },  cursor: 'e-resize' },
                            ].map((band) => (
                              <div
                                key={`edge-${band.corner}`}
                                data-text-handle={band.corner}
                                onMouseDown={(e) => {
                                  if (e.button !== 0) return;
                                  e.stopPropagation();
                                  e.preventDefault();
                                  setTextResize({
                                    id: tt.id,
                                    pageId: page.id,
                                    corner: band.corner,
                                    startMouseX: e.clientX,
                                    startMouseY: e.clientY,
                                    startW: Number(tt.width) || 200,
                                    startH: Number(tt.height) || 60,
                                    startTextX: Number(tt.x_in_page) || 0,
                                    startTextY: Number(tt.y_in_page) || 0,
                                  });
                                }}
                                style={{
                                  position: 'absolute',
                                  ...band.style,
                                  cursor: band.cursor,
                                  background: 'transparent',
                                  zIndex: 29,
                                }}
                              />
                            ))}
                          </>
                        ) : null}
                      </div>
                    );
                  })}

                  {designMarkers.filter((m) => {
                    // Render markers on their own page. Legacy rows with no page_id fall back to the first page.
                    if (m.pageId) return m.pageId === page.id;
                    return pageIdx === 0;
                  }).map((m) => {
                    const markerEmail = String(m.createdBy || '').trim().toLowerCase();
                    const canDeleteMarker = Boolean(myEmail) && !isReadOnlySprint;
                    // Viewer-relative color by author email (central resolver).
                    const isSelfMarker = !!markerEmail && markerEmail === currentUserEmail;
                    const markerUserColor = colorFor(markerEmail);
                    const authorFullName = markerProfiles[markerEmail]?.full_name
                      || (isSelfMarker ? currentUserFullName : '');
                    // Marker drag enabled only in select mode (no other tool active) on current sprint.
                    const canDragMarker = selectMode && !handTool && !markerMode && !textMode && !spaceHeld && !isReadOnlySprint;
                    return (
                      <DesignMarker
                        key={m.id}
                        marker={m}
                        isPending={false}
                        draftNote=""
                        onDraftChange={setDraftNote}
                        onConfirmNote={confirmPendingNote}
                        onCancelPending={cancelPending}
                        canDelete={canDeleteMarker}
                        myEmail={myEmail}
                        isReadOnlySprint={isReadOnlySprint}
                        markerColor={markerUserColor}
                        authorName={authorFullName}
                        authorEmail={markerEmail}
                        isActive={activeMarkerId === m.id}
                        onActivate={setActiveMarkerId}
                        zoom={zoom}
                        canDrag={canDragMarker}
                        onDragStart={(e, mk) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const pageEl = pageRefsMap.current[page.id] || canvasRef.current;
                          if (!pageEl) return;
                          setMarkerDrag({
                            markerId: mk.id,
                            pageEl,
                            startMouseX: e.clientX,
                            startMouseY: e.clientY,
                            startXPct: Number(mk.xPct) || 0,
                            startYPct: Number(mk.yPct) || 0,
                          });
                        }}
                        onDelete={async (markerId) => {
                          await deleteMarkerById(markerId);
                        }}
                      />
                    );
                  })}
                  {pendingMarker && (pendingMarker.pageId === page.id || (!pendingMarker.pageId && isSel)) ? (
                    (() => {
                      // Draft marker belongs to the viewer → their own resolved color.
                      const myColor = colorFor(currentUserEmail);
                      return (
                        <DesignMarker
                          key="__draft_marker__"
                          marker={{
                            id: '__draft_marker__',
                            xPct: pendingMarker.xPct,
                            yPct: pendingMarker.yPct,
                            note: '',
                          }}
                          isPending
                          draftNote={draftNote}
                          onDraftChange={setDraftNote}
                          onConfirmNote={confirmPendingNote}
                          onCancelPending={cancelPending}
                          canDelete={false}
                          myEmail={myEmail}
                          isReadOnlySprint={isReadOnlySprint}
                          markerColor={myColor}
                          authorName={currentUserFullName || ''}
                          authorEmail={currentUserEmail || ''}
                          canDrag={false}
                          zoom={zoom}
                          onDelete={() => {}}
                        />
                      );
                    })()
                  ) : null}

                  {/* Marquee rectangle (drawn inside the page being marqueed) */}
                  {marqueeBox && marqueeBox.pageId === page.id ? (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: Math.min(marqueeBox.x0, marqueeBox.x1),
                        top: Math.min(marqueeBox.y0, marqueeBox.y1),
                        width: Math.abs(marqueeBox.x1 - marqueeBox.x0),
                        height: Math.abs(marqueeBox.y1 - marqueeBox.y0),
                        border: '1px dashed #06b6d4',
                        background: 'rgba(6,182,212,0.08)',
                        pointerEvents: 'none',
                        zIndex: 50,
                      }}
                    />
                  ) : null}

                  {/* Multi-selection resize bounding box + 4 corner handles.
                     Visible only when ≥2 items are selected on this page (excluding any
                     items locked by other users). Drag a corner to scale every selected
                     item proportionally within the bbox. */}
                  {(() => {
                    if (multiSelection.size < 2) return null;
                    const myEmailLc = String(currentUserEmail || '').trim().toLowerCase();
                    const items = [];
                    for (const k of multiSelection) {
                      const sep = k.indexOf(':');
                      if (sep < 0) continue;
                      const kind = k.slice(0, sep);
                      const id = k.slice(sep + 1);
                      const lock = lockedElements[k];
                      if (lock && lock.userId !== myEmailLc) continue;
                      if (kind === 'image') {
                        const r = pageImages.find((p2) => p2.id === id);
                        if (!r || r.page_id !== page.id) continue;
                        items.push({
                          kind, id,
                          x: Number(r.x_in_page) || 0,
                          y: Number(r.y_in_page) || 0,
                          w: Number(r.width) || IMG_DEFAULT_W,
                          h: Number(r.height) || IMG_DEFAULT_H,
                        });
                      } else if (kind === 'text') {
                        const r = texts.find((p2) => p2.id === id);
                        if (!r || r.page_id !== page.id) continue;
                        items.push({
                          kind, id,
                          x: Number(r.x_in_page) || 0,
                          y: Number(r.y_in_page) || 0,
                          w: Number(r.width) || 200,
                          h: Number(r.height) || 60,
                        });
                      }
                    }
                    if (items.length < 2) return null;
                    const minX = Math.min(...items.map((it) => it.x));
                    const minY = Math.min(...items.map((it) => it.y));
                    const maxX = Math.max(...items.map((it) => it.x + it.w));
                    const maxY = Math.max(...items.map((it) => it.y + it.h));
                    const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
                    const handles = [
                      { corner: 'nw', left: 0,        top: 0,        cursor: 'nw-resize' },
                      { corner: 'ne', left: '100%',   top: 0,        cursor: 'ne-resize' },
                      { corner: 'sw', left: 0,        top: '100%',   cursor: 'sw-resize' },
                      { corner: 'se', left: '100%',   top: '100%',   cursor: 'se-resize' },
                    ];
                    return (
                      <div
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: bbox.x,
                          top: bbox.y,
                          width: bbox.w,
                          height: bbox.h,
                          border: '1.5px dashed #06B6D4',
                          pointerEvents: 'none',
                          zIndex: 32,
                          boxSizing: 'border-box',
                        }}
                      >
                        {handles.map((hd) => (
                          <div
                            key={hd.corner}
                            data-multi-handle={hd.corner}
                            onMouseDown={(e) => {
                              if (e.button !== 0) return;
                              e.stopPropagation();
                              e.preventDefault();
                              setMultiResize({
                                pageId: page.id,
                                corner: hd.corner,
                                startMouseX: e.clientX,
                                startMouseY: e.clientY,
                                startBbox: { ...bbox },
                                items: items.map((it) => ({
                                  kind: it.kind,
                                  id: it.id,
                                  startX: it.x,
                                  startY: it.y,
                                  startW: it.w,
                                  startH: it.h,
                                })),
                              });
                            }}
                            style={{
                              position: 'absolute',
                              left: hd.left,
                              top: hd.top,
                              transform: 'translate(-50%, -50%)',
                              cursor: hd.cursor,
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: '#3b82f6',
                              border: '2px solid #fff',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                              pointerEvents: 'auto',
                              zIndex: 33,
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  {/* Smart-guide lines (blue dashed 2px) */}
                  {guideLines.filter((g) => g.pageId === page.id).map((g, gi) => (
                    <div
                      key={`guide-${gi}`}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        pointerEvents: 'none',
                        zIndex: 55,
                        ...(g.axis === 'v'
                          ? { left: g.pos - 1, top: 0, width: 0, height: A4_H, borderLeft: '2px dashed #3b82f6' }
                          : { top: g.pos - 1, left: 0, height: 0, width: A4_W, borderTop: '2px dashed #3b82f6' }),
                      }}
                    />
                  ))}

                  {/* Remote users' live cursors (Figma-style) */}
                  {Object.entries(remoteCursors).map(([uid, c]) => {
                    if (!c || c.pageId !== page.id) return null;
                    // Viewer-relative: resolve the remote user's color locally
                    // from their id (email) rather than trusting a sent color.
                    const cursorColor = colorFor(uid);
                    return (
                      <div
                        key={`cursor-${uid}`}
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: c.x,
                          top: c.y,
                          // Counter the parent's `scale(zoom)` so the cursor stays a constant
                          // size on screen no matter how zoomed in/out the canvas is.
                          transform: `scale(${1 / (zoom || 1)})`,
                          transformOrigin: '0 0',
                          pointerEvents: 'none',
                          zIndex: 100,
                          willChange: 'left, top, transform',
                        }}
                      >
                        <svg
                          width={18}
                          height={20}
                          viewBox="0 0 18 20"
                          style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}
                        >
                          <path
                            d="M0 0 L18 7 L7.5 9 L4 18 Z"
                            fill={cursorColor}
                            stroke="#ffffff"
                            strokeWidth={1.2}
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 2,
                            marginLeft: 10,
                            background: cursorColor,
                            color: '#ffffff',
                            padding: '1px 6px',
                            borderRadius: 8,
                            fontSize: 10,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                            fontFamily: 'inherit',
                          }}
                        >
                          {c.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {/* Vertical scrollbar — shown in vertical mode (where pages stack down). */}
        {!isHorizontal && (() => {
          if (!pages || pages.length === 0) return null;
          const viewH = viewportSize.h || 0;
          if (viewH <= 0) return null;
          const contentH = pages.length * A4_H + Math.max(0, pages.length - 1) * PAGE_GAP;
          const scaledH = contentH * zoom;
          if (scaledH <= viewH + 1) return null;
          const overflow = scaledH - viewH;
          const extraY = (A4_H / 3) * zoom;
          const maxPanY = overflow / 2 + extraY;
          const minPanY = -overflow / 2 - extraY;
          const clampedPanY = Math.max(minPanY, Math.min(maxPanY, panY));
          const thumbH = Math.max(36, viewH * (viewH / scaledH));
          const t = (maxPanY - clampedPanY) / (maxPanY - minPanY);
          const thumbTop = t * (viewH - thumbH);
          const maxThumbTop = Math.max(0, viewH - thumbH);
          return (
            <div
              aria-hidden="true"
              onMouseDown={(e) => {
                // Click on the track (not the thumb) → jump to that position.
                if (e.target !== e.currentTarget) return;
                if (e.button !== 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const targetTop = Math.max(0, Math.min(maxThumbTop, clickY - thumbH / 2));
                const tt = maxThumbTop > 0 ? targetTop / maxThumbTop : 0;
                setPanY(maxPanY - tt * (maxPanY - minPanY));
              }}
              style={{
                position: 'absolute',
                top: 0,
                right: 4,
                width: 8,
                height: '100%',
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: 15,
              }}
            >
              <div
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setScrollbarDrag({
                    axis: 'y',
                    startMouseY: e.clientY,
                    startThumbTop: thumbTop,
                    maxThumbTop,
                    maxPanY,
                    minPanY,
                  });
                }}
                style={{
                  position: 'absolute',
                  top: thumbTop,
                  left: 0,
                  width: 8,
                  height: thumbH,
                  borderRadius: 4,
                  background: scrollbarDrag ? 'rgba(31,41,55,0.40)' : 'rgba(31,41,55,0.20)',
                  cursor: scrollbarDrag ? 'grabbing' : 'grab',
                  transition: scrollbarDrag ? 'none' : 'background 120ms',
                }}
              />
            </div>
          );
        })()}
        {/* Horizontal scrollbar — shown in horizontal mode (where pages lay across). */}
        {isHorizontal && (() => {
          if (!pages || pages.length === 0) return null;
          const viewW = viewportSize.w || 0;
          if (viewW <= 0) return null;
          const contentW = pages.length * A4_W + Math.max(0, pages.length - 1) * PAGE_GAP;
          const scaledW = contentW * zoom;
          if (scaledW <= viewW + 1) return null;
          const overflow = scaledW - viewW;
          const extraX = (A4_W / 3) * zoom;
          const maxPanX = overflow / 2 + extraX;
          const minPanX = -overflow / 2 - extraX;
          const clampedPanX = Math.max(minPanX, Math.min(maxPanX, panX));
          const thumbW = Math.max(36, viewW * (viewW / scaledW));
          const tt = (maxPanX - clampedPanX) / (maxPanX - minPanX);
          const thumbLeft = tt * (viewW - thumbW);
          const maxThumbLeft = Math.max(0, viewW - thumbW);
          return (
            <div
              aria-hidden="true"
              onMouseDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.button !== 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const targetLeft = Math.max(0, Math.min(maxThumbLeft, clickX - thumbW / 2));
                const fr = maxThumbLeft > 0 ? targetLeft / maxThumbLeft : 0;
                setPanX(maxPanX - fr * (maxPanX - minPanX));
              }}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 4,
                width: '100%',
                height: 8,
                pointerEvents: 'auto',
                cursor: 'pointer',
                zIndex: 15,
              }}
            >
              <div
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  e.preventDefault();
                  setScrollbarDrag({
                    axis: 'x',
                    startMouseX: e.clientX,
                    startThumbLeft: thumbLeft,
                    maxThumbLeft,
                    maxPanX,
                    minPanX,
                  });
                }}
                style={{
                  position: 'absolute',
                  left: thumbLeft,
                  top: 0,
                  width: thumbW,
                  height: 8,
                  borderRadius: 4,
                  background: scrollbarDrag ? 'rgba(31,41,55,0.40)' : 'rgba(31,41,55,0.20)',
                  cursor: scrollbarDrag ? 'grabbing' : 'grab',
                  transition: scrollbarDrag ? 'none' : 'background 120ms',
                }}
              />
            </div>
          );
        })()}
        {/* Drag-and-drop visual feedback — translucent cyan veil + "Drop image here". */}
        {isDragOver ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(6,182,212,0.10)',
              border: '2px dashed #06B6D4',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 25,
            }}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.95)',
                color: '#06B6D4',
                padding: '10px 18px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.02em',
                boxShadow: '0 4px 14px rgba(6,182,212,0.30)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Icon name="upload" size={16} color="#06B6D4" />
              Drop image here
            </div>
          </div>
        ) : null}
        {/* Canvas top-right cluster — Consensus Result pill (when saved) + kebab. Lives
           outside the zoomed canvas so it stays a fixed screen size regardless of zoom. */}
        <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasConsensusRecord && typeof onOpenConsensusPanel === 'function' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenConsensusPanel();
              }}
              title="Show consensus result"
              style={{
                height: 28,
                padding: '4px 12px',
                background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                color: '#fff',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 12,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(6,182,212,0.30)',
                transition: 'filter 140ms, box-shadow 140ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.filter = 'brightness(1.08)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(6,182,212,0.40)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = 'brightness(1)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(6,182,212,0.30)';
              }}
            >
              <Icon name="sparkles" size={13} color="#fff" />
              <span>Consensus Result</span>
            </button>
          ) : null}
          <div style={{ position: 'relative' }}>
          <button
            ref={canvasMenuBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setCanvasMenuOpen((v) => !v);
            }}
            title={t('bgBackground')}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              background: canvasMenuOpen ? '#f3f4f6' : C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: C.fg3,
              boxShadow: '0 2px 6px rgba(30,42,53,0.10)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { if (!canvasMenuOpen) e.currentTarget.style.background = C.white; }}
          >
            <Icon name="more-vertical" size={14} color={C.fg3} />
          </button>
          {canvasMenuOpen ? (
            <div
              ref={canvasMenuRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                zIndex: 50,
                minWidth: 140,
                background: C.white,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 6,
                boxShadow: '0 10px 24px rgba(30,42,53,0.16)',
                padding: 4,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {[
                { key: 'grid', label: t('bgGrid') },
                { key: 'dots', label: t('bgDots') },
                { key: 'none', label: t('bgNone') },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setGridMode(opt.key); setCanvasMenuOpen(false); }}
                  style={{
                    border: 'none', background: 'transparent', textAlign: 'left',
                    borderRadius: 4, padding: '6px 8px', fontSize: 12, color: C.fg1,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {gridMode === opt.key ? <Icon name="check" size={11} color={C.emerald} /> : null}
                  </span>
                  {opt.label}
                </button>
              ))}
              <div style={{ height: 1, background: C.borderSubtle, margin: '4px 0' }} />
              {[
                { key: 'vertical',   label: 'Vertical' },
                { key: 'horizontal', label: 'Horizontal' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => { setPageOrientation(opt.key); setCanvasMenuOpen(false); }}
                  style={{
                    border: 'none', background: 'transparent', textAlign: 'left',
                    borderRadius: 4, padding: '6px 8px', fontSize: 12, color: C.fg1,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {pageOrientation === opt.key ? <Icon name="check" size={11} color={C.emerald} /> : null}
                  </span>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>
      {imageMenu.open && (designImageUrl || pageImages.length > 0) ? (
        <div
          ref={contextMenuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: imageMenu.x,
            top: imageMenu.y,
            transform: 'translate(6px, 6px)',
            zIndex: 100000,
            minWidth: 140,
            background: C.white,
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 8,
            boxShadow: '0 10px 26px rgba(30,42,53,0.16)',
            padding: 6,
          }}
        >
          <button
            type="button"
            onClick={async () => {
              const targetId = imageMenu.imgId;
              setImageMenu({ open: false, x: 0, y: 0, imgId: null });
              if (targetId) {
                await deleteImageRow(targetId);
              } else if (typeof onDeleteImage === 'function') {
                // Fallback for legacy single-image path (no imgId tracked).
                await onDeleteImage();
              }
            }}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              borderRadius: 6,
              padding: '7px 8px',
              fontSize: 12.5,
              color: C.coral,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('deleteImage')}
          </button>
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          right: 14,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          // Sit above the pages navigator (zIndex 13) AND the top-right
          // Consensus Result / kebab cluster (zIndex 16) so the Sprint
          // Branches expansion panel — which lives inside this wrapper's
          // stacking context — can cover them when it opens. The wrapper
          // itself has `pointerEvents: 'none'`, so raising it doesn't steal
          // clicks from anything below: only the expansion panel's actual
          // glass plate (rendered only while open) and the dot strip
          // re-enable pointer events for their own interactive bits.
          zIndex: 18,
          minWidth: 0,
          pointerEvents: 'none',
        }}
      >
        <SprintTimelinePanel
          timelineAnchorSeed={timelineAnchorSeed}
          currentSprint={currentSprint}
          projectMetaLoading={projectMetaLoading}
          viewingSprint={viewingSprint}
          onSprintSelect={onSprintSelect}
          onRequestDeleteSprint={onRequestDeleteSprint}
          sprintsMeta={sprintsMeta}
          onOpenSprintSettings={onOpenSprintSettings}
        />
      </div>

      {/* Vertical page navigator (left side, below sprint timeline) */}
      {pages.length > 0 ? (
        <div
          data-pages-panel
          style={{
            position: 'absolute',
            top: 68,
            left: 14,
            zIndex: 13,
            width: pagesPanelOpen ? 140 : 54,
            maxHeight: 'calc(100% - 160px)',
            background: 'rgba(255,255,255,0.94)',
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(30,42,53,0.08)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            pointerEvents: 'auto',
            overflow: 'visible',
            transition: 'width 200ms ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: pagesPanelOpen ? 'space-between' : 'center',
              padding: '2px 4px',
              gap: 2,
              position: 'relative',
            }}
          >
            {pagesPanelOpen ? (
              <>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.fg3, letterSpacing: '0.04em' }}>
                  {t('pagesPanelTitle')}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGridMenuOpen((v) => !v);
                    }}
                    title={t('bgBackground')}
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      background: gridMenuOpen ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: C.fg3,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={(e) => { if (!gridMenuOpen) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon name="more-vertical" size={13} color={C.fg3} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagesPanelOpen((v) => !v)}
                    title="Collapse"
                    style={{
                      width: 20,
                      height: 20,
                      padding: 0,
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: C.fg3,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Icon name="chevron-left" size={13} color={C.fg3} />
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPagesPanelOpen(true)}
                title="Expand"
                style={{
                  width: 20,
                  height: 20,
                  padding: 0,
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 3,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: C.fg3,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <Icon name="chevron-right" size={13} color={C.fg3} />
              </button>
            )}

            {/* Background-mode dropdown */}
            {gridMenuOpen ? (
              <div
                ref={gridMenuRef}
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  zIndex: 50,
                  minWidth: 132,
                  background: C.white,
                  border: `1px solid ${C.borderSubtle}`,
                  borderRadius: 6,
                  boxShadow: '0 10px 24px rgba(30,42,53,0.16)',
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {[
                  { key: 'grid', label: t('bgGrid') },
                  { key: 'dots', label: t('bgDots') },
                  { key: 'none', label: t('bgNone') },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setGridMode(opt.key);
                      setGridMenuOpen(false);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      borderRadius: 4,
                      padding: '6px 8px',
                      fontSize: 12,
                      color: C.fg1,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {gridMode === opt.key ? <Icon name="check" size={11} color={C.emerald} /> : null}
                    </span>
                    {opt.label}
                  </button>
                ))}
                {/* Divider */}
                <div style={{ height: 1, background: C.borderSubtle, margin: '4px 0' }} />
                {[
                  { key: 'vertical',   label: 'Vertical' },
                  { key: 'horizontal', label: 'Horizontal' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setPageOrientation(opt.key);
                      setGridMenuOpen(false);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      textAlign: 'left',
                      borderRadius: 4,
                      padding: '6px 8px',
                      fontSize: 12,
                      color: C.fg1,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ width: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {pageOrientation === opt.key ? <Icon name="check" size={11} color={C.emerald} /> : null}
                    </span>
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pages.map((page, idx) => {
              const isSel = page.id === selectedPageId;
              const isEditing = pageEditingId === page.id;
              return (
                <div
                  key={page.id}
                  onClick={(e) => {
                    if (isEditing) return;
                    if (e.target.closest?.('input')) return;
                    // Click on already-selected page → enter rename mode (navigator input).
                    if (selectedPageId === page.id) {
                      e.stopPropagation();
                      startNavigatorEdit(page);
                      return;
                    }
                    // Otherwise, select + pan the canvas. In horizontal mode pan along X
                    // (pages laid across); in vertical mode pan along Y (pages stacked).
                    setSelectedPageId(page.id);
                    if (isHorizontal) {
                      const viewW = viewportSize.w || (viewportRef.current?.getBoundingClientRect().width || 0);
                      const viewH = viewportSize.h || (viewportRef.current?.getBoundingClientRect().height || 0);
                      if (viewW > 0 && pages.length > 0) {
                        const contentW = pages.length * A4_W + Math.max(0, pages.length - 1) * PAGE_GAP;
                        const scaledW = contentW * zoom;
                        const pageStep = (A4_W + PAGE_GAP) * zoom;
                        const targetX = PAGE_SCROLL_MARGIN - viewW / 2 + scaledW / 2 - idx * pageStep;
                        const overflowX = Math.max(0, scaledW - viewW);
                        const extraX = (A4_W / 3) * zoom;
                        const maxPanX = overflowX / 2 + extraX;
                        const minPanX = -overflowX / 2 - extraX;
                        setPanX(Math.max(minPanX, Math.min(maxPanX, targetX)));
                      }
                      // In horizontal layout every page shares the same Y position. Put the
                      // page top PAGE_SCROLL_MARGIN below the viewport top, mirroring the
                      // vertical-mode formula but with a single-page-tall content extent.
                      if (viewH > 0) {
                        const scaledH = A4_H * zoom;
                        const targetY = PAGE_SCROLL_MARGIN - viewH / 2 + scaledH / 2;
                        const overflowY = Math.max(0, scaledH - viewH);
                        const extraY = (A4_H / 3) * zoom;
                        const maxPanY = overflowY / 2 + extraY;
                        const minPanY = -overflowY / 2 - extraY;
                        setPanY(Math.max(minPanY, Math.min(maxPanY, targetY)));
                      }
                    } else {
                      const viewH = viewportSize.h || (viewportRef.current?.getBoundingClientRect().height || 0);
                      if (viewH > 0 && pages.length > 0) {
                        const contentH = pages.length * A4_H + Math.max(0, pages.length - 1) * PAGE_GAP;
                        const scaledH = contentH * zoom;
                        const pageStep = (A4_H + PAGE_GAP) * zoom;
                        const target = PAGE_SCROLL_MARGIN - viewH / 2 + scaledH / 2 - idx * pageStep;
                        const overflowY = Math.max(0, scaledH - viewH);
                        const extraY = (A4_H / 3) * zoom;
                        const maxPanY = overflowY / 2 + extraY;
                        const minPanY = -overflowY / 2 - extraY;
                        setPanX(0);
                        setPanY(Math.max(minPanY, Math.min(maxPanY, target)));
                      }
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPageContextMenu({ open: true, x: e.clientX, y: e.clientY, pageId: page.id, source: 'navigator' });
                  }}
                  title={!pagesPanelOpen ? (page.title || `Page ${idx + 1}`) : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: pagesPanelOpen ? 6 : 4,
                    padding: pagesPanelOpen ? '6px 8px' : '6px 4px',
                    borderRadius: 4,
                    background: isSel ? C.emeraldLight : 'transparent',
                    border: `1px solid ${isSel ? C.emeraldBorder : 'transparent'}`,
                    cursor: 'pointer',
                    fontSize: 11,
                    color: isSel ? C.emerald : C.fg2,
                    fontWeight: 600,
                    userSelect: 'none',
                    justifyContent: pagesPanelOpen ? 'flex-start' : 'center',
                  }}
                >
                  <Icon name="file-text" size={14} color={isSel ? C.emerald : C.fg3} />
                  {isEditing ? (
                    <input
                      ref={pageRenameInputRef}
                      autoFocus
                      value={pageEditDraft}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setPageEditDraft(e.target.value)}
                      onBlur={commitPageEdit}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitPageEdit();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setPageEditingId(null);
                          setPageEditDraft('');
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 11,
                        padding: '2px 4px',
                        border: `1px solid ${C.border}`,
                        borderRadius: 3,
                        fontFamily: 'inherit',
                        outline: 'none',
                      }}
                    />
                  ) : pagesPanelOpen ? (
                    <span
                      title={isSel ? 'Click again to rename' : undefined}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {page.title || `Page ${idx + 1}`}
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {idx + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const last = pages[pages.length - 1];
              if (last) addPage(last.page_number, false);
            }}
            title={!pagesPanelOpen ? t('pagesAddPage') : undefined}
            style={{
              marginTop: 4,
              padding: pagesPanelOpen ? '6px 8px' : '6px 4px',
              border: `1px dashed ${C.border}`,
              borderRadius: 4,
              background: 'transparent',
              color: C.fg3,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            {pagesPanelOpen ? ` ${t('pagesAddPage')}` : null}
          </button>
        </div>
      ) : null}

      {/* Page context menu (Rename / Delete) — used by both navigator and artboard kebab */}
      {pageContextMenu.open ? (
        <div
          ref={pageContextMenuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: pageContextMenu.x,
            top: pageContextMenu.y,
            transform: 'translate(4px, 4px)',
            zIndex: 100001,
            minWidth: 140,
            background: C.white,
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 8,
            boxShadow: '0 10px 26px rgba(30,42,53,0.16)',
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (pageContextMenu.source === 'artboard') {
                handleRenamePageFromArtboard(pageContextMenu.pageId);
              } else {
                handleRenamePageFromNavigator(pageContextMenu.pageId);
              }
            }}
            style={{
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              borderRadius: 4,
              padding: '7px 10px',
              fontSize: 12,
              color: C.fg1,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name="pencil" size={12} color={C.fg2} />
            {t('pageRename')}
          </button>
          <button
            type="button"
            onClick={() => handleDeletePage(pageContextMenu.pageId)}
            disabled={pages.length <= 1}
            style={{
              border: 'none',
              background: 'transparent',
              textAlign: 'left',
              borderRadius: 4,
              padding: '7px 10px',
              fontSize: 12,
              color: pages.length <= 1 ? C.fg4 : C.coral,
              cursor: pages.length <= 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => { if (pages.length > 1) e.currentTarget.style.background = '#fef2f2'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <Icon name="trash" size={12} color={pages.length <= 1 ? C.fg4 : C.coral} />
            {t('pageDelete')}
          </button>
        </div>
      ) : null}

      {/* Align panel (bottom-left, above Upload button) — shows ONLY when multi-selection ≥ 2.
         Single-selection panels (image/text) auto-hide because their conditions require
         `selectedImageId`/`selectedTextId` which are cleared when entering multi-select. */}
      {multiSelection.size >= 2 ? (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 14,
            zIndex: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-start',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              padding: 10,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 6px 16px rgba(30,42,53,0.12)',
              width: 200,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 11,
              color: C.fg2,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, color: C.fg3, letterSpacing: '0.04em' }}>
              ALIGN
            </div>
            {/* Row 1: horizontal alignment (X axis) */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { op: 'left',    icon: 'align-hl', title: 'Align left' },
                { op: 'centerH', icon: 'align-hc', title: 'Align center (horizontal)' },
                { op: 'right',   icon: 'align-hr', title: 'Align right' },
              ].map((b) => (
                <button
                  key={b.op}
                  type="button"
                  title={b.title}
                  onClick={() => applyAlign(b.op)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = C.white; }}
                  style={{
                    flex: 1,
                    height: 30,
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    color: '#06B6D4',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name={b.icon} size={14} color="#06B6D4" />
                </button>
              ))}
            </div>
            {/* Row 2: vertical alignment (Y axis) */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { op: 'top',     icon: 'align-top',      title: 'Align top' },
                { op: 'middleV', icon: 'align-middle-v', title: 'Align middle (vertical)' },
                { op: 'bottom',  icon: 'align-bottom',   title: 'Align bottom' },
              ].map((b) => (
                <button
                  key={b.op}
                  type="button"
                  title={b.title}
                  onClick={() => applyAlign(b.op)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = C.white; }}
                  style={{
                    flex: 1,
                    height: 30,
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    color: '#06B6D4',
                    borderRadius: 4,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'inherit',
                  }}
                >
                  <Icon name={b.icon} size={14} color="#06B6D4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Image settings panel (bottom-left, above Upload button) — shows ONLY when an image is selected */}
      {(() => {
        if (!selectedImageId) return null;
        const cropping = !!cropState && cropState.imgId === selectedImageId;
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 60,
              left: 14,
              zIndex: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'flex-start',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: 10,
                background: C.white,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 6,
                boxShadow: '0 6px 16px rgba(30,42,53,0.12)',
                width: 220,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                fontSize: 11,
                color: C.fg2,
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: C.fg3, letterSpacing: '0.04em' }}>
                {t('imagePanelTitle').toUpperCase()}
              </div>
              {cropping ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={applyCrop}
                    style={{ ...pillBtnStyle(true), flex: 1, color: C.emerald, fontWeight: 700 }}
                  >
                    {t('imageCropConfirm')}
                  </button>
                  <button
                    type="button"
                    onClick={cancelCrop}
                    style={{ ...pillBtnStyle(false), flex: 1 }}
                  >
                    {t('imageCropCancel')}
                  </button>
                </div>
              ) : (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '7px 8px',
                      borderRadius: 4,
                      border: `1px solid ${C.border}`,
                      background: imageReplaceState.status === 'uploading' ? '#f3f4f6' : C.white,
                      color: C.fg2,
                      cursor: imageReplaceState.status === 'uploading' ? 'not-allowed' : 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    <Icon name="image-plus" size={13} color={C.fg2} />
                    {imageReplaceState.status === 'uploading' ? t('hubCreateSaving') : t('imageReplace')}
                    <input
                      ref={imageReplaceInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleReplaceImage}
                      disabled={imageReplaceState.status === 'uploading'}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={startCropForSelected}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '7px 8px',
                      borderRadius: 4,
                      border: `1px solid ${C.border}`,
                      background: C.white,
                      color: C.fg2,
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon name="crop" size={13} color={C.fg2} />
                    {t('imageCrop')}
                  </button>
                  {imageReplaceState.status === 'error' && imageReplaceState.message ? (
                    <div style={{ fontSize: 10, color: C.coral }}>{imageReplaceState.message}</div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Text settings panel (bottom-left, above Upload button) — shows ONLY when a text element is selected and no image is selected */}
      {(() => {
        const selectedText = texts.find((tt) => tt.id === selectedTextId) || null;
        if (!selectedText || selectedImageId) return null;
        const cur = {
          font_size: Number(selectedText.font_size) || 16,
          font_weight: Number(selectedText.font_weight) || 400,
          color: selectedText.color || '#1f2937',
          italic: !!selectedText.italic,
          strikethrough: !!selectedText.strikethrough,
          text_align: selectedText.text_align || 'left',
        };
        const PRESET_COLORS = [
          '#1f2937', '#ffffff', '#ef4444', '#f97316',
          '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
          '#8b5cf6', '#ec4899', '#6b7280',
        ];
        const RAINBOW_BG =
          'conic-gradient(from 0deg, #ef4444, #f97316, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)';
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 60,
              left: 14,
              zIndex: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              alignItems: 'flex-start',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
              <div
                style={{
                  padding: 10,
                  background: C.white,
                  border: `1px solid ${C.borderSubtle}`,
                  borderRadius: 6,
                  boxShadow: '0 6px 16px rgba(30,42,53,0.12)',
                  width: 240,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontSize: 11,
                  color: C.fg2,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, color: C.fg3, letterSpacing: '0.04em' }}>
                  {t('textPanelTitle').toUpperCase()}
                </div>

                {/* Color swatches: 11 presets + 1 rainbow that opens the native picker */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 36, color: C.fg3, flexShrink: 0 }}>{t('textColor')}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, flex: 1 }}>
                    {PRESET_COLORS.map((hex) => {
                      const active = cur.color.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          title={hex}
                          aria-label={hex}
                          onClick={() => applyTextStyleChange({ color: hex })}
                          style={{
                            width: 18,
                            height: 18,
                            padding: 0,
                            borderRadius: '50%',
                            background: hex,
                            border: active
                              ? `2px solid ${C.emerald}`
                              : hex.toLowerCase() === '#ffffff'
                                ? `1px solid ${C.border}`
                                : '1px solid rgba(0,0,0,0.08)',
                            cursor: 'pointer',
                            boxShadow: active ? '0 0 0 1px #fff inset' : 'none',
                          }}
                        />
                      );
                    })}
                    {/* Rainbow swatch — triggers hidden color picker for any custom color */}
                    <label
                      title={t('textColorCustom')}
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: RAINBOW_BG,
                        border: '1px solid rgba(0,0,0,0.12)',
                        cursor: 'pointer',
                        display: 'inline-block',
                        position: 'relative',
                      }}
                    >
                      <input
                        type="color"
                        value={cur.color}
                        onChange={(e) => applyTextStyleChange({ color: e.target.value })}
                        style={{
                          position: 'absolute',
                          inset: 0,
                          opacity: 0,
                          width: '100%',
                          height: '100%',
                          padding: 0,
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      />
                    </label>
                  </div>
                </div>

                {/* Size */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 36, color: C.fg3 }}>{t('textSize')}</span>
                  <button
                    type="button"
                    onClick={() => applyTextStyleChange({ font_size: Math.max(8, cur.font_size - 1) })}
                    style={miniBtnStyle()}
                  >−</button>
                  <input
                    type="number"
                    min={8}
                    max={120}
                    value={cur.font_size}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (Number.isFinite(v)) applyTextStyleChange({ font_size: Math.max(8, Math.min(120, v)) });
                    }}
                    style={{ width: 44, textAlign: 'center', height: 22, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11, fontFamily: 'inherit', color: C.fg1 }}
                  />
                  <button
                    type="button"
                    onClick={() => applyTextStyleChange({ font_size: Math.min(120, cur.font_size + 1) })}
                    style={miniBtnStyle()}
                  >+</button>
                </label>

                {/* Alignment (replaces Weight) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 36, color: C.fg3 }}>{t('textAlign')}</span>
                  {[
                    { key: 'left',   icon: 'align-left',   title: t('textAlignLeft') },
                    { key: 'center', icon: 'align-center', title: t('textAlignCenter') },
                    { key: 'right',  icon: 'align-right',  title: t('textAlignRight') },
                  ].map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      title={it.title}
                      onClick={() => applyTextStyleChange({ text_align: it.key })}
                      style={{
                        ...pillBtnStyle(cur.text_align === it.key),
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                      }}
                    >
                      <Icon name={it.icon} size={13} color={cur.text_align === it.key ? C.emerald : C.fg2} />
                    </button>
                  ))}
                </div>

                {/* Bold + Italic + Strike in one row */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => applyTextStyleChange({ font_weight: cur.font_weight >= 700 ? 400 : 700 })}
                    style={{ ...pillBtnStyle(cur.font_weight >= 700), fontWeight: 700, flex: 1 }}
                    title={t('textBold')}
                  >B</button>
                  <button
                    type="button"
                    onClick={() => applyTextStyleChange({ italic: !cur.italic })}
                    style={{ ...pillBtnStyle(cur.italic), fontStyle: 'italic', flex: 1 }}
                    title={t('textItalic')}
                  >I</button>
                  <button
                    type="button"
                    onClick={() => applyTextStyleChange({ strikethrough: !cur.strikethrough })}
                    style={{ ...pillBtnStyle(cur.strikethrough), textDecoration: 'line-through', flex: 1 }}
                    title={t('textStrike')}
                  >S</button>
                </div>
              </div>
          </div>
        );
      })()}

      <div
        style={{
          position: 'absolute',
          bottom: 16,
          left: 14,
          zIndex: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 10px',
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            color: C.fg2,
            fontSize: 11,
            fontWeight: 600,
            cursor: uploadState.status === 'uploading' ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
            opacity: uploadState.status === 'uploading' ? 0.75 : 1,
          }}
        >
          <Icon name="upload" size={13} color={C.fg3} />
          {uploadState.status === 'uploading' ? t('hubCreateSaving') : 'Upload'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onUploadImage}
            disabled={uploadState.status === 'uploading'}
          />
        </label>
        {uploadState.message ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: uploadState.status === 'error' ? C.coral : C.emerald,
              background: C.white,
              border: `1px solid ${uploadState.status === 'error' ? C.coralBorder : C.emeraldBorder}`,
              borderRadius: 4,
              padding: '4px 6px',
              display: 'inline-block',
            }}
          >
            {uploadState.message}
          </div>
        ) : null}
      </div>

      {(() => {
        const tools = [
          {
            key: 'select',
            icon: 'mouse-pointer',
            active: selectMode,
            disabled: false,
            title: t('toolSelect'),
            onClick: toggleSelectMode,
          },
          {
            key: 'text',
            icon: 'type',
            active: textMode,
            disabled: false,
            title: t('toolText'),
            onClick: toggleTextMode,
          },
          {
            key: 'marker',
            icon: 'message-square',
            active: markerMode,
            disabled: isReadOnlySprint,
            title: isReadOnlySprint
              ? '마커는 현재 스프린트에서만 추가할 수 있습니다'
              : t('toolMarker'),
            onClick: toggleMarkerMode,
          },
          {
            key: 'zoom-in',
            icon: 'zoom-in',
            active: false,
            disabled: false,
            title: t('toolZoomIn'),
            onClick: () => zoomByStep(true),
          },
          {
            key: 'zoom-out',
            icon: 'zoom-out',
            active: false,
            disabled: false,
            title: t('toolZoomOut'),
            onClick: () => zoomByStep(false),
          },
          {
            key: 'hand',
            icon: 'hand',
            active: handTool,
            disabled: false,
            title: t('toolHand'),
            onClick: toggleHandTool,
          },
        ];
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              right: 16,
              padding: 4,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(30,42,53,0.10)',
              display: 'flex',
              flexDirection: 'row',
              gap: 2,
              zIndex: 14,
            }}
          >
            {tools.map((tool) => {
              const activeColor = tool.key === 'marker' ? C.coral : C.emerald;
              return (
                <button
                  key={tool.key}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (tool.disabled) return;
                    tool.onClick();
                  }}
                  title={tool.title}
                  disabled={tool.disabled}
                  style={{
                    width: 30,
                    height: 30,
                    border: 'none',
                    borderRadius: 5,
                    background: tool.active ? `${activeColor}1A` : 'transparent',
                    color: tool.active ? activeColor : C.fg3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: tool.disabled ? 'not-allowed' : 'pointer',
                    opacity: tool.disabled ? 0.5 : 1,
                    padding: 0,
                    transition: 'background 140ms ease, color 140ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (tool.disabled || tool.active) return;
                    e.currentTarget.style.background = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    if (tool.active) return;
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <Icon
                    name={tool.icon}
                    size={14}
                    color={tool.active ? activeColor : C.fg3}
                  />
                </button>
              );
            })}
          </div>
        );
      })()}

    </div>
  );
}

/** Integer sprint ≥ 1 for messages queries; otherwise null. */
function normalizeMessagesSprintNumber(n) {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? Math.trunc(v) : null;
}

// ─── Chat panel ──────────────────────────────────────────────
function ChatPanel({
  projectId,
  senderRole = 'engineer',
  width = 220,
  viewingSprintNumber,
  /** Raw timeline selection; included in deps so chat reloads when it changes even if the resolved sprint number matches the previous render. */
  viewingSprintTimeline = null,
  currentSprintNumber,
  onMakeConsensusClick,
  onOpenSprintSettings,
}) {
  const { t, lang } = useLang();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sendState, setSendState] = useState({ status: 'idle', message: '' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteState, setInviteState] = useState({ status: 'idle', message: '' });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserFullName, setCurrentUserFullName] = useState('');
  // Viewer-relative color resolver (email-keyed) for message avatars.
  const colorFor = useProjectColors(projectId, currentUserEmail);
  const scrollRef = useRef(null);
  const messagesLoadGenerationRef = useRef(0);

  function getAvatarInitials(displayName, email) {
    const name = String(displayName || '').trim();
    if (name) {
      const parts = name.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    const local = String(email || '').split('@')[0] || '';
    return (local.slice(0, 2) || 'US').toUpperCase();
  }

  useEffect(() => {
    let alive = true;
    async function loadCurrentUser() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      const email = String(data?.user?.email || '').trim().toLowerCase();
      const userId = data?.user?.id || null;
      setCurrentUserEmail(email);
      // Seed from auth user_metadata, then overwrite with the canonical profiles.full_name.
      setCurrentUserFullName(data?.user?.user_metadata?.full_name || '');
      if (userId) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        if (!alive) return;
        const profName = String(profileRow?.full_name || '').trim();
        if (profName) setCurrentUserFullName(profName);
      }
    }
    loadCurrentUser();

    // Subscribe to profile updates so name changes propagate immediately.
    let channel = null;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!alive || !userId) return;
      channel = supabase
        .channel(`profile-name-${userId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
          (payload) => {
            const next = payload.new || {};
            const nextName = String(next.full_name || '').trim();
            if (nextName) setCurrentUserFullName(nextName);
          },
        )
        .subscribe();
    })();

    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const loadGen = ++messagesLoadGenerationRef.current;

    if (
      !projectId ||
      viewingSprintNumber === null ||
      viewingSprintNumber === undefined
    ) {
      setMessages([]);
      return () => {};
    }

    const viewSn = normalizeMessagesSprintNumber(viewingSprintNumber);
    if (viewSn == null) {
      setMessages([]);
      return () => {};
    }

    setMessages([]);

    async function loadMessages() {
      // eslint-disable-next-line no-console
      console.log('[ChatPanel] loadMessages viewingSprintNumber', viewingSprintNumber, {
        normalizedSprintForQuery: viewSn,
        projectId,
      });

      let { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)
        .eq('sprint_number', viewSn)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error && /sender_name/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('messages')
          .select(
            'id, content, sender_role, sender_email, created_at, project_id, sprint_number',
          )
          .eq('project_id', projectId)
          .eq('sprint_number', viewSn)
          .order('created_at', { ascending: true })
          .limit(200));
      }
      if (error && /sender_email/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('messages')
          .select(
            'id, content, sender_role, sender_name, created_at, project_id, sprint_number',
          )
          .eq('project_id', projectId)
          .eq('sprint_number', viewSn)
          .order('created_at', { ascending: true })
          .limit(200));
      }

      if (error) {
        if (messagesLoadGenerationRef.current !== loadGen) return;
        setSendState({ status: 'error', message: error.message || 'Failed to load messages.' });
        return;
      }
      if (messagesLoadGenerationRef.current !== loadGen) return;
      const rows = data || [];
      const filtered = rows.filter(
        (row) => normalizeMessagesSprintNumber(row?.sprint_number) === viewSn,
      );
      setMessages(filtered);
    }

    loadMessages();

    // Build a project-scoped server-side filter (when projectId is present) so realtime
    // only forwards rows we care about; sprint_number is then checked client-side because
    // PostgREST's realtime filter accepts only a single eq() — project_id is the more
    // selective one and matches the load query.
    const projectFilter = projectId != null && projectId !== ''
      ? `project_id=eq.${projectId}`
      : undefined;

    const handleInsert = (payload) => {
      const next = payload.new || {};
      if (projectId && String(next.project_id) !== String(projectId)) return;
      const rowSn = normalizeMessagesSprintNumber(next.sprint_number);
      if (rowSn !== viewSn) return;
      setMessages((prev) => {
        // Defensive: skip if this id is already in state (load + echo race).
        if (next.id != null && prev.some((m) => String(m.id) === String(next.id))) return prev;
        return [...prev, next];
      });
    };
    const handleUpdate = (payload) => {
      const next = payload.new || {};
      if (projectId && String(next.project_id) !== String(projectId)) return;
      const rowSn = normalizeMessagesSprintNumber(next.sprint_number);
      if (rowSn !== viewSn) return;
      setMessages((prev) => prev.map((m) => (String(m.id) === String(next.id) ? { ...m, ...next } : m)));
    };
    const handleDelete = (payload) => {
      const old = payload.old || {};
      if (old.id == null) return;
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(old.id)));
    };

    const channel = supabase
      .channel(`messages-realtime-${projectId || 'global'}-${viewSn}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', ...(projectFilter ? { filter: projectFilter } : {}) },
        handleInsert,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', ...(projectFilter ? { filter: projectFilter } : {}) },
        handleUpdate,
      )
      .on(
        'postgres_changes',
        // DELETE filter on old columns needs REPLICA IDENTITY FULL on `messages`; accept
        // all DELETEs and filter client-side by id membership.
        { event: 'DELETE', schema: 'public', table: 'messages' },
        handleDelete,
      )
      .subscribe((status, err) => {
        // eslint-disable-next-line no-console
        console.log('[ChatPanel] messages realtime channel status', status, {
          projectId,
          viewSn,
          err: err?.message || null,
        });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, viewingSprintNumber, viewingSprintTimeline]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, lang]);

  async function onSendMessage() {
    const content = input.trim();
    if (!content) return;

    const messageSprint = normalizeMessagesSprintNumber(currentSprintNumber) ?? 1;

    setSendState({ status: 'sending', message: '' });

    // Always resolve sender_name from the canonical profiles.full_name at send time
    // to avoid sending stale cached names after a profile rename.
    let latestFullName = currentUserFullName;
    try {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (userId) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle();
        const freshName = String(profileRow?.full_name || '').trim();
        if (freshName) {
          latestFullName = freshName;
          if (freshName !== currentUserFullName) setCurrentUserFullName(freshName);
        }
      }
    } catch {
      // fall back to cached currentUserFullName
    }

    let { error } = await supabase.from('messages').insert({
      content,
      sender_role: senderRole,
      sender_name: latestFullName || null,
      sender_email: currentUserEmail || null,
      project_id: projectId || null,
      sprint_number: messageSprint,
    });

    // Fallback when sender_name column doesn't exist.
    if (error && /sender_name/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_email: currentUserEmail || null,
        project_id: projectId || null,
        sprint_number: messageSprint,
      });
      error = fallback.error;
    }

    // Fallback when project_id column doesn't exist.
    if (error && /project_id/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_name: latestFullName || null,
        sender_email: currentUserEmail || null,
        sprint_number: messageSprint,
      });
      error = fallback.error;
    }
    if (error && /sender_name/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_email: currentUserEmail || null,
        sprint_number: messageSprint,
      });
      error = fallback.error;
    }
    // Fallback when sender_email column doesn't exist.
    if (error && /sender_email/i.test(error.message || '')) {
      let fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_name: latestFullName || null,
        project_id: projectId || null,
        sprint_number: messageSprint,
      });
      error = fallback.error;
      if (error && /sender_name/i.test(error.message || '')) {
        fallback = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          project_id: projectId || null,
          sprint_number: messageSprint,
        });
        error = fallback.error;
      }
      if (error && /project_id/i.test(error.message || '')) {
        fallback = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_name: latestFullName || null,
          sprint_number: messageSprint,
        });
        error = fallback.error;
        if (error && /sender_name/i.test(error.message || '')) {
          fallback = await supabase.from('messages').insert({
            content,
            sender_role: senderRole,
            sprint_number: messageSprint,
          });
          error = fallback.error;
        }
      }
    }

    if (error && /sprint_number/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_name: latestFullName || null,
        sender_email: currentUserEmail || null,
        project_id: projectId || null,
      });
      error = fallback.error;
      if (error && /sender_name/i.test(error.message || '')) {
        const fb2 = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_email: currentUserEmail || null,
          project_id: projectId || null,
        });
        error = fb2.error;
      }
      if (error && /project_id/i.test(error.message || '')) {
        const fb3 = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_name: latestFullName || null,
          sender_email: currentUserEmail || null,
        });
        error = fb3.error;
      }
      if (error && /sender_name/i.test(error.message || '')) {
        const fb4 = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_email: currentUserEmail || null,
        });
        error = fb4.error;
      }
      if (error && /sender_email/i.test(error.message || '')) {
        let fb5 = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_name: latestFullName || null,
          project_id: projectId || null,
        });
        error = fb5.error;
        if (error && /sender_name/i.test(error.message || '')) {
          fb5 = await supabase.from('messages').insert({
            content,
            sender_role: senderRole,
            project_id: projectId || null,
          });
          error = fb5.error;
        }
        if (error && /project_id/i.test(error.message || '')) {
          fb5 = await supabase.from('messages').insert({
            content,
            sender_role: senderRole,
            sender_name: latestFullName || null,
          });
          error = fb5.error;
          if (error && /sender_name/i.test(error.message || '')) {
            fb5 = await supabase.from('messages').insert({
              content,
              sender_role: senderRole,
            });
            error = fb5.error;
          }
        }
      }
    }

    if (error) {
      setSendState({ status: 'error', message: error.message || 'Message send failed.' });
      return;
    }

    setInput('');
    setSendState({ status: 'idle', message: '' });
  }

  async function handleInvite(email) {
    const normalized = (email || '').trim().toLowerCase();
    if (!normalized || !projectId) return false;
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    if (!isEmail) {
      setInviteState({ status: 'error', message: t('inviteInvalidEmail') });
      return false;
    }

    const { data: authData } = await supabase.auth.getUser();
    const inviterId = authData?.user?.id || null;
    if (!inviterId) {
      setInviteState({ status: 'error', message: t('inviteAuthRequired') });
      return false;
    }

    setInviteState({ status: 'saving', message: '' });
    const { error } = await supabase.from('project_members').insert({
      project_id: projectId,
      invited_email: normalized,
      status: 'pending',
      invited_by: inviterId,
    });
    const isAlreadyInvited =
      String(error?.code) === '23505' || /duplicate|unique/i.test(error?.message || '');
    if (error) {
      // Keep going for duplicate pending rows so invite email can still be sent.
      if (isAlreadyInvited) {
        if (import.meta.env.DEV) {
          console.log('[handleInvite] Existing invite row found; proceeding to Edge Function call.', {
            projectId,
            email: normalized,
          });
        }
      } else {
      setInviteState({ status: 'error', message: error.message || t('inviteFailed') });
      return false;
      }
    }

    if (import.meta.env.DEV) {
      console.log('[handleInvite] Invoking Edge Function invite-project-member', {
        projectId: String(projectId),
        email: normalized,
      });
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token ?? null;
    const invitePayload = {
      email: normalized,
      projectId: String(projectId),
    };

    const { error: invokeError } = await supabase.functions.invoke('invite-project-member', {
      body: invitePayload,
      ...(accessToken
        ? { headers: { Authorization: `Bearer ${accessToken}` } }
        : {}),
    });
    if (import.meta.env.DEV) {
      console.log('[handleInvite] Edge Function invite-project-member result', {
        ok: !invokeError,
        error: invokeError?.message || null,
        projectId,
        email: normalized,
      });
    }
    if (invokeError) {
      if (!isAlreadyInvited) {
        await supabase
          .from('project_members')
          .delete()
          .eq('project_id', projectId)
          .eq('invited_email', normalized)
          .eq('invited_by', inviterId);
      }
      setInviteState({ status: 'error', message: invokeError.message || t('inviteEmailFailed') });
      return false;
    }

    setInviteState({ status: 'success', message: t('inviteSent') });
    return true;
  }

  return (
    <div
      style={{
        width,
        background: C.white,
        borderLeft: `1px solid ${C.borderSubtle}`,
        borderRight: `1px solid ${C.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        minWidth: 0,
        position: 'relative',
        zIndex: 0,
      }}
    >
      <div
        style={{
          padding: '10px 12px', borderBottom: `1px solid ${C.borderSubtle}`,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <Icon name="message-square" size={13} color={C.fg3} />
        <span style={{ fontSize: 11, fontWeight: 600, color: C.fg2 }}>{t('chatLabel')}</span>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          style={{
            marginLeft: 'auto',
            height: 24,
            borderRadius: 999,
            border: `1px solid ${C.emerald}`,
            background: '#fff',
            color: C.emerald,
            fontSize: 10,
            fontWeight: 600,
            padding: '0 10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {t('invite')}
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: 'auto', padding: '10px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 10, color: C.fg4, padding: '8px 0' }}>
            {t('chatNoMessagesYet')}
          </div>
        ) : messages.map((msg) => {
          const senderEmail = msg.sender_email || '';
          const senderName = String(msg.sender_name || '').trim();
          const emailPrefix = senderEmail.includes('@') ? senderEmail.split('@')[0] : '';
          const normalizedSenderEmail = String(senderEmail || '').trim().toLowerCase();
          const normalizedMyEmail = String(currentUserEmail || '').trim().toLowerCase();
          const isMine = Boolean(normalizedSenderEmail && normalizedMyEmail && normalizedSenderEmail === normalizedMyEmail);
          const userColor = colorFor(normalizedSenderEmail);
          const name = senderName || emailPrefix || (lang === 'ko' ? '사용자' : lang === 'zh' ? '用户' : 'User');
          const avatarLabel = getAvatarInitials(senderName || (isMine ? currentUserFullName : ''), senderEmail);
          const avatarBg = userColor;
          const text = msg.content || '';

          return (
            <div
              key={msg.id || `${msg.created_at}-${text}`}
              style={{ display: 'flex', gap: 6, justifyContent: isMine ? 'flex-end' : 'flex-start' }}
            >
              {!isMine ? (
                <div
                  style={{
                    width: 22, height: 22, borderRadius: 3,
                    background: avatarBg,
                    color: '#fff', fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    textTransform: 'uppercase',
                  }}
                >
                  {avatarLabel}
                </div>
              ) : null}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.fg2, marginBottom: 2 }}>
                  {name}
                </div>
                <div
                  style={{
                    fontSize: 11, color: C.fg2, lineHeight: 1.5,
                    background: isMine ? C.emeraldLight : C.subtle,
                    padding: '6px 8px',
                    borderRadius: isMine ? '5px 0 5px 5px' : '0 5px 5px 5px',
                    border: `1px solid ${isMine ? C.emeraldBorder : C.borderSubtle}`,
                  }}
                >
                  {text}
                </div>
              </div>
              {isMine ? (
                <div
                  style={{
                    width: 22, height: 22, borderRadius: 3,
                    background: avatarBg,
                    color: '#fff', fontSize: 9, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    textTransform: 'uppercase',
                  }}
                >
                  {avatarLabel}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div style={{ padding: '8px 10px', borderTop: `1px solid ${C.borderSubtle}` }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSendMessage();
              }
            }}
            placeholder={t('addComment')}
            style={{
              flex: 1, fontSize: 11, padding: '6px 8px',
              borderRadius: 4, border: `1px solid ${C.border}`,
              outline: 'none', fontFamily: 'inherit',
              background: C.subtle, color: C.fg1,
            }}
          />
          <button
            type="button"
            onClick={onSendMessage}
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
        {sendState.message ? (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              color: sendState.status === 'error' ? C.coral : C.emerald,
            }}
          >
            {sendState.message}
          </div>
        ) : null}
      </div>
      {typeof onMakeConsensusClick === 'function' ? (
        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${C.borderSubtle}`,
            display: 'flex',
            // Stretch makes the square Sprint Branches button match Make
            // Consensus' natural height (no fixed sizing race), so both
            // buttons share the same vertical footprint.
            alignItems: 'stretch',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onMakeConsensusClick}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = 'brightness(1.08)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = 'brightness(1)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
            }}
            title="Make Consensus"
            style={{
              flex: 1,
              minWidth: 0,
              padding: '10px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
              color: '#fff',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: 13,
              border: 'none',
              borderRadius: 999,
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
              transition: 'filter 160ms, box-shadow 160ms',
              // Keep the label on a single line so the icon button next to
              // it never forces a wrap when the chat panel narrows.
              whiteSpace: 'nowrap',
            }}
          >
            <Icon name="sparkles" size={16} color="#fff" />
            <span style={{ whiteSpace: 'nowrap' }}>Make Consensus</span>
          </button>
          {typeof onOpenSprintSettings === 'function' ? (
            <button
              type="button"
              onClick={onOpenSprintSettings}
              title="Sprint Branches"
              aria-label="Sprint Branches"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = C.white;
              }}
              style={{
                // No fixed width/height — `alignSelf: stretch` (inherited
                // from parent) matches Make Consensus' height, and
                // `aspectRatio: 1` makes the button a perfect square at
                // whatever that height is.
                alignSelf: 'stretch',
                aspectRatio: '1',
                flexShrink: 0,
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'background 140ms',
              }}
            >
              <Icon name="git-branch" size={20} color={C.fg2} />
            </button>
          ) : null}
        </div>
      ) : null}
      {inviteOpen
        ? createPortal(
            <>
              <div
                role="presentation"
                aria-hidden="true"
                onClick={() => setInviteOpen(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 9999,
                }}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="workspace-invite-dialog-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  zIndex: 10000,
                  width: 'min(400px, calc(100vw - 32px))',
                  backgroundColor: C.white,
                  borderRadius: 12,
                  padding: 24,
                  border: `1px solid ${C.borderSubtle}`,
                  boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div
                  id="workspace-invite-dialog-title"
                  style={{ fontSize: 14, fontWeight: 700, color: C.fg1 }}
                >
                  {t('invite')}
                </div>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('inviteEmailPlaceholder')}
                  style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    height: 34,
                    padding: '0 10px',
                    fontSize: 12,
                    color: C.fg1,
                    fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setInviteOpen(false)}
                    style={{
                      height: 30,
                      borderRadius: 4,
                      border: `1px solid ${C.border}`,
                      background: C.white,
                      color: C.fg2,
                      padding: '0 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                    }}
                  >
                    {lang === 'ko' ? '취소' : lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await handleInvite(inviteEmail);
                      if (ok) {
                        setTimeout(() => {
                          setInviteOpen(false);
                          setInviteEmail('');
                          setInviteState({ status: 'idle', message: '' });
                        }, 700);
                      }
                    }}
                    style={{
                      height: 30,
                      borderRadius: 4,
                      border: 'none',
                      background: C.emerald,
                      color: '#fff',
                      padding: '0 10px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: 'inherit',
                      fontWeight: 600,
                    }}
                  >
                    {t('sendInvite')}
                  </button>
                </div>
                {inviteState.message ? (
                  <div
                    style={{
                      fontSize: 11,
                      color: inviteState.status === 'error' ? C.coral : C.emerald,
                    }}
                  >
                    {inviteState.message}
                  </div>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

// ─── Radar chart ─────────────────────────────────────────────
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6 && h.length !== 3) return `rgba(62,120,170,${alpha})`;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const bigint = parseInt(full, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Radar (spider) chart for Value Matrix.
 * - Axes: project priorities (labels from getProjectPriorities); auto n-gon (4=square, 5=pentagon, 6=hex...).
 * - Concentric grid polygons at 25/50/75/100.
 * - Project series: cyan solid + glow + filled.
 * - User position series: dashed stroke + per-user color + light fill.
 * Position values are sliced/padded to the priorities axis length.
 */
function ValueMatrixChart({ priorities = [], positionValues = [], projectLineLabel = 'Project Priority', colorForName = null }) {
  const labels = (priorities || [])
    .map((p) => String(p?.label || '').trim())
    .filter((s) => s.length > 0);
  const projectVals = (priorities || []).map((p) => {
    const n = Number(p?.value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  });
  const n = labels.length;

  if (n === 0) {
    return (
      <div
        style={{
          padding: '16px 12px',
          fontSize: 11,
          color: '#9CA3AF',
          textAlign: 'center',
          border: '1px dashed #E5E7EB',
          borderRadius: 6,
        }}
      >
        No priorities are defined for this project yet.
      </div>
    );
  }

  // Square viewBox so radar stays centered; labels sit just outside the outer ring.
  // Polygon radius pulled in (105 → 92) and label offset trimmed (16 → 14) so
  // long axis labels ("Thermal Performance", "Price Competition") have room to
  // breathe on both sides without overflowing the 360-wide viewBox.
  const W = 360;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2;
  const R = 92;
  const labelOffset = 14;
  const LABEL_LINE_HEIGHT = 12;

  function vertex(value, i) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = (value / 100) * R;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  }

  function clampVal(v) {
    const num = Number(v);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
  }

  function ringPoints(level) {
    return labels
      .map((_, i) => vertex(level, i))
      .map((v) => `${v[0].toFixed(2)},${v[1].toFixed(2)}`)
      .join(' ');
  }

  function seriesPoints(vals) {
    return labels
      .map((_, i) => vertex(clampVal(vals[i]), i))
      .map((v) => `${v[0].toFixed(2)},${v[1].toFixed(2)}`)
      .join(' ');
  }

  function seriesVertices(vals) {
    return labels.map((_, i) => vertex(clampVal(vals[i]), i));
  }

  const gridLevels = [25, 50, 75, 100];

  const fallbackColors = ['#06b6d4', '#3b82f6', '#a855f7', '#f97316', '#ec4899'];
  const userSeries = (positionValues || []).map((pos, idx) => {
    const rawVals = Array.isArray(pos?.values) ? pos.values : [];
    // Prefer the member's central (email-keyed) color when the position can be
    // matched to a project member; else fall back to the AI/index color.
    const matched = typeof colorForName === 'function' ? colorForName(pos?.userName) : null;
    return {
      userName: String(pos?.userName || `Position ${idx + 1}`),
      color:
        matched
        || (typeof pos?.color === 'string' && pos.color.startsWith('#')
          ? pos.color
          : fallbackColors[idx % fallbackColors.length]),
      vals: labels.map((_, i) => clampVal(rawVals[i])),
    };
  });

  const hasAnalysis = userSeries.length > 0;
  const projectVerts = seriesVertices(projectVals);

  function labelPos(i) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const r = R + labelOffset;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    let anchor = 'middle';
    if (Math.cos(angle) > 0.25) anchor = 'start';
    else if (Math.cos(angle) < -0.25) anchor = 'end';
    // isTop = label sits above the chart's horizontal midline. Wrapped lines
    // there have to grow UPWARD from the anchor y so the bottom-most line
    // (visually closest to the polygon) lands where a single-line label
    // would have landed. Bottom/side labels grow downward, which is the
    // SVG `<tspan>` default.
    const isTop = Math.sin(angle) < -0.1;
    return { x, y: y + 3, anchor, isTop };
  }

  return (
    <div style={{ width: '100%' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="320"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* Concentric grid polygons */}
        {gridLevels.map((lvl) => (
          <polygon
            key={`g-${lvl}`}
            points={ringPoints(lvl)}
            fill={lvl === 100 ? '#F8FAFC' : 'none'}
            stroke="#E5E7EB"
            strokeWidth="1"
          />
        ))}

        {/* Spokes */}
        {labels.map((_, i) => {
          const p = vertex(100, i);
          return (
            <line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={p[0]}
              y2={p[1]}
              stroke="#E5E7EB"
              strokeWidth="1"
            />
          );
        })}

        {/* Grid level numbers along top spoke */}
        {gridLevels.map((lvl) => {
          const p = vertex(lvl, 0);
          return (
            <text
              key={`gl-${lvl}`}
              x={p[0] + 4}
              y={p[1] + 3}
              style={{ fontSize: 8, fill: '#CBD5E1', fontFamily: 'Inter,sans-serif' }}
            >
              {lvl}
            </text>
          );
        })}

        {/* Axis labels — multi-word labels wrap one word per line via <tspan>
            so the fontSize stays untouched while "Thermal Performance" /
            "Price Competition" / "Design Appeal" fit without ellipsis. */}
        {labels.map((lbl, i) => {
          const lp = labelPos(i);
          const words = String(lbl).split(/\s+/).filter(Boolean);
          const lineCount = Math.max(1, words.length);
          const yStart = lp.isTop
            ? lp.y - (lineCount - 1) * LABEL_LINE_HEIGHT
            : lp.y;
          return (
            <text
              key={`l-${i}`}
              x={lp.x}
              y={yStart}
              textAnchor={lp.anchor}
              style={{ fontSize: 10, fill: '#62788A', fontFamily: 'Inter,sans-serif' }}
            >
              {words.map((word, j) => (
                <tspan
                  key={`l-${i}-${j}`}
                  x={lp.x}
                  dy={j === 0 ? 0 : LABEL_LINE_HEIGHT}
                >
                  {word}
                </tspan>
              ))}
            </text>
          );
        })}

        {/* User series (drawn beneath the project polygon) */}
        {userSeries.map((s) => {
          const verts = seriesVertices(s.vals);
          return (
            <g key={`series-${s.userName}`}>
              <polygon
                points={seriesPoints(s.vals)}
                fill={hexToRgba(s.color, 0.10)}
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray="4 2"
                strokeLinejoin="round"
              />
              {verts.map((v, i) => (
                <circle
                  key={`d-${s.userName}-${i}`}
                  cx={v[0]}
                  cy={v[1]}
                  r="3"
                  fill={s.color}
                />
              ))}
            </g>
          );
        })}

        {/* Project series (top layer, glowing) */}
        <g style={{ filter: 'drop-shadow(0 0 4px rgba(6,182,212,0.6))' }}>
          <polygon
            points={seriesPoints(projectVals)}
            fill="rgba(6,182,212,0.15)"
            stroke="#06B6D4"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {projectVerts.map((v, i) => (
            <circle key={`pd-${i}`} cx={v[0]} cy={v[1]} r="4" fill="#06B6D4" />
          ))}
        </g>
      </svg>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          justifyContent: 'center',
          marginTop: 8,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 10,
            color: '#374151',
            fontFamily: 'Inter,sans-serif',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 16,
              height: 2.5,
              background: '#06B6D4',
              borderRadius: 2,
            }}
          />
          {projectLineLabel}
        </span>
        {userSeries.map((s) => (
          <span
            key={`lg-${s.userName}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: '#374151',
              fontFamily: 'Inter,sans-serif',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 16,
                height: 0,
                borderTop: `2px dashed ${s.color}`,
              }}
            />
            {s.userName}
          </span>
        ))}
      </div>

      {!hasAnalysis ? (
        <div
          style={{
            marginTop: 8,
            textAlign: 'center',
            fontSize: 10,
            color: '#9CA3AF',
            fontFamily: 'Inter,sans-serif',
          }}
        >
          분석 후 참여자별 다각형이 추가됩니다
        </div>
      ) : null}
    </div>
  );
}

/** Loads chat rows for AI analysis (same table as ChatPanel; tolerant of missing columns). */
async function fetchProjectChatMessagesForAI(projectId, sprintNumber) {
  if (!projectId) return [];
  const sn = normalizeMessagesSprintNumber(sprintNumber);
  if (sn == null) return [];

  let q = supabase
    .from('messages')
    .select('id, content, sender_role, sender_name, sender_email, created_at, project_id')
    .eq('project_id', projectId)
    .eq('sprint_number', sn)
    .order('created_at', { ascending: true })
    .limit(200);
  let { data, error } = await q;
  if (error && /sender_name/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('messages')
      .select('id, content, sender_role, sender_email, created_at, project_id')
      .eq('project_id', projectId)
      .eq('sprint_number', sn)
      .order('created_at', { ascending: true })
      .limit(200));
  }
  if (error && /sprint_number/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('messages')
      .select('id, content, sender_role, sender_name, sender_email, created_at, project_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(200));
    if (error && /sender_name/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('messages')
        .select('id, content, sender_role, sender_email, created_at, project_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .limit(200));
    }
  }
  if (error && /project_id/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('messages')
      .select('id, content, sender_role, sender_name, sender_email, created_at')
      .order('created_at', { ascending: true })
      .limit(200));
  }
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[fetchProjectChatMessagesForAI]', error.message);
    }
    return [];
  }
  return data || [];
}


// ─── Conflict panel ──────────────────────────────────────────
function ConflictPanel({
  width,
  projectId,
  sprintNumber,
  currentSprintNumber = null,
  ownerUserId = null,
  consensusNote = '',
  onSaveConsensusNote,
  onApprove,
  onReject,
  onReachConsensus,
  onSaveConsensusRecord,
  onAdvanceViewingSprint,
  onCreateNextSprint = null,
  geminiProject = null,
  designImageUrls = [],
  isOwner = false,
  onCloseRequest = null,
}) {
  const { t, lang } = useLang();
  const [appHov, setAppHov] = useState(false);
  const [conHov, setConHov] = useState(false);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  // Inline alternative-vote comment-entry state.
  const [altVoteMode, setAltVoteMode] = useState(null); // null | 'approve' | 'oppose'
  const [altVoteCommentDraft, setAltVoteCommentDraft] = useState('');
  // Inline Save Consensus + Create Next Sprint UI state.
  const [savingConsensusInline, setSavingConsensusInline] = useState(false);
  const [savedToastVisible, setSavedToastVisible] = useState(false);
  const [creatingNextSprint, setCreatingNextSprint] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [aiAlternativeLoading, setAiAlternativeLoading] = useState(false);
  const [alternativeError, setAlternativeError] = useState(null);
  const [alternativeRequested, setAlternativeRequested] = useState(false);
  const [consensusPanelTab, setConsensusPanelTab] = useState('ai');
  const [activeConflictExpanded, setActiveConflictExpanded] = useState(false);
  const [expandedPositions, setExpandedPositions] = useState({});
  const [conflictDraft, setConflictDraft] = useState('');
  const [resolutionDraft, setResolutionDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [memoLocked, setMemoLocked] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [oppHov, setOppHov] = useState(false);
  const [voteSaving, setVoteSaving] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [voteMap, setVoteMap] = useState({});
  const [authUid, setAuthUid] = useState(null);
  const [consensusRecord, setConsensusRecord] = useState(null);
  const [isEditingConsensus, setIsEditingConsensus] = useState(false);
  const [editedConflict, setEditedConflict] = useState('');
  const [editedResolution, setEditedResolution] = useState('');
  const [editedNote, setEditedNote] = useState('');
  const [savingConsensus, setSavingConsensus] = useState(false);
  const participantsRef = useRef([]);
  const unanimousNavLockRef = useRef(false);
  /** Broadcast + postgres listener share this subscription (postges may not reach peer clients under some RLS/Realtime setups). */
  const voteSyncChannelRef = useRef(null);
  const onApproveRef = useRef(onApprove);

  useEffect(() => {
    onApproveRef.current = onApprove;
  }, [onApprove]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  const sprintVoteKeyOk = Boolean(
    projectId && resolveSprintVotesSprintNumber(sprintNumber) != null,
  );

  const loadVotes = useCallback(async () => {
    // sprint_votes has no project_id/sprint_number columns — votes live in
    // sprint_ai_analysis.alternative_votes. Seed the map from the participant
    // list (everyone starts unvoted) and let upstream consumers (the analysis
    // realtime channel) fill in actual approvals.
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null) {
      setVoteMap({});
      return {};
    }
    const next = {};
    (participantsRef.current || []).forEach((p) => {
      const uid = normalizeParticipantUserId(p.userId);
      if (uid && !(uid in next)) next[uid] = null;
    });
    setVoteMap(next);
    return next;
  }, [projectId, sprintNumber]);

  const loadParticipants = useCallback(async () => {
    if (!projectId) {
      setParticipants([]);
      return [];
    }
    const { data: authRow } = await supabase.auth.getUser();
    const authUser = authRow?.user ?? null;
    const authSelfId = normalizeParticipantUserId(authUser?.id);
    const authSelfFullName = authUser?.user_metadata?.full_name ?? '';

    /** Owner id from props or DB so profile lookup always includes creator. */
    let resolvedOwnerId = normalizeParticipantUserId(ownerUserId);
    if (!resolvedOwnerId) {
      const { data: projRow } = await supabase
        .from('projects')
        .select('user_id')
        .eq('id', projectId)
        .maybeSingle();
      resolvedOwnerId = normalizeParticipantUserId(projRow?.user_id);
    }

    const { data: rows } = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId);

    const seen = new Set();
    const tentative = [];

    if (resolvedOwnerId) {
      seen.add(resolvedOwnerId);
      tentative.push({
        key: `owner:${resolvedOwnerId}`,
        userId: resolvedOwnerId,
        email: null,
      });
    }

    (rows || []).forEach((row) => {
      const linkedRaw = pickLinkedMemberUid(row);
      const linked = normalizeParticipantUserId(linkedRaw);
      const email = String(row.invited_email || '').trim() || null;
      if (linked && seen.has(linked)) return;

      if (linked) {
        seen.add(linked);
        tentative.push({
          key: `m:${linked}`,
          userId: linked,
          email,
        });
        return;
      }
      tentative.push({
        key: email ? `e:${email}` : `row:${row.id || 'unknown'}`,
        userId: null,
        email,
      });
    });

    const idsFromParticipants = tentative
      .map((t) => t.userId)
      .filter(Boolean);
    const profileIds = [
      ...new Set([
        ...(resolvedOwnerId ? [resolvedOwnerId] : []),
        ...idsFromParticipants,
      ]),
    ].filter(Boolean);

    const {
      profileFullNameById,
      profileRowsRaw,
      profileFetchErr,
    } = await fetchProfileFullNamesMap(supabase, profileIds);

    const returnedIds = new Set(
      (profileRowsRaw || [])
        .map((r) => normalizeParticipantUserId(r?.id))
        .filter(Boolean),
    );
    const missingUserIdsNoProfileRow = profileIds.filter((pid) => !returnedIds.has(pid));

    if (import.meta.env.DEV) {
      console.log('[ConflictPanel] profiles lookup', {
        requestedProfileIds: [...profileIds],
        profileRowCount: profileRowsRaw?.length ?? 0,
        profileRowsRaw,
        mappedFullNamesById: { ...profileFullNameById },
        missingUserIdsNoProfileRow,
        projectId,
        resolvedOwnerId,
        profilesQuerySkipped: profileIds.length === 0,
        profileQueryError: profileFetchErr?.message ?? null,
      });
    }

    const list = tentative.map((t) => ({
      key: t.key,
      userId: t.userId ?? null,
      email: t.email ?? null,
      label: participantVoteDisplayName({
        userId: t.userId,
        email: t.email,
        authSelfId,
        authSelfFullName,
        profileFullNameById,
      }),
    }));

    list.sort((a, b) => String(a.label).localeCompare(String(b.label)));
    setParticipants(list);
    return list;
  }, [projectId, ownerUserId]);

  /** Every linked participant must have vote === VOTE_STATUS.APPROVE in sprint_votes. Pending invites without user_id cannot vote yet and do not satisfy or block quorum. Never pass when nobody has a uid. */
  function allLinkedParticipantsApproved(participantsList, votesMap) {
    const ids = [];
    participantsList.forEach((p) => {
      const id = normalizeParticipantUserId(p.userId);
      if (id && !ids.includes(id)) ids.push(id);
    });
    if (ids.length === 0) return false;
    return ids.every((userId) => votesMap[userId] === VOTE_STATUS.APPROVE);
  }

  // STEP 5: resolve an AI value-matrix position's userName → that member's
  // stable color (email-keyed central system), so radar lines match avatars
  // elsewhere. Best-effort: unmatched / email-less positions return null and
  // keep their AI/index color.
  const valueMatrixColorForName = useCallback(
    (userName) => {
      const key = String(userName || '').trim().toLowerCase();
      if (!key) return null;
      const hit = participants.find(
        (p) => String(p.label || '').trim().toLowerCase() === key,
      );
      const email = hit?.email ? String(hit.email).trim().toLowerCase() : '';
      return email ? baseColorForUser(email) : null;
    },
    [participants],
  );

  const runUnanimousConsensusCheck = useCallback(
    async (source) => {
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][SYNC] unanimous check:start', {
          source,
          projectId,
          sprintNumber,
          authUidPresent: !!authUid,
          sprintVoteKeyOk,
        });
      }
      if (!authUid || !sprintVoteKeyOk) {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][SYNC] unanimous check:skip (auth or sprint key)');
        }
        return;
      }

      const votesMapFresh = await loadVotes();
      const participantsListFresh = await loadParticipants();

      const requiredIds = [];
      participantsListFresh.forEach((p) => {
        const id = normalizeParticipantUserId(p.userId);
        if (id && !requiredIds.includes(id)) requiredIds.push(id);
      });

      const participantRowsForLog = participantsListFresh.map((p) => {
        const uid = normalizeParticipantUserId(p.userId);
        return {
          key: p.key,
          label: p.label,
          userId: uid,
          vote: uid ? votesMapFresh[uid] ?? null : '(no linked account)',
        };
      });
      const approveCount = requiredIds.filter(
        (id) => votesMapFresh[id] === VOTE_STATUS.APPROVE,
      ).length;

      const allApprovedFlag = allLinkedParticipantsApproved(
        participantsListFresh,
        votesMapFresh,
      );

      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][SYNC] unanimous check:tally', {
          source,
          projectId,
          sprintNumber,
          requiredMemberCount: requiredIds.length,
          approveCount,
          allApproved: allApprovedFlag,
          participants: participantRowsForLog,
        });
      }

      if (!allApprovedFlag) {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][SYNC] unanimous check:wait others');
        }
        return;
      }

      // Note: auto-invocation of onApprove (which opened the ConsensusModal and advanced
      // the sprint) is intentionally removed. The new flow shows an inline result in the
      // Make Consensus panel and requires the owner to click Save Consensus explicitly.
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][SYNC] unanimous check:all approved (waiting for owner Save Consensus click)', {
          source,
        });
      }
    },
    [
      authUid,
      sprintVoteKeyOk,
      projectId,
      sprintNumber,
      loadVotes,
      loadParticipants,
    ],
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthUid(normalizeParticipantUserId(data?.user?.id ?? null));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUid(normalizeParticipantUserId(session?.user?.id ?? null));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    unanimousNavLockRef.current = false;
    conflictUnanimousNavToken = null;
  }, [projectId, sprintNumber]);

  useEffect(() => {
    const next = String(consensusNote ?? '');
    setNoteDraft(next);
    setMemoLocked(Boolean(next.trim()));
  }, [consensusNote]);

  useEffect(() => {
    setConflictDraft('');
    setResolutionDraft('');
    setNoteDraft('');
    setMemoLocked(false);
    setSavingMemo(false);
    setActiveConflictExpanded(false);
    setExpandedPositions({});
    setAiAnalysisLoading(false);
    setIsEditingConsensus(false);
    setEditedConflict('');
    setEditedResolution('');
    setEditedNote('');
  }, [sprintNumber]);

  useEffect(() => {
    loadVotes();
  }, [loadVotes, participants]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    setAlternativeRequested(false);
    setAlternativeError(null);
  }, [projectId, sprintNumber]);

  useEffect(() => {
    let cancelled = false;
    async function loadStoredAnalysis() {
      const sn = resolveSprintVotesSprintNumber(sprintNumber);
      if (!projectId || sn == null) {
        if (!cancelled) {
          setAiAnalysisResult(null);
          setConsensusRecord(null);
        }
        return;
      }

      const aiRes = await supabase
        .from('sprint_ai_analysis')
        .select('analysis_result')
        .eq('project_id', projectId)
        .eq('sprint_number', sn)
        .maybeSingle();
      if (cancelled) return;
      if (aiRes.error) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel] analysis_result load failed:', aiRes.error.message);
      }
      if (!cancelled) {
        setAiAnalysisResult(aiRes.data?.analysis_result ?? null);
      }

      const crRes = await supabase
        .from('sprint_ai_analysis')
        .select('consensus_record')
        .eq('project_id', projectId)
        .eq('sprint_number', sn)
        .maybeSingle();
      if (cancelled) return;
      if (crRes.error) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel] consensus_record load failed:', crRes.error.message);
        if (!cancelled) setConsensusRecord(null);
      } else if (!cancelled) {
        // eslint-disable-next-line no-console
        console.log('[ConflictPanel] consensus_record loaded for sprint', sn, ':', crRes.data?.consensus_record);
        setConsensusRecord(crRes.data?.consensus_record ?? null);
      }
    }
    loadStoredAnalysis();
    return () => {
      cancelled = true;
    };
  }, [projectId, sprintNumber]);

  useEffect(() => {
    if (!projectId) return undefined;
    const channelName = `sprint-ai-analysis-${projectId}`;
    const ch = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sprint_ai_analysis',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const row = payload.new ?? payload.old ?? null;
          if (!row) return;
          const rowSn = resolveSprintVotesSprintNumber(row.sprint_number);
          const sn = resolveSprintVotesSprintNumber(sprintNumber);
          if (rowSn == null || sn == null || rowSn !== sn) return;
          // analysis_result update
          if (row.analysis_result) {
            setAiAnalysisResult(row.analysis_result);
          }
          // consensus_record update (so peers see the saved record without a refresh)
          if (Object.prototype.hasOwnProperty.call(row, 'consensus_record')) {
            setConsensusRecord(row.consensus_record ?? null);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [projectId, sprintNumber]);

  /**
   * Vote sync Realtime on one channel per project:
   * - postgres_changes INSERT/UPDATE on `sprint_votes` → re-check unanimous consensus for this sprint.
   * - broadcast REALTIME_BROADCAST_EVENTS.SPRINT_VOTES_REFRESH → peer notify when Postgres events don’t arrive (RLS/client gaps).
   * - postgres_changes * on `project_members` → refresh participant list (invites / linked accounts).
   */
  useEffect(() => {
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null) {
      voteSyncChannelRef.current = null;
      return undefined;
    }

    const filterProject = eqColumnFilter('project_id', projectId);
    const channelTopic = REALTIME_CHANNELS.VOTE_SYNC(projectId);
    let subscribedOk = false;

    const handlePostgresVote = async (eventName, payload) => {
      const row = payload?.new ?? payload?.old ?? null;
      const rowSn = resolveSprintVotesSprintNumber(row?.sprint_number);
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][RT][pg] postgres_changes', {
          step: 'event',
          eventName,
          eventTypeField: payload?.eventType ?? null,
          rowSn,
          scopedSprint: sn,
          matchesSprint: rowSn === sn,
          rowBrief: row
            ? { user_id: row.user_id, vote: row.vote, sprint_number: row.sprint_number }
            : null,
        });
      }
      if (rowSn == null || rowSn !== sn) return;
      await runUnanimousConsensusCheck(`postgres_changes:${eventName}`);
    };

    const handleBroadcastRefresh = async (msg) => {
      const inner = msg?.payload ?? msg ?? {};
      const pId = inner?.projectId;
      const spr = resolveSprintVotesSprintNumber(inner?.sprintNumber);
      if (import.meta.env.DEV) {
        console.log(
          `[ConflictPanel][RT][bc] broadcast ${REALTIME_BROADCAST_EVENTS.SPRINT_VOTES_REFRESH}`,
          {
            step: 'recv',
            msg,
            inner,
          },
        );
      }
      if (String(pId) !== String(projectId) || spr !== sn) {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][RT][bc] ignored (wrong project/sprint)', { pId, spr });
        }
        return;
      }
      await runUnanimousConsensusCheck(
        `broadcast:${REALTIME_BROADCAST_EVENTS.SPRINT_VOTES_REFRESH}`,
      );
    };

    const ch = createVoteSyncRealtimeChannel(supabase, {
      channelTopic,
      filterProject,
      onSprintVoteInsert: (payload) => {
        void handlePostgresVote('INSERT', payload);
      },
      onSprintVoteUpdate: (payload) => {
        void handlePostgresVote('UPDATE', payload);
      },
      onBroadcast: (msg) => {
        void handleBroadcastRefresh(msg);
      },
      onProjectMembersChange: () => {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][RT][pg] project_members:* → loadParticipants()');
        }
        void loadParticipants();
      },
    });
    ch.subscribe((status, err) => {
      subscribedOk = status === 'SUBSCRIBED';
      if (subscribedOk) {
        voteSyncChannelRef.current = ch;
      } else if (
        status === 'CHANNEL_ERROR'
        || status === 'TIMED_OUT'
        || status === 'CLOSED'
      ) {
        voteSyncChannelRef.current = null;
      }
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][RT] subscribe', {
          channelTopic,
          scopedSprint: sn,
          filterProject,
          status,
          subscribedOk,
          subscribeErr:
            typeof err?.message === 'string' ? err.message : err != null ? String(err) : null,
        });
      }
    });

    return () => {
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][RT] unsubscribe', { channelTopic, hadSubscribed: subscribedOk });
      }
      voteSyncChannelRef.current = null;
      void supabase.removeChannel(ch);
    };
  }, [projectId, sprintNumber, loadParticipants, loadVotes, runUnanimousConsensusCheck]);

  async function castVote(kind) {
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null) return false;

    const { data: authPayload, error: authErr } = await supabase.auth.getUser();
    const sessionUser = authPayload?.user ?? null;
    if (authErr) {
      // eslint-disable-next-line no-console
      console.error('[ConflictPanel] castVote auth error', authErr.message);
      return false;
    }
    const uidRaw = sessionUser?.id;
    const uid = normalizeParticipantUserId(uidRaw);
    if (!uid) {
      // eslint-disable-next-line no-console
      console.warn('[ConflictPanel] castVote no user id — not signed in?');
      return false;
    }

    const voteValue =
      kind === VOTE_STATUS.APPROVE ? VOTE_STATUS.APPROVE : VOTE_STATUS.OPPOSE;
    if (import.meta.env.DEV) {
      console.log('[ConflictPanel] castVote submitting', {
        voterUserId: uid,
        vote: voteValue,
        projectId,
        sprintNumber: sn,
        sessionEmail: sessionUser?.email ?? null,
      });
    }

    setVoteSaving(true);
    try {
      const { error } = await supabase.from('sprint_votes').upsert(
        {
          project_id: projectId,
          sprint_number: sn,
          user_id: uid,
          vote: voteValue,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,sprint_number,user_id' },
      );

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[sprint_votes]', error.message);
        return false;
      }
      const map = await loadVotes();
      const broadcastPayload = { projectId, sprintNumber: sn };
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][SYNC] flush broadcast (retry until channel SUBSCRIBED)', broadcastPayload);
      }

      let broadcastSent = false;
      let lastBroadcastErr = null;

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const ch = voteSyncChannelRef.current;
        if (ch) {
          // eslint-disable-next-line no-await-in-loop
          const { error: bErr } = await ch.send({
            type: 'broadcast',
            event: REALTIME_BROADCAST_EVENTS.SPRINT_VOTES_REFRESH,
            payload: broadcastPayload,
          });
          lastBroadcastErr = bErr?.message ?? null;
          if (!bErr) {
            broadcastSent = true;
            if (import.meta.env.DEV) {
              console.log('[ConflictPanel][SYNC] broadcast send sprint_votes_refresh OK', {
                attempt,
                ...broadcastPayload,
              });
            }
            break;
          }
          // eslint-disable-next-line no-console
          console.warn('[ConflictPanel][SYNC] broadcast send error (retrying)', {
            attempt,
            broadcastError: lastBroadcastErr,
            ...broadcastPayload,
          });
        } else if (attempt === 0) {
          if (import.meta.env.DEV) {
            console.log('[ConflictPanel][SYNC] vote channel not ready yet, waiting…', broadcastPayload);
          }
        }
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise((r) => window.setTimeout(r, 75));
      }

      if (!broadcastSent) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel][SYNC] broadcast NOT delivered after retries', {
          ...broadcastPayload,
          lastBroadcastErr,
          hadChannelRef: Boolean(voteSyncChannelRef.current),
        });
      }
      return map;
    } finally {
      setVoteSaving(false);
    }
  }

  async function handleApproveVoteClick() {
    const map = await castVote(VOTE_STATUS.APPROVE);
    if (map === false) return;
    await runUnanimousConsensusCheck('local-after-approve-click');
  }

  async function handleOpposeVoteClick() {
    await castVote(VOTE_STATUS.OPPOSE);
  }

  async function saveAnalysisResult(result) {
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null || !isOwner || !authUid) return;
    const { error } = await supabase.from('sprint_ai_analysis').upsert(
      {
        project_id: projectId,
        sprint_number: sn,
        analysis_result: result,
        created_by: authUid,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,sprint_number' },
    );
    if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[ConflictPanel] sprint_ai_analysis upsert', error.message);
    }
  }

  async function handleRequestAIAnalysis() {
    if (!isOwner || aiAnalysisLoading) return;
    setAiAnalysisLoading(true);
    setAiAnalysisResult(null);
    setAlternativeRequested(false);
    setAlternativeError(null);
    try {
      const chatRows = await fetchProjectChatMessagesForAI(projectId, sprintNumber);
      const chatMessages = chatRows.map((m) => ({
        content: String(m.content ?? ''),
        senderName: String(m.sender_name || m.sender_email || 'User'),
        senderRole: String(m.sender_role || 'member'),
      }));

      const participantRows = await loadParticipants();
      const participantsForAi = participantRows
        .filter((p) => p.userId)
        .map((p) => ({
          userId: String(normalizeParticipantUserId(p.userId)),
          name: String(p.label),
          role: 'Member',
        }))
        .filter((p, i, arr) => arr.findIndex((x) => x.userId === p.userId) === i);

      const gp = geminiProject || {};
      const result = await requestGeminiAnalysis({
        project: {
          name: gp.name,
          description_short: gp.description_short,
          north_star: gp.north_star,
          priority_aesthetics_functionality: gp.priority_aesthetics_functionality,
          priority_cost_quality: gp.priority_cost_quality,
          priority_speed_stability: gp.priority_speed_stability,
          priorities: gp.priorities,
        },
        chatMessages,
        participants: participantsForAi,
        designImageUrls: Array.isArray(designImageUrls) ? designImageUrls : [],
        language: lang,
      });

      // Strip alternative so the user must explicitly request it via
      // "Request Alternative Proposal" — that flow uses requestGeminiAlternative.
      const { alternative: _stripped, ...analysisOnly } = result || {};
      setAiAnalysisResult(analysisOnly);
      setAlternativeError(null);
      await saveAnalysisResult(analysisOnly);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('AI Analysis failed:', error);
      const errPayload = {
        canAnalyze: false,
        reason: 'error',
        message: `${t('aiAnalysisErrorPrefix')}${error?.message || String(error)}`,
      };
      setAiAnalysisResult(errPayload);
      await saveAnalysisResult(errPayload);
    } finally {
      setAiAnalysisLoading(false);
    }
  }

  async function handleRequestAlternative() {
    if (aiAlternativeLoading || aiAnalysisLoading) return;
    if (!aiAnalysisResult?.canAnalyze) return;
    // Alternative already cached → just reveal it.
    if (aiAnalysisResult.alternative) {
      setAlternativeRequested(true);
      setAlternativeError(null);
      return;
    }
    if (!isOwner) return;
    setAiAlternativeLoading(true);
    setAlternativeError(null);
    try {
      const gp = geminiProject || {};
      const alternative = await requestGeminiAlternative({
        project: {
          name: gp.name,
          north_star: gp.north_star,
          priority_aesthetics_functionality: gp.priority_aesthetics_functionality,
          priority_cost_quality: gp.priority_cost_quality,
          priority_speed_stability: gp.priority_speed_stability,
          priorities: gp.priorities,
        },
        analysis: aiAnalysisResult,
        language: lang,
      });
      const merged = { ...aiAnalysisResult, alternative };
      if (aiAnalysisResult?.alternative?.title !== alternative.title) {
        merged.alternative_votes = {};
      }
      setAiAnalysisResult(merged);
      setAlternativeRequested(true);
      await saveAnalysisResult(merged);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Alternative generation failed:', error);
      setAlternativeError(error?.message || String(error));
    } finally {
      setAiAlternativeLoading(false);
    }
  }

  // Persist only the analysis_result column without the owner gate, so any signed-in
  // member can record their vote on the alternative proposal.
  async function saveAlternativeVotesOnly(merged) {
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null || !authUid) return;
    const { error } = await supabase
      .from('sprint_ai_analysis')
      .update({ analysis_result: merged, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('sprint_number', sn);
    if (error && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[saveAlternativeVotesOnly] update failed', error);
    }
  }

  // Records a vote. `choice` is 'approve' | 'oppose' | null (null clears the vote).
  // `comment` is the optional free-text rationale. Stored as
  //   alternative_votes[userId] = { vote, comment, votedAt }
  // (legacy string values are tolerated on read).
  async function handleAlternativeVote(choice, comment = '') {
    if (!authUid) return;
    if (!aiAnalysisResult?.alternative) return;
    const prevVotes = (aiAnalysisResult.alternative_votes && typeof aiAnalysisResult.alternative_votes === 'object')
      ? { ...aiAnalysisResult.alternative_votes }
      : {};
    const nextVotes = { ...prevVotes };
    if (choice == null) {
      delete nextVotes[authUid];
    } else {
      nextVotes[authUid] = {
        vote: choice,
        comment: String(comment || ''),
        votedAt: Date.now(),
      };
    }
    const merged = { ...aiAnalysisResult, alternative_votes: nextVotes };
    setAiAnalysisResult(merged);
    // Owner edits go through the canonical save (which also tracks created_by);
    // anyone else just patches analysis_result.
    if (isOwner) await saveAnalysisResult(merged);
    else await saveAlternativeVotesOnly(merged);
  }

  // Inline comment-entry state for the alternative-vote flow.
  // null = show the Approve / Suggest Alternative buttons.
  // 'approve' | 'oppose' = the user picked a side; show the comment textarea.
  // (kept here next to the handler so the dependency is obvious.)

  function switchMockScenario(scenario) {
    if (!isOwner) return;
    if (scenario === 'normal') setAiAnalysisResult(mockAIAnalysisResult);
    if (scenario === 'insufficient') setAiAnalysisResult(mockInsufficientChat);
  }

  function togglePosition(userId) {
    setExpandedPositions((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }

  async function handleReachConsensusClick() {
    if (memoLocked || !noteDraft.trim() || savingMemo) return;
    setSavingMemo(true);
    try {
      const saved = await onSaveConsensusNote(noteDraft.trim());
      if (saved === false) return;
      setMemoLocked(true);
      await onReachConsensus({
        analysis: aiAnalysisResult,
        manualConflict: conflictDraft.trim(),
        manualResolution: resolutionDraft.trim(),
        manualNote: noteDraft.trim(),
        allParticipants: participants,
      });
    } finally {
      setSavingMemo(false);
    }
  }

  const hasNoteText = Boolean(noteDraft.trim());
  const reachEnabled = hasNoteText && !memoLocked && !savingMemo;

  const showVoteWaitingOthers =
    !!(
      authUid
      && voteMap[authUid] === VOTE_STATUS.APPROVE
      && !allLinkedParticipantsApproved(participants, voteMap)
    );

  const isCompletedSprint =
    Number.isFinite(sprintNumber) &&
    Number.isFinite(currentSprintNumber) &&
    sprintNumber < currentSprintNumber;
  // Show the inline saved-consensus result panel whenever we have a record — on both the
  // current sprint (right after Save Consensus) and on past sprints (history view).
  const showConsensusResultPanel = consensusRecord != null;

  // Have all linked members cast an alternative vote (approve or oppose)? Used to gate
  // the inline Save Consensus button in the AI Analysis tab.
  const allMembersVotedOnAlternative = (() => {
    const linked = participants.filter((p) => p.userId);
    if (linked.length === 0) return false;
    const altMap = aiAnalysisResult?.alternative_votes || {};
    let votedCount = 0;
    for (const p of linked) {
      const uidNorm = normalizeParticipantUserId(p.userId);
      const rec = uidNorm ? (altMap[uidNorm] || altMap[p.userId]) : undefined;
      const v = typeof rec === 'string' ? rec : rec?.vote;
      if (v === 'approve' || v === 'oppose') votedCount += 1;
    }
    return votedCount === linked.length;
  })();

  // Persist the consensus record by reusing the parent's onApprove (which writes
  // sprint_ai_analysis.consensus_record) and then refetch so the inline view updates.
  async function handleSaveConsensusInline() {
    if (savingConsensusInline || consensusRecord || !isOwner) return;
    setSavingConsensusInline(true);
    try {
      await onApproveRef.current?.(aiAnalysisResult);
      const sn = resolveSprintVotesSprintNumber(sprintNumber);
      if (projectId && sn != null) {
        const { data, error } = await supabase
          .from('sprint_ai_analysis')
          .select('consensus_record')
          .eq('project_id', projectId)
          .eq('sprint_number', sn)
          .maybeSingle();
        if (!error && data?.consensus_record) {
          setConsensusRecord(data.consensus_record);
        }
      }
      setSavedToastVisible(true);
      setTimeout(() => setSavedToastVisible(false), 2500);
    } finally {
      setSavingConsensusInline(false);
    }
  }

  async function handleCreateNextSprintInline() {
    if (creatingNextSprint) return;
    if (typeof onCreateNextSprint !== 'function') return;
    setCreatingNextSprint(true);
    try {
      await onCreateNextSprint();
    } finally {
      setCreatingNextSprint(false);
    }
  }

  // Re-analyze (AI consensus path only): wipe consensus_record + alternative votes so the
  // sprint returns to the AI Analysis tab with the saved analysis still intact. Owner-only;
  // members would not have permission to UPDATE the row anyway.
  const [reanalyzing, setReanalyzing] = useState(false);
  async function handleReanalyze() {
    if (reanalyzing || !isOwner) return;
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null) return;
    setReanalyzing(true);
    try {
      // Preserve the analysis itself (positions / activeConflict / alternative / valueMatrix)
      // but drop the per-member alternative_votes so members can vote again from scratch.
      const clearedAi = { ...(aiAnalysisResult || {}), alternative_votes: {} };
      const { error } = await supabase.from('sprint_ai_analysis').upsert(
        {
          project_id: projectId,
          sprint_number: sn,
          analysis_result: clearedAi,
          consensus_record: null,
          updated_at: new Date().toISOString(),
          created_by: authUid,
        },
        { onConflict: 'project_id,sprint_number' },
      );
      if (error) {
        // eslint-disable-next-line no-console
        console.error('[ConflictPanel] re-analyze reset failed', error);
        return;
      }
      setAiAnalysisResult(clearedAi);
      setConsensusRecord(null);
      setSavedToastVisible(false);
      setConsensusPanelTab('ai');
    } finally {
      setReanalyzing(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('[ConflictPanel] state', {
      sprintNumber,
      currentSprintNumber,
      isCompletedSprint,
      consensusRecord: consensusRecord != null ? 'PRESENT' : 'NULL',
      showConsensusResultPanel,
    });
  }, [sprintNumber, currentSprintNumber, consensusRecord, isCompletedSprint, showConsensusResultPanel]);

  const CR_SECTION_HEADER = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.fg3, marginBottom: 6 };
  const CR_FIELD_LABEL    = { fontSize: 9,  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.fg3, marginBottom: 3 };
  const CR_VALUE          = { fontSize: 12, color: C.fg1, lineHeight: 1.5 };
  const CR_SUB_VALUE      = { fontSize: 11, color: C.fg2, lineHeight: 1.55, marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${C.borderSubtle}` };
  const CR_EDIT_TEXTAREA  = { width: '100%', minHeight: 48, resize: 'vertical', borderRadius: 4, border: `1px solid ${C.border}`, padding: '6px 8px', fontSize: 11, lineHeight: 1.45, fontFamily: 'inherit', color: C.fg1, outline: 'none' };
  const CR_EDIT_BTN       = { width: '100%', padding: '9px 12px', borderRadius: 5, border: `1px solid ${C.emeraldBorder}`, background: C.white, color: C.emerald, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const CR_CANCEL_BTN     = { flex: 1, padding: '9px 12px', borderRadius: 5, border: `1px solid ${C.border}`, background: C.white, color: C.fg2, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
  const CR_SAVE_BTN       = { flex: 2, padding: '9px 12px', borderRadius: 5, border: 'none', background: C.emerald, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

  function renderConsensusResultView() {
    const cr = consensusRecord || {};
    const ai = aiAnalysisResult || {};
    const aiAvailable = !!(ai && ai.canAnalyze !== false && (ai.activeConflict || ai.alternative || ai.positions));
    const altMap = (ai.alternative_votes && typeof ai.alternative_votes === 'object')
      ? ai.alternative_votes
      : (cr.votes && typeof cr.votes === 'object' ? cr.votes : {});
    return (
      <div style={{ padding: '14px 48px 14px 14px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', height: '100%', flex: 1, minHeight: 0, boxSizing: 'border-box' }}>
        <div style={CR_SECTION_HEADER}>{t('consensusResultLabel')}</div>

        {/* ① VALUE CONFLICT MATRIX (radar) — only when AI analysis is available */}
        {aiAvailable ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crValueMatrix')}</div>
            <div style={{ marginTop: 4 }}>
              <ValueMatrixChart
                priorities={getProjectPriorities(geminiProject)}
                positionValues={ai.valueMatrix?.positionValues || []}
                projectLineLabel="Project Priority"
                colorForName={valueMatrixColorForName}
              />
            </div>
          </div>
        ) : null}

        {/* ② CONFLICT SUMMARY — title + 2-3 line summary only */}
        {aiAvailable && ai.activeConflict ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crConflictSummary')}</div>
            {ai.activeConflict.title ? (
              <div style={{ ...CR_VALUE, fontWeight: 600 }}>{ai.activeConflict.title}</div>
            ) : null}
            {ai.activeConflict.summary ? (
              <div
                style={{
                  fontSize: 11,
                  color: C.fg2,
                  lineHeight: 1.5,
                  marginTop: 4,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {ai.activeConflict.summary}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ③ POSITIONS — compact (avatar + name + role + one-line title only) */}
        {aiAvailable && Array.isArray(ai.positions) && ai.positions.length > 0 ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crPositions')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {ai.positions.map((pos) => (
                <div
                  key={pos.userId || pos.userName}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    background: C.subtle,
                    border: `1px solid ${C.borderSubtle}`,
                    borderRadius: 5,
                    padding: '6px 8px',
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 9999,
                      background: C.white,
                      border: `1px solid ${C.borderSubtle}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: C.fg2,
                      flexShrink: 0,
                    }}
                  >
                    {String(pos.userName || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.fg1 }}>
                      {pos.userName}
                      {pos.role ? (
                        <span style={{ fontWeight: 500, color: C.fg3, marginLeft: 6 }}>
                          ({pos.role})
                        </span>
                      ) : null}
                    </div>
                    {pos.titleSummary ? (
                      <div
                        style={{
                          fontSize: 10,
                          color: C.fg2,
                          lineHeight: 1.4,
                          marginTop: 2,
                          display: '-webkit-box',
                          WebkitLineClamp: 1,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {pos.titleSummary}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ④ AI ALTERNATIVE — title + short description + pros (≤3) + cons (≤2) + metrics */}
        {aiAvailable && ai.alternative ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crAlternative')}</div>
            <div
              style={{
                marginTop: 4,
                background: C.emeraldLight,
                border: `1px solid ${C.emeraldBorder}`,
                borderRadius: 6,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {ai.alternative.title ? (
                <div style={{ fontSize: 12, fontWeight: 700, color: C.fg1 }}>
                  {ai.alternative.title}
                </div>
              ) : null}
              {ai.alternative.description ? (
                <div
                  style={{
                    fontSize: 11,
                    color: C.fg2,
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ai.alternative.description}
                </div>
              ) : null}
              {Array.isArray(ai.alternative.pros) && ai.alternative.pros.length > 0 ? (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.emerald, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('crAltPros')}
                  </div>
                  <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 10, color: C.fg2, lineHeight: 1.45 }}>
                    {ai.alternative.pros.slice(0, 3).map((pro, i) => (
                      <li key={i}>{pro}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {Array.isArray(ai.alternative.cons) && ai.alternative.cons.length > 0 ? (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('crAltCons')}
                  </div>
                  <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 10, color: C.fg2, lineHeight: 1.45 }}>
                    {ai.alternative.cons.slice(0, 2).map((con, i) => (
                      <li key={i}>{con}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {ai.alternative.metrics ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  {[
                    { label: t('crAltLeadTime'),   value: ai.alternative.metrics.leadTime },
                    { label: t('crAltRisk'),       value: ai.alternative.metrics.riskDelta },
                    { label: t('crAltConfidence'), value: ai.alternative.metrics.confidence },
                  ].filter((m) => m.value != null && String(m.value).length > 0).map((m) => (
                    <div
                      key={m.label}
                      style={{
                        flex: 1,
                        background: C.white,
                        border: `1px solid ${C.borderSubtle}`,
                        borderRadius: 4,
                        padding: '4px 6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.fg1 }}>{m.value}</div>
                      <div style={{ fontSize: 8, color: C.fg3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ⑤ MEMBER VOTES — per-member approve / suggest-alternative + optional comment */}
        {participants.length > 0 ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crMemberVotes')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {participants.map((p) => {
                const uidNorm = p.userId ? normalizeParticipantUserId(p.userId) : null;
                const rec = uidNorm ? (altMap[uidNorm] || altMap[p.userId]) : undefined;
                const voteVal = typeof rec === 'string' ? rec : rec?.vote;
                const comment = (rec && typeof rec === 'object') ? String(rec.comment || '') : '';
                const isApprove = voteVal === 'approve';
                const isOppose  = voteVal === 'oppose';
                return (
                  <div
                    key={p.key}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      minWidth: 0,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 11,
                          color: C.fg2,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                        title={p.label}
                      >
                        {p.label}
                      </span>
                      {isApprove ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: C.emerald }}>
                          <Icon name="check-circle" size={12} color={C.emerald} />
                          {t('crVoteApprove')}
                        </span>
                      ) : isOppose ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#b45309' }}>
                          <Icon name="message-square" size={12} color="#f59e0b" />
                          {t('crVoteSuggest')}
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: C.fg4 }}>{t('crNoComment')}</span>
                      )}
                    </div>
                    {comment ? (
                      <div
                        style={{
                          fontSize: 10,
                          lineHeight: 1.45,
                          color: isApprove ? C.emerald : '#b45309',
                          background: isApprove ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                          border: `1px solid ${isApprove ? C.emeraldBorder : 'rgba(245,158,11,0.35)'}`,
                          borderRadius: 4,
                          padding: '4px 6px',
                          marginLeft: 2,
                          wordBreak: 'break-word',
                        }}
                      >
                        {comment}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ⑥ MANUAL RESOLUTION — only when AI is absent or the record came from Manual Input */}
        {(!aiAvailable || cr.isAiPath === false)
          && (cr.conflict?.title || cr.resolution?.title || cr.note) ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('crManualResolution')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {cr.conflict?.title ? (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.fg3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('drConflict')}</div>
                  <div style={{ fontSize: 11, color: C.fg2, lineHeight: 1.45 }}>{cr.conflict.title}</div>
                </div>
              ) : null}
              {cr.resolution?.title ? (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.fg3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('drResolution')}</div>
                  <div style={{ fontSize: 11, color: C.fg2, lineHeight: 1.45 }}>
                    {cr.resolution.description
                      ? `${cr.resolution.title} — ${cr.resolution.description}`
                      : cr.resolution.title}
                  </div>
                </div>
              ) : null}
              {cr.note ? (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.fg3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('drNote')}</div>
                  <div style={{ fontSize: 11, color: C.fg2, lineHeight: 1.45 }}>{cr.note}</div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Participants line — kept compact as a footer */}
        {(cr.participants || []).length > 0 ? (
          <div>
            <div style={CR_FIELD_LABEL}>{t('drParticipants')}</div>
            <div style={{ fontSize: 11, color: C.fg2, lineHeight: 1.45 }}>
              {(cr.participants || []).join(' · ')}
            </div>
          </div>
        ) : null}

        {/* ⑦ Edit Decision (manual) or Re-analyze (AI) — owner only */}
        {isOwner ? (() => {
          // AI-sourced records get a Re-analyze button that clears consensus + votes and
          // returns to the AI Analysis tab. Manual-sourced records keep the original
          // Edit Decision flow so the owner can adjust the typed conflict/resolution/note.
          // `source` is the canonical field; `isAiPath` is kept for backward compatibility
          // with records saved before the source field was introduced.
          const isAi = cr.source === 'ai' || (cr.source == null && cr.isAiPath === true);
          if (isAi) {
            return (
              <button
                type="button"
                disabled={reanalyzing}
                onClick={handleReanalyze}
                style={{
                  ...CR_EDIT_BTN,
                  opacity: reanalyzing ? 0.6 : 1,
                  cursor: reanalyzing ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {reanalyzing ? (
                  <>
                    <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                      <Icon name="loader" size={12} color={C.emerald} />
                    </span>
                    Re-analyzing...
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={12} color={C.emerald} />
                    Re-analyze
                  </>
                )}
              </button>
            );
          }
          return (
            <button
              type="button"
              onClick={() => {
                setEditedConflict(cr.conflict?.title ?? '');
                setEditedResolution(cr.resolution?.title ?? '');
                setEditedNote(cr.note ?? '');
                setIsEditingConsensus(true);
              }}
              style={CR_EDIT_BTN}
            >
              {t('editDecisionButton')}
            </button>
          );
        })() : null}

        {/* ⑧ Create Next Sprint — only on the current sprint (after Save Consensus), owner only */}
        {!isCompletedSprint && isOwner && typeof onCreateNextSprint === 'function' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {savedToastVisible ? (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: C.emerald,
                  background: C.emeraldLight,
                  border: `1px solid ${C.emeraldBorder}`,
                  borderRadius: 6,
                  padding: '6px 10px',
                  textAlign: 'center',
                }}
              >
                {t('crSavedToast')}
              </div>
            ) : null}
            <button
              type="button"
              disabled={creatingNextSprint}
              onClick={handleCreateNextSprintInline}
              onMouseEnter={(e) => {
                if (creatingNextSprint) return;
                e.currentTarget.style.filter = 'brightness(1.08)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
              }}
              onMouseLeave={(e) => {
                if (creatingNextSprint) return;
                e.currentTarget.style.filter = 'brightness(1)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
              }}
              style={{
                width: '100%',
                padding: '11px 20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                color: '#fff',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 12,
                border: 'none',
                borderRadius: 999,
                cursor: creatingNextSprint ? 'wait' : 'pointer',
                boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                opacity: creatingNextSprint ? 0.85 : 1,
                transition: 'filter 160ms, box-shadow 160ms, opacity 160ms',
              }}
            >
              {creatingNextSprint ? (
                <>
                  <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                    <Icon name="loader" size={14} color="#fff" />
                  </span>
                  <span>{t('crCreatingNextSprint')}</span>
                </>
              ) : (
                <span>{t('crCreateNextSprint')}</span>
              )}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  function renderConsensusEditView() {
    const cr = consensusRecord || {};
    return (
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', height: '100%', flex: 1, minHeight: 0, boxSizing: 'border-box' }}>
        <div style={CR_SECTION_HEADER}>{t('consensusResultLabel')}</div>
        <div>
          <div style={CR_FIELD_LABEL}>{t('drConflict')}</div>
          <textarea
            value={editedConflict}
            onChange={(e) => setEditedConflict(e.target.value)}
            placeholder={t('drConflictPlaceholder')}
            style={CR_EDIT_TEXTAREA}
          />
        </div>
        <div>
          <div style={CR_FIELD_LABEL}>{t('drResolution')}</div>
          <textarea
            value={editedResolution}
            onChange={(e) => setEditedResolution(e.target.value)}
            placeholder={t('drResolutionPlaceholder')}
            style={CR_EDIT_TEXTAREA}
          />
        </div>
        <div>
          <div style={CR_FIELD_LABEL}>{t('drNote')}</div>
          <textarea
            value={editedNote}
            onChange={(e) => setEditedNote(e.target.value)}
            placeholder={t('consensusNotePlaceholder')}
            style={CR_EDIT_TEXTAREA}
          />
        </div>
        <div>
          <div style={CR_FIELD_LABEL}>{t('drParticipants')}</div>
          <div style={CR_VALUE}>{(cr.participants || []).join(' · ') || '—'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setIsEditingConsensus(false)}
            style={CR_CANCEL_BTN}
          >
            {t('cancelEditButton')}
          </button>
          <button
            type="button"
            disabled={savingConsensus}
            onClick={async () => {
              setSavingConsensus(true);
              try {
                const updated = {
                  ...cr,
                  conflict: { ...(cr.conflict || {}), title: editedConflict.trim() },
                  resolution: { ...(cr.resolution || {}), title: editedResolution.trim() },
                  note: editedNote.trim(),
                  savedAt: new Date().toISOString(),
                };
                const ok = await onSaveConsensusRecord?.(updated);
                if (ok !== false) {
                  setConsensusRecord(updated);
                  setIsEditingConsensus(false);
                  await onAdvanceViewingSprint?.();
                }
              } finally {
                setSavingConsensus(false);
              }
            }}
            style={{ ...CR_SAVE_BTN, opacity: savingConsensus ? 0.6 : 1, cursor: savingConsensus ? 'wait' : 'pointer' }}
          >
            {savingConsensus ? '…' : t('saveAndContinueButton')}
          </button>
        </div>
      </div>
    );
  }

  if (showConsensusResultPanel) {
    return (
      <div
        style={{
          width,
          height: '100%',
          background: C.white,
          borderLeft: `1px solid ${C.borderSubtle}`,
          display: 'flex',
          flexDirection: 'column',
          // Explicit `flex: '1 0 0%'` (grow 1, shrink 0, basis 0%) so React
          // doesn't warn about `flex: 1` (= `1 1 0%`) conflicting with the
          // separate `flexShrink: 0` we used to have.
          flex: '1 0 0%',
          minHeight: 0,
          minWidth: 0,
          position: 'relative',
          zIndex: 0,
          overflow: 'hidden',
        }}
      >
        {isEditingConsensus ? renderConsensusEditView() : renderConsensusResultView()}
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        height: '100%',
        background: C.white,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        position: 'relative',
        zIndex: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: C.white,
              // Right pad clears the floating X (right: 10, width: 28) so the tabs don't slide under it.
              padding: '12px 48px 12px 16px',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            }}
          >
            <div
              role="tablist"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
                gap: 8,
                minWidth: 0,
              }}
            >
              {[
                { key: 'ai', label: 'AI Analysis' },
                { key: 'manual', label: 'Manual Input' },
              ].map((tab) => {
                const active = consensusPanelTab === tab.key;
                return (
                  <div
                    key={tab.key}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      padding: 2,
                      borderRadius: 999,
                      background: active
                        ? 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)'
                        : '#e5e7eb',
                      transition: 'background 160ms',
                    }}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setConsensusPanelTab(tab.key)}
                      style={{
                        width: '100%',
                        padding: '8px 20px',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        background: C.white,
                        border: 'none',
                        color: active ? '#06B6D4' : '#6b7280',
                        borderRadius: 999,
                        cursor: 'pointer',
                        transition: 'color 140ms',
                      }}
                    >
                      {tab.label}
                    </button>
                  </div>
                );
              })}
            </div>
            {/* Close button is rendered at the panel-overlay level (parent) so it stays
               pinned to the top-right corner regardless of inner scroll position. */}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: 16,
            }}
          >
          {consensusPanelTab === 'ai' ? (
            <>
              {isOwner ? (
                <button
                  type="button"
                  disabled={aiAnalysisLoading}
                  onClick={handleRequestAIAnalysis}
                  onMouseEnter={(e) => {
                    if (aiAnalysisLoading) return;
                    e.currentTarget.style.filter = 'brightness(1.08)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (aiAnalysisLoading) return;
                    e.currentTarget.style.filter = 'brightness(1)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 12,
                    border: 'none',
                    borderRadius: 999,
                    cursor: aiAnalysisLoading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                    opacity: aiAnalysisLoading ? 0.85 : 1,
                    transition: 'filter 160ms, box-shadow 160ms, opacity 160ms',
                  }}
                >
                  {aiAnalysisLoading ? (
                    <>
                      <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                        <Icon name="loader" size={14} color="#fff" />
                      </span>
                      <span>Analyzing...</span>
                    </>
                  ) : aiAnalysisResult ? (
                    <>
                      <Icon name="sparkles" size={16} color="#fff" />
                      <span>Re-request Analysis</span>
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles" size={16} color="#fff" />
                      <span>Request AI Analysis</span>
                    </>
                  )}
                </button>
              ) : (
                <div
                  style={{
                    fontSize: 10,
                    lineHeight: 1.45,
                    color: C.fg3,
                    textAlign: 'center',
                  }}
                >
                  {t('aiAnalysisReadOnlyHint')}
                </div>
              )}
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: C.fg3,
                marginBottom: 8,
              }}
            >
              {t('valueMatrix')}
            </div>
            <ValueMatrixChart
              priorities={getProjectPriorities(geminiProject)}
              positionValues={
                aiAnalysisResult?.canAnalyze
                  ? aiAnalysisResult.valueMatrix?.positionValues || []
                  : []
              }
              projectLineLabel="Project Priority"
              colorForName={valueMatrixColorForName}
            />
          </div>

          {aiAnalysisLoading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '24px 12px',
                textAlign: 'center',
              }}
            >
              <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                <Icon name="loader" size={24} color={C.emerald} />
              </span>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.fg1 }}>
                {t('aiAnalyzingTitle')}
              </p>
              <p style={{ margin: 0, fontSize: 11, color: C.fg3 }}>{t('aiAnalyzingLine')}</p>
            </div>
          ) : null}

          {!aiAnalysisLoading && !aiAnalysisResult ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: 8,
                padding: '20px 8px',
              }}
            >
              <Icon name="sparkles" size={48} color={C.border} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.fg2 }}>
                {t('aiAnalysisPlaceholderTitle')}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: C.fg3, lineHeight: 1.5 }}>
                {isOwner ? (
                  <>
                    {t('aiAnalysisPlaceholderLine1')}
                    <br />
                    {t('aiAnalysisPlaceholderLine2')}
                  </>
                ) : (
                  <>
                    {t('aiAnalysisMemberPlaceholderLine1')}
                    <br />
                    {t('aiAnalysisMemberPlaceholderLine2')}
                  </>
                )}
              </p>
            </div>
          ) : null}

          {!aiAnalysisLoading && aiAnalysisResult && !aiAnalysisResult.canAnalyze ? (
            <div
              style={{
                borderRadius: 8,
                border: `1px solid ${C.borderSubtle}`,
                background: C.subtle,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <Icon
                  name={aiAnalysisResult.reason === 'error' ? 'alert-triangle' : 'info'}
                  size={20}
                  color={aiAnalysisResult.reason === 'error' ? C.coral : '#3b82f6'}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: C.fg1 }}>
                    {aiAnalysisResult.message}
                  </h3>
                  {aiAnalysisResult.reason === 'insufficient_chat' && aiAnalysisResult.details ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: C.fg2, lineHeight: 1.55 }}>
                      {aiAnalysisResult.details.map((d) => (
                        <li key={d.userName}>
                          {d.userName}: {d.currentCount}/{d.required} {t('insufficientChatLabel')}
                          {d.currentCount < d.required ? (
                            <span style={{ color: C.coral }}>
                              {' '}
                              ({d.required - d.currentCount} {t('insufficientMoreNeeded')})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {aiAnalysisResult.reason === 'need_more_context' && aiAnalysisResult.suggestedTopics ? (
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: C.fg2, lineHeight: 1.55 }}>
                      {aiAnalysisResult.suggestedTopics.map((topic, i) => (
                        <li key={i}>{topic}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {!aiAnalysisLoading && aiAnalysisResult?.canAnalyze ? (
            <>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <Icon name="alert-triangle" size={16} color={C.amber} />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: C.fg3,
                    }}
                  >
                    {t('activeConflictSection')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveConflictExpanded((v) => !v)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderRadius: 6,
                    border: `1px solid ${C.borderSubtle}`,
                    background: C.white,
                    padding: '10px 12px',
                    fontFamily: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.fg3, marginBottom: 4 }}>
                        {aiAnalysisResult.activeConflict.id}
                      </div>
                      <h3
                        style={{
                          margin: '0 0 6px',
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.fg1,
                        }}
                      >
                        {aiAnalysisResult.activeConflict.title}
                      </h3>
                      <p style={{ margin: 0, fontSize: 11, color: C.fg2, lineHeight: 1.45 }}>
                        {aiAnalysisResult.activeConflict.summary}
                      </p>
                    </div>
                    <Icon
                      name={activeConflictExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={C.fg3}
                    />
                  </div>
                  {activeConflictExpanded ? (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: `1px solid ${C.borderSubtle}`,
                        fontSize: 11,
                        color: C.fg2,
                        lineHeight: 1.55,
                      }}
                    >
                      {aiAnalysisResult.activeConflict.content}
                    </div>
                  ) : null}
                </button>
              </div>

              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: C.fg3,
                    marginBottom: 8,
                  }}
                >
                  {t('positions')}
                </div>
                {aiAnalysisResult.positions.map((position) => (
                  <button
                    type="button"
                    key={position.userId}
                    onClick={() => togglePosition(position.userId)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderRadius: 6,
                      border: `1px solid ${C.borderSubtle}`,
                      background: C.subtle,
                      padding: '10px 10px',
                      fontFamily: 'inherit',
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 9999,
                          background: C.white,
                          border: `1px solid ${C.borderSubtle}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: C.fg2,
                          flexShrink: 0,
                        }}
                      >
                        {position.userName.charAt(0)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.fg1 }}>
                          {position.userName}
                          <span style={{ fontWeight: 500, color: C.fg3, marginLeft: 6 }}>
                            ({position.role})
                          </span>
                        </div>
                        <p
                          style={{
                            margin: '4px 0 0',
                            fontSize: 11,
                            color: C.fg2,
                            lineHeight: 1.45,
                          }}
                        >
                          {position.titleSummary}
                        </p>
                      </div>
                      <Icon
                        name={expandedPositions[position.userId] ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={C.fg3}
                      />
                    </div>
                    {expandedPositions[position.userId] ? (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: `1px solid ${C.borderSubtle}`,
                          fontSize: 11,
                          color: C.fg2,
                          lineHeight: 1.55,
                        }}
                      >
                        {position.detailedPosition}
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>

              {!alternativeRequested ? (
                <button
                  type="button"
                  disabled={aiAlternativeLoading || (!isOwner && !aiAnalysisResult.alternative)}
                  onClick={handleRequestAlternative}
                  onMouseEnter={(e) => {
                    if (aiAlternativeLoading) return;
                    e.currentTarget.style.filter = 'brightness(1.08)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.filter = 'brightness(1)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
                  }}
                  title="Request Alternative Proposal"
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 12,
                    border: 'none',
                    borderRadius: 999,
                    cursor: aiAlternativeLoading ? 'wait' : 'pointer',
                    boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                    transition: 'filter 160ms, box-shadow 160ms',
                    opacity: aiAlternativeLoading ? 0.85 : 1,
                  }}
                >
                  {aiAlternativeLoading ? (
                    <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                      <Icon name="loader" size={14} color="#fff" />
                    </span>
                  ) : (
                    <Icon name="sparkles" size={16} color="#fff" />
                  )}
                  <span>Request Alternative Proposal</span>
                </button>
              ) : null}
              {alternativeError ? (
                <div
                  style={{
                    fontSize: 10,
                    color: C.coral,
                    background: '#FEE2E2',
                    border: '1px solid #FCA5A5',
                    borderRadius: 6,
                    padding: '6px 10px',
                    lineHeight: 1.4,
                  }}
                >
                  {alternativeError}
                </div>
              ) : null}

              {alternativeRequested && aiAnalysisResult.alternative ? (
              <>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                  }}
                >
                  <Icon name="sparkles" size={16} color={C.emerald} />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: C.fg3,
                    }}
                  >
                    {t('optionCLabel')}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: 9999,
                      background: C.emerald,
                      color: '#fff',
                    }}
                  >
                    AI
                  </span>
                </div>
                <div
                  style={{
                    borderRadius: 8,
                    border: `1px solid ${C.borderSubtle}`,
                    background: C.white,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.fg1 }}>
                    {aiAnalysisResult.alternative.title}
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: C.fg2, lineHeight: 1.55 }}>
                    {aiAnalysisResult.alternative.description}
                  </p>
                  <div style={{ display: 'flex', gap: 8, width: '100%', minWidth: 0 }}>
                    {[
                      {
                        label: t('metaLeadTime'),
                        value: aiAnalysisResult.alternative.metrics.leadTime,
                        highlight: false,
                      },
                      {
                        label: t('metaRisk'),
                        value: aiAnalysisResult.alternative.metrics.riskDelta,
                        highlight: true,
                      },
                      {
                        label: t('metaConf'),
                        value: aiAnalysisResult.alternative.metrics.confidence,
                        highlight: false,
                      },
                    ].map((m) => (
                      <div
                        key={m.label}
                        style={{
                          flex: '1 1 0%',
                          minWidth: 0,
                          background: C.subtle,
                          borderRadius: 4,
                          padding: '6px 6px',
                          textAlign: 'center',
                          border: `1px solid ${C.borderSubtle}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color:
                              m.highlight ? C.emerald : m.value.startsWith('+') ? C.amber : C.fg1,
                          }}
                        >
                          {m.value}
                        </div>
                        <div style={{ fontSize: 9, color: C.fg3 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                      fontSize: 11,
                      color: C.fg2,
                    }}
                  >
                    <div>
                      <h4
                        style={{
                          margin: '0 0 6px',
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.fg3,
                          textTransform: 'uppercase',
                        }}
                      >
                        {t('prosLabel')}
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
                        {aiAnalysisResult.alternative.pros.map((pro, i) => (
                          <li key={i}>{pro}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4
                        style={{
                          margin: '0 0 6px',
                          fontSize: 10,
                          fontWeight: 700,
                          color: C.fg3,
                          textTransform: 'uppercase',
                        }}
                      >
                        {t('consLabel')}
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.45 }}>
                        {aiAnalysisResult.alternative.cons.map((con, i) => (
                          <li key={i}>{con}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <div
                    style={{
                      borderRadius: 6,
                      background: C.emeraldLight,
                      border: `1px solid ${C.emeraldBorder}`,
                      padding: 10,
                      fontSize: 11,
                      color: C.fg2,
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: C.fg1 }}>{t('whyThisWorks')}</strong>
                    <p style={{ margin: '6px 0 0' }}>{aiAnalysisResult.alternative.alignmentReason}</p>
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderRadius: 6,
                  border: `2px solid ${C.emerald}`,
                  padding: '12px 12px 14px',
                  background: C.emeraldLight,
                  animation: 'option-glow 2.5s ease-in-out infinite',
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  width: '100%',
                  maxWidth: '100%',
                  minWidth: 0,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0, minWidth: 0 }}>
                  <Icon name="sparkles" size={13} color={C.emerald} />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.emerald,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('optionCLabel')}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.fg1, lineHeight: 1.4 }}>
                  {aiAnalysisResult.alternative.title}
                </div>
                {altVoteMode === null ? (
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      width: '100%',
                      minWidth: 0,
                      flexShrink: 0,
                    }}
                  >
                    <button
                      type="button"
                      disabled={!authUid}
                      onMouseEnter={(e) => { e.currentTarget.style.background = C.emeraldHover; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.emerald; }}
                      onClick={() => { setAltVoteMode('approve'); setAltVoteCommentDraft(''); }}
                      style={{
                        flex: '1 1 0%',
                        minWidth: 0,
                        padding: '9px 8px',
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        color: C.emerald,
                        background: 'transparent',
                        border: `1px solid ${C.emerald}`,
                        cursor: !authUid ? 'not-allowed' : 'pointer',
                        opacity: !authUid ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'color 200ms ease, background-color 200ms ease',
                      }}
                    >
                      <Icon name="check" size={14} color="currentColor" />
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={!authUid}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f59e0b'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f59e0b'; }}
                      onClick={() => { setAltVoteMode('oppose'); setAltVoteCommentDraft(''); }}
                      style={{
                        flex: '1 1 0%',
                        minWidth: 0,
                        padding: '9px 8px',
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'inherit',
                        color: '#f59e0b',
                        background: 'transparent',
                        border: '1px solid #f59e0b',
                        cursor: !authUid ? 'not-allowed' : 'pointer',
                        opacity: !authUid ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        transition: 'color 200ms ease, background-color 200ms ease',
                      }}
                    >
                      <Icon name="message-square" size={14} color="currentColor" />
                      Suggest Alternative
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      width: '100%',
                      minWidth: 0,
                    }}
                  >
                    <textarea
                      autoFocus
                      value={altVoteCommentDraft}
                      onChange={(e) => setAltVoteCommentDraft(e.target.value)}
                      placeholder={
                        altVoteMode === 'approve'
                          ? 'Add a comment (optional)'
                          : 'Describe your alternative suggestion...'
                      }
                      rows={3}
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        padding: '8px 10px',
                        fontSize: 11,
                        fontFamily: 'inherit',
                        lineHeight: 1.5,
                        color: C.fg1,
                        border: '1px solid #06B6D4',
                        borderRadius: 8,
                        outline: 'none',
                        resize: 'vertical',
                        background: '#fff',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleAlternativeVote(altVoteMode, altVoteCommentDraft.trim());
                          setAltVoteMode(null);
                          setAltVoteCommentDraft('');
                        }}
                        style={{
                          flex: '1 1 0%',
                          padding: '8px 12px',
                          borderRadius: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          color: '#fff',
                          background: altVoteMode === 'approve' ? C.emerald : '#f59e0b',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Icon name="send" size={13} color="#fff" />
                        Submit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          // Skip = record the vote with no comment.
                          await handleAlternativeVote(altVoteMode, '');
                          setAltVoteMode(null);
                          setAltVoteCommentDraft('');
                        }}
                        style={{
                          flex: '0 0 auto',
                          padding: '8px 12px',
                          borderRadius: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          color: C.fg2,
                          background: 'transparent',
                          border: `1px solid ${C.border}`,
                          cursor: 'pointer',
                        }}
                      >
                        Skip
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAltVoteMode(null); setAltVoteCommentDraft(''); }}
                        style={{
                          flex: '0 0 auto',
                          padding: '8px 10px',
                          borderRadius: 5,
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: 'inherit',
                          color: C.fg3,
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {showVoteWaitingOthers ? (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.fg2,
                      textAlign: 'center',
                      padding: '8px 6px',
                      borderRadius: 4,
                      background: 'rgba(255,255,255,0.75)',
                      border: `1px solid ${C.emeraldBorder}`,
                      lineHeight: 1.4,
                    }}
                  >
                    {t('voteWaitingOthers')}
                  </div>
                ) : null}
                <div
                  style={{
                    paddingTop: 8,
                    marginTop: 2,
                    borderTop: `1px solid rgba(6,182,212,0.25)`,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.fg3, marginBottom: 6 }}>
                    {t('voteParticipantsHeading')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!participants.length ? (
                      <div style={{ fontSize: 10, color: C.fg4 }}>—</div>
                    ) : (
                      participants.map((p) => {
                        // Read alternative-specific votes (separate from sprint-level voteMap).
                        // Legacy entries stored as a bare string are tolerated.
                        const altMap = aiAnalysisResult?.alternative_votes || {};
                        const uidNorm = p.userId ? normalizeParticipantUserId(p.userId) : null;
                        const rec = uidNorm ? altMap[uidNorm] || altMap[p.userId] : undefined;
                        const voteVal = typeof rec === 'string' ? rec : rec?.vote;
                        const comment = (rec && typeof rec === 'object') ? String(rec.comment || '') : '';
                        const isApprove = voteVal === 'approve';
                        const isOppose  = voteVal === 'oppose';
                        const isPending = !isApprove && !isOppose;
                        return (
                          <div
                            key={p.key}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                              minWidth: 0,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <span
                                style={{
                                  flex: 1,
                                  fontSize: 11,
                                  color: C.fg2,
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                }}
                                title={p.label}
                              >
                                {p.label}
                              </span>
                              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                                {isApprove ? (
                                  <Icon name="check-circle" size={14} color={C.emerald} />
                                ) : isOppose ? (
                                  <Icon name="message-square" size={14} color="#f59e0b" />
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      letterSpacing: '0.02em',
                                      color: C.fg4,
                                    }}
                                  >
                                    {t('votePending')}
                                  </span>
                                )}
                              </span>
                            </div>
                            {comment && !isPending ? (
                              <div
                                style={{
                                  fontSize: 10,
                                  lineHeight: 1.45,
                                  color: isApprove ? C.emerald : '#b45309',
                                  background: isApprove ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)',
                                  border: `1px solid ${isApprove ? C.emeraldBorder : 'rgba(245,158,11,0.35)'}`,
                                  borderRadius: 4,
                                  padding: '4px 6px',
                                  marginLeft: 2,
                                  wordBreak: 'break-word',
                                }}
                              >
                                {comment}
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
              {/* Save Consensus — appears once every linked member has voted (approve OR
                  suggest alternative) and the record has not been saved for this sprint.
                  Only the owner can save; everyone else sees the inline tally above. */}
              {allMembersVotedOnAlternative && consensusRecord == null && !isCompletedSprint ? (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {isOwner ? (
                    <button
                      type="button"
                      disabled={savingConsensusInline}
                      onClick={handleSaveConsensusInline}
                      onMouseEnter={(e) => {
                        if (savingConsensusInline) return;
                        e.currentTarget.style.filter = 'brightness(1.08)';
                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
                      }}
                      onMouseLeave={(e) => {
                        if (savingConsensusInline) return;
                        e.currentTarget.style.filter = 'brightness(1)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
                      }}
                      style={{
                        width: '100%',
                        padding: '11px 20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                        color: '#fff',
                        fontFamily: 'inherit',
                        fontWeight: 600,
                        fontSize: 12,
                        border: 'none',
                        borderRadius: 999,
                        cursor: savingConsensusInline ? 'wait' : 'pointer',
                        boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                        opacity: savingConsensusInline ? 0.85 : 1,
                        transition: 'filter 160ms, box-shadow 160ms, opacity 160ms',
                      }}
                    >
                      {savingConsensusInline ? (
                        <>
                          <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                            <Icon name="loader" size={14} color="#fff" />
                          </span>
                          <span>저장 중...</span>
                        </>
                      ) : (
                        <>
                          <Icon name="check-circle" size={15} color="#fff" />
                          <span>합의 저장하기</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div
                      style={{
                        fontSize: 10,
                        textAlign: 'center',
                        color: C.fg3,
                        padding: '6px 10px',
                        background: C.subtle,
                        border: `1px solid ${C.borderSubtle}`,
                        borderRadius: 6,
                      }}
                    >
                      모든 멤버 투표 완료 — 프로젝트 오너의 저장을 기다리는 중
                    </div>
                  )}
                </div>
              ) : null}
              </>
              ) : null}
            </>
          ) : null}

          {import.meta.env.DEV && isOwner ? (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 6,
                border: `1px dashed ${C.border}`,
                background: '#fffef7',
                fontSize: 10,
                color: C.fg3,
              }}
            >
              <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('devMockScenarios')}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => switchMockScenario('normal')}
                  style={{
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('devScenarioNormal')}
                </button>
                <button
                  type="button"
                  onClick={() => switchMockScenario('insufficient')}
                  style={{
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('devScenarioInsufficient')}
                </button>
                <button
                  type="button"
                  onClick={() => setAiAnalysisResult(null)}
                  style={{
                    fontSize: 10,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t('devScenarioReset')}
                </button>
              </div>
            </div>
          ) : null}
            </>
          ) : null}
          {consensusPanelTab === 'manual' ? (
            <>
              {/* CONFLICT field */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.fg3, marginBottom: 3 }}>
                  {t('drConflict')}
                </div>
                <textarea
                  readOnly={memoLocked}
                  placeholder={t('drConflictPlaceholder')}
                  value={conflictDraft}
                  onChange={(e) => setConflictDraft(e.target.value)}
                  style={{
                    width: '100%',
                    height: 64,
                    resize: 'none',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    padding: '6px 8px',
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontFamily: 'inherit',
                    color: C.fg1,
                    background: memoLocked ? C.subtle : C.white,
                    outline: 'none',
                    cursor: memoLocked ? 'default' : 'text',
                  }}
                />
              </div>
              {/* RESOLUTION field */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.fg3, marginBottom: 3 }}>
                  {t('drResolution')}
                </div>
                <textarea
                  readOnly={memoLocked}
                  placeholder={t('drResolutionPlaceholder')}
                  value={resolutionDraft}
                  onChange={(e) => setResolutionDraft(e.target.value)}
                  style={{
                    width: '100%',
                    height: 64,
                    resize: 'none',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    padding: '6px 8px',
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontFamily: 'inherit',
                    color: C.fg1,
                    background: memoLocked ? C.subtle : C.white,
                    outline: 'none',
                    cursor: memoLocked ? 'default' : 'text',
                  }}
                />
              </div>
              {/* NOTE field */}
              <div style={{ position: 'relative' }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.fg3, marginBottom: 3 }}>
                  {t('drNote')}
                </div>
                <textarea
                  aria-label={t('consensusNotePlaceholder')}
                  readOnly={memoLocked}
                  placeholder={t('consensusNotePlaceholder')}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  style={{
                    width: '100%',
                    height: memoLocked ? 72 : 64,
                    resize: 'none',
                    borderRadius: 4,
                    border: `1px solid ${C.border}`,
                    padding: memoLocked ? '6px 32px 6px 8px' : '6px 8px',
                    fontSize: 11,
                    lineHeight: 1.45,
                    fontFamily: 'inherit',
                    color: C.fg1,
                    background: memoLocked ? C.subtle : C.white,
                    outline: 'none',
                    cursor: memoLocked ? 'default' : 'text',
                  }}
                />
                {memoLocked ? (
                  <button
                    type="button"
                    title={t('consensusEditMemo')}
                    aria-label={t('consensusEditMemo')}
                    onClick={() => setMemoLocked(false)}
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      border: `1px solid ${C.border}`,
                      background: C.white,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
                    }}
                  >
                    <Icon name="pencil" size={11} color={C.fg2} />
                  </button>
                ) : null}
              </div>
              {!memoLocked ? (
                <button
                  type="button"
                  disabled={!reachEnabled}
                  onClick={handleReachConsensusClick}
                  onMouseEnter={(e) => {
                    if (!reachEnabled) return;
                    e.currentTarget.style.filter = 'brightness(1.08)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(6,182,212,0.4)';
                  }}
                  onMouseLeave={(e) => {
                    if (!reachEnabled) return;
                    e.currentTarget.style.filter = 'brightness(1)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(6,182,212,0.3)';
                  }}
                  title={t('reachConsensusBtn')}
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '10px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 600,
                    fontSize: 13,
                    border: 'none',
                    borderRadius: 999,
                    cursor: reachEnabled ? 'pointer' : 'not-allowed',
                    boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                    transition: 'filter 160ms, box-shadow 160ms, opacity 160ms',
                    opacity: reachEnabled ? 1 : 0.55,
                  }}
                >
                  <Icon name="sparkles" size={16} color="#fff" />
                  <span>{savingMemo ? '…' : t('reachConsensusBtn')}</span>
                </button>
              ) : null}
            </>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sprint timeline panel ───────────────────────────────────
const TIMELINE_SPRINT_GAP = 16;
const TIMELINE_DOT = 34;
const TIMELINE_SPRINT_STEP = TIMELINE_DOT + TIMELINE_SPRINT_GAP;
/** Arrow click: slide by three sprint column widths. */
const TIMELINE_ARROW_DELTA = TIMELINE_SPRINT_STEP * 3;
const TIMELINE_ROW_H = TIMELINE_DOT + 14;
const TIMELINE_ARROW_BTN_W = 38;
const TIMELINE_FADE_W = 44;

function SprintTimelinePanel({
  timelineAnchorSeed,
  currentSprint,
  projectMetaLoading = false,
  viewingSprint,
  onSprintSelect,
  onRequestDeleteSprint,
  sprintsMeta = [],
  onOpenSprintSettings = null,
}) {
  const { t } = useLang();
  const menuRef = useRef(null);
  const anchoredSeedRef = useRef('');
  const viewportWrapRef = useRef(null);
  const [viewportW, setViewportW] = useState(320);
  // Phase 2b: the line is a sticky "tip → root" backbone. Clicking ancestors on
  // the line never collapses it (highlight moves, line stays). Off-line
  // branches surface via the layer-plate behind their parent; clicking the
  // plate fans out an expansion panel below the strip, and picking a node
  // there re-tips the line to that branch.
  const [lineTip, setLineTip] = useState(null);
  const [expandedNode, setExpandedNode] = useState(null);
  // Hover state for the layer-plate fan-out — keyed by the on-line node whose
  // outermost plate is currently hovered. Only the outermost plate is hover
  // target; the state flips, every plate of that node re-renders with a
  // bigger transform.
  const [hoveredLayerNum, setHoveredLayerNum] = useState(null);
  const expansionRef = useRef(null);

  const sprintNum = Number.isFinite(Number(currentSprint)) ? Number(currentSprint) : 0;
  const rows = Array.isArray(sprintsMeta) ? sprintsMeta : [];
  const byNum = new Map(rows.map((r) => [Number(r.sprint_number), r]));
  const childrenByParent = (() => {
    const m = new Map();
    for (const r of rows) {
      const p = r.parent_sprint_number;
      if (p == null) continue;
      const pn = Number(p);
      if (!m.has(pn)) m.set(pn, []);
      m.get(pn).push(Number(r.sprint_number));
    }
    return m;
  })();

  function tipOf(num) {
    const start = Number(num);
    if (!byNum.has(start)) return null;
    let cur = start;
    const seen = new Set();
    while (!seen.has(cur)) {
      seen.add(cur);
      const kids = childrenByParent.get(cur);
      if (!kids || kids.length === 0) return cur;
      let next = -1;
      for (const k of kids) if (k > next) next = k;
      if (next < 0) return cur;
      cur = next;
    }
    return cur;
  }
  // Walk DOWN the descendant chain from `num`, following the max-sprint_number
  // child at each step (same rule as tipOf), collecting every node from `num`
  // through to the leaf. Used to render an off-line branch as its full chain.
  function chainFrom(num) {
    const start = Number(num);
    if (!byNum.has(start)) return [];
    const out = [];
    const seen = new Set();
    let cur = start;
    while (byNum.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
      const kids = childrenByParent.get(cur);
      if (!kids || kids.length === 0) break;
      let next = -1;
      for (const k of kids) if (k > next) next = k;
      if (next < 0) break;
      cur = next;
    }
    return out;
  }
  function pathFrom(num) {
    if (num == null) return [];
    const start = Number(num);
    if (!byNum.has(start)) return [];
    const path = [];
    const seen = new Set();
    let cur = byNum.get(start) || null;
    while (cur) {
      const n = Number(cur.sprint_number);
      if (seen.has(n)) break;
      seen.add(n);
      path.unshift({
        num: n,
        label:
          typeof cur.label === 'string' && cur.label.trim()
            ? cur.label
            : String(n),
      });
      const parentNum = cur.parent_sprint_number;
      if (parentNum == null) break;
      cur = byNum.get(Number(parentNum)) || null;
    }
    return path;
  }

  // Derive the effective tip every render: if the state-held lineTip is still
  // valid AND the current viewingSprint sits on its path, keep it; otherwise
  // re-anchor to tipOf(viewingSprint) (or a fallback seed). A useEffect below
  // mirrors any drift back into state so explicit user picks persist.
  const effectiveTip = (() => {
    const vs = Number(viewingSprint);
    const vsValid = Number.isFinite(vs) && vs >= 1 && byNum.has(vs);
    if (lineTip != null && byNum.has(Number(lineTip))) {
      if (vsValid) {
        const onLine = pathFrom(lineTip).some((p) => p.num === vs);
        if (!onLine) {
          const t = tipOf(vs);
          if (t != null) return t;
        }
      }
      return Number(lineTip);
    }
    // First-paint / project-change seed.
    let seed = null;
    if (vsValid) seed = vs;
    else if (Number.isFinite(sprintNum) && sprintNum >= 1 && byNum.has(sprintNum)) {
      seed = sprintNum;
    } else {
      let maxNum = 0;
      for (const r of rows) {
        const n = Number(r.sprint_number);
        if (Number.isFinite(n) && n > maxNum) maxNum = n;
      }
      seed = maxNum > 0 ? maxNum : null;
    }
    return seed == null ? null : tipOf(seed);
  })();

  useEffect(() => {
    if (effectiveTip != null && effectiveTip !== lineTip) {
      setLineTip(effectiveTip);
    }
  }, [effectiveTip, lineTip]);

  useEffect(() => {
    setExpandedNode(null);
  }, [viewingSprint]);

  useEffect(() => {
    if (expandedNode == null) return undefined;
    function onDocDown(ev) {
      const insidePanel =
        expansionRef.current && expansionRef.current.contains(ev.target);
      const onLayerPlate =
        typeof ev.target?.closest === 'function' && ev.target.closest('[data-layer-plate]');
      if (!insidePanel && !onLayerPlate) {
        setExpandedNode(null);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [expandedNode]);

  const displayedLine = pathFrom(effectiveTip);
  // Off-line children per on-line node — the "layer count" for the badge,
  // plus the population the expansion panel will display when opened.
  const offLineChildrenByNum = new Map();
  const lineNumsSet = new Set(displayedLine.map((p) => p.num));
  for (const node of displayedLine) {
    const kids = childrenByParent.get(node.num) || [];
    const offLine = kids.filter((k) => !lineNumsSet.has(k));
    if (offLine.length > 0) offLineChildrenByNum.set(node.num, offLine);
  }
  const offPathChildrenCountByNum = new Map(
    Array.from(offLineChildrenByNum.entries()).map(([k, v]) => [k, v.length]),
  );
  const dots = displayedLine;
  // Label-length-based pill width: ≤2 chars stays a circle, longer labels grow
  // sideways while keeping the dot height fixed. ~6.4px per glyph at 10.5px
  // bold matches the existing "#NN" two-digit width budget.
  function dotWidthFor(label) {
    const s = String(label || '');
    if (s.length <= 2) return TIMELINE_DOT;
    return Math.round(TIMELINE_DOT + (s.length - 2) * 6.4 + 6);
  }
  const totalDotsWidth = dots.reduce((acc, d) => acc + dotWidthFor(d.label), 0);

  const [menuState, setMenuState] = useState({ open: false, x: 0, y: 0, sprintNumber: null });
  const [scrollX, setScrollX] = useState(0);

  useLayoutEffect(() => {
    const el = viewportWrapRef.current;
    if (!el) return undefined;
    const sync = () => setViewportW(Math.max(1, Math.round(el.getBoundingClientRect().width)));
    sync();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Horizontal breathing room on both ends of the scrolling row so the first sprint's
  // dot (and the active sprint's outer glow / corner check) aren't clipped by the
  // viewport's `overflow: hidden` boundary.
  const TIMELINE_ROW_PAD_X = 8;
  const contentWidth =
    dots.length <= 0
      ? 0
      : totalDotsWidth + (dots.length - 1) * TIMELINE_SPRINT_GAP + TIMELINE_ROW_PAD_X * 2;
  const overflow = Math.max(0, contentWidth - viewportW);
  const minScrollX = overflow > 0 ? -(contentWidth - viewportW) : 0;

  const anchorProjectPrefix = timelineAnchorSeed.includes('|')
    ? timelineAnchorSeed.slice(0, timelineAnchorSeed.indexOf('|'))
    : '';

  useEffect(() => {
    anchoredSeedRef.current = '';
  }, [anchorProjectPrefix]);

  useLayoutEffect(() => {
    if (!timelineAnchorSeed || sprintNum <= 0) return;
    if (timelineAnchorSeed.endsWith('|pending')) return;
    if (anchoredSeedRef.current === timelineAnchorSeed) return;
    anchoredSeedRef.current = timelineAnchorSeed;
    setScrollX(overflow > 0 ? minScrollX : 0);
  }, [timelineAnchorSeed, sprintNum, overflow, minScrollX]);

  useEffect(() => {
    setScrollX((sx) => Math.max(minScrollX, Math.min(0, sx)));
  }, [minScrollX]);

  useEffect(() => {
    if (!menuState.open) return undefined;
    function onDocDown(ev) {
      if (menuRef.current && !menuRef.current.contains(ev.target)) {
        setMenuState({ open: false, x: 0, y: 0, sprintNumber: null });
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [menuState.open]);

  function clampTimelineScroll(next) {
    return Math.max(minScrollX, Math.min(0, next));
  }

  function bumpTimelineBySprints(direction) {
    const delta =
      TIMELINE_ARROW_DELTA *
      // direction -1 → earlier sprints visible (positive scroll)
      // direction +1 → later sprints (negative scroll)
      (direction < 0 ? 1 : -1);
    setScrollX((sx) => clampTimelineScroll(sx + delta));
    // Close any open expansion — its anchored x positions don't share the
    // strip's transform-based slide animation, so leaving it open would make
    // the children jump while the dots slide.
    setExpandedNode(null);
  }

  const innerTransitionStyle = 'transform 300ms ease';
  const fadeBase = {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: TIMELINE_ARROW_BTN_W + TIMELINE_FADE_W,
    zIndex: 18,
    pointerEvents: 'none',
  };

  const atLeftEnd = overflow <= 0 || scrollX >= -0.5;
  const atRightEnd = overflow <= 0 || scrollX <= minScrollX + 0.5;
  const showScrollChrome = overflow > 0;

  // Per-dot horizontal centre in viewport coords (post-scroll) — used to anchor
  // the expansion panel's connectors and child positions to the live position
  // of the expanded node on the strip.
  const xCenters = [];
  {
    let acc = TIMELINE_ROW_PAD_X;
    for (let i = 0; i < dots.length; i += 1) {
      const w = dotWidthFor(dots[i].label);
      xCenters.push(acc + w / 2 + scrollX);
      acc += w + TIMELINE_SPRINT_GAP;
    }
  }
  const expandedIdx =
    expandedNode != null ? dots.findIndex((d) => d.num === expandedNode) : -1;
  const expandedX = expandedIdx >= 0 ? xCenters[expandedIdx] : 0;
  // Anchor child sprouts under the node immediately *after* the expanded
  // parent (e.g. children of 3 sit under 3.1's x), not under the line tip.
  // If the parent is the last dot on the line, fall back to one step to the
  // right of the parent. The connector curve still originates at the parent.
  const baseX =
    expandedIdx >= 0 && expandedIdx + 1 < xCenters.length
      ? xCenters[expandedIdx + 1]
      : expandedX + dotWidthFor(dots[expandedIdx]?.label) + TIMELINE_SPRINT_GAP;
  const expandedKids =
    expandedNode != null ? (offLineChildrenByNum.get(expandedNode) || []) : [];
  // For each direct off-line child, expand its full descendant chain (e.g.
  // 3.1 → 3.2 → 3.3) so the panel shows the whole branch, not just the first
  // hop. `isHead` marks the node that connects back up to the parent; the
  // rest connect horizontally to their predecessor in the same chain. Labels +
  // widths are pre-resolved with the strip's own dot sizing rules.
  const expandedKidsView = [];
  for (const childNum of expandedKids) {
    const chain = chainFrom(childNum);
    chain.forEach((n, i) => {
      const row = byNum.get(n);
      const label =
        row && typeof row.label === 'string' && row.label.trim()
          ? row.label
          : String(n);
      expandedKidsView.push({
        num: n,
        label,
        w: dotWidthFor(label),
        isHead: i === 0,
      });
    });
  }
  const PANEL_GAP_X = 14;
  // Top-aligned child row + bottom-aligned "새로운 갈래" button. The panel
  // total = top pad + dot height + gap + button height + bottom pad ≈ 80,
  // so PANEL_CHILD_ROW_TOP sits right under the strip's bottom edge.
  const PANEL_CHILD_ROW_TOP = 8;
  const EXPANSION_PANEL_H = 80;
  const childRowWidth = expandedKidsView.reduce(
    (acc, c, i) => acc + c.w + (i < expandedKidsView.length - 1 ? PANEL_GAP_X : 0),
    0,
  );
  // First child sits at baseX (parent's next node); additional children fan
  // to the right. Clamp the rightmost extent into the viewport so a long
  // branch label list never spills past the strip.
  const firstChildW = expandedKidsView[0]?.w ?? TIMELINE_DOT;
  let childRowStart = baseX - firstChildW / 2;
  if (childRowStart < TIMELINE_ROW_PAD_X) childRowStart = TIMELINE_ROW_PAD_X;
  if (childRowStart + childRowWidth > viewportW - TIMELINE_ROW_PAD_X) {
    childRowStart = Math.max(
      TIMELINE_ROW_PAD_X,
      viewportW - TIMELINE_ROW_PAD_X - childRowWidth,
    );
  }
  const expandedKidPositions = (() => {
    const arr = [];
    let cx = childRowStart;
    for (const c of expandedKidsView) {
      arr.push({ ...c, x: cx + c.w / 2 });
      cx += c.w + PANEL_GAP_X;
    }
    return arr;
  })();

  if (projectMetaLoading) {
    return (
      <div
        style={{
          flex: '1 1 0%',
          minWidth: 0,
          width: '100%',
          height: TIMELINE_ROW_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <style>{`
          @keyframes tl-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
        <img
          src="/assets/logo3.png"
          alt="loading"
          style={{
            width: 24,
            height: 24,
            animation: 'tl-spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: '1 1 0%',
        minWidth: 0,
        width: '100%',
        position: 'relative',
        background: 'transparent',
        padding: 0,
        overflow: 'visible',
        // Root passes events through (matching the wrapper at the call site) so the
        // empty space between/around sprint dots doesn't block canvas mouse events.
        // Interactive children (the dot row, scroll arrows) re-enable pointer events
        // individually below.
        pointerEvents: 'none',
      }}
    >
      {/* Unified glass background — covers the strip area + expansion panel
          as a single panel when an off-line layer is open. Outlined with the
          same colour the artboard pages use so the timeline reads as a peer
          of the canvas. Animated via opacity so the strip never visibly
          loses its anchor during the transition. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: TIMELINE_ROW_H + EXPANSION_PANEL_H,
          background: 'rgba(255,255,255,0.86)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: 8,
          boxShadow: '0 6px 18px rgba(15,23,42,0.06)',
          opacity: expandedIdx >= 0 ? 1 : 0,
          transition: 'opacity 0.2s ease',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        ref={viewportWrapRef}
        style={{ position: 'relative', width: '100%', height: TIMELINE_ROW_H }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: TIMELINE_SPRINT_GAP,
              transform: `translateX(${scrollX}px)`,
              transition: innerTransitionStyle,
              position: 'relative',
              height: '100%',
              width: contentWidth || undefined,
              minHeight: TIMELINE_DOT,
              paddingLeft: TIMELINE_ROW_PAD_X,
              paddingRight: TIMELINE_ROW_PAD_X,
              boxSizing: 'border-box',
              // Re-enable pointer events on the actual dot strip (width = contentWidth,
              // narrow) so sprint buttons stay clickable; outside this strip the root
              // `pointerEvents: 'none'` keeps canvas events flowing through.
              pointerEvents: 'auto',
            }}
          >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              // Shift the connector by the row's left padding so it still meets the
              // first dot's center.
              left: TIMELINE_ROW_PAD_X + (dots[0] ? dotWidthFor(dots[0].label) / 2 : TIMELINE_DOT / 2),
              top: '50%',
              height: 2,
              background: C.borderSubtle,
              transform: 'translateY(-50%)',
              zIndex: 0,
              borderRadius: 1,
              width:
                dots.length <= 1
                  ? 0
                  : (() => {
                      // First dot's right-half + gaps + middle dots + last gap + last dot's left-half.
                      let w = 0;
                      for (let i = 0; i < dots.length; i += 1) {
                        const dw = dotWidthFor(dots[i].label);
                        if (i === 0) w += dw / 2;
                        else if (i === dots.length - 1) w += TIMELINE_SPRINT_GAP + dw / 2;
                        else w += TIMELINE_SPRINT_GAP + dw;
                      }
                      return w;
                    })(),
            }}
          />

          {dots.map(({ num, label }) => {
            const isCurrent = num === sprintNum;
            const isViewing = num === Number(viewingSprint);
            // "Done" = this sprint has at least one child in the registry.
            // Tree-shape signal: a node with children was concluded enough
            // to spawn a successor. A dead-end (no children) — even one
            // earlier than the canonical — stays unchecked.
            const isDone = childrenByParent.has(Number(num));
            const dotW = dotWidthFor(label);

            // Fill is decoupled from consensus: only the viewing node is
            // cyan; every other dot keeps the neutral grey. Current still
            // carries a cyan label/border/glow on top so the active sprint
            // remains identifiable. The check-mark badge below is the only
            // consensus-driven visual.
            let circleBg;
            let labelColor;
            if (isViewing) {
              circleBg = '#06B6D4';
              labelColor = '#fff';
            } else {
              circleBg = '#e5e7eb';
              labelColor = isCurrent ? '#06B6D4' : C.fg3;
            }

            let borderColor;
            let borderWidth;
            let glowShadow;
            if (isCurrent) {
              borderColor = '#06B6D4';
              borderWidth = 2;
              glowShadow = '0 0 0 3px rgba(6,182,212,0.30)';
            } else {
              // All non-current dots get a thin white outline; the cyan
              // viewing fill / past grey / check-mark badge / default label
              // still carry the state cue, so the border is just a soft
              // edge against the glass background.
              borderColor = '#ffffff';
              borderWidth = 1.5;
              glowShadow = 'none';
            }

            const offCount = offPathChildrenCountByNum.get(num) || 0;
            // Fixed at 3 plates whenever any off-line branches exist; the
            // count is decoration ("there's hidden stuff") rather than a
            // tally. Z-stacked behind the actual node so the node stays the
            // primary click target.
            const layerCount = offCount > 0 ? 3 : 0;
            const isLayerHov = hoveredLayerNum === num;
            return (
              <div
                key={num}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {layerCount > 0
                  ? Array.from({ length: layerCount }).map((_, idx) => {
                      const offset = (idx + 1) * 3;
                      const isOutermost = idx === layerCount - 1;
                      // Hover fan-out: each plate slides further to the
                      // right when hovered (no vertical drift), with the
                      // outermost moving most so the stack visibly splays
                      // sideways.
                      const hoverShift = isLayerHov ? (idx + 1) * 3 : 0;
                      // Depth fade: nearest-to-node plate stays the most
                      // opaque, deeper plates dissolve into the glass
                      // background. Opacity floor lifted so even the back
                      // plate stays readable on the white panel.
                      const layerOpacity = [0.85, 0.6, 0.4][idx] ?? 0.4;
                      return (
                        <div
                          key={`layer-${idx}`}
                          data-layer-plate={isOutermost ? num : undefined}
                          role={isOutermost ? 'button' : undefined}
                          tabIndex={isOutermost ? 0 : -1}
                          aria-label={
                            isOutermost ? `Show off-line branches of sprint ${label}` : undefined
                          }
                          onClick={
                            isOutermost
                              ? (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setExpandedNode((prev) => (prev === num ? null : num));
                                }
                              : undefined
                          }
                          onMouseDown={
                            isOutermost
                              ? (e) => {
                                  // Block bubbling so the document-level outside-click
                                  // listener doesn't see this as "outside" before the
                                  // onClick toggle runs.
                                  e.stopPropagation();
                                }
                              : undefined
                          }
                          onMouseEnter={
                            isOutermost ? () => setHoveredLayerNum(num) : undefined
                          }
                          onMouseLeave={
                            isOutermost ? () => setHoveredLayerNum(null) : undefined
                          }
                          style={{
                            position: 'absolute',
                            // Vertical alignment with the node — only offset
                            // horizontally so the stack reads as siblings to
                            // the right rather than a diagonal cascade.
                            top: 0,
                            left: offset,
                            width: dotW,
                            minWidth: TIMELINE_DOT,
                            height: TIMELINE_DOT,
                            borderRadius: dotW > TIMELINE_DOT ? TIMELINE_DOT / 2 : '50%',
                            // Fill is one tone darker than the past-node
                            // grey (#e5e7eb) so the plates stand out clearly
                            // against the white glass panel; the thin white
                            // outline keeps each layer visually separated.
                            background: '#b8c2cc',
                            border: '1.5px solid #ffffff',
                            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                            opacity: layerOpacity,
                            transform: `translate(${hoverShift}px, 0)`,
                            transition: 'transform 0.18s ease, opacity 0.18s ease',
                            zIndex: -idx - 1,
                            // Only the outermost plate is clickable — that's
                            // the slice visible past the node.
                            pointerEvents: isOutermost ? 'auto' : 'none',
                            cursor: isOutermost ? 'pointer' : 'default',
                          }}
                        />
                      );
                    })
                  : null}
                <button
                  type="button"
                  onClick={() => onSprintSelect(num)}
                  onContextMenu={(e) => {
                    // Every sprint with a registry row is right-clickable —
                    // including branches. Refuse only when this would empty
                    // the registry entirely (every project keeps ≥1 sprint).
                    if (dots.length <= 1) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuState({
                      open: true,
                      x: e.clientX,
                      y: e.clientY,
                      sprintNumber: num,
                    });
                  }}
                  title={`Sprint ${label}`}
                  style={{
                    width: dotW,
                    minWidth: TIMELINE_DOT,
                    height: TIMELINE_DOT,
                    // Pill shape for wide labels keeps the same vertical
                    // footprint as the original circle.
                    borderRadius: dotW > TIMELINE_DOT ? TIMELINE_DOT / 2 : '50%',
                    background: circleBg,
                    border: `${borderWidth}px solid ${borderColor}`,
                    color: labelColor,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: glowShadow,
                    transition: 'all 180ms ease',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: dotW > TIMELINE_DOT ? '0 6px' : 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </button>

                {isDone ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#06B6D4',
                      border: '2px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(6,182,212,0.35)',
                    }}
                  >
                    <Icon name="check" size={9} color="#fff" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        </div>

        {showScrollChrome && !atLeftEnd ? (
          <div
            aria-hidden="true"
            style={{
              ...fadeBase,
              left: 0,
              background: 'linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0.88) 38%, transparent 100%)',
            }}
          />
        ) : null}
        {showScrollChrome && !atRightEnd ? (
          <div
            aria-hidden="true"
            style={{
              ...fadeBase,
              right: 0,
              background:
                'linear-gradient(to left, #ffffff 0%, rgba(255,255,255,0.88) 38%, transparent 100%)',
            }}
          />
        ) : null}

        {showScrollChrome && !atLeftEnd ? (
          <button
            type="button"
            aria-label="Earlier sprints"
            onClick={() => bumpTimelineBySprints(-1)}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: TIMELINE_ARROW_BTN_W,
              zIndex: 22,
              borderRadius: '6px 0 0 6px',
              border: 'none',
              borderRight: `1px solid ${C.borderSubtle}`,
              background: 'rgba(255,255,255,0.82)',
              boxShadow: '4px 0 12px rgba(248,250,252,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            <Icon name="chevron-left" size={16} color={C.fg2} />
          </button>
        ) : null}
        {showScrollChrome && !atRightEnd ? (
          <button
            type="button"
            aria-label="Later sprints"
            onClick={() => bumpTimelineBySprints(1)}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: TIMELINE_ARROW_BTN_W,
              zIndex: 22,
              borderRadius: '0 6px 6px 0',
              border: 'none',
              borderLeft: `1px solid ${C.borderSubtle}`,
              background: 'rgba(255,255,255,0.82)',
              boxShadow: '-4px 0 12px rgba(248,250,252,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            <Icon name="chevron-right" size={16} color={C.fg2} />
          </button>
        ) : null}
      </div>

      {/* Phase 2b: expansion panel — fans the off-line children of the
          clicked layer-plate node out below the strip. Always mounted so the
          max-height transition can animate open/close smoothly; pointer
          events flip with the open state so the closed panel never blocks
          canvas interactions. */}
      <div
        ref={expansionRef}
        style={{
          position: 'absolute',
          top: TIMELINE_ROW_H,
          left: 0,
          right: 0,
          maxHeight: expandedIdx >= 0 ? EXPANSION_PANEL_H : 0,
          overflow: 'hidden',
          transition: 'max-height 0.25s ease',
          pointerEvents: expandedIdx >= 0 ? 'auto' : 'none',
          zIndex: 25,
        }}
      >
        {expandedIdx >= 0 ? (
          <div
            style={{
              position: 'relative',
              height: EXPANSION_PANEL_H,
              // No background/border/mask — the unified bg plate above the
              // root already provides the glass + outline behind everything.
              // This container just positions the connectors and child dots.
            }}
          >
            <svg
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              preserveAspectRatio="none"
            >
              {expandedKidPositions.map((c, i) => {
                const rowY = PANEL_CHILD_ROW_TOP + TIMELINE_DOT / 2;
                if (!c.isHead) {
                  // Continuation node: horizontal connector from the previous
                  // chain node's right edge to this node's left edge, same Y.
                  const prev = expandedKidPositions[i - 1];
                  const sX = prev.x + prev.w / 2;
                  const eX = c.x - c.w / 2;
                  const midX = (sX + eX) / 2;
                  return (
                    <path
                      key={`exp-edge-${c.num}`}
                      d={`M ${sX} ${rowY} C ${midX} ${rowY}, ${midX} ${rowY}, ${eX} ${rowY}`}
                      stroke={C.borderSubtle}
                      strokeWidth={2}
                      fill="none"
                    />
                  );
                }
                // Chain head: cubic bezier that exits the parent VERTICALLY
                // (downward) and enters the child HORIZONTALLY from its LEFT
                // side. The control points push down from the parent first,
                // then pull sideways toward the child's left edge so the
                // tangent is horizontal at the endpoint.
                const startX = expandedX;
                const startY = 0;
                const endX = c.x - c.w / 2;
                const endY = rowY;
                const dy = Math.max(24, endY * 0.6);
                const dx = Math.max(28, (endX - startX) * 0.5);
                return (
                  <path
                    key={`exp-edge-${c.num}`}
                    d={`M ${startX} ${startY} C ${startX} ${startY + dy}, ${endX - dx} ${endY}, ${endX} ${endY}`}
                    stroke={C.borderSubtle}
                    strokeWidth={2}
                    fill="none"
                  />
                );
              })}
            </svg>
            {expandedKidPositions.map((c) => {
              // Fill decoupled from consensus — only viewing is cyan, all
              // other states (including current and consensus-done) are
              // grey. Consensus is signaled by the check-mark badge alone
              // (rendered on the strip dots; panel children inherit the
              // same fill rule for visual continuity).
              const isCurrent = c.num === sprintNum;
              const isViewing = c.num === Number(viewingSprint);
              let bgC;
              let labelC;
              if (isViewing) {
                bgC = '#06B6D4';
                labelC = '#fff';
              } else {
                bgC = '#e5e7eb';
                labelC = isCurrent ? '#06B6D4' : C.fg3;
              }
              let borderC;
              let borderW;
              let glowS;
              if (isCurrent) {
                borderC = '#06B6D4';
                borderW = 2;
                glowS = '0 0 0 3px rgba(6,182,212,0.30)';
              } else {
                // Match the strip's "thin white outline on everything except
                // current" rule so the popped-out child dots read as the
                // same family as the strip dots.
                borderC = '#ffffff';
                borderW = 1.5;
                glowS = 'none';
              }
              return (
                <button
                  key={`exp-node-${c.num}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Re-tip the line to the picked branch and navigate. lineTip
                    // gets persisted explicitly so the next render reads the new
                    // backbone immediately without waiting for the mirror effect.
                    const newTip = tipOf(c.num);
                    if (newTip != null) setLineTip(newTip);
                    setExpandedNode(null);
                    onSprintSelect(c.num);
                  }}
                  title={`Sprint ${c.label}`}
                  style={{
                    position: 'absolute',
                    left: c.x - c.w / 2,
                    top: PANEL_CHILD_ROW_TOP,
                    width: c.w,
                    minWidth: TIMELINE_DOT,
                    height: TIMELINE_DOT,
                    borderRadius: c.w > TIMELINE_DOT ? TIMELINE_DOT / 2 : '50%',
                    background: bgC,
                    color: labelC,
                    border: `${borderW}px solid ${borderC}`,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: glowS,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: c.w > TIMELINE_DOT ? '0 6px' : 0,
                    whiteSpace: 'nowrap',
                    transition: 'all 180ms ease',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
            {typeof onOpenSprintSettings === 'function' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedNode(null);
                  onOpenSprintSettings();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = 'brightness(1.08)';
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(6,182,212,0.40)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = 'brightness(1)';
                  e.currentTarget.style.boxShadow = '0 3px 12px rgba(6,182,212,0.30)';
                }}
                title="새로운 갈래 만들기"
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 14,
                  height: 28,
                  padding: '0 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background:
                    'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: 12,
                  border: 'none',
                  borderRadius: 999,
                  cursor: 'pointer',
                  boxShadow: '0 3px 12px rgba(6,182,212,0.30)',
                  transition: 'filter 160ms, box-shadow 160ms',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon name="git-branch" size={13} color="#fff" />
                <span>새로운 갈래 만들기</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {menuState.open
        // Portal to document.body so the menu escapes the timeline wrapper's stacking
        // context (which sits at zIndex 12, beneath the page navigator at zIndex 13).
        // Without this, the menu's own high zIndex is capped by its ancestor context
        // and hides behind unrelated panels.
        ? createPortal(
            <div
              ref={menuRef}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'fixed',
                left: menuState.x,
                top: menuState.y,
                transform: 'translate(6px, 6px)',
                zIndex: 100100,
                minWidth: 124,
                background: C.white,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 8,
                boxShadow: '0 10px 26px rgba(30,42,53,0.16)',
                padding: 6,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const sprintNumber = menuState.sprintNumber;
                  setMenuState({ open: false, x: 0, y: 0, sprintNumber: null });
                  if (Number.isFinite(Number(sprintNumber))) {
                    onRequestDeleteSprint(Number(sprintNumber));
                  }
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  borderRadius: 6,
                  padding: '7px 8px',
                  fontSize: 12,
                  color: C.coral,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('deleteSprintBtn')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// ─── Sprint Branches popup (Phase 1) ─────────────────────────
// Horizontal chain visualisation with parent → child connector lines drawn
// behind the nodes. Single-row layout per Phase 1 spec; Phase 2 will introduce
// layered tree rendering. Branch picker mode highlights selectable nodes and
// hands off to the parent's confirmation flow.
function SprintBranchesPopup({
  sprintsMeta = [],
  currentSprint = 0,
  viewingSprint = 0,
  branchPickerActive = false,
  onClose,
  onStartBranchPicker,
  onCancelBranchPicker,
  onPickParent,
  onNavigate,
}) {
  // Shared design language with the strip: same dot height (TIMELINE_DOT),
  // same label-width rule, same fill/border/check-mark semantics. The popup
  // adds a second dimension (rows) so branches that drop off the active path
  // can still be reached visually.
  const rows = Array.isArray(sprintsMeta) ? sprintsMeta : [];
  const byNum = new Map(rows.map((r) => [Number(r.sprint_number), r]));
  const childrenByParent = (() => {
    const m = new Map();
    for (const r of rows) {
      const p = r.parent_sprint_number;
      if (p == null) continue;
      const pn = Number(p);
      if (!m.has(pn)) m.set(pn, []);
      m.get(pn).push(Number(r.sprint_number));
    }
    return m;
  })();

  function dotWidthFor(label) {
    const s = String(label || '');
    if (s.length <= 2) return TIMELINE_DOT;
    return Math.round(TIMELINE_DOT + (s.length - 2) * 6.4 + 6);
  }

  // Tree layout — one child continues the parent's row (the largest
  // sprint_number, matching the strip's tipOf logic), siblings drop to fresh
  // rows. Recursive so each branch can itself fork further.
  const COL_STEP = 60;
  const ROW_STEP = 60;
  const TREE_PAD_X = 28;
  const TREE_PAD_Y = 14;
  const nodePos = new Map();
  let nextRow = 0;
  function place(num, col, row) {
    const r = byNum.get(num);
    if (!r) return;
    const label =
      typeof r.label === 'string' && r.label.trim() ? r.label : String(num);
    const w = dotWidthFor(label);
    nodePos.set(num, {
      num,
      label,
      w,
      archived: Boolean(r.archived),
      col,
      row,
      x: TREE_PAD_X + col * COL_STEP + w / 2,
      y: TREE_PAD_Y + row * ROW_STEP + TIMELINE_DOT / 2,
    });
    const kids = (childrenByParent.get(num) || []).slice().sort((a, b) => a - b);
    if (kids.length === 0) return;
    const inlineKid = kids[kids.length - 1];
    const branchKids = kids.slice(0, -1);
    place(inlineKid, col + 1, row);
    for (const bk of branchKids) {
      nextRow += 1;
      place(bk, col + 1, nextRow);
    }
  }
  const rootNums = rows
    .filter((r) => r.parent_sprint_number == null)
    .map((r) => Number(r.sprint_number))
    .sort((a, b) => a - b);
  for (const rn of rootNums) {
    place(rn, 0, nextRow);
    nextRow += 1;
  }

  // Canvas size from placed nodes (with room for the +4px check-mark badge
  // that sticks out top-right past the node bounds).
  let canvasW = TREE_PAD_X * 2;
  let canvasH = TREE_PAD_Y * 2;
  for (const pos of nodePos.values()) {
    canvasW = Math.max(canvasW, pos.x + pos.w / 2 + TREE_PAD_X + 8);
    canvasH = Math.max(canvasH, pos.y + TIMELINE_DOT / 2 + TREE_PAD_Y);
  }

  // Connector edges: parent right-edge → child left-edge. Same-row edges
  // render as a near-straight horizontal curve; cross-row edges use a cubic
  // bezier that exits horizontally and enters horizontally for a smooth S.
  const edges = [];
  for (const pos of nodePos.values()) {
    const parentRow = byNum.get(pos.num);
    if (!parentRow || parentRow.parent_sprint_number == null) continue;
    const parentPos = nodePos.get(Number(parentRow.parent_sprint_number));
    if (!parentPos) continue;
    const startX = parentPos.x + parentPos.w / 2;
    const startY = parentPos.y;
    const endX = pos.x - pos.w / 2;
    const endY = pos.y;
    const dx = Math.max(20, (endX - startX) * 0.45);
    edges.push({
      key: `${parentPos.num}-${pos.num}`,
      d: `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`,
    });
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(19,28,36,0.42)',
        zIndex: 140,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          background: C.white,
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: 12,
          boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: C.fg1 }}>
            Sprint Branches
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: 'none',
              borderRadius: 9999,
              background: 'rgba(31,41,55,0.06)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="x" size={14} color={C.fg2} />
          </button>
        </div>

        <div
          style={{
            border: `1px solid ${C.borderSubtle}`,
            borderRadius: 8,
            background: '#f9fafb',
            padding: '4px 0',
            overflow: 'auto',
            maxHeight: 320,
          }}
        >
          <div style={{ position: 'relative', width: canvasW, height: canvasH, margin: '0 auto' }}>
            <svg
              width={canvasW}
              height={canvasH}
              style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }}
            >
              {edges.map((e) => (
                <path
                  key={`edge-${e.key}`}
                  d={e.d}
                  stroke={C.borderSubtle}
                  strokeWidth={2}
                  fill="none"
                />
              ))}
            </svg>
            {Array.from(nodePos.values()).map((p) => {
              // Match the strip dot's full styling so the popup reads as the
              // same family of dots — only the layout (rows) differs.
              const isCurrent = p.num === Number(currentSprint);
              const isViewing = p.num === Number(viewingSprint);
              const isDone = childrenByParent.has(p.num);
              const archived = p.archived;

              let bg;
              let labelColor;
              if (archived) {
                bg = '#e5e7eb';
                labelColor = C.fg4;
              } else if (isViewing) {
                bg = '#06B6D4';
                labelColor = '#fff';
              } else {
                bg = '#e5e7eb';
                labelColor = isCurrent ? '#06B6D4' : C.fg3;
              }
              const borderColor = isCurrent ? '#06B6D4' : '#ffffff';
              const borderWidth = isCurrent ? 2 : 1.5;
              const currentGlow = isCurrent ? '0 0 0 3px rgba(6,182,212,0.30)' : 'none';

              const pickable = branchPickerActive && !archived;
              const navigable = !branchPickerActive && !archived;
              // Pickable mode advertises selectability with a cyan halo. When
              // a current sprint is also pickable, the picker halo wins —
              // both are cyan rings, action signal sits on top.
              const pickRing = pickable ? '0 0 0 3px rgba(6,182,212,0.30)' : null;
              const boxShadow = pickRing || currentGlow;

              return (
                <div
                  key={`node-wrap-${p.num}`}
                  style={{
                    position: 'absolute',
                    left: p.x - p.w / 2,
                    top: p.y - TIMELINE_DOT / 2,
                    width: p.w,
                    height: TIMELINE_DOT,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (pickable) {
                        onPickParent?.(p.num, p.label);
                      } else if (navigable) {
                        onNavigate?.(p.num);
                      }
                    }}
                    disabled={!pickable && branchPickerActive}
                    title={archived ? `Sprint ${p.label} (archived)` : `Sprint ${p.label}`}
                    style={{
                      width: '100%',
                      minWidth: TIMELINE_DOT,
                      height: '100%',
                      borderRadius: p.w > TIMELINE_DOT ? TIMELINE_DOT / 2 : '50%',
                      background: bg,
                      color: labelColor,
                      border: `${borderWidth}px solid ${borderColor}`,
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: pickable || navigable
                        ? 'pointer'
                        : branchPickerActive
                          ? 'not-allowed'
                          : 'default',
                      padding: p.w > TIMELINE_DOT ? '0 6px' : 0,
                      whiteSpace: 'nowrap',
                      boxShadow,
                      transition: 'box-shadow 160ms, background 160ms',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) => {
                      if (pickable) e.currentTarget.style.background = '#ecfeff';
                    }}
                    onMouseLeave={(e) => {
                      if (pickable) e.currentTarget.style.background = bg;
                    }}
                  >
                    {p.label}
                  </button>
                  {isDone && !archived ? (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        background: '#06B6D4',
                        border: '2px solid #fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 1px 3px rgba(6,182,212,0.35)',
                        pointerEvents: 'none',
                      }}
                    >
                      <Icon name="check" size={9} color="#fff" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, color: C.fg3, lineHeight: 1.5 }}>
            {branchPickerActive
              ? '갈래의 부모가 될 스프린트 노드를 선택하세요.'
              : ''}
          </div>
          {branchPickerActive ? (
            <button
              type="button"
              onClick={onCancelBranchPicker}
              style={{
                height: 36,
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: C.white,
                color: C.fg2,
                padding: '0 14px',
                cursor: 'pointer',
                fontSize: 13,
                fontFamily: 'inherit',
                fontWeight: 600,
              }}
            >
              취소
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartBranchPicker}
              style={{
                height: 36,
                padding: '0 18px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                color: '#fff',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 13,
                border: 'none',
                borderRadius: 999,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
              }}
            >
              <Icon name="git-branch" size={16} color="#fff" />
              <span>새로운 갈래 만들기</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Workspace screen ────────────────────────────────────────
export default function WorkspacePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [searchParams] = useSearchParams();
  const fallbackProject = getProjectById(projectId) || DEFAULT_PROJECT;
  const [projectMeta, setProjectMeta] = useState(null);
  const [projectMetaLoading, setProjectMetaLoading] = useState(true);
  // First-paint readiness gates. Kept separate from `projectMetaLoading` because
  // the spinner has to outlast the projects-table query — pages, design_files,
  // and the auth session keep loading inside BlueprintViewer for several more
  // ticks, and showing an empty canvas during that gap reads as a frozen UI.
  // `pagesInitialLoaded` flips back to false on every project navigation so the
  // spinner reappears between projects, not between sprints in the same project.
  const [pagesInitialLoaded, setPagesInitialLoaded] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  // True while we're between sprints: from the moment the resolved viewing
  // sprint changes until BlueprintViewer reports the new sprint's pages have
  // loaded. Drives the same logo spinner overlay used at first paint so the
  // canvas doesn't flash empty while design_files / markers / text_elements
  // catch up. Reset by `handlePagesInitialLoaded` (which also fires on every
  // subsequent pages-load completion, not just the first one).
  const [sprintSwitching, setSprintSwitching] = useState(false);
  const handlePagesInitialLoaded = useCallback(() => {
    setPagesInitialLoaded(true);
    setSprintSwitching(false);
  }, []);

  // Sprint branching (Phase 1). `sprintsMeta` is the per-project sprint registry
  // (sprint_number, label, parent_sprint_number, archived, …) — sprint_number
  // stays the integer foreign key across pages/messages/design_files/etc; `label`
  // is the human-facing string ("3", "3.1", "3.2.1") and is purely display.
  const [sprintsMeta, setSprintsMeta] = useState([]);
  const [showSprintSettings, setShowSprintSettings] = useState(false);
  const [branchPickerActive, setBranchPickerActive] = useState(false);
  const [branchConfirm, setBranchConfirm] = useState(null); // { sprintNumber, label } | null
  const sprintsMetaRef = useRef([]);
  sprintsMetaRef.current = sprintsMeta;
  const getSprintLabel = useCallback(
    (n) => {
      const num = Number(n);
      if (!Number.isFinite(num)) return '';
      const row = sprintsMeta.find((r) => Number(r.sprint_number) === num);
      return row && typeof row.label === 'string' && row.label.trim()
        ? row.label
        : String(num);
    },
    [sprintsMeta],
  );
  const [savingMeta, setSavingMeta] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSprint, setEditingSprint] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sprintDraft, setSprintDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [designImage, setDesignImage] = useState({ id: null, url: '', storagePath: '' });
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' });
  const [workspaceSelectedPageId, setWorkspaceSelectedPageId] = useState(null);
  const [viewingSprint, setViewingSprint] = useState(null);
  const [consensusModalData, setConsensusModalData] = useState(null);
  const hasAppliedUrlSprintRef = useRef(false);
  const [deleteSprintTarget, setDeleteSprintTarget] = useState(null);
  const [chatWidth, setChatWidth] = useState(230);
  const [chatHandleHov, setChatHandleHov] = useState(false);
  const [showConsensusPanel, setShowConsensusPanel] = useState(false);
  const [consensusPanelWidth, setConsensusPanelWidth] = useState(480);
  const [consensusResizeDrag, setConsensusResizeDrag] = useState(null);
  const chatResizeRef = useRef(null);

  useEffect(() => {
    if (!consensusResizeDrag) return undefined;
    const { startX, startWidth } = consensusResizeDrag;
    function onMove(e) {
      const dx = e.clientX - startX;
      const next = Math.max(320, Math.min(700, startWidth - dx));
      setConsensusPanelWidth(next);
    }
    function onUp() {
      setConsensusResizeDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [consensusResizeDrag]);
  const [workspaceAuthUid, setWorkspaceAuthUid] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setWorkspaceAuthUid(normalizeParticipantUserId(data?.user?.id ?? null));
      setAuthChecked(true);
    }).catch(() => {
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setWorkspaceAuthUid(normalizeParticipantUserId(session?.user?.id ?? null));
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProjectMeta() {
      if (!projectId) {
        setProjectMeta(null);
        setProjectMetaLoading(false);
        return;
      }

      setProjectMetaLoading(true);
      try {
        const { data, error } = await supabase
          .from('projects')
          .select(
            'id, name, description, description_short, description_detail, north_star, progress, sprint_number, consensus_note, user_id, is_completed, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability, priorities',
          )
          .eq('id', projectId)
          .single();

        if (import.meta.env.DEV) {
          console.log('[WorkspacePage] raw query result', data, error);
        }

        if (!alive) return;
        if (error || !data) {
          setProjectMeta(null);
        } else {
          setProjectMeta(data);
        }
      } finally {
        if (alive) setProjectMetaLoading(false);
      }
    }

    loadProjectMeta();
    return () => {
      alive = false;
    };
  }, [projectId]);

  // Sprint registry load + realtime. Drives the timeline strip and the Sprint
  // Branches popup; resets on project change. `parent_sprint_number` builds the
  // tree, `label` is the display string. We don't manage `archived` here yet —
  // it's read-only for Phase 1.
  useEffect(() => {
    if (!projectId) {
      setSprintsMeta([]);
      return undefined;
    }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('sprints')
        .select('sprint_number, label, parent_sprint_number, archived, status, title')
        .eq('project_id', projectId)
        .order('sprint_number', { ascending: true });
      if (!alive) return;
      if (error) {
        setSprintsMeta([]);
        return;
      }
      setSprintsMeta(Array.isArray(data) ? data : []);
    })();
    const channel = supabase
      .channel(`sprints-realtime-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sprints', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          setSprintsMeta((prev) => {
            if (prev.some((r) => Number(r.sprint_number) === Number(row.sprint_number))) return prev;
            const next = [...prev, row];
            next.sort((a, b) => Number(a.sprint_number) - Number(b.sprint_number));
            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sprints', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const row = payload.new || {};
          setSprintsMeta((prev) =>
            prev.map((r) =>
              Number(r.sprint_number) === Number(row.sprint_number) ? { ...r, ...row } : r,
            ),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'sprints' },
        (payload) => {
          const oldRow = payload.old || {};
          if (oldRow.project_id != null && String(oldRow.project_id) !== String(projectId)) return;
          const deletedNum = Number(oldRow.sprint_number);
          if (!Number.isFinite(deletedNum)) return;
          setSprintsMeta((prev) =>
            prev.filter((r) => Number(r.sprint_number) !== deletedNum),
          );
        },
      )
      .subscribe();
    return () => {
      alive = false;
      void supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Sidebar item dispatches an `open-sprint-settings` window event because it
  // lives outside this page tree and can't reach our state directly. Lightweight
  // and project-scoped (sidebar only dispatches when `projectId` is in the URL).
  useEffect(() => {
    function onOpenEvent() {
      setShowSprintSettings(true);
    }
    window.addEventListener('open-sprint-settings', onOpenEvent);
    return () => window.removeEventListener('open-sprint-settings', onOpenEvent);
  }, []);

  const resolvedProject = {
    ...fallbackProject,
    ...(projectMeta || {}),
  };
  /** Matches header “Sprint #…”; timeline `viewingSprint` can differ when browsing past dots. sprint_votes use this sprint. */
  const workspaceCanonicalSprint = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
  /** Align design file load / upload sprint with `BlueprintViewer` marker logic when `viewingSprint` is null or 0 before sync. */
  const workspaceEffectiveViewingSprint = (() => {
    const currentSprintNum = workspaceCanonicalSprint;
    const raw = viewingSprint;
    if (raw == null || raw === '') {
      return Number.isFinite(currentSprintNum) ? currentSprintNum : 0;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      return Number.isFinite(currentSprintNum) ? currentSprintNum : 0;
    }
    if (v < 1 && Number.isFinite(currentSprintNum) && currentSprintNum >= 1) {
      return currentSprintNum;
    }
    return v;
  })();
  // Detect actual sprint transitions (not the first computed value at mount,
  // which would falsely register as a switch). Ref tracks the previous
  // resolved sprint; on every change after the first, raise sprintSwitching
  // so the spinner overlay re-appears until BlueprintViewer reports the new
  // pages have loaded (via handlePagesInitialLoaded).
  const prevWorkspaceSprintRef = useRef(null);
  useEffect(() => {
    const prev = prevWorkspaceSprintRef.current;
    const next = workspaceEffectiveViewingSprint;
    if (prev != null && prev !== next) {
      setSprintSwitching(true);
    }
    prevWorkspaceSprintRef.current = next;
  }, [workspaceEffectiveViewingSprint]);

  const conflictPanelSprintNumber = (() => {
    const v = Number(viewingSprint);
    if (Number.isFinite(v) && v >= 1) return Math.trunc(v);
    if (Number.isFinite(workspaceCanonicalSprint) && workspaceCanonicalSprint >= 1) {
      return Math.trunc(workspaceCanonicalSprint);
    }
    return null;
  })();

  const conflictPanelIsOwner = Boolean(
    workspaceAuthUid &&
      projectMeta?.user_id &&
      String(normalizeParticipantUserId(workspaceAuthUid)) ===
        String(normalizeParticipantUserId(projectMeta.user_id)),
  );

  // Project-wide set of sprint_numbers whose sprint_ai_analysis row has a
  // non-null consensus_record. Drives the timeline check-mark badge ("this
  // sprint was actually concluded with a consensus") and the artboard's
  // "Consensus Result" pill (derived for the viewing sprint below).
  const [consensusSprintSet, setConsensusSprintSet] = useState(() => new Set());
  useEffect(() => {
    if (!projectId) {
      setConsensusSprintSet(new Set());
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('sprint_ai_analysis')
        .select('sprint_number, consensus_record')
        .eq('project_id', projectId)
        .not('consensus_record', 'is', null);
      if (cancelled) return;
      if (error) {
        setConsensusSprintSet(new Set());
        return;
      }
      const nums = new Set();
      for (const r of data || []) {
        const n = Number(r.sprint_number);
        if (Number.isFinite(n)) nums.add(n);
      }
      setConsensusSprintSet(nums);
    })();
    const ch = supabase
      .channel(`project-consensus-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sprint_ai_analysis', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const newRow = payload.new ?? null;
          const oldRow = payload.old ?? null;
          const sn = Number(newRow?.sprint_number ?? oldRow?.sprint_number);
          if (!Number.isFinite(sn)) return;
          const has = newRow ? newRow.consensus_record != null : false;
          setConsensusSprintSet((prev) => {
            const next = new Set(prev);
            if (has) next.add(sn);
            else next.delete(sn);
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(ch);
    };
  }, [projectId]);
  const viewingSprintHasConsensus =
    conflictPanelSprintNumber != null &&
    consensusSprintSet.has(Number(conflictPanelSprintNumber));

  useEffect(() => {
    if (!projectId) return;
    if (import.meta.env.DEV) {
      console.log('[WorkspacePage] ConflictPanel sprintNumber wiring', {
        projectMetaSprintRaw: projectMeta?.sprint_number ?? null,
        fallbackProjectSprint: fallbackProject.sprint ?? null,
        workspaceCanonicalSprint,
        viewingSprintTimeline: viewingSprint,
        sprintNumberPassedToConflictPanel: conflictPanelSprintNumber,
      });
    }
  }, [
    projectId,
    projectMeta?.sprint_number,
    fallbackProject.sprint,
    workspaceCanonicalSprint,
    viewingSprint,
    conflictPanelSprintNumber,
  ]);

  useEffect(() => {
    setNameDraft(projectMeta?.name || fallbackProject.name || '');
    setSprintDraft(String(projectMeta?.sprint_number ?? fallbackProject.sprint ?? ''));
    setDescriptionDraft(projectShortDescription(projectMeta));
  }, [projectMeta, fallbackProject.name, fallbackProject.sprint]);

  useEffect(() => {
    setViewingSprint(null);
    hasAppliedUrlSprintRef.current = false;
    setProjectMetaLoading(true);
    setPagesInitialLoaded(false);
    // Resetting the sprint-switch tracking on project nav lets the new
    // project's first resolved sprint settle without flagging a transition;
    // the initial-load gate (pagesInitialLoaded) already covers the spinner
    // during that window.
    prevWorkspaceSprintRef.current = null;
    setSprintSwitching(false);
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const current = Math.trunc(Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0));
    if (!Number.isFinite(current) || current < 1) return;

    setViewingSprint((prev) => {
      if (prev == null || prev === '') {
        return current;
      }
      const pv = Math.trunc(Number(prev));
      if (!Number.isFinite(pv) || pv < 1) {
        return current;
      }
      if (pv > current) {
        return current;
      }
      return prev;
    });
  }, [projectId, projectMeta?.sprint_number, fallbackProject.sprint]);

  useEffect(() => {
    if (!projectId) return;
    if (hasAppliedUrlSprintRef.current) return;

    const urlSprint = Math.trunc(Number(searchParams.get('sprint')));
    if (!Number.isFinite(urlSprint) || urlSprint < 1) return;

    const current = Math.trunc(Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0));
    if (!Number.isFinite(current) || current < 1) return;
    if (urlSprint > current) return;

    hasAppliedUrlSprintRef.current = true;
    setViewingSprint(urlSprint);
  }, [projectId, projectMeta?.sprint_number, fallbackProject.sprint, searchParams]);

  useEffect(() => {
    if (!projectId) return undefined;
    const channel = createWorkspaceProjectMetaChannel(
      supabase,
      projectId,
      (payload) => {
        const next = payload.new || null;
        if (next) {
          setProjectMeta((prev) => ({ ...(prev || {}), ...next }));
        }
      },
    ).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  async function updateProjectFields(patch) {
    if (!projectId || !patch || Object.keys(patch).length === 0) return false;
    setSavingMeta(true);
    const { data, error } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', projectId)
      .select(
        'id, name, description, description_short, description_detail, north_star, progress, sprint_number, consensus_note, is_completed, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability, priorities',
      )
      .single();
    setSavingMeta(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[WorkspacePage] project update failed', error);
      return false;
    }
    setProjectMeta((prev) => ({ ...(prev || {}), ...(data || patch) }));
    return true;
  }

  async function commitNameEdit() {
    if (!editingName) return;
    setEditingName(false);
    const nextName = nameDraft.trim();
    const currentName = projectMeta?.name || fallbackProject.name || '';
    if (!nextName || nextName === currentName) return;
    await updateProjectFields({ name: nextName });
  }

  async function commitSprintEdit() {
    if (!editingSprint) return;
    setEditingSprint(false);
    const parsed = Number.parseInt(sprintDraft, 10);
    if (Number.isNaN(parsed)) {
      setSprintDraft(String(projectMeta?.sprint_number ?? fallbackProject.sprint ?? ''));
      return;
    }
    const currentSprint = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    if (parsed === currentSprint) return;
    setViewingSprint(parsed);
    await updateProjectFields({ sprint_number: parsed });
  }

  async function commitDescriptionEdit() {
    if (!editingDescription) return;
    setEditingDescription(false);
    const nextDescription = descriptionDraft.trim();
    const currentDescription = projectShortDescription(projectMeta).trim();
    if (nextDescription === currentDescription) return;
    await updateProjectFields({
      description_short: nextDescription,
      description: nextDescription,
    });
  }

  async function fetchExistingAnalysisResult(sn) {
    if (!projectId || !sn) return {};
    const { data } = await supabase
      .from('sprint_ai_analysis')
      .select('analysis_result')
      .eq('project_id', projectId)
      .eq('sprint_number', sn)
      .maybeSingle();
    return data?.analysis_result ?? {};
  }

  async function fetchConsensusDisplayData(sn) {
    if (!projectId || !sn || sn < 1) return { approverNames: [], consensusNote: '' };
    // sprint_votes has no project_id/sprint_number columns — approvers come
    // from sprint_ai_analysis.alternative_votes. Surface what we can (the
    // consensus note) and leave approverNames empty for now.
    const { data: metaRow } = await supabase
      .from('projects')
      .select('consensus_note')
      .eq('id', projectId)
      .single();
    return {
      approverNames: [],
      consensusNote: metaRow?.consensus_note ?? '',
    };
  }

  async function handleConsensusModalClose() {
    setConsensusModalData(null);
    await handleAddSprint();
  }

  // Increments the trailing numeric segment of a sprint label, retrying when the
  // candidate collides with an existing label. "3" → "4", "3.1" → "3.2",
  // "3.2.1" → "3.2.2"; if "4" is already taken, the "3"→"4" sequence keeps
  // bumping to "5", "6", … until a free slot opens. Falls back gracefully when
  // the trailing segment isn't numeric.
  function bumpLabelTrailing(parentLabel, taken) {
    const safe = typeof parentLabel === 'string' && parentLabel.length > 0 ? parentLabel : '';
    const segments = safe.split('.');
    const tail = segments[segments.length - 1];
    const tailNum = Number.parseInt(tail, 10);
    const head = segments.slice(0, -1);
    if (!Number.isFinite(tailNum)) {
      let n = 1;
      let candidate = safe ? `${safe}.${n}` : String(n);
      while (taken.has(candidate)) {
        n += 1;
        candidate = safe ? `${safe}.${n}` : String(n);
      }
      return candidate;
    }
    let n = tailNum + 1;
    let candidate = [...head, String(n)].join('.');
    while (taken.has(candidate)) {
      n += 1;
      candidate = [...head, String(n)].join('.');
    }
    return candidate;
  }

  // Branch labels are siblings under a parent: "3" → "3.1", "3.1" if taken
  // becomes "3.2", and so on. The numeric key (sprint_number) is independent
  // and always max+1, regardless of label shape.
  function nextBranchLabel(parentLabel, taken) {
    const safe = typeof parentLabel === 'string' && parentLabel.length > 0 ? parentLabel : '';
    let n = 1;
    let candidate = safe ? `${safe}.${n}` : String(n);
    while (taken.has(candidate)) {
      n += 1;
      candidate = safe ? `${safe}.${n}` : String(n);
    }
    return candidate;
  }

  async function handleAddSprint() {
    const currentSprint = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    // Use the max sprint_number across the registry (and the canonical pointer)
    // so the linear "Create Next Sprint" never collides with an existing branch
    // sprint_number. sprintsMetaRef holds the latest snapshot regardless of
    // re-renders.
    const rows = sprintsMetaRef.current;
    const maxNum = rows.reduce(
      (acc, r) => Math.max(acc, Number(r.sprint_number) || 0),
      Number.isFinite(currentSprint) ? currentSprint : 0,
    );
    const nextSprint = maxNum + 1;
    setDesignImage({ id: null, url: '', storagePath: '' });
    setViewingSprint(nextSprint);

    if (projectId) {
      // Record the new sprint in the sprints registry so the timeline strip /
      // Branches popup pick it up. Label bumps the trailing numeric segment of
      // the source sprint's label ("3"→"4", "3.1"→"3.2"); colliding candidates
      // keep bumping. parent is the sprint we just left. Upsert on the
      // (project_id, sprint_number) PK to make this retry-safe and tolerate
      // any client/realtime race that already wrote the row.
      const sourceRow = rows.find(
        (r) => Number(r.sprint_number) === Number(currentSprint),
      );
      const sourceLabel =
        sourceRow && typeof sourceRow.label === 'string' && sourceRow.label.trim()
          ? sourceRow.label
          : String(currentSprint);
      const taken = new Set(
        rows
          .map((r) => (typeof r.label === 'string' ? r.label : ''))
          .filter((s) => s.length > 0),
      );
      const newLabel = bumpLabelTrailing(sourceLabel, taken);
      await supabase.from('sprints').upsert(
        {
          project_id: projectId,
          sprint_number: nextSprint,
          label: newLabel,
          parent_sprint_number: currentSprint >= 1 ? currentSprint : null,
          archived: false,
          title: `Sprint ${newLabel}`,
          status: 'active',
        },
        { onConflict: 'project_id,sprint_number' },
      );
    }

    await updateProjectFields({ sprint_number: nextSprint });
    setViewingSprint(nextSprint);
    setShowConsensusPanel(false);
  }

  async function handleCreateBranch(parentSprintNumber) {
    if (!projectId) return;
    const parentNum = Number(parentSprintNumber);
    if (!Number.isFinite(parentNum) || parentNum < 1) return;
    const rows = sprintsMetaRef.current;
    const parentRow = rows.find((r) => Number(r.sprint_number) === parentNum);
    const parentLabel =
      parentRow && typeof parentRow.label === 'string' && parentRow.label.trim()
        ? parentRow.label
        : String(parentNum);
    const taken = new Set(
      rows.map((r) => (typeof r.label === 'string' ? r.label : '')).filter((s) => s.length > 0),
    );
    const newLabel = nextBranchLabel(parentLabel, taken);
    const maxNum = rows.reduce(
      (acc, r) => Math.max(acc, Number(r.sprint_number) || 0),
      Number(projectMeta?.sprint_number ?? 0) || 0,
    );
    const newNum = maxNum + 1;
    const { error: insErr } = await supabase.from('sprints').upsert(
      {
        project_id: projectId,
        sprint_number: newNum,
        label: newLabel,
        parent_sprint_number: parentNum,
        archived: false,
        title: `Sprint ${newLabel}`,
        status: 'active',
      },
      { onConflict: 'project_id,sprint_number' },
    );
    if (insErr) return;
    setDesignImage({ id: null, url: '', storagePath: '' });
    await updateProjectFields({ sprint_number: newNum });
    setViewingSprint(newNum);
    setBranchPickerActive(false);
    setBranchConfirm(null);
    setShowSprintSettings(false);
  }

  async function confirmDeleteSprint() {
    if (deleteSprintTarget === null || deleteSprintTarget === undefined) {
      // eslint-disable-next-line no-console
      console.log('[DeleteSprint] aborted: deleteSprintTarget is null or undefined');
      return;
    }

    const sprintToDelete = Math.trunc(Number(deleteSprintTarget));
    const currentSprint = Math.trunc(
      Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0),
    );

    if (!projectId) {
      // eslint-disable-next-line no-console
      console.log('[DeleteSprint] aborted: missing projectId', { sprintToDelete });
      return;
    }

    if (!Number.isFinite(sprintToDelete) || sprintToDelete < 1) {
      // eslint-disable-next-line no-console
      console.log('[DeleteSprint] aborted: invalid sprintToDelete', {
        deleteSprintTarget,
        sprintToDelete,
      });
      setDeleteSprintTarget(null);
      return;
    }

    // Refuse to remove the last remaining sprint — every project keeps ≥1.
    const beforeRows = sprintsMetaRef.current || [];
    if (beforeRows.length <= 1) {
      setDeleteSprintTarget(null);
      return;
    }

    // New canonical pointer: only moves when we are removing the canonical
    // sprint itself. Branch deletions leave projects.sprint_number alone so the
    // header / "viewing sprint" semantics stay stable. When canonical must move,
    // pick the largest surviving sprint_number (the invariant the rest of the
    // app relies on: canonical === max).
    const remaining = beforeRows.filter(
      (s) => Number(s.sprint_number) !== sprintToDelete,
    );
    const remainingMax = remaining.reduce(
      (acc, r) => Math.max(acc, Number(r.sprint_number) || 0),
      0,
    );
    const isDeletingCanonical = sprintToDelete === currentSprint;
    const newCanonical = isDeletingCanonical ? remainingMax : currentSprint;

    // Optimistic local filter so the dot disappears immediately — protects
    // against a missed/late sprints realtime DELETE event.
    setSprintsMeta((prev) =>
      prev.filter((s) => Number(s.sprint_number) !== sprintToDelete),
    );

    // Move the viewport away from the deleted sprint if that's what we were on;
    // unrelated viewing positions are preserved.
    setViewingSprint((prev) => {
      const v = Number(prev);
      if (Number.isFinite(v) && v === sprintToDelete) return newCanonical;
      return prev;
    });
    setDeleteSprintTarget(null);
    if (isDeletingCanonical) {
      setProjectMeta((prev) =>
        prev && typeof prev === 'object'
          ? { ...prev, sprint_number: newCanonical }
          : prev,
      );
      setDesignImage({ id: null, url: '', storagePath: '' });
    }

    const eq = (q) => q.eq('project_id', projectId).eq('sprint_number', sprintToDelete);

    // 1) markers — no FK dependencies, safe to drop first.
    const { error: markersError } = await eq(supabase.from('markers').delete());
    if (markersError) console.warn('[DeleteSprint] markers delete failed', markersError);
    else console.log('[DeleteSprint] markers deleted', { sprintToDelete });

    // 2) text_elements — page-scoped content, drop before pages.
    const { error: textError } = await eq(supabase.from('text_elements').delete());
    if (textError) console.warn('[DeleteSprint] text_elements delete failed', textError);
    else console.log('[DeleteSprint] text_elements deleted', { sprintToDelete });

    // 3) design_files — read first so we can purge the Storage objects, then delete rows.
    const { data: filesRows, error: filesSelectError } = await eq(
      supabase.from('design_files').select('id, file_url')
    );
    if (filesSelectError) {
      console.warn('[DeleteSprint] design_files select failed', filesSelectError);
    }
    if (filesRows && filesRows.length > 0) {
      const byBucket = new Map();
      for (const r of filesRows) {
        const o = extractStorageObjectFromPublicUrl(r.file_url || '');
        if (!o?.path) continue;
        const bucket = o.bucket || 'design-bucket';
        if (!byBucket.has(bucket)) byBucket.set(bucket, []);
        byBucket.get(bucket).push(o.path);
      }
      for (const [bucket, paths] of byBucket) {
        if (paths.length === 0) continue;
        const { error: stErr } = await supabase.storage.from(bucket).remove(paths);
        if (stErr) console.warn('[DeleteSprint] storage remove failed', { bucket, count: paths.length, stErr });
        else console.log('[DeleteSprint] storage objects removed', { bucket, count: paths.length });
      }
    }
    const { error: filesError } = await eq(supabase.from('design_files').delete());
    if (filesError) console.warn('[DeleteSprint] design_files delete failed', filesError);
    else console.log('[DeleteSprint] design_files deleted', { sprintToDelete });

    // 4) pages — must come after the content that referenced them (design_files / text_elements).
    const { error: pagesError } = await eq(supabase.from('pages').delete());
    if (pagesError) console.warn('[DeleteSprint] pages delete failed', pagesError);
    else console.log('[DeleteSprint] pages deleted', { sprintToDelete });

    // 5) messages
    const { error: msgError } = await eq(supabase.from('messages').delete());
    if (msgError) console.warn('[DeleteSprint] messages delete failed', msgError);
    else console.log('[DeleteSprint] messages deleted', { sprintToDelete });

    // 6) sprint_ai_analysis (consensus_record + analysis_result live here)
    const { error: aiError } = await eq(supabase.from('sprint_ai_analysis').delete());
    if (aiError) console.warn('[DeleteSprint] sprint_ai_analysis delete failed', aiError);
    else console.log('[DeleteSprint] sprint_ai_analysis deleted', { sprintToDelete });

    // Drop the sprint's row in the registry so the timeline strip / Branches
    // popup stop rendering a dot for it.
    const { error: sprintsRowError } = await eq(supabase.from('sprints').delete());
    if (sprintsRowError) console.warn('[DeleteSprint] sprints row delete failed', sprintsRowError);
    else console.log('[DeleteSprint] sprints row deleted', { sprintToDelete });

    // Finally: roll the canonical pointer only when we actually removed the
    // canonical sprint. Branch deletions leave it untouched.
    if (isDeletingCanonical && newCanonical !== currentSprint) {
      await updateProjectFields({ sprint_number: newCanonical });
    }
  }

  useEffect(() => {
    async function loadLatestDesign() {
      if (!Number.isFinite(workspaceCanonicalSprint) || workspaceCanonicalSprint < 1) {
        return;
      }
      if (
        !Number.isFinite(Number(workspaceEffectiveViewingSprint)) ||
        workspaceEffectiveViewingSprint < 1
      ) {
        return;
      }
      const sprintKey = Math.trunc(Number(workspaceEffectiveViewingSprint));
      let query = supabase
        .from('design_files')
        .select('*')
        .eq('sprint_number', sprintKey)
        .order('created_at', { ascending: false })
        .limit(1);
      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      const { data, error } = await query;
      if (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[WorkspacePage] loadLatestDesign query failed', error);
        }
        setDesignImage({ id: null, url: '', storagePath: '' });
        return;
      }
      const row = data?.[0];
      if (!row) {
        setDesignImage({ id: null, url: '', storagePath: '' });
        return;
      }
      setDesignImage(mapDesignFileRow(row));
    }

    loadLatestDesign();

    const insertFilter =
      projectId != null && projectId !== ''
        ? eqColumnFilter('project_id', projectId)
        : undefined;
    const deleteFilter = insertFilter;

    const channel = supabase.channel(`design-files-realtime-${projectId || 'global'}`);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'design_files',
        ...(insertFilter ? { filter: insertFilter } : {}),
      },
      (payload) => {
        const next = payload.new || {};
        if (projectId && String(next.project_id) !== String(projectId)) return;
        if (Number(next.sprint_number) !== Number(workspaceEffectiveViewingSprint)) return;
        const nextUrl = next.file_url;
        if (nextUrl) {
          setDesignImage(mapDesignFileRow(next));
        }
      },
    );
    channel.on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'design_files',
        ...(deleteFilter ? { filter: deleteFilter } : {}),
      },
      (payload) => {
        const prev = payload.old || {};
        if (projectId && String(prev.project_id) !== String(projectId)) return;
        if (Number(prev.sprint_number) !== Number(workspaceEffectiveViewingSprint)) return;
        const deletedId = prev.id ?? null;
        const deletedUrl = String(prev.file_url || '').trim();
        setDesignImage((curr) => {
          if (!curr.url) return curr;
          const currUrl = String(curr.url || '').trim();
          const idMatch =
            deletedId != null && curr.id != null && String(curr.id) === String(deletedId);
          const urlMatch = Boolean(deletedUrl && currUrl && deletedUrl === currUrl);
          if (idMatch || urlMatch) {
            return { id: null, url: '', storagePath: '' };
          }
          return curr;
        });
      },
    );
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, viewingSprint, workspaceCanonicalSprint, workspaceEffectiveViewingSprint]);

  function handleSprintSelect(nextSprint) {
    setViewingSprint(Number(nextSprint));
  }

  // Core upload routine. `overrides` lets the drop handler pass an explicit target page +
  // page-local coordinates; if omitted the original cascade-offset behaviour is used.
  async function uploadDesignFile(file, overrides = {}) {
    if (!file) return;

    setUploadState({ status: 'uploading', message: '' });

    // Measure the file's intrinsic pixel dimensions locally so we can persist a
    // width/height that respects the image's actual aspect ratio (portrait images
    // shouldn't be stretched to a hard-coded landscape default).
    let naturalW = 0;
    let naturalH = 0;
    const objectUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : null;
    if (objectUrl) {
      try {
        const img = new Image();
        await new Promise((resolve) => {
          img.onload = () => { naturalW = img.naturalWidth || 0; naturalH = img.naturalHeight || 0; resolve(); };
          img.onerror = () => resolve();
          img.src = objectUrl;
        });
      } catch (_err) {
        // ignore measurement errors; we'll fall back to the legacy default below
      } finally {
        try { URL.revokeObjectURL(objectUrl); } catch (_e) { /* ignore */ }
      }
    }

    const targetSprint = Number.isFinite(Number(workspaceEffectiveViewingSprint)) &&
      workspaceEffectiveViewingSprint >= 1
      ? Number(workspaceEffectiveViewingSprint)
      : Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);

    // Resolve target page: prefer explicit override, then BlueprintViewer's selection,
    // then the first page of the sprint.
    let targetPageId = overrides.pageId ?? workspaceSelectedPageId ?? null;
    if (!targetPageId && projectId && Number.isFinite(targetSprint) && targetSprint >= 1) {
      const { data: firstPage } = await supabase
        .from('pages')
        .select('id')
        .eq('project_id', projectId)
        .eq('sprint_number', targetSprint)
        .order('page_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      targetPageId = firstPage?.id || null;
    }

    // Position: explicit override wins; otherwise cascade based on existing-image count.
    let xInPage;
    let yInPage;
    const overrideXOk = Number.isFinite(Number(overrides.xInPage));
    const overrideYOk = Number.isFinite(Number(overrides.yInPage));
    if (overrideXOk && overrideYOk) {
      xInPage = Math.round(Number(overrides.xInPage));
      yInPage = Math.round(Number(overrides.yInPage));
    } else {
      xInPage = 20;
      yInPage = 20;
      if (projectId && targetPageId && Number.isFinite(targetSprint)) {
        const { data: existingInPage } = await supabase
          .from('design_files')
          .select('id')
          .eq('project_id', projectId)
          .eq('sprint_number', targetSprint)
          .eq('page_id', targetPageId);
        const idx = (existingInPage?.length || 0);
        const offset = (idx % 8) * 24; // cycle every 8 to avoid drifting off the page
        xInPage = 20 + offset;
        yInPage = 20 + offset;
      }
    }

    // Fit the image to the available space on the page while preserving its aspect
    // ratio. Never upscale past the file's natural size. If we couldn't measure (load
    // failed, or no URL.createObjectURL support), fall back to the legacy 460×340.
    const PAGE_EDGE_PAD = 8;
    let finalW;
    let finalH;
    if (naturalW > 0 && naturalH > 0) {
      const maxW = Math.max(40, A4_W - xInPage - PAGE_EDGE_PAD);
      const maxH = Math.max(40, A4_H - yInPage - PAGE_EDGE_PAD);
      const scale = Math.min(maxW / naturalW, maxH / naturalH, 1);
      finalW = Math.max(1, Math.round(naturalW * scale));
      finalH = Math.max(1, Math.round(naturalH * scale));
    } else {
      finalW = 460;
      finalH = 340;
    }

    const filePath = `${projectId || 'global'}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('design-bucket')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setUploadState({ status: 'error', message: uploadError.message || 'Upload failed.' });
      return;
    }

    const { data: pub } = supabase.storage.from('design-bucket').getPublicUrl(filePath);
    const publicUrl = pub?.publicUrl || '';
    if (!publicUrl) {
      setUploadState({ status: 'error', message: 'Public URL generation failed.' });
      return;
    }

    const insertPayload = {
      file_url: publicUrl,
      file_name: file.name,
      project_id: projectId || null,
      sprint_number: targetSprint,
      page_id: targetPageId,
      x_in_page: xInPage,
      y_in_page: yInPage,
      width: finalW,
      height: finalH,
    };

    let { data, error } = await supabase
      .from('design_files')
      .insert(insertPayload)
      .select('id, file_url, file_name, project_id, sprint_number, page_id, x_in_page, y_in_page')
      .single();

    // Backward compat: schema may be missing some columns; degrade gracefully.
    if (error && /project_id/i.test(error.message || '')) {
      const fb = await supabase
        .from('design_files')
        .insert({ file_url: publicUrl, file_name: file.name })
        .select('id, file_url')
        .single();
      data = fb.data;
      error = fb.error;
    }

    if (error) {
      setUploadState({ status: 'error', message: error.message || 'Metadata save failed.' });
      return;
    }

    setDesignImage({ id: data?.id ?? null, url: publicUrl, storagePath: filePath });
    setUploadState({ status: 'success', message: 'Design uploaded.' });
    setTimeout(() => setUploadState({ status: 'idle', message: '' }), 1800);
  }

  // File <input> change handler.
  async function onUploadImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadDesignFile(file);
  }

  // Drag-and-drop entry: BlueprintViewer hands us the dropped image files plus the
  // resolved page id and page-local coordinates. We upload sequentially with a small
  // cascade offset so multiple drops don't stack on the exact same pixel.
  async function onDropImageFiles(files, dropInfo = {}) {
    if (!files || files.length === 0) return;
    const baseX = Number.isFinite(Number(dropInfo.xInPage)) ? Number(dropInfo.xInPage) : 20;
    const baseY = Number.isFinite(Number(dropInfo.yInPage)) ? Number(dropInfo.yInPage) : 20;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      // 20px cascade per file so multi-file drops are visibly distinguishable.
      await uploadDesignFile(file, {
        pageId: dropInfo.pageId ?? null,
        xInPage: baseX + i * 20,
        yInPage: baseY + i * 20,
      });
    }
  }

  async function onDeleteImage() {
    if (!designImage.url) return;
    setUploadState({ status: 'uploading', message: '' });

    const sprintKey = Math.trunc(Number(workspaceEffectiveViewingSprint));

    /** Remove every design file for this sprint so an older row cannot reappear after refresh. */
    if (projectId && sprintKey >= 1) {
      const { data: rows, error: selErr } = await supabase
        .from('design_files')
        .select('id, file_url')
        .eq('project_id', projectId)
        .eq('sprint_number', sprintKey);

      if (!selErr) {
        // eslint-disable-next-line no-console
        console.log('[DeleteDesign] bulk: sprint rows', {
          count: (rows || []).length,
          projectId,
          sprintKey,
        });

        let storageError = null;
        for (const row of rows || []) {
          const imageUrl = row?.file_url || '';
          const o = extractStorageObjectFromPublicUrl(imageUrl);
          const path = o.path;
          const bucket = o.bucket || 'design-bucket';
          if (path) {
            const { error: se } = await supabase.storage.from(bucket).remove([path]);
            if (se && !storageError) storageError = se;
          }
        }
        // eslint-disable-next-line no-console
        console.log('[DeleteDesign] storage delete (bulk)', { storageError });

        const { error: dbError } = await supabase
          .from('design_files')
          .delete()
          .eq('project_id', projectId)
          .eq('sprint_number', sprintKey);
        // eslint-disable-next-line no-console
        console.log('[DeleteDesign] db delete (bulk)', { dbError });

        if (!dbError) {
          setDesignImage({ id: null, url: '', storagePath: '' });
          setUploadState({
            status: 'success',
            message: storageError
              ? 'Removed from project. (Storage file may need manual cleanup.)'
              : 'Image deleted.',
          });
          setTimeout(() => setUploadState({ status: 'idle', message: '' }), 1800);
          return;
        }

        setUploadState({
          status: 'error',
          message: dbError?.message || 'Delete failed.',
        });
        return;
      }

      // eslint-disable-next-line no-console
      console.warn('[DeleteDesign] bulk list failed; falling back to single-row delete', selErr);
    }

    const fromUrl = extractStorageObjectFromPublicUrl(designImage.url);
    const storagePath =
      (typeof designImage.storagePath === 'string' && designImage.storagePath.trim()) ||
      fromUrl.path ||
      '';
    const bucketName = fromUrl.bucket || 'design-bucket';
    const designFileId = designImage.id ?? null;

    // eslint-disable-next-line no-console
    console.log('[DeleteDesign] inputs (single)', {
      designFileId,
      url: designImage.url,
      storagePathFromState: designImage.storagePath,
      storagePathResolved: storagePath,
      bucketFromUrl: fromUrl.bucket,
      bucketUsed: bucketName,
    });

    let storageError = null;
    if (storagePath) {
      const { error } = await supabase.storage.from(bucketName).remove([storagePath]);
      storageError = error;
    } else {
      // eslint-disable-next-line no-console
      console.warn('[DeleteDesign] no storage path resolved; skipping Storage remove');
    }
    // eslint-disable-next-line no-console
    console.log('[DeleteDesign] storage delete', { storagePath, bucketName, storageError });
    if (storageError) {
      // eslint-disable-next-line no-console
      console.warn('[DeleteDesign] storage delete failed; continuing with DB delete', storageError);
    }

    let dbError = null;
    if (designFileId) {
      const { error } = await supabase.from('design_files').delete().eq('id', designFileId);
      dbError = error;
    } else {
      const resp = await supabase.from('design_files').delete().eq('file_url', designImage.url);
      dbError = resp.error;
    }
    // eslint-disable-next-line no-console
    console.log('[DeleteDesign] db delete', { designFileId, dbError });

    if (dbError) {
      setUploadState({
        status: 'error',
        message: dbError?.message || 'Delete failed.',
      });
      return;
    }

    setDesignImage({ id: null, url: '', storagePath: '' });
    setUploadState({
      status: 'success',
      message: storageError
        ? 'Removed from project. (Storage file may need manual cleanup.)'
        : 'Image deleted.',
    });
    setTimeout(() => setUploadState({ status: 'idle', message: '' }), 1800);
  }

  return (
    <>
      <Header
        onBack={() => navigate('/hub')}
        showLiveSession={false}
        showLangSwitcher={false}
        rightSlot={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOverviewOpen(true);
              }}
              title={t('overview')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: C.white,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                color: C.fg2,
                fontFamily: 'inherit',
              }}
            >
              <Icon name="info" size={18} color={C.fg2} />
              {t('overview')}
            </button>
          </div>
        }
        title={
          editingName ? (
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitNameEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitNameEdit();
                } else if (e.key === 'Escape') {
                  setEditingName(false);
                  setNameDraft(projectMeta?.name || fallbackProject.name || '');
                }
              }}
              autoFocus
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: C.fg1,
                border: `1px solid ${C.border}`,
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'inherit',
                minWidth: 180,
              }}
            />
          ) : (
            <span
              onClick={() => setEditingName(true)}
              title="Click to edit title"
              style={{ cursor: 'text' }}
            >
              {projectMeta?.name || fallbackProject.name}
            </span>
          )
        }
        subtitle={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {editingSprint ? (
                <input
                  type="number"
                  min={0}
                  value={sprintDraft}
                  onChange={(e) => setSprintDraft(e.target.value)}
                  onBlur={commitSprintEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitSprintEdit();
                    } else if (e.key === 'Escape') {
                      setEditingSprint(false);
                      setSprintDraft(String(projectMeta?.sprint_number ?? fallbackProject.sprint ?? ''));
                    }
                  }}
                  autoFocus
                  style={{
                    width: 90,
                    fontSize: 11,
                    color: C.fg2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '1px 6px',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditingSprint(true)}
                  title="Click to edit sprint"
                  style={{ cursor: 'text' }}
                >
                  Sprint #{projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0}
                </span>
              )}
              <span aria-hidden="true">·</span>
              {editingDescription ? (
                <input
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={commitDescriptionEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitDescriptionEdit();
                    } else if (e.key === 'Escape') {
                      setEditingDescription(false);
                      setDescriptionDraft(projectShortDescription(projectMeta));
                    }
                  }}
                  autoFocus
                  placeholder={t('projectDescriptionPlaceholder')}
                  style={{
                    width: 360,
                    maxWidth: '55vw',
                    fontSize: 11,
                    color: C.fg2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: '1px 7px',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <span
                  onClick={() => setEditingDescription(true)}
                  title="Click to edit description"
                  style={{
                    cursor: 'text',
                    color: projectShortDescription(projectMeta).trim() ? undefined : C.fg4,
                  }}
                >
                  {projectShortDescription(projectMeta).trim() || t('projectDescriptionPlaceholder')}
                  {savingMeta ? ' · Saving...' : ''}
                </span>
              )}
          </span>
        }
      />

      <ProjectOverviewModal
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        project={resolvedProject}
      />
      {/* Loading-gate wrapper: the spinner needs to outlast projectMetaLoading
          (which only covers the projects-table query). Pages, design_files, and
          the auth session keep loading inside BlueprintViewer for several more
          ticks; the spinner stays on top until those are stable too. The
          content row is mounted as soon as project meta arrives so the child
          effects can fetch — without that, the spinner gate could never
          actually clear. */}
      <div
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <style>{`
          @keyframes ws-initial-spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
        `}</style>
        {!projectMetaLoading ? (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <BlueprintViewer
            projectId={projectId}
            timelineAnchorSeed={
              projectId != null ? `${projectId}|${projectMeta?.sprint_number ?? 'pending'}` : ''
            }
            designImageUrl={String(designImage?.url || '').trim()}
            onUploadImage={onUploadImage}
            onDeleteImage={onDeleteImage}
            uploadState={uploadState}
            currentSprint={projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0}
            projectMetaLoading={projectMetaLoading}
            viewingSprint={viewingSprint}
            onSprintSelect={handleSprintSelect}
            onRequestDeleteSprint={(sprintNumber) => setDeleteSprintTarget(sprintNumber)}
            onSelectedPageChange={setWorkspaceSelectedPageId}
            hasConsensusRecord={viewingSprintHasConsensus}
            onOpenConsensusPanel={() => setShowConsensusPanel(true)}
            onDropImageFiles={onDropImageFiles}
            onPagesInitialLoaded={handlePagesInitialLoaded}
            sprintsMeta={sprintsMeta}
            onOpenSprintSettings={() => setShowSprintSettings(true)}
          />
        </div>

        {/* Chat 왼쪽 4px 리사이저 */}
        <div
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
            chatResizeRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startWidth: chatWidth,
            };
          }}
          onPointerMove={(e) => {
            const r = chatResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            const dx = e.clientX - r.startX;
            setChatWidth(Math.max(230, r.startWidth - dx));
          }}
          onPointerUp={(e) => {
            const r = chatResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            chatResizeRef.current = null;
          }}
          onPointerCancel={(e) => {
            const r = chatResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            chatResizeRef.current = null;
          }}
          onMouseEnter={() => setChatHandleHov(true)}
          onMouseLeave={() => setChatHandleHov(false)}
          style={{
            width: 4,
            flexShrink: 0,
            alignSelf: 'stretch',
            cursor: 'col-resize',
            background: chatHandleHov ? '#2563EB' : 'transparent',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: 'background 120ms',
          }}
        />

        <ChatPanel
          key={`chat-${projectId}-${viewingSprint}`}
          width={chatWidth}
          projectId={projectId}
          senderRole="engineer"
          viewingSprintNumber={workspaceEffectiveViewingSprint}
          viewingSprintTimeline={viewingSprint}
          currentSprintNumber={workspaceCanonicalSprint}
          onMakeConsensusClick={() => setShowConsensusPanel((v) => !v)}
          onOpenSprintSettings={() => setShowSprintSettings(true)}
        />

        {/* Consensus overlay panel */}
        {showConsensusPanel ? (
          <div
            style={{
              position: 'absolute',
              top: 60,
              right: 24,
              bottom: 60,
              width: consensusPanelWidth,
              borderRadius: 16,
              background: C.white,
              border: '1px solid rgba(6,182,212,0.2)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              overflow: 'hidden',
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Floating close (X) — anchored to the panel container, not the scrolling
               tab header, so it always stays at the top-right of the visible panel. */}
            <button
              type="button"
              onClick={() => setShowConsensusPanel(false)}
              title="Close"
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                width: 28,
                height: 28,
                padding: 0,
                border: 'none',
                borderRadius: 9999,
                background: 'rgba(31,41,55,0.06)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(31,41,55,0.12)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(31,41,55,0.06)'; }}
            >
              <Icon name="x" size={14} color={C.fg2} />
            </button>
            <style>{`
              .consensus-overlay-scroll { scrollbar-width: thin; scrollbar-color: rgba(31,41,55,0.25) transparent; }
              .consensus-overlay-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
              .consensus-overlay-scroll::-webkit-scrollbar-track { background: transparent; }
              .consensus-overlay-scroll::-webkit-scrollbar-thumb { background: rgba(31,41,55,0.25); border-radius: 999px; }
              .consensus-overlay-scroll::-webkit-scrollbar-thumb:hover { background: rgba(31,41,55,0.40); }
              .consensus-overlay-scroll [style*="overflow-y: auto"],
              .consensus-overlay-scroll [style*="overflowY: auto"] { scrollbar-width: thin; scrollbar-color: rgba(31,41,55,0.25) transparent; }
            `}</style>
            <div
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                setConsensusResizeDrag({ startX: e.clientX, startWidth: consensusPanelWidth });
              }}
              title="Drag to resize"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 6,
                height: '100%',
                cursor: 'col-resize',
                background: consensusResizeDrag ? 'rgba(59,130,246,0.35)' : 'transparent',
                zIndex: 3,
                transition: consensusResizeDrag ? 'none' : 'background 120ms',
              }}
            />
            <div
              className="consensus-overlay-scroll"
              style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
            >
            <ConflictPanel
              onCloseRequest={() => setShowConsensusPanel(false)}
              key={String(projectId)}
              width={consensusPanelWidth}
          projectId={projectId}
          sprintNumber={conflictPanelSprintNumber}
          ownerUserId={projectMeta?.user_id ?? null}
          consensusNote={projectMeta?.consensus_note ?? ''}
          onSaveConsensusNote={(text) => updateProjectFields({ consensus_note: text })}
          onApprove={async (analysis) => {
            const sn = workspaceCanonicalSprint;
            const { approverNames } = await fetchConsensusDisplayData(sn);
            const record = {
              conflict: {
                title:   analysis?.activeConflict?.title    ?? null,
                summary: analysis?.activeConflict?.summary  ?? null,
                content: analysis?.activeConflict?.content  ?? null,
              },
              resolution: {
                title:       analysis?.alternative?.title       ?? null,
                description: analysis?.alternative?.description ?? null,
              },
              note: t('drAiConsensusNote'),
              participants: approverNames,
              isAiPath: true,
              source: 'ai',
              alternativeTitle: analysis?.alternative?.title ?? null,
              votes: analysis?.alternative_votes ?? {},
              savedBy: workspaceAuthUid,
              savedAt: new Date().toISOString(),
            };
            if (projectId && sn) {
              const existingAnalysis = await fetchExistingAnalysisResult(sn);
              const { error } = await supabase.from('sprint_ai_analysis').upsert(
                {
                  project_id: projectId,
                  sprint_number: sn,
                  analysis_result: analysis ?? existingAnalysis ?? {},
                  consensus_record: record,
                  updated_at: record.savedAt,
                  created_by: workspaceAuthUid,
                },
                { onConflict: 'project_id,sprint_number' },
              );
              if (error) {
                // eslint-disable-next-line no-console
                console.error('[WorkspacePage] save consensus_record (ai) FAILED', { sprint: sn, error });
              } else {
                // eslint-disable-next-line no-console
                console.log('[WorkspacePage] save consensus_record (ai) OK for sprint', sn);
              }
            }
            // No auto-popup: the inline result panel in ConflictPanel will render the
            // saved record (its realtime sub on sprint_ai_analysis picks the row up).
          }}
          onReachConsensus={async ({ analysis, manualConflict, manualResolution, manualNote, allParticipants }) => {
            const sn = workspaceCanonicalSprint;
            const participantNames = (allParticipants || []).map((p) => p.label).filter(Boolean);
            const record = {
              conflict: {
                title:   manualConflict || (analysis?.activeConflict?.title ?? null),
                summary: null,
                content: null,
              },
              resolution: {
                title:       manualResolution || (analysis?.alternative?.title ?? null),
                description: null,
              },
              note: manualNote,
              participants: participantNames,
              isAiPath: false,
              source: 'manual',
              alternativeTitle: analysis?.alternative?.title ?? null,
              votes: analysis?.alternative_votes ?? {},
              savedBy: workspaceAuthUid,
              savedAt: new Date().toISOString(),
            };
            if (projectId && sn) {
              const existingAnalysis = await fetchExistingAnalysisResult(sn);
              const { error } = await supabase.from('sprint_ai_analysis').upsert(
                {
                  project_id: projectId,
                  sprint_number: sn,
                  analysis_result: analysis ?? existingAnalysis ?? {},
                  consensus_record: record,
                  updated_at: record.savedAt,
                  created_by: workspaceAuthUid,
                },
                { onConflict: 'project_id,sprint_number' },
              );
              if (error) {
                // eslint-disable-next-line no-console
                console.error('[WorkspacePage] save consensus_record (manual) FAILED', { sprint: sn, error });
              } else {
                // eslint-disable-next-line no-console
                console.log('[WorkspacePage] save consensus_record (manual) OK for sprint', sn);
              }
            }
            // No auto-popup: inline result panel handles display + Create Next Sprint.
          }}
          currentSprintNumber={workspaceCanonicalSprint}
          onSaveConsensusRecord={async (record) => {
            const sn = conflictPanelSprintNumber;
            if (!projectId || !sn) return false;
            const existingAnalysis = await fetchExistingAnalysisResult(sn);
            const { error } = await supabase.from('sprint_ai_analysis').upsert(
              {
                project_id: projectId,
                sprint_number: sn,
                analysis_result: existingAnalysis ?? {},
                consensus_record: record,
                updated_at: new Date().toISOString(),
                created_by: workspaceAuthUid,
              },
              { onConflict: 'project_id,sprint_number' },
            );
            if (error) {
              // eslint-disable-next-line no-console
              console.error('[WorkspacePage] update consensus_record FAILED', { sprint: sn, error });
              return false;
            }
            // eslint-disable-next-line no-console
            console.log('[WorkspacePage] update consensus_record OK for sprint', sn);
            return true;
          }}
          onAdvanceViewingSprint={async () => {
            const current = workspaceCanonicalSprint;
            const target = (conflictPanelSprintNumber ?? 0) + 1;
            if (target > current) {
              await handleAddSprint();
            } else {
              setViewingSprint(target);
            }
          }}
          onCreateNextSprint={async () => { await handleAddSprint(); }}
          onReject={() => {}}
          geminiProject={{
            name: resolvedProject.name || '',
            description_short:
              projectMeta?.description_short ?? projectShortDescription(projectMeta) ?? '',
            north_star: projectMeta?.north_star ?? '',
            priority_aesthetics_functionality: projectMeta?.priority_aesthetics_functionality ?? null,
            priority_cost_quality: projectMeta?.priority_cost_quality ?? null,
            priority_speed_stability: projectMeta?.priority_speed_stability ?? null,
            priorities: projectMeta?.priorities ?? null,
          }}
          designImageUrls={designImage?.url ? [designImage.url] : []}
          isOwner={conflictPanelIsOwner}
        />
            </div>
          </div>
        ) : null}
      </div>
        ) : null}
        {(projectMetaLoading || !pagesInitialLoaded || !authChecked || sprintSwitching) ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f9fafb',
              zIndex: 200,
            }}
          >
            <img
              src="/assets/logo3.png"
              alt="Loading"
              style={{
                width: 64,
                height: 64,
                animation: 'ws-initial-spin 1.2s linear infinite',
              }}
            />
          </div>
        ) : null}
      </div>
      {consensusModalData && (
        <ConsensusModal
          data={consensusModalData}
          project={resolvedProject}
          onClose={handleConsensusModalClose}
        />
      )}

      {deleteSprintTarget ? (
        <div
          role="presentation"
          onClick={() => setDeleteSprintTarget(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,28,36,0.42)',
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.55, color: C.fg1 }}>
              {t('deleteSprintConfirm')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setDeleteSprintTarget(null)}
                style={{
                  height: 30,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  color: C.fg2,
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                }}
              >
                {t('hubCreateCancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteSprint}
                style={{
                  height: 30,
                  borderRadius: 4,
                  border: 'none',
                  background: C.coral,
                  color: '#fff',
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                }}
              >
                {t('deleteSprintConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSprintSettings ? (
        <SprintBranchesPopup
          sprintsMeta={sprintsMeta}
          currentSprint={workspaceCanonicalSprint}
          viewingSprint={Number(viewingSprint) || workspaceCanonicalSprint}
          branchPickerActive={branchPickerActive}
          onClose={() => {
            setShowSprintSettings(false);
            setBranchPickerActive(false);
            setBranchConfirm(null);
          }}
          onStartBranchPicker={() => setBranchPickerActive(true)}
          onCancelBranchPicker={() => setBranchPickerActive(false)}
          onPickParent={(sprintNumber, label) =>
            setBranchConfirm({ sprintNumber, label })
          }
          onNavigate={(sprintNumber) => {
            handleSprintSelect(sprintNumber);
            setShowSprintSettings(false);
            setBranchPickerActive(false);
            setBranchConfirm(null);
          }}
        />
      ) : null}

      {branchConfirm ? (
        <div
          role="presentation"
          onClick={() => setBranchConfirm(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,28,36,0.42)',
            zIndex: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.55, color: C.fg1 }}>
              {`Sprint ${branchConfirm.label} 다음으로 새 스프린트를 생성합니다. 계속할까요?`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setBranchConfirm(null)}
                style={{
                  height: 30,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  color: C.fg2,
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                }}
              >
                {t('hubCreateCancel')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const sn = branchConfirm.sprintNumber;
                  setBranchConfirm(null);
                  await handleCreateBranch(sn);
                }}
                style={{
                  height: 30,
                  borderRadius: 4,
                  border: 'none',
                  background:
                    'linear-gradient(135deg, #06B6D4 0%, #3B82F6 50%, #6366F1 100%)',
                  color: '#fff',
                  padding: '0 14px',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  boxShadow: '0 4px 15px rgba(6,182,212,0.3)',
                }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
