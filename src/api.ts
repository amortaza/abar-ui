// Typed fetch wrappers for the backend API.
//
// In dev, Vite proxies /api/* -> http://127.0.0.1:5000 (see vite.config.ts),
// so these relative URLs reach the Flask server without CORS config.
//
// Not wired into any component yet; the tab bodies are blank by design.
// Calling these is a per-tab change once data is needed.

import type { Phrase, Prompt } from './types'

export type { Phrase, Prompt }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`)
  }
  return (await res.json()) as T
}

/** GET /api/projects -> {"project_ids": [...]} */
export function fetchProjects(): Promise<{ project_ids: string[] }> {
  return getJson('/api/projects')
}

/** GET /api/prompts?project_id=X -> Prompt[] */
export function fetchPrompts(projectId: string): Promise<Prompt[]> {
  return getJson(`/api/prompts?project_id=${encodeURIComponent(projectId)}`)
}

/** GET /api/phrases?project_id=X -> Phrase[] */
export function fetchPhrases(projectId: string): Promise<Phrase[]> {
  return getJson(`/api/phrases?project_id=${encodeURIComponent(projectId)}`)
}
