import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { isTelebirrMiniApp } from './lib/telebirr.js';

// The website remains the fallback; Telebirr injects its native bridge when
// this same app is opened inside the approved SuperApp Mini App container.
if (isTelebirrMiniApp()) {
  document.documentElement.dataset.platform = 'telebirr-mini-app';
} else {
  document.documentElement.dataset.platform = 'web';
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
);
