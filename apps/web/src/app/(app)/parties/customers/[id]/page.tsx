import { PartyDetailPage } from '../../_party/party-pages';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PartyDetailPage kind="customer" params={params} />;
}
