// Build metadata. Read at build time only: next.config, Server Components, Route Handlers.

interface BuildInfo {
  /** === generateBuildId() === git commit SHA (40 hex), or 'local' */
  buildId: string;
  /** same SHA; null for local builds */
  commit: string | null;
  deployEnv: 'production' | 'preview';
  /** ISO 8601 UTC */
  builtAt: string;
  /** VERCEL_GIT_PULL_REQUEST_ID on previews, else null */
  pr: number | null;
}

function commitSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || null;
}

export function buildId(): string {
  return commitSha() ?? 'local';
}

export function deployEnv(): 'production' | 'preview' {
  const explicit = process.env.NEXT_PUBLIC_DEPLOY_ENV;
  if (explicit === 'production' || explicit === 'preview') return explicit;
  return process.env.VERCEL_ENV === 'preview' ? 'preview' : 'production';
}

/**
 * True for the production build on Vercel. Only that build includes Vercel Web Analytics and Speed Insights:
 * their scripts are served by Vercel itself, so local, CI and preview builds leave them out.
 */
export function collectsStats(): boolean {
  return process.env.VERCEL === '1' && deployEnv() === 'production';
}

let warnedRepo = false;

/** Public GitHub repository URL for "Report a bug"; null hides the links. */
export function repoUrl(): string | null {
  const env = process.env;
  const url =
    env.NEXT_PUBLIC_REPO_URL ||
    (env.VERCEL_GIT_REPO_OWNER && env.VERCEL_GIT_REPO_SLUG
      ? `https://github.com/${env.VERCEL_GIT_REPO_OWNER}/${env.VERCEL_GIT_REPO_SLUG}`
      : env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY
        ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`
        : null);
  if (url) return url.replace(/\/+$/, '');
  if (!warnedRepo) {
    warnedRepo = true;
    console.warn(
      '[pocketcade] No repository URL (NEXT_PUBLIC_REPO_URL); "Report a bug" links are hidden.',
    );
  }
  return null;
}

export function buildInfo(): BuildInfo {
  const pr = Number(process.env.VERCEL_GIT_PULL_REQUEST_ID);
  return {
    buildId: buildId(),
    commit: commitSha(),
    deployEnv: deployEnv(),
    builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    pr: Number.isInteger(pr) && pr > 0 ? pr : null,
  };
}
