import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-api-c4cd319c79b5.herokuapp.com';

// Prime par avis Google — les « openers » sur la route.
//
// Phase 0 : saisie a la main, attribution a un opener, approbation. La phase 1 remplira la meme
// table depuis l'API Google Business Profile ; CET ECRAN NE CHANGERA PAS, parce que l'API dit qui
// a ecrit l'avis mais jamais qui l'a obtenu — l'attribution restera humaine dans les deux cas.
//
// Le montant n'est jamais saisi ici : le serveur le lit dans la configuration du vendeur au
// moment de l'approbation, puis le fige dans la ligne.

interface Review {
  id: number;
  source: string;
  reviewer_name: string | null;
  merchant_name: string | null;
  rating: number | null;
  review_date: string | null;
  review_url: string | null;
  rep_name: string | null;
  amount: number | null;
  status: 'pending' | 'approved' | 'rejected';
  period: string | null;
  note: string | null;
  review_text: string | null;
  approved_by: string | null;
}
interface PlaceCfg { placeId: string; hasKey: boolean; lastSync: { at: string; seen: number; inserted: number } | null }
interface Opener { name: string; amount: number }
interface RepCfg { name: string; enabled: boolean; amount: number }

const GoogleReviewsAdmin: React.FC = () => {
  const { t, i18n } = useTranslation();
  const tr = (k: string, o?: Record<string, unknown>) => t(`admin.reviews.${k}`, o as never) as unknown as string;

  const [rows, setRows] = useState<Review[]>([]);
  const [openers, setOpeners] = useState<Opener[]>([]);
  const [reps, setReps] = useState<RepCfg[]>([]);
  // Brouillon local du montant par avis, pour ne pas envoyer une requete a chaque frappe.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  // Le mois de paie sur lequel l'avis approuve tombera. Le mois courant par defaut : c'est la
  // regle retenue — « du a l'approbation ».
  const [period, setPeriod] = useState(ym);
  // La ligne en cours d'attribution : { id -> nom de l'opener choisi }.
  const [assign, setAssign] = useState<Record<number, string>>({});

  const [form, setForm] = useState({ reviewerName: '', merchantName: '', reviewDate: '', rating: '', reviewUrl: '', note: '' });
  const [place, setPlace] = useState<PlaceCfg | null>(null);
  const [placeDraft, setPlaceDraft] = useState('');
  // L'identifiant de fiche reste MASQUE au repos, comme les autres champs de configuration
  // sensibles : on le pose une fois, on ne le relit jamais.
  const [placeOpen, setPlaceOpen] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fmt = (v: number | null) =>
    (v ?? 0).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' });

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
        params: status === 'all' ? {} : { status },
      });
      setRows(res.data.reviews || []);
      setOpeners(res.data.openers || []);
      setReps(res.data.reps || []);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to load reviews');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const loadPlace = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/reviews/place`, { headers: { Authorization: `Bearer ${token}` } });
      setPlace(res.data); setPlaceDraft(res.data.placeId || '');
    } catch { /* la carte reste muette si l'appel echoue — ce n'est pas bloquant */ }
  };
  useEffect(() => { loadPlace(); }, []);

  const savePlace = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/reviews/place`, { placeId: placeDraft.trim() },
        { headers: { Authorization: `Bearer ${token}` } });
      loadPlace();
    } catch (e: any) { dialog.alert(e?.response?.data?.error || 'Failed to save'); }
  };

  const fetchNow = async () => {
    setFetching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API_URL}/api/reviews/fetch`, {}, { headers: { Authorization: `Bearer ${token}` } });
      dialog.alert(tr('fetched', { seen: res.data.seen, inserted: res.data.inserted }));
      loadPlace(); load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to fetch');
    } finally { setFetching(false); }
  };

  const add = async (allowDuplicate = false) => {
    if (!form.reviewerName.trim() || !form.reviewDate) { dialog.alert(tr('needFields')); return; }
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/reviews`, { ...form, allowDuplicate }, { headers: { Authorization: `Bearer ${token}` } });
      setForm({ reviewerName: '', merchantName: '', reviewDate: '', rating: '', reviewUrl: '', note: '' });
      load();
    } catch (e: any) {
      // 409 = le serveur a repere un avis identique. On demande, on ne decide pas a sa place :
      // deux avis du meme auteur le meme jour existent, c'est juste bien plus souvent une
      // double saisie — et ici une double saisie serait un double paiement.
      if (e?.response?.status === 409) {
        if (await dialog.confirm(tr('dupConfirm'))) return add(true);
        return;
      }
      dialog.alert(e?.response?.data?.error || 'Failed to record review');
    }
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    setBusy(id);
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/reviews/${id}`, body, { headers: { Authorization: `Bearer ${token}` } });
      load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to update');
    } finally { setBusy(null); }
  };

  const remove = async (r: Review) => {
    if (!(await dialog.confirm(tr('deleteConfirm')))) return;
    setBusy(r.id);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/reviews/${r.id}`, { headers: { Authorization: `Bearer ${token}` } });
      load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to delete');
    } finally { setBusy(null); }
  };

  // Activer/desactiver un opener, ou changer son tarif. Le serveur borne le montant.
  const saveRep = async (name: string, enabled: boolean, amount: number) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/salespeople/${encodeURIComponent(name)}/review-bonus`,
        { enabled, amount }, { headers: { Authorization: `Bearer ${token}` } });
      setDraft(d => { const n = { ...d }; delete n[name]; return n; });
      load();
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || 'Failed to save');
    }
  };

  const pill = (s: string) => {
    const c = s === 'approved' ? 'bg-success/10 text-success'
      : s === 'rejected' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning';
    return <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${c}`}>{tr(`status_${s}`)}</span>;
  };

  const monthOptions = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 6 + i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value: v, label: v };
  });

  const total = rows.filter(r => r.status === 'approved').reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* La fiche Google d'ou viennent les avis */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{tr('placeTitle')}</h3>
          <p className="text-sm text-body">{tr('placeSubtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[280px] flex-1">
              <label className="mb-1 block text-xs font-medium text-body">{tr('placeId')}</label>
              {placeOpen || !place?.placeId ? (
                <input value={placeDraft} onChange={e => setPlaceDraft(e.target.value)} placeholder="ChIJ…" autoFocus={placeOpen}
                  className="w-full rounded border border-primary bg-transparent px-3 py-2 text-sm text-black outline-none dark:bg-form-input dark:text-white" />
              ) : (
                <button onClick={() => { setPlaceDraft(place.placeId); setPlaceOpen(true); }}
                  title={tr('placeReveal') as string}
                  className="group flex w-full items-center justify-between gap-2 rounded border border-stroke px-3 py-2 text-left text-sm transition hover:border-primary dark:border-strokedark">
                  <span className="font-mono text-black dark:text-white">
                    {place.placeId.slice(0, 4)}{'•'.repeat(Math.max(4, place.placeId.length - 7))}{place.placeId.slice(-3)}
                  </span>
                  <svg className="h-4 w-4 shrink-0 text-body group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </button>
              )}
            </div>
            {(placeOpen || !place?.placeId) && (
              <button onClick={() => { savePlace(); setPlaceOpen(false); }} disabled={placeDraft.trim() === (place?.placeId || '')}
                className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-40">
                {tr('save')}
              </button>
            )}
            <button onClick={fetchNow} disabled={fetching || !place?.placeId || !place?.hasKey}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-40">
              {fetching ? '…' : tr('fetchNow')}
            </button>
          </div>
          <div className="mt-3 space-y-1 text-sm">
            {place && !place.hasKey && <p className="text-danger">{tr('noKey')}</p>}
            {place?.lastSync && (
              <p className="text-body">
                {tr('lastSync')}: {new Date(place.lastSync.at).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA')}
                {' — '}{tr('lastSyncCounts', { seen: place.lastSync.seen, inserted: place.lastSync.inserted })}
              </p>
            )}
            <p className="text-xs text-body">{tr('placeHint')}</p>
          </div>
        </div>
      </div>

      {/* Qui est un opener, et a combien l'avis */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{tr('openersTitle')}</h3>
          <p className="text-sm text-body">{tr('openersSubtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
            <table className="w-full text-sm">
              <thead className="bg-gray-2 dark:bg-meta-4">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{tr('rep')}</th>
                  <th className="px-4 py-2 text-center font-medium">{tr('isOpener')}</th>
                  <th className="px-4 py-2 text-right font-medium">{tr('perReview')}</th>
                  <th className="px-4 py-2 text-right font-medium">{tr('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {reps.map(r => {
                  const val = draft[r.name] ?? String(r.amount ?? 0);
                  const dirty = draft[r.name] !== undefined && parseFloat(val) !== r.amount;
                  return (
                    <tr key={r.name} className={`border-t border-stroke dark:border-strokedark ${r.enabled ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-2 font-medium text-black dark:text-white">{r.name}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="checkbox" checked={r.enabled}
                          onChange={() => saveRep(r.name, !r.enabled, parseFloat(val) || 0)} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={val} disabled={!r.enabled}
                          onChange={e => setDraft(d => ({ ...d, [r.name]: e.target.value }))}
                          className="w-28 rounded border border-stroke bg-transparent px-2 py-1 text-right text-sm text-black outline-none focus:border-primary disabled:opacity-50 dark:border-strokedark dark:bg-form-input dark:text-white" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <button disabled={!dirty} onClick={() => saveRep(r.name, r.enabled, parseFloat(val) || 0)}
                          className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-white disabled:opacity-30">
                          {tr('save')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Saisir un avis */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{tr('addTitle')}</h3>
          <p className="text-sm text-body">{tr('addSubtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('reviewer')} *</label>
              <input value={form.reviewerName} onChange={e => setForm(f => ({ ...f, reviewerName: e.target.value }))}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('merchant')}</label>
              <input value={form.merchantName} onChange={e => setForm(f => ({ ...f, merchantName: e.target.value }))}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('date')} *</label>
              <input type="date" value={form.reviewDate} onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('rating')}</label>
              <Select value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))}
                options={[{ value: '', label: '—' }, ...[5, 4, 3, 2, 1].map(n => ({ value: String(n), label: '★'.repeat(n) }))]} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-body">{tr('url')}</label>
              <input value={form.reviewUrl} onChange={e => setForm(f => ({ ...f, reviewUrl: e.target.value }))}
                placeholder="https://…"
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-body">{tr('note')}</label>
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full rounded border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white" />
            </div>
          </div>
          <button onClick={() => add(false)}
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90">
            {tr('addButton')}
          </button>
          {openers.length === 0 && (
            <p className="mt-3 text-sm text-warning">{tr('noOpeners')}</p>
          )}
        </div>
      </div>

      {/* File d'attribution */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{tr('queueTitle')}</h3>
          <p className="text-sm text-body">{tr('queueSubtitle')}</p>
        </div>
        <div className="px-6 py-4">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('filterStatus')}</label>
              <Select value={status} onChange={setStatus} className="w-48"
                options={['pending', 'approved', 'rejected', 'all'].map(v => ({ value: v, label: tr(`status_${v}`) }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-body">{tr('payPeriod')}</label>
              <Select value={period} onChange={setPeriod} className="w-40" options={monthOptions} />
            </div>
            {status === 'approved' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {tr('approvedTotal')}: {fmt(total)}
              </span>
            )}
          </div>

          {loading ? <p className="py-6 text-center text-sm text-body">…</p>
            : rows.length === 0 ? <p className="py-6 text-center text-sm text-body">{tr('none')}</p> : (
            <div className="overflow-x-auto rounded border border-stroke dark:border-strokedark">
              <table className="w-full text-sm">
                <thead className="bg-gray-2 dark:bg-meta-4">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">{tr('date')}</th>
                    <th className="px-4 py-2 text-left font-medium">{tr('reviewer')}</th>
                    <th className="px-4 py-2 text-left font-medium">{tr('merchant')}</th>
                    {/* La note vit dans la cellule de l'auteur, et le statut ne s'affiche que
                        sur « Tous » : a 8 colonnes la table debordait de 142 px a la largeur
                        reelle (sidebar ouvert), et la colonne d'actions se retrouvait coupee. */}
                    {status === 'all' && <th className="px-4 py-2 text-center font-medium">{tr('statusCol')}</th>}
                    <th className="px-4 py-2 text-left font-medium">{tr('openerAmount')}</th>
                    <th className="sticky right-0 bg-gray-2 px-4 py-2 text-right font-medium dark:bg-meta-4">{tr('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-stroke dark:border-strokedark">
                      <td className="whitespace-nowrap px-4 py-2 text-body">{r.review_date || '—'}</td>
                      <td className="px-4 py-2 font-medium text-black dark:text-white">
                        <span className="inline-flex items-center gap-1.5">
                          {r.review_url
                            ? <a href={r.review_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{r.reviewer_name}</a>
                            : r.reviewer_name}
                          {r.rating != null && (
                            <span className="whitespace-nowrap text-xs font-semibold text-warning" title={`${r.rating}/5`}>★{r.rating}</span>
                          )}
                          {r.source === 'google' && (
                            <span className="whitespace-nowrap rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary" title={tr('fromGoogle')}>G</span>
                          )}
                        </span>
                        {r.review_text && (
                          <span className="mt-0.5 block max-w-[220px] truncate text-xs font-normal text-body" title={r.review_text}>
                            {r.review_text}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[150px] truncate px-4 py-2 text-body" title={r.merchant_name || undefined}>{r.merchant_name || '—'}</td>
                      {status === 'all' && <td className="px-4 py-2 text-center">{pill(r.status)}</td>}
                      <td className="px-4 py-2">
                        {r.status === 'approved'
                          ? (
                            <span className="text-black dark:text-white">
                              {r.rep_name}
                              <span className="ml-1.5 font-semibold">{fmt(r.amount)}</span>
                              <span className="ml-1 text-xs text-body">({r.period})</span>
                            </span>
                          )
                          : (
                            <Select value={assign[r.id] || ''} onChange={v => setAssign(a => ({ ...a, [r.id]: v }))} className="w-36"
                              options={[{ value: '', label: tr('choose') }, ...openers.map(o => ({ value: o.name, label: `${o.name} — ${fmt(o.amount)}` }))]} />
                          )}
                      </td>
                      <td className="sticky right-0 whitespace-nowrap bg-white px-4 py-2 text-right dark:bg-boxdark">
                        {r.status !== 'approved' && (
                          <button disabled={busy === r.id || !assign[r.id]}
                            onClick={() => patch(r.id, { status: 'approved', repName: assign[r.id], period })}
                            title={tr('approveTitle', { period }) as string}
                            className="mr-1 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90 disabled:opacity-40">
                            {tr('approve')}
                          </button>
                        )}
                        {r.status === 'approved' && (
                          <button disabled={busy === r.id} onClick={() => patch(r.id, { status: 'pending' })}
                            className="mr-1 rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body hover:border-primary hover:text-primary dark:border-strokedark">
                            {tr('undo')}
                          </button>
                        )}
                        {r.status === 'pending' && (
                          <button disabled={busy === r.id} onClick={() => patch(r.id, { status: 'rejected' })}
                            title={tr('reject') as string} aria-label={tr('reject') as string}
                            className="mr-1 rounded-md border border-stroke px-2 py-1.5 text-xs font-medium text-body hover:border-danger hover:text-danger dark:border-strokedark">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                        <button disabled={busy === r.id} onClick={() => remove(r)} title={tr('delete') as string}
                          className="rounded-md border border-danger/40 px-2 py-1.5 text-xs text-danger hover:bg-danger hover:text-white">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoogleReviewsAdmin;
