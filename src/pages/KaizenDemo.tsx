import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Streams the Kaizen POS (hosted on AWS AppStream 2.0) inside an iframe so reps can run a live demo.
// The backend mints a short-lived signed streaming URL; the AppStream stack must have embedding
// enabled with this app's domain allow-listed.
const KaizenDemo: React.FC = () => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const launch = async () => {
    setLoading(true); setError(null);
    try {
      const r = await axios.post(`${API_URL}/api/demo/kaizen-url`, {}, { headers: authHeaders() });
      setUrl(r.data.url);
    } catch (e: any) {
      const code = e?.response?.data?.error;
      setError(code === 'demo_not_configured' ? t('kaizenDemo.notConfigured') : (e?.response?.data?.detail || t('kaizenDemo.error')));
    } finally { setLoading(false); }
  };

  const fullscreen = () => { frameRef.current?.requestFullscreen?.(); };

  return (
    <div className="mx-auto max-w-screen-2xl">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white">{t('kaizenDemo.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('kaizenDemo.subtitle')}</p>
        </div>
        {url && (
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={fullscreen} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              {t('kaizenDemo.fullscreen')}
            </button>
            <button onClick={launch} className="inline-flex items-center gap-2 rounded-lg border border-stroke bg-white px-3 py-2.5 text-sm font-medium text-body hover:bg-gray-1 dark:border-strokedark dark:bg-boxdark dark:hover:bg-meta-4">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {t('kaizenDemo.relaunch')}
            </button>
          </div>
        )}
      </div>

      {!url ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-stroke bg-white p-10 text-center shadow-default dark:border-strokedark dark:bg-boxdark" style={{ minHeight: '50vh' }}>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" /></svg>
          </div>
          <p className="mb-1 text-lg font-semibold text-black dark:text-white">{t('kaizenDemo.readyTitle')}</p>
          <p className="mb-6 max-w-md text-sm text-gray-500 dark:text-gray-400">{t('kaizenDemo.readyHint')}</p>
          {error && <p className="mb-4 max-w-md rounded-lg bg-danger/10 px-4 py-2 text-sm text-danger">{error}</p>}
          <button onClick={launch} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-opacity-90 disabled:opacity-50">
            {loading ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />{t('kaizenDemo.launching')}</>
            ) : (
              <><svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>{t('kaizenDemo.launch')}</>
            )}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-stroke bg-black shadow-default dark:border-strokedark">
          <iframe
            ref={frameRef}
            src={url}
            title="Kaizen POS"
            className="w-full"
            style={{ height: 'calc(100vh - 220px)', minHeight: 480, border: 0 }}
            allow="fullscreen; clipboard-read; clipboard-write; microphone; camera"
          />
        </div>
      )}
    </div>
  );
};

export default KaizenDemo;
