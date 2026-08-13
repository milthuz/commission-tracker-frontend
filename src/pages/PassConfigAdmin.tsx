import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Configuration du programme La Passe (perm `pass:manage`) — montants, échelle de paliers,
// et l'interrupteur qui ouvre le programme aux marchands.
//
// Tout ce que voit un membre en dollars sort d'ici : page programme, espace membre,
// formulaire, les quatre courriels et les actions ops. C'est donc le seul écran du produit
// où une faute de frappe change ce que Cluster doit à des gens.
//
// Les règles du serveur sont AFFICHÉES, pas seulement appliquées : on les vérifie ici pour
// dire pourquoi c'est refusé avant l'envoi, au lieu de laisser découvrir un 400.

const API_URL = import.meta.env.VITE_API_URL || 'https://commission-tracker-production-b7f9.up.railway.app';

interface Tier { level: number; from: number | string; credit: number | string; key: string }
interface Config { enabled: boolean; currency: string; hardwareDiscount: number | string; tiers: Tier[] }

const PassConfigAdmin = () => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');

  const [cfg, setCfg] = useState<Config | null>(null);
  const [defaults, setDefaults] = useState<Config | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
  const money = (n: number) =>
    new Intl.NumberFormat(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(n || 0);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/pass/config`, { headers: auth() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setCfg(d.config); setDefaults(d.defaults); } })
      .catch(() => {});
  }, []);

  if (!cfg) return null;

  const num = (v: number | string) => (v === '' ? NaN : Number(v));
  const tiers = cfg.tiers || [];

  // Les mêmes gardes que le serveur, énoncées. Elles ne remplacent pas sa validation —
  // elles évitent d'apprendre la règle par un refus.
  const problems: string[] = [];
  if (tiers.some((x) => !Number.isFinite(num(x.from)) || num(x.from) < 0 || !Number.isFinite(num(x.credit)) || num(x.credit) <= 0))
    problems.push(t('passOps.cfg.rulePositive'));
  if (tiers.length && num(tiers[0].from) !== 0) problems.push(t('passOps.cfg.ruleFirstZero'));
  for (let i = 1; i < tiers.length; i++) {
    if (num(tiers[i].from) <= num(tiers[i - 1].from)) { problems.push(t('passOps.cfg.ruleIncreasing')); break; }
  }
  // Aperçu des six premiers versements : le palier se lit sur le compteur AVANT d'y ajouter
  // le dossier courant, donc l'échelle ne se déduit pas d'un coup d'œil au tableau.
  const preview = (() => {
    if (problems.length || !tiers.length) return [];
    const sorted = [...tiers].map((x) => ({ from: num(x.from), credit: num(x.credit) })).sort((a, b) => a.from - b.from);
    return Array.from({ length: 6 }, (_, i) =>
      sorted.reduce((best, x) => (i >= x.from ? x : best), sorted[0]).credit);
  })();

  const setTier = (i: number, k: keyof Tier, v: string) =>
    setCfg((c) => c && ({ ...c, tiers: c.tiers.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));

  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      const r = await fetch(`${API_URL}/api/admin/pass/config`, {
        method: 'PUT',
        headers: { ...auth(), 'Content-Type': 'application/json' },
        // `hardwareDiscount` n'est PAS envoyé : le champ a été retiré de cet écran et le
        // serveur conserve la valeur en place quand elle est absente. L'envoyer depuis un
        // état devenu non éditable reviendrait à réécrire à l'aveugle un montant que plus
        // personne ne voit.
        body: JSON.stringify({
          enabled: cfg.enabled,
          tiers: tiers.map((x) => ({ key: x.key, from: num(x.from), credit: num(x.credit) })),
        }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setCfg(d.config);
      setNotice({ tone: 'ok', text: t('passOps.cfg.saved') });
    } catch {
      setNotice({ tone: 'error', text: t('passOps.cfg.failed') });
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = () => {
    const next = !cfg.enabled;
    const ask = next ? t('passOps.cfg.confirmOpen') : t('passOps.cfg.confirmClose');
    if (!window.confirm(ask)) return;
    setCfg({ ...cfg, enabled: next });
  };

  const input =
    'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4';
  const label = 'block text-sm font-medium text-black dark:text-white';
  const card = 'rounded-sm border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark';

  return (
    <div className="flex flex-col gap-5">
      <div className={card}>
        <h3 className="text-lg font-semibold text-black dark:text-white">{t('passOps.cfg.title')}</h3>
        <p className="mt-1 max-w-[86ch] text-sm text-bodydark2">{t('passOps.cfg.sub')}</p>
      </div>

      {/* Interrupteur d'ouverture */}
      <div className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={label}>{t('passOps.cfg.enabled')}</p>
            <p className="mt-1 max-w-[70ch] text-sm text-bodydark2">
              {cfg.enabled ? t('passOps.cfg.enabledOn') : t('passOps.cfg.enabledOff')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cfg.enabled}
            onClick={toggleEnabled}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 ${
              cfg.enabled ? 'bg-success' : 'bg-bodydark2/40'
            }`}
          >
            <span
              className="absolute top-1 h-5 w-5 rounded-full bg-white transition-all duration-150"
              style={{ left: cfg.enabled ? 26 : 4 }}
            />
          </button>
        </div>
      </div>

      {/* Le champ « Rabais matériel » vivait ici. Retiré le 2026-08-13 : la promesse a été
          retirée du programme le 12 août, et modifier le montant ne changeait plus rien de
          visible pour personne. La valeur reste en configuration côté serveur (voir
          PASS_CONFIG_DEFAULTS) au cas où le rabais revienne. */}
      {/* L'échelle */}
      <div className={card}>
        <h4 className="text-base font-semibold text-black dark:text-white">{t('passOps.cfg.tiers')}</h4>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] table-auto">
            <thead>
              <tr className="bg-gray-2 text-left dark:bg-meta-4">
                <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('passOps.cfg.tierKey')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('passOps.cfg.tierFrom')}</th>
                <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('passOps.cfg.tierCredit')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tiers.map((x, i) => (
                <tr key={i} className="border-t border-stroke dark:border-strokedark">
                  <td className="px-4 py-3">
                    <input value={x.key} onChange={(e) => setTier(i, 'key', e.target.value)} className={input} />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={0} value={x.from} onChange={(e) => setTier(i, 'from', e.target.value)} className={input} />
                  </td>
                  <td className="px-4 py-3">
                    <input type="number" min={1} value={x.credit} onChange={(e) => setTier(i, 'credit', e.target.value)} className={input} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Le dernier palier ne se retire pas : une échelle vide est refusée par
                        le serveur, et un programme sans palier ne peut rien promettre. */}
                    {tiers.length > 1 && (
                      <button type="button"
                        onClick={() => setCfg({ ...cfg, tiers: tiers.filter((_, j) => j !== i) })}
                        className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs font-medium hover:border-danger hover:text-danger dark:border-strokedark">
                        {t('passOps.cfg.removeTier')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button type="button"
          onClick={() => setCfg({ ...cfg, tiers: [...tiers, { level: tiers.length + 1, key: '', from: '', credit: '' }] })}
          className="mt-4 rounded border border-stroke px-4 py-2 text-sm font-medium hover:border-primary hover:text-primary dark:border-strokedark">
          {t('passOps.cfg.addTier')}
        </button>

        {/* Aperçu : ce que les six premières mises en service paieront réellement. */}
        {!!preview.length && (
          <div className="mt-5 rounded-sm bg-gray-2 px-4 py-3 dark:bg-meta-4">
            <p className="text-sm text-bodydark2">{t('passOps.cfg.preview')}</p>
            <p className="mt-1.5 font-medium text-black dark:text-white">
              {preview.map((v) => money(v)).join('  ·  ')}
            </p>
          </div>
        )}

        {!!problems.length && (
          <ul className="mt-5 space-y-2">
            {[...new Set(problems)].map((p) => (
              <li key={p} className="rounded-sm border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{p}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Avertissement + enregistrement */}
      <div className={card}>
        <p className="max-w-[86ch] rounded-sm border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-warning">
          {t('passOps.cfg.warnAmounts')}
        </p>

        {notice && (
          <p role="status" className={`mt-4 rounded-sm border px-4 py-3 text-sm ${
            notice.tone === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'
          }`}>
            {notice.text}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={busy || !!problems.length}
            className="inline-flex items-center gap-2 rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50">
            {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {busy ? t('passOps.cfg.saving') : t('passOps.cfg.save')}
          </button>
          {defaults && (
            <button type="button"
              onClick={() => setCfg({ ...defaults, enabled: cfg.enabled })}
              className="rounded border border-stroke px-4 py-2.5 text-sm font-medium hover:border-primary hover:text-primary dark:border-strokedark">
              {t('passOps.cfg.reset')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PassConfigAdmin;
