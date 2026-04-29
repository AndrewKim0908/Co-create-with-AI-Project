import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/Header';
import Icon from '@/components/Icon';
import { C } from '@/constants/colors';
import { getProjectById, DEFAULT_PROJECT } from '@/constants/projects';
import { useLang } from '@/i18n/LangContext';
import { supabase } from '@/lib/supabase';

/** message-square 실루엣 — 내부 흰색 채움 + 테두리 (커서용) */
const MARKER_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="#ffffff" stroke="#3A4A58" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const MARKER_MODE_CURSOR =
  typeof btoa !== 'undefined'
    ? `url("data:image/svg+xml;base64,${btoa(MARKER_CURSOR_SVG)}") 2 18, crosshair`
    : `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARKER_CURSOR_SVG)}") 2 18, crosshair`;

const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;

function isEditableKeyboardTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const t = target.tagName;
  if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function extractStoragePathFromPublicUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const marker = '/object/public/design-bucket/';
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return '';
    const encodedPath = u.pathname.slice(idx + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return '';
  }
}

function mapDesignFileRow(row) {
  const imageUrl = row?.file_url || row?.url || '';
  return {
    id: row?.id || null,
    url: imageUrl,
    storagePath: extractStoragePathFromPublicUrl(imageUrl),
  };
}

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
  markerColor = C.coral,
}) {
  const { lang } = useLang();
  const rootRef = useRef(null);
  const anchorRef = useRef(null);
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
      >
        <div style={{ position: 'relative', width: 14, height: 14 }}>
          <div
            ref={anchorRef}
            data-marker-dot
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isPending || !canDelete) return;
              setDeleteMenu(true);
            }}
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: markerColor,
              border: '2px solid #fff',
              boxShadow: markerColor === C.emerald
                ? '0 1px 4px rgba(30,138,90,0.45)'
                : '0 1px 4px rgba(58,110,165,0.45)',
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
                color: C.fg2,
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
                  onDelete();
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

function BlueprintViewer({ projectId, designImageUrl, onUploadImage, onDeleteImage, uploadState }) {
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
  const [pendingMarkerId, setPendingMarkerId] = useState(null);
  const [draftNote, setDraftNote] = useState('');
  const [imageMenu, setImageMenu] = useState({ open: false, x: 0, y: 0 });
  const [currentUserEmail, setCurrentUserEmail] = useState('');

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
      if (!projectId) {
        setDesignMarkers([]);
        return;
      }
      const { data, error } = await supabase
        .from('markers')
        .select('id, project_id, x_pct, y_pct, note, created_by, created_at')
        .eq('project_id', projectId)
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
    const channel = supabase
      .channel(`markers-realtime-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'markers', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const next = normalizeMarkerRow(payload.new);
          if (!next) return;
          setDesignMarkers((prev) => (prev.some((m) => String(m.id) === String(next.id)) ? prev : [...prev, next]));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'markers', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const removedId = payload.old?.id;
          if (!removedId) return;
          setDesignMarkers((prev) => prev.filter((m) => String(m.id) !== String(removedId)));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'markers', filter: `project_id=eq.${projectId}` },
        (payload) => {
          const next = normalizeMarkerRow(payload.new);
          if (!next) return;
          setDesignMarkers((prev) =>
            prev.map((m) => (String(m.id) === String(next.id) ? { ...m, ...next } : m)),
          );
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  function viewportCursor() {
    if (isPanning) return 'grabbing';
    if (handTool || spaceHeld) return 'grab';
    if (markerMode) return MARKER_MODE_CURSOR;
    return 'default';
  }

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
    if (!markerId) return;
    await supabase.from('markers').delete().eq('id', markerId);
    setDesignMarkers((prev) => prev.filter((m) => String(m.id) !== String(markerId)));
  }

  function toggleMarkerMode() {
    if (markerMode) {
      if (pendingMarkerId) {
        void deleteMarkerById(pendingMarkerId);
        setPendingMarkerId(null);
        setDraftNote('');
      }
      setMarkerMode(false);
    } else {
      setHandTool(false);
      setMarkerMode(true);
    }
  }

  function toggleHandTool() {
    setHandTool((h) => {
      const next = !h;
      if (next) {
        if (markerMode) {
          if (pendingMarkerId) {
            void deleteMarkerById(pendingMarkerId);
            setPendingMarkerId(null);
            setDraftNote('');
          }
          setMarkerMode(false);
        }
      }
      return next;
    });
  }

  async function handleCanvasClick(e) {
    if (skipNextMarkerClick.current) {
      skipNextMarkerClick.current = false;
      return;
    }
    if (!markerMode || handTool) return;
    if (e.target.closest('[data-marker-root]')) return;
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (!projectId) return;
    const { data, error } = await supabase
      .from('markers')
      .insert({
        project_id: projectId,
        x_pct: xPct,
        y_pct: yPct,
        note: '',
        created_by: currentUserEmail || null,
      })
      .select('id, project_id, x_pct, y_pct, note, created_by, created_at')
      .single();
    if (error) {
      console.error('[BlueprintViewer] Failed to add marker', error);
      return;
    }
    const inserted = normalizeMarkerRow(data);
    if (!inserted) return;
    setDesignMarkers((prev) => {
      const withoutPending = pendingMarkerId
        ? prev.filter((m) => String(m.id) !== String(pendingMarkerId))
        : prev;
      return withoutPending.some((m) => String(m.id) === String(inserted.id))
        ? withoutPending
        : [...withoutPending, inserted];
    });
    setPendingMarkerId(inserted.id);
    setDraftNote('');
  }

  async function confirmPendingNote() {
    if (!pendingMarkerId) return;
    const text = draftNote.trim();
    const { error } = await supabase
      .from('markers')
      .update({ note: text })
      .eq('id', pendingMarkerId);
    if (error) {
      console.error('[BlueprintViewer] Failed to update marker note', error);
      return;
    }
    setDesignMarkers((prev) =>
      prev.map((m) => (m.id === pendingMarkerId ? { ...m, note: text } : m)),
    );
    setPendingMarkerId(null);
    setDraftNote('');
  }

  async function cancelPending() {
    if (!pendingMarkerId) return;
    await deleteMarkerById(pendingMarkerId);
    setPendingMarkerId(null);
    setDraftNote('');
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
            const isMine = Boolean(
              String(m.createdBy || '').trim().toLowerCase()
              && String(currentUserEmail || '').trim().toLowerCase()
              && String(m.createdBy || '').trim().toLowerCase() === String(currentUserEmail || '').trim().toLowerCase(),
            );
            return (
          <DesignMarker
            key={m.id}
            marker={m}
            isPending={pendingMarkerId === m.id}
            draftNote={pendingMarkerId === m.id ? draftNote : ''}
            onDraftChange={setDraftNote}
            onConfirmNote={confirmPendingNote}
            onCancelPending={cancelPending}
            canDelete={isMine}
            markerColor={isMine ? C.emerald : '#3A6EA5'}
            onDelete={async () => {
              await deleteMarkerById(m.id);
              if (pendingMarkerId === m.id) {
                setPendingMarkerId(null);
                setDraftNote('');
              }
            }}
          />
            );
          })()
        ))}
          </div>
        </div>
      </div>

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

      <div style={{ position: 'absolute', top: 14, left: 14 }}>
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

      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 4 }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleMarkerMode();
          }}
          title={markerMode ? '마킹 끄기' : '마킹 켜기'}
          style={{
            width: 30,
            height: 30,
            borderRadius: 4,
            background: C.white,
            border: `1px solid ${markerMode ? C.coralBorder : C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: markerMode
              ? '0 1px 6px rgba(208,80,69,0.2)'
              : '0 1px 3px rgba(30,42,53,0.08)',
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
function ChatPanel({ projectId, senderRole = 'engineer' }) {
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

  function getAvatarInitials(fullName, email) {
    const name = String(fullName || '').trim();
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
        .select('id, content, sender_role, sender_email, created_at, project_id')
        .order('created_at', { ascending: true })
        .limit(200);

      let query = projectId ? base.eq('project_id', projectId) : base;
      let { data, error } = await query;

      // Fallback: table without sender_email/project_id columns.
      if (error && /sender_email/i.test(error.message || '')) {
        base = supabase
          .from('messages')
          .select('id, content, sender_role, created_at, project_id')
          .order('created_at', { ascending: true })
          .limit(200);
        query = projectId ? base.eq('project_id', projectId) : base;
        ({ data, error } = await query);
      }
      if (error && /project_id/i.test(error.message || '')) {
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
      sender_email: currentUserEmail || null,
      project_id: projectId || null,
    });

    // Fallback when project_id column doesn't exist.
    if (error && /project_id/i.test(error.message || '')) {
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
        project_id: projectId || null,
      });
      error = fallback.error;
      if (error && /project_id/i.test(error.message || '')) {
        fallback = await supabase.from('messages').insert({
          content,
          sender_role: senderRole,
        });
        error = fallback.error;
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
        console.log('[handleInvite] Existing invite row found; proceeding to Edge Function call.', {
          projectId,
          email: normalized,
        });
      } else {
      setInviteState({ status: 'error', message: error.message || t('inviteFailed') });
      return false;
      }
    }

    console.log('[handleInvite] Invoking Edge Function invite-project-member', {
      projectId,
      email: normalized,
    });
    const { error: invokeError } = await supabase.functions.invoke('invite-project-member', {
      body: { email: normalized, projectId },
    });
    console.log('[handleInvite] Edge Function invite-project-member result', {
      ok: !invokeError,
      error: invokeError?.message || null,
      projectId,
      email: normalized,
    });
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
          const emailPrefix = senderEmail.includes('@') ? senderEmail.split('@')[0] : '';
          const normalizedSenderEmail = String(senderEmail || '').trim().toLowerCase();
          const normalizedMyEmail = String(currentUserEmail || '').trim().toLowerCase();
          const isMine = Boolean(normalizedSenderEmail && normalizedMyEmail && normalizedSenderEmail === normalizedMyEmail);
          const name = isMine
            ? (currentUserFullName || emailPrefix || (lang === 'ko' ? '사용자' : lang === 'zh' ? '用户' : 'User'))
            : (emailPrefix || (lang === 'ko' ? '사용자' : lang === 'zh' ? '用户' : 'User'));
          const avatarLabel = isMine
            ? getAvatarInitials(currentUserFullName, currentUserEmail)
            : getAvatarInitials('', senderEmail);
          const avatarBg = isMine ? C.emerald : '#3A6EA5';
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
      {inviteOpen ? (
        <div
          role="presentation"
          onClick={() => setInviteOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,28,36,0.42)',
            zIndex: 70,
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
              maxWidth: 360,
              background: C.white,
              border: `1px solid ${C.borderSubtle}`,
              borderRadius: 8,
              boxShadow: '0 20px 48px rgba(19,28,36,0.26)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.fg1 }}>{t('invite')}</div>
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
        </div>
      ) : null}
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
  const fallbackProject = getProjectById(projectId) || DEFAULT_PROJECT;
  const [projectMeta, setProjectMeta] = useState(null);
  const [savingMeta, setSavingMeta] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingSprint, setEditingSprint] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [sprintDraft, setSprintDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [designImage, setDesignImage] = useState({ id: null, url: '', storagePath: '' });
  const [uploadState, setUploadState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    let alive = true;

    async function loadProjectMeta() {
      if (!projectId) {
        setProjectMeta(null);
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, description, status, progress, sprint_number')
        .eq('id', projectId)
        .single();

      console.log('[WorkspacePage] raw query result', data, error);

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
  const normalizedStatus = String(projectMeta?.status || fallbackProject.status || '')
    .toLowerCase()
    .trim();

  useEffect(() => {
    setNameDraft(projectMeta?.name || fallbackProject.name || '');
    setSprintDraft(String(projectMeta?.sprint_number ?? fallbackProject.sprint ?? ''));
    setDescriptionDraft(projectMeta?.description || '');
  }, [projectMeta, fallbackProject.name, fallbackProject.sprint]);

  useEffect(() => {
    if (!projectId) return undefined;
    const channel = supabase
      .channel(`workspace-project-meta-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `id=eq.${projectId}` },
        (payload) => {
          const next = payload.new || null;
          if (next) {
            setProjectMeta((prev) => ({ ...(prev || {}), ...next }));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  async function updateProjectFields(patch) {
    if (!projectId || !patch || Object.keys(patch).length === 0) return;
    const normalizedPatch = {
      ...patch,
      ...(typeof patch.status === 'string'
        ? { status: patch.status.toLowerCase() }
        : {}),
    };
    setSavingMeta(true);
    const { data, error } = await supabase
      .from('projects')
      .update(normalizedPatch)
      .eq('id', projectId)
      .select('id, name, description, status, progress, sprint_number')
      .single();
    setSavingMeta(false);
    if (error) {
      // eslint-disable-next-line no-console
      console.error('[WorkspacePage] project update failed', error);
      return;
    }
    setProjectMeta((prev) => ({ ...(prev || {}), ...(data || normalizedPatch) }));
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
    await updateProjectFields({ sprint_number: parsed });
  }

  async function commitDescriptionEdit() {
    if (!editingDescription) return;
    setEditingDescription(false);
    const nextDescription = descriptionDraft.trim();
    const currentDescription = (projectMeta?.description || '').trim();
    if (nextDescription === currentDescription) return;
    await updateProjectFields({ description: nextDescription });
  }

  useEffect(() => {
    async function loadLatestDesign() {
      let base = supabase
        .from('design_files')
        .select('id, file_url, created_at, project_id')
        .order('created_at', { ascending: false })
        .limit(1);
      let query = projectId ? base.eq('project_id', projectId) : base;
      let { data, error } = await query;
      if (error && /project_id/i.test(error.message || '')) {
        base = supabase
          .from('design_files')
          .select('id, file_url, created_at')
          .order('created_at', { ascending: false })
          .limit(1);
        ({ data, error } = await base);
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
          const nextUrl = next.file_url || next.url;
          if (nextUrl) setDesignImage(mapDesignFileRow(next));
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'design_files' },
        (payload) => {
          const prev = payload.old || {};
          if (projectId && String(prev.project_id) !== String(projectId)) return;
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
  }, [projectId]);

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

    let { error } = await supabase.from('design_files').insert({
      file_url: publicUrl,
      file_name: file.name,
      project_id: projectId || null,
    });

    // Fallback when table uses `url` instead of `file_url`.
    if (error && /file_url/i.test(error.message || '')) {
      const fallback = await supabase.from('design_files').insert({
        url: publicUrl,
        file_name: file.name,
        project_id: projectId || null,
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
                    setDescriptionDraft(projectMeta?.description || '');
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
                  color: (projectMeta?.description || '').trim() ? undefined : C.fg4,
                }}
              >
                {(projectMeta?.description || '').trim() || t('projectDescriptionPlaceholder')}
                {savingMeta ? ' · Saving...' : ''}
              </span>
            )}
          </span>
        }
        status={normalizedStatus || undefined}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        <BlueprintViewer
          projectId={projectId}
          designImageUrl={designImage.url}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
          uploadState={uploadState}
        />
        <ChatPanel projectId={projectId} senderRole="engineer" />
        <ConflictPanel
          onApprove={() => navigate(`/project/${resolvedProject.id}/consensus`)}
          onReject={() => {}}
        />
      </div>
    </>
  );
}
