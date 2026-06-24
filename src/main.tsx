import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLegacyStorageKeys } from './utils/storage'
import { initPlatformInsets } from './utils/platformInsets'
import { ErrorBoundary } from './components/ErrorBoundary'

migrateLegacyStorageKeys()
initPlatformInsets()

const app = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  import.meta.env.PROD ? app : <React.StrictMode>{app}</React.StrictMode>,
)
