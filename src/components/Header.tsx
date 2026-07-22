import './Header.css'

/** Top navigation bar. */
export default function Header() {
  return (
    <header className="header">
      <div className="header-brand">abar</div>
      <nav className="header-nav">
        <a href="#">Projects</a>
        <a href="#">Phrases</a>
      </nav>
    </header>
  )
}
