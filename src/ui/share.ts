// Shareable links: the program travels in the URL fragment as
// base64url-encoded UTF-8, e.g. `#program=Zm4gbWFpbi...`.

const FRAGMENT_PREFIX = '#program=';

export function encodeProgramToHash(source: string): string {
  const bytes = new TextEncoder().encode(source);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64url = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return FRAGMENT_PREFIX + base64url;
}

/** Decode a `location.hash` value; null for missing or malformed fragments. */
export function decodeProgramFromHash(hash: string): string | null {
  if (!hash.startsWith(FRAGMENT_PREFIX)) return null;
  const base64 = hash
    .slice(FRAGMENT_PREFIX.length)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function isProgramHash(hash: string): boolean {
  return hash.startsWith(FRAGMENT_PREFIX);
}
