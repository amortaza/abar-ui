import { useCallback, useEffect, useState } from 'react'
import { useCurrentProject } from '../CurrentProjectContext'
import {
  createProject,
  deleteProject,
  fetchProjects,
  renameProject,
} from '../../api'
import { subscribe } from '../../events'
import './ProjectsTab.css'

/** "Projects" tab: CRUD over project IDs (folder names). */
export default function ProjectsTab() {
  const [ids, setIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { currentProject, setCurrentProject } = useCurrentProject()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchProjects()
      setIds(res.project_ids)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Live-refresh: reload the project list when a project is created,
  // renamed, or deleted anywhere (another tab/client).
  useEffect(() => subscribe((e) => {
    if (e.type === 'projects') void load()
  }), [load])

  const handleCreate = async () => {
    const id = window.prompt('New project ID')
    if (!id) return
    try {
      await createProject(id.trim())
      await load()
    } catch (e) {
      window.alert(`Create failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleRename = async (oldId: string) => {
    const newId = window.prompt('Rename project to', oldId)
    if (!newId || newId.trim() === oldId) return
    const trimmed = newId.trim()
    try {
      await renameProject(oldId, trimmed)
      if (currentProject === oldId) setCurrentProject(trimmed)
      await load()
    } catch (e) {
      window.alert(`Rename failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete project "${id}" and ALL its prompts and phrases? This cannot be undone.`)) return
    try {
      await deleteProject(id)
      if (currentProject === id) setCurrentProject(null)
      await load()
    } catch (e) {
      window.alert(`Delete failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <section className="projects-tab">
      <div className="projects-header">
        <h2>Projects</h2>
        <button className="btn btn--primary" onClick={handleCreate}>
          + New project
        </button>
      </div>

      {loading && <p className="projects-empty">Loading…</p>}
      {error && <p className="projects-error">Error: {error}</p>}
      {!loading && !error && ids.length === 0 && (
        <p className="projects-empty">No projects yet.</p>
      )}

      {ids.length > 0 && (
        <ul className="projects-list">
          {ids.map((id) => {
            const isActive = id === currentProject
            return (
              <li
                key={id}
                className={'projects-row' + (isActive ? ' projects-row--active' : '')}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                title="Set as current project"
                onClick={() => setCurrentProject(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setCurrentProject(id)
                  }
                }}
              >
                <span className="projects-id">{id}</span>
                <span className="projects-actions">
                  <button
                    className="btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleRename(id)
                    }}
                  >
                    Rename
                  </button>
                  <button
                    className="btn btn--danger"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(id)
                    }}
                  >
                    Delete
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
