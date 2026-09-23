import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import { API_URL, authHeaders, DELETABLE, statusTone, type HireDetail, type Meta } from './types';

// Fiche d'une embauche. Les boutons suivent le cycle de vie — un seul geste principal à la fois
// (« Envoyer », puis « Contresigner », puis « Créer le représentant ») pour que la prochaine
// étape soit évidente sans lire la chronologie.

const CARD = 'rounded-sm border border-stroke bg-white p-5 shadow-default dark:border-strokedark dark:bg-boxdark sm:p-6';
const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition';
const BTN_PRIMARY = `${BTN} bg-primary text-white hover:bg-opacity-90 disabled:opacity-60`;
const BTN_GHOST = `${BTN} border border-stroke text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4 disabled:opacity-60`;
const BTN_DANGER = `${BTN} border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-60`;
const INPUT =
  'w-full rounded border border-stroke bg-transparent px-4 py-2.5 text-sm text-black outline-none ' +
  'transition focus:border-primary dark:border-form-strokedark dark:bg-form-input dark:text-white';

const HireDetailView = ({ meta, detail, onBack, onEdit, onChanged, onDeleted, onOpen }: {
  meta: Meta;
  detail: HireDetail;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (d: HireDetail) => void;
  onDeleted: () => void;
  onOpen: (id: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const [busy, setBusy] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState('');
  const [padEmpty, setPadEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Aperçu PDF à l'écran (fenêtre dans l'app), plus de nouvel onglet.
  const [viewer, setViewer] = useState<PdfSource | null>(null);

  const d = detail;
  const h = d.hire;
  const canManage = meta.can.manage;
  const isDraft = d.status === 'draft';
  const pending = d.status === 'sent' || d.status === 'viewed';

  const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—');
  const day = (iso?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '—';
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const money = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString(fr ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }));

  const call = async (key: string, path: string, init: RequestInit = {}) => {
    setBusy(key);
    try {
      const res = await fetch(`${API_URL}/api/hr/hires/${d.id}${path}`, {
        ...init,
        headers: { ...authHeaders(), ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || String(res.status));
      return data;
    } catch (e: any) {
      dialog.alert(`${t('hr.detail.actionFailed')} ${e?.message || ''}`);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const pdf = (doc: string, title: string) => setViewer({
    url: `${API_URL}/api/hr/hires/${d.id}/pdf/${doc}`,
    headers: authHeaders(),
    title: `${title} — ${d.name}`,
    filename: `Cluster_${doc}_${d.name.replace(/\s+/g, '_')}.pdf`,
  });

  const send = async (resend = false) => {
    const ok = await dialog.confirm(t(resend ? 'hr.detail.confirmResend' : 'hr.detail.confirmSend', { name: d.name, email: d.email }) as string);
    if (!ok) return;
    const data = await call(resend ? 'resend' : 'send', resend ? '/resend' : '/send', { method: 'POST' });
    if (!data) return;
    onChanged(data);
    if (data.emailed === false && data.link) setManualLink(data.link);
    else dialog.alert(t('hr.detail.sentOk', { email: d.email }) as string);
  };

  const cancel = async () => {
    if (!(await dialog.confirm(t('hr.detail.confirmCancel', { name: d.name }) as string))) return;
    const data = await call('cancel', '/cancel', { method: 'POST', body: JSON.stringify({}) });
    if (data) onChanged(data);
  };

  const remove = async () => {
    if (!(await dialog.confirm(t(isDraft ? 'hr.detail.confirmDelete' : 'hr.detail.confirmDeleteClosed', { name: d.name }) as string))) return;
    const data = await call('delete', '', { method: 'DELETE' });
    if (data) onDeleted();
  };

  const duplicate = async () => {
    const data = await call('duplicate', '/duplicate', { method: 'POST' });
    if (data) onOpen(data.id);
  };

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const data = await call('upload', '/attachments', { method: 'POST', body: fd });
    if (data) onChanged(data);
    if (fileInput.current) fileInput.current.value = '';
  };

  const removeAttachment = async (aid: number) => {
    const data = await call(`att-${aid}`, `/attachments/${aid}`, { method: 'DELETE' });
    if (data) onChanged(data);
  };

  const countersign = async () => {
    const signature = pad.current?.toDataURL();
    if (!signName.trim() || !signature) return;
    const data = await call('countersign', '/countersign', { method: 'POST', body: JSON.stringify({ name: signName.trim(), signature }) });
    if (!data) return;
    setSignOpen(false);
    onChanged(data);
    dialog.alert(t('hr.detail.completedOk') as string);
  };

  const createRep = async () => {
    if (!(await dialog.confirm(t('hr.detail.confirmCreateRep', { name: d.name }) as string))) return;
    const data = await call('rep', '/create-salesperson', { method: 'POST', body: JSON.stringify({}) });
    if (!data) return;
    onChanged(data);
    dialog.alert(t(data.created ? 'hr.detail.repCreated' : 'hr.detail.repLinked', { name: data.salespersonName }) as string);
  };

  // Liste venue du serveur : dossier en anglais = offre + entente EN (signées) + leurs versions
  // françaises de référence.
  const documents = [
    ...(d.documents || []).map((x) => ({
      key: x.key,
      label: `${t(x.kind === 'offer' ? 'hr.detail.docOffer' : 'hr.detail.docAgreement')} (${x.lang.toUpperCase()})${x.reference ? ` — ${t('hr.detail.frReference')}` : ''}`,
    })),
  ];

  return (
    <div className="space-y-5">
      {viewer && <PdfViewerModal source={viewer} onClose={() => setViewer(null)} />}
      <button type="button" onClick={onBack} className="text-sm font-medium text-primary hover:underline">← {t('hr.detail.back')}</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-title-md2 font-bold text-black dark:text-white">{d.name}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone[d.status]}`}>{t(`hr.status.${d.status}`)}</span>
          </div>
          <p className="mt-1 text-sm text-bodydark2">{d.ref} · {h.position} · {t('hr.detail.starts', { date: day(h.startDate) })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && canManage && <button type="button" className={BTN_GHOST} onClick={onEdit}>{t('common.edit')}</button>}
          {isDraft && canManage && (
            <button type="button" className={BTN_PRIMARY} disabled={!!busy} onClick={() => send(false)}>
              {busy === 'send' ? t('hr.detail.sending') : t('hr.detail.send')}
            </button>
          )}
          {pending && canManage && <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={() => send(true)}>{t('hr.detail.resend')}</button>}
          {d.status === 'employee_signed' && meta.can.countersign && (
            <button type="button" className={BTN_PRIMARY} onClick={() => { setSignName(h.supervisorName || ''); setSignOpen(true); }}>{t('hr.detail.countersign')}</button>
          )}
          {d.status === 'completed' && (
            <button type="button" className={BTN_PRIMARY} onClick={() => pdf('signed', t('hr.detail.signedPackage') as string)}>
              {t('hr.detail.viewSigned')}
            </button>
          )}
          {d.status === 'completed' && canManage && !d.salespersonName && (
            <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={createRep}>{t('hr.detail.createRep')}</button>
          )}
        </div>
      </div>

      {manualLink && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">
          <p className="mb-2 font-medium">{t('hr.detail.notEmailed')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs dark:bg-boxdark">{manualLink}</code>
            <button type="button" className={BTN_GHOST} onClick={() => navigator.clipboard?.writeText(manualLink)}>{t('hr.detail.copyLink')}</button>
          </div>
        </div>
      )}

      {d.status === 'employee_signed' && !meta.can.countersign && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">{t('hr.detail.waitingCountersign')}</div>
      )}
      {d.status === 'declined' && (
        <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('hr.detail.declined', { date: dt(d.declinedAt) })}{d.declineReason ? ` — « ${d.declineReason} »` : ''}
        </div>
      )}
      {d.salespersonName && (
        <div className="rounded border border-success/40 bg-success/5 px-4 py-3 text-sm text-black dark:text-white">{t('hr.detail.repLinkedBanner', { name: d.salespersonName })}</div>
      )}

      {signOpen && (
        <div className={CARD + ' border-primary/50'}>
          <h3 className="mb-1 font-semibold text-black dark:text-white">{t('hr.detail.countersignTitle')}</h3>
          <p className="mb-4 text-sm text-bodydark2">{t('hr.detail.countersignHint')}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-black dark:text-white">{t('hr.detail.signerName')}</label>
              <input className={INPUT} value={signName} onChange={(e) => setSignName(e.target.value)} />
              <p className="mt-2 text-xs text-bodydark2">{t('hr.detail.signerNote')}</p>
            </div>
            <SignaturePad ref={pad} clearLabel={t('sign.clear')} placeholder={t('sign.drawHere')} onChange={setPadEmpty} />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setSignOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className={BTN_PRIMARY} disabled={padEmpty || !signName.trim() || busy === 'countersign'} onClick={countersign}>
              {busy === 'countersign' ? t('hr.detail.signing') : t('hr.detail.signAndComplete')}
            </button>
          </div>
        </div>
      )}

      {d.planDiffers.length > 0 && h.includeAgreement && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">
          {t('hr.detail.planDiffers', { fields: d.planDiffers.map((k) => t(`hr.plan.${k}`)).join(', ') })}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Documents */}
          <div className={CARD}>
            <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.detail.documents')}</h3>
            <ul className="divide-y divide-stroke dark:divide-strokedark">
              {documents.map((doc) => (
                <li key={doc.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-sm text-black dark:text-white">📄 {doc.label}</span>
                  <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => pdf(doc.key, doc.label)}>
                    {isDraft ? t('hr.detail.preview') : t('hr.detail.viewSent')}
                  </button>
                </li>
              ))}
              {d.attachments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0 break-all text-sm text-black dark:text-white">📎 {a.filename} <span className="text-xs text-bodydark2">({Math.round(a.size / 1024)} Ko)</span></span>
                  <span className="flex gap-3">
                    <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => pdf(`att-${a.id}`, a.filename)}>{t('hr.detail.open')}</button>
                    {isDraft && canManage && (
                      <button type="button" className="text-sm font-medium text-danger hover:underline" disabled={!!busy} onClick={() => removeAttachment(a.id)}>{t('common.remove')}</button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {isDraft && canManage && (
              <div className="mt-3">
                <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={() => fileInput.current?.click()}>
                  {busy === 'upload' ? t('hr.detail.uploading') : `+ ${t('hr.detail.attach')}`}
                </button>
                <p className="mt-2 text-xs text-bodydark2">{t('hr.detail.attachHint')}</p>
              </div>
            )}
            {!isDraft && <p className="mt-3 text-xs text-bodydark2">{t('hr.detail.lockedHint')}</p>}
          </div>

          {/* Récapitulatif */}
          <div className={CARD}>
            <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.detail.summary')}</h3>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {[
                ...((meta.employers || []).length > 1 ? [[t('hr.form.employer'), (meta.employers || []).find((e) => e.key === (h.employer || 'cluster'))?.legalName || h.employer]] : []),
                [t('hr.form.email'), h.email],
                [t('hr.form.phone'), h.phone || '—'],
                [t('hr.form.address'), [h.addressLine1, h.city, h.province, h.postalCode].filter(Boolean).join(', ') || '—'],
                [t('hr.form.reportsToName'), `${h.reportsToName} (${h.reportsToTitle})`],
                [t('hr.form.supervisorName'), h.supervisorName],
                [t('hr.form.annualSalary'), money(h.annualSalary)],
                [t('hr.form.includeCar'), Number(d.terms.carAllowance) > 0 ? `${money(d.terms.carAllowance)} / ${t('hr.form.perYear')}` : t('hr.form.notIncluded')],
                [t('hr.form.includePhone'), Number(d.terms.phoneAllowance) > 0 ? `${money(d.terms.phoneAllowance)} / ${t('hr.form.perMonth')}` : t('hr.form.notIncluded')],
                [t('hr.form.vacationWeeks'), String(d.terms.vacationWeeks)],
                [t('hr.plan.monthlyQuota'), `${d.plan.monthlyQuota} pts`],
                [t('hr.plan.hardwareRate'), `${d.plan.hardwareRate} % / ${d.plan.hardwareReducedRate} %`],
                [t('hr.plan.monthlyTiers'), [...d.plan.monthlyTiers].sort((a, b) => a.points - b.points).map((x) => `${x.points} → ${money(x.bonus)}`).join(' · ')],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs text-bodydark2">{k}</dt>
                  <dd className="break-words text-black dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {h.notes && <p className="mt-4 whitespace-pre-wrap rounded bg-gray-2 px-3 py-2 text-sm text-black dark:bg-meta-4 dark:text-white">{h.notes}</p>}
          </div>
        </div>

        {/* Chronologie */}
        <div className={CARD}>
          <h3 className="mb-4 font-semibold text-black dark:text-white">{t('hr.detail.timeline')}</h3>
          <ol className="relative space-y-4 border-l border-stroke pl-5 dark:border-strokedark">
            {d.events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium text-black dark:text-white">{t(`hr.events.${e.event}`, { defaultValue: e.event })}</p>
                <p className="text-xs text-bodydark2">{dt(e.at)}{e.actor ? ` · ${e.actor}` : ''}</p>
                {e.detail?.filename && <p className="text-xs text-bodydark2">{e.detail.filename}</p>}
                {e.detail?.typedName && <p className="text-xs text-bodydark2">{t('hr.detail.typed', { name: e.detail.typedName })}{e.ip ? ` · IP ${e.ip}` : ''}</p>}
                {e.event === 'sent' && e.detail?.emailed === false && <p className="text-xs text-warning">{t('hr.detail.notEmailedShort')}</p>}
              </li>
            ))}
          </ol>
          {pending && d.tokenExpiresAt && <p className="mt-4 text-xs text-bodydark2">{t('hr.detail.linkExpires', { date: dt(d.tokenExpiresAt) })}</p>}

          {canManage && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-stroke pt-4 dark:border-strokedark">
              <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={duplicate}>{t('hr.detail.duplicate')}</button>
              {(pending || d.status === 'employee_signed') && <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={cancel}>{t('hr.detail.cancelOffer')}</button>}
              {DELETABLE.includes(d.status) && <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={remove}>{t('common.delete')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HireDetailView;
