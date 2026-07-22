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
}

/** GET /phrases returns an array of {phrase_id, phrase}. */
export interface Phrase {
  phrase_id: string
  phrase: string
}
