const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80/i,
];

export function assertSafeExternalUrl(
  rawUrl: string,
  options?: { allowHosts?: string[]; allowHttpInDev?: boolean }
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('URL inválida.');
  }

  const isHttps = parsed.protocol === 'https:';
  const isAllowedHttp = options?.allowHttpInDev && import.meta.env.DEV && parsed.protocol === 'http:';
  if (!isHttps && !isAllowedHttp) {
    throw new Error('Apenas URLs HTTPS são permitidas.');
  }

  const host = parsed.hostname.toLowerCase();
  // Block raw IPv6 literals (including IPv4-mapped ::ffff:127.0.0.1) and private/local hosts
  if (host.includes(':') || PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
    throw new Error('Destino de rede privada, IPv6 literal ou local não permitido.');
  }

  if (options?.allowHosts && options.allowHosts.length > 0) {
    const matched = options.allowHosts.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );
    if (!matched) {
      throw new Error(`Host não permitido: ${host}`);
    }
  }

  return parsed;
}

export function detectImageMimeFromMagicBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WebP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // AVIF: ....ftypavif / ....ftypavis
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69
  ) {
    return 'image/avif';
  }

  return null;
}

export async function readResponseBytesWithLimit(
  res: Response,
  maxBytes: number
): Promise<Uint8Array> {
  const contentLength = Number(res.headers.get('content-length') || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  if (!res.body) {
    const arr = new Uint8Array(await res.arrayBuffer());
    if (arr.byteLength > maxBytes) {
      throw new Error(`Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
    return arr;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Arquivo excede o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}
