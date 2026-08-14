import { NextRequest, NextResponse } from 'next/server';
import { runAudit } from '../../../lib/audit';
import { auditPublicGithubRepo } from '../../../lib/repo-audit';
import type { Finding, Priority } from '../../../lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const allowedDepths = new Set(['quick','standard','deep']);
const weight: Record<Priority,number> = { P0:18,P1:10,P2:5,P3:2 };
const buckets = new Set(['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness']);
const requestWindowMs = 10 * 60 * 1000;
const requestLimit = 8;
const requestCounts = new Map<string,{count:number;resetAt:number}>();

function clientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function allowedRequest(request: NextRequest) {
  const now=Date.now();
  const key=clientKey(request);
  const current=requestCounts.get(key);
  if(!current || current.resetAt<=now){ requestCounts.set(key,{count:1,resetAt:now+requestWindowMs}); return true; }
  if(current.count>=requestLimit) return false;
  current.count+=1;
  return true;
}

function mergeScores(base: Record<string,number>, findings: Finding[]) {
  const scores={...base};
  for(const f of findings){ const bucket=buckets.has(f.category)?f.category:'Technical Quality'; if(bucket==='Production Readiness') continue; scores[bucket]=Math.max(0,(scores[bucket]??100)-weight[f.priority]); }
  scores['UI Design']=Math.round(((scores['Vibe-Code Quality']??100)+(scores['Mobile']??100)+92)/3);
  scores['User Experience']=Math.round(((scores['Accessibility']??100)+(scores['Mobile']??100)+(scores['Technical Quality']??100))/3);
  scores['Production Readiness']=Math.round(((scores['Security']??100)+(scores['Technical Quality']??100)+(scores['Accessibility']??100)+(scores['Performance']??100)+(scores['Mobile']??100))/5);
  return scores;
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
    const [website,repoFindings]=await Promise.all([runAudit(url,depth),repoUrl?auditPublicGithubRepo(repoUrl):Promise.resolve([])]);
    const findings=[...website.findings,...repoFindings].sort((a,b)=>['P0','P1','P2','P3'].indexOf(a.priority)-['P0','P1','P2','P3'].indexOf(b.priority));
    const blockers=findings.filter(f=>f.priority==='P0'||f.priority==='P1').length;
    return NextResponse.json({...website,findings,scores:mergeScores(website.scores,repoFindings),summary:blockers?`${blockers} high-priority issue${blockers===1?'':'s'} should be addressed before launch.`:'No P0 or P1 issues were detected by the automated checks.'},{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const message=error instanceof Error?error.message:'The audit could not be completed.';
    return NextResponse.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}});
  }
}
