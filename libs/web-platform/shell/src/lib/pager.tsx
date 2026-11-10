import Link from 'next/link';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@dax/contracts';
import { Icon } from './icon';

const count = new Intl.NumberFormat('en-LK');

/**
 * Page numbers to show: always the first and last, the current page and its
 * neighbours, with gaps marked as null. 1 … 4 5 6 … 12
 */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  // Near either end, show enough numbers that a single gap never hides one page.
  if (page <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((n) => keep.add(n));
  const sorted = [...keep].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1);
    else if (prev !== undefined && n - prev > 2) out.push(null);
    out.push(n);
  });
  return out;
}

/**
 * Numbered pages under a list: "Showing 26–50 of 132", page links and a
 * rows-per-page choice. Plain links, so it works without JavaScript and keeps
 * the page's other filters in the URL.
 */
export function Pager({
  path,
  query,
  total,
  page,
  limit,
}: {
  /** The list page's path, without a query string. */
  path: string;
  /** The page's current search params (filters are kept on every link). */
  query: Record<string, string | undefined>;
  total: number;
  page: number;
  limit: number;
}) {
  // Nothing to page through: the whole list fits on the smallest page.
  if (total <= PAGE_SIZES[0] && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / limit));
  const href = (p: number, size = limit) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value && key !== 'page' && key !== 'limit' && key !== 'cursor') {
        params.set(key, value);
      }
    }
    if (p > 1) params.set('page', String(p));
    if (size !== DEFAULT_PAGE_SIZE) params.set('limit', String(size));
    const text = params.toString();
    return text ? `${path}?${text}` : path;
  };
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(total, page * limit);

  return (
    <nav className="dax-pager" aria-label="Pages">
      <span className="dax-pager-info">
        {first > total
          ? `Page ${page} is past the end`
          : `Showing ${count.format(first)}–${count.format(last)} of ${count.format(total)}`}
      </span>
      {pages > 1 || page > 1 ? (
        <span className="dax-pager-pages">
          {page > 1 ? (
            <Link href={href(Math.min(page - 1, pages))} className="dax-pager-step" aria-label="Previous page">
              <Icon name="back" size={16} />
            </Link>
          ) : (
            <span className="dax-pager-step" aria-disabled="true">
              <Icon name="back" size={16} />
            </span>
          )}
          {pageNumbers(Math.min(page, pages), pages).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="dax-pager-gap" aria-hidden="true">
                …
              </span>
            ) : (
              <Link
                key={n}
                href={href(n)}
                className="dax-pager-num"
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
              >
                {n}
              </Link>
            ),
          )}
          {page < pages ? (
            <Link href={href(page + 1)} className="dax-pager-step next" aria-label="Next page">
              <Icon name="back" size={16} />
            </Link>
          ) : (
            <span className="dax-pager-step next" aria-disabled="true">
              <Icon name="back" size={16} />
            </span>
          )}
        </span>
      ) : null}
      <span className="dax-pager-sizes">
        Rows
        {PAGE_SIZES.map((size) => (
          <Link
            key={size}
            href={href(1, size)}
            className="dax-pager-num"
            aria-current={size === limit ? 'true' : undefined}
            aria-label={`${size} rows per page`}
          >
            {size}
          </Link>
        ))}
      </span>
    </nav>
  );
}
