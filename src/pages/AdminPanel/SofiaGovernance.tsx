import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || '';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface SofiaAction {
  id: number;
  entity_id: string;
  event_type: string;
  description: string;
  actor: string;
  metadata: {
    tool?: string;
    input?: Record<string, unknown>;
    ok?: boolean;
    error?: string | null;
    scopeLevel?: 'own' | 'team' | 'all';
    email?: string;
  } | null;
  created_at: string;
}

// Admin → Users → Sofia. Two controls that sit above per-user roles: the global
// kill switch, and the record of what Sofia actually did in Zoho.
//
// Reads are not listed here on purpose — a rep asking "what's my pipeline" ten
// times a day would bury the writes, and the writes are the point.
const SofiaGovernance: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [actions, setActions] = useState<SofiaAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        axios.get(`${API_URL}/api/admin/sofia-crm`, { headers: authHeaders() }),
        axios.get(`${API_URL}/api/admin/sofia-activity`, { headers: authHeaders() }),
      ]);
      setEnabled(s.data.enabled !== false);
      setActions(a.data.actions || []);
      setError('');
    } catch {
      setError(t('admin.sofia.loadError') as string);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggle = async () => {
    if (saving || enabled === null) return;
    setSaving(true);
    try {
      const r = await axios.put(`${API_URL}/api/admin/sofia-crm`,
        { enabled: !enabled }, { headers: authHeaders() });
      setEnabled(r.data.enabled !== false);
      load();
    } catch {
      setError(t('admin.sofia.saveError') as string);
    } finally { setSaving(false); }
  };

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA',
      { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const scopeBadge = (lvl?: string) => {
    const map: Record<string, string> = {
      own:  'bg-gray-2 text-body dark:bg-meta-4 dark:text-bodydark',
      team: 'bg-primary/10 text-primary',
      all:  'bg-warning/15 text-warning',
    };
    return map[lvl || 'own'] || map.own;
  };

  return (
    <div className="space-y-6">
      {/* Kill switch */}
      <div className="rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-1 text-lg font-semibold text-black dark:text-white">{t('admin.sofia.title')}</h3>
        <p className="mb-5 text-sm text-body dark:text-bodydark">{t('admin.sofia.intro')}</p>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stroke p-4 dark:border-strokedark">
          <div className="min-w-0">
            <p className="text-sm font-medium text-black dark:text-white">{t('admin.sofia.switchLabel')}</p>
            <p className="mt-0.5 text-xs text-body dark:text-bodydark">{t('admin.sofia.switchHint')}</p>
          </div>
          <button
            onClick={toggle}
            disabled={saving || loading || enabled === null}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${
              enabled ? 'bg-danger text-white hover:bg-opacity-90' : 'bg-primary text-white hover:bg-opacity-90'
            }`}
          >
            {enabled ? t('admin.sofia.turnOff') : t('admin.sofia.turnOn')}
          </button>
        </div>

        {enabled === false && (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            {t('admin.sofia.offNotice')}
          </p>
        )}

        <p className="mt-4 text-xs text-body dark:text-bodydark">{t('admin.sofia.permsHint')}</p>
      </div>

      {/* Audit trail */}
      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="flex items-center justify-between border-b border-stroke px-6 py-4 dark:border-strokedark">
          <h3 className="font-semibold text-black dark:text-white">{t('admin.sofia.auditTitle')}</h3>
          <button onClick={load} disabled={loading}
            className="rounded-md border border-stroke px-3 py-1.5 text-xs font-medium text-body transition hover:border-primary hover:text-primary disabled:opacity-40 dark:border-strokedark dark:text-bodydark">
            {t('admin.sofia.refresh')}
          </button>
        </div>

        {error && <p className="px-6 py-4 text-sm text-danger">{error}</p>}
        {loading && !actions.length && <p className="px-6 py-8 text-sm text-body dark:text-bodydark">{t('admin.sofia.loading')}</p>}
        {!loading && !actions.length && !error && (
          <p className="px-6 py-8 text-sm text-body dark:text-bodydark">{t('admin.sofia.empty')}</p>
        )}

        {!!actions.length && (
          <div className="overflow-x-auto">
            {/* Pas de `min-w` : il y avait un `min-w-[820px]` et c'etait une butee FANTOME, comme
                dans la file partenaires (2e3c6b8). Le plancher REEL du contenu etait de 1150 px —
                le 820 ne servait donc jamais, il masquait juste le vrai chiffre. Et 1150 px, c'est
                une barre de defilement horizontale sous 1538 px de fenetre : sur TOUS les portables,
                y compris un 1536. Trois leviers mesures ci-dessous ramenent le plancher a 921 px,
                soit plus de barre des 1277 px. Ce sont les plafonds `truncate` qui garantissent
                qu'une colonne reste lisible, pas une largeur plancher. */}
            <table className="w-full table-auto">
              <thead>
                <tr className="bg-gray-2 text-left dark:bg-meta-4">
                  {/* Gouttieres : px-6 conserve AU BORD a partir de xl, parce qu'il aligne la
                      premiere et la derniere colonne sur l'en-tete de la carte (px-6 lui aussi) —
                      cet alignement coute 32 px de plancher, payes sur les plafonds ci-dessous.
                      Les quatre colonnes du milieu passent a px-2 sous xl / px-3 a partir de xl :
                      -32 px sans couper un seul caractere. */}
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-6 dark:text-bodydark">{t('admin.sofia.col.when')}</th>
                  <th className="whitespace-nowrap px-2 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-3 dark:text-bodydark">{t('admin.sofia.col.who')}</th>
                  <th className="whitespace-nowrap px-2 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-3 dark:text-bodydark">{t('admin.sofia.col.what')}</th>
                  <th className="px-2 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-3 dark:text-bodydark">{t('admin.sofia.col.detail')}</th>
                  <th className="whitespace-nowrap px-2 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-3 dark:text-bodydark">{t('admin.sofia.col.scope')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-body xl:px-6 dark:text-bodydark">{t('admin.sofia.col.result')}</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => {
                  const quoi = t(`assistant.tools.${a.metadata?.tool}`, { defaultValue: a.description }) as string;
                  return (
                    <tr key={a.id} className="border-b border-stroke last:border-0 dark:border-strokedark">
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-body xl:px-6 dark:text-bodydark">{fmt(a.created_at)}</td>
                      {/* « Qui » et « Action » etaient les deux SEULES colonnes sans plafond, en
                          `whitespace-nowrap` : leur minimum etait donc leur texte entier. Un courriel
                          de 47 caracteres reclamait a lui seul 363 px, le libelle d'outil le plus long
                          243 px. Tronquees comme partout ailleurs, texte entier en infobulle : il
                          reste 20 puis 26 caracteres du courriel (sous xl / a partir de xl), et 18
                          puis 21 du libelle — de quoi identifier la personne et l'action. */}
                      <td className="px-2 py-3 text-sm font-medium text-black xl:px-3 dark:text-white">
                        <div className="max-w-[150px] truncate xl:max-w-[195px]" title={a.actor}>{a.actor}</div>
                      </td>
                      <td className="px-2 py-3 text-sm text-black xl:px-3 dark:text-white">
                        <div className="max-w-[130px] truncate xl:max-w-[150px]" title={quoi}>{quoi}</div>
                      </td>
                      <td className="max-w-[280px] px-2 py-3 text-xs text-body xl:px-3 dark:text-bodydark">
                        <span className="line-clamp-2 break-words">
                          {a.metadata?.input
                            ? Object.entries(a.metadata.input)
                                .filter(([k]) => k !== 'module')
                                .map(([k, v]) => `${k}: ${String(v).slice(0, 120)}`).join(' · ')
                            : '—'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 xl:px-3">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${scopeBadge(a.metadata?.scopeLevel)}`}>
                          {t(`admin.sofia.scope.${a.metadata?.scopeLevel || 'own'}`)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 xl:px-6">
                        {a.metadata?.ok
                          ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">{t('admin.sofia.ok')}</span>
                          : <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-semibold text-danger" title={a.metadata?.error || ''}>{t('admin.sofia.failed')}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SofiaGovernance;
