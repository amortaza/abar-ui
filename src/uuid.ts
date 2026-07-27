/**
 * Generate a UUID (RFC 4122 v4).
 *
 * Prefers `crypto.randomUUID()`, which only exists in secure contexts
 * (HTTPS, or http://localhost / http://127.0.0.1). When the app is loaded over
 * plain HTTP from another machine, that API is undefined, so we fall back to a
 * v4 built from `crypto.getRandomValues()` — which *is* available in insecure
 * contexts. A final `Math.random` tier covers very old browsers.
 */
export function uuid(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c?.randomUUID) return c.randomUUID()

  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16))
    // RFC 4122 v4: set version and variant bits.
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = (n: number) => n.toString(16).padStart(2, '0')
    return (
      h(b[0]) + h(b[1]) + h(b[2]) + h(b[3]) + '-' +
      h(b[4]) + h(b[5]) + '-' +
      h(b[6]) + h(b[7]) + '-' +
      h(b[8]) + h(b[9]) + '-' +
      h(b[10]) + h(b[11]) + h(b[12]) + h(b[13]) + h(b[14]) + h(b[15])
    )
  }

  // Last-resort fallback (no Web Crypto at all).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    const v = ch === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
