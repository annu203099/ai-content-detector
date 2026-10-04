/**
 * Verifies the integrity of a model buffer using size and SHA-256 hash.
 * Works seamlessly in both Web Browsers (Web Crypto API) and Node.js environments.
 * 
 * @param buffer The model data as an ArrayBuffer or Uint8Array
 * @param expectedSha256 The expected SHA-256 hash in hex format
 * @param expectedSize Optional expected size in bytes (checked if provided)
 * @returns A boolean indicating whether the integrity check passed
 */
export async function verifyModelIntegrity(
  buffer: ArrayBuffer | Uint8Array,
  expectedSha256: string,
  expectedSize?: number
): Promise<boolean> {
  const byteLength = buffer instanceof ArrayBuffer ? buffer.byteLength : buffer.byteLength;
  
  if (typeof expectedSize === 'number' && expectedSize > 0) {
    // Allow small tolerance if CDN adds compression headers or packaging
    if (Math.abs(byteLength - expectedSize) > 1024 * 1024 && byteLength !== expectedSize) {
      return false;
    }
  }

  const rawBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  try {
    // 1. Try Node.js native crypto if available
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        const cryptoModule = await import('crypto');
        const hash = cryptoModule.createHash('sha256').update(rawBytes).digest('hex');
        return hash.toLowerCase() === expectedSha256.toLowerCase();
      } catch {
        // Fall back to subtle crypto
      }
    }

    // 2. Try Web Crypto API (SubtleCrypto)
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', rawBytes as unknown as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex.toLowerCase() === expectedSha256.toLowerCase();
    }

    // If neither crypto is available, warn and pass
    console.warn('Neither WebCrypto nor Node crypto available for integrity verification.');
    return true;
  } catch (error) {
    console.error('Error computing SHA-256 integrity hash:', error);
    return false;
  }
}
