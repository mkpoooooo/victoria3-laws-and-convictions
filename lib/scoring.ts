import type { Assessment, Dataset, Evidence, Ideology, Match, Ranking, QuickAnswers } from './model';
import { rankPairs } from './ranking.ts';

export const agreement = (a: number, b: number) => 1 - Math.abs(Math.sign(a)-Math.sign(b))/2;
const mean = (a: number[]) => a.reduce((s,x)=>s+x,0)/a.length;
// An explicit presentation exception requested for the single-issue Feminist ideology.
// Keep its original score and evidence; do not alter the game data or IG components.
function separateSupplementary(assessment: Assessment): Assessment {
  const supplementaryIdeologies = assessment.ideologies.filter(i => i.id === 'ideology_feminist');
  const ideologies = assessment.ideologies.filter(i => i.id !== 'ideology_feminist');
  return { ...assessment, ideologies, supplementaryIdeologies, primaryIdeologies: selectPrimary(ideologies) };
}

function matchCandidate(id: string, kind: Match['kind'], components: Ideology[], answers: Record<string, Ranking>): Match | null {
  const groups: Match['groups'] = [], evidence: Evidence[] = [];
  for (const [gid, tiers] of Object.entries(answers)) {
    const pairs = rankPairs(tiers);
    const relevant = components.filter(i=>Object.hasOwn(i.stances,gid));
    if (!pairs.length || !relevant.length) continue;
    const local = pairs.map(pair => {
      const parts = relevant.map(i=>{
        const stance=i.stances[gid];
        const preference=Math.sign((stance[pair.first] ?? 0)-(stance[pair.second] ?? 0));
        return {id:i.id,preference,agreement:agreement(pair.preference,preference)};
      });
      const consensus = parts.every(p=>p.preference===parts[0].preference) ? parts[0].preference : null;
      return {groupId:gid, first:pair.first,second:pair.second,user:pair.preference,candidate:consensus,agreement:mean(parts.map(p=>p.agreement)),components:parts};
    });
    groups.push({id:gid, score:100*mean(local.map(p=>p.agreement)),pairs:pairs.length});
    evidence.push(...local);
  }
  if (!groups.length) return null;
  return {id,kind,score:mean(groups.map(g=>g.score)),groupCount:groups.length,pairCount:evidence.length,groups,evidence};
}

export function selectPrimary(matches: Match[]): Match[] {
  if (!matches.length) return [];
  return matches.filter(m=>m.score>=70 && matches[0].score-m.score<=10+1e-9);
}

export function assess(data: Dataset, answers: Record<string, Ranking>): Assessment {
  if (!data.meta.verified) throw new Error('数据尚未核验，不能生成测评结果。');
  // Validate the public scoring boundary as well as the text input boundary.
  const groupMap=new Map(data.groups.map(g=>[g.id,g]));
  for (const [gid,tiers] of Object.entries(answers)) {
    const group=groupMap.get(gid);
    if (!group || !Array.isArray(tiers) || tiers.some(t=>!Array.isArray(t)||!t.length)) throw new Error('无效的法律类别或排序。');
    const ids=tiers.flat();
    if (new Set(ids).size!==ids.length || ids.some(id=>!group.laws.some(l=>l.id===id))) throw new Error('排序中包含重复或未知的法律。');
  }
  const ordered=(matches:(Match|null)[])=>matches.filter((m):m is Match=>!!m).sort((a,b)=>b.score-a.score || b.groupCount-a.groupCount || a.id.localeCompare(b.id));
  const ideologies=ordered(data.ideologies.filter(i=>i.character).map(i=>matchCandidate(i.id,'ideology',[i],answers)));
  const igs=ordered(data.igs.map(ig=>matchCandidate(ig.id,'ig',ig.ideologies.map(id=>data.ideologies.find(i=>i.id===id)).filter((i):i is Ideology=>!!i),answers)));
  const validGroups=Object.values(answers).filter(t=>t.flat().length>=2).length;
  return separateSupplementary({mode:'detailed',validGroups,preliminary:validGroups<3,ideologies,igs,primaryIdeologies:selectPrimary(ideologies),primaryIGs:igs.filter(m=>Math.abs(m.score-(igs[0]?.score ?? -1))<1e-9)});
}

export function assessQuick(data: Dataset, answers: QuickAnswers): Assessment {
  if (!data.meta.verified) throw new Error('Unverified dataset.');
  for (const [gid, choices] of Object.entries(answers)) {
    const group = data.groups.find(g => g.id === gid);
    if (!group || !choices || typeof choices !== 'object' || Array.isArray(choices)) throw new Error('Invalid law category.');
    for (const [id, value] of Object.entries(choices)) {
      if (!group.laws.some(l => l.id === id) || (value !== 1 && value !== -1)) throw new Error('Invalid law opinion.');
    }
  }
  const match = (id: string, kind: Match['kind'], components: Ideology[]): Match | null => {
    const groups: Match['groups'] = [], evidence: Evidence[] = [];
    for (const [gid, choices] of Object.entries(answers)) {
      const relevant = components.filter(i => Object.hasOwn(i.stances, gid));
      if (!Object.keys(choices).length || !relevant.length) continue;
      const local: Evidence[] = Object.entries(choices).map(([lawId, user]) => {
        const parts = relevant.map(i => {
          const preference = Math.sign(i.stances[gid][lawId] ?? 0);
          return { id: i.id, preference, agreement: agreement(user, preference) };
        });
        return { groupId: gid, first: lawId, second: '', mode: 'quick', user,
          candidate: parts.every(p => p.preference === parts[0].preference) ? parts[0].preference : null,
          agreement: mean(parts.map(p => p.agreement)), components: parts };
      });
      groups.push({ id: gid, score: 100 * mean(local.map(e => e.agreement)), pairs: local.length });
      evidence.push(...local);
    }
    return groups.length ? { id, kind, score: mean(groups.map(g => g.score)), groupCount: groups.length, pairCount: evidence.length, groups, evidence } : null;
  };
  const order = (items: (Match | null)[]) => items.filter((m): m is Match => !!m).sort((a,b) => b.score-a.score || b.groupCount-a.groupCount || a.id.localeCompare(b.id));
  const ideologies = order(data.ideologies.filter(i => i.character).map(i => match(i.id, 'ideology', [i])));
  const igs = order(data.igs.map(ig => match(ig.id, 'ig', ig.ideologies.map(id => data.ideologies.find(i => i.id === id)).filter((i): i is Ideology => !!i))));
  const validGroups = Object.values(answers).filter(choices => Object.keys(choices).length > 0).length;
  return separateSupplementary({ mode: 'quick', validGroups, preliminary: validGroups < 3, ideologies, igs, primaryIdeologies: selectPrimary(ideologies), primaryIGs: igs.filter(m => Math.abs(m.score-(igs[0]?.score ?? -1)) < 1e-9) });
}
