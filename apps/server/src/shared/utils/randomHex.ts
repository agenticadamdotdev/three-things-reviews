// Cryptographically random hex string of `bytes` bytes (Web Crypto, available on Workers and Bun).
export const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), b => b.toString(16).padStart(2, '0')).join('');
