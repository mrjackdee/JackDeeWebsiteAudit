import { NextRequest, NextResponse } from 'next/server';
import { start } from 'workflow/api';
import { siteAuditWorkflow } from '../../../workflows/site-audit';

export const runtime = 'nodejs';

const allowedDepths = new Set(['quick','standard','deep']);
const requestWindowMs = 10 * 60 * 1000;
const requestLimit = 8;
const requestCounts = new Map<string,{count:number;resetAt:number}>();

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function allowedRequest(request: NextRequest) {
  const now=Date.now(); const key=clientKey(request); const current=requestCounts.get(key);
  if(!current || current.resetAt<=now){ requestCounts.set(key,{count:1,resetAt:now+requestWindowMs}); return true; }
  if(current.count>=requestLimit) return false;
  current.count+=1; return true;
}

export async function POST(request: NextRequest) {
  if(!allowedRequest(request)) return NextResponse.json({error:'Too many audits were started from this connection. Please try again in a few minutes.'},{status:429,headers:{'Cache-Control':'no-store','Retry-After':'600'}});
  let body: unknown;
  try { body=await request.json(); } catch { return NextResponse.json({error:'The audit request was not valid. Refresh the page and try again.'},{status:400}); }
  if(!body || typeof body!=='object') return NextResponse.json({error:'The audit request was not valid.'},{status:400});
  const data=body as Record<string,unknown>;
  const url=typeof data.url==='string'?data.url.trim():'';
  const repoUrl=typeof data.repoUrl==='string'?data.repoUrl.trim():'';
  const depth=typeof data.depth==='string'&&allowedDepths.has(data.depth)?data.depth as 'quick'|'standard'|'deep':'standard';
  if(!url || url.length>2048) return NextResponse.json({error:'Enter a valid public website address.'},{status:400});
  if(repoUrl.length>2048) return NextResponse.json({error:'The repository address is too long.'},{status:400});

  try {
    const run = await start(siteAuditWorkflow, [url, repoUrl, depth]);
    return NextResponse.json({ runId: run.runId }, { status:202, headers:{'Cache-Control':'no-store'} });
  } catch(error) {
    const message=error instanceof Error?error.message:'The audit could not be started.';
    return NextResponse.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}});
  }
}
