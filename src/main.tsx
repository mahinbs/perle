import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLegacyStorageKeys } from './utils/storage'
import { initPlatformInsets } from './utils/platformInsets'
import { initMobileWebViewportLayout } from './utils/mobileWebViewport'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerAuthSessionListeners } from './utils/auth'

migrateLegacyStorageKeys()
initPlatformInsets()
initMobileWebViewportLayout()
registerAuthSessionListeners()

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  import.meta.env.PROD ? app : <React.StrictMode>{app}</React.StrictMode>,
)
