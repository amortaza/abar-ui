/**
 * Copy text to the clipboard, with a fallback for non-secure contexts.
 *
 * `navigator.clipboard.writeText()` only exists in secure contexts (HTTPS, or
 * http://localhost / http://127.0.0.1). When the app is loaded over plain HTTP
 * from another machine — e.g. remote Chrome pointed at a LAN IP — that API is
 * undefined (or rejects), so we fall back to the classic hidden-textarea +
 * `document.execCommand('copy')` path, which works in insecure contexts.
 * Returns true on success, false if every avenue failed.
 */
export async function copyText(text: string): Promise<boolean> {
  const nav = globalThis.navigator as Navigator | undefined
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text)
      return true
    } catch {
      // Rejects in insecure contexts or when permission is denied — fall through.
    }
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    // Place off-screen so it doesn't flash or scroll the page.
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.opacity = '0'
    ta.setAttribute('readonly', '')
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
