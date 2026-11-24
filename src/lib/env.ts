export function getRuntimeEnv(locals: unknown, key: string): string | undefined {
  const cfEnv = (locals as { runtime?: { env?: Record<string, string | undefined> } })?.runtime?.env;
  if (cfEnv && typeof cfEnv[key] === 'string' && cfEnv[key]) {
    return cfEnv[key];
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
