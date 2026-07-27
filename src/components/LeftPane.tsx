import Tabs, { type TabDef } from './Tabs'
import ProjectsTab from './tabs/ProjectsTab'
import PhrasesTab from './tabs/PhrasesTab'
import SkillsTab from './tabs/SkillsTab'
import { useCurrentProject } from './CurrentProjectContext'
import './LeftPane.css'

/** Left pane: a tab strip over Projects / Common phrases / Skills.
 *  The Common phrases tab is disabled until a project is selected, since
 *  its contents are scoped to the current project. Skills are global, so
 *  that tab is always available. */
export default function LeftPane() {
  const { currentProject } = useCurrentProject()
  const noProject = currentProject === null

  const tabs: TabDef[] = [
    { id: 'projects', label: 'Projects', content: <ProjectsTab /> },
    {
      id: 'phrases',
      label: 'Common phrases',
      content: <PhrasesTab />,
      disabled: noProject,
    },
    { id: 'skills', label: 'Skills', content: <SkillsTab /> },
  ]

  return (
    <div className="left-pane">
      <Tabs tabs={tabs} />
    </div>
  )
}
