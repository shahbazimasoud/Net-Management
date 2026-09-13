import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './i18n';
import { UpdateProvider } from './context/UpdateContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <UpdateProvider>
        <App />
      </UpdateProvider>
    </LanguageProvider>
  </StrictMode>,
);
