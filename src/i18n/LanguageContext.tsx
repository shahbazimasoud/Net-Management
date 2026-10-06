import React, { createContext, useContext, useState, useEffect } from 'react';
import { translations, TranslationKey, Language } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  isRtl: boolean;
  isEn: boolean;
  isFa: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem('app_language') as Language;
      if (saved === 'fa' || saved === 'en') return saved;
      const rawSettings = localStorage.getItem('nettopology_general_settings_v1');
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings);
        if (parsed?.defaultLanguage === 'fa' || parsed?.defaultLanguage === 'en') {
          return parsed.defaultLanguage;
        }
      }
    } catch (e) {}
    return 'en'; // Default language is English as required
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem('app_language', lang);
    } catch (e) {}
  };

  // Listen for system-wide settings updates broadcast by Super Admin
  useEffect(() => {
    const handleSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const newLang = detail?.settings?.defaultLanguage;
      if (newLang === 'fa' || newLang === 'en') {
        setLanguageState(newLang);
        try {
          localStorage.setItem('app_language', newLang);
        } catch (err) {}
      }
    };
    window.addEventListener('nettopology_general_settings_changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('nettopology_general_settings_changed', handleSettingsChanged);
    };
  }, []);

  const isRtl = language === 'fa';
  const isEn = language === 'en';
  const isFa = language === 'fa';

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? 'rtl' : 'ltr';
  }, [language, isRtl]);

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    const dict = translations[language] || translations.en;
    let text: string = (dict as any)[key] || (translations.en as any)[key] || key;

    if (params) {
      Object.entries(params).forEach(([paramKey, paramVal]) => {
        text = text.replace(new RegExp(`{${paramKey}}`, 'g'), String(paramVal));
      });
    }

    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl, isEn, isFa }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
