import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../components/Select';
import { authHeaders, leadFullName, statusTone, type Lead, type LeadRep } from './types';

const API_URL = import.meta.env.VITE_API_URL;

const SELECT_CLS =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-left text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

// L'écran d'examen. C'est le seul endroit de l'application d'où part une écriture dans Zoho ET
// un courriel à un marchand — d'où deux partis pris :
//
// 1. Avant d'accepter, on ÉNUMÈRE ce qui va se produire (fiche Zoho, rappel, deux courriels).
//    Un bouton « Accepter » qui déclenche quatre actions invisibles est un piège.
// 2. Après, on montre le résultat étape par étape. Une acceptation à moitié réussie — fiche
//    créée mais courriel non parti — doit se voir : sans ça, on croit le marchand prévenu alors
//    qu'il attend un appel dont il n'a jamais entendu parler.

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex gap-3 py-1.5 text-sm">
    <span className="w-36 shrink-0 text-bodydark2">{label}</span>
    <span className="min-w-0 break-words text-black dark:text-white">{children || '—'}</span>
  </div>
);

const StepLine = ({ ok, skipped, label, detail }: { ok: boolean; skipped?: string; label: string; detail?: string | null }) => (
  <li className="flex items-start gap-2.5 py-1.5 text-sm">
    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
      ok ? 'bg-success/20 text-success' : skipped ? 'bg-bodydark2/20 text-bodydark2' : 'bg-danger/15 text-danger'
    }`}>
      {ok
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="m20 6-11 11-5-5" /></svg>
        : skipped
        ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M5 12h14" /></svg>
        : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>}
    </span>
    <span className="min-w-0">
      <span className="text-black dark:text-white">{label}</span>
      {detail && <span className="block text-xs text-bodydark2">{detail}</span>}
    </span>
  </li>
);

const LeadDetail = ({ leadId, reps, onClose, onChanged }: {
  leadId: number;
  reps: LeadRep[];
  onClose: () => void;
  onChanged: () => void;
}) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const [lead, setLead] = useState<Lead | null>(null);
  const [history, setHistory] = useState<{ event_type: string; description: string; actor: string; created_at: string }[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const dt = (iso?: string | null, withTime = true) =>
    iso ? new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', {
      day: 'numeric', month: 'short', year: 'numeric',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }) : '—';

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/leads/${leadId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLead(data.lead);
      setHistory(data.history || []);
      setCanReview(!!data.can?.review);
      setRep(data.lead?.assigned?.repName || data.lead?.suggested?.repName || '');
    } catch {
      setNotice({ tone: 'error', text: t('leads.detail.loadFailed') });
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [leadId]);

  const call = async (path: string, body?: any, method = 'POST') => {
    const res = await fetch(`${API_URL}/api/leads/${leadId}${path}`, {
      method,
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || 'error'), { data });
    return data;
  };

  const doAssign = async (name: string) => {
    setRep(name); setBusy('assign'); setNotice(null);
    try { await call('/assign', { repName: name }); await load(); onChanged(); }
    catch { setNotice({ tone: 'error', text: t('leads.detail.assignFailed') }); }
    finally { setBusy(null); }
  };

  const doAccept = async () => {
    setBusy('accept'); setNotice(null);
    try {
      const out = await call('/accept', { repName: rep || undefined });
      await load(); onChanged();
      // Une acceptation À MOITIÉ réussie ne doit pas s'annoncer comme un succès : la fiche Zoho
      // existe, mais si un courriel n'est pas parti, la personne qui a cliqué doit le savoir
      // maintenant — pas le découvrir la semaine prochaine.
      const steps = out?.steps || {};
      const failed = ['callback', 'repEmail', 'merchantEmail']
        .filter((k) => steps[k] && !steps[k].ok && !steps[k].skipped);
      setNotice(failed.length
        ? { tone: 'warn', text: t('leads.detail.acceptedPartial', { n: failed.length }) }
        : { tone: 'ok', text: t('leads.detail.acceptedOk') });
    } catch (e: any) {
      setNotice({
        tone: 'error',
        text: e?.data?.error === 'no_rep' ? t('leads.detail.noRepChosen')
          : e?.data?.error === 'crm_failed' ? t('leads.detail.crmFailed', { detail: e?.data?.detail || '' })
          : t('leads.detail.acceptFailed'),
      });
    } finally { setBusy(null); }
  };

  const doReject = async (asDuplicate: boolean) => {
    setBusy('reject'); setNotice(null);
    try { await call('/reject', { reason, duplicate: asDuplicate }); setRejecting(false); setReason(''); await load(); onChanged(); }
    catch { setNotice({ tone: 'error', text: t('leads.detail.rejectFailed') }); }
    finally { setBusy(null); }
  };

  const doRecheck = async () => {
    setBusy('recheck'); setNotice(null);
    try { await call('/recheck'); await load(); }
    catch { setNotice({ tone: 'error', text: t('leads.detail.recheckFailed') }); }
    finally { setBusy(null); }
  };

  const dupRecords = lead?.duplicate?.records || [];
  const pending = lead && (lead.status === 'new' || lead.status === 'in_review');
  const auto = lead?.automation || {};

  return (
    <div className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" className="relative my-auto w-full max-w-4xl rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        {!lead ? (
          <div className="px-6 py-16 text-center text-sm text-bodydark2">{t('common.loading')}</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4 border-b border-stroke px-6 py-4 dark:border-strokedark">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="truncate text-lg font-semibold text-black dark:text-white">{lead.businessName}</h3>
                  <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${statusTone[lead.status]}`}>
                    {t(`leads.status.${lead.status}`)}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-bodydark2">
                  {lead.refCode} · {t(`leads.source.${lead.source}`)}
                  {lead.sourceDetail ? ` (${lead.sourceDetail})` : ''} · {dt(lead.createdAt)}
                </p>
              </div>
              <button type="button" onClick={onClose} className="shrink-0 text-bodydark2 hover:text-black dark:hover:text-white" aria-label={t('common.close') as string}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 py-5">
              {notice && (
                <div role="status" className={`mb-5 rounded-sm border px-4 py-3 text-sm ${
                  notice.tone === 'ok' ? 'border-success/40 bg-success/10 text-success'
                  : notice.tone === 'warn' ? 'border-warning/50 bg-warning/10 text-warning'
                  : 'border-danger/40 bg-danger/10 text-danger'}`}>{notice.text}</div>
              )}

              {/* Le doublon est signalé mais jamais bloquant : c'est un jugement humain. */}
              {!!dupRecords.length && (
                <div className="mb-5 rounded-sm border border-warning/50 bg-warning/10 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-warning">{t('leads.duplicateFound', { n: dupRecords.length })}</p>
                      <ul className="mt-2 space-y-1 text-xs text-black dark:text-white">
                        {dupRecords.slice(0, 6).map((r) => (
                          <li key={`${r.module}-${r.id}`}>
                            <a href={`https://crm.zoho.com/crm/tab/${r.module}/${r.id}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                              {r.company || r.id}
                            </a>
                            <span className="text-bodydark2"> — {r.module} · {t(`leads.matchedOn.${r.matchedOn}`, { defaultValue: r.matchedOn })}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    {canReview && (
                      <button type="button" onClick={doRecheck} disabled={!!busy} className="shrink-0 whitespace-nowrap rounded border border-warning/50 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-60">
                        {busy === 'recheck' ? t('common.loading') : t('leads.detail.recheck')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionContact')}</p>
                  <Row label={t('leads.field.contact')}>{leadFullName(lead)}{lead.contactTitle ? ` — ${lead.contactTitle}` : ''}</Row>
                  <Row label={t('leads.field.phone')}>
                    {lead.contactPhone ? <a className="text-primary hover:underline" href={`tel:${lead.contactPhone.replace(/[^\d+]/g, '')}`}>{lead.contactPhone}</a> : null}
                  </Row>
                  <Row label={t('leads.field.email')}>
                    {lead.contactEmail ? <a className="text-primary hover:underline" href={`mailto:${lead.contactEmail}`}>{lead.contactEmail}</a> : null}
                  </Row>
                  <Row label={t('leads.field.language')}>{lead.language === 'en' ? 'English' : 'Français'}</Row>
                  <Row label={t('leads.field.location')}>{[lead.city, lead.province, lead.postalCode].filter(Boolean).join(', ')}</Row>
                  <Row label={t('leads.field.website')}>
                    {lead.website ? <a className="text-primary hover:underline" href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : null}
                  </Row>
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-bodydark2">{t('leads.intake.sectionQualification')}</p>
                  <Row label={t('leads.field.businessType')}>{lead.businessType}</Row>
                  <Row label={t('leads.field.locationsCount')}>{lead.locationsCount ?? null}</Row>
                  <Row label={t('leads.field.currentPos')}>{lead.currentPos}</Row>
                  <Row label={t('leads.field.timeline')}>{lead.timeline}</Row>
                  <Row label={t('leads.field.interest')}>
                    {lead.interest?.length ? lead.interest.map((k) => t(`leads.interest.${k}`, { defaultValue: k })).join(', ') : null}
                  </Row>
                  <Row label={t('leads.field.createdBy')}>{lead.createdBy || t('leads.field.fromWebsite')}</Row>
                </div>
              </div>

              {lead.notes && (
                <div className="mt-5">
                  <p className="mb-2 text-xs uppercase tracking-wide text-bodydark2">{t('leads.field.notes')}</p>
                  <p className="whitespace-pre-wrap rounded-sm bg-gray-2 px-4 py-3 text-sm text-black dark:bg-meta-4 dark:text-white">{lead.notes}</p>
                </div>
              )}

              {/* ── Attribution + décision ─────────────────────────────────── */}
              {pending && canReview && (
                <div className="mt-6 rounded-sm border border-stroke px-4 py-4 dark:border-strokedark">
                  <p className="mb-3 text-xs uppercase tracking-wide text-bodydark2">{t('leads.detail.decision')}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('leads.detail.assignTo')}</label>
                      <Select
                        buttonClassName={SELECT_CLS}
                        value={rep}
                        onChange={doAssign}
                        placeholder={t('leads.detail.pickRep') as string}
                        options={reps.map((r) => ({
                          value: r.name,
                          label: r.name + (r.away_until ? ` — ${t('leads.detail.away')}` : r.in_rotation ? '' : ` — ${t('leads.detail.notInRotation')}`),
                        }))}
                      />
                      {lead.suggested && (
                        <p className="mt-1.5 text-xs text-bodydark2">
                          {t('leads.detail.suggestion')}: <strong className="text-black dark:text-white">{lead.suggested.repName}</strong>
                          {' — '}
                          {lead.suggested.via === 'rule' ? t('leads.viaRule', { rule: lead.suggested.ruleName }) : t('leads.viaRotation')}
                        </p>
                      )}
                    </div>

                    {/* Ce que le bouton va RÉELLEMENT déclencher, énuméré avant le clic. */}
                    <div className="rounded-sm bg-gray-2 px-4 py-3 dark:bg-meta-4">
                      <p className="mb-1.5 text-xs font-medium text-black dark:text-white">{t('leads.detail.willHappen')}</p>
                      <ul className="space-y-1 text-xs text-bodydark2">
                        <li>· {t('leads.detail.willCrm')}</li>
                        <li>· {t('leads.detail.willCallback')}</li>
                        <li>· {t('leads.detail.willRepEmail', { rep: rep || '…' })}</li>
                        <li>· {lead.contactEmail ? t('leads.detail.willMerchantEmail', { email: lead.contactEmail }) : t('leads.detail.noMerchantEmail')}</li>
                      </ul>
                    </div>
                  </div>

                  {rejecting ? (
                    <div className="mt-4">
                      <label className="mb-2 block text-sm font-medium text-black dark:text-white">{t('leads.detail.rejectReason')}</label>
                      <input
                        className="w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder={t('leads.detail.rejectReasonPlaceholder') as string}
                        autoFocus
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => { setRejecting(false); setReason(''); }} disabled={!!busy} className="rounded border border-stroke px-4 py-2 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                          {t('common.cancel')}
                        </button>
                        <button type="button" onClick={() => doReject(true)} disabled={!!busy} className="rounded border border-stroke px-4 py-2 text-sm font-medium text-bodydark2 hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:hover:bg-meta-4">
                          {t('leads.detail.markDuplicate')}
                        </button>
                        <button type="button" onClick={() => doReject(false)} disabled={!!busy} className="rounded bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
                          {busy === 'reject' ? t('common.loading') : t('leads.detail.confirmReject')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={() => setRejecting(true)} disabled={!!busy} className="rounded border border-stroke px-4 py-2 text-sm font-medium text-black hover:bg-gray-2 disabled:opacity-60 dark:border-strokedark dark:text-white dark:hover:bg-meta-4">
                        {t('leads.detail.reject')}
                      </button>
                      <button type="button" onClick={doAccept} disabled={!!busy || !rep} className="rounded bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-60">
                        {busy === 'accept' ? t('leads.detail.accepting') : t('leads.detail.accept')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Ce qui s'est réellement produit ─────────────────────────── */}
              {lead.status === 'accepted' && (
                <div className="mt-6 rounded-sm border border-stroke px-4 py-4 dark:border-strokedark">
                  <p className="mb-3 text-xs uppercase tracking-wide text-bodydark2">{t('leads.detail.automation')}</p>
                  <ul>
                    <StepLine
                      ok={!!auto.crm?.ok}
                      label={t('leads.detail.stepCrm')}
                      detail={lead.crm.leadId ? `Zoho ${lead.crm.leadId}${auto.crmRetriedWithoutPicklists ? ` · ${t('leads.detail.retriedPicklists')}` : ''}` : lead.crm.error}
                    />
                    <StepLine
                      ok={!!auto.callback?.ok}
                      skipped={auto.callback?.skipped}
                      label={t('leads.detail.stepCallback', { kind: auto.callback?.kind === 'Tasks' ? t('leads.detail.task') : t('leads.detail.call') })}
                      detail={auto.callback?.ok ? dt(lead.callbackAt) : auto.callback?.skipped ? t('leads.detail.disabled') : auto.callback?.error}
                    />
                    <StepLine
                      ok={!!auto.repEmail?.ok}
                      skipped={auto.repEmail?.skipped}
                      label={t('leads.detail.stepRepEmail')}
                      detail={auto.repEmail?.ok ? auto.repEmail.to : auto.repEmail?.skipped ? t(`leads.detail.skip.${auto.repEmail.skipped}`, { defaultValue: auto.repEmail.skipped }) : auto.repEmail?.error}
                    />
                    <StepLine
                      ok={!!auto.merchantEmail?.ok}
                      skipped={auto.merchantEmail?.skipped}
                      label={t('leads.detail.stepMerchantEmail')}
                      detail={auto.merchantEmail?.ok ? auto.merchantEmail.to : auto.merchantEmail?.skipped ? t(`leads.detail.skip.${auto.merchantEmail.skipped}`, { defaultValue: auto.merchantEmail.skipped }) : auto.merchantEmail?.error}
                    />
                  </ul>

                  <div className="mt-4 border-t border-stroke pt-3 dark:border-strokedark">
                    <Row label={t('leads.field.rep')}>{lead.assigned?.repName}</Row>
                    <Row label={t('leads.detail.zohoLead')}>
                      {lead.crm.leadId
                        ? <a className="text-primary hover:underline" href={`https://crm.zoho.com/crm/tab/Leads/${lead.crm.leadId}`} target="_blank" rel="noreferrer">{lead.crm.leadId}</a>
                        : null}
                    </Row>
                    {/* L'aboutissement, rafraîchi toutes les heures par le worker : c'est la seule
                        ligne qui relie cette piste à de l'argent réel. */}
                    <Row label={t('leads.detail.dealStage')}>
                      {lead.crm.dealStage || (lead.crm.dealId ? lead.crm.dealId : t('leads.detail.notConvertedYet'))}
                    </Row>
                    <Row label={t('leads.detail.depositDate')}>{lead.crm.depositDate ? dt(lead.crm.depositDate, false) : null}</Row>
                    <Row label={t('leads.detail.reviewedBy')}>{lead.reviewedBy} · {dt(lead.reviewedAt)}</Row>
                  </div>
                </div>
              )}

              {(lead.status === 'rejected' || lead.status === 'duplicate') && (
                <div className="mt-6 rounded-sm border border-stroke px-4 py-4 dark:border-strokedark">
                  <Row label={t('leads.detail.reviewedBy')}>{lead.reviewedBy} · {dt(lead.reviewedAt)}</Row>
                  <Row label={t('leads.detail.rejectReason')}>{lead.rejectionReason}</Row>
                </div>
              )}

              {!!history.length && (
                <div className="mt-6">
                  <p className="mb-2 text-xs uppercase tracking-wide text-bodydark2">{t('leads.detail.history')}</p>
                  <ul className="space-y-1.5">
                    {history.map((h, i) => (
                      <li key={i} className="flex gap-3 text-xs">
                        <span className="w-32 shrink-0 text-bodydark2">{dt(h.created_at)}</span>
                        <span className="min-w-0 text-black dark:text-white">
                          {h.description}
                          <span className="text-bodydark2"> — {h.actor}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LeadDetail;
