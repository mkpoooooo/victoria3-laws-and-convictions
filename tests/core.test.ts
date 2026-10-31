import { closedLawPanel, toggleLawPanel, completeLawPanel } from '../lib/law-panel.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseRanking, formatRanking } from '../lib/ranking.ts';
import { agreement, assess, assessQuick, selectPrimary } from '../lib/scoring.ts';
import type { Dataset, Group, Ideology, Match } from '../lib/model';

const law=(id:string)=>({id,name:id,english:id,icon:'',description:'',summary:'',source:''});
const group=(id:string,ids:string[]):Group=>({id,name:id,english:id,category:'power_structure',source:'',laws:ids.map(law)});
const ideology=(id:string,stances:Ideology['stances'],character=true):Ideology=>({id,name:id,english:id,description:'',icon:'',source:'',character,stances});
const data=(ideologies:Ideology[]):Dataset=>({meta:{targetVersion:'test',buildId:'test',verified:true,update:'',dataNote:'',sourceFiles:0},groups:[group('g',['a','b','c']),group('h',['x','y']),group('j',['q','r'])],ideologies,igs:[]});
const g=group('g',['a','b','c']);

test('compact and separated input produce the same ordering',()=>assert.deepEqual(parseRanking('312',g).tiers,parseRanking('3>1>2',g).tiers));
test('ties and partial ordering preserve only evaluated laws',()=>assert.deepEqual(parseRanking('3>1=2',g).tiers,[['c'],['a','b']]));
test('fullwidth characters and comma separators work',()=>assert.deepEqual(parseRanking('３，１＝２',g).tiers,[['c'],['a','b']]));
test('empty and singleton answers are not valid comparisons',()=>{assert.equal(parseRanking('',g).valid,false);assert.equal(parseRanking('1',g).count,1);assert.equal(parseRanking('1',g).valid,false);});
test('repeated, zero, unknown and malformed numbers fail',()=>{for(const v of ['11','0','4','3>','1==2','x','1>2>1'])assert.ok(parseRanking(v,g).error,v);});
test('all legal options can be tied',()=>assert.deepEqual(parseRanking('1=2=3',g).tiers,[['a','b','c']]));
test('formatting skips empty tiers without inventing answers',()=>assert.equal(formatRanking([[],['c'],['a','b']],g),'3>1=2'));
test('two-digit numbering is unambiguous when available',()=>{const big=group('g',Array.from({length:12},(_,i)=>'law'+i));assert.equal(parseRanking('10',big).count,1);assert.equal(parseRanking('12>1',big).valid,true);});
test('pair agreement covers ordering and ties',()=>{assert.equal(agreement(1,1),1);assert.equal(agreement(1,-1),0);assert.equal(agreement(0,1),.5);assert.equal(agreement(0,0),1);});
test('reversing a preference reverses a direct match',()=>{const d=data([ideology('i',{g:{a:2,b:-2}})]);assert.equal(assess(d,{g:[['a'],['b']]}).ideologies[0].score,100);assert.equal(assess(d,{g:[['b'],['a']]}).ideologies[0].score,0);});
test('unanswered law opinions cannot change a score',()=>{const d=data([ideology('i',{g:{a:2,b:-2,c:2}})]);const s=assess(d,{g:[['a'],['b']]}).ideologies[0].score;d.ideologies[0].stances.g.c=-2;assert.equal(assess(d,{g:[['a'],['b']]}).ideologies[0].score,s);});
test('each category gets equal weight regardless of pair count',()=>{const d=data([ideology('i',{g:{a:2,b:0,c:-2},h:{x:-2,y:2}})]);const m=assess(d,{g:[['a'],['b'],['c']],h:[['x'],['y']]}).ideologies[0];assert.equal(m.score,50);assert.equal(m.pairCount,4);});
test('absent categories are excluded, absent laws inside a category are neutral',()=>{const d=data([ideology('i',{g:{a:1}})]);const m=assess(d,{g:[['a'],['b']],h:[['x'],['y']]}).ideologies[0];assert.equal(m.groupCount,1);assert.equal(m.score,100);});
test('no effective comparisons yields no candidates',()=>{const d=data([ideology('i',{g:{a:1}})]);assert.equal(assess(d,{}).ideologies.length,0);assert.equal(assess(d,{g:[['a']]}).ideologies.length,0);});
test('evidence carries the exact law pair and direction',()=>{const m=assess(data([ideology('i',{g:{a:-1,b:1}})]),{g:[['a'],['b']]}).ideologies[0];assert.deepEqual(m.evidence[0].first,'a');assert.equal(m.evidence[0].candidate,-1);assert.equal(m.evidence[0].agreement,0);});
test('IG constituent ideologies average within category',()=>{const d=data([ideology('i',{g:{a:1,b:-1}},false),ideology('k',{g:{a:-1,b:1},h:{x:1,y:-1}},false)]);d.igs=[{id:'ig',name:'ig',english:'ig',icon:'',description:'',source:'',ideologies:['i','k']}];assert.equal(assess(d,{g:[['a'],['b']],h:[['x'],['y']]}).igs[0].score,75);});
test('equal IG scores remain co-winners',()=>{const d=data([ideology('i',{g:{a:1,b:0}})]);d.igs=['first','second'].map(id=>({id,name:id,english:id,icon:'',description:'',source:'',ideologies:['i']}));assert.equal(assess(d,{g:[['a'],['b']]}).primaryIGs.length,2);});
test('multiple main ideologies have no fixed three-item cap',()=>{const ms=[100,99,97,95,90,89].map((score,i)=>({id:String(i),score} as Match));assert.equal(selectPrimary(ms).length,5);});
test('low matching scores are not called clear matches',()=>assert.deepEqual(selectPrimary([{score:69} as Match]),[]));
test('the 70-point threshold is inclusive',()=>assert.equal(selectPrimary([{score:75} as Match,{score:70} as Match,{score:69.99} as Match]).length,2));
test('preliminary status depends on effective categories',()=>{const d=data([ideology('i',{g:{a:1},h:{x:1},j:{q:1}})]);assert.equal(assess(d,{g:[['a'],['b']],h:[['x'],['y']]}).preliminary,true);assert.equal(assess(d,{g:[['a'],['b']],h:[['x'],['y']],j:[['q'],['r']]}).preliminary,false);});
test('scoring rejects duplicate or foreign IDs',()=>{const d=data([]);assert.throws(()=>assess(d,{g:[['a'],['a']]}));assert.throws(()=>assess(d,{g:[['unknown']]}));assert.throws(()=>assess(d,{fake:[['a']]}));});
test('unverified datasets cannot produce results',()=>{const d=data([]);d.meta.verified=false;assert.throws(()=>assess(d,{}));});

// Game assets are generated locally and intentionally excluded from this repository.
const hasSnapshot=existsSync(new URL('../public/game-data.json',import.meta.url));
const actual:Dataset=hasSnapshot?JSON.parse(readFileSync(new URL('../public/game-data.json',import.meta.url),'utf8')):data([]);
const snapshotTest=hasSnapshot?test:test.skip;
snapshotTest('actual snapshot contains 24 categories, 110 general laws and 8 IGs',()=>{assert.equal(actual.groups.length,24);assert.equal(actual.groups.flatMap(g=>g.laws).length,110);assert.equal(actual.igs.length,8);assert.equal(actual.meta.targetVersion,'1.14 公测版');});
snapshotTest('every law has a distinct explanation, original description, icon and stable ID',()=>{const ids=new Set<string>();for(const g of actual.groups)for(const l of g.laws){assert.ok(!ids.has(l.id));ids.add(l.id);assert.ok(l.summary&&l.description,l.id);assert.notEqual(l.summary,l.description,l.id);assert.ok(!/[\[\]$]/.test(l.description),l.id);assert.ok(existsSync(new URL('../public'+l.icon,import.meta.url)),l.id);}});
snapshotTest('IG constituents resolve to explicit ideology definitions',()=>{for(const ig of actual.igs)for(const id of ig.ideologies)assert.ok(actual.ideologies.some(i=>i.id===id),id);});
snapshotTest('all character candidates have law stances and translated names',()=>{const candidates=actual.ideologies.filter(i=>i.character);assert.equal(candidates.length,46);for(const i of candidates){assert.ok(Object.keys(i.stances).length);assert.ok(!i.name.startsWith('ideology_'),i.id);assert.ok(existsSync(new URL('../public'+i.icon,import.meta.url)),i.id);}});
snapshotTest('national law variants are excluded',()=>{const ids=actual.groups.flatMap(g=>g.laws.map(l=>l.id));for(const id of ['law_bakufu','law_sakoku','law_millet_system','law_elder_council','law_chiefdom','law_homesteading'])assert.ok(!ids.includes(id));});
snapshotTest('captured source files match their recorded hashes',()=>{const manifest=JSON.parse(readFileSync(new URL('../data/sources/snapshot-manifest.json',import.meta.url),'utf8'));for(const entry of manifest){const bytes=readFileSync(new URL('../data/sources/snapshot/'+entry.path,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,entry.path);}});
snapshotTest('actual data produces finite scores with full evidence and stable results',()=>{const answers=Object.fromEntries(actual.groups.map(g=>[g.id,g.laws.map(l=>[l.id])]));const a=assess(actual,answers),b=assess(actual,answers);assert.deepEqual(a,b);assert.equal(a.validGroups,24);for(const m of [...a.ideologies,...a.igs]){assert.ok(Number.isFinite(m.score)&&m.score>=0&&m.score<=100);assert.equal(m.pairCount,m.evidence.length);}});

snapshotTest('exported stances independently agree with every captured script block',()=>{
 const levels:Record<string,number>={strongly_disapprove:-2,disapprove:-1,neutral:0,approve:1,strongly_approve:2};
 for(const ideology of actual.ideologies){
  const source=readFileSync(new URL('../data/sources/snapshot/'+ideology.source,import.meta.url),'utf8').replace(/^\uFEFF/,'').replace(/#[^\r\n]*/g,'');
  const marker=new RegExp('(?:^|\\n)'+ideology.id+'\\s*=\\s*\\{').exec(source);assert.ok(marker,ideology.id);
  const start=marker.index+marker[0].length;let cursor=start,depth=1;
  while(depth&&cursor<source.length){if(source[cursor]==='{')depth++;else if(source[cursor]==='}')depth--;cursor++;}
  const block=source.slice(start,cursor-1), expected:Record<string,Record<string,number>>={};
  for(const m of block.matchAll(/(lawgroup_\w+)\s*=\s*\{([^{}]*)\}/g)){
   expected[m[1]]={};for(const law of m[2].matchAll(/(law_\w+)\s*=\s*(strongly_disapprove|strongly_approve|disapprove|approve|neutral)\b/g))expected[m[1]][law[1]]=levels[law[2]];
  }
  assert.deepEqual(ideology.stances,expected,ideology.id);
 }
});

test('quick mode accepts a single opinion and reversing it changes the score',()=>{
 const d=data([ideology('i',{g:{a:2}})]);
 const a=assessQuick(d,{g:{a:1}}),b=assessQuick(d,{g:{a:-1}});
 assert.equal(a.mode,'quick');assert.equal(a.validGroups,1);assert.equal(a.ideologies[0].score,100);assert.equal(b.ideologies[0].score,0);
 assert.equal(a.ideologies[0].evidence[0].mode,'quick');assert.equal(a.ideologies[0].evidence[0].first,'a');assert.equal(a.ideologies[0].evidence[0].user,1);
});
test('quick mode skips unanswered laws rather than making them neutral votes',()=>{
 const d=data([ideology('i',{g:{a:1,b:1,c:-1}})]);const a=assessQuick(d,{g:{a:1}});
 d.ideologies[0].stances.g.b=-2;d.ideologies[0].stances.g.c=2;
 assert.deepEqual(assessQuick(d,{g:{a:1}}),a);assert.equal(a.ideologies[0].pairCount,1);
});
test('quick mode averages opinions within categories before weighting categories equally',()=>{
 const d=data([ideology('i',{g:{a:2,b:1,c:-1},h:{x:-1}})]);
 assert.equal(assessQuick(d,{g:{a:1,b:1,c:-1},h:{x:1}}).ideologies[0].score,50);
});
test('quick mode excludes missing categories and assigns half agreement to neutral stances',()=>{
 const d=data([ideology('i',{g:{a:2}})]);const a=assessQuick(d,{g:{b:-1},h:{x:1}});
 assert.equal(a.ideologies[0].score,50);assert.equal(a.ideologies[0].groupCount,1);
});
test('quick mode supports multiple opinions with the same sign',()=>{
 const d=data([ideology('i',{g:{a:1,b:1,c:1}})]);
 assert.equal(assessQuick(d,{g:{a:1,b:1}}).ideologies[0].score,100);
 assert.equal(assessQuick(d,{g:{a:-1,b:-1}}).ideologies[0].score,0);
});
test('empty quick answers yield no conclusion and invalid opinions are rejected',()=>{
 const d=data([]);assert.equal(assessQuick(d,{g:{}}).validGroups,0);
 assert.equal(assessQuick(d,{g:{}}).ideologies.length,0);
 for(const bad of [{g:{a:0}},{g:{a:2}},{g:{a:'1'}},{g:{z:1}},{fake:{a:1}},{g:[]}])assert.throws(()=>assessQuick(d,bad as never));
 d.meta.verified=false;assert.throws(()=>assessQuick(d,{}));
});
test('quick IG scores average their relevant constituents and preserve ties',()=>{
 const d=data([ideology('i',{g:{a:1}},false),ideology('j',{g:{a:-1},h:{x:1}},false)]);
 d.igs=['one','two'].map(id=>({id,name:id,english:id,description:'',icon:'',ideologies:['i','j'],source:''}));
 const a=assessQuick(d,{g:{a:1},h:{x:1}});assert.equal(a.igs[0].score,75);assert.equal(a.primaryIGs.length,2);assert.equal(a.igs[0].evidence[0].candidate,null);
});
test('Feminist is unranked in both modes without changing its evidence or IG scoring',()=>{
 const d=data([ideology('ideology_feminist',{g:{a:2,b:-2}}),ideology('i',{g:{a:1,b:1}})]);
 d.igs=[{id:'ig',name:'ig',english:'ig',description:'',icon:'',source:'',ideologies:['ideology_feminist']}];
 for(const a of [assess(d,{g:[['a'],['b']]}),assessQuick(d,{g:{a:1,b:-1}})]){
  assert.equal(a.ideologies.some(m=>m.id==='ideology_feminist'),false);assert.equal(a.primaryIdeologies.some(m=>m.id==='ideology_feminist'),false);
  assert.equal(a.supplementaryIdeologies?.[0].id,'ideology_feminist');assert.equal(a.supplementaryIdeologies?.[0].score,100);assert.equal(a.igs[0].score,100);
 }
});
test('overall primary threshold is recomputed after removing the unranked ideology',()=>{
 const d=data([ideology('ideology_feminist',{g:{a:1}}),ideology('i',{g:{a:0},h:{x:1}})]);
 const a=assessQuick(d,{g:{a:1},h:{x:1}});assert.equal(a.supplementaryIdeologies?.[0].score,100);assert.equal(a.primaryIdeologies[0].score,75);
});
snapshotTest('all laws have complete English original descriptions and separate explanations',()=>{
 for(const group of actual.groups){assert.ok(group.english&&!group.english.startsWith('lawgroup_'));for(const law of group.laws){
  assert.ok(law.english&&!law.english.startsWith('law_'),law.id);assert.ok(law.descriptionEnglish,law.id);assert.ok(law.summaryEnglish,law.id);
  assert.notEqual(law.descriptionEnglish,law.summaryEnglish,law.id);assert.ok(!/[\[\]$\u4e00-\u9fff]/.test(law.descriptionEnglish+law.summaryEnglish),law.id);
 }}
 for(const item of [...actual.igs,...actual.ideologies.filter(i=>i.character)]){assert.ok(item.descriptionEnglish,item.id);assert.ok(!/[\[\]$\u4e00-\u9fff]/.test(item.english+item.descriptionEnglish),item.id);}
});
snapshotTest('actual quick answers produce stable finite scores and matching evidence',()=>{
 const answers=Object.fromEntries(actual.groups.map(g=>[g.id,Object.fromEntries(g.laws.map((l,i)=>[l.id,i%2?1:-1]))]));
 const a=assessQuick(actual,answers as never);assert.equal(a.validGroups,24);assert.equal(a.preliminary,false);assert.deepEqual(a,assessQuick(actual,answers as never));
 for(const m of [...a.ideologies,...a.igs,...a.supplementaryIdeologies||[]]){assert.ok(m.score>=0&&m.score<=100);assert.equal(m.pairCount,m.evidence.length);assert.ok(m.evidence.every(e=>e.mode==='quick'));}
});

test('law panels start closed and automatically close only after the first complete answer',()=>{
 assert.equal(closedLawPanel.open,false);
 const first=toggleLawPanel(closedLawPanel);
 assert.equal(first.open,true);assert.equal(completeLawPanel(first,false),first);
 const done=completeLawPanel(first,true);assert.equal(done.open,false);assert.equal(done.autoClosed,true);
 const reopened=toggleLawPanel(done);assert.equal(reopened.open,true);assert.equal(completeLawPanel(reopened,true),reopened);
 assert.equal(completeLawPanel(reopened,false),reopened);assert.equal(toggleLawPanel(reopened).open,false);
});
test('manually opening a law panel for a second time disables automatic collapse',()=>{
 const first=toggleLawPanel(closedLawPanel),manuallyClosed=toggleLawPanel(first),second=toggleLawPanel(manuallyClosed);
 assert.equal(second.openings,2);assert.equal(completeLawPanel(second,true),second);
 assert.equal(completeLawPanel(closedLawPanel,true),closedLawPanel);
});

