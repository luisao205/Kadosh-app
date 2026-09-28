import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AndroidUpdateGate from './components/updates/AndroidUpdateGate.jsx'
import GlobalUpdateCenter from './components/updates/GlobalUpdateCenter.jsx'
import { FeedbackProvider } from './components/ui/FeedbackProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FeedbackProvider>
      <AndroidUpdateGate>
        <App />
        <GlobalUpdateCenter />
      </AndroidUpdateGate>
    </FeedbackProvider>
  </StrictMode>,
)
