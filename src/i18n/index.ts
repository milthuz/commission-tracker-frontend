import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

// First-ever visit (nothing saved yet, e.g. the anonymous login page): guess from the browser's
// own language list rather than hardcoding 'en' — a French-Windows/French-Chrome visitor should
// land in French by default (user request 2026-07-09). Once logged in, Profile's saved
// preference (below) takes over and overrides this guess.
const detectBrowserLanguage = (): string => {
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]) || [];
  return langs.some((l) => l?.toLowerCase().startsWith('fr')) ? 'fr' : 'en';
};

// Get saved language from localStorage or fall back to the browser-detected guess.
const savedLanguage = localStorage.getItem('language') || detectBrowserLanguage();
if (!localStorage.getItem('language')) localStorage.setItem('language', savedLanguage);

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: savedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

// Keep the document <html lang> in sync with the active language (accessibility /
// spellcheck / locale-sensitive rendering). NOTE: this does NOT control the format of
// native <input type="date"> — Chromium derives that from the BROWSER UI locale, not the
// page lang. Consistent date-field formatting is handled by a dedicated component instead.
const applyHtmlLang = (lng: string) => {
  document.documentElement.lang = lng?.startsWith('fr') ? 'fr-CA' : 'en-CA';
};
applyHtmlLang(savedLanguage);
i18n.on('languageChanged', applyHtmlLang);

export default i18n;
