import SalesHubLogo from '../../components/SalesHubLogo';
import ClusterWordmark from '../../components/ClusterWordmark';
import PageTitle from '../../components/PageTitle';
import { useClusterFavicon } from '../../hooks/useClusterFavicon';

// Brand mark at the top of the legal pages. Opened from the partner portal (?from=partner) they
// are partner-facing, so they wear the CLUSTER brand — wordmark, tab icon and « | Cluster » tab
// title — like the portal's other public pages; otherwise Sales Hub.
const PartnerBrand = ({ titleKey }: { titleKey: string }) => {
  useClusterFavicon();
  return (
    <>
      {/* Rendered after App's own <PageTitle> (Sales Hub suffix), so its title wins. */}
      <PageTitle titleKey={titleKey} suffix="Cluster" />
      <ClusterWordmark className="h-7 w-auto" />
    </>
  );
};

const LegalBrand = ({ fromPartner, titleKey }: { fromPartner: boolean; titleKey: string }) =>
  fromPartner
    ? <PartnerBrand titleKey={titleKey} />
    : <SalesHubLogo variant="horizontal" className="h-7" textClassName="text-black dark:text-white" />;

export default LegalBrand;
