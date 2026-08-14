'use client';

import { useMemo, useState } from 'react';

type Finding = {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  page?: string;
  agent?: string;
  evidence?: string;
  prompt?: string;
};

type Coverage = {
  discoveredPages: number;
  auditedPages: number;
  linksChecked: number;
  sectionsReviewed: number;
  formsReviewed: number;
  buttonsReviewed: number;
  sitemapPagesFound: number;
  truncated: boolean;
  limitations: string[];
};

type PageResult = {
  url: string;
  status: number;
  title: string;
  sections?: number;
  links?: number;
  buttons?: number;
  forms?: number;
};

type ExpertReview = {
  aiEnhanced: boolean;
  assessments: string[];
  specialists: string[];
};

type AuditResult = {
  url: string;
  auditedAt: string;
  pagesChecked: number;
  linksChecked: number;
  scores: Record<string, number>;
  findings: Finding[];
  pages: PageResult[];
  summary: string;
  positives?: string[];
  coverage?: Coverage;
  expertReview?: ExpertReview;
};

const scoreOrder = ['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness'];

export default function Home() {
  const [url, setUrl] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [depth, setDepth] = useState('deep');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const critical = useMemo(() => result?.findings.filter((f) => f.priority === 'P0' || f.priority === 'P1') ?? [], [result]);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setResult(null); setRunning(true); setCopied(null);
    try {
      const response = await fetch('/api/audit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ url, repoUrl, depth }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The audit could not be completed.');
      setResult(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'The audit could not be completed.'); }
    finally { setRunning(false); }
  }

  async function copyPrompt(prompt: string, index: number) {
    await navigator.clipboard.writeText(prompt);
    setCopied(index);
    window.setTimeout(() => setCopied(current => current === index ? null : current), 1800);
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type:'application/json' });
    const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`website-audit-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  }

  function downloadCsv() {
    if (!result) return;
    const rows=[['Priority','Agent','Category','Title','Page','Finding','Evidence','Recommendation','Vibe-code remediation prompt'],...result.findings.map(f=>[f.priority,f.agent||'',f.category,f.title,f.page||'',f.detail,f.evidence||'',f.recommendation,f.prompt||''])];
    const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const link=document.createElement('a'); link.href=URL.createObjectURL(blob); link.download=`website-audit-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="JackDee Website Audit home"><span className="brandMark">JD</span><span>Website Audit</span></a>
        <span className="statusPill"><i /> Multi-agent audit suite</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">End-to-end website evaluation</div>
        <h1>Audit the entire website, not just the homepage.</h1>
        <p className="heroCopy">A coordinated team of specialist agents reviews the publicly discoverable site as a world-class UI/UX designer, web architect, developer, QA analyst, accessibility specialist, security analyst, SEO/AEO strategist, and vibe-code reviewer.</p>

        <form className="auditForm" onSubmit={runAudit}>
          <label htmlFor="siteUrl">Website to audit</label>
          <div className="inputRow">
            <input id="siteUrl" type="text" inputMode="url" required placeholder="example.com" value={url} onChange={e=>setUrl(e.target.value)} autoComplete="url" />
            <button className="primaryButton" disabled={running} type="submit">{running ? <><span className="spinner" /> Auditing full site</> : 'Run website audit'}</button>
          </div>
          <div className="formOptions">
            <div>
              <label htmlFor="repoUrl">GitHub repository <span>optional, recommended</span></label>
              <input id="repoUrl" type="url" placeholder="https://github.com/owner/repository" value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} />
            </div>
            <div>
              <label htmlFor="depth">Audit coverage</label>
              <select id="depth" value={depth} onChange={e=>setDepth(e.target.value)}>
                <option value="quick">Quick review, up to 10 pages</option>
                <option value="standard">Comprehensive, up to 75 pages</option>
                <option value="deep">Full-site, up to 200 pages</option>
              </select>
            </div>
          </div>
          <p className="formNote">The app discovers routes from navigation, internal links, robots.txt, and XML sitemaps, reviews reachable pages within the selected tier, and sends the collected evidence to independent AI specialist agents. It does not submit purchases, deletes, messages, or other destructive actions.</p>
        </form>
        {error && <div className="errorMessage" role="alert"><strong>Audit stopped.</strong> {error}</div>}
      </section>

      {!result && !running && (
        <section className="capabilities" aria-label="Audit capabilities">
          <article><span>01</span><h2>Experience agent</h2><p>Reviews page hierarchy, visual rhythm, typography, spacing, navigation, mobile quality, originality, and vibe-coding symptoms.</p></article>
          <article><span>02</span><h2>Engineering agents</h2><p>Crawl routes, inspect links and controls, review source when provided, check performance signals, architecture, accessibility, SEO, and production quality.</p></article>
          <article><span>03</span><h2>Remediation agent</h2><p>Turns every finding into a plain-English recommendation and a detailed prompt ready to paste into a vibe-coding tool.</p></article>
        </section>
      )}

      {running && (
        <section className="runningPanel" aria-live="polite"><div className="scanLine"/><div><span className="kicker">Multi-agent audit in progress</span><h2>Discovering and reviewing the complete public site</h2><p>Crawling pages and links, reviewing page structure and source evidence, then running independent AI specialist reviews before compiling the final remediation report.</p></div></section>
      )}

      {result && (
        <section className="report">
          <div className="reportHeader">
            <div><span className="kicker">Audit complete</span><h2>{new URL(result.url).hostname}</h2><p>{result.summary}</p></div>
            <div className="reportActions"><button onClick={downloadCsv}>Export CSV</button><button onClick={downloadJson}>Export JSON</button><button className="primaryButton" onClick={()=>{setResult(null);setUrl('');}}>New audit</button></div>
          </div>

          {result.expertReview && (
            <section className="coveragePanel">
              <div className="sectionHeading compact"><span className="kicker">Expert review layer</span><h2>{result.expertReview.aiEnhanced ? 'Model-driven specialist review completed' : 'Deterministic specialist review completed'}</h2></div>
              <p>{result.expertReview.aiEnhanced ? `${result.expertReview.specialists.length} independent AI specialist agents reviewed the site-wide evidence after the crawler completed.` : 'The site-wide deterministic checks completed, but the model-driven specialist layer was unavailable for this run. The report discloses that limitation rather than presenting it as AI-reviewed.'}</p>
              {!!result.expertReview.assessments.length && <details className="limitations"><summary>Specialist assessments</summary>{result.expertReview.assessments.map((item,i)=><p key={i}>{item}</p>)}</details>}
            </section>
          )}

          {result.coverage && (
            <section className="coveragePanel">
              <div className="sectionHeading compact"><span className="kicker">Audit coverage</span><h2>What was actually reviewed</h2></div>
              <div className="coverageGrid">
                <div><strong>{result.coverage.auditedPages}</strong><span>pages</span></div>
                <div><strong>{result.coverage.linksChecked}</strong><span>links</span></div>
                <div><strong>{result.coverage.sectionsReviewed}</strong><span>content regions</span></div>
                <div><strong>{result.coverage.formsReviewed}</strong><span>forms</span></div>
                <div><strong>{result.coverage.buttonsReviewed}</strong><span>buttons</span></div>
                <div><strong>{result.coverage.sitemapPagesFound}</strong><span>sitemap routes</span></div>
              </div>
              {result.coverage.truncated && <div className="coverageWarning"><strong>Coverage limit reached.</strong> The site contains more discoverable content than this audit tier can safely process in one run.</div>}
              <details className="limitations"><summary>Audit boundaries and limitations</summary>{result.coverage.limitations.map((item,i)=><p key={i}>{item}</p>)}</details>
            </section>
          )}

          <div className="scoreGrid">{scoreOrder.map(name=><article className="scoreCard" key={name}><span>{name}</span><strong>{result.scores[name]??0}</strong><div className="scoreTrack"><i style={{width:`${result.scores[name]??0}%`}}/></div></article>)}</div>
          <div className="reportStats"><span><strong>{result.pagesChecked}</strong> pages checked</span><span><strong>{result.linksChecked}</strong> links checked</span><span><strong>{result.findings.length}</strong> findings</span><span><strong>{critical.length}</strong> launch blockers</span></div>

          {!!result.positives?.length && (
            <section className="positivePanel"><div className="sectionHeading compact"><span className="kicker">What looks good</span><h2>Strengths worth preserving</h2></div><div className="positiveList">{result.positives.map((item,i)=><div key={i}><span>✓</span><p>{item}</p></div>)}</div></section>
          )}

          <div className="sectionHeading"><span className="kicker">Prioritized findings</span><h2>What needs to change</h2><p>Each issue identifies who found it, what is wrong, why it matters, and exactly what to ask your vibe-coding tool to fix.</p></div>
          <div className="findings">
            {result.findings.length===0 ? <div className="emptyState">No material issues were detected by the automated agents.</div> : result.findings.map((finding,index)=>(
              <article className="finding" key={`${finding.title}-${index}`}>
                <div className={`priority ${finding.priority.toLowerCase()}`}>{finding.priority}</div>
                <div className="findingBody">
                  <div className="findingMeta">{finding.agent ? `${finding.agent} · ` : ''}{finding.category}{finding.page ? ` · ${finding.page}` : ''}</div>
                  <h3>{finding.title}</h3><p>{finding.detail}</p>
                  {finding.evidence && <div className="evidence"><strong>Evidence</strong><p>{finding.evidence}</p></div>}
                  <div className="recommendation"><strong>What to change</strong><p>{finding.recommendation}</p></div>
                  {finding.prompt && <details className="promptBox"><summary>Vibe-code remediation prompt</summary><p className="promptIntro">Copy this entire prompt into your coding tool.</p><pre>{finding.prompt}</pre><button type="button" onClick={()=>copyPrompt(finding.prompt!,index)}>{copied===index?'Copied':'Copy full prompt'}</button></details>}
                </div>
              </article>
            ))}
          </div>

          <div className="sectionHeading pagesHeading"><span className="kicker">Page-by-page coverage</span><h2>Pages inspected</h2></div>
          <div className="pageTable" role="table" aria-label="Pages inspected">{result.pages.map(page=><div className="pageRow expanded" role="row" key={page.url}><span className={page.status>=400?'badStatus':'goodStatus'}>{page.status}</span><span><strong>{page.title||'Untitled page'}</strong><small>{page.sections??0} regions · {page.links??0} links · {page.buttons??0} buttons · {page.forms??0} forms</small></span><a href={page.url} target="_blank" rel="noreferrer">{new URL(page.url).pathname||'/'}</a></div>)}</div>
        </section>
      )}

      <footer><strong>JackDee Website Audit</strong><span>Site-wide multi-agent review for production readiness.</span></footer>
    </main>
  );
}
