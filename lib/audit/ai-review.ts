import { ToolLoopAgent } from 'ai';
import type { AuditResult, Finding, Priority } from '../types';
import { buildRemediationPrompt, type AgentName } from './agents';

type AiFinding = {
  priority?: string;
  category?: string;
  title?: string;
  detail?: string;
  recommendation?: string;
  page?: string;
  evidence?: string;
};

type AiAgentPayload = {
  findings?: AiFinding[];
  positives?: string[];
  overallAssessment?: string;
};

type AiReviewResult = {
  findings: Finding[];
  positives: string[];
  assessments: string[];
  aiEnhanced: boolean;
  limitation?: string;
};

const priorities = new Set<Priority>(['P0','P1','P2','P3']);
const allowedCategories = new Set([
  'UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness'
]);

const specialists: Array<{ name: AgentName; instructions: string }> = [
  {
    name: 'Executive UI/UX Designer',
    instructions: `You are a world-renowned digital product and UI/UX designer reviewing a website as if it were being presented by an elite global design studio. Evaluate information architecture, hierarchy, clarity, interaction expectations, mobile experience, visual rhythm, typography signals, content density, trust, conversion flow, consistency, originality, and common vibe-coded failure modes. Be exacting but evidence-based. Do not invent visual facts that are not present in the supplied evidence.`,
  },
  {
    name: 'Web Architect',
    instructions: `You are a principal web architect and senior full-stack engineer. Evaluate route architecture, consistency across pages, performance signals, technical quality, broken or fragile behavior, forms and interaction coverage, production readiness, maintainability, security implications, and whether the site behaves like a coherent production system. Distinguish verified evidence from reasonable architectural inference.`,
  },
  {
    name: 'QA Analyst',
    instructions: `You are a senior QA and accessibility lead. Evaluate the supplied site-wide evidence for broken routes, link failures, inconsistent page states, missing labels or semantics, incomplete controls, accessibility risks, error-state concerns, interaction coverage gaps, and regression risks. Prioritize issues that would materially affect real users.`,
  },
  {
    name: 'Vibe-Code Reviewer',
    instructions: `You are an expert reviewer of AI-assisted and vibe-coded web applications with strong SEO/AEO and product-quality expertise. Look for generic patterns, repetitive layouts, excessive spacing, oversized headings, weak content hierarchy, generic typography, unnecessary cards/gradients, inconsistent patterns, thin page content, weak metadata, production shortcuts, and signs that the experience needs human-level refinement.`,
  },
];

function compactEvidence(audit: AuditResult) {
  const pages = audit.pages.map((page) => ({
    path: safePath(page.url),
    status: page.status,
    title: page.title,
    sections: page.sections ?? 0,
    links: page.links ?? 0,
    buttons: page.buttons ?? 0,
    forms: page.forms ?? 0,
    images: page.images ?? 0,
    headings: page.headings ?? 0,
  }));
  const deterministicFindings = audit.findings.slice(0, 120).map((finding) => ({
    priority: finding.priority,
    category: finding.category,
    title: finding.title,
    page: finding.page,
    detail: finding.detail,
    evidence: finding.evidence,
  }));
  return JSON.stringify({
    site: audit.url,
    summary: audit.summary,
    coverage: audit.coverage,
    scores: audit.scores,
    pages,
    deterministicFindings,
  });
}

function safePath(url: string) {
  try { const parsed = new URL(url); return `${parsed.pathname}${parsed.search}` || '/'; }
  catch { return url; }
}

function stripFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
}

function parsePayload(text: string): AiAgentPayload {
  try { return JSON.parse(stripFence(text)) as AiAgentPayload; }
  catch { return { findings: [], positives: [], overallAssessment: '' }; }
}

function normalizeFinding(raw: AiFinding, agent: AgentName, siteUrl: string): Finding | null {
  const priority = priorities.has(raw.priority as Priority) ? raw.priority as Priority : 'P2';
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0,180) : '';
  const detail = typeof raw.detail === 'string' ? raw.detail.trim().slice(0,1400) : '';
  const recommendation = typeof raw.recommendation === 'string' ? raw.recommendation.trim().slice(0,1400) : '';
  if (!title || !detail || !recommendation) return null;
  const category = allowedCategories.has(raw.category || '') ? raw.category! : 'User Experience';
  const finding = {
    priority,
    category,
    title,
    detail,
    recommendation,
    page: typeof raw.page === 'string' ? raw.page.trim().slice(0,500) : undefined,
    evidence: typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0,1200) : undefined,
    agent,
  } satisfies Finding;
  return { ...finding, prompt: buildRemediationPrompt({ ...finding, agent }, siteUrl) };
}

async function runSpecialist(agentName: AgentName, instructions: string, evidence: string, siteUrl: string) {
  const model = process.env.AI_AUDIT_MODEL || 'openai/gpt-5.4';
  const agent = new ToolLoopAgent({
    model,
    instructions: `${instructions}\n\nReturn only valid JSON. Do not use markdown fences. The JSON shape must be: {"findings":[{"priority":"P0|P1|P2|P3","category":"one allowed audit category","title":"short title","detail":"plain-English explanation","recommendation":"specific remediation","page":"path if applicable","evidence":"specific supplied evidence"}],"positives":["specific strength"],"overallAssessment":"short assessment"}. Limit findings to the 8 highest-value issues not already fully explained by the deterministic checks. Prefer site-wide patterns over duplicate page-level issues. Never claim that you visually saw a rendered page or clicked an interaction because you were given structured audit evidence, not screenshots.`,
    tools: {},
    maxOutputTokens: 5000,
    timeout: 60000,
  });
  const result = await agent.generate({ prompt: `Audit this site-wide evidence for ${siteUrl}:\n${evidence}` });
  const payload = parsePayload(result.text);
  const findings = (payload.findings ?? []).map((item) => normalizeFinding(item, agentName, siteUrl)).filter((item): item is Finding => Boolean(item));
  return {
    findings,
    positives: (payload.positives ?? []).filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0,5),
    assessment: typeof payload.overallAssessment === 'string' ? payload.overallAssessment.trim().slice(0,1200) : '',
  };
}

export async function runAiExpertReview(audit: AuditResult): Promise<AiReviewResult> {
  const evidence = compactEvidence(audit);
  try {
    const results = await Promise.all(specialists.map((specialist) => runSpecialist(specialist.name, specialist.instructions, evidence, audit.url)));
    const seen = new Set<string>();
    const findings: Finding[] = [];
    for (const result of results) {
      for (const finding of result.findings) {
        const key = `${finding.category}|${finding.title.toLowerCase()}|${finding.page || ''}`;
        if (!seen.has(key)) { seen.add(key); findings.push(finding); }
      }
    }
    return {
      findings,
      positives: [...new Set(results.flatMap(result => result.positives))].slice(0,12),
      assessments: results.map(result => result.assessment).filter(Boolean),
      aiEnhanced: true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The AI expert layer could not be reached.';
    return {
      findings: [], positives: [], assessments: [], aiEnhanced: false,
      limitation: `The deterministic site-wide audit completed, but the model-driven expert review was unavailable for this run. ${reason}`,
    };
  }
}
