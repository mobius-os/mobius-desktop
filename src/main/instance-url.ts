const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const ALLOWED_PATHS = new Set(['', '/', '/shell', '/shell/']);

export class InstanceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstanceUrlError';
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function normalizeInstanceOrigin(value: string): string {
  const raw = value.trim();
  if (!raw) {
    throw new InstanceUrlError('Enter the address of your Möbius.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InstanceUrlError('Use a complete address, such as https://my-mobius.example.');
  }

  if (parsed.username || parsed.password) {
    throw new InstanceUrlError('Do not put a username or password in the address.');
  }
  if (parsed.search || parsed.hash) {
    throw new InstanceUrlError('Remove the query or fragment from this address.');
  }
  if (!ALLOWED_PATHS.has(parsed.pathname)) {
    throw new InstanceUrlError('Use the main address for this Möbius, not a page inside it.');
  }

  const secureRemote = parsed.protocol === 'https:';
  const loopback = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (!secureRemote && !loopback) {
    throw new InstanceUrlError('Remote Möbius addresses must use HTTPS. HTTP is allowed only on this computer.');
  }

  return parsed.origin;
}

export async function verifyMobiusOrigin(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const origin = normalizeInstanceOrigin(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(`${origin}/api/ready`, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new InstanceUrlError(`Möbius answered with status ${response.status}.`);
    }
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!payload || payload.status !== 'ready') {
      throw new InstanceUrlError('That server answered, but it did not identify itself as a ready Möbius.');
    }
    return origin;
  } catch (error) {
    if (error instanceof InstanceUrlError) throw error;
    if (controller.signal.aborted) {
      throw new InstanceUrlError('Möbius took too long to answer. Check the address and try again.');
    }
    throw new InstanceUrlError('Could not reach a ready Möbius at that address.');
  } finally {
    clearTimeout(timeout);
  }
}
