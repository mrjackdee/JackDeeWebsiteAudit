import { NextRequest, NextResponse } from 'next/server';
import { runAudit } from '../../../lib/audit';
import { auditPublicGithubRepo } from '../../../lib/repo-audit';
import { buildRemediationPrompt } from '../../../lib/audit/agents';
import { runAiExpertReview } from '../../../lib/audit/ai-review';
import { runRenderedBrowserAudit } from '../../../lib/audit/rendered-browser';
import { runVisualReview } from '../../../lib/audit/visual-review';
import type { AuditResult, Finding, Priority } from '../../../lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const allowedDepths = new Set(['quick','standard','deep']);
const weight: Record<Priority,number> = { P0:18,P1:10,P2:5,P3:2 };
const buckets = new Set(['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness']);
const structuredSpecialists = ['Executive UI/UX Designer','Web Architect','QA Analyst','Vibe-Code Reviewer'];
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

function mergeScores(base: Record<string,number>, findings: Finding[]) {
  const scores={...base};
  for(const f of findings){
    const bucket=buckets.has(f.category)?f.category:'Technical Quality';
    if(bucket==='Production Readiness') continue;
    scores[bucket]=Math.max(0,(scores[bucket]??100)-weight[f.priority]);
  }
  scores['UI Design']=Math.round(((scores['Vibe-Code Quality']??100)+(scores['Mobile']??100)+(scores['Accessibility']??100)+92)/4);
  scores['User Experience']=Math.round(((scores['Accessibility']??100)+(scores['Mobile']??100)+(scores['Technical Quality']??100)+(scores['UI Design']??100))/4);
  scores['Production Readiness']=Math.round(((scores['Security']??100)+(scores['Technical Quality']??100)+(scores['Accessibility']??100)+(scores['Performance']??100)+(scores['Mobile']??100))/5);
  return scores;
}

function dedupeFindings(findings: Finding[]) {
  const seen=new Set<string>();
  return findings.filter(f=>{
    const key=`${f.category}|${f.title.toLowerCase()}|${f.page||''}`;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a,b)=>['P0','P1','P2','P3'].indexOf(a.priority)-['P0','P1','P2','P3'].indexOf(b.priority));
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
    const [website,repoFindingsRaw]=await Promise.all([
      runAudit(url,depth),
      repoUrl?auditPublicGithubRepo(repoUrl):Promise.resolve([]),
    ]);
    const repoFindings: Finding[]=repoFindingsRaw.map(f=>({ ...f, agent:'Web Architect', prompt:buildRemediationPrompt({...f,agent:'Web Architect'},website.url) }));
    const evidenceAudit: AuditResult={...website,findings:dedupeFindings([...website.findings,...repoFindings]),scores:mergeScores(website.scores,repoFindings)};

    const [expert,rendered]=await Promise.all([
      runAiExpertReview(evidenceAudit),
      runRenderedBrowserAudit(website.pages,depth),
    ]);
    const visual=await runVisualReview(website.url,rendered.evidence);

    const findings=dedupeFindings([...website.findings,...repoFindings,...expert.findings,...visual.findings]);
    const blockers=findings.filter(f=>f.priority==='P0'||f.priority==='P1').length;
    const limitations=[
      ...(website.coverage?.limitations||[]),
      ...(expert.limitation?[expert.limitation]:[]),
      ...(rendered.limitation?[rendered.limitation]:[]),
      ...(visual.limitation?[visual.limitation]:[]),
    ];
    const coverage=website.coverage ? {
      ...website.coverage,
      renderedPagesReviewed:rendered.pagesReviewed,
      limitations:[...new Set(limitations)],
    } : website.coverage;
    const positives=[...new Set([...(website.positives||[]),...expert.positives,...visual.positives])].slice(0,20);
    const specialists=[
      ...(expert.aiEnhanced?structuredSpecialists:[]),
      ...(visual.aiEnhanced?['Visual QA Designer']:[]),
    ];
    const aiEnhanced=expert.aiEnhanced||visual.aiEnhanced;
    const renderedNote=rendered.pagesReviewed>0?` ${rendered.pagesReviewed} representative page${rendered.pagesReviewed===1?' was':'s were'} also rendered in an isolated real browser across ${rendered.variantsReviewed} desktop/mobile viewport${rendered.variantsReviewed===1?'':'s'}.`:'';
    const summary=blockers
      ? `${blockers} high-priority issue${blockers===1?'':'s'} should be addressed before launch. ${coverage?`The crawler reviewed ${coverage.auditedPages} pages, ${coverage.sectionsReviewed} content regions, ${coverage.formsReviewed} forms, and ${coverage.buttonsReviewed} buttons.`:''}${renderedNote}`
      : `No P0 or P1 issues were detected across ${website.pagesChecked} crawled pages.${renderedNote} ${aiEnhanced?'Model-driven specialists reviewed the collected evidence.':'The deterministic site-wide review completed successfully.'}`;

    return NextResponse.json({
      ...website,
      findings,
      scores:mergeScores(website.scores,[...repoFindings,...expert.findings,...visual.findings]),
      summary,
      positives,
      coverage,
      expertReview:{
        aiEnhanced,
        assessments:[...expert.assessments,...(visual.assessment?[visual.assessment]:[])],
        specialists,
      },
      renderedReview:{
        browserEnhanced:rendered.browserEnhanced,
        pagesReviewed:rendered.pagesReviewed,
        pageUrls:rendered.pageUrls,
        variantsReviewed:rendered.variantsReviewed,
        assessment:visual.assessment,
        limitation:rendered.limitation||visual.limitation,
      },
    },{headers:{'Cache-Control':'no-store'}});
  } catch(error) {
    const message=error instanceof Error?error.message:'The audit could not be completed.';
    return NextResponse.json({error:message},{status:422,headers:{'Cache-Control':'no-store'}});
  }
}
