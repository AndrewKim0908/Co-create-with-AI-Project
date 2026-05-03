import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import LanguageDropdown from '@/components/LanguageDropdown';
import ProjectOverviewModal from '@/components/ProjectOverviewModal';
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
import { mockAIAnalysisResult, mockInsufficientChat } from '@/utils/mockAIAnalysis';
import { requestGeminiAnalysis } from '@/utils/geminiApi';
import {
  getUserColor,
  isEditableKeyboardTarget,
  mapDesignFileRow,
  normalizeParticipantUserId,
  participantVoteDisplayName,
  pickLinkedMemberUid,
  resolveSprintVotesSprintNumber,
} from '@/utils/helpers';
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

// ─── Blueprint viewer ────────────────────────────────────────
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
  readOnlyDebug = null,
  viewingSprintFromWorkspacePage = undefined,
  markerColor = C.coral,
  noteColor = C.fg2,
}) {
  const { lang } = useLang();
  const rootRef = useRef(null);
  const anchorRef = useRef(null);
  const contextMenuPosRef = useRef({ x: 0, y: 0 });
  const [pendingPopPos, setPendingPopPos] = useState({ left: 0, top: 0 });
  const [hovered, setHovered] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState(false);
  const hasNote = Boolean(marker.note && marker.note.trim());
  const notePh = lang === 'ko' ? '의견 입력…' : 'Add a note…';
  const deleteAsk = lang === 'ko' ? '이 마커를 삭제할까요?' : 'Delete this marker?';
  const deleteBtn = lang === 'ko' ? '삭제' : 'Delete';
  const cancelBtn = lang === 'ko' ? '취소' : 'Cancel';

  useEffect(() => {
    if (!deleteMenu) return undefined;
    function onDocDown(ev) {
      if (rootRef.current && !rootRef.current.contains(ev.target)) {
        setDeleteMenu(false);
      }
    }
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [deleteMenu]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!(deleteMenu && !isPending && canDelete)) return;
    const contextMenuMarkerId = marker.id;
    const contextMenuPos = contextMenuPosRef.current;
    console.log('[Marker] contextMenu state', contextMenuMarkerId, contextMenuPos);
  }, [deleteMenu, isPending, canDelete, marker.id]);

  useLayoutEffect(() => {
    if (!isPending || !anchorRef.current) return undefined;
    function updatePos() {
      const el = anchorRef.current;
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
          left: pendingPopPos.left,
          top: pendingPopPos.top,
          transform: 'translateY(-50%)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          background: C.white,
          border: `1px solid ${C.borderSubtle}`,
          borderRadius: 6,
          boxShadow: '0 8px 28px rgba(30,42,53,0.18)',
        }}
      >
        <input
          value={draftNote}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={notePh}
          autoFocus
          style={{
            width: 140,
            fontSize: 11,
            padding: '4px 6px',
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            outline: 'none',
            fontFamily: 'inherit',
            color: C.fg1,
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onConfirmNote();
            }
          }}
        />
        <button
          type="button"
          onClick={onConfirmNote}
          style={{
            padding: '4px 8px',
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 4,
            border: 'none',
            background: C.emerald,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {lang === 'ko' ? '확인' : 'OK'}
        </button>
        <button
          type="button"
          onClick={onCancelPending}
          style={{
            padding: '4px 6px',
            fontSize: 10,
            borderRadius: 4,
            border: `1px solid ${C.border}`,
            background: C.subtle,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: C.fg2,
          }}
        >
          {cancelBtn}
        </button>
      </div>,
      document.body,
    );

  return (
    <div
      style={{
        position: 'absolute',
        left: `${marker.xPct}%`,
        top: `${marker.yPct}%`,
        width: 0,
        height: 0,
        zIndex: deleteMenu ? 50 : 25,
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
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'auto',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={(e) => {
          if (import.meta.env.DEV) {
            console.log('[Marker] right-click fired', marker.id);
            console.log(
              '[Marker] canDelete:',
              canDelete,
              'isPending:',
              isPending,
              'myEmail:',
              myEmail,
              'isReadOnlySprint:',
              isReadOnlySprint,
            );
            if (readOnlyDebug) {
              console.log('[ReadOnly Debug]', {
                ...readOnlyDebug,
                viewingSprintFromWorkspacePage,
              });
            }
          }
          e.preventDefault();
          e.stopPropagation();
          if (isPending) return;
          if (isReadOnlySprint) {
            window.alert('현재 스프린트에서만 삭제 가능합니다');
            return;
          }
          if (!canDelete) return;
          contextMenuPosRef.current = { x: e.clientX, y: e.clientY };
          setDeleteMenu(true);
        }}
      >
        <div style={{ position: 'relative', width: 14, height: 14 }}>
          {canDelete && !isPending && hovered ? (
            <button
              type="button"
              aria-label={deleteBtn}
              title={deleteBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.confirm(deleteAsk)) onDelete(marker.id);
              }}
              style={{
                position: 'absolute',
                right: -10,
                top: -10,
                width: 18,
                height: 18,
                padding: 0,
                lineHeight: '16px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: '50%',
                border: `1px solid ${C.borderSubtle}`,
                background: C.white,
                color: C.coral,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(30,42,53,0.12)',
                zIndex: 2,
              }}
            >
              ×
            </button>
          ) : null}
          <div
            ref={anchorRef}
            data-marker-dot
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: markerColor,
              border: '2px solid #fff',
              boxShadow: '0 1px 4px rgba(30,42,53,0.35)',
              cursor: isPending || !canDelete ? 'default' : 'pointer',
            }}
          />
        </div>

        {pendingPopover}

        {!isPending && hasNote ? (
          <div
            style={{
              position: 'absolute',
              left: 22,
              top: '50%',
              transform: 'translateY(-50%)',
              maxWidth: hovered ? 240 : 0,
              opacity: hovered ? 1 : 0,
              overflow: 'hidden',
              transition:
                'max-width 0.38s cubic-bezier(0.2, 0, 0, 1), opacity 0.28s ease',
            }}
          >
            <div
              style={{
                position: 'relative',
                minWidth: 0,
                maxWidth: 220,
                padding: '8px 10px',
                background: C.white,
                border: `1px solid ${C.borderSubtle}`,
                borderRadius: 8,
                fontSize: 11,
                lineHeight: 1.45,
                color: noteColor,
                boxShadow: '0 4px 12px rgba(30,42,53,0.1)',
                whiteSpace: 'normal',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: -5,
                  top: '50%',
                  marginTop: -5,
                  width: 0,
                  height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderRight: `5px solid ${C.white}`,
                  filter: 'drop-shadow(-1px 0 0 rgba(0,0,0,0.06))',
                }}
              />
              {marker.note}
            </div>
          </div>
        ) : null}

        {deleteMenu && !isPending && canDelete ? (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: '50%',
              top: '100%',
              transform: 'translateX(-50%)',
              marginTop: 8,
              padding: '8px 10px',
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 8px 24px rgba(30,42,53,0.14)',
              minWidth: 160,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, color: C.fg1, marginBottom: 8 }}>
              {deleteAsk}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setDeleteMenu(false)}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  borderRadius: 4,
                  border: `1px solid ${C.border}`,
                  background: C.subtle,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  color: C.fg2,
                }}
              >
                {cancelBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteMenu(false);
                  onDelete(marker.id);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  borderRadius: 4,
                  border: 'none',
                  background: C.coral,
                  color: '#fff',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {deleteBtn}
              </button>
            </div>
          </div>
        ) : null}
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
  viewingSprint,
  onSprintSelect,
  onRequestDeleteSprint,
}) {
  const { t } = useLang();
  const canvasRef = useRef(null);
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
  const [imageMenu, setImageMenu] = useState({ open: false, x: 0, y: 0 });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
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
      setImageMenu({ open: false, x: 0, y: 0 });
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [imageMenu.open]);

  useEffect(() => {
    let alive = true;
    async function loadCurrentUser() {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setCurrentUserEmail(String(data?.user?.email || '').trim().toLowerCase());
    }
    loadCurrentUser();
    return () => {
      alive = false;
    };
  }, []);

  function normalizeMarkerRow(row) {
    if (!row) return null;
    return {
      id: String(row.id),
      xPct: Number(row.x_pct ?? row.xPct ?? 0),
      yPct: Number(row.y_pct ?? row.yPct ?? 0),
      note: String(row.note ?? ''),
      createdBy: String(row.created_by ?? row.createdBy ?? '').trim().toLowerCase(),
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
        .select('id, project_id, sprint_number, x_pct, y_pct, note, created_by, created_at')
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

  function viewportCursor() {
    if (isPanning) return 'grabbing';
    if (handTool || spaceHeld) return 'grab';
    if (markerMode) return 'crosshair';
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
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom((prevZ) => {
        const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prevZ * factor));
        if (Math.abs(nz - prevZ) < 1e-9) return prevZ;
        const ratio = nz / prevZ;
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        setPanX((px) => px - mx * (ratio - 1));
        setPanY((py) => py - my * (ratio - 1));
        return nz;
      });
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

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
    } else {
      if (isReadOnlySprint) {
        window.alert('마커는 현재 스프린트에서만 추가할 수 있습니다');
        return;
      }
      if (!String(designImageUrl || '').trim()) {
        window.alert('먼저 디자인 이미지를 업로드해 주세요.');
        return;
      }
      setHandTool(false);
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
      }
      return next;
    });
  }

  function handleCanvasClick(e) {
    if (skipNextMarkerClick.current) {
      skipNextMarkerClick.current = false;
      return;
    }
    if (!String(designImageUrl || '').trim()) return;
    if (!markerMode || handTool) return;
    if (isReadOnlySprint) return;
    if (e.target.closest('[data-marker-root]')) return;
    if (!projectId) return;
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingMarker({ xPct, yPct });
    setDraftNote('');
  }

  async function confirmPendingNote() {
    if (!pendingMarker || !projectId) return;
    const text = draftNote.trim();
    const insertPayload = {
      project_id: projectId,
      x_pct: pendingMarker.xPct,
      y_pct: pendingMarker.yPct,
      sprint_number: Number(effectiveViewingSprint),
      note: text,
      created_by: currentUserEmail || null,
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
      .select('id, project_id, sprint_number, x_pct, y_pct, note, created_by, created_at')
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
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
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
      <div
        ref={viewportRef}
        onMouseDown={onViewportMouseDown}
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
        <div
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center center',
            width: 460,
            height: 340,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <div
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{
              position: 'relative',
              width: 460,
              height: 340,
              flexShrink: 0,
              cursor: canvasCursor,
            }}
          >
        {designImageUrl ? (
          <img
            src={designImageUrl}
            alt="Uploaded design"
            onContextMenu={(e) => {
              if (e.target.closest?.('[data-marker-root]')) return;
              e.preventDefault();
              e.stopPropagation();
              setImageMenu({ open: true, x: e.clientX, y: e.clientY });
            }}
            style={{
              width: 460,
              height: 340,
              objectFit: 'contain',
              background: '#fff',
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 4,
              boxShadow: '0 8px 32px rgba(30,42,53,0.12)',
              display: 'block',
              cursor: canvasCursor,
            }}
          />
        ) : null}
        {designMarkers.map((m) => (
          (() => {
            const markerEmail = String(m.createdBy || '').trim().toLowerCase();
            const myEmail = String(currentUserEmail || '').trim().toLowerCase();
            const canDeleteMarker = Boolean(myEmail) && !isReadOnlySprint;
            const markerUserColor = getUserColor(markerEmail);
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
            readOnlyDebug={readOnlyDebug}
            viewingSprintFromWorkspacePage={viewingSprint}
            markerColor={markerUserColor}
            noteColor={markerUserColor}
            onDelete={async (markerId) => {
              await deleteMarkerById(markerId);
            }}
          />
            );
          })()
        ))}
        {pendingMarker ? (
          (() => {
            const myColor = getUserColor(currentUserEmail);
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
                myEmail={String(currentUserEmail || '').trim().toLowerCase()}
                isReadOnlySprint={isReadOnlySprint}
                readOnlyDebug={readOnlyDebug}
                viewingSprintFromWorkspacePage={viewingSprint}
                markerColor={myColor}
                noteColor={myColor}
                onDelete={() => {}}
              />
            );
          })()
        ) : null}
          </div>
        </div>
      </div>
      {!designImageUrl ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 7,
          }}
        >
          <div
            style={{
              maxWidth: 420,
              textAlign: 'center',
              padding: '14px 18px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.78)',
              border: `1px solid ${C.borderSubtle}`,
              boxShadow: '0 8px 24px rgba(30,42,53,0.08)',
            }}
          >
            <Icon name="upload" size={22} color={C.fg3} />
            <div style={{ marginTop: 8, fontSize: 12, color: C.fg2, lineHeight: 1.5 }}>
              {t('newSprintUploadGuide')}
            </div>
          </div>
        </div>
      ) : null}

      {imageMenu.open && designImageUrl ? (
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
              setImageMenu({ open: false, x: 0, y: 0 });
              await onDeleteImage();
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
          zIndex: 12,
          minWidth: 0,
          pointerEvents: 'none',
        }}
      >
        <div style={{ flexShrink: 0, pointerEvents: 'auto', display: 'flex', flexDirection: 'column' }}>
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
          {uploadState.status === 'uploading' ? t('hubCreateSaving') : 'Upload Design'}
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
        <SprintTimelinePanel
          timelineAnchorSeed={timelineAnchorSeed}
          currentSprint={currentSprint}
          viewingSprint={viewingSprint}
          onSprintSelect={onSprintSelect}
          onRequestDeleteSprint={onRequestDeleteSprint}
        />
      </div>

      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMarkerMode();
          }}
          title={
            isReadOnlySprint
              ? '마커는 현재 스프린트에서만 추가할 수 있습니다'
              : markerMode
                ? '마킹 끄기'
                : '마킹 켜기'
          }
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${markerMode ? C.coralBorder : C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isReadOnlySprint ? 'not-allowed' : 'pointer',
            boxShadow: markerMode
              ? '0 1px 6px rgba(208,80,69,0.2)'
              : '0 1px 3px rgba(30,42,53,0.08)',
            opacity: isReadOnlySprint ? 0.55 : 1,
          }}
        >
          <Icon
            name="message-square"
            size={13}
            color={markerMode ? C.coral : C.fg3}
          />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomByStep(true);
          }}
          title="Zoom in (Ctrl+wheel)"
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
          }}
        >
          <Icon name="zoom-in" size={13} color={C.fg3} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomByStep(false);
          }}
          title="Zoom out (Ctrl+wheel)"
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
          }}
        >
          <Icon name="zoom-out" size={13} color={C.fg3} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleHandTool();
          }}
          title={handTool ? 'Hand tool off' : 'Hand tool (pan)'}
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${handTool ? C.emeraldBorder : C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: handTool
              ? '0 1px 6px rgba(30,138,90,0.2)'
              : '0 1px 3px rgba(30,42,53,0.08)',
          }}
        >
          <Icon name="hand" size={13} color={handTool ? C.emerald : C.fg3} />
        </button>
        <button
          type="button"
          title="Layers"
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
          }}
        >
          <Icon name="layers" size={13} color={C.fg3} />
        </button>
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
function ChatPanel({ projectId, senderRole = 'engineer', width = 220 }) {
  const { t, lang } = useLang();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [sendState, setSendState] = useState({ status: 'idle', message: '' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteState, setInviteState] = useState({ status: 'idle', message: '' });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserFullName, setCurrentUserFullName] = useState('');
  const scrollRef = useRef(null);

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
      setCurrentUserEmail(data?.user?.email || '');
      setCurrentUserFullName(data?.user?.user_metadata?.full_name || '');
    }
    loadCurrentUser();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    async function loadMessages() {
      let base = supabase
        .from('messages')
        .select('id, content, sender_role, sender_name, sender_email, created_at, project_id')
        .order('created_at', { ascending: true })
        .limit(200);

      let query = projectId ? base.eq('project_id', projectId) : base;
      let { data, error } = await query;

      // Fallback: table without sender_name column.
      if (error && /sender_name/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, sender_email, created_at, project_id')
          .order('created_at', { ascending: true })
          .limit(200);
        query = projectId ? base.eq('project_id', projectId) : base;
        ({ data, error } = await query);
      }

      // Fallback: table without sender_email/project_id columns.
      if (error && /sender_email/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, sender_name, created_at, project_id')
          .order('created_at', { ascending: true })
          .limit(200);
        query = projectId ? base.eq('project_id', projectId) : base;
        ({ data, error } = await query);
      }
      if (error && /project_id/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, sender_name, sender_email, created_at')
          .order('created_at', { ascending: true })
          .limit(200);
        ({ data, error } = await base);
      }
      if (error && /sender_name/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, sender_email, created_at')
          .order('created_at', { ascending: true })
          .limit(200);
        ({ data, error } = await base);
      }
      if (error && /sender_email/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, sender_name, created_at')
          .order('created_at', { ascending: true })
          .limit(200);
        ({ data, error } = await base);
      }
      if (error && /sender_name/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, created_at')
          .order('created_at', { ascending: true })
          .limit(200);
        ({ data, error } = await base);
      }

      if (error) {
        setSendState({ status: 'error', message: error.message || 'Failed to load messages.' });
        return;
      }
      setMessages(data || []);
    }

    loadMessages();

    const channel = supabase
      .channel(`messages-realtime-${projectId || 'global'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const next = payload.new || {};
          if (projectId && String(next.project_id) !== String(projectId)) return;
          setMessages((prev) => [...prev, next]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, lang]);

  async function onSendMessage() {
    const content = input.trim();
    if (!content) return;

    setSendState({ status: 'sending', message: '' });

    let { error } = await supabase.from('messages').insert({
      content,
      sender_role: senderRole,
      sender_name: currentUserFullName || null,
      sender_email: currentUserEmail || null,
      project_id: projectId || null,
    });

    // Fallback when sender_name column doesn't exist.
    if (error && /sender_name/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_email: currentUserEmail || null,
        project_id: projectId || null,
      });
      error = fallback.error;
    }

    // Fallback when project_id column doesn't exist.
    if (error && /project_id/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_name: currentUserFullName || null,
        sender_email: currentUserEmail || null,
      });
      error = fallback.error;
    }
    if (error && /sender_name/i.test(error.message || '')) {
      const fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_email: currentUserEmail || null,
      });
      error = fallback.error;
    }
    // Fallback when sender_email column doesn't exist.
    if (error && /sender_email/i.test(error.message || '')) {
      let fallback = await supabase.from('messages').insert({
        content,
        sender_role: senderRole,
        sender_name: currentUserFullName || null,
        project_id: projectId || null,
      });
      error = fallback.error;
      if (error && /sender_name/i.test(error.message || '')) {
        fallback = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          project_id: projectId || null,
        });
        error = fallback.error;
      }
      if (error && /project_id/i.test(error.message || '')) {
        fallback = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
          sender_name: currentUserFullName || null,
        });
        error = fallback.error;
        if (error && /sender_name/i.test(error.message || '')) {
          fallback = await supabase.from('messages').insert({
            content,
            sender_role: senderRole,
          });
          error = fallback.error;
        }
      }
    }

    if (error) {
      setSendState({ status: 'error', message: error.message || 'Message send failed.' });
      return;
    }

    setInput('');
    setSendState({ status: 'success', message: 'Sent' });
    setTimeout(() => setSendState({ status: 'idle', message: '' }), 1200);
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
            {t('chatSys1')}
          </div>
        ) : messages.map((msg) => {
          const senderEmail = msg.sender_email || '';
          const senderName = String(msg.sender_name || '').trim();
          const emailPrefix = senderEmail.includes('@') ? senderEmail.split('@')[0] : '';
          const normalizedSenderEmail = String(senderEmail || '').trim().toLowerCase();
          const normalizedMyEmail = String(currentUserEmail || '').trim().toLowerCase();
          const isMine = Boolean(normalizedSenderEmail && normalizedMyEmail && normalizedSenderEmail === normalizedMyEmail);
          const userColor = getUserColor(normalizedSenderEmail);
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

function RadarChart({ axes: axesProp, datasets: datasetsProp } = {}) {
  const { t } = useLang();
  const fallbackAxes = [
    t('radarCost'),
    t('radarPerf'),
    t('radarDura'),
    t('radarMfg'),
    t('radarTime'),
    t('radarSafe'),
  ];
  const axes = axesProp?.length ? axesProp : fallbackAxes;
  const n = axes.length;
  const cx = 90;
  const cy = 90;
  const r = 65;

  const normalizeSeries = (vals) =>
    (vals || []).map((v) => {
      const x = Number(v);
      if (!Number.isFinite(x)) return 0;
      return x > 1 ? x / 100 : x;
    });

  const defaultDatasets = [
    {
      label: 'Engineer',
      values: normalizeSeries([55, 85, 75, 95, 50, 80]),
      color: '#3A6EA5',
      lineStyle: 'dashed',
    },
    {
      label: 'Designer',
      values: normalizeSeries([70, 70, 95, 55, 40, 90]),
      color: '#D05045',
      lineStyle: 'dashed',
    },
    {
      label: 'Option C',
      values: normalizeSeries([75, 82, 88, 85, 78, 87]),
      color: '#1E8A5A',
      lineStyle: 'solid',
    },
  ];

  const datasets =
    datasetsProp?.length > 0
      ? datasetsProp.map((d) => ({
          ...d,
          values: normalizeSeries(d.values),
        }))
      : defaultDatasets;

  const pt = (val, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * val * Math.cos(a), y: cy + r * val * Math.sin(a) };
  };
  const pts = (vals) => {
    const filled = vals.length >= n ? vals.slice(0, n) : [...vals, ...Array(n - vals.length).fill(0)];
    return filled.map((v, i) => pt(v, i)).map((p) => `${p.x},${p.y}`).join(' ');
  };
  const axisEnd = (i) => pt(1.08, i);

  const drawOrder = datasets.slice().sort((a, b) => {
    const rank = (x) => (x.lineStyle === 'solid' ? 1 : 0);
    return rank(a) - rank(b);
  });

  const legendRows = Math.max(datasets.length, 1);
  const legendH = legendRows * 10 + 8;
  const svgH = 162 + legendH;

  return (
    <svg width="180" height={svgH} viewBox={`0 0 180 ${svgH}`}>
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
          <g key={`${String(ax)}-${i}`}>
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
      {drawOrder.map((ds) => (
        <polygon
          key={ds.label}
          points={pts(ds.values)}
          fill={hexToRgba(ds.color, 0.12)}
          stroke={ds.color}
          strokeWidth={ds.lineStyle === 'solid' ? 2 : 1.5}
          strokeDasharray={ds.lineStyle === 'dashed' ? '3 2' : undefined}
        />
      ))}
      {datasets.map((l, i) => (
        <g key={`leg-${l.label}`} transform={`translate(4,${162 + i * 10})`}>
          <rect width="10" height="2" y="3" fill={l.color} rx="1" />
          <text x="14" y="8" style={{ fontSize: 8, fill: '#62788A', fontFamily: 'Inter,sans-serif' }}>
            {l.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Loads chat rows for AI analysis (same table as ChatPanel; tolerant of missing columns). */
async function fetchProjectChatMessagesForAI(projectId) {
  if (!projectId) return [];
  let q = supabase
    .from('messages')
    .select('id, content, sender_role, sender_name, sender_email, created_at, project_id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })
    .limit(200);
  let { data, error } = await q;
  if (error && /sender_name/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('messages')
      .select('id, content, sender_role, sender_email, created_at, project_id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(200));
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
  ownerUserId = null,
  consensusNote = '',
  onSaveConsensusNote,
  onApprove,
  onReject,
  onReachConsensus,
  geminiProject = null,
  designImageUrls = [],
  isOwner = false,
}) {
  const { t, lang } = useLang();
  const [appHov, setAppHov] = useState(false);
  const [conHov, setConHov] = useState(false);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState(null);
  const [activeConflictExpanded, setActiveConflictExpanded] = useState(false);
  const [expandedPositions, setExpandedPositions] = useState({});
  const [noteDraft, setNoteDraft] = useState('');
  const [memoLocked, setMemoLocked] = useState(false);
  const [savingMemo, setSavingMemo] = useState(false);
  const [oppHov, setOppHov] = useState(false);
  const [voteSaving, setVoteSaving] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [voteMap, setVoteMap] = useState({});
  const [authUid, setAuthUid] = useState(null);
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
    const sn = resolveSprintVotesSprintNumber(sprintNumber);
    if (!projectId || sn == null) {
      setVoteMap({});
      return {};
    }
    const voteQuery = supabase
      .from('sprint_votes')
      .select('project_id, sprint_number, user_id, vote')
      .eq('project_id', projectId)
      .eq('sprint_number', sn);
    const { data, error } = await voteQuery;

    if (import.meta.env.DEV) {
      console.log('[ConflictPanel] sprint_votes fetch', {
        projectId,
        sprintNumberFiltered: sn,
        sprintNumberPropRaw: sprintNumber,
        rowCount: data?.length ?? 0,
        rows: data,
        fetchError: error?.message ?? null,
      });
    }

    const next = {};
    (participantsRef.current || []).forEach((p) => {
      const uid = normalizeParticipantUserId(p.userId);
      if (uid && !(uid in next)) next[uid] = null;
    });
    (data || []).forEach((r) => {
      const uid = normalizeParticipantUserId(r.user_id);
      if (!uid) return;
      const rowSn = resolveSprintVotesSprintNumber(r.sprint_number);
      const rowPid = r.project_id != null ? String(r.project_id) : null;
      if (String(projectId) !== rowPid || rowSn !== sn) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel] sprint_votes row outside filter (unexpected)', {
          row: r,
          expectedProjectId: projectId,
          expectedSprint: sn,
        });
        return;
      }
      next[uid] = r.vote;
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

      if (unanimousNavLockRef.current) {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][SYNC] unanimous check:blocked (nav lock)');
        }
        return;
      }
      const navToken = `${projectId}:${sprintNumber}`;
      if (conflictUnanimousNavToken === navToken) {
        if (import.meta.env.DEV) {
          console.log('[ConflictPanel][SYNC] unanimous check:blocked (global nav token)');
        }
        return;
      }
      unanimousNavLockRef.current = true;
      conflictUnanimousNavToken = navToken;
      if (import.meta.env.DEV) {
        console.log('[ConflictPanel][SYNC] unanimous check:INVOKING onApprove → consensus', {
          source,
        });
      }
      try {
        await onApproveRef.current?.();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel][SYNC] onApprove threw', e);
        unanimousNavLockRef.current = false;
        conflictUnanimousNavToken = null;
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
    loadVotes();
  }, [loadVotes, participants]);

  useEffect(() => {
    loadParticipants();
  }, [loadParticipants]);

  useEffect(() => {
    let cancelled = false;
    async function loadStoredAnalysis() {
      const sn = resolveSprintVotesSprintNumber(sprintNumber);
      if (!projectId || sn == null) {
        if (!cancelled) setAiAnalysisResult(null);
        return;
      }
      const { data, error } = await supabase
        .from('sprint_ai_analysis')
        .select('analysis_result')
        .eq('project_id', projectId)
        .eq('sprint_number', sn)
        .maybeSingle();
      if (cancelled) return;
      if (error && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[ConflictPanel] sprint_ai_analysis load', error.message);
      }
      if (data?.analysis_result) {
        setAiAnalysisResult(data.analysis_result);
      } else if (!cancelled) {
        setAiAnalysisResult(null);
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
          if (!row?.analysis_result) return;
          const rowSn = resolveSprintVotesSprintNumber(row.sprint_number);
          const sn = resolveSprintVotesSprintNumber(sprintNumber);
          if (rowSn == null || sn == null || rowSn !== sn) return;
          setAiAnalysisResult(row.analysis_result);
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
    try {
      const chatRows = await fetchProjectChatMessagesForAI(projectId);
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
        },
        chatMessages,
        participants: participantsForAi,
        designImageUrls: Array.isArray(designImageUrls) ? designImageUrls : [],
        language: lang,
      });

      setAiAnalysisResult(result);
      await saveAnalysisResult(result);
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
      await onReachConsensus();
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

  return (
    <div
      style={{
        width,
        background: C.white,
        borderLeft: `1px solid ${C.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flexShrink: 0,
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
            flex: '66 1 0%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderBottom: `1px solid ${C.borderSubtle}`,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              position: 'sticky',
              top: 0,
              zIndex: 10,
              background: C.white,
              padding: isOwner ? 16 : '12px 16px',
              borderBottom: `1px solid ${C.borderSubtle}`,
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            }}
          >
            {isOwner ? (
              <button
                type="button"
                disabled={aiAnalysisLoading}
                onClick={handleRequestAIAnalysis}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  border: `1px solid ${C.emeraldBorder}`,
                  background: aiAnalysisResult && !aiAnalysisLoading ? C.emeraldLight : C.white,
                  color: aiAnalysisResult && !aiAnalysisLoading ? C.emerald : C.fg2,
                  cursor: aiAnalysisLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'background 160ms, color 160ms',
                }}
              >
                {aiAnalysisLoading ? (
                  <>
                    <span className="conflict-spin" style={{ display: 'inline-flex' }}>
                      <Icon name="loader" size={14} color={C.emerald} />
                    </span>
                    <span>{t('requestAiAnalysisBtn')}</span>
                  </>
                ) : aiAnalysisResult ? (
                  <>
                    <Icon name="check-circle" size={14} color={C.emerald} />
                    <span>{t('aiAnalysisComplete')}</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={16} color={C.emerald} />
                    <span>{t('requestAiAnalysisBtn')}</span>
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
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RadarChart
                    axes={aiAnalysisResult.valueMatrix.axes}
                    datasets={[
                      {
                        label: t('projectNorthStar'),
                        values: aiAnalysisResult.valueMatrix.projectValues,
                        color: C.fg1,
                        lineStyle: 'solid',
                      },
                      ...aiAnalysisResult.valueMatrix.positionValues.map((pos) => ({
                        label: pos.userName,
                        values: pos.values,
                        color: pos.color,
                        lineStyle: 'dashed',
                      })),
                    ]}
                  />
                </div>
              </div>

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
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '1px 5px',
                      borderRadius: 9999,
                      background: C.emerald,
                      color: '#fff',
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    {t('optionCNew')}
                  </span>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.fg1, lineHeight: 1.4 }}>
                  {aiAnalysisResult.alternative.title}
                </div>
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
                    disabled={voteSaving || !sprintVoteKeyOk}
                    onMouseEnter={() => setAppHov(true)}
                    onMouseLeave={() => setAppHov(false)}
                    onClick={handleApproveVoteClick}
                    style={{
                      flex: '1 1 0%',
                      minWidth: 0,
                      padding: '9px 8px',
                      borderRadius: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      color: appHov ? '#fff' : C.emerald,
                      background: appHov ? C.emeraldHover : 'transparent',
                      border: `1px solid ${C.emerald}`,
                      cursor: voteSaving || !sprintVoteKeyOk ? 'not-allowed' : 'pointer',
                      opacity: voteSaving ? 0.75 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: 'none',
                      transition: 'color 200ms ease, background-color 200ms ease, border-color 200ms ease',
                      transform: appHov ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <Icon name="check" size={14} color={appHov ? '#fff' : C.emerald} />
                    {t('approveBtn')}
                  </button>
                  <button
                    type="button"
                    disabled={voteSaving || !sprintVoteKeyOk}
                    onMouseEnter={() => setOppHov(true)}
                    onMouseLeave={() => setOppHov(false)}
                    onClick={handleOpposeVoteClick}
                    style={{
                      flex: '1 1 0%',
                      minWidth: 0,
                      padding: '9px 8px',
                      borderRadius: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      color: oppHov ? '#fff' : C.coral,
                      background: oppHov ? C.coralHover : 'transparent',
                      border: `1px solid ${C.coral}`,
                      cursor: voteSaving || !sprintVoteKeyOk ? 'not-allowed' : 'pointer',
                      opacity: voteSaving ? 0.75 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      boxShadow: 'none',
                      transition: 'color 200ms ease, background-color 200ms ease, border-color 200ms ease',
                      transform: oppHov ? 'translateY(-1px)' : 'none',
                    }}
                  >
                    <Icon name="x" size={14} color={oppHov ? '#fff' : C.coral} />
                    {t('opposeBtn')}
                  </button>
                </div>
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
                    borderTop: `1px solid rgba(30,138,90,0.25)`,
                    minWidth: 0,
                  }}
                >
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.fg3, marginBottom: 6 }}>
                    {t('voteParticipantsHeading')}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!participants.length ? (
                      <div style={{ fontSize: 10, color: C.fg4 }}>—</div>
                    ) : (
                      participants.map((p) => {
                        let status = 'pending';
                        if (p.userId) {
                          const uidNorm = normalizeParticipantUserId(p.userId);
                          const v = uidNorm ? voteMap[uidNorm] : undefined;
                          if (v === VOTE_STATUS.APPROVE) status = VOTE_STATUS.APPROVE;
                          else if (v === VOTE_STATUS.OPPOSE) status = VOTE_STATUS.OPPOSE;
                          else status = 'pending';
                        }

                        return (
                          <div
                            key={p.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 10,
                              minHeight: 20,
                              minWidth: 0,
                            }}
                          >
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
                              {status === VOTE_STATUS.APPROVE ? (
                                <Icon name="check" size={14} color={C.emerald} />
                              ) : status === VOTE_STATUS.OPPOSE ? (
                                <Icon name="x" size={14} color={C.coral} />
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
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
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
          </div>
        </div>

        <div
          style={{
            flex: '0 0 150px',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '10px 12px',
            background: C.subtle,
            borderBottom: `1px solid ${C.borderSubtle}`,
            position: 'relative',
          }}
        >
          <textarea
            aria-label={t('consensusNotePlaceholder')}
            readOnly={memoLocked}
            placeholder={t('consensusNotePlaceholder')}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            style={{
              flex: 1,
              minHeight: 0,
              width: '100%',
              resize: 'none',
              borderRadius: 4,
              border: `1px solid ${C.border}`,
              padding: memoLocked ? '8px 10px 28px 10px' : '8px 10px',
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
                right: 18,
                bottom: 16,
                width: 28,
                height: 28,
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(30,42,53,0.08)',
              }}
            >
              <Icon name="pencil" size={13} color={C.fg2} />
            </button>
          ) : null}
        </div>
      </div>

      {!memoLocked ? (
        <div
          style={{
            padding: '12px',
            borderTop: `1px solid ${C.borderSubtle}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <button
            type="button"
            disabled={!reachEnabled}
            onClick={handleReachConsensusClick}
            onMouseEnter={() => setConHov(true)}
            onMouseLeave={() => setConHov(false)}
            style={{
              width: '100%',
              padding: '9px',
              borderRadius: 5,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              color: reachEnabled ? C.emerald : C.fg4,
              background: reachEnabled ? (conHov ? C.emeraldLight : C.white) : '#F1F4F8',
              border: `1px solid ${reachEnabled ? C.emeraldBorder : C.borderSubtle}`,
              cursor: reachEnabled ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              transition: 'all 160ms',
              opacity: reachEnabled ? 1 : 0.85,
            }}
          >
            <Icon name="sparkles" size={14} color={reachEnabled ? C.emerald : C.fg4} />{' '}
            {savingMemo ? '…' : t('reachConsensusBtn')}
          </button>
        </div>
      ) : null}
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
  viewingSprint,
  onSprintSelect,
  onRequestDeleteSprint,
}) {
  const { t } = useLang();
  const menuRef = useRef(null);
  const anchoredSeedRef = useRef('');
  const viewportWrapRef = useRef(null);
  const [viewportW, setViewportW] = useState(320);

  const sprintNum = Number.isFinite(Number(currentSprint)) ? Number(currentSprint) : 0;
  const sprints = [];
  for (let i = 1; i <= sprintNum; i += 1) sprints.push(i);
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

  const contentWidth =
    sprintNum <= 0 ? 0 : sprintNum * TIMELINE_DOT + (sprintNum - 1) * TIMELINE_SPRINT_GAP;
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
        pointerEvents: 'auto',
      }}
    >
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
            }}
          >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: TIMELINE_DOT / 2,
              top: '50%',
              height: 2,
              background: C.borderSubtle,
              transform: 'translateY(-50%)',
              zIndex: 0,
              borderRadius: 1,
              width:
                sprintNum <= 1 ? 0 : (sprintNum - 1) * TIMELINE_SPRINT_STEP,
            }}
          />

          {sprints.map((num) => {
            const isPast = num < sprintNum;
            const isCurrent = num === sprintNum;
            const isViewing = num === Number(viewingSprint);

            const circleBg = isCurrent ? C.emerald : isPast ? C.subtle : C.white;
            const circleBorder = isCurrent ? C.emerald : isPast ? C.borderSubtle : C.border;
            const labelColor = isCurrent ? '#fff' : isPast ? C.fg3 : C.fg4;

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
                <button
                  type="button"
                  onClick={() => onSprintSelect(num)}
                  onContextMenu={(e) => {
                    const canDelete = num === sprintNum && sprintNum > 1;
                    if (!canDelete) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuState({
                      open: true,
                      x: e.clientX,
                      y: e.clientY,
                      sprintNumber: num,
                    });
                  }}
                  title={`Sprint #${num}`}
                  style={{
                    width: TIMELINE_DOT,
                    height: TIMELINE_DOT,
                    borderRadius: '50%',
                    background: circleBg,
                    border: `2px solid ${circleBorder}`,
                    color: labelColor,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: 0.2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: isCurrent
                      ? '0 0 0 4px rgba(30,138,90,0.18), 0 2px 6px rgba(30,138,90,0.25)'
                      : isViewing
                      ? '0 0 0 3px rgba(58,74,88,0.2)'
                      : 'none',
                    transition: 'all 180ms ease',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: 0,
                  }}
                >
                  #{num}
                </button>

                {isPast ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: 6,
                      bottom: -1,
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: C.emerald,
                      border: '2px solid #fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 1px 3px rgba(30,138,90,0.35)',
                    }}
                  >
                    <Icon name="check" size={8} color="#fff" />
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
            }}
          >
            <Icon name="chevron-right" size={16} color={C.fg2} />
          </button>
        ) : null}
      </div>

      {menuState.open ? (
        <div
          ref={menuRef}
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
        </div>
      ) : null}
    </div>
  );
}

// ─── Workspace screen ────────────────────────────────────────
export default function WorkspacePage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const { projectId } = useParams();
  const fallbackProject = getProjectById(projectId) || DEFAULT_PROJECT;
  const [projectMeta, setProjectMeta] = useState(null);
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
  const [viewingSprint, setViewingSprint] = useState(null);
  const [deleteSprintTarget, setDeleteSprintTarget] = useState(null);
  const [chatWidth, setChatWidth] = useState(230);
  const [conflictWidth, setConflictWidth] = useState(230);
  const [chatHandleHov, setChatHandleHov] = useState(false);
  const [conflictHandleHov, setConflictHandleHov] = useState(false);
  const chatResizeRef = useRef(null);
  const conflictResizeRef = useRef(null);
  const [workspaceAuthUid, setWorkspaceAuthUid] = useState(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setWorkspaceAuthUid(normalizeParticipantUserId(data?.user?.id ?? null));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setWorkspaceAuthUid(normalizeParticipantUserId(session?.user?.id ?? null));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadProjectMeta() {
      if (!projectId) {
        setProjectMeta(null);
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select(
          'id, name, description, description_short, description_detail, north_star, progress, sprint_number, consensus_note, user_id, is_completed, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability',
        )
        .eq('id', projectId)
        .single();

      if (import.meta.env.DEV) {
        console.log('[WorkspacePage] raw query result', data, error);
      }

      if (!alive) return;
      if (error || !data) {
        setProjectMeta(null);
        return;
      }
      setProjectMeta(data);
    }

    loadProjectMeta();
    return () => {
      alive = false;
    };
  }, [projectId]);

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
  const conflictPanelSprintNumber =
    Number.isFinite(workspaceCanonicalSprint) && workspaceCanonicalSprint >= 1
      ? Math.trunc(workspaceCanonicalSprint)
      : null;

  const conflictPanelIsOwner = Boolean(
    workspaceAuthUid &&
      projectMeta?.user_id &&
      String(normalizeParticipantUserId(workspaceAuthUid)) ===
        String(normalizeParticipantUserId(projectMeta.user_id)),
  );

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
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const current = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    if (!Number.isFinite(current) || current < 1) return;
    setViewingSprint(current);
  }, [projectId, projectMeta?.sprint_number, fallbackProject.sprint]);

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
        'id, name, description, description_short, description_detail, north_star, progress, sprint_number, consensus_note, is_completed, start_date, due_date, priority_aesthetics_functionality, priority_cost_quality, priority_speed_stability',
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

  async function handleAddSprint() {
    const currentSprint = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    const nextSprint = currentSprint + 1;
    setDesignImage({ id: null, url: '', storagePath: '' });
    setViewingSprint(nextSprint);

    if (projectId) {
      if (Number.isFinite(currentSprint) && currentSprint >= 1) {
        const { error: delVotesErr } = await supabase
          .from('sprint_votes')
          .delete()
          .eq('project_id', projectId)
          .eq('sprint_number', currentSprint);
        if (delVotesErr) {
          // eslint-disable-next-line no-console
          console.error('[WorkspacePage] delete sprint_votes for ended sprint failed', delVotesErr);
        } else {
          if (import.meta.env.DEV) {
            console.log('[WorkspacePage] cleared sprint_votes', {
              projectId,
              clearedSprintNumber: currentSprint,
              nextSprint,
            });
          }
        }
      }

      const { error: cleanupDesignError } = await supabase
        .from('design_files')
        .delete()
        .eq('project_id', projectId)
        .gt('sprint_number', currentSprint);
      if (cleanupDesignError) {
        // eslint-disable-next-line no-console
        console.error('[WorkspacePage] cleanup future design_files failed', cleanupDesignError);
      }
      const { error: cleanupMarkerError } = await supabase
        .from('markers')
        .delete()
        .eq('project_id', projectId)
        .gt('sprint_number', currentSprint);
      if (cleanupMarkerError) {
        // eslint-disable-next-line no-console
        console.error('[WorkspacePage] cleanup future markers failed', cleanupMarkerError);
      }
    }

    await updateProjectFields({ sprint_number: nextSprint });
  }

  async function confirmDeleteSprint() {
    const sprintToDelete = Number(deleteSprintTarget);
    const currentSprint = Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    if (!projectId || !Number.isFinite(sprintToDelete)) return;
    if (sprintToDelete !== currentSprint || currentSprint <= 1) {
      setDeleteSprintTarget(null);
      return;
    }
    const previousSprint = currentSprint - 1;
    setDeleteSprintTarget(null);
    setViewingSprint(previousSprint);
    setDesignImage({ id: null, url: '', storagePath: '' });

    const { error: deleteDesignError } = await supabase
      .from('design_files')
      .delete()
      .eq('project_id', projectId)
      .eq('sprint_number', sprintToDelete);
    if (deleteDesignError) {
      // eslint-disable-next-line no-console
      console.error('[WorkspacePage] delete sprint design_files failed', deleteDesignError);
    }

    const { error: deleteMarkerError } = await supabase
      .from('markers')
      .delete()
      .eq('project_id', projectId)
      .eq('sprint_number', sprintToDelete);
    if (deleteMarkerError) {
      // eslint-disable-next-line no-console
      console.error('[WorkspacePage] delete sprint markers failed', deleteMarkerError);
    }

    await updateProjectFields({ sprint_number: previousSprint });
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
      const sprintKey = Number(workspaceEffectiveViewingSprint);
      let base = supabase
        .from('design_files')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
      let query = projectId ? base.eq('project_id', projectId) : base;
      query = query.eq('sprint_number', sprintKey);
      let { data, error } = await query;
      if (error && /project_id/i.test(error.message || '')) {
        base = supabase
          .from('design_files')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1);
        ({ data, error } = await base.eq('sprint_number', sprintKey));
      }
      if (error) return;
      const row = data?.[0];
      setDesignImage(mapDesignFileRow(row));
    }

    loadLatestDesign();

    const channel = supabase
      .channel(`design-files-realtime-${projectId || 'global'}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'design_files' },
        (payload) => {
          const next = payload.new || {};
          if (projectId && String(next.project_id) !== String(projectId)) return;
          if (Number(next.sprint_number) !== Number(workspaceEffectiveViewingSprint)) return;
          const nextUrl = next.file_url || next.url;
          if (nextUrl) {
            setDesignImage(mapDesignFileRow(next));
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'design_files' },
        (payload) => {
          const prev = payload.old || {};
          if (projectId && String(prev.project_id) !== String(projectId)) return;
          if (Number(prev.sprint_number) !== Number(workspaceEffectiveViewingSprint)) return;
          const deletedId = prev.id || null;
          setDesignImage((curr) => {
            if (!curr.url) return curr;
            if (deletedId && curr.id && String(curr.id) === String(deletedId)) {
              return { id: null, url: '', storagePath: '' };
            }
            return curr;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, viewingSprint, workspaceCanonicalSprint]);

  function handleSprintSelect(nextSprint) {
    setViewingSprint(Number(nextSprint));
  }

  async function onUploadImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadState({ status: 'uploading', message: '' });
    const filePath = `${projectId || 'global'}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('design-bucket')
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setUploadState({ status: 'error', message: uploadError.message || 'Upload failed.' });
      return;
    }

    const { data } = supabase.storage.from('design-bucket').getPublicUrl(filePath);
    const publicUrl = data?.publicUrl || '';
    if (!publicUrl) {
      setUploadState({ status: 'error', message: 'Public URL generation failed.' });
      return;
    }

    const targetSprint = Number.isFinite(Number(workspaceEffectiveViewingSprint)) &&
      workspaceEffectiveViewingSprint >= 1
      ? Number(workspaceEffectiveViewingSprint)
      : Number(projectMeta?.sprint_number ?? fallbackProject.sprint ?? 0);
    let { error } = await supabase.from('design_files').insert({
      file_url: publicUrl,
      file_name: file.name,
      project_id: projectId || null,
      sprint_number: targetSprint,
    });

    // Fallback when table uses `url` instead of `file_url`.
    if (error && /file_url/i.test(error.message || '')) {
      const fallback = await supabase.from('design_files').insert({
        url: publicUrl,
        file_name: file.name,
        project_id: projectId || null,
        sprint_number: targetSprint,
      });
      error = fallback.error;
    }
    if (error && /project_id/i.test(error.message || '')) {
      const fallback = await supabase.from('design_files').insert({
        file_url: publicUrl,
        file_name: file.name,
      });
      error = fallback.error;
    }

    if (error) {
      setUploadState({ status: 'error', message: error.message || 'Metadata save failed.' });
      return;
    }

    setDesignImage({ id: null, url: publicUrl, storagePath: filePath });
    setUploadState({ status: 'success', message: 'Design uploaded.' });
    setTimeout(() => setUploadState({ status: 'idle', message: '' }), 1800);
  }

  async function onDeleteImage() {
    if (!designImage.url) return;
    setUploadState({ status: 'uploading', message: '' });

    let storageError = null;
    if (designImage.storagePath) {
      const { error } = await supabase
        .storage
        .from('design-bucket')
        .remove([designImage.storagePath]);
      storageError = error;
    }

    let dbError = null;
    if (designImage.id) {
      const { error } = await supabase.from('design_files').delete().eq('id', designImage.id);
      dbError = error;
    } else {
      let resp = await supabase.from('design_files').delete().eq('file_url', designImage.url);
      dbError = resp.error;
      if (dbError && /file_url/i.test(dbError.message || '')) {
        resp = await supabase.from('design_files').delete().eq('url', designImage.url);
        dbError = resp.error;
      }
    }

    if (storageError || dbError) {
      setUploadState({
        status: 'error',
        message: dbError?.message || storageError?.message || 'Delete failed.',
      });
      return;
    }

    setDesignImage({ id: null, url: '', storagePath: '' });
    setUploadState({ status: 'success', message: 'Image deleted.' });
    setTimeout(() => setUploadState({ status: 'idle', message: '' }), 1500);
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
            <LanguageDropdown />
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
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
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
            viewingSprint={viewingSprint}
            onSprintSelect={handleSprintSelect}
            onRequestDeleteSprint={(sprintNumber) => setDeleteSprintTarget(sprintNumber)}
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

        <ChatPanel width={chatWidth} projectId={projectId} senderRole="engineer" />

        {/* Conflict 왼쪽 8px 리사이저 */}
        <div
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
            conflictResizeRef.current = {
              pointerId: e.pointerId,
              startX: e.clientX,
              startWidth: conflictWidth,
            };
          }}
          onPointerMove={(e) => {
            const r = conflictResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            const dx = e.clientX - r.startX;
            setConflictWidth(Math.max(230, r.startWidth - dx));
          }}
          onPointerUp={(e) => {
            const r = conflictResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            conflictResizeRef.current = null;
          }}
          onPointerCancel={(e) => {
            const r = conflictResizeRef.current;
            if (!r || r.pointerId !== e.pointerId) return;
            try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }
            conflictResizeRef.current = null;
          }}
          onMouseEnter={() => setConflictHandleHov(true)}
          onMouseLeave={() => setConflictHandleHov(false)}
          style={{
            width: 8,
            flexShrink: 0,
            alignSelf: 'stretch',
            cursor: 'col-resize',
            background: conflictHandleHov ? '#2563EB' : 'transparent',
            touchAction: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            transition: 'background 120ms',
          }}
        />

        <ConflictPanel
          key={String(projectId)}
          width={conflictWidth}
          projectId={projectId}
          sprintNumber={conflictPanelSprintNumber}
          ownerUserId={projectMeta?.user_id ?? null}
          consensusNote={projectMeta?.consensus_note ?? ''}
          onSaveConsensusNote={(text) => updateProjectFields({ consensus_note: text })}
          onApprove={async () => {
            await handleAddSprint();
            navigate(`/project/${resolvedProject.id}/consensus`);
          }}
          onReachConsensus={async () => {
            await handleAddSprint();
            navigate(`/project/${resolvedProject.id}/consensus`);
          }}
          onReject={() => {}}
          geminiProject={{
            name: resolvedProject.name || '',
            description_short:
              projectMeta?.description_short ?? projectShortDescription(projectMeta) ?? '',
            north_star: projectMeta?.north_star ?? '',
            priority_aesthetics_functionality: projectMeta?.priority_aesthetics_functionality ?? null,
            priority_cost_quality: projectMeta?.priority_cost_quality ?? null,
            priority_speed_stability: projectMeta?.priority_speed_stability ?? null,
          }}
          designImageUrls={designImage?.url ? [designImage.url] : []}
          isOwner={conflictPanelIsOwner}
        />
      </div>
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
    </>
  );
}
