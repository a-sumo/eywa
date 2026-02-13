import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/i18n'
import './index.css'
import App from './App.tsx'

// After a new deploy, old chunk filenames are gone. When a lazy route tries
// to load a stale chunk, Vite fires this event. Reload once to pick up the
// new HTML with fresh chunk references.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
