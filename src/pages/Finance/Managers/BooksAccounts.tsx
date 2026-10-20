// Module Finance — correspondance des comptes : chaque code de compte utilisé par les écritures
// (2400, 4000, 6200…) est associé, une fois, au compte du plan comptable de Zoho Books. Le plan
// est lu dans Books (portée accountants.READ) et gardé en cache ; la CFO confirme chaque
// association (le compte au même code est proposé, jamais appliqué sans elle).
// Écran à part (finance:post_je) et fenêtre ouverte depuis les deux gestionnaires.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentLoader } from '../../../common/Loader';
import PageTitle from '../../../components/PageTitle';
import Select from '../../../components/Select';
import { Button, InlineError, Modal, StateCard, toast } from '../../../components/ui';
import { TABLE_WRAP } from '../../../components/ui/surface';
import { Card } from '../components';
import { errCode, journalApi, type AccountsPayload } from './api';
import { ManagersHeader, TD, TH, useErrText, useFmt } from './shared';

function useAccounts() {
  const [data, setData] = useState<AccountsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setData(await journalApi.accounts()); setError(null); } catch (e) { setError(errCode(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, setData, error, load };
}

function BooksAccountsPanel({ data, setData, onSaved, onDirty }: { data: AccountsPayload; setData: (d: AccountsPayload) => void; onSaved?: () => void; onDirty?: (d: boolean) => void }) {
  const { t, i18n } = useTranslation();
  const fmt = useFmt();
  const errText = useErrText();
  const fr = i18n.language.startsWith('fr');
  const initial = useMemo(() => Object.fromEntries(data.needed.map((n) => [n.code, data.map[n.code]?.accountId || ''])), [data]);
  const [sel, setSel] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState<'refresh' | 'save' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setSel(initial); }, [initial]);
  const dirty = JSON.stringify(sel) !== JSON.stringify(initial);
  useEffect(() => { onDirty?.(dirty); }, [dirty, onDirty]);
  const canEdit = data.caps.canEdit;

  const refresh = async () => {
    setBusy('refresh'); setErr(null);
    try { setData(await journalApi.refreshAccounts()); toast.success(t('finance.managers.accounts.refreshed')); }
    catch (e) { const c = errCode(e); setErr(c === 'books_scope_missing' ? t('finance.managers.je.reconnectBody') : errText(c)); }
    finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save'); setErr(null);
    try { setData(await journalApi.saveMap(sel, data.version)); toast.success(t('finance.managers.accounts.saved')); onSaved?.(); }
    catch (e) { const c = errCode(e); setErr(c === 'conflict' ? t('finance.managers.errors.conflictReload') : errText(c)); }
    finally { setBusy(null); }
  };
  const applySuggestions = () => setSel((s) => {
    const n = { ...s };
    for (const [code, id] of Object.entries(data.suggestions)) if (!n[code]) n[code] = id;
    return n;
  });
  const options = (data.accounts || []).filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.code ? `${a.code} · ` : ''}${a.name}` }));
  const usageLabel = (u: AccountsPayload['needed'][number]['uses'][number]) =>
    `${t(`finance.managers.accounts.module.${u.module}`)} — ${u.label ? (fr ? u.label.fr : u.label.en) : t(`finance.managers.roles.${u.role}`)}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={refresh} disabled={!!busy}>{busy === 'refresh' ? t('finance.managers.accounts.refreshing') : t('finance.managers.accounts.refresh')}</Button>
        {canEdit && data.accounts && Object.keys(data.suggestions).length > 0 && <Button size="sm" variant="ghost" onClick={applySuggestions}>{t('finance.managers.accounts.applySuggestions')}</Button>}
        <span className="text-[12px] text-body dark:text-bodydark2">
          {data.fetchedAt ? t('finance.managers.accounts.fetchedAt', { when: new Date(data.fetchedAt).toLocaleString(fmt.loc) }) : t('finance.managers.accounts.neverFetched')}
        </span>
      </div>
      {err && <div className="mt-3"><InlineError title={t('finance.managers.accounts.error')} detail={err} /></div>}
      <div className={`${TABLE_WRAP} mt-3`}>
        <table className="w-full border-collapse text-[12.5px] text-black dark:text-white">
          <thead><tr><th className={TH}>{t('finance.managers.accounts.code')}</th><th className={TH}>{t('finance.managers.accounts.usedFor')}</th><th className={TH}>{t('finance.managers.accounts.booksAccount')}</th><th className={TH}>{t('finance.managers.accounts.confirmed')}</th></tr></thead>
          <tbody>
            {data.needed.map((n) => {
              const m = data.map[n.code];
              const sug = data.suggestions[n.code];
              return (
                <tr key={n.code}>
                  <td className={`${TD} font-bold`}>{n.code}</td>
                  <td className={`${TD} whitespace-normal`}>{n.uses.map((u, i) => <div key={i}>{usageLabel(u)}</div>)}</td>
                  <td className={`${TD} min-w-[260px]`}>
                    {data.accounts ? (
                      <Select value={sel[n.code] || ''} disabled={!canEdit} onChange={(v) => setSel((s) => ({ ...s, [n.code]: v }))}
                        aria-label={t('finance.managers.accounts.booksAccountFor', { code: n.code })}
                        placeholder={sug ? t('finance.managers.accounts.suggested', { name: (data.accounts.find((a) => a.id === sug) || { name: '' }).name }) : t('finance.managers.accounts.choose')}
                        options={[{ value: '', label: t('finance.managers.accounts.none') }, ...options]} />
                    ) : <span className="text-body dark:text-bodydark2">{m ? m.accountName : t('finance.managers.accounts.loadFirst')}</span>}
                  </td>
                  <td className={`${TD} text-body dark:text-bodydark2`}>{m ? t('finance.managers.accounts.confirmedBy', { who: m.confirmedBy, when: new Date(m.confirmedAt).toLocaleDateString(fmt.loc) }) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit && data.accounts && (
        <div className="mt-3 flex justify-end"><Button size="sm" variant="primary" onClick={save} disabled={busy === 'save' || !dirty}>{t('finance.managers.accounts.save')}</Button></div>
      )}
    </>
  );
}

/** Écran « Comptes Zoho Books » (route à câbler, permission finance:post_je). */
export default function BooksAccounts() {
  const { t } = useTranslation();
  const errText = useErrText();
  const { data, setData, error, load } = useAccounts();
  if (error === 'perm' || error === 'demo_blocked') return <StateCard kind="empty" title={t(error === 'perm' ? 'finance.managers.accounts.noAccess' : 'finance.managers.demo')} />;
  if (error && !data) return <InlineError title={t('finance.managers.loadError')} detail={errText(error)} onRetry={load} retryLabel={t('finance.managers.retry')} />;
  if (!data) return <ContentLoader label={t('finance.managers.loading')} />;
  return (
    <>
      <PageTitle titleKey="finance.managers.accounts.title" />
      <ManagersHeader title={t('finance.managers.accounts.title')} subtitle={t('finance.managers.accounts.subtitle')} />
      <Card title={t('finance.managers.accounts.mapping')} sub={t('finance.managers.accounts.mappingSub')}>
        <BooksAccountsPanel data={data} setData={setData} />
      </Card>
    </>
  );
}

export function BooksAccountsModal({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { t } = useTranslation();
  const errText = useErrText();
  const { data, setData, error, load } = useAccounts();
  const [dirty, setDirty] = useState(false);
  return (
    <Modal open onClose={onClose} title={t('finance.managers.accounts.title')} size="xl" dirty={dirty}
      footer={<Button size="md" onClick={onClose}>{t('finance.managers.closeWindow')}</Button>}>
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{t('finance.managers.accounts.subtitle')}</p>
      {error && !data && <InlineError title={t('finance.managers.loadError')} detail={errText(error)} onRetry={load} retryLabel={t('finance.managers.retry')} />}
      {!data && !error && <p className="m-0 text-[13px] text-body">{t('finance.managers.loading')}</p>}
      {data && <BooksAccountsPanel data={data} setData={setData} onSaved={onSaved} onDirty={setDirty} />}
    </Modal>
  );
}
