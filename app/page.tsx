'use client';

import { useMemo, useState } from 'react';

type Finding = {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  page?: string;
};

type AuditResult = {
  url: string;
  auditedAt: string;
  pagesChecked: number;
  linksChecked: number;
  scores: Record<string, number>;
  findings: Finding[];
  pages: { url: string; status: number; title: string }[];
  summary: string;
};

const scoreOrder = [
  'UI Design',
  'User Experience',
  'Mobile',
  'Vibe-Code Quality',
  'Accessibility',
  'Security',
  'SEO/AEO',
  'Technical Quality',
  'Performance',
  'Production Readiness',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [depth, setDepth] = useState('standard');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AuditResult | null>(null);

  const critical = useMemo(
    () => result?.findings.filter((f) => f.priority === 'P0' || f.priority === 'P1') ?? [],
    [result]
  );

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResult(null);
    setRunning(true);

    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, repoUrl, depth }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The audit could not be completed.');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The audit could not be completed.');
    } finally {
      setRunning(false);
    }
  }

  function downloadJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `website-audit-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadCsv() {
    if (!result) return;
    const rows = [
      ['Priority', 'Category', 'Title', 'Page', 'Finding', 'Recommendation'],
      ...result.findings.map((f) => [f.priority, f.category, f.title, f.page || '', f.detail, f.recommendation]),
    ];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `website-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="JackDee Website Audit home">
          <span className="brandMark">JD</span>
          <span>Website Audit</span>
        </a>
        <span className="statusPill"><i /> Production audit suite</span>
      </header>

      <section className="hero" id="top">
        <div className="eyebrow">Website quality intelligence</div>
        <h1>Find what makes a website feel unfinished.</h1>
        <p className="heroCopy">
          Run a structured audit across UI, UX, mobile, vibe-coding patterns, accessibility, security,
          SEO, links, and production readiness. The report tells you what to fix first and why.
        </p>

        <form className="auditForm" onSubmit={runAudit}>
          <label htmlFor="siteUrl">Website to audit</label>
          <div className="inputRow">
            <input
              id="siteUrl"
              type="text"
              inputMode="url"
              required
              placeholder="example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoComplete="url"
            />
            <button className="primaryButton" disabled={running} type="submit">
              {running ? <><span className="spinner" /> Auditing site</> : 'Run website audit'}
            </button>
          </div>

          <div className="formOptions">
            <div>
              <label htmlFor="repoUrl">GitHub repository <span>optional</span></label>
              <input
                id="repoUrl"
                type="url"
                placeholder="https://github.com/owner/repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="depth">Audit depth</label>
              <select id="depth" value={depth} onChange={(e) => setDepth(e.target.value)}>
                <option value="quick">Quick, up to 5 pages</option>
                <option value="standard">Standard, up to 15 pages</option>
                <option value="deep">Deep, up to 30 pages</option>
              </select>
            </div>
          </div>
          <p className="formNote">Enter a website such as example.com or www.example.com. The secure https:// prefix is added automatically when needed. Only public pages are tested.</p>
        </form>

        {error && <div className="errorMessage" role="alert"><strong>Audit stopped.</strong> {error}</div>}
      </section>

      {!result && !running && (
        <section className="capabilities" aria-label="Audit capabilities">
          <article><span>01</span><h2>Experience</h2><p>UI, UX, mobile, visual consistency, spacing, alignment, typography, motion signals, and common vibe-coding patterns.</p></article>
          <article><span>02</span><h2>Quality</h2><p>Internal links, broken routes, metadata, accessibility signals, forms, images, semantic structure, and technical hygiene.</p></article>
          <article><span>03</span><h2>Risk</h2><p>Security headers, mixed content, exposed implementation clues, unsafe links, production-readiness risks, and prioritized remediation.</p></article>
        </section>
      )}

      {running && (
        <section className="runningPanel" aria-live="polite">
          <div className="scanLine" />
          <div>
            <span className="kicker">Audit in progress</span>
            <h2>Inspecting the site systematically</h2>
            <p>Discovering pages, checking links, reading page structure, evaluating security headers, and scoring quality signals.</p>
          </div>
        </section>
      )}

      {result && (
        <section className="report">
          <div className="reportHeader">
            <div>
              <span className="kicker">Audit complete</span>
              <h2>{new URL(result.url).hostname}</h2>
              <p>{result.summary}</p>
            </div>
            <div className="reportActions">
              <button onClick={downloadCsv}>Export CSV</button>
              <button onClick={downloadJson}>Export JSON</button>
              <button className="primaryButton" onClick={() => { setResult(null); setUrl(''); }}>New audit</button>
            </div>
          </div>

          <div className="scoreGrid">
            {scoreOrder.map((name) => (
              <article className="scoreCard" key={name}>
                <span>{name}</span>
                <strong>{result.scores[name] ?? 0}</strong>
                <div className="scoreTrack"><i style={{ width: `${result.scores[name] ?? 0}%` }} /></div>
              </article>
            ))}
          </div>

          <div className="reportStats">
            <span><strong>{result.pagesChecked}</strong> pages checked</span>
            <span><strong>{result.linksChecked}</strong> links checked</span>
            <span><strong>{result.findings.length}</strong> findings</span>
            <span><strong>{critical.length}</strong> launch blockers</span>
          </div>

          <div className="sectionHeading">
            <span className="kicker">Prioritized findings</span>
            <h2>What needs attention</h2>
          </div>

          <div className="findings">
            {result.findings.length === 0 ? (
              <div className="emptyState">No material issues were detected by the automated checks.</div>
            ) : result.findings.map((finding, index) => (
              <article className="finding" key={`${finding.title}-${index}`}>
                <div className={`priority ${finding.priority.toLowerCase()}`}>{finding.priority}</div>
                <div className="findingBody">
                  <div className="findingMeta">{finding.category}{finding.page ? ` · ${finding.page}` : ''}</div>
                  <h3>{finding.title}</h3>
                  <p>{finding.detail}</p>
                  <div className="recommendation"><strong>Recommended fix</strong><p>{finding.recommendation}</p></div>
                </div>
              </article>
            ))}
          </div>

          <div className="sectionHeading pagesHeading">
            <span className="kicker">Coverage</span>
            <h2>Pages inspected</h2>
          </div>
          <div className="pageTable" role="table" aria-label="Pages inspected">
            {result.pages.map((page) => (
              <div className="pageRow" role="row" key={page.url}>
                <span className={page.status >= 400 ? 'badStatus' : 'goodStatus'}>{page.status}</span>
                <span>{page.title || 'Untitled page'}</span>
                <a href={page.url} target="_blank" rel="noreferrer">{new URL(page.url).pathname || '/'}</a>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer>
        <strong>JackDee Website Audit</strong>
        <span>Built for systematic pre-launch review.</span>
      </footer>
    </main>
  );
}