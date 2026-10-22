import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search, Settings2, Trash2 } from 'lucide-react';
import { ContentLoader } from '../../common/Loader';
import Select from '../../components/Select';
import TelephoneCopiable from '../../components/TelephoneCopiable';
import { useAuth } from '../../context/AuthContext';
import { authHeaders } from '../../lib/auth';
import { Modal, PageHeader, StateCard, StatusPill, dialog, toast } from '../../components/ui';
import type { StatusFamily } from '../../components/ui';

// Campagne golf (/golf-campaign) : appels aux clubs de golf (liste AGQ + répertoire GGGolf) pour
// voir s'ils veulent une alternative à Lightspeed (ex-GGGolf, migration imposée). Une fiche par
// club : coordonnées, questionnaire, résultat d'appel, rappel / rendez-vous, historique.
// Le serveur décide tout (permissions, statuts) ; l'écran n'affiche que ce que l'API permet.

const API_URL = import.meta.env.VITE_API_URL || '';
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

type SortKey = 'name' | 'contact' | 'platform' | 'status' | 'assigned' | 'next';
type Status = 'to_call' | 'no_answer' | 'callback' | 'meeting' | 'interested' | 'not_interested' | 'wrong_number';
const STATUSES: Status[] = ['to_call', 'no_answer', 'callback', 'meeting', 'interested', 'not_interested', 'wrong_number'];
const FAMILY: Record<Status, StatusFamily> = {
  to_call: 'neutral', no_answer: 'wait', callback: 'wait', meeting: 'ok', interested: 'ok', not_interested: 'err', wrong_number: 'err',
};

interface Club {
  id: string; name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null;
  source: string | null; gg_directory_name: string | null; is_cluster_client: boolean; zoho_client_name: string | null;
  zoho_status: string | null; mrr: string | null; status: Status; assigned_to: string | null;
  callback_at: string | null; meeting_at: string | null; meeting_with: string | null; answers: Record<string, string>; notes: string | null; last_call_at: string | null;
}
interface Question { id: string; type: 'choice' | 'text' | 'yesno'; label: { en: string; fr: string }; options?: string[] }
interface Visitor { email: string; name: string; slotMinutes: number }
interface Person { email: string; name: string | null }
interface Call { id: string; by_email: string; outcome: Status; note: string | null; created_at: string }

const CARD = 'rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark';
const INPUT = 'w-full rounded-[10px] border border-stroke bg-transparent px-3 py-2 text-sm text-black outline-none focus:border-primary dark:border-strokedark dark:bg-form-input dark:text-white';
const BTN = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-stroke px-3 py-2 text-sm font-bold text-black hover:border-primary disabled:opacity-50 dark:border-strokedark dark:text-white';
const BTN_PRIMARY = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-primary px-3.5 py-2 text-sm font-bold text-[#141414] hover:bg-[#F79C6A] disabled:opacity-50';

// <input type="datetime-local"> parle en heure locale sans fuseau ; le serveur stocke un instant.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export default function GolfCampaign() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang: 'en' | 'fr' = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const locale = lang === 'en' ? 'en-CA' : 'fr-CA';
  const can = (p: string) => !!user && (user.isAdmin || (user.permissions || []).includes('*') || (user.permissions || []).includes(p));

  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [script, setScript] = useState<{ fr: string; en: string }>({ fr: '', en: '' });
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('all');
  const [segF, setSegF] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editQ, setEditQ] = useState(false);
  const [adding, setAdding] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [assignF, setAssignF] = useState('all');
  // Tri par défaut : les clients Cluster d'abord, puis le répertoire GGGolf, puis les autres.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'platform', dir: 'asc' });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkTo, setBulkTo] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState('');
  const me = (user?.email || '').toLowerCase();
  const canManage = can('golfcampaign:manage');

  const load = useCallback(async () => {
    try {
      const [a, b, c, d] = await Promise.all([
        fetch(`${API_URL}/api/golf-campaign/clubs`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/golf-campaign/questionnaire`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/golf-campaign/script`, { headers: authHeaders() }),
        fetch(`${API_URL}/api/golf-campaign/assignees`, { headers: authHeaders() }),
      ]);
      if (!a.ok) throw new Error((await a.json().catch(() => ({}))).error || String(a.status));
      setClubs((await a.json()).clubs);
      if (b.ok) setQuestions((await b.json()).questions);
      if (c.ok) setScript((await c.json()).script);
      if (d.ok) setPeople((await d.json()).people);
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const replace = (c: Club) => setClubs((cur) => (cur || []).map((x) => (x.id === c.id ? c : x)));
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  const nameOf = (email: string | null) => {
    if (!email) return '';
    const p = people.find((x) => x.email === email.toLowerCase());
    return p?.name || email.split('@')[0];
  };

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (clubs || []).filter((c) => {
      if (statusF !== 'all' && c.status !== statusF) return false;
      if (segF === 'gg' && !c.gg_directory_name) return false;
      if (segF === 'client' && !c.is_cluster_client) return false;
      if (segF === 'other' && (c.gg_directory_name || c.is_cluster_client)) return false;
      if (assignF === 'mine' && (c.assigned_to || '').toLowerCase() !== me) return false;
      if (assignF === 'none' && c.assigned_to) return false;
      if (assignF.includes('@') && (c.assigned_to || '').toLowerCase() !== assignF) return false;
      return !needle || [c.name, c.contact_name, c.email, c.phone, c.address].some((v) => (v || '').toLowerCase().includes(needle));
    });
    const rank = (c: Club) => (c.is_cluster_client ? 0 : c.gg_directory_name ? 1 : 2);
    const next = (c: Club) => { const v = c.status === 'meeting' ? c.meeting_at : c.status === 'callback' ? c.callback_at : null; return v ? new Date(v).getTime() : null; };
    const cmpText = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' });
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let r = 0;
      if (sort.key === 'name') r = cmpText(a.name, b.name);
      else if (sort.key === 'contact') r = cmpText(a.contact_name || '', b.contact_name || '');
      else if (sort.key === 'platform') r = rank(a) - rank(b);
      else if (sort.key === 'status') r = STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
      else if (sort.key === 'assigned') r = cmpText(nameOf(a.assigned_to), nameOf(b.assigned_to));
      else if (sort.key === 'next') {
        const x = next(a); const y = next(b);
        if (x === null || y === null) return x === y ? cmpText(a.name, b.name) : x === null ? 1 : -1; // sans date : toujours en bas
        r = x - y;
      }
      return r * mul || cmpText(a.name, b.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubs, q, statusF, segF, assignF, sort, locale, me, people]);

  const toggleSort = (key: SortKey) => setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const allPicked = visible.length > 0 && visible.every((c) => picked.has(c.id));
  const togglePick = (id: string) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const assignPicked = async (to: string | null) => {
    setBulkBusy(true); setBulkErr('');
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/assign`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ids: [...picked], assigned_to: to }) });
      if (!r.ok) { setBulkErr((await r.json().catch(() => ({}))).error || t('golf.saveFailed')); return; }
      const upd: Club[] = (await r.json()).clubs;
      setClubs((cur) => (cur || []).map((x) => upd.find((u) => u.id === x.id) || x));
      setPicked(new Set()); setBulkTo('');
      toast.success(t('golf.assigned', { count: upd.length }));
    } finally { setBulkBusy(false); }
  };

  if (!clubs && !error) return <ContentLoader />;
  if (!clubs) return <StateCard kind="error" body={t('golf.loadFailed', { error })} onRetry={load} />;

  const count = (s: Status) => clubs.filter((c) => c.status === s).length;
  const open = clubs.find((c) => c.id === openId) || null;
  const called = clubs.filter((c) => c.status !== 'to_call').length;

  return (
    <>
      <PageHeader section={t('sidebar.sections.sales')} title={t('golf.title')} subtitle={t('golf.subtitle')}
        actions={<>
          {can('golfcampaign:manage') && <button className={BTN} onClick={() => setEditQ(true)}><Settings2 size={15} />{t('golf.editQuestionnaire')}</button>}
          <button className={BTN_PRIMARY} onClick={() => setAdding(true)}><Plus size={15} />{t('golf.addClub')}</button>
        </>} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('golf.kpi.called'), `${called} / ${clubs.length}`],
          [t('golf.kpi.callbacks'), count('callback')],
          [t('golf.kpi.meetings'), count('meeting')],
          [t('golf.kpi.interested'), count('interested')],
        ].map(([label, val]) => (
          <div key={String(label)} className={`${CARD} px-4 py-3`}>
            <div className="text-xs text-body dark:text-bodydark2">{label}</div>
            <div className="text-xl font-bold text-black dark:text-white">{val}</div>
          </div>
        ))}
      </div>

      <div className={`${CARD} mb-4 flex flex-wrap items-center gap-3 p-3`}>
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body" />
          <input className={`${INPUT} pl-9`} placeholder={t('golf.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-48">
          <Select value={statusF} onChange={setStatusF}
            options={[{ value: 'all', label: t('golf.allStatuses') }, ...STATUSES.map((s) => ({ value: s, label: t(`golf.status.${s}`) }))]} />
        </div>
        <div className="w-56">
          <Select value={segF} onChange={setSegF} options={[
            { value: 'all', label: t('golf.seg.all') }, { value: 'gg', label: t('golf.seg.gg') },
            { value: 'client', label: t('golf.seg.client') }, { value: 'other', label: t('golf.seg.other') },
          ]} />
        </div>
        <div className="w-56">
          <Select value={assignF} onChange={setAssignF} options={[
            { value: 'all', label: t('golf.assignF.all') }, { value: 'mine', label: t('golf.assignF.mine') }, { value: 'none', label: t('golf.assignF.none') },
            ...people.filter((p) => p.email !== me).map((p) => ({ value: p.email, label: p.name || p.email })),
          ]} />
        </div>
      </div>

      {picked.size > 0 && (
        <div className={`${CARD} mb-4 flex flex-wrap items-center gap-3 p-3`}>
          <span className="text-sm font-bold text-black dark:text-white">{t('golf.selected', { count: picked.size })}</span>
          {canManage && (
            <div className="w-56">
              <Select value={bulkTo} onChange={setBulkTo} placeholder={t('golf.assignPick')}
                options={people.map((p) => ({ value: p.email, label: p.name || p.email }))} />
            </div>
          )}
          {canManage && <button className={BTN_PRIMARY} disabled={bulkBusy || !bulkTo} onClick={() => assignPicked(bulkTo)}>{t('golf.assign')}</button>}
          <button className={BTN} disabled={bulkBusy} onClick={() => assignPicked(me)}>{t('golf.assignToMe')}</button>
          <button className={BTN} disabled={bulkBusy} onClick={() => assignPicked(null)}>{t('golf.unassign')}</button>
          <button className={BTN} onClick={() => setPicked(new Set())}>{t('golf.clearSelection')}</button>
          {bulkErr && <span role="alert" className="text-sm font-bold text-[#B42318] dark:text-[#F46060]">{bulkErr}</span>}
        </div>
      )}

      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead>
            <tr className="border-b border-stroke text-xs uppercase text-body dark:border-strokedark dark:text-bodydark2">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" aria-label={t('golf.selectAll')} checked={allPicked}
                  onChange={() => setPicked(allPicked ? new Set() : new Set(visible.map((c) => c.id)))} />
              </th>
              {([['name', 'club'], ['contact', 'contact'], ['platform', 'platform'], ['status', 'status'], ['assigned', 'assigned'], ['next', 'next']] as [SortKey, string][]).map(([key, label]) => (
                <th key={key} className="px-4 py-3" aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 font-[inherit] uppercase hover:text-primary">
                    {t(`golf.col.${label}`)}
                    {sort.key === key ? (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />) : <ArrowUpDown size={13} className="opacity-40" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-b border-stroke last:border-0 hover:bg-gray-2 dark:border-strokedark dark:hover:bg-meta-4">
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={c.name} checked={picked.has(c.id)} onChange={() => togglePick(c.id)} />
                </td>
                <td className="px-4 py-3 font-bold text-black dark:text-white">{c.name}</td>
                <td className="px-4 py-3">{c.contact_name || '—'}<div className="text-xs text-body dark:text-bodydark2">{c.email}</div></td>
                <td className="px-4 py-3">
                  {c.is_cluster_client && <StatusPill family="ok" className="mr-1">{t('golf.badge.client')}</StatusPill>}
                  {c.gg_directory_name && <StatusPill family="new">GGGolf</StatusPill>}
                  {!c.is_cluster_client && !c.gg_directory_name && '—'}
                </td>
                <td className="px-4 py-3"><StatusPill family={FAMILY[c.status]}>{t(`golf.status.${c.status}`)}</StatusPill></td>
                <td className="px-4 py-3 text-xs">{c.assigned_to ? nameOf(c.assigned_to) : '—'}</td>
                <td className="px-4 py-3 text-xs">{c.status === 'meeting' ? fmt(c.meeting_at) : c.status === 'callback' ? fmt(c.callback_at) : '—'}</td>
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-body">{t('golf.empty')}</td></tr>}
          </tbody>
        </table>
      </div>

      {open && <ClubModal key={open.id} club={open} people={people} canManage={canManage} me={me} questions={questions} script={script[lang]} lang={lang} fmt={fmt} onClose={() => setOpenId(null)} onSaved={replace} />}
      {adding && <AddModal onClose={() => setAdding(false)} onAdded={(c) => { setClubs((cur) => [...(cur || []), c]); setAdding(false); setOpenId(c.id); }} />}
      {editQ && <QuestionnaireModal questions={questions} script={script} onClose={() => setEditQ(false)} onSaved={(qs, sc) => { setQuestions(qs); setScript(sc); setEditQ(false); }} />}
    </>
  );
}

function ClubModal({ club, people, canManage, me, questions, script, lang, fmt, onClose, onSaved }: {
  club: Club; people: Person[]; canManage: boolean; me: string; questions: Question[]; script: string; lang: 'en' | 'fr'; fmt: (iso: string | null) => string; onClose: () => void; onSaved: (c: Club) => void;
}) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>(club.answers || {});
  const [notes, setNotes] = useState(club.notes || '');
  const [contact, setContact] = useState({ contact_name: club.contact_name || '', email: club.email || '', phone: club.phone || '' });
  const [outcome, setOutcome] = useState<Status>(club.status === 'to_call' ? 'no_answer' : club.status);
  const [callbackAt, setCallbackAt] = useState(toLocalInput(club.callback_at));
  const [callNote, setCallNote] = useState('');
  const [calls, setCalls] = useState<Call[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState('');
  const [assigned, setAssigned] = useState((club.assigned_to || '').toLowerCase());
  const assignPatch = assigned !== (club.assigned_to || '').toLowerCase() ? { assigned_to: assigned || null } : {};

  useEffect(() => {
    fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}/calls`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { calls: [] })).then((j) => setCalls(j.calls || [])).catch(() => {});
  }, [club.id]);

  const fail = async (r: Response) => setErr((await r.json().catch(() => ({}))).error || t('golf.saveFailed'));

  const saveDetails = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ answers, notes, ...contact, ...assignPatch }) });
      if (!r.ok) return fail(r);
      onSaved(await r.json()); setDirty(false); toast.success(t('golf.saved'));
    } finally { setBusy(false); }
  };
  const logCall = async () => {
    setErr('');
    if (outcome === 'meeting' && !club.meeting_at) return setErr(t('golf.visit.needBooking'));
    if (outcome === 'callback' && !callbackAt) return setErr(t('golf.needCallbackDate'));
    setBusy(true);
    try {
      // Les réponses au questionnaire partent d'abord : un appel journalisé ne doit pas perdre la saisie.
      const s = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ answers, notes, ...contact, ...assignPatch }) });
      if (!s.ok) return fail(s);
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}/calls`, {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ outcome, note: callNote, callback_at: fromLocalInput(callbackAt), meeting_at: club.meeting_at }),
      });
      if (!r.ok) return fail(r);
      onSaved(await r.json()); setDirty(false); toast.success(t('golf.callLogged')); onClose();
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={club.name} size="xl" dirty={dirty}
      footer={<>
        <button className={BTN} onClick={saveDetails} disabled={busy}>{t('golf.saveDetails')}</button>
        <button className={BTN_PRIMARY} onClick={logCall} disabled={busy}>{t('golf.logCall')}</button>
      </>}>
      {err && <p role="alert" className="mb-3 rounded-[10px] bg-[rgba(244,96,96,0.12)] px-3 py-2 text-sm font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
      {script && (
        <div className="mb-4 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="mb-1 text-xs font-bold uppercase text-body dark:text-bodydark2">{t('golf.script')}</div>
          <p className="m-0 text-sm text-black dark:text-white">
            {script.replace(/\{\{club\}\}/g, club.name).replace(/\{\{contact\}\}/g, (contact.contact_name || '').split(' ')[0] || t('golf.scriptNoContact'))}
          </p>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <h3 className="m-0 text-sm font-bold text-black dark:text-white">{t('golf.contactTitle')}</h3>
          <div className="flex flex-wrap gap-1">
            {club.is_cluster_client && <StatusPill family="ok">{t('golf.badge.client')}{club.zoho_client_name ? ` · ${club.zoho_client_name}` : ''}</StatusPill>}
            {club.gg_directory_name && <StatusPill family="new">GGGolf · {club.gg_directory_name}</StatusPill>}
          </div>
          {club.address && <div className="text-xs text-body dark:text-bodydark2">{club.address}</div>}
          <label className="block text-xs">{t('golf.assignedTo')}
            <Select value={assigned} onChange={(v) => { setAssigned(v); setDirty(true); }}
              options={[{ value: '', label: t('golf.unassigned') },
                ...people.filter((p) => canManage || p.email === me || p.email === assigned).map((p) => ({ value: p.email, label: p.name || p.email }))]} />
          </label>
          <input className={INPUT} placeholder={t('golf.f.contactName')} value={contact.contact_name} onChange={(e) => { setContact({ ...contact, contact_name: e.target.value }); setDirty(true); }} />
          <input className={INPUT} placeholder={t('golf.f.email')} value={contact.email} onChange={(e) => { setContact({ ...contact, email: e.target.value }); setDirty(true); }} />
          <div className="flex items-center gap-3">
            <input className={INPUT} placeholder={t('golf.f.phone')} value={contact.phone} onChange={(e) => { setContact({ ...contact, phone: e.target.value }); setDirty(true); }} />
            {contact.phone && <TelephoneCopiable valeur={contact.phone} />}
          </div>

          <h3 className="m-0 pt-2 text-sm font-bold text-black dark:text-white">{t('golf.callTitle')}</h3>
          <Select value={outcome} onChange={(v) => setOutcome(v as Status)} options={STATUSES.filter((s) => s !== 'to_call').map((s) => ({ value: s, label: t(`golf.status.${s}`) }))} />
          {outcome === 'callback' && <label className="block text-xs">{t('golf.callbackAt')}<input type="datetime-local" className={INPUT} value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} /></label>}
          {outcome === 'meeting' && <BookingPanel club={club} lang={lang} fmt={fmt} onSaved={onSaved} />}
          <textarea className={INPUT} rows={2} placeholder={t('golf.callNote')} value={callNote} onChange={(e) => setCallNote(e.target.value)} />

          {!!calls.length && (
            <div>
              <h3 className="m-0 mb-1 text-sm font-bold text-black dark:text-white">{t('golf.history')}</h3>
              <ul className="m-0 list-none space-y-1 p-0 text-xs">
                {calls.map((c) => (
                  <li key={c.id}><b>{fmt(c.created_at)}</b> · {t(`golf.status.${c.outcome}`)} · {c.by_email}{c.note ? ` — ${c.note}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="m-0 text-sm font-bold text-black dark:text-white">{t('golf.questionnaire')}</h3>
          {questions.map((qn) => (
            <label key={qn.id} className="block text-xs font-bold text-black dark:text-white">
              {qn.label[lang]}
              <div className="mt-1 font-normal">
                {qn.type === 'text'
                  ? <textarea className={INPUT} rows={2} value={answers[qn.id] || ''} onChange={(e) => { setAnswers({ ...answers, [qn.id]: e.target.value }); setDirty(true); }} />
                  : <Select value={answers[qn.id] || ''} placeholder="—" onChange={(v) => { setAnswers({ ...answers, [qn.id]: v }); setDirty(true); }}
                      options={(qn.type === 'yesno' ? ['Yes', 'No'] : qn.options || []).map((o) => ({ value: o, label: o }))} />}
              </div>
            </label>
          ))}
          <label className="block text-xs font-bold text-black dark:text-white">{t('golf.notes')}
            <textarea className={`${INPUT} mt-1 font-normal`} rows={3} value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} />
          </label>
        </div>
      </div>
    </Modal>
  );
}

interface SlotDay { date: string; slots: string[] }
interface BookResult { calendar: { ok?: boolean; skipped?: string; error?: string }; clientMail: { sent: boolean; reason?: string }; visitorMail: { sent: boolean } }

// Rendez-vous en personne : les créneaux libres du visiteur (Google Agenda + visites déjà prises), un clic
// pour réserver. L'événement part dans son agenda ; le club reçoit un courriel avec un fichier .ics.
function BookingPanel({ club, lang, fmt, onSaved }: { club: Club; lang: 'en' | 'fr'; fmt: (iso: string | null) => string; onSaved: (c: Club) => void }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en-CA' : 'fr-CA';
  const [days, setDays] = useState<SlotDay[] | null>(null);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [source, setSource] = useState('');
  const [pick, setPick] = useState('');
  const [choosing, setChoosing] = useState(!club.meeting_at);
  const [notify, setNotify] = useState(!!club.email);
  const [mailLang, setMailLang] = useState<'fr' | 'en'>(lang);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<BookResult | null>(null);

  const loadSlots = useCallback(async () => {
    setErr('');
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}/slots`, { headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || String(r.status));
      const j = await r.json();
      setDays(j.days); setVisitor(j.visitor); setSource(j.source);
    } catch (e) { setErr((e as Error).message); }
  }, [club.id]);
  useEffect(() => { loadSlots(); }, [loadSlots]);

  const dayLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' });

  const book = async () => {
    if (!pick) return setErr(t('golf.visit.pickFirst'));
    setBusy(true); setErr(''); setResult(null);
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}/meeting`, {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ at: pick, lang: mailLang, notify: notify && !!club.email, note }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === 'slot_taken') { setPick(''); await loadSlots(); return setErr(t('golf.visit.slotTaken')); }
        return setErr(j.error || t('golf.saveFailed'));
      }
      onSaved(j.club); setResult(j); setChoosing(false); setPick(''); setNote('');
    } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!(await dialog.confirm(t('golf.visit.cancelBody'), { title: t('golf.visit.cancelTitle'), danger: true, confirmText: t('golf.visit.cancelYes'), cancelText: t('golf.visit.keep') }))) return;
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs/${club.id}/meeting?lang=${mailLang}&notify=${notify && club.email ? 1 : 0}`, { method: 'DELETE', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErr(j.error || t('golf.saveFailed'));
      onSaved(j.club); setResult(null); setChoosing(true); await loadSlots();
    } finally { setBusy(false); }
  };

  const calMsg = result && (result.calendar.ok ? t('golf.visit.calOk') : result.calendar.skipped ? t('golf.visit.calSkipped') : t('golf.visit.calError', { error: result.calendar.error || '' }));
  const mailMsg = result && (result.clientMail.sent ? t('golf.visit.mailSent', { email: club.email }) : result.clientMail.reason === 'not_requested' ? t('golf.visit.mailOff') : result.clientMail.reason === 'no_club_email' ? t('golf.visit.mailNoEmail') : t('golf.visit.mailFailed'));

  return (
    <div className="space-y-3 rounded-xl border border-stroke p-3 dark:border-strokedark">
      <div className="text-xs font-bold uppercase text-body dark:text-bodydark2">{t('golf.visit.title')}{visitor ? ` · ${t('golf.visit.with', { name: visitor.name })}` : ''}</div>

      {club.meeting_at && !choosing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-[rgba(23,178,106,0.10)] px-3 py-2 text-sm">
          <span className="font-bold text-[#067647] dark:text-[#57D193]">{t('golf.visit.booked', { when: fmt(club.meeting_at) })}</span>
          <span className="flex gap-2">
            <button type="button" className={BTN} disabled={busy} onClick={() => setChoosing(true)}>{t('golf.visit.move')}</button>
            <button type="button" className={BTN} disabled={busy} onClick={cancel}>{t('golf.visit.cancel')}</button>
          </span>
        </div>
      )}

      {choosing && (
        <>
          {days === null && !err && <p className="m-0 text-sm text-body dark:text-bodydark2">{t('golf.visit.loading')}</p>}
          {days && !days.some((d) => d.slots.length) && <p className="m-0 text-sm text-body dark:text-bodydark2">{t('golf.visit.noSlots')}</p>}
          {days && days.map((d) => d.slots.length > 0 && (
            <div key={d.date} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 shrink-0 text-xs font-bold capitalize text-black dark:text-white">{dayLabel(d.date)}</span>
              {d.slots.map((iso) => (
                <button key={iso} type="button" aria-pressed={pick === iso} onClick={() => setPick(iso)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-bold ${pick === iso ? 'border-primary bg-primary text-[#141414]' : 'border-stroke text-black hover:border-primary dark:border-strokedark dark:text-white'}`}>
                  {timeLabel(iso)}
                </button>
              ))}
            </div>
          ))}
          {source === 'saleshub' && <p className="m-0 text-xs text-body dark:text-bodydark2">{t('golf.visit.sourceSalesHub')}</p>}

          <input className={INPUT} placeholder={t('golf.visit.note')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={notify && !!club.email} disabled={!club.email} onChange={(e) => setNotify(e.target.checked)} />
            {club.email ? t('golf.visit.notify', { email: club.email }) : t('golf.visit.notifyNoEmail')}
          </label>
          {club.email && notify && (
            <div className="w-44"><Select value={mailLang} onChange={(v) => setMailLang(v as 'fr' | 'en')} options={[{ value: 'fr', label: 'Français' }, { value: 'en', label: 'English' }]} /></div>
          )}
          <div className="flex gap-2">
            <button type="button" className={BTN_PRIMARY} disabled={busy || !pick} onClick={book}>{club.meeting_at ? t('golf.visit.confirmMove') : t('golf.visit.book')}</button>
            {club.meeting_at && <button type="button" className={BTN} disabled={busy} onClick={() => { setChoosing(false); setPick(''); }}>{t('golf.visit.keep')}</button>}
          </div>
        </>
      )}

      {err && <p role="alert" className="m-0 text-sm font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
      {result && (
        <ul className="m-0 list-none space-y-0.5 p-0 text-xs text-body dark:text-bodydark2">
          <li>{calMsg}</li><li>{mailMsg}</li>
        </ul>
      )}
    </div>
  );
}

function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: (c: Club) => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ name: '', contact_name: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/clubs`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(f) });
      if (!r.ok) return setErr(r.status === 409 ? t('golf.exists') : t('golf.saveFailed'));
      onAdded(await r.json());
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('golf.addClub')} size="sm" dirty={!!f.name}
      footer={<button className={BTN_PRIMARY} onClick={save} disabled={busy || !f.name.trim()}>{t('golf.add')}</button>}>
      <div className="space-y-3">
        {err && <p role="alert" className="m-0 text-sm font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
        <input className={INPUT} placeholder={t('golf.f.clubName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={INPUT} placeholder={t('golf.f.contactName')} value={f.contact_name} onChange={(e) => setF({ ...f, contact_name: e.target.value })} />
        <input className={INPUT} placeholder={t('golf.f.email')} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <input className={INPUT} placeholder={t('golf.f.phone')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </div>
    </Modal>
  );
}

function QuestionnaireModal({ questions, script, onClose, onSaved }: { questions: Question[]; script: { fr: string; en: string }; onClose: () => void; onSaved: (q: Question[], s: { fr: string; en: string }) => void }) {
  const { t } = useTranslation();
  const [list, setList] = useState<Question[]>(questions);
  const [sc, setSc] = useState(script);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  useEffect(() => {
    fetch(`${API_URL}/api/golf-campaign/visitor`, { headers: authHeaders() }).then((r) => (r.ok ? r.json() : null)).then((j) => j && setVisitor(j.visitor)).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upd = (i: number, patch: Partial<Question>) => setList(list.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API_URL}/api/golf-campaign/questionnaire`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ questions: list }) });
      if (!r.ok) return setErr(t('golf.questionnaireInvalid'));
      const r2 = await fetch(`${API_URL}/api/golf-campaign/script`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ script: sc }) });
      if (!r2.ok) return setErr(t('golf.scriptInvalid'));
      if (visitor) {
        const r3 = await fetch(`${API_URL}/api/golf-campaign/visitor`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(visitor) });
        if (!r3.ok) return setErr(t('golf.visit.visitorInvalid'));
      }
      onSaved((await r.json()).questions, (await r2.json()).script);
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t('golf.editQuestionnaire')} size="xl" dirty
      footer={<>
        <button className={BTN} onClick={() => setList([...list, { id: `q${Date.now().toString(36)}`, type: 'text', label: { en: '', fr: '' } }])}><Plus size={15} />{t('golf.addQuestion')}</button>
        <button className={BTN_PRIMARY} onClick={save} disabled={busy}>{t('golf.save')}</button>
      </>}>
      <div className="space-y-3">
        {err && <p role="alert" className="m-0 text-sm font-bold text-[#B42318] dark:text-[#F46060]">{err}</p>}
        <div className="rounded-xl border border-stroke p-3 dark:border-strokedark">
          <div className="mb-2 text-sm font-bold text-black dark:text-white">{t('golf.script')}</div>
          <p className="m-0 mb-2 text-xs text-body dark:text-bodydark2">{t('golf.scriptHelp')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            <textarea className={INPUT} rows={5} placeholder="Français" value={sc.fr} onChange={(e) => setSc({ ...sc, fr: e.target.value })} />
            <textarea className={INPUT} rows={5} placeholder="English" value={sc.en} onChange={(e) => setSc({ ...sc, en: e.target.value })} />
          </div>
        </div>
        {visitor && (
          <div className="rounded-xl border border-stroke p-3 dark:border-strokedark">
            <div className="mb-1 text-sm font-bold text-black dark:text-white">{t('golf.visit.visitorTitle')}</div>
            <p className="m-0 mb-2 text-xs text-body dark:text-bodydark2">{t('golf.visit.visitorHelp')}</p>
            <div className="grid gap-2 md:grid-cols-3">
              <input className={INPUT} placeholder={t('golf.f.contactName')} value={visitor.name} onChange={(e) => setVisitor({ ...visitor, name: e.target.value })} />
              <input className={INPUT} placeholder={t('golf.f.email')} value={visitor.email} onChange={(e) => setVisitor({ ...visitor, email: e.target.value })} />
              <label className="flex items-center gap-2 text-xs">{t('golf.visit.minutes')}
                <input type="number" min={15} max={240} step={15} className={INPUT} value={visitor.slotMinutes} onChange={(e) => setVisitor({ ...visitor, slotMinutes: Number(e.target.value) })} />
              </label>
            </div>
          </div>
        )}
        {list.map((qn, i) => (
          <div key={qn.id} className="rounded-xl border border-stroke p-3 dark:border-strokedark">
            <div className="grid gap-2 md:grid-cols-2">
              <input className={INPUT} placeholder="English" value={qn.label.en} onChange={(e) => upd(i, { label: { ...qn.label, en: e.target.value } })} />
              <input className={INPUT} placeholder="Français" value={qn.label.fr} onChange={(e) => upd(i, { label: { ...qn.label, fr: e.target.value } })} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="w-40"><Select value={qn.type} onChange={(v) => upd(i, { type: v as Question['type'], options: v === 'choice' ? qn.options || ['Yes', 'No'] : undefined })}
                options={[{ value: 'text', label: t('golf.qType.text') }, { value: 'choice', label: t('golf.qType.choice') }, { value: 'yesno', label: t('golf.qType.yesno') }]} /></div>
              {qn.type === 'choice' && <input className={`${INPUT} min-w-[220px] flex-1`} placeholder={t('golf.qOptions')} defaultValue={(qn.options || []).join(', ')}
                onBlur={(e) => upd(i, { options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />}
              <button className={BTN} aria-label={t('golf.removeQuestion')} onClick={() => setList(list.filter((_, k) => k !== i))}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
