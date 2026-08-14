import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'JackDee Website Audit',
  description: 'Comprehensive UI, UX, QA, security, accessibility, SEO, and vibe-coding website audits.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
