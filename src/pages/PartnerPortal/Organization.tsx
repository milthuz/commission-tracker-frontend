import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { Button, InlineError, toast, dialog } from '../../components/ui';
import { portalError } from './serverError';
import PartnerPageHeader from './PageHeader';
import PartnerAdminOnly from './AdminOnly';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

// SH-32 (co-branding), Partner Admin only — upload the organization's own logo, shown alongside
// the Cluster brand. The partners table has carried logo_data/logo_mime_type/logo_file_name
// since Phase 1's schema (unused until now); this is the first UI to use it.
const PartnerOrganizationScreen: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Cache-bust the <img> after a change so the new logo shows immediately.
  const [logoVersion, setLogoVersion] = useState(0);
  // Whether a logo currently exists at all — drives the sidebar-preview section below;
  // reset to true on every upload/remove so a fresh <img> gets a fresh chance to load.
  const [logoOk, setLogoOk] = useState(true);
  // Errors stay in the page, with their cause (refonte UI : jamais une alerte bloquante).
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
  const logoUrl = user ? `${API_URL}/api/partner-portal/organization/logo/${user.partnerId}?v=${logoVersion}` : '';

  const pickFile = () => fileInput.current?.click();
  const failure = (e: any, key: string) => {
    const title = t(key) as string;
    const msg = portalError(e?.response?.data?.error, t, title);
    setError({ title, detail: msg !== title ? msg : undefined });
  };

  const uploadLogo = async (file: File) => {
    setError(null);
    if (!/^image\//.test(file.type)) { setError({ title: t('partnerPortal.organization.mustBeImage') as string }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API_URL}/api/partner-portal/organization/logo`, fd, { headers: authHeaders() });
      setLogoVersion((v) => v + 1);
      setLogoOk(true);
      toast.success(t('partnerPortal.organization.uploaded'));
    } catch (e: any) {
      failure(e, 'partnerPortal.organization.uploadFailed');
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!(await dialog.confirm(t('partnerPortal.organization.removeConfirm') as string, {
      danger: true, confirmText: t('partnerPortal.organization.removeButton') as string,
    }))) return;
    setError(null);
    try {
      await axios.delete(`${API_URL}/api/partner-portal/organization/logo`, { headers: authHeaders() });
      setLogoVersion((v) => v + 1);
      setLogoOk(false);
      toast.success(t('partnerPortal.organization.removed'));
    } catch (e: any) {
      failure(e, 'partnerPortal.organization.removeFailed');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PartnerPageHeader eyebrow={user?.partnerName} title={t('partnerPortal.sidebar.organization')} />

      <section className="max-w-xl rounded-2xl border border-stroke bg-white dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-4 py-4 dark:border-strokedark sm:px-6">
          <h2 className="m-0 text-base font-bold text-black dark:text-white">{t('partnerPortal.organization.logoTitle')}</h2>
          <p className="m-0 mt-1 text-[13px] text-body dark:text-bodydark2">{t('partnerPortal.organization.logoSubtitle')}</p>
        </div>
        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stroke bg-gray-2 dark:border-strokedark dark:bg-meta-4">
              <img
                key={logoVersion}
                src={logoUrl}
                alt={user?.partnerName || ''}
                className="h-full w-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                onLoad={(e) => { (e.target as HTMLImageElement).style.visibility = 'visible'; }}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="md" onClick={pickFile} disabled={uploading}>
                  {uploading ? t('common.saving') : t('partnerPortal.organization.uploadButton')}
                </Button>
                {logoOk && (
                  <Button size="md" onClick={removeLogo} className="!text-[#D92D20] dark:!text-[#F46060]">
                    {t('partnerPortal.organization.removeButton')}…
                  </Button>
                )}
              </div>
              <p className="m-0 text-xs text-body dark:text-bodydark2">{t('partnerPortal.organization.logoHint')}</p>
            </div>
          </div>

          {error && <InlineError title={error.title} detail={error.detail} />}

          {/* Exact WYSIWYG of PartnerSidebar.tsx's co-brand card (same classes, same dark
              backdrop) — since any uploaded file could be light, dark, wide, square, or already
              on a white background, the only reliable way to catch a bad-looking result (e.g. a
              white logo vanishing into the white card) is to show the real thing right here,
              not a generic square preview. */}
          {logoOk && (
            <div className="border-t border-stroke pt-4 dark:border-strokedark">
              <p className="m-0 mb-3 text-xs font-bold text-body dark:text-bodydark2">{t('partnerPortal.organization.previewLabel')}</p>
              <div className="inline-block max-w-full rounded-xl bg-[#0F0F10] p-4">
                <p className="m-0 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#8a99af]">
                  {t('partnerPortal.sidebar.partneredWith')}
                </p>
                <div className="inline-flex max-h-14 max-w-full items-center justify-center rounded-lg border border-black/5 bg-white px-3 py-2 shadow-sm">
                  <img
                    key={`preview-${logoVersion}`}
                    src={logoUrl}
                    alt={user?.partnerName || ''}
                    className="max-h-8 max-w-[144px] object-contain"
                    onError={() => setLogoOk(false)}
                  />
                </div>
              </div>
              <p className="m-0 mt-3 text-xs text-body dark:text-bodydark2">{t('partnerPortal.organization.previewHint')}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

const PartnerOrganization: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  return (
    <PartnerAdminOnly fallbackHeader={<PartnerPageHeader eyebrow={user?.partnerName} title={t('partnerPortal.sidebar.organization')} />}>
      <PartnerOrganizationScreen />
    </PartnerAdminOnly>
  );
};

export default PartnerOrganization;
