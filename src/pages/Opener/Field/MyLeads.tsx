import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users, Pencil } from 'lucide-react';
import { TabBar, useField } from './index';
import { Card, Eyebrow } from './ui';
import { api } from '../api';
import { statusTone, type LeadStatus } from '../../Leads/types';

// Onglet « Leads » — les pistes créées par l'opener sur le terrain, avec leur statut (révision,
// acceptée, doublon…). Statut et couleurs : ceux du module Pistes.

interface MyLead { id: number; refCode: string; businessName: string; status: LeadStatus; interest: string[]; level: number | null; createdAt: string }

export default function MyLeads() {
  const { t } = useTranslation();
  const { lng } = useField();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<MyLead[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ leads: MyLead[] }>('/api/opener/my-leads').then((r) => setLeads(r.leads)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="px-4 pb-28" style={{ paddingTop: 'calc(var(--of-top, env(safe-area-inset-top, 0px)) + 20px)' }}>
      <Eyebrow>{t('opener.field.tabs.leads')}</Eyebrow>
      <h1 className="mb-4 text-2xl font-bold tracking-[-0.01em] text-[var(--of-title)]">{t('opener.field.myLeads')}</h1>
      {!leads && !error && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
      {error && <p className="text-sm text-[var(--of-bad)]">{error}</p>}
      {leads && !leads.length && (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-[var(--of-muted)]"><Users className="h-8 w-8 text-[var(--of-faint)]" />{t('opener.field.noLeads')}</div>
      )}
      <div className="space-y-2">
        {leads?.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-[var(--of-title)]">{l.businessName}</p>
                <p className="text-xs text-[var(--of-faint)]">
                  {[l.refCode, l.interest.map((i) => t(`opener.serviceOf.${i}`, { defaultValue: i })).join(', ') || null,
                    l.level ? t('opener.field.interestShort', { n: l.level }) : null,
                    new Date(l.createdAt).toLocaleDateString(lng === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[l.status] || ''}`}>{t(`leads.status.${l.status}`, { defaultValue: l.status })}</span>
            </div>
            {/* Corrigeable tant que personne ne l'a révisée (demande de Hao, 2026-10-12). */}
            {(l.status === 'new' || l.status === 'in_review') && (
              <button onClick={() => navigate(`/opener/leads/${l.id}/edit`)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary"><Pencil className="h-3 w-3" />{t('opener.field.editLead.cta')}</button>
            )}
          </Card>
        ))}
      </div>
      <TabBar />
    </div>
  );
}
