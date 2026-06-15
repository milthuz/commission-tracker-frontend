import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';

// Get saved language from localStorage or default to 'en'
const savedLanguage = localStorage.getItem('language') || 'en';

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
