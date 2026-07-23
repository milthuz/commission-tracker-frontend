import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { usePartnerAuth } from '../../context/PartnerAuthContext';
import { dialog } from '../../lib/dialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('partnerToken')}` });

// SH-32 (co-branding), Partner Admin only — upload the organization's own logo, shown alongside
// the Sales Hub brand. The partners table has carried logo_data/logo_mime_type/logo_file_name
// since Phase 1's schema (unused until now); this is the first UI to use it.
const PartnerOrganization: React.FC = () => {
  const { t } = useTranslation();
  const { user } = usePartnerAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Cache-bust the <img> after a change so the new logo shows immediately.
  const [logoVersion, setLogoVersion] = useState(0);
  const logoUrl = user ? `${API_URL}/api/partner-portal/organization/logo/${user.partnerId}?v=${logoVersion}` : '';

  const pickFile = () => fileInput.current?.click();

  const uploadLogo = async (file: File) => {
    if (!/^image\//.test(file.type)) { dialog.alert(t('partnerPortal.organization.mustBeImage') as string); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await axios.post(`${API_URL}/api/partner-portal/organization/logo`, fd, { headers: authHeaders() });
      setLogoVersion((v) => v + 1);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('partnerPortal.organization.uploadFailed') as string);
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = async () => {
    if (!(await dialog.confirm(t('partnerPortal.organization.removeConfirm') as string))) return;
    try {
      await axios.delete(`${API_URL}/api/partner-portal/organization/logo`, { headers: authHeaders() });
      setLogoVersion((v) => v + 1);
    } catch (e: any) {
      dialog.alert(e?.response?.data?.error || t('partnerPortal.organization.removeFailed') as string);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-title-md2 font-semibold text-black dark:text-white">{t('partnerPortal.sidebar.organization')}</h1>
        <p className="text-sm text-body">{user?.partnerName}</p>
      </div>

      <div className="max-w-xl rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-7 py-4 dark:border-strokedark">
          <h3 className="text-lg font-semibold text-black dark:text-white">{t('partnerPortal.organization.logoTitle')}</h3>
          <p className="mt-1 text-sm text-body">{t('partnerPortal.organization.logoSubtitle')}</p>
        </div>
        <div className="p-7">
          <div className="flex items-center gap-5">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-stroke bg-gray-2 dark:border-strokedark dark:bg-meta-4 overflow-hidden">
              <img
                key={logoVersion}
                src={logoUrl}
                alt={user?.partnerName || ''}
                className="h-full w-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                onLoad={(e) => { (e.target as HTMLImageElement).style.visibility = 'visible'; }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }}
              />
              <button
                onClick={pickFile}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-opacity-90 disabled:opacity-50"
              >
                {uploading ? t('common.saving') : t('partnerPortal.organization.uploadButton')}
              </button>
              <button
                onClick={removeLogo}
                className="inline-flex items-center gap-2 rounded-md border border-stroke px-5 py-2.5 text-sm font-medium text-danger hover:bg-danger hover:text-white dark:border-strokedark"
              >
                {t('partnerPortal.organization.removeButton')}
              </button>
              <p className="text-xs text-body">{t('partnerPortal.organization.logoHint')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerOrganization;
