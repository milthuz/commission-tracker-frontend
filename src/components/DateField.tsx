import DatePicker, { registerLocale } from 'react-datepicker';
import { fr, enCA } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import 'react-datepicker/dist/react-datepicker.css';

registerLocale('fr', fr);
registerLocale('en', enCA);

// Parse an ISO yyyy-mm-dd string as a LOCAL date. Avoids the UTC off-by-one that
// `new Date('2025-06-16')` triggers in negative-offset timezones (would show the prev day).
function isoToDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function dateToIso(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface DateFieldProps {
  value?: string | null;            // ISO yyyy-mm-dd (or null/'')
  onChange: (iso: string) => void;  // emits ISO yyyy-mm-dd ('' when cleared)
  className?: string;
  placeholderText?: string;
  id?: string;
}

// Locale-consistent date picker: shows jj/mm/aaaa in French, yyyy-mm-dd in English,
// regardless of the browser UI locale (which native <input type="date"> would follow).
const DateField = ({ value, onChange, className, placeholderText, id }: DateFieldProps) => {
  const { i18n } = useTranslation();
  const locale = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const fmt = locale === 'fr' ? 'dd/MM/yyyy' : 'yyyy-MM-dd';
  return (
    <DatePicker
      id={id}
      selected={isoToDate(value)}
      onChange={(d) => onChange(dateToIso(d as Date | null))}
      locale={locale}
      dateFormat={fmt}
      placeholderText={placeholderText || (locale === 'fr' ? 'jj/mm/aaaa' : 'yyyy-mm-dd')}
      showMonthDropdown
      showYearDropdown
      dropdownMode="select"
      isClearable
      className={className}
      wrapperClassName="w-full"
      // Render with fixed strategy so the calendar popup isn't clipped by card overflow.
      popperProps={{ strategy: 'fixed' }}
    />
  );
};

export default DateField;
