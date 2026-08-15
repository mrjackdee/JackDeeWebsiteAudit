import { generateText } from 'ai';
import type { Finding, Priority } from '../types';
import { buildRemediationPrompt } from './agents';
import type { RenderedPageEvidence } from './rendered-browser';

type RawFinding = {
  priority?: string;
  category?: string;
  title?: string;
  detail?: string;
  recommendation?: string;
  page?: string;
  evidence?: string;
};

type VisualPayload = {
  findings?: RawFinding[];
  positives?: string[];
  overallAssessment?: string;
};

export type VisualReviewResult = {
  findings: Finding[];
  positives: string[];
  assessment?: string;
  aiEnhanced: boolean;
  limitation?: string;
};

const priorities = new Set<Priority>(['P0','P1','P2','P3']);
const allowedCategories = new Set(['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Production Readiness']);

function stripFence(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
}

function normalizeFinding(raw: RawFinding, siteUrl: string): Finding | null {
  const priority = priorities.has(raw.priority as Priority) ? raw.priority as Priority : 'P2';
  const title = typeof raw.title === 'string' ? raw.title.trim().slice(0,180) : '';
  const detail = typeof raw.detail === 'string' ? raw.detail.trim().slice(0,1400) : '';
  const recommendation = typeof raw.recommendation === 'string' ? raw.recommendation.trim().slice(0,1400) : '';
  if (!title || !detail || !recommendation) return null;
  const category = allowedCategories.has(raw.category || '') ? raw.category! : 'UI Design';
  const finding = {
    priority,
    category,
    title,
    detail,
    recommendation,
    page: typeof raw.page === 'string' ? raw.page.trim().slice(0,500) : undefined,
    evidence: typeof raw.evidence === 'string' ? raw.evidence.trim().slice(0,1200) : undefined,
    agent: 'Visual QA Designer',
  } satisfies Finding;
  return { ...finding, prompt: buildRemediationPrompt({ ...finding, agent:'Visual QA Designer' }, siteUrl) };
}

export async function runVisualReview(
  siteUrl: string,
  evidence: RenderedPageEvidence[],
): Promise<VisualReviewResult> {
  if (!evidence.length) {
    return { findings:[], positives:[], aiEnhanced:false, limitation:'No rendered screenshots were available for visual AI review.' };
  }
  const hasGatewayContext = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
  if (!hasGatewayContext) {
    return { findings:[], positives:[], aiEnhanced:false, limitation:'Rendered pages were captured, but visual AI review was skipped because AI Gateway authentication is unavailable.' };
  }

  const content: Array<
    | { type:'text'; text:string }
    | { type:'image'; image:string; mediaType:'image/jpeg' }
  > = [{
    type:'text',
    text:`You are a world-class visual QA designer reviewing rendered screenshots from ${siteUrl}. Evaluate what is actually visible: hierarchy, typography, spacing, alignment, responsive behavior, mobile ergonomics, visual rhythm, density, card repetition, excessive rounding, generic gradients, awkward whitespace, clipping, overlap, weak contrast, CTA prominence, navigation clarity, consistency, and whether the interface looks like an elite professionally designed 2026 product rather than a generic AI/vibe-coded site. Use the accessibility snapshots supplied beside each image to understand controls and labels. Do not claim to have clicked controls or tested destructive actions. Return only valid JSON with this exact shape: {"findings":[{"priority":"P0|P1|P2|P3","category":"UI Design|User Experience|Mobile|Vibe-Code Quality|Accessibility|Production Readiness","title":"short title","detail":"plain-English explanation","recommendation":"specific fix","page":"URL or path","evidence":"specific visible evidence"}],"positives":["specific visible strength"],"overallAssessment":"concise visual assessment"}. Limit findings to the 10 highest-value visual issues across the screenshots. Distinguish desktop-only, mobile-only, and cross-viewport issues when relevant.`
  }];

  for (const item of evidence) {
    content.push({
      type:'text',
      text:`Rendered page: ${item.url}\nViewport: ${item.variant}\nPage title: ${item.title}\nInteractive accessibility snapshot:\n${item.snapshot}`,
    });
    content.push({ type:'image', image:item.screenshotBase64, mediaType:'image/jpeg' });
  }

  try {
    const result = await generateText({
      model: process.env.AI_VISUAL_MODEL || process.env.AI_AUDIT_MODEL || 'openai/gpt-5.4',
      messages:[{ role:'user', content }],
      maxOutputTokens:5000,
      timeout:90000,
    });
    const payload = JSON.parse(stripFence(result.text)) as VisualPayload;
    const findings = (payload.findings ?? [])
      .map(item => normalizeFinding(item, siteUrl))
      .filter((item): item is Finding => Boolean(item));
    return {
      findings,
      positives:(payload.positives ?? []).filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0,8),
      assessment:typeof payload.overallAssessment === 'string' ? payload.overallAssessment.trim().slice(0,1400) : undefined,
      aiEnhanced:true,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'The visual AI reviewer could not process the rendered screenshots.';
    return { findings:[], positives:[], aiEnhanced:false, limitation:`Rendered screenshots were captured, but the visual AI review was unavailable. ${reason}` };
  }
}
