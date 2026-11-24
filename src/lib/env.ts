import { env as cfEnv } from 'cloudflare:workers';

export function getRuntimeEnv(_locals: unknown, key: string): string | undefined {
  try {
    const val = (cfEnv as Record<string, unknown>)?.[key];
    if (typeof val === 'string' && val) {
      return val;
    }
  } catch {
    // Fallback when running outside Cloudflare Workers runtime
  }

  const metaEnv = import.meta.env as Record<string, string | undefined>;
  if (typeof metaEnv[key] === 'string' && metaEnv[key]) {
    return metaEnv[key];
  }
  if (typeof process !== 'undefined' && process.env?.[key]) {
    return process.env[key];
  }
  return undefined;
}
