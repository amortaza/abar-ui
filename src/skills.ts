/**
 * Skill "@trigger" expansion.
 *
 * A skill's text optionally begins with a trigger label followed by a colon:
 *   "start_project: Always create a project first."
 * Here the trigger is "start_project" and the body is "Always create a
 * project first." A prompt can invoke a skill by writing @trigger; that
 * mention is expanded into the skill's body at copy time, so pasted text
 * is self-contained.
 *
 *   "Make the buttons blue. @start_project but the rest green."
 *   -> "Make the buttons blue. Always create a project first. but the rest green."
 *
 * Expansion happens only when a prompt is copied to the clipboard (the
 * lifecycle tabs), not when a skill is copied from the Skills tab. If any
 * @trigger doesn't resolve to a known skill, the copy is aborted and the
 * clipboard is cleared, with the error surfaced to the caller.
 */

import { fetchSkills } from './api'
import { copyText } from './clipboard'
import type { Skill } from './types'

/**
 * Parse a skill's trigger label and body from its text. The trigger is the
 * run of letters/digits/underscore immediately before the first ':' (after
 * optional leading whitespace); the body is everything after that ':' (also
 * whitespace-trimmed). Returns null when the text has no usable trigger
 * (no ':' or the label before it is empty/non-identifier).
 *
 * Examples:
 *   "start_project: Always create a project first."  -> ("start_project", "Always create a project first.")
 *   "with-newline:\nLine one.\nLine two."            -> ("with-newline", "Line one.\nLine two.")
 *   "no colon here"                                  -> null
 *   ": body only"                                    -> null
 */
export function parseSkillTrigger(text: string): { trigger: string; body: string } | null {
  const colon = text.indexOf(':')
  if (colon <= 0) return null
  // The trigger label is the identifier run ending right before the ':'.
  // Match backwards from the colon over [A-Za-z0-9_-], skipping nothing —
  // a space between the label and ':' (e.g. "label :") is not a trigger.
  let end = colon
  let start = end
  while (start > 0 && /[\p{L}\p{N}_-]/u.test(text[start - 1])) start--
  if (start === end) return null // ':' not preceded by an identifier char
  const trigger = text.slice(start, end)
  const body = text.slice(colon + 1).trim()
  return { trigger, body }
}

/**
 * Build a trigger -> body lookup from a list of skills. Skills with no
 * usable trigger (see parseSkillTrigger) are omitted. When two skills
 * share a trigger, the last one in the array wins, mirroring how the
 * server dedupes by id on read.
 */
export function buildTriggerMap(skills: Skill[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const s of skills) {
    const parsed = parseSkillTrigger(s.text)
    if (parsed) map.set(parsed.trigger, parsed.body)
  }
  return map
}

/**
 * A single @trigger mention found in text: the byte offsets of the whole
 * "@name" token (inclusive of '@') and the trigger name.
 */
export interface TriggerMatch {
  /** Index of the '@'. */
  start: number
  /** Index just past the final trigger character. */
  end: number
  /** The trigger name (without '@'). */
  trigger: string
}

/** Characters allowed in a trigger name after the '@'. */
const TRIGGER_CHAR = /[\p{L}\p{N}_-]/u

/**
 * Find every @trigger mention in `text`. A mention is an '@' that sits at
 * the start of the text or immediately after whitespace (so an '@' inside
 * an email like "a@b.com" or "a/b@x" is not treated as a trigger),
 * followed by one or more trigger characters. '@' followed by a space or
 * nothing is not a mention. The list is returned in document order.
 */
export function findTriggers(text: string): TriggerMatch[] {
  const matches: TriggerMatch[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue
    const ok = i === 0 || /\s/.test(text[i - 1])
    if (!ok) continue
    let end = i + 1
    while (end < text.length && TRIGGER_CHAR.test(text[end])) end++
    if (end === i + 1) continue // bare '@', no name
    matches.push({ start: i, end, trigger: text.slice(i + 1, end) })
    i = end - 1 // loop's i++ advances past the name
  }
  return matches
}

/**
 * Result of expanding @triggers in a prompt against the known skills.
 * `ok: true` carries the fully-expanded text. `ok: false` carries the list
 * of trigger names that couldn't be resolved (deduped, in order seen), so
 * the caller can report them.
 */
export type ExpansionResult =
  | { ok: true; text: string }
  | { ok: false; missing: string[] }

/**
 * Replace every @trigger mention in `prompt` with the matching skill's body.
 * When any mentioned trigger isn't found in `triggerMap`, no partial
 * expansion is returned — the whole call fails with the missing triggers.
 */
export function expandTriggers(prompt: string, triggerMap: Map<string, string>): ExpansionResult {
  const matches = findTriggers(prompt)
  if (matches.length === 0) return { ok: true, text: prompt }

  const missing: string[] = []
  for (const m of matches) {
    if (!triggerMap.has(m.trigger) && !missing.includes(m.trigger)) missing.push(m.trigger)
  }
  if (missing.length > 0) return { ok: false, missing }

  // Build the result back-to-front so earlier offsets stay valid.
  let out = prompt
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i]
    out = out.slice(0, m.start) + triggerMap.get(m.trigger)! + out.slice(m.end)
  }
  return { ok: true, text: out }
}

/**
 * Outcome of a copy-with-expansion attempt, for the caller to surface.
 *  - "copied"  : the expanded text was written to the clipboard.
 *  - "noop"    : nothing needed copying (empty input).
 *  - { missing }: a trigger couldn't be resolved; the clipboard was cleared
 *                 and the copy was aborted.
 *  - "failed"  : the low-level clipboard write failed.
 */
export type CopySkillsOutcome =
  | { status: 'copied' }
  | { status: 'noop' }
  | { status: 'failed' }
  | { status: 'missing'; missing: string[] }

/**
 * Copy `prompt` to the clipboard after expanding @trigger mentions against
 * the current skills. Skills are fetched fresh each call so a just-added
 * skill is available immediately. On an unresolved trigger the clipboard
 * is cleared (so a stale prior copy can't be mistaken for this one) and
 * the abort is reported; on a clipboard failure "failed" is reported.
 */
export async function copyWithSkills(prompt: string): Promise<CopySkillsOutcome> {
  const value = prompt
  if (!value) return { status: 'noop' }

  let skills: Skill[]
  try {
    skills = await fetchSkills()
  } catch {
    skills = []
  }

  const result = expandTriggers(value, buildTriggerMap(skills))
  if (!result.ok) {
    // Abort: clear any existing clipboard contents so a previous copy
    // isn't mistaken for this one, then surface the missing triggers.
    await copyText('')
    return { status: 'missing', missing: result.missing }
  }

  const ok = await copyText(result.text)
  return ok ? { status: 'copied' } : { status: 'failed' }
}
