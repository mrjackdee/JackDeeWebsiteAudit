import type { CSSProperties } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'mrjackdee.com V2 | Executive Project Status',
  description: 'Public sponsor-facing project status for the mrjackdee.com Experience V2 redesign.',
  robots: { index: false, follow: false },
};

export const revalidate = 60;

const STATUS_URL = 'https://raw.githubusercontent.com/mrjackdee/JackDeeWebsiteAudit/v2-status-public-data/public-status/status.json';

type Status = {
  project: string;
  lastUpdated: string;
  overallCompletion: number;
  goLiveStatus: string;
  goLiveReason: string;
  currentFocus: string;
  designCheckpoint: string;
  nextMilestone: string;
  deliveryOutlook: string;
  sponsorActionRequired: boolean;
  sponsorAction: string;
  mustFixProblems: number;
  importantProblems: number;
  risks: number;
  issues: number;
  completed: string[];
  activeWork: string[];
  nextActions: string[];
  reviewFindings: string[];
  blockers: string[];
  links: {
    documents: string;
    risks: string;
    slides: string;
    privatePreview: string;
  };
};

const colors = {
  navy: '#0A192F',
  navy2: '#112240',
  silver: '#B9C4D2',
  blue: '#4F9FFF',
  bg: '#F3F6FA',
  text: '#172033',
  muted: '#64748B',
  line: '#DCE5EE',
  white: '#FFFFFF',
  amber: '#8A5A00',
};

const page: CSSProperties = { minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: 'Arial, Helvetica, sans-serif', padding: '24px 14px 56px' };
const shell: CSSProperties = { maxWidth: 1120, margin: '0 auto' };
const card: CSSProperties = { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 18, boxShadow: '0 10px 30px rgba(10,25,47,.07)' };
const section: CSSProperties = { ...card, padding: 24, marginTop: 18 };
const label: CSSProperties = { fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700, color: colors.muted };
const linkButton: CSSProperties = { display: 'inline-block', textDecoration: 'none', background: colors.navy, color: '#fff', padding: '12px 16px', borderRadius: 999, fontWeight: 700, fontSize: 14, marginRight: 8, marginBottom: 8 };
const secondaryLink: CSSProperties = { ...linkButton, background: '#EEF4FA', color: colors.navy, border: `1px solid ${colors.line}` };

function List({ items }: { items: string[] }) {
  return <ul style={{ margin: '12px 0 0 20px', padding: 0, lineHeight: 1.7, color: '#334155' }}>{items.map((item) => <li key={item} style={{ marginBottom: 8 }}>{item}</li>)}</ul>;
}

function Detail({ title, items }: { title: string; items: string[] }) {
  return (
    <details style={{ ...card, padding: '16px 18px', marginTop: 10 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: colors.navy }}>{title}</summary>
      <List items={items} />
    </details>
  );
}

async function getStatus(): Promise<Status> {
  const response = await fetch(STATUS_URL, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error('Project status is temporarily unavailable.');
  return response.json();
}

export default async function V2StatusPage() {
  const status = await getStatus();
  const updated = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  }).format(new Date(status.lastUpdated));

  return (
    <main style={page}>
      <div style={shell}>
        <header style={{ ...card, overflow: 'hidden', border: 0 }}>
          <div style={{ background: colors.navy, color: '#fff', padding: '34px 28px' }}>
            <div style={{ ...label, color: colors.silver }}>MrJackDee™ · Executive Project View</div>
            <h1 style={{ margin: '8px 0 0', fontSize: 'clamp(30px, 5vw, 52px)', lineHeight: 1.05 }}>{status.project}</h1>
            <p style={{ color: '#D4DCE5', maxWidth: 760, lineHeight: 1.6, marginBottom: 0 }}>A public, plain-English view of progress, quality, risks, next steps and project documents.</p>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
              <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 18, background: '#F8FBFD' }}>
                <div style={label}>Overall progress</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: colors.navy, marginTop: 8 }}>{status.overallCompletion}%</div>
                <div style={{ height: 7, background: '#E4EBF2', borderRadius: 20, marginTop: 12, overflow: 'hidden' }}><div style={{ width: `${status.overallCompletion}%`, height: '100%', background: colors.blue }} /></div>
              </div>
              <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 18, background: '#F8FBFD' }}>
                <div style={label}>Can this go live yet?</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: colors.amber, marginTop: 10 }}>{status.goLiveStatus}</div>
                <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.5, marginBottom: 0 }}>{status.goLiveReason}</p>
              </div>
              <div style={{ border: `1px solid ${colors.line}`, borderRadius: 14, padding: 18, background: '#EEF6FF' }}>
                <div style={label}>Current focus</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colors.navy, marginTop: 10 }}>{status.currentFocus}</div>
              </div>
            </div>
            <p style={{ margin: '18px 0 0', color: colors.muted, fontSize: 13 }}>Last updated {updated} ET · This page refreshes its project data approximately every minute.</p>
          </div>
        </header>

        {status.sponsorActionRequired ? (
          <section style={{ ...section, borderColor: '#F2C46D', background: '#FFF9ED' }}>
            <div style={{ ...label, color: colors.amber }}>Action needed</div>
            <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 0 }}>{status.sponsorAction}</p>
          </section>
        ) : (
          <section style={{ ...section, background: '#F5FAFF', borderColor: '#CFE4F7' }}>
            <div style={{ ...label, color: '#3E658A' }}>Do you need anything from me?</div>
            <p style={{ fontSize: 17, fontWeight: 700, marginBottom: 0 }}>{status.sponsorAction}</p>
          </section>
        )}

        <section style={section}>
          <div style={label}>Design checkpoint</div>
          <h2 style={{ color: colors.navy, margin: '6px 0 10px', fontSize: 25 }}>{status.designCheckpoint}</h2>
          <p style={{ color: '#334155', lineHeight: 1.65, marginBottom: 0 }}>{status.nextMilestone}</p>
        </section>

        <section style={section}>
          <div style={label}>Quality & risk watch</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, marginTop: 14 }}>
            {[
              ['Must-fix problems', status.mustFixProblems],
              ['Important problems', status.importantProblems],
              ['Risks being watched', status.risks],
              ['Active issues', status.issues],
            ].map(([name, value]) => (
              <div key={String(name)} style={{ border: `1px solid ${colors.line}`, borderRadius: 12, padding: 16, background: '#FAFCFE' }}>
                <div style={{ fontSize: 13, color: colors.muted }}>{name}</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: colors.navy, marginTop: 5 }}>{value}</div>
              </div>
            ))}
          </div>
          <Detail title="What the independent reviewer is watching" items={status.reviewFindings} />
          <Detail title="What is holding the project back from completion" items={status.blockers} />
        </section>

        <section style={section}>
          <div style={label}>Project detail</div>
          <Detail title="What is finished" items={status.completed} />
          <Detail title="What is happening now" items={status.activeWork} />
          <Detail title="What happens next" items={status.nextActions} />
        </section>

        <section style={section}>
          <div style={label}>Delivery outlook</div>
          <p style={{ color: '#334155', lineHeight: 1.65, fontSize: 16 }}>{status.deliveryOutlook}</p>
          <div style={{ marginTop: 18 }}>
            <a href={status.links.documents} target="_blank" rel="noreferrer" style={linkButton}>Project Documents</a>
            <a href={status.links.risks} target="_blank" rel="noreferrer" style={secondaryLink}>Risks & Issues Log</a>
            <a href={status.links.slides} target="_blank" rel="noreferrer" style={secondaryLink}>Client Presentation</a>
            <a href={status.links.privatePreview} target="_blank" rel="noreferrer" style={secondaryLink}>Private V2 Preview</a>
          </div>
          <p style={{ fontSize: 12, color: colors.muted, marginBottom: 0 }}>The V2 preview remains private by design. This status dashboard is the public sponsor view.</p>
        </section>

        <footer style={{ textAlign: 'center', color: colors.muted, fontSize: 12, padding: '26px 12px 0' }}>
          Prepared for Jack Dee · MrJackDee.com Experience V2
        </footer>
      </div>
    </main>
  );
}
