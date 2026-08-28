import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { dialog } from '../../lib/dialog';
import type { LeadRule, LeadRep, LeadSettings } from '../Leads/types';
import { authHeaders, LEAD_SOURCES } from '../Leads/types';

const API_URL = import.meta.env.VITE_API_URL;

const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const LABEL = 'mb-2 block text-sm font-medium text-black dark:text-white';
const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';
const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark';

// Une liste de valeurs saisie en texte libre séparé par des virgules. Un composant à jetons
// serait plus joli, mais ces listes sont courtes, rarement modifiées, et souvent COLLÉES depuis
// une feuille de calcul — le texte libre accepte le collage, un champ à jetons non.
const listToText = (v?: string[]) => (Array.isArray(v) ? v.join(', ') : '');
const textToList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const emptyRule = (): Partial<LeadRule> => ({
  name: '', is_active: true,
  match_sources: [], match_provinces: [], match_languages: [], match_business_types: [], match_postal_prefix: [],
  target_reps: [],
});

const LeadsAdmin = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'rules' | 'rotation' | 'automation'>('rules');

  const [rules, setRules] = useState<LeadRule[]>([]);
  const [rotation, setRotation] = useState<LeadRep[]>([]);
  const [settings, setSettings] = useState<LeadSettings | null>(null);
  const [meta, setMeta] = useState<{ webhookUrl: string; webhookSecretSet: boolean; webhookSecretVar: string; exampleCallback: string } | null>(null);
  const [editing, setEditing] = useState<Partial<LeadRule> | null>(null);
  const [saving, setSaving] = useState(false);

  const [sim, setSim] = useState({ source: 'website', province: 'QC', language: 'fr', businessType: '', postalCode: '' });
  const [simOut, setSimOut] = useState<{ trace: any[]; result: any } | null>(null);

  const loadRules = () =>
    fetch(`${API_URL}/api/admin/lead-rules`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { rules: [], rotation: [] }))
      .then((d) => {
        setRules(d.rules || []);
        setRotation((d.rotation || []).map((r: any) => ({ ...r, name: r.rep_name })));
      })
      .catch(() => {});

  const loadSettings = () =>
    fetch(`${API_URL}/api/admin/lead-settings`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setSettings(d.settings); setMeta(d); } })
      .catch(() => {});

  useEffect(() => { loadRules(); loadSettings(); }, []);

  // ── Règles ────────────────────────────────────────────────────────────────
  const saveRule = async () => {
    if (!editing?.name?.trim()) { dialog.alert(t('admin.leads.rules.nameRequired') as string); return; }
    setSaving(true);
    try {
      const body = {
        name: editing.name,
        isActive: editing.is_active !== false,
        matchSources: editing.match_sources || [],
        matchProvinces: editing.match_provinces || [],
        matchLanguages: editing.match_languages || [],
        matchBusinessTypes: editing.match_business_types || [],
        matchPostalPrefix: editing.match_postal_prefix || [],
        targetReps: editing.target_reps || [],
      };
      const res = await fetch(
        editing.id ? `${API_URL}/api/admin/lead-rules/${editing.id}` : `${API_URL}/api/admin/lead-rules`,
        { method: editing.id ? 'PUT' : 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) throw new Error();
      setEditing(null);
      await loadRules();
    } catch { dialog.alert(t('admin.leads.saveError') as string); }
    finally { setSaving(false); }
  };

  const deleteRule = async (r: LeadRule) => {
    if (!(await dialog.confirm(t('admin.leads.rules.confirmDelete', { name: r.name }) as string))) return;
    await fetch(`${API_URL}/api/admin/lead-rules/${r.id}`, { method: 'DELETE', headers: authHeaders() });
    await loadRules();
  };

  // L'ORDRE est la logique : la première règle qui correspond gagne. On réordonne la liste
  // COMPLÈTE en une requête — deux déplacements concurrents ne peuvent pas laisser deux règles
  // à la même position.
  const move = async (idx: number, dir: -1 | 1) => {
    const next = [...rules];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setRules(next);
    await fetch(`${API_URL}/api/admin/lead-rules/reorder`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: next.map((r) => r.id) }),
    });
    await loadRules();
  };

  const simulate = async () => {
    const res = await fetch(`${API_URL}/api/admin/lead-rules/simulate`, {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(sim),
    });
    setSimOut(res.ok ? await res.json() : null);
  };

  // ── Tour de rôle ──────────────────────────────────────────────────────────
  const saveRotation = async (next: LeadRep[]) => {
    setRotation(next);
    await fetch(`${API_URL}/api/admin/lead-rotation`, {
      method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ reps: next.map((r) => ({ repName: r.name, isActive: r.in_rotation, awayUntil: r.away_until })) }),
    });
    await loadRules();
  };

  // ── Automatisations ───────────────────────────────────────────────────────
  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/lead-settings`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'error');
      const d = await res.json();
      setMeta((m) => (m ? { ...m, exampleCallback: d.exampleCallback } : m));
      dialog.alert(t('admin.leads.saved') as string);
    } catch (e: any) { dialog.alert(e?.message || (t('admin.leads.saveError') as string)); }
    finally { setSaving(false); }
  };

  const set = <K extends keyof LeadSettings>(k: K, v: LeadSettings[K]) =>
    setSettings((s) => (s ? { ...s, [k]: v } : s));

  const Toggle = ({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) => (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <span className="relative mt-0.5 inline-block h-5 w-9 shrink-0">
        <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className={`block h-5 w-9 rounded-full transition ${on ? 'bg-primary' : 'bg-bodydark2/40'}`} />
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-black dark:text-white">{label}</span>
        {hint && <span className="block text-xs text-bodydark2">{hint}</span>}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="inline-flex w-fit rounded-sm border border-stroke bg-white p-1 shadow-default dark:border-strokedark dark:bg-boxdark">
        {(['rules', 'rotation', 'automation'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`rounded-sm px-4 py-2 text-sm font-medium transition-colors ${tab === k ? 'bg-primary text-white' : 'text-bodydark2 hover:text-black dark:hover:text-white'}`}>
            {t(`admin.leads.tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* ── RÈGLES ─────────────────────────────────────────────────────────── */}
      {tab === 'rules' && (
        <>
          <div className={CARD}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.rules.title')}</h3>
                <p className="mt-0.5 text-xs text-body">{t('admin.leads.rules.hint')}</p>
              </div>
              <button type="button" onClick={() => setEditing(emptyRule())} className="rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
                {t('admin.leads.rules.add')}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-auto">
                <thead>
                  <tr className="bg-gray-2 text-left dark:bg-meta-4">
                    <th className="w-16 whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">#</th>
                    <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('admin.leads.rules.name')}</th>
                    <th className="px-4 py-3 text-sm font-medium text-black dark:text-white">{t('admin.leads.rules.criteria')}</th>
                    <th className="px-4 py-3 text-sm font-medium text-black dark:text-white">{t('admin.leads.rules.targets')}</th>
                    <th className="sticky right-0 bg-gray-2 px-4 py-3 dark:bg-meta-4" />
                  </tr>
                </thead>
                <tbody>
                  {!rules.length && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-bodydark2">{t('admin.leads.rules.empty')}</td></tr>
                  )}
                  {rules.map((r, i) => {
                    const crit = [
                      r.match_sources?.length ? `${t('leads.columns.source')}: ${r.match_sources.join('/')}` : null,
                      r.match_provinces?.length ? `${t('leads.field.province')}: ${r.match_provinces.join('/')}` : null,
                      r.match_languages?.length ? `${t('leads.field.language')}: ${r.match_languages.join('/')}` : null,
                      r.match_business_types?.length ? `${t('leads.field.businessType')}: ${r.match_business_types.join('/')}` : null,
                      r.match_postal_prefix?.length ? `${t('leads.field.postalCode')}: ${r.match_postal_prefix.join('/')}` : null,
                    ].filter(Boolean);
                    return (
                      <tr key={r.id} className={`border-t border-stroke dark:border-strokedark ${r.is_active ? '' : 'opacity-50'}`}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center gap-1">
                            <span className="text-sm text-bodydark2">{i + 1}</span>
                            <span className="flex flex-col">
                              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-bodydark2 hover:text-black disabled:opacity-30 dark:hover:text-white" aria-label={t('admin.leads.rules.moveUp') as string}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m6 15 6-6 6 6" /></svg>
                              </button>
                              <button type="button" onClick={() => move(i, 1)} disabled={i === rules.length - 1} className="text-bodydark2 hover:text-black disabled:opacity-30 dark:hover:text-white" aria-label={t('admin.leads.rules.moveDown') as string}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
                              </button>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-black dark:text-white">{r.name}</p>
                          {!r.is_active && <p className="text-xs text-bodydark2">{t('admin.leads.rules.inactive')}</p>}
                        </td>
                        <td className="px-4 py-3 text-xs text-bodydark2">
                          {crit.length ? crit.join(' · ') : <span className="text-warning">{t('admin.leads.rules.catchAll')}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-black dark:text-white">
                          {r.target_reps?.length ? r.target_reps.join(', ') : <span className="text-danger">{t('admin.leads.rules.noTarget')}</span>}
                        </td>
                        <td className="sticky right-0 bg-white px-4 py-3 text-right dark:bg-boxdark">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing({ ...r })} className="whitespace-nowrap rounded border border-stroke px-3 py-1.5 text-xs font-medium text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                              {t('common.edit')}
                            </button>
                            <button type="button" onClick={() => deleteRule(r)} className="rounded border border-stroke px-2 py-1.5 text-danger hover:bg-danger/10 dark:border-strokedark" aria-label={t('common.delete') as string}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-body">{t('admin.leads.rules.fallbackNote')}</p>
          </div>

          {/* Une règle mal ordonnée est invisible autrement : on ne s'en aperçoit qu'à la
              première vraie piste partie chez la mauvaise personne. */}
          <div className={CARD}>
            <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.simulate.title')}</h3>
            <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.simulate.hint')}</p>
            <div className="grid gap-3 sm:grid-cols-5">
              <Select buttonClassName={SELECT_CLS} value={sim.source} onChange={(v) => setSim({ ...sim, source: v })}
                options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`leads.source.${s}`) as string }))} />
              <input className={INPUT} value={sim.province} onChange={(e) => setSim({ ...sim, province: e.target.value })} placeholder={t('leads.field.province') as string} />
              <Select buttonClassName={SELECT_CLS} value={sim.language} onChange={(v) => setSim({ ...sim, language: v })}
                options={[{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }]} />
              <input className={INPUT} value={sim.businessType} onChange={(e) => setSim({ ...sim, businessType: e.target.value })} placeholder={t('leads.field.businessType') as string} />
              <input className={INPUT} value={sim.postalCode} onChange={(e) => setSim({ ...sim, postalCode: e.target.value })} placeholder={t('leads.field.postalCode') as string} />
            </div>
            <button type="button" onClick={simulate} className="mt-3 rounded bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90">
              {t('admin.leads.simulate.run')}
            </button>

            {simOut && (
              <div className="mt-4 rounded-sm bg-gray-2 px-4 py-3 dark:bg-meta-4">
                <p className="text-sm text-black dark:text-white">
                  {simOut.result?.repName
                    ? <>
                        {t('admin.leads.simulate.result')}: <strong>{simOut.result.repName}</strong>
                        <span className="text-bodydark2">
                          {' — '}
                          {simOut.result.via === 'rule' ? t('leads.viaRule', { rule: simOut.result.ruleName }) : t('leads.viaRotation')}
                        </span>
                      </>
                    : <span className="text-warning">{t('admin.leads.simulate.noRep')}</span>}
                </p>
                <ul className="mt-3 space-y-1 text-xs">
                  {simOut.trace.map((r) => (
                    <li key={r.id} className={r.matches ? 'text-success' : 'text-bodydark2'}>
                      {r.matches ? '✓' : '·'} {r.position}. {r.name}
                      {!r.isActive && ` (${t('admin.leads.rules.inactive')})`}
                      {r.matches && !r.targetReps?.length && ` — ${t('admin.leads.rules.noTarget')}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── TOUR DE RÔLE ───────────────────────────────────────────────────── */}
      {tab === 'rotation' && (
        <div className={CARD}>
          <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.rotation.title')}</h3>
          <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.rotation.hint')}</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] table-auto">
              <thead>
                <tr className="bg-gray-2 text-left dark:bg-meta-4">
                  <th className="px-4 py-3 text-sm font-medium text-black dark:text-white">{t('leads.columns.rep')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('admin.leads.rotation.inPool')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-sm font-medium text-black dark:text-white">{t('admin.leads.rotation.awayUntil')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-black dark:text-white">{t('admin.leads.rotation.lastAssigned')}</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-black dark:text-white">{t('admin.leads.rotation.count')}</th>
                </tr>
              </thead>
              <tbody>
                {rotation.map((r, i) => (
                  <tr key={r.name} className="border-t border-stroke dark:border-strokedark">
                    <td className="px-4 py-3 text-sm font-medium text-black dark:text-white">{r.name}</td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={r.in_rotation}
                        onChange={(e) => {
                          const next = [...rotation];
                          next[i] = { ...r, in_rotation: e.target.checked };
                          saveRotation(next);
                        }}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={r.away_until ? String(r.away_until).slice(0, 10) : ''}
                        onChange={(e) => {
                          const next = [...rotation];
                          next[i] = { ...r, away_until: e.target.value || null };
                          saveRotation(next);
                        }}
                        className="rounded border border-stroke bg-transparent px-3 py-1.5 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-meta-4 dark:text-white"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-bodydark2">
                      {r.last_assigned_at ? new Date(r.last_assigned_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-black dark:text-white">{r.assigned_count}</td>
                  </tr>
                ))}
                {!rotation.length && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-bodydark2">{t('admin.leads.rotation.empty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-body">{t('admin.leads.rotation.fairnessNote')}</p>
        </div>
      )}

      {/* ── AUTOMATISATIONS ────────────────────────────────────────────────── */}
      {tab === 'automation' && settings && (
        <>
          <div className={CARD}>
            <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.automation.title')}</h3>
            <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.automation.hint')}</p>

            <Toggle on={settings.callbackEnabled} onChange={(v) => set('callbackEnabled', v)}
              label={t('admin.leads.automation.callback')} hint={t('admin.leads.automation.callbackHint')} />
            {settings.callbackEnabled && (
              <div className="mb-2 ml-12 grid max-w-2xl gap-4 sm:grid-cols-3">
                <div>
                  <label className={LABEL}>{t('admin.leads.automation.callbackType')}</label>
                  <Select buttonClassName={SELECT_CLS} value={settings.callbackType} onChange={(v) => set('callbackType', v as 'call' | 'task')}
                    options={[{ value: 'call', label: t('admin.leads.automation.typeCall') as string }, { value: 'task', label: t('admin.leads.automation.typeTask') as string }]} />
                </div>
                <div>
                  <label className={LABEL}>{t('admin.leads.automation.delay')}</label>
                  <input className={INPUT} type="number" min="0" max="168" value={settings.callbackDelayHours}
                    onChange={(e) => set('callbackDelayHours', Number(e.target.value))} />
                </div>
                <div>
                  <label className={LABEL}>{t('admin.leads.automation.hours')}</label>
                  <div className="flex items-center gap-2">
                    <input className={INPUT} type="number" min="0" max="23" value={settings.businessHours.start}
                      onChange={(e) => set('businessHours', { ...settings.businessHours, start: Number(e.target.value) })} />
                    <span className="text-bodydark2">–</span>
                    <input className={INPUT} type="number" min="1" max="24" value={settings.businessHours.end}
                      onChange={(e) => set('businessHours', { ...settings.businessHours, end: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
            )}
            {meta?.exampleCallback && settings.callbackEnabled && (
              <p className="mb-4 ml-12 text-xs text-body">
                {t('admin.leads.automation.example', { when: new Date(meta.exampleCallback).toLocaleString() })}
              </p>
            )}

            <Toggle on={settings.notifyRep} onChange={(v) => set('notifyRep', v)}
              label={t('admin.leads.automation.notifyRep')} hint={t('admin.leads.automation.notifyRepHint')} />
            <Toggle on={settings.notifyMerchant} onChange={(v) => set('notifyMerchant', v)}
              label={t('admin.leads.automation.notifyMerchant')} hint={t('admin.leads.automation.notifyMerchantHint')} />

            {settings.notifyMerchant && (
              <div className="mb-2 ml-12 grid max-w-2xl gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>{t('admin.leads.automation.merchantFrom')}</label>
                  <input className={INPUT} value={settings.merchantFrom} onChange={(e) => set('merchantFrom', e.target.value)}
                    placeholder={t('admin.leads.automation.merchantFromPlaceholder') as string} />
                </div>
                <div>
                  <label className={LABEL}>{t('admin.leads.automation.merchantSite')}</label>
                  <input className={INPUT} value={settings.merchantSiteUrl} onChange={(e) => set('merchantSiteUrl', e.target.value)} />
                </div>
              </div>
            )}

            <div className="mt-4 max-w-xs">
              <label className={LABEL}>{t('admin.leads.automation.reminder')}</label>
              <input className={INPUT} type="number" min="0" max="168" value={settings.reviewReminderHours}
                onChange={(e) => set('reviewReminderHours', Number(e.target.value))} />
              <p className="mt-1 text-xs text-body">{t('admin.leads.automation.reminderHint')}</p>
            </div>

            <button type="button" onClick={saveSettings} disabled={saving} className="mt-5 rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>

          {/* Ces deux champs sont des LISTES DE CHOIX chez Zoho : une valeur absente de la liste
              fait rejeter tout l'enregistrement. D'où le défaut vide, et l'avertissement. */}
          <div className={CARD}>
            <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.zoho.title')}</h3>
            <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.zoho.hint')}</p>
            <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL}>{t('admin.leads.zoho.sourceWebsite')}</label>
                <input className={INPUT} value={settings.leadSourceWebsite} onChange={(e) => set('leadSourceWebsite', e.target.value)} placeholder={t('admin.leads.zoho.leaveEmpty') as string} />
              </div>
              <div>
                <label className={LABEL}>{t('admin.leads.zoho.sourcePhone')}</label>
                <input className={INPUT} value={settings.leadSourcePhone} onChange={(e) => set('leadSourcePhone', e.target.value)} placeholder={t('admin.leads.zoho.leaveEmpty') as string} />
              </div>
              <div>
                <label className={LABEL}>{t('admin.leads.zoho.methodWebsite')}</label>
                <input className={INPUT} value={settings.contactMethodWebsite} onChange={(e) => set('contactMethodWebsite', e.target.value)} />
              </div>
              <div>
                <label className={LABEL}>{t('admin.leads.zoho.methodPhone')}</label>
                <input className={INPUT} value={settings.contactMethodPhone} onChange={(e) => set('contactMethodPhone', e.target.value)} />
              </div>
            </div>
            <p className="mt-3 rounded-sm border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning">
              {t('admin.leads.zoho.picklistWarning')}
            </p>
            <button type="button" onClick={saveSettings} disabled={saving} className="mt-4 rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>

          {/* Ce que l'équipe du site public doit brancher. */}
          <div className={CARD}>
            <h3 className="text-base font-semibold text-black dark:text-white">{t('admin.leads.webhook.title')}</h3>
            <p className="mb-4 mt-0.5 text-xs text-body">{t('admin.leads.webhook.hint')}</p>
            <div className="overflow-x-auto rounded-sm bg-gray-2 px-4 py-3 dark:bg-meta-4">
              <code className="whitespace-pre text-xs text-black dark:text-white">
{`POST ${meta?.webhookUrl || ''}
X-Cluster-Webhook-Secret: <${meta?.webhookSecretVar || 'LEAD_WEBHOOK_SECRET'}>
Content-Type: application/json

{
  "businessName": "Café Merlebleu",
  "contactName":  "Julie Tremblay",
  "contactEmail": "julie@cafemerlebleu.ca",
  "contactPhone": "514-555-0142",
  "city": "Montréal", "province": "QC", "postalCode": "H2J 2K9",
  "language": "fr",
  "businessType": "Restaurant",
  "interest": ["pos", "payments"],
  "notes": "…",
  "sourceDetail": "clusterpos.com — Contact"
}`}
              </code>
            </div>
            <p className="mt-3 text-xs text-body">{t('admin.leads.webhook.tolerant')}</p>
            <p className={`mt-2 text-xs ${meta?.webhookSecretSet ? 'text-success' : 'text-danger'}`}>
              {meta?.webhookSecretSet ? t('admin.leads.webhook.secretSet', { name: meta.webhookSecretVar }) : t('admin.leads.webhook.secretMissing')}
            </p>
          </div>
        </>
      )}

      {/* ── Éditeur de règle ───────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && setEditing(null)} />
          <div role="dialog" aria-modal="true" className="relative my-auto w-full max-w-2xl rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
            <div className="border-b border-stroke px-6 py-4 dark:border-strokedark">
              <h3 className="text-lg font-semibold text-black dark:text-white">
                {editing.id ? t('admin.leads.rules.edit') : t('admin.leads.rules.add')}
              </h3>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <div className="mb-4">
                <label className={LABEL}>{t('admin.leads.rules.name')} *</label>
                <input className={INPUT} value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
              </div>

              <p className="mb-3 text-xs uppercase tracking-wide text-bodydark2">{t('admin.leads.rules.criteria')}</p>
              <p className="mb-3 text-xs text-body">{t('admin.leads.rules.criteriaHint')}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={LABEL}>{t('leads.columns.source')}</label>
                  <input className={INPUT} value={listToText(editing.match_sources)}
                    onChange={(e) => setEditing({ ...editing, match_sources: textToList(e.target.value) })}
                    placeholder="website, phone" />
                </div>
                <div>
                  <label className={LABEL}>{t('leads.field.province')}</label>
                  <input className={INPUT} value={listToText(editing.match_provinces)}
                    onChange={(e) => setEditing({ ...editing, match_provinces: textToList(e.target.value) })}
                    placeholder="QC, ON" />
                </div>
                <div>
                  <label className={LABEL}>{t('leads.field.language')}</label>
                  <input className={INPUT} value={listToText(editing.match_languages)}
                    onChange={(e) => setEditing({ ...editing, match_languages: textToList(e.target.value) })}
                    placeholder="fr, en" />
                </div>
                <div>
                  <label className={LABEL}>{t('leads.field.businessType')}</label>
                  <input className={INPUT} value={listToText(editing.match_business_types)}
                    onChange={(e) => setEditing({ ...editing, match_business_types: textToList(e.target.value) })}
                    placeholder="Restaurant, Retail" />
                </div>
                <div className="sm:col-span-2">
                  <label className={LABEL}>{t('admin.leads.rules.postalPrefix')}</label>
                  <input className={INPUT} value={listToText(editing.match_postal_prefix)}
                    onChange={(e) => setEditing({ ...editing, match_postal_prefix: textToList(e.target.value) })}
                    placeholder="H, J4, K1A" />
                </div>
              </div>

              <p className="mb-3 mt-6 text-xs uppercase tracking-wide text-bodydark2">{t('admin.leads.rules.targets')}</p>
              <p className="mb-3 text-xs text-body">{t('admin.leads.rules.targetsHint')}</p>
              <div className="flex flex-wrap gap-2">
                {rotation.map((r) => {
                  const on = (editing.target_reps || []).some((x) => x.toLowerCase() === r.name.toLowerCase());
                  return (
                    <button
                      key={r.name}
                      type="button"
                      onClick={() => setEditing({
                        ...editing,
                        target_reps: on
                          ? (editing.target_reps || []).filter((x) => x.toLowerCase() !== r.name.toLowerCase())
                          : [...(editing.target_reps || []), r.name],
                      })}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        on ? 'bg-primary text-white' : 'bg-gray-2 text-bodydark2 hover:text-black dark:bg-meta-4 dark:hover:text-white'
                      }`}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>

              <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm text-black dark:text-white">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={editing.is_active !== false}
                  onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
                {t('admin.leads.rules.active')}
              </label>

              <div className="mt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded border border-stroke px-5 py-2.5 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                  {t('common.cancel')}
                </button>
                <button type="button" onClick={saveRule} disabled={saving} className="rounded bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
                  {saving ? t('common.loading') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadsAdmin;
