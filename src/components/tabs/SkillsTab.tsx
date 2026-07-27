import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteSkill, fetchSkills, upsertSkill } from '../../api'
import { subscribe } from '../../events'
import { copyText } from '../../clipboard'
import type { Skill } from '../../types'
import './SkillsTab.css'

/**
 * "Skills" tab: list + textbox + CRUD. Skills are global — they are not
 * tied to a project — so this component ignores the current project and
 * always shows the full shared list.
 */
export default function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The textbox at the top: plain Enter adds a new skill from its value,
  // Ctrl/Cmd+Enter inserts a literal newline so multi-line skills are
  // possible, and Escape clears it.
  const [draft, setDraft] = useState('')
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow a textarea: shrink to content, then re-grow up to the CSS
  // max-height (11 lines). The browser clamps via min/max-height.
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // Re-measure the top textbox when its value changes out of band (e.g.
  // cleared after adding a skill or pressing Escape).
  useEffect(() => {
    autosize(draftRef.current)
  }, [draft, autosize])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSkills(await fetchSkills())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Live-refresh: reload when skills change anywhere (another tab/client
  // or an out-of-band backend write).
  useEffect(() => {
    return subscribe((e) => {
      if (e.type === 'skills') void load()
    })
  }, [load])

  const handleAdd = async () => {
    const value = draft.trim()
    if (!value) return
    try {
      await upsertSkill(value)
      setDraft('')
      await load()
      // Also copy the new skill to the clipboard.
      await copyText(value)
    } catch (e) {
      window.alert(`Add failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const startEdit = (s: Skill) => {
    setEditingId(s.skill_id)
    setEditDraft(s.text)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft('')
  }

  const commitEdit = async (skillId: string) => {
    const value = editDraft.trim()
    if (!value) {
      cancelEdit()
      return
    }
    try {
      await upsertSkill(value, skillId)
      cancelEdit()
      await load()
    } catch (e) {
      window.alert(`Update failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleDelete = async (s: Skill) => {
    if (!window.confirm(`Delete skill "${s.text}"?`)) return
    try {
      await deleteSkill(s.skill_id)
      await load()
    } catch (e) {
      window.alert(`Delete failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleCopy = async (s: Skill) => {
    if (!(await copyText(s.text))) window.alert('Copy failed')
  }

  const handleDuplicate = async (s: Skill) => {
    try {
      // Create a new skill (server generates the id) with the same text.
      await upsertSkill(s.text)
      await load()
    } catch (e) {
      window.alert(`Duplicate failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <section className="skills-tab">
      <div className="skills-toolbar">
        <textarea
          ref={draftRef}
          className="skills-input skills-input--filter"
          placeholder="Add a skill…  Start with a trigger like 'start_project: …' so it can be invoked via @start_project in a prompt. (Enter adds, Ctrl+Enter for a newline)"
          rows={3}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            autosize(draftRef.current)
          }}
          onKeyDown={(e) => {
            // Plain Enter adds a new skill; Ctrl/Cmd+Enter inserts a newline.
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              document.execCommand('insertText', false, '\n')
              autosize(draftRef.current)
              return
            }
            if (e.key === 'Enter' && !e.altKey) {
              e.preventDefault()
              void handleAdd()
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft('')
            }
          }}
        />
      </div>

      {loading && <p className="skills-empty">Loading…</p>}
      {error && <p className="skills-error">Error: {error}</p>}
      {!loading && !error && skills.length === 0 && <p className="skills-empty">No skills yet.</p>}

      {skills.length > 0 && (
        <ul className="skills-list">
          {skills.map((s) => (
            <li key={s.skill_id} className="skills-row">
              {editingId === s.skill_id ? (
                <>
                  <textarea
                    ref={editRef}
                    className="skills-input skills-input--inline skills-input--editor"
                    autoFocus
                    rows={3}
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onInput={() => autosize(editRef.current)}
                    onFocus={() => autosize(editRef.current)}
                    onKeyDown={(e) => {
                      // Plain Enter commits the edit; Ctrl/Cmd+Enter inserts a
                      // newline (reversed from the usual textarea convention).
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        document.execCommand('insertText', false, '\n')
                        autosize(editRef.current)
                      } else if (e.key === 'Enter' && !e.altKey) {
                        e.preventDefault()
                        void commitEdit(s.skill_id)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                  />
                  <span className="skills-actions">
                    <button
                      className="icon-btn icon-btn--save"
                      title="Save"
                      onClick={() => void commitEdit(s.skill_id)}
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
                  <span className="skills-text">{s.text}</span>
                  <span className="skills-actions">
                    <button
                      className="icon-btn icon-btn--sm icon-btn--duplicate"
                      title="Duplicate"
                      onClick={() => void handleDuplicate(s)}
                    >
                      <DuplicateIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--edit"
                      title="Edit"
                      onClick={() => startEdit(s)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--copy"
                      title="Copy"
                      onClick={() => void handleCopy(s)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--sm icon-btn--danger icon-btn--delete"
                      title="Delete"
                      onClick={() => void handleDelete(s)}
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

// Duplicate: two overlapping documents (distinct from CopyIcon's clipboard).
function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 1.75A1.75 1.75 0 0 1 5.75 0h3.586a.75.75 0 0 1 .53.22l3.879 3.879a.75.75 0 0 1 .22.53V11.25A1.75 1.75 0 0 1 12.21 13H11v-1.5h1.21a.25.25 0 0 0 .25-.25V5.5h-2.5A1.75 1.75 0 0 1 8.21 3.75V1.5h-2.46a.25.25 0 0 0-.25.25V2H4v-.25Zm5.21-.382V3.75c0 .138.112.25.25.25h2.382L9.21 1.368Z" />
      <path d="M1.75 4.5h5.5A1.75 1.75 0 0 1 9 6.25v7A1.75 1.75 0 0 1 7.25 15h-5.5A1.75 1.75 0 0 1 0 13.25v-7A1.75 1.75 0 0 1 1.75 4.5ZM1.5 6.25v7c0 .138.112.25.25.25h5.5a.25.25 0 0 0 .25-.25v-7a.25.25 0 0 0-.25-.25h-5.5a.25.25 0 0 0-.25.25Z" />
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
