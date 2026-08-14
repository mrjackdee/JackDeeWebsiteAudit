import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import './polish.css';
import './report.css';

export const metadata: Metadata = {
  title: 'JackDee Website Audit',
  description: 'Site-wide multi-agent UI, UX, QA, architecture, security, accessibility, SEO, and vibe-coding website audits with remediation prompts.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
