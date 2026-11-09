import { type Query, toQuery } from '../lib/query';
import { LinkButton } from './links';

export function Pager({
  path,
  query,
  nextCursor,
}: {
  path: string;
  query: Query;
  nextCursor: string | null;
}) {
  if (!query['cursor'] && !nextCursor) return null;
  const rest = { ...query, cursor: undefined };
  return (
    <nav className="dax-pager" aria-label="Pages">
      {query['cursor'] ? (
        <LinkButton variant="default" href={`${path}${toQuery(rest)}`}>
          Back to first page
        </LinkButton>
      ) : null}
      {nextCursor ? (
        <LinkButton href={`${path}${toQuery({ ...rest, cursor: nextCursor })}`}>
          Next page
        </LinkButton>
      ) : null}
    </nav>
  );
}
