import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteFuture, fetchFutures, reorderFutures, upsertFuture } from '../../api'
import { subscribe } from '../../events'
import type { Future } from '../../types'
import { useCurrentProject } from '../CurrentProjectContext'
import './FutureTab.css'

/** "Future" tab: list + filter + CRUD for the selected project. */
export default function FutureTab() {
  const { currentProject } = useCurrentProject()
  const [futures, setFutures] = useState<Future[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The input at the top both filters the list (live) and, on Enter, creates
  // a new future from its current value.
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const filterRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow a textarea: shrink to content, then re-grow up to the CSS
  // max-height (11 lines). The browser clamps via min/max-height.
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // Re-measure the filter box when query changes out of band (e.g. cleared
  // after adding a phrase or pressing Escape).
  useEffect(() => {
    autosize(filterRef.current)
  }, [query, autosize])

  // Drag-and-drop reordering. Dragging only initiates from the grip handle
  // (armedId gates the row's draggable attribute) so clicks on the text and
  // action buttons keep working. dragId is the moving row; overId marks the
  // drop target for the top-edge indicator.
  const [armedId, setArmedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const load = useCallback(async (projectId: string) => {
    setLoading(true)
    setError(null)
    try {
      setFutures(await fetchFutures(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentProject) void load(currentProject)
    else setFutures([])
  }, [currentProject, load])

  // Live-refresh: reload when futures for this project change anywhere
  // (another tab/client or an out-of-band backend write). Note this also
  // echoes the acting client's own reorder/edit; that harmless extra reload
  // preserves server-confirmed order after remote changes.
  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'futures' && e.project_id === currentProject) void load(currentProject)
    })
  }, [currentProject, load])

  const queryLower = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      queryLower
        ? futures.filter((f) => f.text.toLowerCase().includes(queryLower))
        : futures,
    [futures, queryLower],
  )

  const handleAdd = async () => {
    if (!currentProject) return
    const value = query.trim()
    if (!value) return
    try {
      await upsertFuture(currentProject, value)
      setQuery('')
      await load(currentProject)
      // Also copy the new future to the clipboard.
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        /* clipboard is best-effort; the add itself succeeded */
      }
    } catch (e) {
      window.alert(`Add failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const startEdit = (f: Future) => {
    setEditingId(f.future_id)
    setDraft(f.text)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async (futureId: string) => {
    if (!currentProject) return
    const value = draft.trim()
    if (!value) {
      cancelEdit()
      return
    }
    try {
      await upsertFuture(currentProject, value, futureId)
      cancelEdit()
      await load(currentProject)
    } catch (e) {
      window.alert(`Update failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleDelete = async (f: Future) => {
    if (!currentProject) return
    if (!window.confirm(`Delete future "${f.text}"?`)) return
    try {
      await deleteFuture(currentProject, f.future_id)
      await load(currentProject)
    } catch (e) {
      window.alert(`Delete failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleCopy = async (f: Future) => {
    try {
      await navigator.clipboard.writeText(f.text)
    } catch {
      window.alert('Copy failed')
    }
  }

  // Drop the dragged row (dragId) onto the target row (overId): move it to
  // the target's position in the full futures array, persist the new order,
  // and reset drag state. On error, reload from the server to revert.
  const handleDrop = async () => {
    const fromId = dragId
    const toId = overId
    setArmedId(null)
    setDragId(null)
    setOverId(null)
    if (!currentProject || !fromId || !toId || fromId === toId) return

    const fromIndex = futures.findIndex((f) => f.future_id === fromId)
    const toIndex = futures.findIndex((f) => f.future_id === toId)
    if (fromIndex === -1 || toIndex === -1) return

    const next = [...futures]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setFutures(next)

    try {
      await reorderFutures(currentProject, next.map((f) => f.future_id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await load(currentProject)
    }
  }

  if (!currentProject) {
    return (
      <section className="future-tab">
        <p className="future-empty">No project selected.</p>
      </section>
    )
  }

  return (
    <section className="future-tab">
      <div className="future-toolbar">
        <textarea
          ref={filterRef}
          className="future-input future-input--filter"
          placeholder="Filter…  (Ctrl+Enter adds a new future)"
          rows={3}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            autosize(filterRef.current)
          }}
          onInput={() => autosize(filterRef.current)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleAdd()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              setQuery('')
            }
          }}
        />
      </div>

      {loading && <p className="future-empty">Loading…</p>}
      {error && <p className="future-error">Error: {error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p className="future-empty">
          {query ? 'No matching futures.' : 'No futures yet.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="future-list">
          {filtered.map((f) => (
            <li
              key={f.future_id}
              className={
                'future-row' +
                (dragId === f.future_id ? ' future-row--dragging' : '') +
                (overId === f.future_id ? ' future-row--over' : '')
              }
              draggable={armedId === f.future_id}
              onDragStart={() => setDragId(f.future_id)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && f.future_id !== dragId) setOverId(f.future_id)
              }}
              onDrop={(e) => {
                e.preventDefault()
                void handleDrop()
              }}
              onDragEnd={() => {
                setArmedId(null)
                setDragId(null)
                setOverId(null)
              }}
            >
              {editingId === f.future_id ? (
                <>
                  <textarea
                    ref={editRef}
                    className="future-input future-input--inline future-input--editor"
                    autoFocus
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onInput={() => autosize(editRef.current)}
                    onFocus={() => autosize(editRef.current)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        void commitEdit(f.future_id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                  />
                  <span className="future-actions">
                    <button
                      className="icon-btn icon-btn--save"
                      title="Save"
                      onClick={() => void commitEdit(f.future_id)}
                    >
                      <SaveIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--cancel"
                      title="Cancel"
                      onClick={cancelEdit}
                    >
                      <CancelIcon />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  {/* Grip armes the row for dragging. Hidden while a filter
                      is active, since reordering a filtered subset is
                      ambiguous; dropped rows move within the full list. */}
                  {!query.trim() && (
                    <span
                      className="future-grip"
                      title="Drag to reorder"
                      onMouseDown={() => setArmedId(f.future_id)}
                      onMouseUp={() => setArmedId(null)}
                    >
                      <GripIcon />
                    </span>
                  )}
                  <span className="future-text">{f.text}</span>
                  <span className="future-actions">
                    <button
                      className="icon-btn icon-btn--sm icon-btn--edit"
                      title="Edit"
                      onClick={() => startEdit(f)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--copy"
                      title="Copy"
                      onClick={() => void handleCopy(f)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--danger icon-btn--delete"
                      title="Delete"
                      onClick={() => void handleDelete(f)}
                    >
                      <DeleteIcon />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ---- Icons (inline SVG keeps the app dependency-free) ----

function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0ZM3.75 13.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM13.5 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm-1.25 5.75a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5ZM13.5 12.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286Zm-.878-2.29 1.439 1.439 1.293-1.294a.25.25 0 0 0 0-.353l-1.086-1.086a.25.25 0 0 0-.353 0l-1.293 1.293Z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25v-7.5Z" />
      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-7.5Z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 13.32 3.55 5h9.9l-.946 8.32a1 1 0 0 1-.99.884H5.486a1 1 0 0 1-.99-.884Z" />
    </svg>
  )
}

function SaveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v11A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5V4.94L11.06 1H2.5Zm1.5 1.5h1.75a.25.25 0 0 1 .25.25V5.5a.5.5 0 0 0 .5.5h3.5a.5.5 0 0 0 .5-.5V2.75a.25.25 0 0 1 .25-.25h.19L13 4.56V13.5a.5.5 0 0 1-.5.5H11V9.5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1V14H3.5a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5Zm3 11.5v-3h3v3h-3Z" />
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
    </svg>
  )
}
