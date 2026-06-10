import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ClusterLogo from '../../images/logo/cluster-on-light.svg';

// Bilingual Terms of Service for Sales Hub — an internal sales & commission tool
// operated by Cluster Systems. Authorized employees/partners sign in with Zoho SSO.
// Note: this is a reasonable internal-tool ToS, not legal advice — have counsel review.
type Section = { title: string; body: string[] };
const CONTENT: Record<'en' | 'fr', { effective: string; intro: string; sections: Section[]; contact: string }> = {
  en: {
    effective: 'Effective date: June 9, 2026',
    intro:
      'These Terms of Service ("Terms") govern your access to and use of Sales Hub (the "Service"), an internal sales and commission management application operated by Cluster Systems Inc. ("Cluster", "we", "us"). By signing in to the Service, you agree to these Terms.',
    sections: [
      { title: '1. Eligibility & access', body: [
        'The Service is provided solely to Cluster employees, representatives, and authorized partners. Access is granted through your Zoho account (single sign-on) and may be revoked at any time.',
        'You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account.',
      ]},
      { title: '2. Permitted use', body: [
        'You may use the Service only for legitimate business purposes related to your role, including viewing and managing sales, commissions, and related reporting.',
        'You agree not to misuse the Service, attempt to access data you are not authorized to view, interfere with its operation, or use it to violate any applicable law.',
      ]},
      { title: '3. Confidentiality', body: [
        'Sales figures, commission data, customer information, and any other data accessible through the Service are confidential and proprietary to Cluster. You must not disclose, export, or share this data outside of authorized business use.',
      ]},
      { title: '4. Accuracy of information', body: [
        'Commission amounts, pay stubs, and reports are generated from synced source systems and the Service’s commission model. They are provided for tracking and reconciliation purposes and do not constitute a final or binding statement of compensation. Actual payouts are determined by Cluster according to its compensation policies.',
      ]},
      { title: '5. Intellectual property', body: [
        'The Service, including its software, design, and content, is owned by Cluster Systems Inc. and is protected by applicable intellectual property laws. These Terms do not grant you any ownership rights in the Service.',
      ]},
      { title: '6. Data & privacy', body: [
        'Your use of the Service is also governed by our Privacy Policy, which describes how personal data is collected and processed.',
      ]},
      { title: '7. Availability', body: [
        'The Service is provided on an "as is" and "as available" basis. We may modify, suspend, or discontinue any part of the Service at any time without notice. To the fullest extent permitted by law, Cluster disclaims all warranties and is not liable for any indirect or consequential damages arising from use of the Service.',
      ]},
      { title: '8. Termination', body: [
        'Your access ends automatically when your relationship with Cluster ends, or earlier at Cluster’s discretion. Provisions relating to confidentiality and intellectual property survive termination.',
      ]},
      { title: '9. Changes to these Terms', body: [
        'We may update these Terms from time to time. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.',
      ]},
    ],
    contact: 'Questions about these Terms? Contact Cluster Systems at saleshub@clustersystems.com.',
  },
  fr: {
    effective: 'Date d’entrée en vigueur : 9 juin 2026',
    intro:
      'Les présentes conditions d’utilisation (« Conditions ») régissent votre accès à Sales Hub (le « Service ») et son utilisation, une application interne de gestion des ventes et des commissions exploitée par Cluster Systems Inc. (« Cluster », « nous »). En vous connectant au Service, vous acceptez les présentes Conditions.',
    sections: [
      { title: '1. Admissibilité et accès', body: [
        'Le Service est destiné uniquement aux employés, représentants et partenaires autorisés de Cluster. L’accès est accordé via votre compte Zoho (authentification unique) et peut être révoqué à tout moment.',
        'Vous êtes responsable de la confidentialité de vos identifiants et de toute activité effectuée sous votre compte.',
      ]},
      { title: '2. Utilisation permise', body: [
        'Vous ne pouvez utiliser le Service qu’à des fins professionnelles légitimes liées à votre rôle, notamment la consultation et la gestion des ventes, des commissions et des rapports associés.',
        'Vous vous engagez à ne pas détourner le Service, à ne pas tenter d’accéder à des données que vous n’êtes pas autorisé à consulter, à ne pas nuire à son fonctionnement ni à l’utiliser en violation de toute loi applicable.',
      ]},
      { title: '3. Confidentialité', body: [
        'Les chiffres de vente, les données de commission, les renseignements sur les clients et toute autre donnée accessible via le Service sont confidentiels et appartiennent à Cluster. Vous ne devez pas divulguer, exporter ni partager ces données en dehors d’un usage professionnel autorisé.',
      ]},
      { title: '4. Exactitude des informations', body: [
        'Les montants de commission, les bulletins de paie et les rapports sont générés à partir des systèmes sources synchronisés et du modèle de commission du Service. Ils sont fournis à des fins de suivi et de réconciliation et ne constituent pas un relevé définitif ou contraignant de la rémunération. Les versements réels sont déterminés par Cluster selon ses politiques de rémunération.',
      ]},
      { title: '5. Propriété intellectuelle', body: [
        'Le Service, y compris son logiciel, sa conception et son contenu, appartient à Cluster Systems Inc. et est protégé par les lois applicables sur la propriété intellectuelle. Les présentes Conditions ne vous confèrent aucun droit de propriété sur le Service.',
      ]},
      { title: '6. Données et vie privée', body: [
        'Votre utilisation du Service est également régie par notre Politique de confidentialité, qui décrit la façon dont les données personnelles sont collectées et traitées.',
      ]},
      { title: '7. Disponibilité', body: [
        'Le Service est fourni « tel quel » et « selon disponibilité ». Nous pouvons modifier, suspendre ou interrompre toute partie du Service à tout moment sans préavis. Dans la mesure permise par la loi, Cluster décline toute garantie et n’est pas responsable des dommages indirects ou consécutifs découlant de l’utilisation du Service.',
      ]},
      { title: '8. Résiliation', body: [
        'Votre accès prend fin automatiquement lorsque votre relation avec Cluster prend fin, ou plus tôt à la discrétion de Cluster. Les dispositions relatives à la confidentialité et à la propriété intellectuelle survivent à la résiliation.',
      ]},
      { title: '9. Modifications des Conditions', body: [
        'Nous pouvons mettre à jour les présentes Conditions de temps à autre. La poursuite de l’utilisation du Service après l’entrée en vigueur des modifications vaut acceptation des Conditions révisées.',
      ]},
    ],
    contact: 'Des questions sur ces Conditions ? Contactez Cluster Systems à saleshub@clustersystems.com.',
  },
};

const TermsOfService = () => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en';
  const c = CONTENT[lang];

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 dark:bg-boxdark-2">
      <div className="mx-auto w-full max-w-3xl">
        <div className="overflow-hidden rounded-lg border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
          <div className="flex items-center justify-between gap-4 border-b border-stroke px-6 py-5 dark:border-strokedark">
            <img src={ClusterLogo} alt="Cluster" className="h-8 w-auto" />
            <div className="flex items-center gap-5">
              <Link to="/privacy" className="text-sm font-medium text-primary hover:underline">
                {t('legal.privacyTitle')}
              </Link>
              <Link to="/auth/zoho-login" className="text-sm font-medium text-primary hover:underline">
                {t('legal.backToLogin')}
              </Link>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <h1 className="text-2xl font-bold text-black dark:text-white">{t('legal.termsTitle')}</h1>
            <p className="mt-1 text-sm text-body">{c.effective}</p>

            <p className="mt-6 text-sm leading-relaxed text-black dark:text-bodydark">{c.intro}</p>

            <div className="mt-8 space-y-6">
              {c.sections.map((s) => (
                <section key={s.title}>
                  <h2 className="text-base font-semibold text-black dark:text-white">{s.title}</h2>
                  {s.body.map((p, i) => (
                    <p key={i} className="mt-2 text-sm leading-relaxed text-body">{p}</p>
                  ))}
                  {s.title.startsWith('6.') && (
                    <p className="mt-2 text-sm leading-relaxed text-body">
                      <Link to="/privacy" className="font-medium text-primary hover:underline">
                        {t('legal.privacyTitle')} →
                      </Link>
                    </p>
                  )}
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

export default TermsOfService;
