// Module Finance — lot F : brouillon de budget généré par l'IA. Bandeau « généré par l'IA — à
// vérifier », par driver la valeur actuelle / la proposition / la raison, cases à cocher et
// « Appliquer la sélection ». JAMAIS d'application automatique ; on dit clairement que des chiffres
// agrégés (sans nom, salaire, courriel ni client) sont envoyés au fournisseur d'IA.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, Modal, StateCard, StatusPill, dialog, toast } from '../../../components/ui';
import { TABLE, TABLE_WRAP, TD, TH, THEAD_ROW } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import { useFinance } from '../FinanceContext';
import { suggestionsApi, errCode, type AiStatus, type Draft } from './api';
import { average, changePct, errorKey, sameValues } from './logic';
import { ConfidencePill, fmtUnit, useDriverLabel } from './shared';
import { CATALOG_UNITS } from './units';

export function AiBudgetModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const F = useFinance();
  const { fmt } = F;
  const label = useDriverLabel();
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([suggestionsApi.aiStatus(), suggestionsApi.aiDrafts()]);
      setStatus(s); setDrafts(d.drafts); setErr(null);
    } catch (e) { setErr(errCode(e)); }
  }, []);
  useEffect(() => { if (open) { setPicked(new Set()); refresh(); } }, [open, refresh]);

  const generate = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await suggestionsApi.aiGenerate(i18n.language && i18n.language.startsWith('fr') ? 'fr' : 'en');
      setDraft(r.draft); setPicked(new Set());
      await refresh();
    } catch (e) { setErr(errCode(e)); } finally { setBusy(false); }
  };

  // Les valeurs actuelles se relisent dans le budget VIVANT (elles ont pu changer depuis le brouillon).
  const live = (key: string, fallback: number[]) => {
    const a = F.drivers.drv[key];
    if (Array.isArray(a) && a.length === 12) return a;
    const d = F.payload.reference.drvDefaults[key];
    return d == null ? fallback : Array(12).fill(+d || 0);
  };
  const rows = useMemo(() => (draft ? draft.drivers.map((d) => {
    const cur = live(d.key, d.current);
    return { d, cur, differs: !sameValues(cur, d.values) };
  }) : []), [draft, F.drivers.drv, F.payload.reference.drvDefaults]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k: string) => setPicked((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const decided = !!draft && draft.status !== 'draft';

  const apply = async () => {
    if (!draft) return;
    const keys = rows.filter((r) => picked.has(r.d.key) && r.differs).map((r) => r.d.key);
    for (const r of rows) if (keys.includes(r.d.key)) F.applyDriverValues(r.d.key, r.d.values);
    try { await suggestionsApi.aiMark(draft.id, 'applied', keys); } catch { /* le budget est déjà modifié ; le marquage n'est qu'un suivi */ }
    toast.success(t('finance.aiBudget.applied', { count: keys.length }));
    setDraft(null); setPicked(new Set());
    refresh();
    onClose();
  };
  const discard = async () => {
    if (!draft) return;
    const yes = await dialog.confirm(t('finance.aiBudget.discardBody'), { title: t('finance.aiBudget.discardTitle'), danger: true, confirmText: t('finance.aiBudget.discardYes'), cancelText: t('finance.aiBudget.discardNo') });
    if (!yes) return;
    try { await suggestionsApi.aiMark(draft.id, 'rejected'); setDraft(null); refresh(); } catch (e) { setErr(errCode(e)); }
  };

  const noQuota = !!status && status.remaining <= 0;
  const genReason = !status ? undefined : !status.available ? t('finance.aiBudget.unavailable') : noQuota ? t('finance.aiBudget.quotaOut') : undefined;
  const applyReason = F.locked ? t('finance.suggestions.detail.locked') : !F.canEdit ? t('finance.suggestions.detail.noEdit') : decided ? t('finance.aiBudget.alreadyDecided') : picked.size === 0 ? t('finance.suggestions.list.pickSome') : undefined;
  const dateOf = (iso: string) => { try { return new Date(iso).toLocaleString(fmt.loc, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
  const draftOpts = drafts.map((d) => ({ value: String(d.id), label: t('finance.aiBudget.draftLabel', { id: d.id, date: dateOf(d.createdAt), status: t(`finance.aiBudget.status.${d.status}`) }) }));

  return (
    <Modal
      open={open} onClose={onClose} size="xl"
      title={t('finance.aiBudget.title')}
      footer={(
        <>
          {draft && !decided && <Button size="md" onClick={discard}>{t('finance.aiBudget.discard')}</Button>}
          <Button size="md" onClick={onClose}>{t('finance.suggestions.list.close')}</Button>
          {draft && <Button size="md" variant="primary" onClick={apply} disabledReason={applyReason}>{t('finance.suggestions.list.apply', { count: picked.size })}</Button>}
        </>
      )}
    >
      <div role="note" className="rounded-xl bg-[rgba(253,176,34,0.18)] px-3.5 py-3 text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">
        <p className="m-0 text-sm font-bold">{t('finance.aiBudget.banner')}</p>
        <p className="m-0 mt-0.5 text-[13px] font-medium">{t('finance.aiBudget.bannerBody')}</p>
      </div>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.aiBudget.privacy')}</p>

      {err && <InlineError title={t('finance.aiBudget.failed')} detail={t(errorKey('aiBudget', err), { perHour: status ? status.limits.perHour : '', perDay: status ? status.limits.perDay : '' })} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={generate} disabled={busy} disabledReason={genReason}>
          {busy ? t('finance.aiBudget.generating') : t('finance.aiBudget.generate')}
        </Button>
        {status && status.available && <span className="text-[13px] text-body dark:text-bodydark2">{t('finance.aiBudget.quota', { remaining: status.remaining, perHour: status.limits.perHour })}</span>}
        {drafts.length > 0 && (
          <>
            <span className="ml-auto text-xs font-bold text-body dark:text-bodydark2">{t('finance.aiBudget.previous')}</span>
            <div className="w-[320px] max-w-full">
              <Select
                value={draft ? String(draft.id) : ''} placeholder={t('finance.aiBudget.pickDraft')}
                onChange={(v) => { setDraft(drafts.find((d) => String(d.id) === v) || null); setPicked(new Set()); }}
                options={draftOpts}
              />
            </div>
          </>
        )}
      </div>
      {busy && <StateCard kind="loading" title={t('finance.aiBudget.generatingLong')} />}

      {draft && !busy && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill family={draft.status === 'draft' ? 'new' : draft.status === 'applied' ? 'ok' : 'neutral'}>{t(`finance.aiBudget.status.${draft.status}`)}</StatusPill>
            <span className="text-[13px] text-body dark:text-bodydark2">{t('finance.aiBudget.generatedAt', { date: dateOf(draft.createdAt) })}</span>
            <Button size="xs" onClick={() => setPicked(new Set(rows.filter((r) => r.differs).map((r) => r.d.key)))}>{t('finance.aiBudget.selectAll')}</Button>
            <Button size="xs" onClick={() => setPicked(new Set())}>{t('finance.suggestions.list.selectNone')}</Button>
          </div>
          {draft.summary && (
            <div className="rounded-xl border border-stroke px-4 py-3 dark:border-strokedark">
              <p className="m-0 text-xs font-bold text-body dark:text-bodydark2">{t('finance.aiBudget.summary')}</p>
              <p className="m-0 mt-1 text-sm text-black dark:text-white">{draft.summary}</p>
            </div>
          )}
          <div className={TABLE_WRAP}>
            <table className={TABLE}>
              <caption className="sr-only">{t('finance.aiBudget.caption')}</caption>
              <thead>
                <tr className={THEAD_ROW}>
                  <th scope="col" className={`${TH} w-10`}><span className="sr-only">{t('finance.suggestions.list.pick')}</span></th>
                  <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.list.col.driver')}</th>
                  <th scope="col" className={`${TH} text-right`}>{t('finance.aiBudget.col.current')}</th>
                  <th scope="col" className={`${TH} text-right`}>{t('finance.aiBudget.col.proposed')}</th>
                  <th scope="col" className={`${TH} text-right`}>{t('finance.suggestions.list.col.change')}</th>
                  <th scope="col" className={`${TH} text-left`}>{t('finance.suggestions.list.col.confidence')}</th>
                  <th scope="col" className={`${TH} text-left`}>{t('finance.aiBudget.col.reason')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const unit = CATALOG_UNITS[r.d.key] || 'count';
                  const c = changePct(average(r.cur), average(r.d.values));
                  return (
                    <tr key={r.d.key}>
                      <td className={TD}>
                        <input type="checkbox" className="h-4 w-4 accent-[#F58345]" checked={picked.has(r.d.key)} disabled={!r.differs || decided}
                          onChange={() => toggle(r.d.key)} aria-label={t('finance.suggestions.list.pickDriver', { driver: label(r.d.key) })} />
                      </td>
                      <td className={`${TD} font-bold`}>{label(r.d.key)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{fmtUnit(fmt, unit, average(r.cur))}</td>
                      <td className={`${TD} text-right font-bold tabular-nums`}>{fmtUnit(fmt, unit, average(r.d.values))}</td>
                      <td className={`${TD} text-right tabular-nums`}>{!r.differs ? t('finance.aiBudget.unchanged') : c == null ? t('finance.suggestions.table.new') : fmt.pct(c, true)}</td>
                      <td className={TD}><ConfidencePill level={r.d.confidence} /></td>
                      <td className={`${TD} min-w-[220px] text-[13px]`}>{r.d.rationale || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="m-0 text-xs text-body dark:text-bodydark2">{t('finance.suggestions.list.averageNote')}</p>
          {draft.rejected.length > 0 && (
            <details className="rounded-xl border border-stroke px-4 py-3 dark:border-strokedark">
              <summary className="cursor-pointer text-sm font-bold text-black dark:text-white">{t('finance.aiBudget.rejectedTitle', { count: draft.rejected.length })}</summary>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-[13px]">
                {draft.rejected.map((x, i) => (
                  <li key={`${x.key}-${i}`}>
                    <span className="font-bold text-black dark:text-white">{x.key ? label(x.key) : '—'}</span>{' '}
                    <span className="text-body dark:text-bodydark2">{t(`finance.aiBudget.reject.${x.reason}`, { defaultValue: x.reason })}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </Modal>
  );
}
