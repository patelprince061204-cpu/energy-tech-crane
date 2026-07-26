// src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { RouterProvider } from './lib/router';
import './styles.css';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
