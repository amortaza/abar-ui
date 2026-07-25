import { useCallback, useEffect, useMemo, useState } from 'react'
import Tabs, { type TabDef } from './Tabs'
import { fetchPrompts } from '../api'
import { useCurrentProject } from './CurrentProjectContext'
import { subscribe } from '../events'
import DoneTab from './tabs/DoneTab'
import PromptsTab from './tabs/PromptsTab'
import ReadyTab from './tabs/ReadyTab'
import ReviewTab from './tabs/ReviewTab'
import WipTab from './tabs/WipTab'
import type { Prompt } from '../types'
import './RightPane.css'

/** Right pane: a tab strip over the prompt lifecycle (draft → ready → wip → review → done). */
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

  const counts = useMemo(() => {
    const by = (state: string) => prompts.filter((p) => p.state === state).length
    return {
      draft: by('draft'),
      ready: by('ready'),
      wip: by('wip'),
      review: by('review'),
      done: by('done'),
    }
  }, [prompts])

  // All tabs are scoped to the current project, so they're disabled until one
  // is selected. (The shared Tabs component falls back to the first enabled tab
  // — none here — and renders no body.)
  const noProject = currentProject === null

  const tabs: TabDef[] = [
    { id: 'prompts', label: `Prompts (${counts.draft})`, content: <PromptsTab />, disabled: noProject },
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
