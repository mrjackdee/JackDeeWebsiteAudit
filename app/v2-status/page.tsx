import type { Metadata } from 'next';
import styles from './status.module.css';

export const metadata: Metadata = {
  title: 'mrjackdee.com Experience V2 | Executive Status',
  description: 'Public sponsor status dashboard for the mrjackdee.com Experience V2 rebuild.',
  robots: { index: false, follow: false },
};

export const revalidate = 60;

const STATUS_URL = 'https://raw.githubusercontent.com/mrjackdee/JackDeeWebsiteAudit/v2-status-public-data/public-status/status.json';

type Status = {
  project: string; lastUpdated: string; overallCompletion: number; goLiveStatus: string; goLiveReason: string;
  currentFocus: string; designCheckpoint: string; nextMilestone: string; deliveryOutlook: string;
  sponsorActionRequired: boolean; sponsorAction: string; mustFixProblems: number; importantProblems: number;
  risks: number; issues: number; completed: string[]; activeWork: string[]; nextActions: string[];
  reviewFindings: string[]; blockers: string[];
  links: { documents: string; risks: string; slides: string; privatePreview: string };
};

async function getStatus(): Promise<Status> {
  const response = await fetch(STATUS_URL, { next: { revalidate: 60 } });
  if (!response.ok) throw new Error('Project status is temporarily unavailable.');
  return response.json();
}

function ItemList({ values }: { values: string[] }) {
  return <div className={styles.list}>{values.map((item, i) => <div className={styles.listItem} key={`${i}-${item}`}><span className={styles.check}>✓</span><span>{item}</span></div>)}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className={styles.panel}><h2>{title}</h2>{children}</section>;
}

export default async function V2StatusPage() {
  const status = await getStatus();
  const updated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' }).format(new Date(status.lastUpdated));
  const attention = status.mustFixProblems + status.importantProblems;

  return (
    <main className={styles.page} id="top">
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.gridOverlay} />
          <div className={styles.heroInner}>
            <div className={styles.eyebrow}>▦ V2 Project Dashboard</div>
            <h1>{status.project}</h1>
            <p className={styles.intro}>A simple view of where the redesign stands, what has been completed, what needs attention, and what happens next.</p>
            <div className={styles.metrics}>
              <div className={styles.metricCard}>
                <span>How far along are we?</span>
                <strong>{status.overallCompletion}%</strong>
                <div className={styles.progress}><i style={{ width: `${status.overallCompletion}%` }} /></div>
              </div>
              <div className={`${styles.metricCard} ${styles.readiness}`}>
                <span>Can this go live yet?</span>
                <strong>{status.goLiveStatus.toUpperCase()}</strong>
                <p>{status.goLiveReason}</p>
              </div>
              <div className={styles.metricCard}>
                <span>What are we working on?</span>
                <b>{status.currentFocus}</b>
                <small>Updated {updated} ET</small>
              </div>
              <div className={styles.metricCard}>
                <span>Design checkpoint</span>
                <b>{status.designCheckpoint}</b>
                <p>{status.nextMilestone}</p>
              </div>
            </div>
          </div>
        </header>

        {status.sponsorActionRequired && <section className={styles.action}><strong>ACTION NEEDED</strong><p>{status.sponsorAction}</p></section>}

        <div className={styles.mainGrid}>
          <div className={styles.stack}>
            <Panel title="What's finished"><ItemList values={status.completed} /></Panel>
            <Panel title="What's happening now"><ItemList values={status.activeWork} /></Panel>
            <Panel title="What happens next"><ItemList values={status.nextActions} /></Panel>
          </div>
          <div className={styles.stack}>
            <Panel title="Quality check"><div className={styles.countGrid}><div><span>Must-fix problems</span><strong>{status.mustFixProblems}</strong></div><div><span>Important problems</span><strong>{status.importantProblems}</strong></div></div><p className={styles.note}>{attention === 0 ? 'No material problems are open.' : `${attention} items still need attention before this can go live.`}</p></Panel>
            <Panel title="Risks & watch items"><div className={styles.countGrid}><div><span>Possible risks</span><strong>{status.risks}</strong></div><div><span>Current issues</span><strong>{status.issues}</strong></div></div><div className={styles.watch}><span>Items needing close attention</span><strong>{attention}</strong></div></Panel>
            <Panel title="Independent review"><ItemList values={status.reviewFindings} /></Panel>
            <Panel title="Blockers"><ItemList values={status.blockers} /></Panel>
          </div>
        </div>

        <div className={styles.bottomGrid}>
          <Panel title="Helpful links"><div className={styles.links}>
            <a href={status.links.privatePreview} target="_blank" rel="noreferrer"><b>See the V2 website</b><span>Open the private working version ↗</span></a>
            <a href={status.links.documents} target="_blank" rel="noreferrer"><b>Project documents</b><span>Open the V2 Google Drive folder ↗</span></a>
            <a href={status.links.risks} target="_blank" rel="noreferrer"><b>Risks & issues log</b><span>See the detailed project watch list ↗</span></a>
            <a href={status.links.slides} target="_blank" rel="noreferrer"><b>Client presentation</b><span>Open the client presentation ↗</span></a>
          </div></Panel>
          <Panel title="Delivery outlook"><p className={styles.outlook}>{status.deliveryOutlook}</p><div className={styles.next}><span>Next major checkpoint</span><strong>{status.nextMilestone}</strong></div><p className={styles.sponsor}>{status.sponsorAction}</p></Panel>
        </div>

        <footer className={styles.footer}><span>Prepared for Jack Dee | MrJackDee.com Experience V2</span><span>Public sponsor status</span></footer>
      </div>
    </main>
  );
}
