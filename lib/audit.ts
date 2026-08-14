import dns from 'node:dns/promises';
import net from 'node:net';
import type { AuditResult, Finding, PageResult, Priority } from './types';
import { finalizeAgentFindings, summarizeGoodSignals, type AgentFinding, type AgentName } from './audit/agents';

const TIMEOUT = 12000;
const SCORE_KEYS = ['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness'];
const WEIGHT: Record<Priority, number> = { P0: 18, P1: 10, P2: 5, P3: 2 };
const USER_AGENT = 'JackDeeWebsiteAudit/2.0 (+https://jack-dee-website-audit.vercel.app)';

function privateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80:');
  }
  return true;
}

export async function safeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter a website address to audit.');
  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
  const normalized = hasScheme ? trimmed : `https://${trimmed}`;
  let url: URL;
  try { url = new URL(normalized); } catch { throw new Error('Enter a valid website address, such as example.com.'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Only public website addresses can be audited.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Private or local network websites cannot be audited.');
  if (net.isIP(url.hostname) && privateIp(url.hostname)) throw new Error('Private network addresses cannot be audited.');
  let records: { address: string }[];
  try { records = await dns.lookup(url.hostname, { all: true }); } catch { throw new Error('The website address could not be resolved. Check it and try again.'); }
  if (!records.length || records.some(r => privateIp(r.address))) throw new Error('This address resolves to a private or restricted network and cannot be audited.');
  url.hash = '';
  return url;
}

function strip(value: string) { return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function pageTitle(html: string) { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? strip(m[1]).slice(0,160) : ''; }
function attribute(tag: string, name: string) { return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1] ?? ''; }
function add(findings: AgentFinding[], agent: AgentName, finding: Omit<AgentFinding,'agent'>) {
  if (!findings.some(f => f.title === finding.title && f.page === finding.page)) findings.push({ ...finding, agent });
}

async function guardedFetch(start: URL, method: 'GET'|'HEAD' = 'GET') {
  let current = start;
  for (let redirects = 0; redirects <= 5; redirects++) {
    current = await safeUrl(current.toString());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const began = Date.now();
    try {
      const response = await fetch(current, { method, redirect: 'manual', signal: controller.signal, cache: 'no-store', headers: { 'user-agent': USER_AGENT } });
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { response, url: current, ms: Date.now() - began };
        current = new URL(location, current);
        continue;
      }
      return { response, url: current, ms: Date.now() - began };
    } finally { clearTimeout(timer); }
  }
  throw new Error('Too many redirects were encountered.');
}

function extractLinks(html: string, base: URL) {
  const out: URL[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attribute(tag,'href').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try { const u = new URL(href,base); if (['http:','https:'].includes(u.protocol)) { u.hash=''; out.push(u); } } catch {}
  }
  return out;
}

function count(html: string, re: RegExp) { return (html.match(re) ?? []).length; }

function inspectPage(html: string, pageUrl: URL, headers: Headers, status: number, ms: number, findings: AgentFinding[]): PageResult {
  const page = pageUrl.pathname || '/';
  const lower = html.toLowerCase();
  const title = pageTitle(html);
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const controls = html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? [];
  const labels = html.match(/<label\b/gi) ?? [];
  const h1s = html.match(/<h1\b/gi) ?? [];
  const sections = count(html, /<(section|main|article)\b/gi);
  const forms = count(html, /<form\b/gi);
  const buttons = count(html, /<button\b/gi);
  const links = count(html, /<a\b/gi);
  const headings = count(html, /<h[1-6]\b/gi);
  const placeholderLinks = (html.match(/<a\b[^>]*href=["'](?:#|javascript:[^"']*)["'][^>]*>/gi) ?? []).length;
  const emptyButtons = (html.match(/<button\b[^>]*>\s*(?:<[^>]+>\s*)*<\/button>/gi) ?? []).filter(tag => !/aria-label\s*=|title\s*=/i.test(tag)).length;

  if (status >= 500) add(findings,'QA Analyst',{priority:'P0',category:'Technical Quality',title:'Server error detected',detail:`This page returned HTTP ${status}.`,recommendation:'Resolve the server-side failure and retest the route before launch.',page,evidence:`HTTP ${status}`});
  else if (status >= 400) add(findings,'QA Analyst',{priority:'P1',category:'Technical Quality',title:'Broken page detected',detail:`This page returned HTTP ${status}.`,recommendation:'Repair or remove the route and update internal links that point to it.',page,evidence:`HTTP ${status}`});

  if (!title) add(findings,'SEO/AEO Strategist',{priority:'P1',category:'SEO/AEO',title:'Missing page title',detail:'The page does not provide a descriptive browser/search title.',recommendation:'Add a concise, unique title that clearly describes this page.',page,evidence:'No <title> element detected.'});
  if (!/<meta\b[^>]*name=["']description["']/i.test(html)) add(findings,'SEO/AEO Strategist',{priority:'P2',category:'SEO/AEO',title:'Missing meta description',detail:'Search engines and answer engines have no page-specific summary to work with.',recommendation:'Add a specific meta description that accurately summarizes the page and its value.',page});
  if (!/<meta\b[^>]*property=["']og:/i.test(html)) add(findings,'SEO/AEO Strategist',{priority:'P3',category:'SEO/AEO',title:'Social sharing metadata is incomplete',detail:'Open Graph metadata was not detected.',recommendation:'Add Open Graph title, description, image, and canonical URL fields.',page});
  if (!/application\/ld\+json/i.test(html)) add(findings,'SEO/AEO Strategist',{priority:'P3',category:'SEO/AEO',title:'No structured data detected',detail:'The page does not expose JSON-LD structured data.',recommendation:'Add schema.org markup that matches the page type and visible content.',page});

  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) add(findings,'Senior Front-End Engineer',{priority:'P1',category:'Mobile',title:'Mobile viewport metadata is missing',detail:'The browser is not being given the standard responsive viewport instruction.',recommendation:'Add responsive viewport metadata and verify phone, tablet, laptop, and desktop layouts.',page});
  if (!/<html\b[^>]*lang=["'][^"']+/i.test(html)) add(findings,'Accessibility Specialist',{priority:'P2',category:'Accessibility',title:'Document language is not declared',detail:'Assistive technology cannot reliably determine the page language.',recommendation:'Declare the page language on the root HTML element.',page});
  if (!h1s.length) add(findings,'Accessibility Specialist',{priority:'P2',category:'Accessibility',title:'No primary page heading',detail:'The page has no clear H1 to communicate its primary topic.',recommendation:'Give the page one clear primary heading that matches its purpose.',page});
  if (h1s.length > 1) add(findings,'Executive UI/UX Designer',{priority:'P3',category:'UI Design',title:'Multiple primary headings weaken hierarchy',detail:`${h1s.length} H1 headings were detected on this page.`,recommendation:'Use one primary page heading and organize subsequent content with a deliberate H2/H3 hierarchy.',page,evidence:`${h1s.length} H1 elements`});
  const missingAlt = images.filter(i => !/\balt\s*=/.test(i)).length;
  if (missingAlt) add(findings,'Accessibility Specialist',{priority:'P2',category:'Accessibility',title:'Images missing alternative text',detail:`${missingAlt} image${missingAlt===1?'':'s'} do not declare alt text.`,recommendation:'Add meaningful alt text to informative images and empty alt attributes to decorative images.',page,evidence:`${missingAlt} image elements without alt attributes`});
  if (controls.length && !labels.length) add(findings,'Accessibility Specialist',{priority:'P1',category:'Accessibility',title:'Form controls may be unlabeled',detail:`${controls.length} form control${controls.length===1?'':'s'} were found without visible label elements.`,recommendation:'Give every user-facing form control a visible label and an accessible programmatic name.',page,evidence:`${controls.length} controls and 0 label elements`});
  if (emptyButtons) add(findings,'Accessibility Specialist',{priority:'P1',category:'Accessibility',title:'Buttons may not have accessible names',detail:`${emptyButtons} button${emptyButtons===1?'':'s'} appear to contain no readable label.`,recommendation:'Give icon-only buttons an aria-label and ensure every control communicates its action to screen readers.',page,evidence:`${emptyButtons} unlabeled-looking button elements`});

  const securityHeaders: [string,string,Priority,string][] = [
    ['content-security-policy','Content Security Policy is missing','P1','Add a restrictive Content-Security-Policy that permits only required sources.'],
    ['x-content-type-options','MIME sniffing protection is missing','P2','Set X-Content-Type-Options: nosniff.'],
    ['referrer-policy','Referrer policy is missing','P3','Set an explicit Referrer-Policy.'],
    ['permissions-policy','Permissions policy is missing','P3','Set a Permissions-Policy limiting browser capabilities the site does not need.']
  ];
  for (const [header,heading,priority,recommendation] of securityHeaders) if (!headers.get(header)) add(findings,'Security Analyst',{priority,category:'Security',title:heading,detail:`The ${header} response header was not detected.`,recommendation,page,evidence:`Missing response header: ${header}`});
  if (pageUrl.protocol === 'https:' && !headers.get('strict-transport-security')) add(findings,'Security Analyst',{priority:'P2',category:'Security',title:'HSTS is not enabled',detail:'Strict-Transport-Security was not detected.',recommendation:'Enable HSTS after confirming production is fully HTTPS.',page});
  if (pageUrl.protocol === 'https:' && /(?:src|href|action)=["']http:\/\//i.test(html)) add(findings,'Security Analyst',{priority:'P1',category:'Security',title:'Mixed-content reference detected',detail:'An HTTPS page references an HTTP resource or action.',recommendation:'Serve all production assets, links, and actions over HTTPS.',page});

  if (ms > 3000) add(findings,'Web Architect',{priority:'P1',category:'Performance',title:'Slow server response observed',detail:`The initial HTML response took about ${(ms/1000).toFixed(1)} seconds during this audit.`,recommendation:'Profile server work, upstream calls, caching, and third-party dependencies that delay the first response.',page,evidence:`${ms} ms HTML response`});
  else if (ms > 1500) add(findings,'Web Architect',{priority:'P2',category:'Performance',title:'Server response could be faster',detail:`The initial HTML response took about ${(ms/1000).toFixed(1)} seconds.`,recommendation:'Review caching, server work, and third-party calls that delay the page response.',page,evidence:`${ms} ms HTML response`});

  if (!/<nav\b/i.test(html) && page === '/') add(findings,'Executive UI/UX Designer',{priority:'P2',category:'User Experience',title:'Primary navigation is not clearly represented',detail:'No semantic navigation region was detected on the homepage.',recommendation:'Provide a clear primary navigation structure that helps users understand the site and reach important destinations quickly.',page});
  if (!/<footer\b/i.test(html)) add(findings,'Executive UI/UX Designer',{priority:'P3',category:'User Experience',title:'Page lacks a clear footer region',detail:'No semantic footer was detected.',recommendation:'Use a consistent footer for secondary navigation, trust information, contact paths, and legal links when appropriate.',page});
  if (sections > 14) add(findings,'Executive UI/UX Designer',{priority:'P3',category:'UI Design',title:'Page may feel overly long or fragmented',detail:`${sections} major content regions were detected on one page.`,recommendation:'Review whether sections can be consolidated, reordered, or progressively disclosed to create a stronger visual and narrative rhythm.',page,evidence:`${sections} section/main/article regions`});
  if (placeholderLinks) add(findings,'QA Analyst',{priority:'P1',category:'Technical Quality',title:'Placeholder or non-functional links detected',detail:`${placeholderLinks} link${placeholderLinks===1?'':'s'} use # or javascript-style destinations.`,recommendation:'Connect each visible link to a real destination or replace it with the correct interactive control.',page,evidence:`${placeholderLinks} placeholder links`});

  const rounded=(lower.match(/rounded-(?:full|2xl|3xl|xl|lg)/g)??[]).length;
  const gradients=(lower.match(/gradient/g)??[]).length;
  const spacing=(lower.match(/(?:py|my|gap)-(?:20|24|28|32|36|40|48|56|64)/g)??[]).length;
  const fullscreens=(lower.match(/min-h-screen/g)??[]).length;
  const huge=(lower.match(/text-(?:6xl|7xl|8xl|9xl)/g)??[]).length;
  const motion=(lower.match(/(?:animate-|transition-|framer-motion|motion\.|@keyframes|intersectionobserver)/g)??[]).length;
  const genericFont=/font-family\s*:\s*(?:inter|arial|helvetica|system-ui)|font-(?:sans|inter)/i.test(html);
  if (genericFont) add(findings,'Vibe-Code Reviewer',{priority:'P3',category:'Vibe-Code Quality',title:'Typography may feel generic',detail:'Common default sans-serif patterns were detected.',recommendation:'Establish a deliberate brand type system with a distinctive heading or display face and disciplined responsive scale.',page});
  if (rounded>=10) add(findings,'Vibe-Code Reviewer',{priority:'P3',category:'Vibe-Code Quality',title:'Rounded-card styling appears overused',detail:`A high concentration of rounded UI patterns was detected (${rounded} signals).`,recommendation:'Reduce unnecessary containers and reserve rounded surfaces for components that genuinely need containment or interaction.',page,evidence:`${rounded} rounded UI signals`});
  if (gradients>=8) add(findings,'Vibe-Code Reviewer',{priority:'P3',category:'Vibe-Code Quality',title:'Gradient effects may be overused',detail:`A high concentration of gradient patterns was detected (${gradients} signals).`,recommendation:'Keep gradients only where they reinforce hierarchy or brand identity.',page});
  if (spacing>=8 || fullscreens>=3) add(findings,'Vibe-Code Reviewer',{priority:'P2',category:'Vibe-Code Quality',title:'Section spacing may be excessive',detail:'Repeated large spacing or full-screen section patterns can make the site feel fragmented and AI-generated.',recommendation:'Reduce oversized vertical gaps and establish a consistent section rhythm across desktop and mobile.',page});
  if (huge>=2) add(findings,'Vibe-Code Reviewer',{priority:'P2',category:'Vibe-Code Quality',title:'Oversized typography may dominate the interface',detail:'Multiple very large display-text utilities were detected.',recommendation:'Use a more disciplined responsive type scale, particularly on mobile.',page});
  if (!motion && sections >= 4) add(findings,'Executive UI/UX Designer',{priority:'P3',category:'Vibe-Code Quality',title:'Little evidence of intentional motion',detail:'The page contains multiple content regions but no common motion or transition signals were detected in the returned markup.',recommendation:'Add subtle purposeful motion only where it improves feedback, hierarchy, orientation, or storytelling, and respect reduced-motion preferences.',page});

  return { url: pageUrl.toString(), status, title, sections, links, buttons, forms, images: images.length, headings };
}

function scores(findings: Finding[]) {
  const out: Record<string,number> = Object.fromEntries(SCORE_KEYS.map(k => [k,100]));
  const bucket=(c:string)=>SCORE_KEYS.includes(c)?c:'Technical Quality';
  for (const f of findings) out[bucket(f.category)] = Math.max(0,out[bucket(f.category)]-WEIGHT[f.priority]);
  out['UI Design']=Math.round((out['Vibe-Code Quality']+out['Mobile']+out['Accessibility']+92)/4);
  out['User Experience']=Math.round((out['Accessibility']+out['Mobile']+out['Technical Quality']+out['UI Design'])/4);
  out['Production Readiness']=Math.round((out['Security']+out['Technical Quality']+out['Accessibility']+out['Performance']+out['Mobile'])/5);
  return out;
}

async function sitemapCandidates(root: URL) {
  const urls = new Set<string>();
  const sitemapUrls = new Set<string>([new URL('/sitemap.xml', root).toString()]);
  try {
    const robots = await guardedFetch(new URL('/robots.txt', root));
    if (robots.response.ok) {
      const text = await robots.response.text();
      for (const m of text.matchAll(/^sitemap:\s*(\S+)/gim)) sitemapUrls.add(m[1]);
    }
  } catch {}
  const visited = new Set<string>();
  const queue = [...sitemapUrls];
  while (queue.length && visited.size < 12 && urls.size < 1000) {
    const next = queue.shift()!;
    if (visited.has(next)) continue;
    visited.add(next);
    try {
      const target = await safeUrl(next);
      const { response } = await guardedFetch(target);
      if (!response.ok) continue;
      const xml = await response.text();
      for (const m of xml.matchAll(/<loc[^>]*>([^<]+)<\/loc>/gi)) {
        const value = m[1].trim().replace(/&amp;/g,'&');
        try {
          const u = new URL(value);
          if (u.origin !== root.origin) continue;
          if (/\.xml(?:$|\?)/i.test(u.pathname + u.search) && queue.length < 25) queue.push(u.toString());
          else { u.hash=''; urls.add(u.toString()); }
        } catch {}
      }
    } catch {}
  }
  return urls;
}

async function verifyLink(item: {url:URL,source:string}) {
  try {
    let result = await guardedFetch(item.url,'HEAD');
    if ([403,405].includes(result.response.status)) result = await guardedFetch(item.url,'GET');
    return {...item,status:result.response.status};
  } catch { return {...item,status:0}; }
}

async function inBatches<T,R>(items: T[], size: number, fn: (item:T)=>Promise<R>) {
  const out: R[] = [];
  for (let i=0;i<items.length;i+=size) out.push(...await Promise.all(items.slice(i,i+size).map(fn)));
  return out;
}

export async function runAudit(input: string, depth: 'quick'|'standard'|'deep'): Promise<AuditResult> {
  const root=await safeUrl(input);
  const maxPages=depth==='quick'?10:depth==='deep'?200:75;
  const maxLinks=depth==='quick'?100:depth==='deep'?1500:500;
  const sitemap=await sitemapCandidates(root);
  const queue: URL[]=[root,...[...sitemap].map(v=>new URL(v))];
  const queued=new Set(queue.map(u=>u.toString()));
  const visited=new Set<string>();
  const discovered=new Map<string,{url:URL,source:string}>();
  const findings:AgentFinding[]=[];
  const pages:PageResult[]=[];

  while(queue.length && visited.size<maxPages){
    const batch: URL[]=[];
    while(queue.length && batch.length<6 && visited.size+batch.length<maxPages){
      const current=queue.shift()!;
      if(!visited.has(current.toString())) batch.push(current);
    }
    const results=await Promise.all(batch.map(async current=>{
      visited.add(current.toString());
      try{
        const {response,url,ms}=await guardedFetch(current);
        const html=(response.headers.get('content-type')||'').includes('text/html')?await response.text():'';
        if(!html) return {page:{url:url.toString(),status:response.status,title:pageTitle(html)} as PageResult,links:[] as URL[]};
        return {page:inspectPage(html,url,response.headers,response.status,ms,findings),links:extractLinks(html,url)};
      }catch(e){
        add(findings,'QA Analyst',{priority:visited.size===1?'P0':'P1',category:'Technical Quality',title:'Page could not be fetched',detail:e instanceof Error?e.message:'The page could not be reached.',recommendation:'Confirm the route is publicly reachable and stable, then retest it.',page:current.pathname||'/',evidence:current.toString()});
        return {page:{url:current.toString(),status:0,title:'Unreachable page'} as PageResult,links:[] as URL[]};
      }
    }));
    for(const result of results){
      pages.push(result.page);
      const source=new URL(result.page.url).pathname||'/';
      for(const link of result.links){
        if(!discovered.has(link.toString())) discovered.set(link.toString(),{url:link,source});
        if(link.origin===root.origin && !visited.has(link.toString()) && !queued.has(link.toString())) { queue.push(link); queued.add(link.toString()); }
      }
    }
  }

  const linkSample=[...discovered.values()].slice(0,maxLinks);
  const checked=await inBatches(linkSample,20,verifyLink);
  for(const item of checked){
    if(item.status===0) add(findings,'QA Analyst',{priority:'P2',category:'Technical Quality',title:'Link could not be verified',detail:`A link from ${item.source} did not return a verifiable response.`,recommendation:'Verify the destination and replace or remove the link if it is unreliable.',page:item.source,evidence:item.url.toString()});
    else if(item.status>=400) add(findings,'QA Analyst',{priority:item.status>=500?'P1':'P2',category:'Technical Quality',title:'Broken or failing link detected',detail:`A link from ${item.source} returns HTTP ${item.status}.`,recommendation:'Repair the destination, update the route, or replace the link.',page:item.source,evidence:`${item.url} returned HTTP ${item.status}`});
  }

  const finalized=finalizeAgentFindings(findings,root.toString());
  const launchBlockers=finalized.filter(f=>f.priority==='P0'||f.priority==='P1').length;
  const sectionsReviewed=pages.reduce((sum,p)=>sum+(p.sections??0),0);
  const formsReviewed=pages.reduce((sum,p)=>sum+(p.forms??0),0);
  const buttonsReviewed=pages.reduce((sum,p)=>sum+(p.buttons??0),0);
  const truncated=queue.length>0 || discovered.size>maxLinks;
  const limitations=[
    'The audit evaluates publicly reachable content only. Authenticated pages require a future authenticated-audit capability.',
    'Forms and controls are inventoried and reviewed structurally, but destructive actions, purchases, messages, deletes, and other side-effecting submissions are not automatically executed.'
  ];
  if(truncated) limitations.unshift(`The site exceeded this audit tier's safety limit. ${pages.length} pages and ${checked.length} links were checked; use the deepest tier or split very large sites into sections for additional coverage.`);
  return {
    url:root.toString(),auditedAt:new Date().toISOString(),pagesChecked:pages.length,linksChecked:checked.length,
    scores:scores(finalized),findings:finalized,pages,
    summary:launchBlockers?`${launchBlockers} high-priority issue${launchBlockers===1?'':'s'} should be addressed before launch. The report covers ${pages.length} publicly discoverable pages, ${sectionsReviewed} content regions, ${formsReviewed} forms, and ${buttonsReviewed} buttons.`:`No P0 or P1 issues were detected by the automated agents across ${pages.length} publicly discoverable pages.`,
    positives:summarizeGoodSignals(pages,finalized),
    coverage:{discoveredPages:queued.size,auditedPages:pages.length,linksChecked:checked.length,sectionsReviewed,formsReviewed,buttonsReviewed,sitemapPagesFound:sitemap.size,truncated,limitations}
  };
}
