import { useCallback, useEffect, useMemo, useState } from 'react'
import Tabs, { type TabDef } from './Tabs'
import { fetchPrompts } from '../api'
import { useCurrentProject } from './CurrentProjectContext'
import { subscribe } from '../events'
import { SETTINGS_EVENT, getTabPlatform } from '../settings'
import DoneTab from './tabs/DoneTab'
import PromptsTab from './tabs/PromptsTab'
import ReadyTab from './tabs/ReadyTab'
import ReviewTab from './tabs/ReviewTab'
import WipTab from './tabs/WipTab'
import type { Prompt } from '../types'
import './RightPane.css'

/** A platform that can actually be stored on a prompt. */
type TargetPlatform = 'iOS' | 'Android'

/** Resolve a UI platform choice (incl. "Both") into the concrete platforms. */
function resolveTargets(choice: string): TargetPlatform[] {
  return choice === 'Both' ? ['iOS', 'Android'] : [choice as TargetPlatform]
}

/**
 * Right pane: a tab strip over the prompt lifecycle (draft → ready → wip →
 * review → done). Each tab's label shows a live row count that respects that
 * tab's own platform pick (iOS / Android / Both), so toggling a tab's platform
 * filter updates its count here too.
 */
export default function RightPane() {
  const { currentProject } = useCurrentProject()
  const [prompts, setPrompts] = useState<Prompt[]>([])

  // One fetch for the whole pane so each tab label can show its row count.
  // (Each tab still fetches independently for its own list; this is a cheap
  // parallel read that keeps the count logic in one place.)
  const load = useCallback(async (projectId: string) => {
    try {
      setPrompts(await fetchPrompts(projectId))
    } catch {
      setPrompts([])
    }
  }, [])

  useEffect(() => {
    if (currentProject) void load(currentProject)
    else setPrompts([])
  }, [currentProject, load])

  // Live-refresh counts when prompts change anywhere.
  useEffect(() => {
    if (!currentProject) return
    return subscribe((e) => {
      if (e.type === 'prompts' && e.project_id === currentProject) void load(currentProject)
    })
  }, [currentProject, load])

  // Per-tab platform picks are chosen inside each tab component (and persisted
  // via settings). Track them here so the counts below can respect them, and
  // re-read whenever a tab changes its pick (signaled via SETTINGS_EVENT).
  const [platforms, setPlatforms] = useState<Record<string, string>>(() => ({
    prompts: getTabPlatform('prompts'),
    ready: getTabPlatform('ready'),
    wip: getTabPlatform('wip'),
    review: getTabPlatform('review'),
    done: getTabPlatform('done'),
  }))

  useEffect(() => {
    const sync = () =>
      setPlatforms({
        prompts: getTabPlatform('prompts'),
        ready: getTabPlatform('ready'),
        wip: getTabPlatform('wip'),
        review: getTabPlatform('review'),
        done: getTabPlatform('done'),
      })
    window.addEventListener(SETTINGS_EVENT, sync)
    // storage events cover the same setting changing in another browser tab.
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(SETTINGS_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const counts = useMemo(() => {
    // Count prompts for a given state, scoped to that tab's platform pick.
    const by = (state: string, tabId: string) => {
      const targets = resolveTargets(platforms[tabId] ?? 'iOS')
      return prompts.filter(
        (p) => p.state === state && targets.includes(p.platform as TargetPlatform),
      ).length
    }
    return {
      draft: by('draft', 'prompts'),
      ready: by('ready', 'ready'),
      wip: by('wip', 'wip'),
      review: by('review', 'review'),
      done: by('done', 'done'),
    }
  }, [prompts, platforms])

  // All tabs are scoped to the current project, so they're disabled until one
  // is selected. (The shared Tabs component falls back to the first enabled tab
  // — none here — and renders no body.)
  const noProject = currentProject === null

  const tabs: TabDef[] = [
    { id: 'prompts', label: `Backlog (${counts.draft})`, content: <PromptsTab />, disabled: noProject },
    { id: 'ready', label: `Ready (${counts.ready})`, content: <ReadyTab />, disabled: noProject },
    { id: 'wip', label: `Wip (${counts.wip})`, content: <WipTab />, disabled: noProject },
    { id: 'review', label: `Review (${counts.review})`, content: <ReviewTab />, disabled: noProject },
    { id: 'done', label: `Done (${counts.done})`, content: <DoneTab />, disabled: noProject },
  ]

  return (
    <div className="right-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
