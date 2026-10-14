import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../../components/ConfirmDialog';
import { authHeaders, type Lead } from './types';

const API_URL = import.meta.env.VITE_API_URL;

// Fusion de deux demandes du même marchand (2026-10-14, demande de David) : le formulaire du site
// PUIS un appel, le même jour. Ce panneau vit dans la fiche d'une piste :
//   • piste absorbée → « Fusionnée dans L-… » (avec un lien) ;
//   • piste qui en a absorbé d'autres → « Fusionnée avec L-… » ;
//   • piste EN ATTENTE, pour qui a `leads:merge` → les demandes qui lui ressemblent (même courriel,
//     téléphone ou commerce, à 3 jours près) et une recherche pour en choisir une autre à la main.
// On choisit laquelle GARDER (par défaut la plus ancienne ; une piste déjà acceptée est forcément
// gardée). Le serveur verse tout le reste dans la gardée — rien n'est perdu.

interface Candidate {
  id: number; refCode: string; source: string; sourceDetail: string | null; status: string;
  businessName: string; contactFirstName: string | null; contactLastName: string | null;
  contactEmail: string | null; contactPhone: string | null; createdAt: string; repName: string | null;
  sameDay: boolean; matchedOn: string[];
}

type MergeLinks = Lead & {
  mergedIntoLead?: { id: number; refCode: string; source: string; status: string } | null;
  mergedFrom?: { id: number; refCode: string; source: string; createdAt: string; mergedAt: string; mergedBy: string }[];
};

const MergePanel = ({ lead, canMerge, onMerged, onOpenLead }: {
  lead: MergeLinks;
  canMerge: boolean;
  onMerged: (keepId: number, message: string) => void;
  onOpenLead?: (id: number) => void;
}) => {
  const { t, i18n } = useTranslation();
  const fr = !!i18n.language?.startsWith('fr');
  const pending = lead.status === 'new' || lead.status === 'in_review';
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [other, setOther] = useState<Candidate | null>(null);
  const [keepId, setKeepId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dt = (iso: string) => new Date(iso).toLocaleString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const src = (s: string) => t(`leads.source.${s}`, { defaultValue: s }) as string;
  const who = (c: Candidate) => [c.contactFirstName, c.contactLastName].filter(Boolean).join(' ');

  useEffect(() => {
    setCandidates([]); setPicking(false); setFound(null); setQ(''); setOther(null); setError(null);
    if (!canMerge || !pending || lead.mergedIntoLead) return;
    fetch(`${API_URL}/api/leads/${lead.id}/merge-candidates`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { candidates: [] }))
      .then((d) => setCandidates(d.candidates || []))
      .catch(() => {});
  }, [lead.id, lead.status, canMerge]);

  // Recherche manuelle (numéro de dossier, commerce ou courriel), débattue.
  useEffect(() => {
    if (!picking || q.trim().length < 2) { setFound(null); return; }
    const id = setTimeout(() => {
      fetch(`${API_URL}/api/leads/${lead.id}/merge-candidates?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : { candidates: [] }))
        .then((d) => setFound(d.candidates || []))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [q, picking, lead.id]);

  const choose = (c: Candidate) => {
    setOther(c); setError(null);
    // Une piste déjà acceptée est dans Zoho : c'est elle qu'on garde. Sinon, la plus ancienne.
    setKeepId(c.status === 'accepted' ? c.id : (new Date(c.createdAt) < new Date(lead.createdAt) ? c.id : lead.id));
  };

  const merge = async () => {
    if (!other || !keepId) return;
    const goneId = keepId === lead.id ? other.id : lead.id;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API_URL}/api/leads/${goneId}/merge`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ keepId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(t(`leads.merge.err.${d.error}`, { defaultValue: t('leads.merge.err.failed') as string }) as string); return; }
      const goneRef = goneId === lead.id ? lead.refCode : other.refCode;
      const msg = t('leads.merge.done', { gone: goneRef, keep: d.keepRef }) as string
        + (d.added?.length ? ` ${t('leads.merge.addedN', { n: d.added.length })}` : '')
        + (d.zohoNote?.ok ? ` ${t('leads.merge.zohoNoted')}` : d.zohoNote?.error ? ` ${t('leads.merge.zohoNoteFailed')}` : '');
      setOther(null);
      onMerged(d.keepId, msg);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const otherCard = (c: Candidate, action: React.ReactNode) => (
    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0">
        <strong className="text-black dark:text-white">{c.refCode}</strong>
        <span className="text-bodydark2"> · {src(c.source)} · {dt(c.createdAt)}{c.sameDay ? ` · ${t('leads.merge.sameDay')}` : ''}</span>
        <span className="block truncate text-xs text-bodydark2">
          {c.businessName}{who(c) ? ` — ${who(c)}` : ''}{c.contactPhone ? ` · ${c.contactPhone}` : ''}{c.contactEmail ? ` · ${c.contactEmail}` : ''}
          {c.status === 'accepted' ? ` · ${t('leads.merge.alreadyAccepted', { rep: c.repName || '—' })}` : ''}
        </span>
        {!!c.matchedOn?.length && (
          <span className="mt-0.5 block text-xs text-warning">{t('leads.merge.matchedOn')} {c.matchedOn.map((m) => t(`leads.merge.on.${m}`)).join(', ')}</span>
        )}
      </span>
      {action}
    </li>
  );
  const mergeBtn = (c: Candidate) => (
    <button type="button" onClick={() => choose(c)} className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-opacity-90">
      {t('leads.merge.mergeBtn')}
    </button>
  );

  return (
    <>
      {lead.mergedIntoLead && (
        <div className="mb-5 rounded-sm border border-stroke bg-gray-2 px-4 py-3 text-sm dark:border-strokedark dark:bg-meta-4">
          {t('leads.merge.mergedInto', { ref: lead.mergedIntoLead.refCode })}
          {onOpenLead && (
            <button type="button" onClick={() => onOpenLead(lead.mergedIntoLead!.id)} className="ml-2 font-medium text-primary hover:underline">
              {t('leads.merge.open', { ref: lead.mergedIntoLead.refCode })}
            </button>
          )}
        </div>
      )}
      {!!lead.mergedFrom?.length && (
        <p className="mb-5 text-sm text-bodydark2">
          {t('leads.merge.mergedFrom')}{' '}
          {lead.mergedFrom.map((m, i) => (
            <span key={m.id}>
              {i > 0 && ', '}
              {onOpenLead
                ? <button type="button" onClick={() => onOpenLead(m.id)} className="font-medium text-primary hover:underline">{m.refCode}</button>
                : <strong>{m.refCode}</strong>} ({src(m.source)})
            </span>
          ))}
        </p>
      )}

      {canMerge && pending && !lead.mergedIntoLead && (candidates.length > 0 || picking) && (
        <div className="mb-5 rounded-sm border border-warning/50 bg-warning/10 px-4 py-3">
          <p className="text-sm font-medium text-black dark:text-white">
            {candidates.length ? t('leads.merge.likelyTitle', { n: candidates.length }) : t('leads.merge.pickTitle')}
          </p>
          {!!candidates.length && <ul className="divide-y divide-stroke dark:divide-strokedark">{candidates.map((c) => otherCard(c, mergeBtn(c)))}</ul>}
          {picking && (
            <div className="mt-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t('leads.merge.searchPh') as string}
                className="w-full rounded border border-stroke bg-white px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-boxdark dark:text-white" />
              {found && (found.length
                ? <ul className="divide-y divide-stroke dark:divide-strokedark">{found.filter((c) => !candidates.some((x) => x.id === c.id)).map((c) => otherCard(c, mergeBtn(c)))}</ul>
                : <p className="mt-2 text-xs text-bodydark2">{t('leads.merge.noneFound')}</p>)}
            </div>
          )}
        </div>
      )}
      {canMerge && pending && !lead.mergedIntoLead && !picking && (
        <div className="-mt-3 mb-4 text-right">
          <button type="button" onClick={() => setPicking(true)} className="text-xs font-medium text-primary hover:underline">{t('leads.merge.pickLink')}</button>
        </div>
      )}

      <ConfirmDialog
        open={!!other}
        busy={busy}
        title={t('leads.merge.confirmTitle') as string}
        message={t('leads.merge.confirmBody') as string}
        confirmLabel={t('leads.merge.confirmBtn') as string}
        busyLabel={t('leads.merge.merging') as string}
        onClose={() => !busy && setOther(null)}
        onConfirm={merge}
      >
        {other && (
          <div className="space-y-2">
            {[
              { id: lead.id, refCode: lead.refCode, source: lead.source, createdAt: lead.createdAt, status: lead.status, label: t('leads.merge.thisOne') },
              { id: other.id, refCode: other.refCode, source: other.source, createdAt: other.createdAt, status: other.status, label: '' },
            ].map((x) => {
              const locked = other.status === 'accepted';
              const disabled = locked && x.id !== other.id;
              return (
                <label key={x.id} className={`flex cursor-pointer items-start gap-3 rounded border px-3 py-2 text-sm ${keepId === x.id ? 'border-primary bg-primary/5' : 'border-stroke dark:border-strokedark'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}>
                  <input type="radio" name="keep" className="mt-1" checked={keepId === x.id} disabled={disabled} onChange={() => setKeepId(x.id)} />
                  <span>
                    <span className="font-medium text-black dark:text-white">{t('leads.merge.keep', { ref: x.refCode })}</span>{x.label ? ` (${x.label})` : ''}
                    <span className="block text-xs text-bodydark2">
                      {src(x.source)} · {dt(x.createdAt)}{x.status === 'accepted' ? ` · ${t('leads.merge.inZoho')}` : ''}
                    </span>
                  </span>
                </label>
              );
            })}
            {other.status === 'accepted' && <p className="text-xs text-bodydark2">{t('leads.merge.acceptedKept')}</p>}
            {error && <p className="text-sm text-danger">{error}</p>}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
};

export default MergePanel;
