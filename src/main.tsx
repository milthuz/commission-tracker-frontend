import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import axios from 'axios';
import App from './App';
import './css/style.css';
import './css/satoshi.css';
import 'jsvectormap/dist/css/jsvectormap.css';
import 'flatpickr/dist/flatpickr.min.css';

// Global axios interceptor: if admin has set an impersonation target in
// localStorage, attach it as X-Impersonate-As on every request.
axios.interceptors.request.use((config) => {
  const impersonateAs = localStorage.getItem('impersonateAs');
  if (impersonateAs) {
    config.headers = config.headers || {};
    config.headers['X-Impersonate-As'] = impersonateAs;
  }
  return config;
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
);
