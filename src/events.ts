// Server-Sent Events bridge to the Flask /events endpoint.
//
// The server pushes a change event whenever project data is written. Tabs
// subscribe via subscribe() and refetch their slice when a matching event
// arrives, so the UI refreshes live across clients/tabs without polling.
//
// A single shared EventSource is opened lazily on the first subscriber and
// torn down when the last one unsubscribes. EventSource reconnects
// automatically if the connection drops.

/** A change event pushed by the server. */
export type ServerEvent =
  | { type: 'phrases' | 'futures' | 'prompts'; project_id: string }
  | { type: 'projects' | 'skills' }

type Handler = (event: ServerEvent) => void

const handlers = new Set<Handler>()
let source: EventSource | null = null

function open(): void {
  if (source) return
  source = new EventSource('/api/events')
  source.onmessage = (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as ServerEvent
      for (const h of handlers) h(parsed)
    } catch {
      // Ignore malformed payloads; SSE comments/keepalives aren't JSON.
    }
  }
  // onerror fires on drops; EventSource reconnects on its own, so nothing
  // to do here beyond letting it.
}

function closeIfIdle(): void {
  if (handlers.size === 0 && source) {
    source.close()
    source = null
  }
}

/**
 * Subscribe to server change events. Returns an unsubscribe function.
 * The shared EventSource is opened on first subscribe and closed once the
 * last handler is removed.
 */
export function subscribe(handler: Handler): () => void {
  handlers.add(handler)
  open()
  return () => {
    handlers.delete(handler)
    closeIfIdle()
  }
}
