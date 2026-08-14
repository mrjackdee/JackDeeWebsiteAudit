export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export type Finding = {
  priority: Priority;
  category: string;
  title: string;
  detail: string;
  recommendation: string;
  page?: string;
};

export type PageResult = {
  url: string;
  status: number;
  title: string;
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
};
