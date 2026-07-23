import { useState } from 'react'
import { CurrentProjectProvider } from './components/CurrentProjectProvider'
import Header from './components/Header'
import LeftPane from './components/LeftPane'
import Splitter from './components/Splitter'
import './App.css'

/** Root layout: header on top; resizable two-pane row below. */
export default function App() {
  const [leftWidth, setLeftWidth] = useState(360)

  return (
    <CurrentProjectProvider>
      <div className="app">
        <Header />
        <div className="app-body">
          <div className="pane pane--left" style={{ width: leftWidth }}>
            <LeftPane />
          </div>
          <Splitter width={leftWidth} onResize={setLeftWidth} />
          <div className="pane pane--right" />
        </div>
      </div>
    </CurrentProjectProvider>
  )
}
