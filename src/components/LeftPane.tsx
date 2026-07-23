import Tabs, { type TabDef } from './Tabs'
import ProjectsTab from './tabs/ProjectsTab'
import PhrasesTab from './tabs/PhrasesTab'
import FutureTab from './tabs/FutureTab'
import './LeftPane.css'

const tabs: TabDef[] = [
  { id: 'projects', label: 'Projects', content: <ProjectsTab /> },
  { id: 'future', label: 'Future', content: <FutureTab /> },
  { id: 'phrases', label: 'Common phrases', content: <PhrasesTab /> },
]

/** Left pane: a tab strip over Projects / Future / Common phrases. */
export default function LeftPane() {
  return (
    <div className="left-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
