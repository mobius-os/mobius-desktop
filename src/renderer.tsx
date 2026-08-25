import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './renderer/App';
import './renderer/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Möbius Desktop could not find its application root.');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
