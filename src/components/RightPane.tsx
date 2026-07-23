import Tabs, { type TabDef } from './Tabs'
import PromptsTab from './tabs/PromptsTab'
import './RightPane.css'

const tabs: TabDef[] = [
  { id: 'prompts', label: 'Prompts', content: <PromptsTab /> },
]

/** Right pane: a tab strip for Prompts (scope for future tabs). */
export default function RightPane() {
  return (
    <div className="right-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
