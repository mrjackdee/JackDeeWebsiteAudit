import { runAudit } from '../lib/audit';
import { auditPublicGithubRepo } from '../lib/repo-audit';
import { buildRemediationPrompt } from '../lib/audit/agents';
import { runAiExpertReview } from '../lib/audit/ai-review';
import type { AuditResult, Finding, Priority } from '../lib/types';

const weight: Record<Priority,number> = { P0:18,P1:10,P2:5,P3:2 };
const buckets = new Set(['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness']);
const specialists = ['Executive UI/UX Designer','Web Architect','QA Analyst','Vibe-Code Reviewer'];

async function crawlWebsite(url: string, depth: 'quick'|'standard'|'deep') {
  'use step';
  return runAudit(url, depth);
}

async function inspectRepository(repoUrl: string) {
  'use step';
  return repoUrl ? auditPublicGithubRepo(repoUrl) : [];
}

async function runExpertAgents(audit: AuditResult) {
  'use step';
  return runAiExpertReview(audit);
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

export async function siteAuditWorkflow(url: string, repoUrl: string, depth: 'quick'|'standard'|'deep') {
  'use workflow';

  const [website, repoFindingsRaw] = await Promise.all([
    crawlWebsite(url, depth),
    inspectRepository(repoUrl),
  ]);

  const repoFindings: Finding[] = repoFindingsRaw.map(f=>({
    ...f,
    agent:'Web Architect',
    prompt:buildRemediationPrompt({...f,agent:'Web Architect'},website.url),
  }));

  const expert = await runExpertAgents({
    ...website,
    findings: dedupeFindings([...website.findings, ...repoFindings]),
    scores: mergeScores(website.scores, repoFindings),
  });

  const findings = dedupeFindings([...website.findings, ...repoFindings, ...expert.findings]);
  const blockers=findings.filter(f=>f.priority==='P0'||f.priority==='P1').length;
  const coverage=website.coverage ? {
    ...website.coverage,
    limitations: expert.limitation
      ? [...website.coverage.limitations, expert.limitation]
      : website.coverage.limitations,
  } : website.coverage;

  const positives=[...new Set([...(website.positives||[]),...expert.positives])].slice(0,16);
  const summary=blockers
    ? `${blockers} high-priority issue${blockers===1?'':'s'} should be addressed before launch. ${coverage?`The audit reviewed ${coverage.auditedPages} pages, ${coverage.sectionsReviewed} content regions, ${coverage.formsReviewed} forms, and ${coverage.buttonsReviewed} buttons.`:''}`
    : `No P0 or P1 issues were detected across ${website.pagesChecked} audited pages. ${expert.aiEnhanced?'The deterministic checks were also reviewed by four model-driven specialist agents.':'The deterministic site-wide review completed successfully.'}`;

  return {
    ...website,
    findings,
    scores:mergeScores(website.scores,[...repoFindings,...expert.findings]),
    summary,
    positives,
    coverage,
    expertReview:{ aiEnhanced:expert.aiEnhanced, assessments:expert.assessments, specialists },
  } satisfies AuditResult;
}
