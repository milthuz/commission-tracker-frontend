import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SalesHubLogo from '../../components/SalesHubLogo';

// Bilingual Privacy Policy for Sales Hub — an internal sales & commission tool
// operated by Cluster Systems. Note: reasonable internal-tool policy, not legal advice.
type Section = { title: string; body: string[] };
const CONTENT: Record<'en' | 'fr', { effective: string; intro: string; sections: Section[]; contact: string }> = {
  en: {
    effective: 'Effective date: June 9, 2026',
    intro:
      'This Privacy Policy explains how Cluster Systems Inc. ("Cluster", "we", "us") collects, uses, and protects personal data when you use Sales Hub (the "Service"), our internal sales and commission management application. It applies to Cluster employees, representatives, and authorized partners who sign in to the Service.',
    sections: [
      { title: '1. Data we collect', body: [
        'Account & identity: your name, email address, and profile details from the Zoho account you sign in with, plus authentication tokens needed to keep you signed in.',
        'Sales & commission data: invoices, deals, merchant activations, commissions, pay stubs, and related records synced from connected systems (Zoho Books, Zoho CRM, Zentact).',
        'Usage & technical data: actions you take in the Service (e.g. logins, approvals, imports), along with technical information such as IP address and browser type used for security and diagnostics.',
      ]},
      { title: '2. How we use your data', body: [
        'To authenticate you and keep your session secure; to display your sales, commissions, and reports; to compute pay stubs and reconcile payouts; to administer roles and access; and to operate, secure, and improve the Service.',
      ]},
      { title: '3. Why we process it', body: [
        'We process this data to manage our relationship with you (employment or partnership) and for our legitimate business interest in operating a sales and commission program.',
      ]},
      { title: '4. Where the data comes from', body: [
        'Data is collected directly from you (when you sign in and use the Service) and from connected business systems — Zoho Books, Zoho CRM, and Zentact — that Cluster already uses to run its business.',
      ]},
      { title: '5. How we share data', body: [
        'We do not sell your personal data. Within Cluster, sales and commission data may be visible to authorized administrators and managers according to role-based permissions.',
        'We share data with service providers who host and operate the Service on our behalf (e.g. application hosting, database, and Zoho), acting as our processors. We may also disclose data where required by law.',
      ]},
      { title: '6. Data retention', body: [
        'We keep your data for as long as you have access to the Service and as needed for legitimate business, accounting, and legal purposes, after which it is deleted or anonymized.',
      ]},
      { title: '7. Security', body: [
        'We protect data with access controls, role-based permissions, and encryption of data in transit. No system is perfectly secure, but we take reasonable measures to safeguard your information.',
      ]},
      { title: '8. Your rights', body: [
        'Depending on your jurisdiction (including Québec’s Law 25 and Canada’s PIPEDA), you may have the right to access, correct, or request deletion of your personal data. To exercise these rights, contact your Cluster administrator or use the contact below.',
      ]},
      { title: '9. Changes to this policy', body: [
        'We may update this Privacy Policy from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised policy.',
      ]},
    ],
    contact: 'Questions about this policy or your data? Contact Cluster Systems at saleshub@clustersystems.com.',
  },
  fr: {
    effective: 'Date d’entrée en vigueur : 9 juin 2026',
    intro:
      'La présente Politique de confidentialité explique comment Cluster Systems Inc. (« Cluster », « nous ») collecte, utilise et protège les données personnelles lorsque vous utilisez Sales Hub (le « Service »), notre application interne de gestion des ventes et des commissions. Elle s’applique aux employés, représentants et partenaires autorisés de Cluster qui se connectent au Service.',
    sections: [
      { title: '1. Données que nous collectons', body: [
        'Compte et identité : votre nom, votre adresse courriel et les détails de profil provenant du compte Zoho utilisé pour vous connecter, ainsi que les jetons d’authentification nécessaires au maintien de votre session.',
        'Données de ventes et de commissions : factures, transactions, activations de marchands, commissions, bulletins de paie et données associées synchronisées depuis les systèmes connectés (Zoho Books, Zoho CRM, Zentact).',
        'Données d’utilisation et techniques : les actions que vous effectuez dans le Service (connexions, approbations, imports, etc.) ainsi que des informations techniques telles que l’adresse IP et le type de navigateur, utilisées à des fins de sécurité et de diagnostic.',
      ]},
      { title: '2. Comment nous utilisons vos données', body: [
        'Pour vous authentifier et sécuriser votre session ; pour afficher vos ventes, commissions et rapports ; pour calculer les bulletins de paie et réconcilier les versements ; pour administrer les rôles et les accès ; et pour exploiter, sécuriser et améliorer le Service.',
      ]},
      { title: '3. Pourquoi nous les traitons', body: [
        'Nous traitons ces données pour gérer notre relation avec vous (emploi ou partenariat) et dans notre intérêt commercial légitime à exploiter un programme de ventes et de commissions.',
      ]},
      { title: '4. Provenance des données', body: [
        'Les données sont collectées directement auprès de vous (lorsque vous vous connectez et utilisez le Service) et auprès des systèmes d’affaires connectés — Zoho Books, Zoho CRM et Zentact — que Cluster utilise déjà pour ses activités.',
      ]},
      { title: '5. Partage des données', body: [
        'Nous ne vendons pas vos données personnelles. Au sein de Cluster, les données de ventes et de commissions peuvent être visibles par les administrateurs et gestionnaires autorisés selon les permissions basées sur les rôles.',
        'Nous partageons des données avec des fournisseurs de services qui hébergent et exploitent le Service en notre nom (hébergement applicatif, base de données et Zoho), agissant comme nos sous-traitants. Nous pouvons également divulguer des données lorsque la loi l’exige.',
      ]},
      { title: '6. Conservation des données', body: [
        'Nous conservons vos données tant que vous avez accès au Service et aussi longtemps que nécessaire à des fins commerciales, comptables et légales légitimes, après quoi elles sont supprimées ou anonymisées.',
      ]},
      { title: '7. Sécurité', body: [
        'Nous protégeons les données par des contrôles d’accès, des permissions basées sur les rôles et le chiffrement des données en transit. Aucun système n’est parfaitement sécurisé, mais nous prenons des mesures raisonnables pour protéger vos informations.',
      ]},
      { title: '8. Vos droits', body: [
        'Selon votre territoire (notamment la Loi 25 du Québec et la LPRPDE au Canada), vous pouvez avoir le droit d’accéder à vos données personnelles, de les corriger ou d’en demander la suppression. Pour exercer ces droits, contactez votre administrateur Cluster ou utilisez les coordonnées ci-dessous.',
      ]},
      { title: '9. Modifications de la politique', body: [
        'Nous pouvons mettre à jour la présente Politique de confidentialité de temps à autre. La poursuite de l’utilisation du Service après l’entrée en vigueur des modifications vaut acceptation de la politique révisée.',
      ]},
    ],
    contact: 'Des questions sur cette politique ou vos données ? Contactez Cluster Systems à saleshub@clustersystems.com.',
  },
};

const PrivacyPolicy = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const c = CONTENT[lang];
  // See TermsOfService.tsx's matching comment: ?from=partner is what survives the new-tab
  // navigation from either login page, so it's threaded through both cross-links here too.
  const [params] = useSearchParams();
  const fromPartner = params.get('from') === 'partner';
  const termsHref = fromPartner ? '/terms?from=partner' : '/terms';
  const backToLoginHref = fromPartner ? '/partner-portal/login' : '/auth/zoho-login';

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 dark:bg-boxdark-2">
      <div className="mx-auto w-full max-w-3xl">
        <div className="overflow-hidden rounded-lg border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between gap-4 border-b border-stroke px-6 py-5 dark:border-strokedark">
            <SalesHubLogo variant="horizontal" className="h-7" textClassName="text-black dark:text-white" />
            <div className="flex items-center gap-5">
              <Link to={termsHref} className="text-sm font-medium text-primary hover:underline">
                {t('legal.termsTitle')}
              </Link>
              <Link to={backToLoginHref} className="text-sm font-medium text-primary hover:underline">
                {t('legal.backToLogin')}
              </Link>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <h1 className="text-2xl font-bold text-black dark:text-white">{t('legal.privacyTitle')}</h1>
            <p className="mt-1 text-sm text-body">{c.effective}</p>

            <p className="mt-6 text-sm leading-relaxed text-black dark:text-bodydark">{c.intro}</p>

            <div className="mt-8 space-y-6">
              {c.sections.map((s) => (
                <section key={s.title}>
                  <h2 className="text-base font-semibold text-black dark:text-white">{s.title}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-2 text-sm leading-relaxed text-body">{p}</p>
                  ))}
                </section>
              ))}
            </div>

            <p className="mt-8 border-t border-stroke pt-6 text-sm text-body dark:border-strokedark">{c.contact}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
