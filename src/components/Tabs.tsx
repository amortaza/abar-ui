import { useState } from 'react'
import './Tabs.css'

export interface TabDef {
  id: string
  label: string
  content: React.ReactNode
}

interface TabsProps {
  tabs: TabDef[]
  /** Initial active tab id; defaults to the first tab. */
  initialTabId?: string
}

/** Horizontal tab strip + active body. */
export default function Tabs({ tabs, initialTabId }: TabsProps) {
  const [activeId, setActiveId] = useState(
    initialTabId ?? tabs[0]?.id ?? '',
  )
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  return (
    <div className="tabs">
      <div className="tabs-strip" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === active?.id}
            className={
              'tab' + (t.id === active?.id ? ' tab--active' : '')
            }
            onClick={() => setActiveId(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">{active?.content}</div>
    </div>
  )
}
