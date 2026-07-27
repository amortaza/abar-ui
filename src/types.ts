// Shared types for the data exposed by the Flask backend.
// These mirror the JSON shapes returned by the REST API (see server.py).

/** GET /projects returns {"project_ids": string[]} */
export interface ProjectsResponse {
  project_ids: string[]
}

/**
 * GET /prompts returns an array of prompt objects with hyphenated
 * project-id / session-id keys (as returned by the server).
 */
export interface Prompt {
  'project-id': string
  platform: string
  'session-id': string
  prompt_id: string
  prompt: string
  state: string
  /** ISO 8601 timestamp of the last write (may be absent on very old entries). */
  last_modified?: string | null
}

/** GET /phrases returns an array of {phrase_id, phrase}. */
export interface Phrase {
  phrase_id: string
  phrase: string
}

/** GET /futures returns an array of {future_id, text}. */
export interface Future {
  future_id: string
  text: string
}

/** GET /skills returns an array of {skill_id, text}. Skills are global. */
export interface Skill {
  skill_id: string
  text: string
}
