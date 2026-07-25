import Tabs, { type TabDef } from './Tabs'
import ProjectsTab from './tabs/ProjectsTab'
import PhrasesTab from './tabs/PhrasesTab'
import FutureTab from './tabs/FutureTab'
import { useCurrentProject } from './CurrentProjectContext'
import './LeftPane.css'

/** Left pane: a tab strip over Projects / Future / Common phrases.
 *  The Future and Common phrases tabs are disabled until a project is
 *  selected, since their contents are scoped to the current project. */
export default function LeftPane() {
  const { currentProject } = useCurrentProject()
  const noProject = currentProject === null

  const tabs: TabDef[] = [
    { id: 'projects', label: 'Projects', content: <ProjectsTab /> },
    {
      id: 'future',
      label: 'Future',
      content: <FutureTab />,
      disabled: noProject,
    },
    {
      id: 'phrases',
      label: 'Common phrases',
      content: <PhrasesTab />,
      disabled: noProject,
    },
  ]

  return (
    <div className="left-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
