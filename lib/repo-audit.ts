import type { Finding } from './types';

type GitTree = { tree?: Array<{ path: string; type: string; size?: number; url?: string }>; truncated?: boolean };
type RepoMeta = { default_branch?: string; private?: boolean; archived?: boolean };

export async function auditPublicGithubRepo(input: string): Promise<Finding[]> {
  if (!input.trim()) return [];
  let parsed: URL;
  try { parsed = new URL(input); } catch { return [{priority:'P2',category:'Technical Quality',title:'Repository address is invalid',detail:'The optional GitHub repository address could not be parsed.',recommendation:'Use a complete github.com/owner/repository address.'}]; }
  if (parsed.hostname !== 'github.com') return [{priority:'P2',category:'Technical Quality',title:'Repository host is not supported',detail:'Automated source review currently supports public GitHub repositories only.',recommendation:'Provide a public github.com repository URL or leave this field blank.'}];
  const [owner,repoRaw] = parsed.pathname.split('/').filter(Boolean); const repo=repoRaw?.replace(/\.git$/,'');
  if (!owner || !repo) return [{priority:'P2',category:'Technical Quality',title:'Repository address is incomplete',detail:'The GitHub owner and repository name could not be determined.',recommendation:'Use the format https://github.com/owner/repository.'}];

  const findings: Finding[]=[];
  const headers={Accept:'application/vnd.github+json','User-Agent':'JackDeeWebsiteAudit/1.0'};
  const metaRes=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,{headers,cache:'no-store'});
  if (metaRes.status===404) return [{priority:'P2',category:'Technical Quality',title:'Repository could not be inspected',detail:'The repository is private, missing, or unavailable to anonymous inspection.',recommendation:'Use the deployed-site audit for private repositories, or expose a secure authenticated integration in a future version.'}];
  if (!metaRes.ok) return [{priority:'P3',category:'Technical Quality',title:'Repository scan was limited',detail:`GitHub returned HTTP ${metaRes.status} while source inspection was starting.`,recommendation:'Retry later or continue with the website-only findings.'}];
  const meta=await metaRes.json() as RepoMeta; const branch=meta.default_branch||'main';
  if (meta.archived) findings.push({priority:'P2',category:'Technical Quality',title:'Repository is archived',detail:'GitHub reports this source repository as archived.',recommendation:'Confirm that the audited production site is built from an actively maintained source repository.'});
  const treeRes=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,{headers,cache:'no-store'});
  if (!treeRes.ok) return findings;
  const tree=await treeRes.json() as GitTree; const files=(tree.tree||[]).filter(f=>f.type==='blob');
  if (tree.truncated) findings.push({priority:'P3',category:'Technical Quality',title:'Repository scan was partially limited',detail:'GitHub truncated the recursive source tree because the repository is large.',recommendation:'Treat source-code findings as a sample and perform a full repository review before launch.'});

  const oversized=files.filter(f=>(f.size||0)>250_000 && /\.(tsx?|jsx?|css|scss)$/i.test(f.path));
  if (oversized.length) findings.push({priority:'P2',category:'Technical Quality',title:'Oversized source files detected',detail:`${oversized.length} code or stylesheet file${oversized.length===1?' is':'s are'} larger than 250 KB. Large generated files can be difficult to maintain and can hide duplication.`,recommendation:'Split oversized components and styles into focused modules, remove generated dead code, and verify the resulting bundles.'});

  const componentNames=new Map<string,string[]>();
  for(const f of files.filter(f=>/\.(tsx|jsx)$/i.test(f.path))){const name=f.path.split('/').pop()!.toLowerCase(); const list=componentNames.get(name)||[]; list.push(f.path); componentNames.set(name,list);}
  const duplicates=[...componentNames.values()].filter(v=>v.length>1);
  if(duplicates.length>=3) findings.push({priority:'P3',category:'Vibe-Code Quality',title:'Possible duplicate component patterns',detail:`Multiple repeated component filenames were detected across the repository (${duplicates.length} groups). This can indicate copy-and-paste implementations.`,recommendation:'Review repeated components and consolidate shared UI patterns into a coherent design system where their behavior is genuinely the same.'});

  const sample=files.filter(f=>/\.(tsx|jsx|css|scss)$/i.test(f.path) && (f.size||0)<120_000).slice(0,30);
  let rounded=0, spacing=0, gradients=0, genericFonts=0, fixedHeights=0, absolute=0, animations=0;
  await Promise.all(sample.map(async f=>{
    try{
      const r=await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${f.path.split('/').map(encodeURIComponent).join('/')}`,{cache:'no-store'}); if(!r.ok)return; const text=(await r.text()).toLowerCase();
      rounded+=(text.match(/rounded-(?:full|2xl|3xl|xl|lg)/g)||[]).length;
      spacing+=(text.match(/(?:py|my|gap)-(?:20|24|28|32|36|40|48|56|64)/g)||[]).length;
      gradients+=(text.match(/gradient/g)||[]).length;
      genericFonts+=(text.match(/\b(inter|arial|helvetica|system-ui)\b/g)||[]).length;
      fixedHeights+=(text.match(/(?:height\s*:\s*\d+px|h-\[\d+px\])/g)||[]).length;
      absolute+=(text.match(/\babsolute\b/g)||[]).length;
      animations+=(text.match(/(?:framer-motion|motion\.|animate-|transition-|@keyframes)/g)||[]).length;
    }catch{}
  }));
  if(spacing>=20) findings.push({priority:'P2',category:'Vibe-Code Quality',title:'Large spacing utilities are heavily repeated in source',detail:`The sampled source contains ${spacing} large spacing signals, a common cause of excessive gaps between sections.`,recommendation:'Create a restrained spacing scale and review vertical rhythm page by page, with smaller values on mobile.'});
  if(rounded>=30) findings.push({priority:'P3',category:'Vibe-Code Quality',title:'Rounded UI treatment is heavily repeated in source',detail:`The sampled source contains ${rounded} large-radius utility signals.`,recommendation:'Reduce card-within-card patterns and define when rounded containment is actually needed.'});
  if(gradients>=18) findings.push({priority:'P3',category:'Vibe-Code Quality',title:'Gradient styling is heavily repeated in source',detail:`The sampled source contains ${gradients} gradient signals.`,recommendation:'Replace decorative AI-default gradients with stronger typography, imagery, composition, or restrained brand effects.'});
  if(genericFonts>=5) findings.push({priority:'P3',category:'Vibe-Code Quality',title:'Generic font choices appear in source',detail:'The sampled source repeatedly references common default sans-serif fonts.',recommendation:'Define a purposeful brand typography system and centralize it in global tokens rather than page-level defaults.'});
  if(fixedHeights>=12) findings.push({priority:'P2',category:'Mobile',title:'Fixed pixel heights may create responsive fragility',detail:`The sampled source contains ${fixedHeights} fixed-height signals.`,recommendation:'Replace unnecessary fixed heights with content-driven sizing, min/max constraints, and responsive aspect ratios.'});
  if(absolute>=30) findings.push({priority:'P2',category:'Mobile',title:'Heavy absolute positioning may create layout breakage',detail:`The sampled source contains ${absolute} absolute-positioning signals.`,recommendation:'Review these layouts at intermediate widths and replace structural absolute positioning with grid or flexbox where possible.'});
  if(animations===0) findings.push({priority:'P3',category:'Vibe-Code Quality',title:'Source scan found little motion infrastructure',detail:'No common animation or transition patterns were found in the sampled UI source.',recommendation:'Add purposeful microinteractions and motion where they improve feedback, orientation, and brand character, with reduced-motion fallbacks.'});
  return findings;
}
