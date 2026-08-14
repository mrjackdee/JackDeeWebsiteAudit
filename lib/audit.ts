import dns from 'node:dns/promises';
import net from 'node:net';
import type { AuditResult, Finding, PageResult, Priority } from './types';

const TIMEOUT = 12000;
const SCORE_KEYS = ['UI Design','User Experience','Mobile','Vibe-Code Quality','Accessibility','Security','SEO/AEO','Technical Quality','Performance','Production Readiness'];
const WEIGHT: Record<Priority, number> = { P0: 18, P1: 10, P2: 5, P3: 2 };

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
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Enter a complete website address beginning with http:// or https://.'); }
  if (!['http:','https:'].includes(url.protocol)) throw new Error('Only public http:// and https:// websites can be audited.');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Private or local network websites cannot be audited.');
  if (net.isIP(url.hostname) && privateIp(url.hostname)) throw new Error('Private network addresses cannot be audited.');
  let records: { address: string }[];
  try { records = await dns.lookup(url.hostname, { all: true }); } catch { throw new Error('The website address could not be resolved. Check it and try again.'); }
  if (!records.length || records.some(r => privateIp(r.address))) throw new Error('This address resolves to a private or restricted network and cannot be audited.');
  url.hash = '';
  return url;
}

function strip(value: string) { return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function title(html: string) { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? strip(m[1]).slice(0,160) : ''; }
function attribute(tag: string, name: string) { return tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`,'i'))?.[1] ?? ''; }
function add(findings: Finding[], finding: Finding) { if (!findings.some(f => f.title === finding.title && f.page === finding.page)) findings.push(finding); }

async function guardedFetch(start: URL, method: 'GET'|'HEAD' = 'GET') {
  let current = start;
  for (let redirects = 0; redirects <= 4; redirects++) {
    current = await safeUrl(current.toString());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const began = Date.now();
    try {
      const response = await fetch(current, { method, redirect: 'manual', signal: controller.signal, cache: 'no-store', headers: { 'user-agent': 'JackDeeWebsiteAudit/1.0 (+https://jack-dee-website-audit.vercel.app)' } });
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

function links(html: string, base: URL) {
  const out: URL[] = [];
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = attribute(tag,'href').trim();
    if (!href || href.startsWith('#') || /^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try { const u = new URL(href,base); if (['http:','https:'].includes(u.protocol)) { u.hash=''; out.push(u); } } catch {}
  }
  return out;
}

function inspect(html: string, pageUrl: URL, headers: Headers, status: number, ms: number, findings: Finding[]) {
  const page = pageUrl.pathname || '/';
  const lower = html.toLowerCase();
  const pageTitle = title(html);
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const controls = html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? [];
  const labels = html.match(/<label\b/gi) ?? [];
  const h1s = html.match(/<h1\b/gi) ?? [];

  if (status >= 500) add(findings,{priority:'P0',category:'Technical Quality',title:'Server error detected',detail:`This page returned HTTP ${status}.`,recommendation:'Resolve the server-side failure and retest the route before launch.',page});
  else if (status >= 400) add(findings,{priority:'P1',category:'Technical Quality',title:'Broken page detected',detail:`This page returned HTTP ${status}.`,recommendation:'Repair or remove the route and update internal links that point to it.',page});

  if (!pageTitle) add(findings,{priority:'P1',category:'SEO/AEO',title:'Missing page title',detail:'No HTML title was detected.',recommendation:'Add a concise, unique title that describes the page.',page});
  if (!/<meta\b[^>]*name=["']description["']/i.test(html)) add(findings,{priority:'P2',category:'SEO/AEO',title:'Missing meta description',detail:'No standard meta description was detected.',recommendation:'Add a specific description summarizing the page for search and answer engines.',page});
  if (!/<meta\b[^>]*property=["']og:/i.test(html)) add(findings,{priority:'P3',category:'SEO/AEO',title:'Social sharing metadata is incomplete',detail:'Open Graph metadata was not detected.',recommendation:'Add Open Graph title, description, image, and URL fields.',page});
  if (!/application\/ld\+json/i.test(html)) add(findings,{priority:'P3',category:'SEO/AEO',title:'No structured data detected',detail:'JSON-LD structured data was not detected.',recommendation:'Add schema.org markup where it fits the page type.',page});

  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) add(findings,{priority:'P1',category:'Mobile',title:'Mobile viewport metadata is missing',detail:'The page does not declare a viewport meta tag.',recommendation:'Add responsive viewport metadata and verify phone, tablet, and desktop layouts.',page});
  if (!/<html\b[^>]*lang=["'][^"']+/i.test(html)) add(findings,{priority:'P2',category:'Accessibility',title:'Document language is not declared',detail:'The root HTML element has no language attribute.',recommendation:'Declare the document language on the root HTML element.',page});
  if (!h1s.length) add(findings,{priority:'P2',category:'Accessibility',title:'No primary page heading',detail:'No H1 heading was detected.',recommendation:'Give the page one clear primary heading.',page});
  const missingAlt = images.filter(i => !/\balt\s*=/.test(i)).length;
  if (missingAlt) add(findings,{priority:'P2',category:'Accessibility',title:'Images missing alternative text',detail:`${missingAlt} image${missingAlt===1?'':'s'} do not declare alt text.`,recommendation:'Add meaningful alt text to informative images and empty alt attributes to decorative images.',page});
  if (controls.length && !labels.length) add(findings,{priority:'P1',category:'Accessibility',title:'Form controls may be unlabeled',detail:`${controls.length} form control${controls.length===1?'':'s'} were found without label elements.`,recommendation:'Associate each user-facing control with a visible label or equivalent accessible name.',page});

  const securityHeaders: [string,string,Priority,string][] = [
    ['content-security-policy','Content Security Policy is missing','P1','Add a restrictive Content-Security-Policy that permits only required sources.'],
    ['x-content-type-options','MIME sniffing protection is missing','P2','Set X-Content-Type-Options: nosniff.'],
    ['referrer-policy','Referrer policy is missing','P3','Set an explicit Referrer-Policy.'],
    ['permissions-policy','Permissions policy is missing','P3','Set a Permissions-Policy limiting browser capabilities the site does not need.']
  ];
  for (const [header,heading,priority,recommendation] of securityHeaders) if (!headers.get(header)) add(findings,{priority,category:'Security',title:heading,detail:`The ${header} response header was not detected.`,recommendation,page});
  if (pageUrl.protocol === 'https:' && !headers.get('strict-transport-security')) add(findings,{priority:'P2',category:'Security',title:'HSTS is not enabled',detail:'Strict-Transport-Security was not detected.',recommendation:'Enable HSTS after confirming production is fully HTTPS.',page});
  if (pageUrl.protocol === 'https:' && /(?:src|href|action)=["']http:\/\//i.test(html)) add(findings,{priority:'P1',category:'Security',title:'Mixed-content reference detected',detail:'An HTTPS page references an HTTP resource or action.',recommendation:'Serve all production assets, links, and actions over HTTPS.',page});

  if (ms > 3000) add(findings,{priority:'P1',category:'Performance',title:'Slow server response observed',detail:`Initial HTML took about ${(ms/1000).toFixed(1)} seconds during this audit.`,recommendation:'Profile server work, upstream calls, caching, and third-party dependencies.',page});
  else if (ms > 1500) add(findings,{priority:'P2',category:'Performance',title:'Server response could be faster',detail:`Initial HTML took about ${(ms/1000).toFixed(1)} seconds during this audit.`,recommendation:'Review caching and server work that delays the initial response.',page});

  const rounded=(lower.match(/rounded-(?:full|2xl|3xl|xl|lg)/g)??[]).length;
  const gradients=(lower.match(/gradient/g)??[]).length;
  const spacing=(lower.match(/(?:py|my|gap)-(?:20|24|28|32|36|40|48|56|64)/g)??[]).length;
  const fullscreens=(lower.match(/min-h-screen/g)??[]).length;
  const huge=(lower.match(/text-(?:6xl|7xl|8xl|9xl)/g)??[]).length;
  const motion=(lower.match(/(?:animate-|transition-|framer-motion|motion\.|@keyframes|intersectionobserver)/g)??[]).length;
  const genericFont=/font-family\s*:\s*(?:inter|arial|helvetica|system-ui)|font-(?:sans|inter)/i.test(html);
  if (genericFont) add(findings,{priority:'P3',category:'Vibe-Code Quality',title:'Typography may feel generic',detail:'Common default sans-serif patterns were detected.',recommendation:'Establish a deliberate brand type system with a distinctive heading or display face and disciplined responsive scale.',page});
  if (rounded>=10) add(findings,{priority:'P3',category:'Vibe-Code Quality',title:'Rounded-card styling appears overused',detail:`A high concentration of rounded UI patterns was detected (${rounded} signals).`,recommendation:'Reduce unnecessary containers and reserve rounded surfaces for components that need containment or interaction.',page});
  if (gradients>=8) add(findings,{priority:'P3',category:'Vibe-Code Quality',title:'Gradient effects may be overused',detail:`A high concentration of gradient patterns was detected (${gradients} signals).`,recommendation:'Keep gradients only where they serve hierarchy or brand identity.',page});
  if (spacing>=8 || fullscreens>=3) add(findings,{priority:'P2',category:'Vibe-Code Quality',title:'Section spacing may be excessive',detail:'Repeated large spacing or full-screen section patterns can make the site feel fragmented.',recommendation:'Reduce oversized vertical gaps and standardize section rhythm across desktop and mobile.',page});
  if (huge>=2) add(findings,{priority:'P2',category:'Vibe-Code Quality',title:'Oversized typography may dominate the interface',detail:'Multiple very large display-text utilities were detected.',recommendation:'Use a more disciplined responsive type scale, particularly on mobile.',page});
  if (!motion) add(findings,{priority:'P3',category:'Vibe-Code Quality',title:'Little evidence of intentional motion',detail:'No common motion or transition signals were detected in the returned markup.',recommendation:'Add subtle purposeful motion where it improves feedback, hierarchy, or storytelling. Respect reduced-motion preferences.',page});
}

function scores(findings: Finding[]) {
  const out: Record<string,number> = Object.fromEntries(SCORE_KEYS.map(k => [k,100]));
  const bucket=(c:string)=>SCORE_KEYS.includes(c)?c:'Technical Quality';
  for (const f of findings) out[bucket(f.category)] = Math.max(0,out[bucket(f.category)]-WEIGHT[f.priority]);
  out['UI Design']=Math.round((out['Vibe-Code Quality']+out['Mobile']+92)/3);
  out['User Experience']=Math.round((out['Accessibility']+out['Mobile']+out['Technical Quality'])/3);
  out['Production Readiness']=Math.round((out['Security']+out['Technical Quality']+out['Accessibility']+out['Performance']+out['Mobile'])/5);
  return out;
}

export async function runAudit(input: string, depth: 'quick'|'standard'|'deep'): Promise<AuditResult> {
  const root=await safeUrl(input); const maxPages=depth==='quick'?5:depth==='deep'?30:15; const maxLinks=depth==='quick'?20:depth==='deep'?120:60;
  const queue=[root]; const visited=new Set<string>(); const discovered=new Map<string,{url:URL,source:string}>(); const findings:Finding[]=[]; const pages:PageResult[]=[];
  while(queue.length && visited.size<maxPages){
    const current=queue.shift()!; if(visited.has(current.toString())) continue; visited.add(current.toString());
    try{
      const {response,url,ms}=await guardedFetch(current); const html=(response.headers.get('content-type')||'').includes('text/html')?await response.text():'';
      pages.push({url:url.toString(),status:response.status,title:title(html)}); if(!html) continue; inspect(html,url,response.headers,response.status,ms,findings);
      for(const link of links(html,url)){ if(!discovered.has(link.toString())) discovered.set(link.toString(),{url:link,source:url.pathname||'/'}); if(link.origin===root.origin && !visited.has(link.toString())) queue.push(link); }
    }catch(e){ add(findings,{priority:visited.size===1?'P0':'P1',category:'Technical Quality',title:'Page could not be fetched',detail:e instanceof Error?e.message:'The page could not be reached.',recommendation:'Confirm the route is publicly reachable and stable.',page:current.pathname||'/'}); pages.push({url:current.toString(),status:0,title:'Unreachable page'}); }
  }
  const sample=[...discovered.values()].slice(0,maxLinks);
  const checked=await Promise.all(sample.map(async item=>{ try{ const {response}=await guardedFetch(item.url,'HEAD'); return {...item,status:response.status}; }catch{return {...item,status:0};} }));
  for(const item of checked){ if(item.status===0) add(findings,{priority:'P2',category:'Technical Quality',title:'Link could not be verified',detail:`A link from ${item.source} did not return a verifiable response: ${item.url}`,recommendation:'Verify the destination manually and replace or remove it if unreliable.',page:item.source}); else if(item.status>=400) add(findings,{priority:item.status>=500?'P1':'P2',category:'Technical Quality',title:'Broken or failing link detected',detail:`A link from ${item.source} returns HTTP ${item.status}: ${item.url}`,recommendation:'Repair the destination or replace the link.',page:item.source}); }
  findings.sort((a,b)=>['P0','P1','P2','P3'].indexOf(a.priority)-['P0','P1','P2','P3'].indexOf(b.priority));
  const launchBlockers=findings.filter(f=>f.priority==='P0'||f.priority==='P1').length;
  return {url:root.toString(),auditedAt:new Date().toISOString(),pagesChecked:pages.length,linksChecked:checked.length,scores:scores(findings),findings,pages,summary:launchBlockers?`${launchBlockers} high-priority issue${launchBlockers===1?'':'s'} should be addressed before launch.`:'No P0 or P1 issues were detected by the automated checks.'};
}
