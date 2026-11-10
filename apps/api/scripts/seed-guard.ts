const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The seed scripts are for a developer's own database only. */
export function assertLocalDatabase(url: string): void {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('The database URL is not valid.');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run against ${host}. The stores seed only runs on a local database.`,
    );
  }
}
