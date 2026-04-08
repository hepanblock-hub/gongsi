export function sanitizeSnapshotSlug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9/_ .-]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/, '/')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

export function sanitizeSnapshotPath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').map((part, index, arr) => {
    if (index === arr.length - 1) {
      const dot = part.lastIndexOf('.');
      if (dot <= 0) return sanitizeSnapshotSlug(part);
      const base = part.slice(0, dot);
      const ext = part.slice(dot).toLowerCase();
      return `${sanitizeSnapshotSlug(base)}${ext}`;
    }
    return sanitizeSnapshotSlug(part);
  });
  return parts.join('/');
}
