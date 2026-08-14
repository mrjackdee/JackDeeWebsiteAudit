export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export type Finding = {
  priority: Priority;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  page?: string;
  agent?: string;
  evidence?: string;
  prompt?: string;
};

export type PageResult = {
  url: string;
  status: number;
  title: string;
  sections?: number;
  links?: number;
  buttons?: number;
  forms?: number;
  images?: number;
  headings?: number;
};

export type AuditCoverage = {
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

export type ExpertReview = {
  aiEnhanced: boolean;
  assessments: string[];
  specialists: string[];
};

export type AuditResult = {
  url: string;
  auditedAt: string;
  pagesChecked: number;
  linksChecked: number;
  scores: Record<string, number>;
  findings: Finding[];
  pages: PageResult[];
  summary: string;
  positives?: string[];
  coverage?: AuditCoverage;
  expertReview?: ExpertReview;
};
