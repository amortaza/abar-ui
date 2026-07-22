import Tabs, { type TabDef } from './Tabs'
import ProjectsTab from './tabs/ProjectsTab'
import PhrasesTab from './tabs/PhrasesTab'
import FutureTab from './tabs/FutureTab'
import './LeftPane.css'

const tabs: TabDef[] = [
  { id: 'projects', label: 'Projects', content: <ProjectsTab /> },
  { id: 'phrases', label: 'Common phrases', content: <PhrasesTab /> },
  { id: 'future', label: 'Future', content: <FutureTab /> },
]

/** Left pane: a tab strip over Projects / Common phrases / Future. */
export default function LeftPane() {
  return (
    <div className="left-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
