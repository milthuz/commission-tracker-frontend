import axios from 'axios';
import type { i18n as I18n } from 'i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// La bascule change l'affichage ET la langue du compte : sans le second appel, un
// partenaire lisant le portail en anglais continuerait de recevoir ses courriels dans
// la langue choisie par la personne qui l'a invite, il y a peut-etre des mois.
//
// Volontairement sans await ni message d'erreur : l'affichage doit basculer tout de
// suite, et rater l'enregistrement d'une preference ne vaut pas d'interrompre
// quelqu'un. La prochaine bascule reessaiera.
//
// Partagee par l'en-tete (bureau) et la page « Plus » (telephone).
export function setPartnerLanguage(i18n: I18n, l: 'en' | 'fr') {
  i18n.changeLanguage(l);
  try { localStorage.setItem('language', l); } catch { /* ignore */ }
  axios.put(`${API_URL}/api/partner-portal/locale`, { locale: l },
    { headers: { Authorization: `Bearer ${localStorage.getItem('partnerToken')}` } })
    .catch(() => {});
}
