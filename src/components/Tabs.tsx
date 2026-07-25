import { useEffect, useState } from 'react'
import './Tabs.css'

export interface TabDef {
  id: string
  label: string
  content: React.ReactNode
  /** When true, the tab is rendered dimmed and can't be selected. */
  disabled?: boolean
}

interface TabsProps {
  tabs: TabDef[]
  /** Initial active tab id; defaults to the first tab. */
  initialTabId?: string
}

/** Horizontal tab strip + active body. */
export default function Tabs({ tabs, initialTabId }: TabsProps) {
  const [activeId, setActiveId] = useState(
    initialTabId ?? tabs.find((t) => !t.disabled)?.id ?? '',
  )

  // If the active tab becomes disabled (e.g. the project was cleared),
  // fall back to the first enabled tab.
  useEffect(() => {
    const active = tabs.find((t) => t.id === activeId)
    if (active?.disabled) {
      const fallback = tabs.find((t) => !t.disabled)
      setActiveId(fallback?.id ?? '')
    }
  }, [tabs, activeId])

  const active = tabs.find((t) => t.id === activeId) ?? tabs.find((t) => !t.disabled)

  return (
    <div className="tabs">
      <div className="tabs-strip" role="tablist">
        {tabs.map((t) => {
          const disabled = !!t.disabled
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={t.id === active?.id}
              className={
                'tab' +
                (t.id === active?.id ? ' tab--active' : '') +
                (disabled ? ' tab--disabled' : '')
              }
              disabled={disabled}
              tabIndex={disabled ? -1 : 0}
              onClick={() => setActiveId(t.id)}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      <div className="tab-body">{active?.content}</div>
    </div>
  )
}
