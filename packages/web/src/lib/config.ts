/** Runtime config written by the CDK deployment to /config.json. */
export interface RuntimeConfig {
  region: string;
  userPoolId: string;
  clientId: string;
  /** e.g. https://potluck-prod.auth.us-east-1.amazoncognito.com */
  cognitoDomain: string;
}

let cached: Promise<RuntimeConfig> | null = null;

export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!cached) {
    cached = fetch('/config.json', { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error(`Could not load /config.json (${res.status})`);
      const cfg = (await res.json()) as RuntimeConfig;
      return { ...cfg, cognitoDomain: cfg.cognitoDomain.replace(/\/$/, '') };
    });
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
