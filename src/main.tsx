import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { initPwaUpdates } from './app/pwaUpdate';

// Registered before React mounts, so a first visit starts precaching while the
// library screen is still loading. It never reloads on its own — see pwaUpdate.
initPwaUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
