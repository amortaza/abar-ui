// Markdown rendering for the Prompts preview.
//
// marked turns CommonMark into HTML; DOMPurify sanitizes the result before
// it is injected via dangerouslySetInnerHTML. The output is safe to render.

import DOMPurify from 'dompurify'
import { marked } from 'marked'

/**
 * Render a markdown string to sanitized HTML.
 *
 * Returns an empty string for empty/whitespace-only input so the caller can
 * show a placeholder instead of an empty preview pane.
 */
export function renderMarkdown(md: string): string {
  if (!md.trim()) return ''
  const html = marked.parse(md, { async: false }) as string
  return DOMPurify.sanitize(html)
}
