import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dialog } from '../../lib/dialog';
import SignaturePad, { type SignaturePadHandle } from '../../components/SignaturePad';
import PdfViewerModal, { type PdfSource } from '../../components/PdfViewerModal';
import { Modal, StatusPill } from '../../components/ui';
import { API_URL, authHeaders, DELETABLE, statusFamily, type EmailPreview, type NdaDetail, type NdaMeta } from './types';

// Fiche d'un NDA. Un seul geste principal à la fois : « Envoyer », puis « Contresigner » (le
// signataire de Cluster seulement), puis « NDA signé ».

const CARD = 'rounded-2xl border border-stroke bg-white p-5 dark:border-strokedark dark:bg-boxdark sm:p-6';
const BTN = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 py-2 text-sm font-bold transition';
const BTN_PRIMARY = `${BTN} bg-primary text-[#141414] hover:bg-[#F79C6A] disabled:opacity-60`;
const BTN_GHOST = `${BTN} border border-stroke text-black hover:bg-gray-2 dark:border-strokedark dark:text-white dark:hover:bg-meta-4 disabled:opacity-60`;
const BTN_DANGER = `${BTN} border border-danger/40 text-danger hover:bg-danger/5 disabled:opacity-60`;

const NdaDetailView = ({ meta, detail, onBack, onEdit, onChanged, onDeleted, onOpen }: {
  meta: NdaMeta;
  detail: NdaDetail;
  onBack: () => void;
  onEdit: () => void;
  onChanged: (d: NdaDetail) => void;
  onDeleted: () => void;
  onOpen: (id: string) => void;
}) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const [busy, setBusy] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [signOpen, setSignOpen] = useState(false);
  const [padEmpty, setPadEmpty] = useState(true);
  const pad = useRef<SignaturePadHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [viewer, setViewer] = useState<PdfSource | null>(null);
  const [mail, setMail] = useState<EmailPreview | null>(null);
  const [mailTab, setMailTab] = useState<'party' | 'cc'>('party');

  const d = detail;
  const n = d.nda;
  const canSend = meta.can.send;
  const isDraft = d.status === 'draft';
  const pending = d.status === 'sent' || d.status === 'viewed';
  const isUpload = d.mode === 'upload';
  const noDocument = isUpload && !d.attachments.length;
  // Signataire de Cluster : celui figé à l'envoi, sinon le réglage actuel.
  const clusterName = d.clusterSigner?.name || meta.signer.name;

  const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—');

  const call = async (key: string, path: string, init: RequestInit = {}) => {
    setBusy(key);
    try {
      const res = await fetch(`${API_URL}/api/nda/agreements/${d.id}${path}`, {
        ...init,
        headers: { ...authHeaders(), ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || data?.error || String(res.status));
      return data;
    } catch (e: any) {
      dialog.alert(`${t('nda.detail.actionFailed')} ${e?.message || ''}`);
      return null;
    } finally { setBusy(null); }
  };

  const pdf = (doc: string, title: string) => setViewer({
    url: `${API_URL}/api/nda/agreements/${d.id}/pdf/${doc}`,
    headers: authHeaders(),
    title: `${title} — ${d.company}`,
    filename: `Cluster_NDA_${d.company.replace(/\s+/g, '_')}${doc === 'signed' ? '_signed' : ''}.pdf`,
  });

  const send = async (resend = false) => {
    if (!(await dialog.confirm(t(resend ? 'nda.detail.confirmResend' : 'nda.detail.confirmSend', { name: d.signerName, email: d.email, company: d.company }) as string))) return;
    const data = await call(resend ? 'resend' : 'send', resend ? '/resend' : '/send', { method: 'POST' });
    if (!data) return;
    onChanged(data);
    if (data.emailed === false && data.link) setManualLink(data.link);
    else dialog.alert(t('nda.detail.sentOk', { email: d.email }) as string);
  };
  const cancel = async () => {
    if (!(await dialog.confirm(t('nda.detail.confirmCancel', { company: d.company }) as string, { danger: true }))) return;
    const data = await call('cancel', '/cancel', { method: 'POST', body: JSON.stringify({}) });
    if (data) onChanged(data);
  };
  const remove = async () => {
    if (!(await dialog.confirm(t('nda.detail.confirmDelete', { company: d.company }) as string, { danger: true, confirmText: t('common.delete') }))) return;
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
  const removeAttachment = async (aid: number, filename: string) => {
    if (!(await dialog.confirm(t('safety.removeAttachment', { name: filename }), { danger: true, confirmText: t('common.remove') }))) return;
    const data = await call(`att-${aid}`, `/attachments/${aid}`, { method: 'DELETE' });
    if (data) onChanged(data);
  };
  const countersign = async () => {
    const signature = pad.current?.toDataURL();
    if (!signature) return;
    const data = await call('countersign', '/countersign', { method: 'POST', body: JSON.stringify({ signature }) });
    if (!data) return;
    setSignOpen(false);
    onChanged(data);
    dialog.alert(t('nda.detail.completedOk', { company: d.company }) as string);
  };

  // Aperçu du courriel : le serveur le construit avec le même code que l'envoi.
  const previewMail = async () => {
    setBusy('mail');
    try {
      const res = await fetch(`${API_URL}/api/nda/agreements/${d.id}/email-preview`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || String(res.status));
      setMailTab('party'); setMail(data);
    } catch (e: any) { dialog.alert(`${t('nda.detail.actionFailed')} ${e?.message || ''}`); } finally { setBusy(null); }
  };
  const shown = mail && (mailTab === 'cc' && mail.ccNotice ? mail.ccNotice : mail);

  const ndaLabel = isUpload ? t('nda.detail.sigpage') : `${t('nda.detail.docNda')} (${n.lang.toUpperCase()})`;

  return (
    <div className="space-y-5">
      {viewer && <PdfViewerModal source={viewer} onClose={() => setViewer(null)} />}
      <Modal open={!!mail} onClose={() => setMail(null)} size="lg" title={t('nda.detail.emailPreview')}
        footer={<button type="button" className={BTN_GHOST} onClick={() => setMail(null)}>{t('common.close')}</button>}>
        {mail && shown && (
          <div className="space-y-3">
            {mail.ccNotice && (
              <div className="inline-flex rounded-xl bg-gray-2 p-1 dark:bg-meta-4/60">
                {(['party', 'cc'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setMailTab(k)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${mailTab === k ? 'bg-white text-black shadow-sm dark:bg-boxdark dark:text-white' : 'text-body dark:text-bodydark2'}`}>
                    {t(k === 'party' ? 'nda.detail.mailToParty' : 'nda.detail.mailToCc')}
                  </button>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              {mail.from && (<><dt className="text-bodydark2">{t('nda.detail.mailFrom')}</dt><dd className="break-all text-black dark:text-white">{mail.from}</dd></>)}
              <dt className="text-bodydark2">{t('nda.detail.mailTo')}</dt>
              <dd className="break-all text-black dark:text-white">{mailTab === 'cc' ? mail.cc.join(', ') : mail.to}</dd>
              <dt className="text-bodydark2">{t('nda.detail.mailSubject')}</dt>
              <dd className="break-words font-medium text-black dark:text-white">{shown.subject}</dd>
            </dl>
            <iframe title={shown.subject} srcDoc={shown.html} sandbox="" className="h-[60vh] w-full rounded-lg border border-stroke bg-white dark:border-strokedark" />
            {mailTab === 'party' && <p className="text-xs text-bodydark2">{t('nda.detail.mailLinkNote')}</p>}
          </div>
        )}
      </Modal>
      <button type="button" onClick={onBack} className="text-sm font-medium text-primary hover:underline">← {t('nda.detail.back')}</button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold leading-tight tracking-[-0.01em] text-black dark:text-white">{d.company}</h2>
            <StatusPill family={statusFamily[d.status]}>{t(`nda.status.${d.status}`)}</StatusPill>
          </div>
          <p className="mt-1 text-sm text-bodydark2">
            {d.ref} · {t(`nda.form.mode.${d.mode}`)} · {d.signerName}{n.signer.title ? `, ${n.signer.title}` : ''}{d.team ? ` · ${d.team}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && canSend && <button type="button" className={BTN_GHOST} onClick={onEdit}>{t('common.edit')}</button>}
          {isDraft && canSend && (
            <button type="button" className={BTN_PRIMARY} disabled={!!busy || noDocument} title={noDocument ? (t('nda.detail.needDocument') as string) : undefined} onClick={() => send(false)}>
              {busy === 'send' ? t('nda.detail.sending') : t('nda.detail.send')}
            </button>
          )}
          {pending && canSend && <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={() => send(true)}>{t('nda.detail.resend')}</button>}
          {d.status === 'party_signed' && meta.can.countersign && (
            <button type="button" className={BTN_PRIMARY} onClick={() => setSignOpen(true)}>{t('nda.detail.countersign')}</button>
          )}
          {d.status === 'completed' && (
            <button type="button" className={BTN_PRIMARY} onClick={() => pdf('signed', t('nda.detail.signedNda') as string)}>{t('nda.detail.viewSigned')}</button>
          )}
        </div>
      </div>

      {manualLink && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">
          <p className="mb-2 font-medium">{t('nda.detail.notEmailed')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-1 text-xs dark:bg-boxdark">{manualLink}</code>
            <button type="button" className={BTN_GHOST} onClick={() => navigator.clipboard?.writeText(manualLink)}>{t('nda.detail.copyLink')}</button>
          </div>
        </div>
      )}
      {d.status === 'party_signed' && !meta.can.countersign && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">{t('nda.detail.waitingCountersign', { name: clusterName })}</div>
      )}
      {d.status === 'declined' && (
        <div className="rounded border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">
          {t('nda.detail.declined', { date: dt(d.declinedAt) })}{d.declineReason ? ` — « ${d.declineReason} »` : ''}
        </div>
      )}
      {noDocument && isDraft && (
        <div className="rounded border border-warning/50 bg-warning/10 px-4 py-3 text-sm text-black dark:text-white">{t('nda.detail.needDocument')}</div>
      )}

      {signOpen && (
        <div className={CARD + ' border-primary/50'}>
          <h3 className="mb-1 font-semibold text-black dark:text-white">{t('nda.detail.countersignTitle')}</h3>
          <p className="mb-4 text-sm text-bodydark2">{t('nda.detail.countersignHint', { name: clusterName, title: d.clusterSigner?.title || '' })}</p>
          <SignaturePad ref={pad} clearLabel={t('sign.clear')} placeholder={t('sign.drawHere')} onChange={setPadEmpty} />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className={BTN_GHOST} onClick={() => setSignOpen(false)}>{t('common.cancel')}</button>
            <button type="button" className={BTN_PRIMARY} disabled={padEmpty || busy === 'countersign'} onClick={countersign}>
              {busy === 'countersign' ? t('nda.detail.signing') : t('nda.detail.signAndComplete')}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <div className={CARD}>
            <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.detail.documents')}</h3>
            <ul className="divide-y divide-stroke dark:divide-strokedark">
              {d.attachments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="min-w-0 break-all text-sm text-black dark:text-white">📎 {a.filename} <span className="text-xs text-bodydark2">({Math.round(a.size / 1024)} Ko)</span></span>
                  <span className="flex gap-3">
                    <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => pdf(`att-${a.id}`, a.filename)}>{t('nda.detail.open')}</button>
                    {isDraft && canSend && (
                      <button type="button" className="text-sm font-medium text-danger hover:underline" disabled={!!busy} onClick={() => removeAttachment(a.id, a.filename)}>{t('common.remove')}</button>
                    )}
                  </span>
                </li>
              ))}
              {!noDocument && (
                <li className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="text-sm text-black dark:text-white">📄 {ndaLabel}</span>
                  <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => pdf('nda', ndaLabel)}>
                    {isDraft ? t('nda.detail.preview') : t('nda.detail.viewSent')}
                  </button>
                </li>
              )}
              <li className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0 break-all text-sm text-black dark:text-white">✉️ {t('nda.detail.emailToParty', { email: d.email })}</span>
                <button type="button" className="text-sm font-medium text-primary hover:underline" disabled={busy === 'mail'} onClick={previewMail}>
                  {t('nda.detail.preview')}
                </button>
              </li>
            </ul>
            {isDraft && canSend && isUpload && (
              <div className="mt-3">
                <input ref={fileInput} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={() => fileInput.current?.click()}>
                  {busy === 'upload' ? t('nda.detail.uploading') : `+ ${t('nda.detail.attach')}`}
                </button>
                <p className="mt-2 text-xs text-bodydark2">{t('nda.detail.attachHint')}</p>
              </div>
            )}
            {!isDraft && <p className="mt-3 text-xs text-bodydark2">{t('nda.detail.lockedHint')}</p>}
          </div>

          <div className={CARD}>
            <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.detail.summary')}</h3>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {([
                [t('nda.form.legalName'), n.company.legalName],
                [t('nda.form.address'), [n.company.address, n.company.city, n.company.province, n.company.postalCode, n.company.country].filter(Boolean).join(', ') || '—'],
                [t('nda.form.signer'), `${d.signerName}${n.signer.title ? ` (${n.signer.title})` : ''}`],
                [t('nda.form.email'), n.signer.email],
                [t('nda.form.cc'), (n.cc || []).join(', ') || '—'],
                [t('nda.detail.clusterSigner'), `${clusterName}${d.clusterSigner?.title ? ` (${d.clusterSigner.title})` : ''}`],
                [t('nda.form.lang'), n.lang === 'fr' ? 'Français' : 'English'],
                ...(!isUpload ? [
                  [t('nda.form.purpose'), n.purpose || meta.defaultPurpose[n.lang]],
                  [t('nda.form.effectiveDate'), n.effectiveDate || t('nda.detail.dateOfSending')],
                ] : []),
                [t('nda.detail.preparedBy'), d.createdBy],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-bodydark2">{k}</dt>
                  <dd className="break-words text-black dark:text-white">{v}</dd>
                </div>
              ))}
            </dl>
            {n.notes && <p className="mt-4 whitespace-pre-wrap rounded bg-gray-2 px-3 py-2 text-sm text-black dark:bg-meta-4 dark:text-white">{n.notes}</p>}
          </div>
        </div>

        <div className={CARD}>
          <h3 className="mb-4 font-semibold text-black dark:text-white">{t('nda.detail.timeline')}</h3>
          <ol className="relative space-y-4 border-l border-stroke pl-5 dark:border-strokedark">
            {d.events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                <p className="text-sm font-medium text-black dark:text-white">{t(`nda.events.${e.event}`, { defaultValue: e.event })}</p>
                <p className="text-xs text-bodydark2">{dt(e.at)}{e.actor ? ` · ${e.actor}` : ''}</p>
                {e.detail?.filename && <p className="text-xs text-bodydark2">{e.detail.filename}</p>}
                {e.detail?.typedName && <p className="text-xs text-bodydark2">{t('nda.detail.typed', { name: e.detail.typedName })}{e.ip ? ` · IP ${e.ip}` : ''}</p>}
                {e.event === 'sent' && e.detail?.emailed === false && <p className="text-xs text-warning">{t('nda.detail.notEmailedShort')}</p>}
              </li>
            ))}
          </ol>
          {pending && d.tokenExpiresAt && <p className="mt-4 text-xs text-bodydark2">{t('nda.detail.linkExpires', { date: dt(d.tokenExpiresAt) })}</p>}
          {canSend && (
            <div className="mt-6 flex flex-wrap gap-2 border-t border-stroke pt-4 dark:border-strokedark">
              <button type="button" className={BTN_GHOST} disabled={!!busy} onClick={duplicate}>{t('nda.detail.duplicate')}</button>
              {(pending || d.status === 'party_signed') && <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={cancel}>{t('nda.detail.cancel')}</button>}
              {DELETABLE.includes(d.status) && <button type="button" className={BTN_DANGER} disabled={!!busy} onClick={remove}>{t('common.delete')}</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NdaDetailView;
