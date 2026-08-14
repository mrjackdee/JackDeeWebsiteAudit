import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import './polish.css';

export const metadata: Metadata = {
  title: 'JackDee Website Audit',
  description: 'Comprehensive UI, UX, QA, security, accessibility, SEO, and vibe-coding website audits.',
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
