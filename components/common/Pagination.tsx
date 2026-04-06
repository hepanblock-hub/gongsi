type PaginationProps = {
  basePath: string;
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string | undefined>;
};

function buildHref(basePath: string, page: number, query: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v && v.trim()) sp.set(k, v);
  });
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default function Pagination({ basePath, page, pageSize, total, query = {} }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  return (
    <nav className="pagination" aria-label="Pagination">
      <a href={buildHref(basePath, prevPage, query)} data-disabled={page <= 1 ? 'true' : 'false'}>Previous</a>
      <span>Page {page} of {totalPages}</span>
      <a href={buildHref(basePath, nextPage, query)} data-disabled={page >= totalPages ? 'true' : 'false'}>Next</a>
    </nav>
  );
}
