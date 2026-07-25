import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPrompt, deletePrompt, fetchPhrases, fetchPrompts } from '../../api'
import { subscribe } from '../../events'
import { renderMarkdown } from '../../markdown'
import { getTabPlatform, setTabPlatform } from '../../settings'
import type { Phrase, Prompt } from '../../types'
import { useCurrentProject } from '../CurrentProjectContext'
import './PromptsTab.css'

/** UI selection; "Both" fans out to one POST per real platform. */
type PlatformChoice = 'iOS' | 'Android' | 'Both'
/** A platform that can actually be POSTed to the backend. */
type TargetPlatform = 'iOS' | 'Android'

/** Active "/-mention" range: where the trigger '/' sits and what follows. */
interface Mention {
  /** Index of the '/' that opened the mention. */
  start: number
  /** Text typed after the '/', up to the caret. */
  query: string
}

/**
 * Lowercases and strips everything but alphanumerics + spaces, for
 * case- and punctuation-insensitive matching of "/"-mention queries.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
}

/** Resolve a UI choice into the concrete platforms to POST to. */
function resolveTargets(choice: PlatformChoice): TargetPlatform[] {
  return choice === 'Both' ? ['iOS', 'Android'] : [choice]
}

/**
 * "Prompts" tab: pick a platform (iOS / Android / Both), type a prompt, and
 * POST it on Enter. "Both" issues one POST per real platform and shows a
 * platform icon beside each prompt. Only platform and prompt are surfaced in
 * the UI; the remaining required fields are derived defaults (see submit()).
 */
export default function PromptsTab() {
  const { currentProject } = useCurrentProject()
  const [platform, setPlatformState] = useState<PlatformChoice>(
    () => getTabPlatform('prompts'),
  )
  // Persist the platform filter as a per-tab setting on change.
  const setPlatform = (p: PlatformChoice) => {
    setPlatformState(p)
    setTabPlatform('prompts', p)
  }
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Project's common phrases, used to populate the "/"-mention picker in the
  // prompt box. Loaded alongside prompts and live-refreshed the same way.
  const [phrases, setPhrases] = useState<Phrase[]>([])

  // Active "/-mention" range (or null when dismissed). suppressRef is set
  // after Esc dismisses a mention; it blocks re-opening until a fresh '/'
  // is typed, so the user can type '/' literally without the panel popping.
  const [mention, setMention] = useState<Mention | null>(null)
  const [mentionIndex, setMentionIndex] = useState(-1)
  const suppressRef = useRef(false)

  // One session per page load groups prompts created during this session;
  // reloading the page starts a new session.
  const [sessionId] = useState(() => crypto.randomUUID())

  // Auto-grow a textarea: shrink to content, then re-grow up to the CSS
  // max-height. The browser clamps via min/max-height.
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const load = useCallback(async (projectId: string) => {
    setError(null)
    try {
      setPrompts(await fetchPrompts(projectId))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (currentProject) void load(currentProject)
    else setPrompts([])
  }, [currentProject, load])

  // Live-refresh: reload when any prompts file for this project changes
  // (across clients/tabs/out-of-band). Prompts are fetched across all
  // platforms, so a change to any platform file triggers one reload.
  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'prompts' && e.project_id === currentProject) void load(currentProject)
    })
  }, [currentProject, load])

  // Load + live-refresh the common phrases that back the "/"-mention picker.
  const loadPhrases = useCallback(async (projectId: string) => {
    try {
      setPhrases(await fetchPhrases(projectId))
    } catch {
      setPhrases([])
    }
  }, [])

  useEffect(() => {
    if (currentProject) void loadPhrases(currentProject)
    else setPhrases([])
  }, [currentProject, loadPhrases])

  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'phrases' && e.project_id === currentProject) void loadPhrases(currentProject)
    })
  }, [currentProject, loadPhrases])

  const targets = useMemo(() => resolveTargets(platform), [platform])

  // GET /prompts returns prompts across all platforms; filter client-side
  // so toggling the platform radio doesn't refetch. This tab only shows
  // drafts; "ready" prompts are considered published and hidden.
  const visible = useMemo(
    () =>
      prompts.filter(
        (p) =>
          p.state === 'draft' &&
          targets.includes(p.platform as TargetPlatform),
      ),
    [prompts, targets],
  )

  // Live, sanitized markdown preview of the prompt being typed.
  const previewHtml = useMemo(() => renderMarkdown(prompt), [prompt])

  /**
   * Scan the textarea contents around the caret for an open "/-mention".
   * Finds the last '/' at or before the caret; it only counts if it sits at
   * the start of the text or right after whitespace (so '/' inside URLs or
   * file paths like "a/b" doesn't fire), and nothing has broken the run since
   * (no spaces/newlines between it and the caret). Returns null when there's
   * no active mention, or when the user dismissed it with Esc and hasn't typed
   * a fresh '/' since.
   */
  const evaluate = useCallback((value: string, caret: number): Mention | null => {
    if (suppressRef.current) return null
    // Walk back from the caret to the last '/' that opens this run. The '/' is
    // only a trigger at the start of text or after whitespace (so '/' inside
    // "a/b" or URLs doesn't fire). Crossing whitespace ends the search.
    let i = caret
    while (i > 0) {
      i--
      const ch = value[i]
      if (ch === '/') {
        const ok = i === 0 || /\s/.test(value[i - 1])
        return ok ? { start: i, query: value.slice(i + 1, caret) } : null
      }
      if (/\s/.test(ch)) return null
    }
    return null
  }, [])

  // Phrases matching the current "/-mention" query, case- and punctuation-
  // insensitive. Capped for the dropdown; empty means the panel is hidden.
  const mentionMatches = useMemo<Phrase[]>(() => {
    if (!mention) return []
    const q = normalize(mention.query)
    return phrases
      .filter((p) => normalize(p.phrase).includes(q))
      .slice(0, 8)
  }, [mention, phrases])

  // Reset the highlight whenever the set of matches changes (new '/' run or a
  // new keystroke that filters the list), so Tab always starts at the top.
  useEffect(() => {
    setMentionIndex(-1)
  }, [mentionMatches])

  // Keep the highlighted option scrolled into view as Tab cycles through them.
  const mentionPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (mentionIndex < 0 || !mentionPanelRef.current) return
    const item = mentionPanelRef.current.children[mentionIndex]
    if (item && 'scrollIntoView' in item) {
      ;(item as HTMLElement).scrollIntoView({ block: 'nearest' })
    }
  }, [mentionIndex])

  /**
   * Insert a chosen phrase at the active mention, replacing the "/" + query
   * region, then dismiss the panel and refocus the caret just past the text.
   * `requestAnimationFrame` lets React commit the new value before we set
   * selection, otherwise the caret lands at the end.
   */
  const selectMention = useCallback(
    (phrase: Phrase) => {
      const el = textareaRef.current
      if (!el || !mention) return
      const before = prompt.slice(0, mention.start)
      const after = prompt.slice(el.selectionStart)
      const next = before + phrase.phrase + after
      const caret = before.length + phrase.phrase.length
      setMention(null)
      setMentionIndex(-1)
      setPrompt(next)
      requestAnimationFrame(() => {
        const t = textareaRef.current
        if (!t) return
        t.focus()
        t.setSelectionRange(caret, caret)
        autosize(t)
      })
    },
    [mention, prompt, autosize],
  )

  // Close the panel via Esc: set the suppress flag so it won't reappear until
  // the user types a fresh '/', then refocus the textarea so typing continues.
  const dismissMention = useCallback(() => {
    suppressRef.current = true
    setMention(null)
    setMentionIndex(-1)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  const submit = async () => {
    if (!currentProject) return
    const value = prompt.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      // Each target platform gets its own prompt_id (a separate record).
      for (const target of resolveTargets(platform)) {
        await createPrompt(currentProject, target, {
          session_id: sessionId,
          prompt_id: crypto.randomUUID(),
          state: 'draft',
          prompt: value,
        })
      }
      setPrompt('')
      setMention(null)
      setMentionIndex(-1)
      suppressRef.current = false
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (p: Prompt) => {
    setEditingId(p.prompt_id)
    setDraft(p.prompt)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async (p: Prompt) => {
    if (!currentProject) return
    const value = draft.trim()
    if (!value) {
      cancelEdit()
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Upsert keyed on the existing prompt_id; platform/session preserved.
      await createPrompt(currentProject, p.platform, {
        session_id: p['session-id'],
        prompt_id: p.prompt_id,
        state: p.state,
        prompt: value,
      })
      cancelEdit()
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (p: Prompt) => {
    if (!currentProject) return
    if (!window.confirm(`Delete prompt "${p.prompt}"?`)) return
    setError(null)
    try {
      await deletePrompt(currentProject, p.platform, p.prompt_id)
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Mark a draft prompt as "ready" (published). Upserts with state 'ready';
  // once reloaded, the draft filter hides it from this list.
  const handleReady = async (p: Prompt) => {
    if (!currentProject) return
    setBusy(true)
    setError(null)
    try {
      await createPrompt(currentProject, p.platform, {
        session_id: p['session-id'],
        prompt_id: p.prompt_id,
        state: 'ready',
        prompt: p.prompt,
      })
      await load(currentProject)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async (p: Prompt) => {
    try {
      await navigator.clipboard.writeText(p.prompt)
    } catch {
      setError('Copy failed')
    }
  }

  if (!currentProject) {
    return (
      <section className="prompts-tab">
        <p className="prompts-empty">No project selected.</p>
      </section>
    )
  }

  return (
    <section className="prompts-tab">
      <fieldset className="prompts-platform">
        <legend className="prompts-platform-legend">Platform</legend>
        {(['iOS', 'Android', 'Both'] as const).map((p: PlatformChoice) => (
          <label key={p} className="prompts-platform-option">
            <input
              type="radio"
              name="platform"
              value={p}
              checked={platform === p}
              onChange={() => setPlatform(p)}
            />
            {p}
          </label>
        ))}
      </fieldset>

      <div className="prompts-editor">
        <div className="prompts-input-wrap">
          <textarea
            ref={textareaRef}
            className="prompts-input prompts-input--editor"
            placeholder="Enter a prompt…  (Enter to submit, / for phrases)"
            value={prompt}
            autoFocus
            rows={3}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value
              setPrompt(v)
              const caret = e.target.selectionStart ?? v.length
              setMention(evaluate(v, caret))
            }}
            onInput={() => autosize(textareaRef.current)}
            onFocus={() => autosize(textareaRef.current)}
            onKeyUp={(e) => {
              // Arrow keys move the caret without an onChange; re-evaluate so
              // the picker tracks (or clears as) the caret enters/leaves a run.
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
                const el = e.currentTarget
                setMention(evaluate(el.value, el.selectionStart ?? el.value.length))
              }
            }}
            onClick={(e) => {
              const el = e.currentTarget
              setMention(evaluate(el.value, el.selectionStart ?? el.value.length))
            }}
            onKeyDown={(e) => {
              // A freshly typed '/' re-enables the picker after an Esc dismiss.
              if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                suppressRef.current = false
                return
              }
              // Ctrl/Cmd+Tab inserts a literal tab character at the caret.
              if (e.key === 'Tab' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                const el = e.currentTarget
                const s = el.selectionStart
                const en = el.selectionEnd
                const next = prompt.slice(0, s) + '\t' + prompt.slice(en)
                const caret = s + 1
                setPrompt(next)
                setMention(null)
                setMentionIndex(-1)
                requestAnimationFrame(() => {
                  const t = textareaRef.current
                  if (!t) return
                  t.focus()
                  t.setSelectionRange(caret, caret)
                  autosize(t)
                })
                return
              }
              // Enter selects the highlighted option when the panel is open.
              if (e.key === 'Enter' && mention && mentionIndex >= 0) {
                const match = mentionMatches[mentionIndex]
                if (match) {
                  e.preventDefault()
                  selectMention(match)
                  return
                }
              }
              // Plain Enter submits; Ctrl/Cmd+Enter inserts a newline.
              if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault()
                void submit()
                return
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                document.execCommand('insertText', false, '\n')
                autosize(textareaRef.current)
                return
              }
              // Tab navigates the panel: select the sole option, or cycle.
              if (e.key === 'Tab' && mention && mentionMatches.length > 0) {
                e.preventDefault()
                if (mentionMatches.length === 1) {
                  selectMention(mentionMatches[0])
                } else {
                  setMentionIndex((i) => (i + 1) % mentionMatches.length)
                }
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                if (mention) dismissMention()
                else setPrompt('')
              }
            }}
          />
          {mention && mentionMatches.length > 0 && (
            <div className="prompts-mention" ref={mentionPanelRef} role="listbox" aria-label="Common phrases">
              {mentionMatches.map((p, i) => (
                <button
                  key={p.phrase_id}
                  type="button"
                  className={
                    'prompts-mention-item' +
                    (i === mentionIndex ? ' prompts-mention-item--active' : '')
                  }
                  role="option"
                  aria-selected={i === mentionIndex}
                  // mouseDown (not click) fires before the textarea loses focus,
                  // so the caret position we read in selectMention() is intact.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectMention(p)
                  }}
                >
                  {p.phrase}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="prompts-preview">
          {previewHtml ? (
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          ) : (
            <span className="prompts-preview-placeholder">
              Nothing to preview
            </span>
          )}
        </div>
      </div>

      {error && <p className="prompts-error">Error: {error}</p>}
      {busy && <p className="prompts-empty">Saving…</p>}
      {!busy && !error && visible.length === 0 && (
        <p className="prompts-empty">No prompts yet.</p>
      )}

      {visible.length > 0 && (
        <ul className="prompts-list">
          {visible.map((p) => (
            <li key={p.prompt_id} className="prompts-row">
              <button
                className="icon-btn icon-btn--ready prompts-row-play"
                title="Mark as ready"
                disabled={busy}
                onClick={() => void handleReady(p)}
              >
                <PlayIcon />
              </button>
              <span className="prompts-platform-icon">
                {p.platform === 'Android' ? (
                  <AndroidIcon className="icon-android" />
                ) : (
                  <AppleIcon className="icon-apple" />
                )}
              </span>
              {editingId === p.prompt_id ? (
                <>
                  <textarea
                    ref={editRef}
                    className="prompts-input prompts-input--inline prompts-input--editor"
                    autoFocus
                    rows={3}
                    disabled={busy}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
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
                        void commitEdit(p)
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      }
                    }}
                  />
                  <span className="prompts-actions">
                    <button
                      className="icon-btn"
                      title="Save"
                      disabled={busy}
                      onClick={() => void commitEdit(p)}
                    >
                      <SaveIcon />
                    </button>
                    <button
                      className="icon-btn"
                      title="Cancel"
                      disabled={busy}
                      onClick={cancelEdit}
                    >
                      <CancelIcon />
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="prompts-text">{p.prompt}</span>
                  <span className="prompts-actions">
                    <button
                      className="icon-btn icon-btn--edit"
                      title="Edit"
                      onClick={() => startEdit(p)}
                    >
                      <EditIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--copy"
                      title="Copy"
                      onClick={() => void handleCopy(p)}
                    >
                      <CopyIcon />
                    </button>
                    <button
                      className="icon-btn icon-btn--danger icon-btn--delete"
                      title="Delete"
                      onClick={() => void handleDelete(p)}
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

// ---- Platform icons (shown only in "Both" mode) ----
// Android = green, Apple = blue, per the requested color coding.

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="Android"
      role="img"
    >
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 0 0-.69-.4l-1.86 3.23a7.3 7.3 0 0 0-9.78 0L5.25 5.9a.4.4 0 1 0-.69.4L6.4 9.48A7.1 7.1 0 0 0 3 15.5h18a7.1 7.1 0 0 0-3.4-6.02ZM7 13.25a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Zm10 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
    </svg>
  )
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-label="iOS"
      role="img"
    >
      <path d="M16.36 12.47c-.02-2.3 1.88-3.4 1.97-3.46-1.07-1.57-2.74-1.79-3.33-1.81-1.42-.14-2.77.84-3.49.84-.72 0-1.82-.82-3-.8-1.54.02-2.96.9-3.75 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.11 1.67 2.35 2.86 2.31 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.13 2.76-2.24.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65ZM14.02 5.3c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.6-2.66 1.36-.59.68-1.1 1.76-.96 2.8 1.02.08 2.05-.52 2.68-1.27Z" />
    </svg>
  )
}

// ---- Row action icons (inline SVG, same shapes as Phrases/Future tabs) ----

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3.5 2.25a.75.75 0 0 1 1.13-.65l9 5.75a.75.75 0 0 1 0 1.3l-9 5.75A.75.75 0 0 1 3.5 13.75v-11.5Z" />
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
