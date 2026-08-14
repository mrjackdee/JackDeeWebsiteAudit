import { Sandbox } from '@vercel/sandbox';
import type { PageResult } from '../types';

export type RenderedVariant = 'desktop' | 'mobile';

export type RenderedPageEvidence = {
  url: string;
  title: string;
  variant: RenderedVariant;
  snapshot: string;
  screenshotBase64: string;
};

export type RenderedBrowserResult = {
  evidence: RenderedPageEvidence[];
  pagesReviewed: number;
  pageUrls: string[];
  variantsReviewed: number;
  browserEnhanced: boolean;
  limitation?: string;
};

const AGENT_BROWSER_VERSION = '0.31.1';

function canUseSandbox() {
  return Boolean(
    process.env.VERCEL ||
    process.env.VERCEL_OIDC_TOKEN ||
    (process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_PROJECT_ID)
  );
}

function selectRepresentativePages(pages: PageResult[], depth: 'quick' | 'standard' | 'deep') {
  const maxPages = depth === 'quick' ? 1 : depth === 'standard' ? 2 : 3;
  const reachable = pages.filter(page => page.status >= 200 && page.status < 400);
  if (!reachable.length) return [];

  const selected: PageResult[] = [];
  const seenSections = new Set<string>();

  const add = (page: PageResult) => {
    if (selected.some(item => item.url === page.url)) return;
    selected.push(page);
    try {
      const path = new URL(page.url).pathname;
      seenSections.add(path.split('/').filter(Boolean)[0] || '/');
    } catch {
      seenSections.add(page.url);
    }
  };

  const root = reachable.find(page => {
    try { return new URL(page.url).pathname === '/'; } catch { return false; }
  });
  if (root) add(root);

  for (const page of reachable) {
    if (selected.length >= maxPages) break;
    let section = page.url;
    try { section = new URL(page.url).pathname.split('/').filter(Boolean)[0] || '/'; } catch {}
    if (!seenSections.has(section)) add(page);
  }

  for (const page of reachable) {
    if (selected.length >= maxPages) break;
    add(page);
  }

  return selected.slice(0, maxPages);
}

async function commandText(sandbox: Sandbox, cmd: string, args: string[]) {
  const result = await sandbox.runCommand(cmd, args);
  if (result.exitCode !== 0) {
    const stderr = (await result.stderr()).trim();
    throw new Error(stderr || `${cmd} exited with code ${result.exitCode}.`);
  }
  return (await result.stdout()).trim();
}

async function installBrowser(sandbox: Sandbox) {
  await commandText(sandbox, 'npm', ['install', `agent-browser@${AGENT_BROWSER_VERSION}`, '--no-save']);
  const install = await sandbox.runCommand({
    cmd: 'npx',
    args: ['agent-browser', 'install', '--with-deps'],
    sudo: true,
  });
  if (install.exitCode !== 0) {
    const stderr = (await install.stderr()).trim();
    throw new Error(stderr || 'Chrome could not be installed in the isolated browser environment.');
  }
}

async function captureVariant(
  sandbox: Sandbox,
  url: string,
  variant: RenderedVariant,
  index: number,
): Promise<RenderedPageEvidence> {
  const viewport = variant === 'mobile' ? ['390', '844'] : ['1440', '1000'];
  await commandText(sandbox, 'npx', ['agent-browser', 'set', 'viewport', ...viewport]);
  await commandText(sandbox, 'npx', ['agent-browser', 'open', url]);

  const titleRaw = await commandText(sandbox, 'npx', ['agent-browser', 'get', 'title', '--json']);
  const snapshotRaw = await commandText(sandbox, 'npx', ['agent-browser', 'snapshot', '-i', '-c', '-d', '5', '--urls', '--json']);
  const imagePath = `audit-${index}-${variant}.jpg`;
  await commandText(sandbox, 'npx', [
    'agent-browser', 'screenshot', imagePath,
    '--screenshot-format', 'jpeg',
    '--screenshot-quality', '60',
  ]);
  const screenshotBase64 = await commandText(sandbox, 'base64', ['-w', '0', imagePath]);

  let title = url;
  let snapshot = snapshotRaw;
  try {
    const parsed = JSON.parse(titleRaw) as { data?: { title?: string } };
    title = parsed.data?.title || url;
  } catch {}
  try {
    const parsed = JSON.parse(snapshotRaw) as { data?: { snapshot?: string } };
    snapshot = parsed.data?.snapshot || snapshotRaw;
  } catch {}

  return { url, title, variant, snapshot: snapshot.slice(0, 18000), screenshotBase64 };
}

export async function runRenderedBrowserAudit(
  pages: PageResult[],
  depth: 'quick' | 'standard' | 'deep',
): Promise<RenderedBrowserResult> {
  if (!canUseSandbox()) {
    return {
      evidence: [], pagesReviewed: 0, pageUrls: [], variantsReviewed: 0, browserEnhanced: false,
      limitation: 'Rendered browser review was skipped because Vercel Sandbox authentication is not available in this environment.',
    };
  }

  const selected = selectRepresentativePages(pages, depth);
  if (!selected.length) {
    return {
      evidence: [], pagesReviewed: 0, pageUrls: [], variantsReviewed: 0, browserEnhanced: false,
      limitation: 'No successful public pages were available for rendered browser review.',
    };
  }

  const sandbox = await Sandbox.create({ runtime: 'node24', timeout: 240_000, persistent: false });
  const evidence: RenderedPageEvidence[] = [];

  try {
    await installBrowser(sandbox);
    let index = 0;
    for (const page of selected) {
      evidence.push(await captureVariant(sandbox, page.url, 'desktop', index++));
    }
    const mobileCount = depth === 'quick' ? 1 : Math.min(2, selected.length);
    for (const page of selected.slice(0, mobileCount)) {
      evidence.push(await captureVariant(sandbox, page.url, 'mobile', index++));
    }
    await commandText(sandbox, 'npx', ['agent-browser', 'close', '--all']).catch(() => '');

    return {
      evidence,
      pagesReviewed: selected.length,
      pageUrls: selected.map(page => page.url),
      variantsReviewed: evidence.length,
      browserEnhanced: evidence.length > 0,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The isolated browser could not complete the rendered review.';
    return {
      evidence,
      pagesReviewed: new Set(evidence.map(item => item.url)).size,
      pageUrls: [...new Set(evidence.map(item => item.url))],
      variantsReviewed: evidence.length,
      browserEnhanced: evidence.length > 0,
      limitation: `Rendered browser review was incomplete. ${reason}`,
    };
  } finally {
    await sandbox.stop().catch(() => undefined);
  }
}
