// Typed fetch wrappers for the backend API.
//
// In dev, Vite proxies /api/* -> http://127.0.0.1:5001 (see vite.config.ts),
// so these relative URLs reach the Flask server without CORS config.

import type { Future, Phrase, Prompt } from './types'

export type { Future, Phrase, Prompt }

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`)
  }
  return (await res.json()) as T
}

/** Send a JSON body and return the parsed response. */
async function sendJson<T>(
  url: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}`)
  }
  return (await res.json()) as T
}

// ---- Projects (CRUD) ----

/** GET /api/projects -> {"project_ids": [...]} */
export function fetchProjects(): Promise<{ project_ids: string[] }> {
  return getJson('/api/projects')
}

/** POST /api/project?project_id=X -> {"status": "created", "project_id": ...} */
export function createProject(projectId: string): Promise<{ status: string; project_id: string }> {
  return sendJson(`/api/project?project_id=${encodeURIComponent(projectId)}`, 'POST')
}

/** PUT /api/project?project_id=<old> body {"project_id": <new>} -> {"status": "renamed", ...} */
export function renameProject(
  oldId: string,
  newId: string,
): Promise<{ status: string; from: string; project_id: string }> {
  return sendJson(`/api/project?project_id=${encodeURIComponent(oldId)}`, 'PUT', {
    project_id: newId,
  })
}

/** DELETE /api/project?project_id=X -> {"status": "deleted" | "not_found", ...} */
export function deleteProject(projectId: string): Promise<{ status: string; project_id: string }> {
  return sendJson(`/api/project?project_id=${encodeURIComponent(projectId)}`, 'DELETE')
}

// ---- Prompts ----

/** GET /api/prompts?project_id=X -> Prompt[] */
export function fetchPrompts(projectId: string): Promise<Prompt[]> {
  return getJson(`/api/prompts?project_id=${encodeURIComponent(projectId)}`)
}

// ---- Phrases ----

/** GET /api/phrases?project_id=X -> Phrase[] */
export function fetchPhrases(projectId: string): Promise<Phrase[]> {
  return getJson(`/api/phrases?project_id=${encodeURIComponent(projectId)}`)
}

/**
 * POST /api/phrase?project_id=X. Omit phraseId to create (server generates
 * the id); pass it to update an existing phrase in place.
 */
export function upsertPhrase(
  projectId: string,
  phrase: string,
  phraseId?: string,
): Promise<{ status: string; phrase_id: string }> {
  return sendJson(`/api/phrase?project_id=${encodeURIComponent(projectId)}`, 'POST', {
    phrase,
    ...(phraseId !== undefined ? { phrase_id: phraseId } : {}),
  })
}

/** DELETE /api/phrase?project_id=X&phrase_id=Y -> {"status": "deleted" | "not_found", ...} */
export function deletePhrase(
  projectId: string,
  phraseId: string,
): Promise<{ status: string; phrase_id: string }> {
  return sendJson(`/api/phrase?project_id=${encodeURIComponent(projectId)}&phrase_id=${encodeURIComponent(phraseId)}`, 'DELETE')
}

// ---- Futures (CRUD) ----
// POST /future body is {"text": ...} (optionally {"future_id": ...} to
// update in place). GET /futures returns [{"future_id": ..., "text": ...}].

/** GET /api/futures?project_id=X -> Future[] */
export function fetchFutures(projectId: string): Promise<Future[]> {
  return getJson(`/api/futures?project_id=${encodeURIComponent(projectId)}`)
}

/**
 * POST /api/future?project_id=X. Omit futureId to create (server generates
 * the id); pass it to update an existing future in place.
 */
export function upsertFuture(
  projectId: string,
  text: string,
  futureId?: string,
): Promise<{ status: string; future_id: string }> {
  return sendJson(`/api/future?project_id=${encodeURIComponent(projectId)}`, 'POST', {
    text,
    ...(futureId !== undefined ? { future_id: futureId } : {}),
  })
}

/** DELETE /api/future?project_id=X&future_id=Y -> {"status": "deleted" | "not_found", ...} */
export function deleteFuture(
  projectId: string,
  futureId: string,
): Promise<{ status: string; future_id: string }> {
  return sendJson(`/api/future?project_id=${encodeURIComponent(projectId)}&future_id=${encodeURIComponent(futureId)}`, 'DELETE')
}
