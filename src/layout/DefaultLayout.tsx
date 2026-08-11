import React, { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header/index';
import Sidebar from '../components/Sidebar/index';
import ImpersonationBanner from '../components/ImpersonationBanner';
import DemoModeBanner from '../components/DemoModeBanner';
import ConnectionStatusBanner from '../components/ConnectionStatusBanner';
import NewFeatureBanner from '../components/NewFeatureBanner';
import ChatAssistant from '../components/ChatAssistant';
import SofiaTour from '../components/SofiaTour';
import InvoicePreviewHost from '../components/InvoicePreviewHost';
import { ContentLoader } from '../common/Loader';
import { useAuth } from '../context/AuthContext';

const DefaultLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Sofia's CRM starter prompts are only worth showing to someone who can act
  // on them. Resolved here (inside AuthProvider) and passed down, because
  // ChatAssistant is also mounted by the Partner Portal, outside this context.
  const { user } = useAuth();
  const perms = user?.permissions || [];
  const crmEnabled = perms.includes('*') || perms.some((p) => p.startsWith('assistant:crm'));

  return (
    <div className="dark:bg-boxdark-2 dark:text-bodydark">
      {/* <!-- ===== Page Wrapper Start ===== --> */}
      <div className="flex h-screen overflow-hidden">
        {/* <!-- ===== Sidebar Start ===== --> */}
        <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        {/* <!-- ===== Sidebar End ===== --> */}

        {/* <!-- ===== Content Area Start ===== --> */}
        <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
          <ConnectionStatusBanner />
          <ImpersonationBanner />
          <DemoModeBanner />
          {/* <!-- ===== Header Start ===== --> */}
          <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
          {/* <!-- ===== Header End ===== --> */}

          {/* <!-- ===== Main Content Start ===== --> */}
          <main>
            <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
              <NewFeatureBanner />
              {/* La frontière Suspense est ICI, pas autour de toutes les routes.
                  Avant, la seule frontière englobait l'application entière : chaque clic
                  de menu chargeait un module à la demande, donc suspendait TOUT — barre
                  latérale, en-tête, bannières — et les remplaçait par un chargeur plein
                  écran blanc, avant de tout remonter. D'où le clignotement à chaque
                  changement de section, et l'impression d'un rechargement complet.
                  Ici, la coquille reste montée et seul le contenu se renouvelle. */}
              <Suspense fallback={<ContentLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </main>
          {/* <!-- ===== Main Content End ===== --> */}
        </div>
        {/* <!-- ===== Content Area End ===== --> */}
      </div>
      {/* <!-- ===== Page Wrapper End ===== --> */}
      <ChatAssistant crmEnabled={crmEnabled} />
      <SofiaTour />
      <InvoicePreviewHost />
    </div>
  );
};

export default DefaultLayout;