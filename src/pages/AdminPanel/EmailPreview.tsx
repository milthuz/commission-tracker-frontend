import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL;

// All transactional email templates, in the order shown in the dropdown. Labels are i18n keys.
const TEMPLATE_TYPES = [
  'invitation', 'reset', 'paystub', 'payroll', 'feature_request', 'missing_commission', 'missing_points', 'probation', 'new_user',
] as const;
type TemplateType = (typeof TEMPLATE_TYPES)[number];

// Admin tool: preview every transactional email with sample data and send a test copy.
export default function EmailPreview() {
  const { t } = useTranslation();
  const [type, setType] = useState<TemplateType>('invitation');
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => {
    setLoading(true);
    axios
      .get(`${API_URL}/api/admin/email-preview`, { params: { type, lang }, headers: headers() })
      .then((r) => { setSubject(r.data.subject || ''); setHtml(r.data.html || ''); })
      .catch(() => { setSubject(''); setHtml(''); })
      .finally(() => setLoading(false));
  }, [type, lang]);

  const sendTest = async () => {
    setSending(true);
    try {
      const r = await axios.post(`${API_URL}/api/admin/email-preview/send`,
        { type, lang, to: to.trim() || undefined }, { headers: headers() });
      if (r.data.sent) dialog.alert(t('admin.emailPreview.sent', { to: r.data.to }) as string);
      else dialog.alert(t('admin.emailPreview.failed', { error: r.data.error || '' }) as string);
    } catch (e: any) {
      dialog.alert(t('admin.emailPreview.failed', { error: e?.response?.data?.error || e.message }) as string);
    } finally { setSending(false); }
  };

  const selectCls = 'rounded-md border border-stroke bg-transparent py-2 pl-3 pr-8 text-sm font-medium text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white';
  const labelCls = 'mb-1.5 block text-xs font-medium text-body';

  return (
    <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
      <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('admin.emailPreview.title')}</h3>
        <p className="mt-1 text-sm text-body">{t('admin.emailPreview.subtitle')}</p>
      </div>

      <div className="p-7">
        <div className="mb-5 flex flex-wrap items-end gap-4">
          <div>
            <label className={labelCls}>{t('admin.emailPreview.template')}</label>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as TemplateType)}>
              {TEMPLATE_TYPES.map((ty) => (
                <option key={ty} value={ty}>{t(`admin.emailPreview.types.${ty}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>{t('admin.emailPreview.language')}</label>
            <select className={selectCls} value={lang} onChange={(e) => setLang(e.target.value as 'fr' | 'en')}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="grow">
            <label className={labelCls}>{t('admin.emailPreview.recipient')}</label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={t('admin.emailPreview.recipientPlaceholder') as string}
              className="w-full max-w-xs rounded-md border border-stroke bg-transparent py-2 px-3 text-sm text-black outline-none transition focus:border-primary dark:border-strokedark dark:text-white"
            />
          </div>

          <button
            onClick={sendTest}
            disabled={sending}
            className="whitespace-nowrap rounded-md bg-primary px-5 py-2 text-sm font-medium text-white transition hover:bg-opacity-90 disabled:opacity-50"
          >
            {sending ? t('admin.emailPreview.sending') : t('admin.emailPreview.sendTest')}
          </button>
        </div>

        {subject && (
          <p className="mb-3 text-sm text-body">
            <span className="font-medium text-black dark:text-white">{t('admin.emailPreview.subjectLabel')}:</span> {subject}
          </p>
        )}

        <div className="overflow-hidden rounded-md border border-stroke dark:border-strokedark">
          {loading ? (
            <div className="py-20 text-center text-sm text-body">…</div>
          ) : (
            <iframe
              title="email-preview"
              srcDoc={html}
              className="h-[640px] w-full border-0 bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
}
