import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { migrateLegacyStorageKeys } from './utils/storage'
import { initPlatformInsets } from './utils/platformInsets'

migrateLegacyStorageKeys()
initPlatformInsets()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
