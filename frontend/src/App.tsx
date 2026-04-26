import { useEffect, useState } from 'react'
import { DashboardView } from './components/DashboardView'
import { LandingPage } from './components/LandingPage'

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = (nextPath: string) => {
    window.history.pushState({}, '', nextPath)
    setPath(nextPath)
  }

  if (path === '/dashboard') {
    return <DashboardView />
  }

  return <LandingPage onStartDashboard={() => navigate('/dashboard')} />
}

export default App
