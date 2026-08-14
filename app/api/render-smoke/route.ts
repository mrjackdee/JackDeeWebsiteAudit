import { NextResponse } from 'next/server';
import { runRenderedBrowserAudit } from '../../../lib/audit/rendered-browser';
import type { PageResult } from '../../../lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error:'Not available in production.' }, { status:404 });
  }
  const pages: PageResult[] = [{ url:'https://example.com/', status:200, title:'Example Domain' }];
  const result = await runRenderedBrowserAudit(pages, 'quick');
  return NextResponse.json({
    browserEnhanced:result.browserEnhanced,
    pagesReviewed:result.pagesReviewed,
    pageUrls:result.pageUrls,
    variantsReviewed:result.variantsReviewed,
    limitation:result.limitation,
    evidence:result.evidence.map(item => ({
      url:item.url,
      title:item.title,
      variant:item.variant,
      snapshotChars:item.snapshot.length,
      screenshotBytesApprox:Math.round(item.screenshotBase64.length*0.75),
    })),
  }, { headers:{'Cache-Control':'no-store'} });
}
