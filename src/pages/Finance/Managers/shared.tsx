// Module Finance — gestionnaires : briques communes aux deux écrans (en-tête, sélecteur de mois,
// carte d'écriture de journal avec l'envoi à Zoho Books, fenêtre d'import Excel, champs).
import React, { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, InlineError, Modal, PageHeader, StatusPill, dialog, toast } from '../../../components/ui';
import { CARD, INPUT, LABEL, TABLE_WRAP } from '../../../components/ui/surface';
import Select from '../../../components/Select';
import { makeFormat } from '../format';
import { Card } from '../components';
import { errCode, journalApi, type ImportPreview, type ImportRow, type Journal, type JournalPost } from './api';
import { addMonths, monthLabel, monthRange } from './logic';

export const useFmt = () => {
  const { i18n } = useTranslation();
  return useMemo(() => makeFormat(i18n.language), [i18n.language]);
};
export type Fmt = ReturnType<typeof makeFormat>;
/** Montant au cent : « 14 000,00 $ » / « $14,000.00 ». */
export const money2 = (fmt: Fmt, v: number) => fmt.fmt(v, '$2');

/** Texte d'une erreur du serveur (code connu, sinon le code brut). */
export function useErrText() {
  const { t } = useTranslation();
  return (code: string) => t(`finance.managers.errors.${code}`, { defaultValue: t('finance.managers.errors.generic', { code }) });
}

// ---------------------------------------------------------------------------- en-tête
// FinanceHeader montre le statut du budget consolidé : ces écrans n'en ont pas, d'où cet en-tête.
export function ManagersHeader({ title, subtitle, actions, toolbar }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; toolbar?: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader section={`${t('finance.managers.section')}`} title={title} subtitle={subtitle} actions={actions} />
      {/* Commandes : barre en carte pleine largeur sous le titre (convention des barres d'outils). */}
      {toolbar && <div className={`${CARD} mb-4 flex flex-wrap items-center gap-2 px-3 py-2.5`}>{toolbar}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------- mois
export function MonthBar({ month, current, range, onChange }: { month: string; current: string; range: { first: string; last: string }; onChange: (m: string) => void }) {
  const { t } = useTranslation();
  const fmt = useFmt();
  const options = monthRange(range.first, range.last).map((m) => ({ value: m, label: `${monthLabel(m, fmt.loc)}${m === current ? ` · ${t('finance.managers.month.current')}` : ''}` }));
  const btn = 'flex h-9 w-9 items-center justify-center rounded-[10px] border border-stroke text-black hover:bg-gray-2 disabled:opacity-40 dark:border-strokedark dark:text-white dark:hover:bg-meta-4';
  return (
    <div className="flex items-center gap-1.5">
      <span className="mr-1 text-[13px] font-bold text-body dark:text-bodydark2">{t('finance.managers.month.label')}</span>
      <button type="button" className={btn} aria-label={t('finance.managers.month.prev')} disabled={month <= range.first} onClick={() => onChange(addMonths(month, -1))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <div className="w-[210px]">
        <Select value={month} onChange={onChange} options={options} aria-label={t('finance.managers.month.label')}
          buttonClassName="h-9 w-full rounded-[10px] border border-stroke bg-transparent px-3 text-left text-[13px] text-black dark:border-strokedark dark:text-white" />
      </div>
      <button type="button" className={btn} aria-label={t('finance.managers.month.next')} disabled={month >= range.last} onClick={() => onChange(addMonths(month, 1))}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      {month !== current && <Button size="sm" variant="ghost" onClick={() => onChange(current)}>{t('finance.managers.month.backToCurrent')}</Button>}
    </div>
  );
}

// ---------------------------------------------------------------------------- champs
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string | null; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={htmlFor} className={LABEL}>{label}</label>
      {children}
      {hint && !error && <p className="m-0 mt-1 text-[12px] text-body dark:text-bodydark2">{hint}</p>}
      {error && <p role="alert" className="m-0 mt-1 text-[12px] font-bold text-[#B42318] dark:text-[#F46060]">{error}</p>}
    </div>
  );
}
export function TextInput({ id, value, onChange, placeholder, inputMode, maxLength = 200 }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'decimal' | 'numeric' | 'text'; maxLength?: number }) {
  return <input id={id} type="text" value={value} inputMode={inputMode} placeholder={placeholder} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full`} />;
}
export function MonthInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="month" value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full`} />;
}
export function DateInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className={`${INPUT} w-full`} />;
}

// ---------------------------------------------------------------------------- écriture de journal
const POST_PILL: Record<JournalPost['status'], 'ok' | 'wait' | 'err' | 'neutral'> = { posted: 'ok', posting: 'wait', failed: 'err', voided: 'neutral' };

/**
 * Carte « écriture de journal » : lignes Dt / Ct (compte, compte Books associé, montant au cent),
 * état de l'envoi pour la période, aperçu puis envoi (dialog.confirm avec le détail), marquer
 * annulée. Le serveur refait tout le calcul et refuse si l'aperçu est périmé.
 */
export function JournalCard({ journal, title, sub, canPost, post, onDone, onGoAccounts, emptyText }: {
  journal: Journal;
  title: React.ReactNode;
  sub?: React.ReactNode;
  canPost: boolean;
  post: (hash: string) => Promise<unknown>;
  onDone: () => Promise<void> | void;
  onGoAccounts?: () => void;
  emptyText: string;
}) {
  const { t, i18n } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message?: string } | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const fr = i18n.language.startsWith('fr');
  const roleLabel = (r: string) => t(`finance.managers.roles.${r}`);
  const p = journal.post;
  const posted = p && (p.status === 'posted' || p.status === 'posting');
  const scopeMissing = error?.code === 'books_scope_missing';
  const line = (l: Journal['lines'][number]) => `${l.side === 'debit' ? t('finance.managers.je.dr') : t('finance.managers.je.cr')} ${l.code} ${roleLabel(l.role)} — ${money2(fmt, l.amount)}`;

  const blockers: string[] = [];
  if (journal.missingAccounts.length) blockers.push(t('finance.managers.je.missingAccounts', { roles: journal.missingAccounts.map(roleLabel).join(', ') }));
  if (journal.unknownTypes && journal.unknownTypes.length) blockers.push(t('finance.managers.je.unknownTypes', { types: journal.unknownTypes.join(', ') }));
  if (journal.unmapped.length) blockers.push(t('finance.managers.je.unmapped', { codes: journal.unmapped.join(', ') }));

  const onPost = async () => {
    const yes = await dialog.confirm(t('finance.managers.je.confirm', { period: monthLabel(journal.period, fmt.loc), date: journal.date }), {
      title: t('finance.managers.je.confirmTitle'),
      confirmText: t('finance.managers.je.post'),
      details: [
        ...journal.lines.map(line),
        t('finance.managers.je.totals', { dr: money2(fmt, journal.debit), cr: money2(fmt, journal.credit) }),
        t('finance.managers.je.confirmOnce'),
      ],
    });
    if (!yes) return;
    setBusy(true); setError(null);
    try {
      await post(journal.hash);
      toast.success(t('finance.managers.je.posted'));
      await onDone();
    } catch (e: any) {
      const code = errCode(e);
      setError({ code, message: e?.body?.message });
      // Aperçu périmé ou déjà passé ailleurs : on recharge pour montrer l'état réel.
      if (['changed', 'already_posted', 'in_progress'].includes(code)) await onDone();
    } finally { setBusy(false); }
  };

  return (
    <Card title={title} sub={sub} actions={
      <>
        {p && <StatusPill family={POST_PILL[p.status]}>{t(`finance.managers.je.status.${p.status}`)}</StatusPill>}
        {!p && journal.lines.length > 0 && <StatusPill family="neutral">{t('finance.managers.je.status.notPosted')}</StatusPill>}
      </>
    }>
      {journal.lines.length === 0 ? (
        <p className="m-0 text-[13px] text-body dark:text-bodydark2">{emptyText}</p>
      ) : (
        <div className={TABLE_WRAP}>
          <table className="w-full border-collapse text-[14px] text-black dark:text-white">
            <thead>
              <tr className="text-[13px] font-semibold text-body dark:text-bodydark2">
                <th className="border-b border-stroke px-3 py-2 text-left dark:border-strokedark">{t('finance.managers.je.account')}</th>
                <th className="border-b border-stroke px-3 py-2 text-left dark:border-strokedark">{t('finance.managers.je.booksAccount')}</th>
                <th className="border-b border-stroke px-3 py-2 text-right dark:border-strokedark">{t('finance.managers.je.debit')}</th>
                <th className="border-b border-stroke px-3 py-2 text-right dark:border-strokedark">{t('finance.managers.je.credit')}</th>
              </tr>
            </thead>
            <tbody>
              {journal.lines.map((l, i) => (
                <tr key={i}>
                  <td className={`border-b border-stroke/60 px-3 py-1.5 dark:border-strokedark/60 ${l.side === 'credit' ? 'pl-8' : ''}`}>
                    <span className="font-bold">{l.side === 'debit' ? t('finance.managers.je.dr') : t('finance.managers.je.cr')}</span> {roleLabel(l.role)} <span className="text-body dark:text-bodydark2">({l.code || t('finance.managers.je.noCode')})</span>
                  </td>
                  <td className="border-b border-stroke/60 px-3 py-1.5 text-body dark:border-strokedark/60 dark:text-bodydark2">
                    {l.books ? l.books.accountName : <span className="font-bold text-[#B54708] dark:text-[#FDB022]">{t('finance.managers.je.notMapped')}</span>}
                  </td>
                  <td className="border-b border-stroke/60 px-3 py-1.5 text-right tabular-nums dark:border-strokedark/60">{l.side === 'debit' ? money2(fmt, l.amount) : ''}</td>
                  <td className="border-b border-stroke/60 px-3 py-1.5 text-right tabular-nums dark:border-strokedark/60">{l.side === 'credit' ? money2(fmt, l.amount) : ''}</td>
                </tr>
              ))}
              <tr className="font-bold [&>td]:border-b-[3px] [&>td]:border-b-[#141414] [&>td]:[border-bottom-style:double] dark:[&>td]:border-b-white">
                <td className="px-3 py-1.5" colSpan={2}>{t('finance.managers.je.total')} {journal.balanced && <span className="ml-1 font-normal text-[#067647] dark:text-[#57D193]">· {t('finance.managers.je.balanced')}</span>}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money2(fmt, journal.debit)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{money2(fmt, journal.credit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* État de l'envoi pour la période */}
      {p && (
        <p className="m-0 mt-3 text-[13px] text-body dark:text-bodydark2">
          {p.status === 'posted' && t('finance.managers.je.postedInfo', { ref: p.reference, number: p.booksEntryNumber || p.booksJournalId, who: p.postedBy, when: p.postedAt ? new Date(p.postedAt).toLocaleString(fmt.loc) : '' })}
          {p.status === 'posting' && t('finance.managers.je.postingInfo', { who: p.postedBy })}
          {p.status === 'failed' && t('finance.managers.je.failedInfo', { error: p.error || '' })}
        </p>
      )}
      {journal.changedSincePost && (
        <p role="status" className="m-0 mt-2 rounded-xl bg-[rgba(253,176,34,0.18)] px-3 py-2.5 text-[13px] font-medium text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">
          {t('finance.managers.je.changedSincePost')}
        </p>
      )}
      {blockers.length > 0 && journal.lines.length > 0 && !posted && (
        <div role="status" className="mt-3 rounded-xl bg-[rgba(253,176,34,0.18)] px-3 py-2.5 text-[13px] text-[#B54708] dark:bg-[rgba(253,176,34,0.16)] dark:text-[#FDB022]">
          {blockers.map((b) => <p key={b} className="m-0">{b}</p>)}
          {journal.unmapped.length > 0 && onGoAccounts && <Button size="xs" variant="link" onClick={onGoAccounts}>{t('finance.managers.je.goAccounts')}</Button>}
        </div>
      )}
      {scopeMissing && (
        <div className="mt-3"><InlineError title={t('finance.managers.je.reconnectTitle')} detail={t('finance.managers.je.reconnectBody')} /></div>
      )}
      {error && !scopeMissing && (
        <div className="mt-3"><InlineError title={errText(error.code)} detail={error.message} /></div>
      )}

      {canPost && journal.lines.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!posted && (
            <Button size="sm" variant="primary" onClick={onPost} disabled={busy || blockers.length > 0}>
              {busy ? t('finance.managers.je.posting') : p?.status === 'failed' ? t('finance.managers.je.retry') : t('finance.managers.je.previewPost')}
            </Button>
          )}
          {p && p.status !== 'voided' && (
            <Button size="sm" variant="ghost" onClick={() => setVoidOpen(true)}>{t('finance.managers.je.markVoided')}</Button>
          )}
          <span className="text-[12px] text-body dark:text-bodydark2">{t('finance.managers.je.dateNote', { date: journal.date })}</span>
        </div>
      )}
      {!canPost && journal.lines.length > 0 && <p className="m-0 mt-3 text-[12px] text-body dark:text-bodydark2">{t('finance.managers.je.noPostPerm')}</p>}

      {journal.history.some((h) => h.status === 'voided') && (
        <details className="mt-3 text-[13.5px] text-body dark:text-bodydark2">
          <summary className="cursor-pointer">{t('finance.managers.je.history')}</summary>
          <ul className="m-0 mt-1 list-none p-0">
            {journal.history.filter((h) => h.status === 'voided').map((h) => (
              <li key={h.id}>{t('finance.managers.je.voidedInfo', { ref: h.reference, who: h.voidedBy, when: h.voidedAt ? new Date(h.voidedAt).toLocaleDateString(fmt.loc) : '', reason: h.voidReason })}</li>
            ))}
          </ul>
        </details>
      )}

      {p && <VoidModal open={voidOpen} post={p} fr={fr} onClose={() => setVoidOpen(false)} onDone={async () => { setVoidOpen(false); setError(null); await onDone(); }} />}
    </Card>
  );
}

function VoidModal({ open, post, onClose, onDone }: { open: boolean; post: JournalPost; fr: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (reason.trim().length < 3) { setErr(t('finance.managers.errors.bad_reason')); return; }
    setBusy(true); setErr(null);
    try { await journalApi.void(post.id, reason.trim()); toast.success(t('finance.managers.je.voided')); setReason(''); await onDone(); }
    catch (e) { setErr(errText(errCode(e))); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('finance.managers.je.voidTitle')} size="sm" dirty={!!reason.trim() && !busy}
      footer={<><Button size="md" onClick={onClose}>{t('finance.managers.cancel')}</Button><Button size="md" variant="danger" onClick={submit} disabled={busy}>{t('finance.managers.je.markVoided')}</Button></>}>
      <p className="m-0 text-[13px] text-black dark:text-white">{t('finance.managers.je.voidBody', { ref: post.reference, number: post.booksEntryNumber || '—' })}</p>
      <Field label={t('finance.managers.je.voidReason')} error={err} htmlFor="void-reason">
        <textarea id="void-reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className={`${INPUT} h-auto w-full py-2`} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------- import Excel
/**
 * Import en deux temps : le serveur lit et valide le fichier (aperçu ligne par ligne), la CFO
 * coche ce qu'elle garde (les doublons probables sont décochés), puis confirme ; le serveur
 * revalide tout et enregistre tout ou rien.
 */
export function ImportModal({ open, onClose, title, preview, confirm, onTemplate, columns, onDone }: {
  open: boolean;
  onClose: () => void;
  title: string;
  preview: (f: File) => Promise<ImportPreview>;
  confirm: (rows: Record<string, unknown>[]) => Promise<{ imported: number }>;
  onTemplate: () => Promise<void>;
  columns: { key: string; label: string; render?: (row: ImportRow) => React.ReactNode }[];
  onDone: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const errText = useErrText();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reset = () => { setPv(null); setKeep(new Set()); setErr(null); if (fileRef.current) fileRef.current.value = ''; };
  const close = () => { reset(); onClose(); };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const p = await preview(f);
      setPv(p);
      setKeep(new Set(p.rows.map((r, i) => (!r.errors.length && !r.warnings.includes('duplicate') ? i : -1)).filter((i) => i >= 0)));
    } catch (e) { setErr(errText(errCode(e))); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!pv) return;
    const rows = pv.rows.filter((_, i) => keep.has(i)).map((r) => r.body);
    if (!rows.length) return;
    setBusy(true); setErr(null);
    try {
      const r = await confirm(rows);
      toast.success(t('finance.managers.import.done', { n: r.imported }));
      reset(); onClose(); await onDone();
    } catch (e) { setErr(errText(errCode(e))); }
    finally { setBusy(false); }
  };
  const toggle = (i: number) => setKeep((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  return (
    <Modal open={open} onClose={close} title={title} size="xl" dirty={!!pv && keep.size > 0 && !busy}
      footer={<>
        <Button size="md" onClick={close}>{t('finance.managers.cancel')}</Button>
        {pv && <Button size="md" variant="primary" onClick={submit} disabled={busy || keep.size === 0}>{t('finance.managers.import.confirm', { n: keep.size })}</Button>}
      </>}>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.import.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onTemplate().catch((e) => setErr(errText(errCode(e))))}>{t('finance.managers.import.template')}</Button>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-[10px] border border-strokestrong px-3 text-[13px] font-bold text-black hover:bg-gray-2 dark:border-graydark dark:text-white dark:hover:bg-meta-4">
          {pv ? t('finance.managers.import.another') : t('finance.managers.import.choose')}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {busy && <span className="text-[13px] text-body dark:text-bodydark2">{t('finance.managers.import.reading')}</span>}
      </div>
      {err && <InlineError title={err} />}
      {pv && (
        <>
          <p className="m-0 text-[13px] text-black dark:text-white">{t('finance.managers.import.summary', { sheet: pv.sheet, valid: pv.valid, invalid: pv.invalid })}</p>
          <div className={`${TABLE_WRAP} max-h-[50vh] overflow-y-auto`}>
            <table className="w-full border-collapse text-[14px] text-black dark:text-white">
              <thead className="sticky top-0 bg-white dark:bg-boxdark">
                <tr className="text-[13px] font-semibold text-body dark:text-bodydark2">
                  <th className="border-b border-stroke px-2 py-2 text-left dark:border-strokedark"><span className="sr-only">{t('finance.managers.import.keep')}</span></th>
                  <th className="border-b border-stroke px-2 py-2 text-left dark:border-strokedark">{t('finance.managers.import.line')}</th>
                  {columns.map((c) => <th key={c.key} className="border-b border-stroke px-2 py-2 text-left dark:border-strokedark">{c.label}</th>)}
                  <th className="border-b border-stroke px-2 py-2 text-left dark:border-strokedark">{t('finance.managers.import.check')}</th>
                </tr>
              </thead>
              <tbody>
                {pv.rows.map((r, i) => (
                  <tr key={r.line} className={r.errors.length ? 'bg-[rgba(244,96,96,0.06)]' : ''}>
                    <td className="border-b border-stroke/60 px-2 py-1.5 dark:border-strokedark/60">
                      <input type="checkbox" aria-label={t('finance.managers.import.keepLine', { line: r.line })} disabled={r.errors.length > 0} checked={keep.has(i)} onChange={() => toggle(i)} />
                    </td>
                    <td className="border-b border-stroke/60 px-2 py-1.5 tabular-nums dark:border-strokedark/60">{r.line}</td>
                    {columns.map((c) => <td key={c.key} className="whitespace-nowrap border-b border-stroke/60 px-2 py-1.5 dark:border-strokedark/60">{c.render ? c.render(r) : String(r.body[c.key] ?? '')}</td>)}
                    <td className="border-b border-stroke/60 px-2 py-1.5 dark:border-strokedark/60">
                      {r.errors.map((e) => <span key={e} className="mr-1 inline-block font-bold text-[#B42318] dark:text-[#F46060]">{errText(e)}</span>)}
                      {r.warnings.includes('duplicate') && <span className="font-bold text-[#B54708] dark:text-[#FDB022]">{t('finance.managers.import.duplicate')}</span>}
                      {!r.errors.length && !r.warnings.length && <span className="text-[#067647] dark:text-[#57D193]">{t('finance.managers.import.ok')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------- tableau
export const TH = 'whitespace-nowrap border-b border-stroke px-2.5 py-2 text-left text-[13px] font-semibold text-body dark:border-strokedark dark:text-bodydark2';
export const THR = `${TH} text-right`;
export const TD = 'whitespace-nowrap border-b border-stroke/60 px-2.5 py-1.5 tabular-nums dark:border-strokedark/60';
export const TDR = `${TD} text-right`;

/** Petit bouton d'action dans une ligne de tableau. */
export function RowButton({ onClick, children, label, danger }: { onClick: () => void; children: React.ReactNode; label?: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`h-7 rounded-lg border px-2 text-[12px] font-bold ${danger ? 'border-[rgba(244,96,96,0.5)] text-[#B42318] hover:bg-[rgba(244,96,96,0.08)] dark:text-[#F46060]' : 'border-stroke text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4'}`}>
      {children}
    </button>
  );
}
