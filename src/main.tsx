import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLegacyStorageKeys } from './utils/storage'
import { initPlatformInsets } from './utils/platformInsets'
import { ErrorBoundary } from './components/ErrorBoundary'

migrateLegacyStorageKeys()
initPlatformInsets()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
