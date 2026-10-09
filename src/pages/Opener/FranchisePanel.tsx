import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Store } from 'lucide-react';
import { dialog } from '../../lib/dialog';
import { api, type Brand } from './api';

// Franchises (2026-10-09) : les bannières reconnues sur le territoire. Une franchise utilise
// souvent le même POS partout : ses adresses sont écartées des routes de la campagne, sauf nos
// clients. Le gestionnaire (perm opener:franchises) peut forcer « à visiter quand même », ou
// classer en franchise une bannière que la règle n'a pas vue. Serveur : services/opener/franchise.js.

type Filter = 'franchise' | 'visit' | 'all';

export default function FranchisePanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ brands: Brand[]; canDecide: boolean; minLocations: number } | null>(null);
  const [filter, setFilter] = useState<Filter>('franchise');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => api<{ brands: Brand[]; canDecide: boolean; minLocations: number }>('/api/opener/brands').then(setData);
  useEffect(() => { load().catch((e) => dialog.alert(e.message)); }, []);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.brands || []).filter((b) =>
      (filter === 'all' || (filter === 'franchise' ? b.franchise : !b.franchise))
      && (!needle || b.label.toLowerCase().includes(needle)));
  }, [data, filter, q]);

  const decide = async (b: Brand, decision: Brand['decision']) => {
    setBusy(b.key);
    try {
      await api(`/api/opener/brands/${encodeURIComponent(b.key)}`, { method: 'PATCH', body: { decision } });
      await load();
      // Le serveur recalcule la campagne en arrière-plan : on relit la carte un peu après.
      window.setTimeout(onChanged, 2500);
    } catch (e: any) { dialog.alert(e.message); } finally { setBusy(null); }
  };

  const why = (b: Brand) => b.decision === 'skip' ? t('opener.franchise.whyManualSkip')
    : b.decision === 'visit' ? t('opener.franchise.whyManualVisit')
    : b.known ? t('opener.franchise.whyKnown') : t('opener.franchise.whyCount', { n: b.n });
  const counts = useMemo(() => ({
    franchise: (data?.brands || []).filter((b) => b.franchise).length,
    visit: (data?.brands || []).filter((b) => !b.franchise).length,
    all: (data?.brands || []).length,
  }), [data]);
  const chip = (on: boolean) => `rounded-full px-2.5 py-1 text-[11px] font-semibold ${on ? 'bg-primary text-white' : 'bg-gray-2 text-black hover:bg-stroke dark:bg-meta-4 dark:text-white'}`;
  const btn = 'shrink-0 rounded border border-stroke px-2 py-1 text-[11px] font-semibold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white';

  return (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-black dark:text-white">{t('opener.franchise.title')}</p>
          <p className="text-xs text-body dark:text-bodydark">{t('opener.franchise.help', { n: data?.minLocations ?? 3 })}</p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-body hover:text-black dark:hover:text-white" aria-label={t('opener.designer.close') as string}><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {(['franchise', 'visit', 'all'] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)}>{t(`opener.franchise.filter.${f}`)} ({counts[f]})</button>
        ))}
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('opener.franchise.search') as string}
        className="mb-2 w-full rounded border border-stroke bg-transparent px-3 py-1.5 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:text-white" />
      <div className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1">
        {!data && <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-body" /></div>}
        {data && !list.length && <p className="py-6 text-center text-xs text-body dark:text-bodydark">{t('opener.franchise.none')}</p>}
        {list.map((b) => (
          <div key={b.key} className="flex items-center gap-2 rounded px-1.5 py-1.5 text-xs hover:bg-gray-2 dark:hover:bg-meta-4">
            <Store className={`h-4 w-4 shrink-0 ${b.franchise ? 'text-[#8B5CF6]' : 'text-body'}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-black dark:text-white">{b.label}</p>
              <p className="truncate text-[11px] text-body dark:text-bodydark">
                {t('opener.franchise.addresses', { count: b.n })}
                {b.clients ? ` · ${t('opener.franchise.clients', { count: b.clients })}` : ''} · {why(b)}
              </p>
            </div>
            {data?.canDecide && (
              busy === b.key ? <Loader2 className="h-4 w-4 animate-spin text-body" /> : (
                <div className="flex shrink-0 gap-1">
                  {b.franchise
                    ? <button onClick={() => decide(b, 'visit')} className={btn}>{t('opener.franchise.visitAnyway')}</button>
                    : <button onClick={() => decide(b, 'skip')} className={btn}>{t('opener.franchise.markFranchise')}</button>}
                  {b.decision && <button onClick={() => decide(b, null)} className={btn} title={t('opener.franchise.autoHelp') as string}>{t('opener.franchise.auto')}</button>}
                </div>
              )
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-body dark:text-bodydark">{t('opener.franchise.clientsKept')}</p>
    </>
  );
}
