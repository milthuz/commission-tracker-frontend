// Guide — volet 1 : questions concrètes à poser aux gestionnaires, tirées des chiffres du modèle
// FY2027. Chaque question se copie (texte prêt à coller dans une IA ou un courriel), a son champ de
// notes (enregistré par usager, versionné) et un état « à poser / posée / répondue ».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select from '../../../components/Select';
import { Button, InlineError, StatusPill, toast } from '../../../components/ui';
import type { StatusFamily } from '../../../components/ui';
import { CARD, SEG, segBtn } from '../../../components/ui/surface';
import { ContentLoader } from '../../../common/Loader';
import { useFinance } from '../FinanceContext';
import { COGS_BOT, COGS_TOP, isSec, type RowDef } from '../rows';
import { errCode, guideApi, type GuideNote, type NoteState } from './api';
import { GROUPS, buildQuestions, type GroupId } from './guideModel';
import { TEXTAREA, copyText, useL } from './shared';

const ROW_LABEL = new Map<string, string>();
for (const r of [...COGS_TOP, ...COGS_BOT]) if (!isSec(r)) ROW_LABEL.set((r as RowDef).key, (r as RowDef).l);

const STATE_FAMILY: Record<NoteState, StatusFamily> = { new: 'neutral', asked: 'wait', answered: 'ok' };
type Entry = { note: string; state: NoteState; version: number };
const EMPTY: Entry = { note: '', state: 'new', version: 0 };

export function QuestionsTab() {
  const { t } = useTranslation();
  const L = useL();
  const { payload, result, opex, payrollCalc, fmt } = useFinance();
  const [group, setGroup] = useState<GroupId>('sales');
  const [stateFilter, setStateFilter] = useState<'all' | NoteState>('all');
  const [notes, setNotes] = useState<Record<string, Entry>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const chain = useRef<Record<string, Promise<unknown>>>({});

  const loadNotes = useCallback(async () => {
    try {
      const r = await guideApi.notes();
      const m: Record<string, Entry> = {};
      for (const n of r.notes as GuideNote[]) m[n.qid] = { note: n.note, state: n.state, version: n.version };
      setNotes(m); setDrafts({}); setError(null); setLoaded(true);
    } catch (e) { setError(errCode(e)); setLoaded(true); }
  }, []);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const payroll = payrollCalc || payload.payroll;
  const questions = useMemo(() => buildQuestions({
    ref: payload.reference, result, opxG: opex.opxG, payroll, fiscalYear: payload.budget.fiscalYear, fmt,
    label: (k) => { const l = ROW_LABEL.get(k); return l ? (t(`finance.rows.${l}`) as string) : k; },
    L,
  }), [payload.reference, payload.budget.fiscalYear, result, opex.opxG, payroll, fmt, t, L]);

  const mine = questions.filter((q) => q.group === group);
  const stateOf = (id: string) => (notes[id] || EMPTY).state;
  const shown = mine.filter((q) => stateFilter === 'all' || stateOf(q.id) === stateFilter);
  const counts = (g: GroupId) => questions.filter((q) => q.group === g).length;
  const answered = mine.filter((q) => stateOf(q.id) === 'answered').length;

  // Enregistrements d'une même question mis en file : la version lue est toujours la dernière.
  const save = (qid: string, patch: Partial<Pick<Entry, 'note' | 'state'>>) => {
    chain.current[qid] = (chain.current[qid] || Promise.resolve()).then(async () => {
      const cur = notesRef.current[qid] || EMPTY;
      const next = { note: patch.note ?? cur.note, state: patch.state ?? cur.state };
      if (cur.version > 0 && next.note === cur.note && next.state === cur.state) return;
      try {
        const r = await guideApi.saveNote(qid, next.note, next.state, cur.version);
        const entry = { ...next, version: r.version };
        notesRef.current = { ...notesRef.current, [qid]: entry };
        setNotes(notesRef.current);
        setSaved(qid); setError(null);
      } catch (e) {
        const c = errCode(e);
        setError(c);
        if (c === 'conflict') await loadNotes();
      }
    });
  };

  const copy = async (text: string) => {
    if (await copyText(text)) toast.success(L('copied')); else setError('copy_failed');
  };
  const copyGroup = () => copy(L('copyAll', {
    group: L(`group.${group}`), fy: payload.budget.fiscalYear,
    list: shown.map((q, i) => `${i + 1}. ${q.text}`).join('\n'),
  }));

  if (!loaded) return <ContentLoader label={L('loading')} />;
  const errText = error ? (t(`finance.guide.errors.${error}`, { defaultValue: t('finance.guide.errors.generic', { code: error }) }) as string) : null;

  return (
    <div className="space-y-4">
      <p className="m-0 text-[13px] text-body dark:text-bodydark2">{L('questions.intro', { fy: payload.budget.fiscalYear })}</p>
      <p className="m-0 text-[12px] text-body dark:text-bodydark2">{L('questions.privacy')}</p>
      {errText && <InlineError title={errText} onRetry={error === 'conflict' || error === 'network' ? loadNotes : undefined} />}

      <div className={`${CARD} flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        <div className={SEG} role="group" aria-label={L('questions.groups')}>
          {GROUPS.map((g) => (
            <button key={g} type="button" aria-pressed={group === g} className={segBtn(group === g)} onClick={() => setGroup(g)}>
              {L(`group.${g}`)} <span className="text-[11px] opacity-70">({counts(g)})</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-body dark:text-bodydark2">{L('questions.progress', { done: answered, total: mine.length })}</span>
          <div className="w-[160px]">
            <Select
              value={stateFilter}
              onChange={(v) => setStateFilter(v as 'all' | NoteState)}
              options={[{ value: 'all', label: L('questions.filterAll') }, ...(['new', 'asked', 'answered'] as NoteState[]).map((s) => ({ value: s, label: L(`state.${s}`) }))]}
            />
          </div>
          <Button size="sm" variant="secondary" onClick={copyGroup} disabled={!shown.length}>{L('questions.copyGroup')}</Button>
        </div>
      </div>
      <p className="m-0 text-[12px] text-body dark:text-bodydark2">{L(`groupHelp.${group}`)}</p>

      {!shown.length && <div className={`${CARD} p-5 text-[13px] text-body dark:text-bodydark2`}>{L('questions.none')}</div>}
      <ul className="m-0 list-none space-y-3 p-0">
        {shown.map((q) => {
          const e = notes[q.id] || EMPTY;
          const draft = drafts[q.id] ?? e.note;
          return (
            <li key={q.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="m-0 min-w-0 flex-1 text-[14px] leading-snug text-black dark:text-white">{q.text}</p>
                <div className="flex flex-none flex-wrap items-center gap-2">
                  <StatusPill family={STATE_FAMILY[e.state]}>{L(`state.${e.state}`)}</StatusPill>
                  <Button size="xs" variant="secondary" aria-label={`${L('questions.copy')} — ${q.text.slice(0, 60)}`} onClick={() => copy(q.copy)}>{L('questions.copy')}</Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[170px_1fr]">
                <div>
                  <label className="mb-1 block text-xs font-bold text-body dark:text-bodydark2">{L('questions.state')}</label>
                  <Select value={e.state} onChange={(v) => save(q.id, { state: v as NoteState })} options={(['new', 'asked', 'answered'] as NoteState[]).map((s) => ({ value: s, label: L(`state.${s}`) }))} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-body dark:text-bodydark2" htmlFor={`note-${q.id}`}>{L('questions.notes')}</label>
                  <textarea
                    id={`note-${q.id}`}
                    className={TEXTAREA}
                    rows={2}
                    maxLength={4000}
                    value={draft}
                    placeholder={L('questions.notesPlaceholder')}
                    onChange={(ev) => setDrafts((d) => ({ ...d, [q.id]: ev.target.value }))}
                    onBlur={() => { if (drafts[q.id] !== undefined && drafts[q.id] !== e.note) save(q.id, { note: drafts[q.id] }); }}
                  />
                  {saved === q.id && <span aria-live="polite" className="text-[11px] text-body dark:text-bodydark2">{L('questions.saved')}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
