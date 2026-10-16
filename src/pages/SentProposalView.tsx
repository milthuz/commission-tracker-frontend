import { useEffect, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { Button, Modal, StateCard, Tabs } from '../components/ui';
import { authHeaders } from '../lib/auth';
import { fmtDateTime } from '../lib/format';

// « Voir l'envoi » (écran Propositions › Envoyées) : ce que le client a reçu — en-tête du courriel,
// le courriel tel qu'affiché et la pièce jointe PDF exacte. Le serveur garde une copie SANS pixel
// de suivi ni lien d'acceptation actif : relire son envoi ne compte pas comme une ouverture du client.

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Content {
  customerName: string; number: string; to: string; cc: string | null; from: string | null;
  subject: string | null; sentAt: string; html: string | null; pdfName: string | null; hasPdf: boolean; stored: boolean;
}

export default function SentProposalView({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<Content | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'email' | 'pdf'>('email');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    if (id == null) return;
    setData(null); setError(false); setTab('email'); setPdfUrl(null); setPdfError(false);
    axios.get(`${API_URL}/api/proposals/sent/${id}/content`, { headers: authHeaders() })
      .then((r) => setData(r.data)).catch(() => setError(true));
  }, [id]);

  // Le PDF n'est téléchargé que quand on ouvre l'onglet (plusieurs Mo), puis montré depuis la mémoire.
  useEffect(() => {
    if (id == null || tab !== 'pdf' || pdfUrl || !data?.hasPdf) return;
    let url: string | null = null;
    axios.get(`${API_URL}/api/proposals/sent/${id}/pdf`, { headers: authHeaders(), responseType: 'blob' })
      .then((r) => { url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })); setPdfUrl(url); })
      .catch(() => setPdfError(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id, tab, data?.hasPdf]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const row = (label: string, value: string | null | undefined) => value ? (
    <div className="flex gap-3 text-sm">
      <dt className="w-20 shrink-0 text-body dark:text-bodydark2">{label}</dt>
      <dd className="m-0 min-w-0 break-words text-black dark:text-white">{value}</dd>
    </div>
  ) : null;

  return (
    <Modal open={id != null} onClose={onClose} size="xl"
      title={data ? <>{t('proposals.sentView.title')}<span className="mt-0.5 block text-xs font-normal text-body dark:text-bodydark2">{[data.customerName, data.number].filter(Boolean).join(' · ')}</span></> : t('proposals.sentView.title')}>
      {error ? (
        <StateCard kind="error" title={t('errors.loadFailed')} />
      ) : !data ? (
        <StateCard kind="loading" />
      ) : !data.stored ? (
        <StateCard kind="empty" title={t('proposals.sentView.notStoredTitle')} body={t('proposals.sentView.notStoredBody', { to: data.to, date: fmtDateTime(data.sentAt) })} />
      ) : (
        <>
          <dl className="m-0 flex flex-col gap-1.5 rounded-xl bg-[#F7F7F8] p-3.5 dark:bg-[#1B1B1B]">
            {row(t('proposals.sentView.from'), data.from)}
            {row(t('proposals.sentView.to'), data.to)}
            {row(t('proposals.sentView.cc'), data.cc)}
            {row(t('proposals.sentView.sentAt'), fmtDateTime(data.sentAt))}
            {row(t('proposals.sentView.subject'), data.subject)}
            {row(t('proposals.sentView.attachment'), data.hasPdf ? data.pdfName : null)}
          </dl>
          <Tabs card={false} value={tab} onChange={setTab} ariaLabel={t('proposals.sentView.title') as string}
            tabs={[{ id: 'email', label: t('proposals.sentView.tabEmail') }, ...(data.hasPdf ? [{ id: 'pdf' as const, label: t('proposals.sentView.tabPdf') }] : [])]}
            right={tab === 'pdf' && pdfUrl ? (
              <a href={pdfUrl} download={data.pdfName || 'proposition.pdf'}><Button size="sm">{t('proposals.sentView.download')}</Button></a>
            ) : null} />
          {tab === 'email' ? (
            // sandbox vide : aucun script, aucun lien actif — la copie est seulement lue.
            <iframe sandbox="" srcDoc={data.html || ''} title={t('proposals.sentView.tabEmail') as string}
              className="h-[60vh] w-full rounded-xl border-0 bg-[#eef1f6]" />
          ) : pdfError ? (
            <StateCard kind="error" title={t('errors.loadFailed')} />
          ) : !pdfUrl ? (
            <StateCard kind="loading" />
          ) : (
            <iframe src={pdfUrl} title={data.pdfName || 'PDF'} className="h-[60vh] w-full rounded-xl border-0 bg-white" />
          )}
        </>
      )}
    </Modal>
  );
}
