import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')!;

// DEV-ONLY lyric preview: zero prod impact (import.meta.env.DEV is false in builds,
// so the preview chunk is never requested outside `vite dev ...?preview`).
if (import.meta.env.DEV && window.location.search.includes('preview')) {
  void import('./preview/Preview').then(({ default: Preview }) => {
    createRoot(rootEl).render(
      <StrictMode>
        <Preview />
      </StrictMode>,
    );
  });
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
