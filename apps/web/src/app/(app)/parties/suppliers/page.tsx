import type { SearchParams } from '../../../../lib/query';
import { PartyListPage } from '../_party/party-pages';

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return <PartyListPage kind="supplier" searchParams={searchParams} />;
}
