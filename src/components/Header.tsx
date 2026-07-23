import { useCurrentProject } from './CurrentProjectContext'
import './Header.css'

/** Top navigation bar. */
export default function Header() {
  const { currentProject } = useCurrentProject()

  return (
    <header className="header">
      <div className="header-brand">abar</div>
      <nav className="header-nav">
        <a href="#">{currentProject ?? 'No project selected'}</a>
      </nav>
    </header>
  )
}
