import { useMemo, useState } from 'react';

/** Paginates an already-fetched array client-side. Resets to page 1 whenever
 * the array reference changes as a result of a filter/search/tab switch that
 * shrinks the result set below the current page. */
export function usePagination<T>(items: T[] | undefined, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = items?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return (items ?? []).slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return { page: safePage, setPage, totalPages, total, pageItems };
}
