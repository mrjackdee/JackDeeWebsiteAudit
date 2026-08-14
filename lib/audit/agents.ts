import type { Finding, PageResult, Priority } from '../types';

export type AgentName =
  | 'Executive UI/UX Designer'
  | 'Visual QA Designer'
  | 'Web Architect'
  | 'Senior Front-End Engineer'
  | 'QA Analyst'
  | 'Accessibility Specialist'
  | 'Security Analyst'
  | 'SEO/AEO Strategist'
  | 'Vibe-Code Reviewer';

export type AgentFinding = Finding & { agent: AgentName; evidence?: string; prompt?: string };

const priorityOrder: Priority[] = ['P0','P1','P2','P3'];

export function buildRemediationPrompt(finding: AgentFinding, siteUrl: string) {
  const pageContext = finding.page ? `\nAffected page or area: ${finding.page}` : '';
  const evidence = finding.evidence ? `\nEvidence observed: ${finding.evidence}` : '';
  return `You are a senior product designer and full-stack engineer improving ${siteUrl}.\n\nFix this issue:\n${finding.title}${pageContext}\n\nProblem:\n${finding.detail}${evidence}\n\nRequired outcome:\n${finding.recommendation}\n\nImplementation requirements:\n- Preserve all working functionality and content unless a change is necessary to solve this issue.\n- Keep the design mobile-first, responsive, accessible, and production-ready.\n- Do not introduce generic AI/vibe-coded patterns such as excessive spacing, oversized headings, repetitive rounded cards, unnecessary gradients, or motion without purpose.\n- Reuse the existing design system and components where appropriate. If inconsistency in the design system is part of the problem, standardize it rather than creating another one-off style.\n- Verify keyboard access, focus states, responsive breakpoints, error states, and reduced-motion behavior where relevant.\n- Test the specific page and any shared components affected by the change.\n- Check the browser console and network requests after the change.\n\nAcceptance criteria:\n1. The documented issue is no longer present.\n2. No existing links, forms, layouts, or interactions are broken.\n3. The solution works on phone, tablet, laptop, and desktop sizes.\n4. The final result looks intentional and professionally designed, not template-generated.\n5. Explain exactly what files/components were changed and how the fix was verified.`;
}

export function finalizeAgentFindings(findings: AgentFinding[], siteUrl: string) {
  return findings
    .map(f => ({ ...f, prompt: buildRemediationPrompt(f, siteUrl) }))
    .sort((a,b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority));
}

export function summarizeGoodSignals(pages: PageResult[], findings: AgentFinding[]) {
  const positives: string[] = [];
  const reachable = pages.filter(p => p.status >= 200 && p.status < 400).length;
  if (reachable === pages.length && pages.length > 0) positives.push(`All ${pages.length} audited pages returned a successful or redirect response.`);
  if (!findings.some(f => f.category === 'Security' && (f.priority === 'P0' || f.priority === 'P1'))) positives.push('No critical or high-priority passive security issue was detected in the automated review.');
  if (!findings.some(f => f.category === 'Accessibility' && (f.priority === 'P0' || f.priority === 'P1'))) positives.push('No critical or high-priority accessibility issue was detected by the automated checks.');
  if (!findings.some(f => f.category === 'Technical Quality' && /broken|server error|could not be fetched/i.test(f.title))) positives.push('The audited routes did not expose obvious broken-page failures.');
  if (!findings.some(f => f.category === 'Mobile' && (f.priority === 'P0' || f.priority === 'P1'))) positives.push('No major mobile-readiness blocker was detected in the returned page structure.');
  return positives;
}
