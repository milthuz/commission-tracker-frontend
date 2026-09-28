import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { authHeaders } from '../Leads/types';

const API_URL = import.meta.env.VITE_API_URL;

// Carte « Webflow » d'Admin → Pistes → Automatisations (backend : services/webflowLeads).
//
// 1. Connexion : David colle un jeton API du site Webflow ; Sales Hub crée LUI-MÊME le webhook
//    (form_submission) dans Webflow. Aucun secret ne passe par le développeur du site, et le jeton
//    n'est jamais renvoyé au navigateur.
// 2. Correspondance des champs : chaque formulaire reçu au moins une fois apparaît avec ses champs
//    et le champ de piste deviné ; on corrige au besoin. Un champ non reconnu n'est jamais perdu :
//    il est ajouté au message de la piste.

interface WfField { field: string; guess: string | null }
interface WfForm { name: string; count: number; lastAt: string | null; fields: WfField[] }
interface WfState {
  connected: boolean; siteName: string | null; connectedAt: string | null; connectedBy: string | null;
  signed: boolean; defaultLanguage: 'fr' | 'en'; fieldMap: Record<string, string>; targets: string[]; forms: WfForm[];
}

const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark';
const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none transition ' +
  'focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-3 py-2 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const BTN = 'rounded border border-stroke px-4 py-2 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:text-white dark:hover:bg-meta-4';

const LeadsWebflowCard = () => {
  const { t, i18n } = useTranslation();
  const [st, setSt] = useState<WfState | null>(null);
  const [token, setToken] = useState('');
  const [sites, setSites] = useState<{ id: string; name: string }[] | null>(null);
  const [siteId, setSiteId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [lang, setLang] = useState<'fr' | 'en'>('fr');
  const [confirmOff, setConfirmOff] = useState(false);

  const apply = (d: WfState) => { setSt(d); setMap(d.fieldMap || {}); setLang(d.defaultLanguage || 'fr'); };
  const load = () => fetch(`${API_URL}/api/admin/webflow`, { headers: authHeaders() })
    .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) apply(d); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const post = async (path: string, body?: any, method = 'POST') => {
    const r = await fetch(`${API_URL}/api/admin/webflow${path}`, {
      method, headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  };

  const connect = async () => {
    setBusy('connect'); setMsg(null);
    try {
      const { ok, status, d } = await post('/connect', { token: token.trim(), siteId: siteId || undefined });
      if (status === 409 && d.error === 'pick_site') { setSites(d.sites || []); return; }
      if (!ok) { setMsg({ ok: false, text: t(`admin.leads.webflow.err.${d.error}`, { defaultValue: d.detail || d.error, detail: d.detail || '' }) as string }); return; }
      apply(d); setToken(''); setSites(null); setSiteId('');
      setMsg({ ok: true, text: t('admin.leads.webflow.connectedOk') as string });
    } catch { setMsg({ ok: false, text: t('admin.leads.webflow.err.network') as string }); }
    finally { setBusy(null); }
  };

  const disconnect = async () => {
    setBusy('off'); setMsg(null);
    try {
      const { ok, d } = await post('/disconnect');
      if (ok) { apply(d); setConfirmOff(false); setMsg({ ok: true, text: t('admin.leads.webflow.disconnectedOk') as string }); }
    } finally { setBusy(null); }
  };

  const saveMap = async () => {
    setBusy('map'); setMsg(null);
    try {
      const { ok, d } = await post('/mapping', { fieldMap: map, defaultLanguage: lang }, 'PUT');
      if (ok) { apply(d); setMsg({ ok: true, text: t('admin.leads.webflow.mapSaved') as string }); }
    } finally { setBusy(null); }
  };

  const targetOptions = useMemo(() => [
    { value: '', label: t('admin.leads.webflow.auto') as string },
    ...(st?.targets || []).map((x) => ({ value: x, label: t(`admin.leads.webflow.target.${x}`, { defaultValue: x }) as string })),
    { value: 'extra', label: t('admin.leads.webflow.target.extra') as string },
    { value: 'ignore', label: t('admin.leads.webflow.target.ignore') as string },
  ], [st, i18n.language]);
  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language?.startsWith('fr') ? 'fr-CA' : 'en-CA') : '—');

  if (!st) return null;
  return (
    <div className={CARD}>
      <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.webflow.title')}</h3>
      <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.webflow.hint')}</p>

      {st.connected ? (
        <div className="rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          {t('admin.leads.webflow.connected', { site: st.siteName, when: dt(st.connectedAt), who: st.connectedBy })}
          <span className="block text-xs">{st.signed ? t('admin.leads.webflow.signed') : t('admin.leads.webflow.unsigned')}</span>
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-sm bg-gray-2 px-4 py-3 text-xs text-body dark:bg-meta-4">
            <p className="mb-1.5 font-medium text-black dark:text-white">{t('admin.leads.webflow.howTitle')}</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t('admin.leads.webflow.how1')}</li>
              <li>{t('admin.leads.webflow.how2')}</li>
              <li>{t('admin.leads.webflow.how3')}</li>
            </ol>
          </div>
          <div className="flex max-w-2xl flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('admin.leads.webflow.tokenLabel')}</label>
              <input className={INPUT} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="••••••••••••••••" />
            </div>
            {sites && (
              <div className="min-w-[220px]">
                <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('admin.leads.webflow.pickSite')}</label>
                <Select buttonClassName={SELECT_CLS} value={siteId} onChange={setSiteId}
                  options={[{ value: '', label: '—' }, ...sites.map((s) => ({ value: s.id, label: s.name }))]} />
              </div>
            )}
            <button type="button" onClick={connect} disabled={!!busy || token.trim().length < 20 || (!!sites && !siteId)}
              className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
              {busy === 'connect' ? t('common.loading') : t('admin.leads.webflow.connect')}
            </button>
          </div>
        </>
      )}

      {msg && <p className={`mt-3 text-xs ${msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-danger'}`}>{msg.text}</p>}

      {/* Correspondance des champs — les formulaires apparaissent après leur première soumission. */}
      <div className="mt-6 border-t border-stroke pt-5 dark:border-strokedark">
        <h4 className="text-sm font-semibold text-black dark:text-white">{t('admin.leads.webflow.mapTitle')}</h4>
        <p className="mb-3 mt-0.5 text-xs text-body">{t('admin.leads.webflow.mapHint')}</p>
        <div className="mb-4 max-w-xs">
          <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('admin.leads.webflow.defaultLang')}</label>
          <Select buttonClassName={SELECT_CLS} value={lang} onChange={(v) => setLang(v as 'fr' | 'en')}
            options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} />
        </div>
        {!st.forms.length ? (
          <p className="rounded-sm bg-gray-2 px-4 py-6 text-center text-sm text-bodydark2 dark:bg-meta-4">{t('admin.leads.webflow.noForms')}</p>
        ) : st.forms.map((f) => (
          <div key={f.name} className="mb-4 rounded-sm border border-stroke dark:border-strokedark">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stroke px-4 py-2.5 dark:border-strokedark">
              <span className="text-sm font-medium text-black dark:text-white">{f.name}</span>
              <span className="text-xs text-bodydark2">{t('admin.leads.webflow.formStats', { n: f.count, when: dt(f.lastAt) })}</span>
            </div>
            <table className="w-full table-auto">
              <tbody>
                {f.fields.map((x) => (
                  <tr key={x.field} className="border-t border-stroke first:border-t-0 dark:border-strokedark">
                    <td className="w-1/2 px-4 py-2 text-sm text-black dark:text-white">{x.field}</td>
                    <td className="px-4 py-2">
                      <Select buttonClassName={SELECT_CLS} value={map[x.field] || ''}
                        onChange={(v) => setMap((m) => { const n = { ...m }; if (v) n[x.field] = v; else delete n[x.field]; return n; })}
                        options={targetOptions.map((o) => (o.value === '' ? {
                          ...o, label: `${o.label} — ${x.guess ? t(`admin.leads.webflow.target.${x.guess}`, { defaultValue: x.guess }) : t('admin.leads.webflow.target.extra')}`,
                        } : o))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <button type="button" onClick={saveMap} disabled={!!busy} className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
          {busy === 'map' ? t('common.loading') : t('common.save')}
        </button>
      </div>

      {st.connected && (
        <div className="mt-6 border-t border-stroke pt-4 dark:border-strokedark">
          {!confirmOff ? (
            <button type="button" onClick={() => setConfirmOff(true)} className="text-sm text-danger underline-offset-2 hover:underline">
              {t('admin.leads.webflow.disconnect')}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-sm border border-danger/40 bg-danger/10 px-4 py-3">
              <span className="flex-1 text-sm text-black dark:text-white">{t('admin.leads.webflow.disconnectConfirm')}</span>
              <button type="button" onClick={() => setConfirmOff(false)} className={BTN}>{t('common.cancel')}</button>
              <button type="button" onClick={disconnect} disabled={!!busy} className="rounded bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy === 'off' ? t('common.loading') : t('admin.leads.webflow.disconnect')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeadsWebflowCard;
