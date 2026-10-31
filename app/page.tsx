'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnswerMode, Assessment, Dataset, Group, Language, QuickAnswers, Ranking } from '@/lib/model';
import { formatRanking, parseRanking } from '@/lib/ranking';
import { assess, assessQuick } from '@/lib/scoring';
import { closedLawPanel, completeLawPanel, toggleLawPanel } from '@/lib/law-panel';
import type { LawPanelState } from '@/lib/law-panel';
import { LanguageContext, localizeDataset, translate, useText } from '@/lib/language';
import AssessmentResults from '@/components/assessment-results';
import { useAssessmentTools } from '@/hooks/use-assessment-tools';

const categories = [
 {id:'power_structure',name:'权力结构',english:'Power Structure',subtitle:'国家如何治理',subtitleEnglish:'How the state is governed',icon:'law_monarchy'},
 {id:'economy',name:'经济',english:'Economy',subtitle:'财富如何组织',subtitleEnglish:'How wealth is organized',icon:'law_interventionism'},
 {id:'human_rights',name:'人权',english:'Human Rights',subtitle:'个人享有哪些权利',subtitleEnglish:'The rights of the individual',icon:'law_protected_speech'},
];
type Choices = Record<string,number>;
type Draft = {text:Record<string,string>;choices:Record<string,Choices>};
function tiersFromChoices(choices:Choices,group:Group):Ranking {
 const ranks=[...new Set(Object.values(choices).filter(n=>n>0))].sort((a,b)=>a-b);
 return ranks.map(rank=>group.laws.filter(l=>choices[l.id]===rank).map(l=>l.id)).filter(t=>t.length);
}
function Cover({language,onLanguage,mode,onMode,onStart,data,error,hasAnswers}:{language:Language;onLanguage:(language:Language)=>void;mode:AnswerMode;onMode:(mode:AnswerMode)=>void;onStart:()=>void;data:Dataset|null;error:string;hasAnswers:boolean}) {
 const t=useText();
 return <main className="cover-page"><div className="cover-art" aria-hidden="true"/><div className="cover-content">
  <div className="cover-edition">VICTORIA <span>3</span><i/>{t('法律倾向测评','A LAW & IDEOLOGY ASSESSMENT')}</div>
  <header className="cover-heading"><span className="cover-ornament" aria-hidden="true">◆</span><h1>{t('法律与信念','Laws & Convictions')}</h1><p>{t('如果由你书写法律，你会建立怎样的社会？','If you wrote the laws, what kind of society would you build?')}</p><p className="cover-description">{t('表达你的法律偏好，发现与你接近的意识形态与利益集团。可以支持、反对，也可以暂不表态。','Express your views on the laws of Victoria 3 to discover your closest ideologies and interest groups. Take a position, or leave a law unanswered.')}</p></header>
  <section className="cover-settings" aria-label={t('测评设置','Assessment settings')}>
   <fieldset className="language-choice"><legend><span>01</span> {t('选择语言','Language')}</legend><div className="language-options">{([{id:'zh-CN',label:'简体中文'},{id:'en',label:'English'}] as const).map(item=><label className={language===item.id?'active':''} key={item.id}><input type="radio" name="language" value={item.id} checked={language===item.id} onChange={()=>onLanguage(item.id)}/><span lang={item.id}>{item.label}</span><span className="selection-mark" aria-hidden="true">{language===item.id?'◆':'◇'}</span></label>)}</div></fieldset>
   <fieldset className="mode-choice"><legend><span>02</span> {t('答题模式','Answer mode')}</legend><div className="mode-options">{(['quick','detailed'] as const).map(value=><label className={'mode-card '+(mode===value?'active':'')} key={value}><input type="radio" name="mode" value={value} checked={mode===value} onChange={()=>onMode(value)}/><div className="mode-card-title"><img src={'/game/'+(value==='quick'?'law_protected_speech':'law_appointed_bureaucrats')+'.webp'} alt=""/><strong>{value==='quick'?t('快速答题','Quick assessment'):t('详细答题','Detailed assessment')}</strong><span className="selection-mark" aria-hidden="true">{mode===value?'◆':'◇'}</span></div><p>{value==='quick'?t('直接点击法律旁的支持或反对。没有想法就略过，不必排列名次。','Click Support or Oppose beside each law. Skip anything you are unsure about; no ranking required.'):t('为法律选择偏好顺位。支持并列与部分排序，表达更细致的取舍。','Rank laws in order of preference. Tie laws or leave some unranked to express more nuanced choices.')}</p></label>)}</div></fieldset>
  </section>
  <div className="cover-start"><button className="game-button primary" onClick={onStart} disabled={!data}>{hasAnswers?t('继续答题','Continue assessment'):t('开始测评','Begin assessment')} <span>›</span></button><p role="status">{error||(!data?t('正在读取法律档案…','Loading the law archive…'):t('无需答完所有法律 · 提交后揭晓结果','Answer as much as you like · Results appear after submission'))}</p></div>
  <footer className="cover-footer"><span>{data?.meta.targetVersion||t('1.14 公测版','1.14 Open Beta')}</span><span>{t('无需登录 · 评分在浏览器完成','No sign-in · Scored in your browser')}</span></footer>
 </div></main>;
}
export function LawCard({group,value,choices,opinions,mode,onRank,onOpinion,onClear,open,onToggle}:{group:Group;value:string;choices:Choices;opinions:Record<string,1|-1>;mode:AnswerMode;onRank:(id:string,rank:number)=>void;onOpinion:(id:string,opinion:1|-1)=>void;onClear:()=>void;open:boolean;onToggle:()=>void}) {
 const t=useText();
 const parsed=useMemo(()=>parseRanking(value,group),[value,group]);
 const count=mode==='quick'?Object.keys(opinions).length:parsed.count;
 const valid=mode==='quick'?count>0:parsed.valid;
 const first=group.laws.find(l=>l.id===parsed.tiers[0]?.[0]);
 const status=mode==='quick'?(count?t(`已表态 ${count} 项`,`${count} ${count===1?"law":"laws"} answered`):t('尚未表达倾向','No opinion yet')):first?(parsed.tiers[0].length>1?t(`首选并列 ${parsed.tiers[0].length} 项`,`${parsed.tiers[0].length} tied first`):first.name):t('尚未表达倾向','No preference yet');
 return <section className={'law-card '+(valid?'answered ':'')} id={group.id}>
  <button className="law-card-heading" aria-expanded={open} aria-controls={'body-'+group.id} onClick={onToggle}><img className="group-icon" src={mode==='detailed'&&first?first.icon:group.laws[0].icon} alt=""/><span className="group-title"><strong>{group.name}</strong><span>{status}</span></span><span className={'card-status '+(valid?'done':'')}>{valid?'✓':t(`${group.laws.length} 项`,`${group.laws.length} laws`)}</span><span className="chevron">{open?'▴':'▾'}</span></button>
  {open&&<div id={'body-'+group.id} className="law-card-body"><div className="law-list">{group.laws.map(law=>{
   const rank=choices[law.id]||0, opinion=opinions[law.id];
   return <div className={'law-option '+((mode==='quick'?opinion:rank)?'chosen':'')} key={law.id}>
    <div className="law-title-row"><img src={law.icon} alt=""/><h4>{law.name}</h4>{mode==='quick'?<div className="opinion-buttons" role="group" aria-label={t(law.name+'的态度','Opinion on '+law.name)}>{([1,-1] as const).map(v=><button key={v} className={v===1?'support':'oppose'} aria-label={v===1?t('支持'+law.name,'Support '+law.name):t('反对'+law.name,'Oppose '+law.name)} aria-pressed={opinion===v} onClick={()=>onOpinion(law.id,v)}><span aria-hidden="true">{v===1?'+':'−'}</span>{v===1?t('支持','Support'):t('反对','Oppose')}</button>)}</div>:<label className="rank-selector"><span>{t('顺位','Rank')}</span><select aria-label={t(law.name+'偏好顺位',law.name+' preference rank')} value={rank} onChange={e=>onRank(law.id,Number(e.target.value))}><option value={0}>{t('未评价','Unrated')}</option>{group.laws.map((_,i)=><option value={i+1} key={i+1}>{i+1}</option>)}</select></label>}</div>
    <p className="original-description">{law.description}</p><details className="further-description"><summary>{t('进一步说明','Further explanation')}</summary><p>{law.summary}</p></details>
   </div>;
  })}</div><div className="ranking-summary"><div className="editor-label"><span>{mode==='quick'?t('本类态度','Your views'):t('当前偏好','Current preference')}</span><button className="text-button" onClick={onClear} disabled={!count}>{t('清空本类','Clear category')}</button></div><div className="rank-preview" aria-live="polite">{mode==='quick'?(count?<span>{t(`支持 ${Object.values(opinions).filter(x=>x===1).length} 项 · 反对 ${Object.values(opinions).filter(x=>x===-1).length} 项`,`Support ${Object.values(opinions).filter(x=>x===1).length} · Oppose ${Object.values(opinions).filter(x=>x===-1).length}`)}</span>:<span className="muted">{t('有想法就点，没有就跳过。','Take a position, or leave it unanswered.')}</span>):parsed.count?<>{parsed.tiers.map((tier,i)=><span key={i}>{i>0&&<b className="separator"> › </b>}{tier.map(id=>group.laws.find(l=>l.id===id)?.name).join(' = ')}</span>)}{parsed.count===1&&<small>{t('再为一条法律选择顺位，即可比较。','Rank one more law to make a comparison.')}</small>}</>:<span className="muted">{t('在每条法律右侧选择顺位。','Choose a rank beside each law.')}</span>}</div><p className="rank-help">{mode==='quick'?t('再次点击取消 · 不选不参与评分','Click again to undo · Unanswered laws are excluded'):t('1 最优先 · 同号为并列 · 未评价不参与比较','1 is best · Equal ranks are ties · Unrated laws are excluded')}</p></div></div>}
 </section>;
}
export default function Home() {
 const [source,setSource]=useState<Dataset|null>(null),[loadError,setLoadError]=useState(false);
 const [language,setLanguage]=useState<Language>('zh-CN'),[mode,setMode]=useState<AnswerMode>('quick'),[started,setStarted]=useState(false);
 const t=(zh:string,en:string)=>translate(language,zh,en);
 const data=useMemo(()=>source?localizeDataset(source,language):null,[source,language]);
 const [draft,setDraft]=useState<Draft>({text:{},choices:{}}),[quick,setQuick]=useState<QuickAnswers>({});
 const answers=draft.text;
 const [panels,setPanels]=useState<Record<string,LawPanelState>>({});
 const panelKey=(id:string)=>mode+':'+id;
 const togglePanel=(id:string)=>setPanels(previous=>{const key=panelKey(id);return {...previous,[key]:toggleLawPanel(previous[key]||closedLawPanel)};});
 const finishPanel=(id:string,complete:boolean)=>{
  const key=panelKey(id),before=panels[key]||closedLawPanel,next=completeLawPanel(before,complete);
  if(next===before)return;
  setPanels(previous=>({...previous,[key]:next}));
  requestAnimationFrame(()=>{const heading=document.getElementById(id)?.querySelector<HTMLButtonElement>('.law-card-heading');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:'smooth'});});
 };
 const setAnswers=useCallback((value:Record<string,string>|((previous:Record<string,string>)=>Record<string,string>))=>{
  setDraft(previous=>{const text=typeof value==='function'?value(previous.text):value;const choices:Record<string,Choices>={};
   for(const g of source?.groups||[]){const parsed=parseRanking(text[g.id]||'',g);choices[g.id]=Object.fromEntries(parsed.tiers.flatMap((tier,index)=>tier.map(id=>[id,index+1])));}
   return {text,choices};});
 },[source]);
 const [result,setResult]=useState<Assessment|null>(null),[notice,setNotice]=useState(''),[help,setHelp]=useState(false),[sources,setSources]=useState(false),[tab,setTab]=useState('all');
 const start=()=>{setResult(null);setStarted(true);setNotice('');window.scrollTo({top:0,behavior:'instant'});};
 const configure=(nextMode:AnswerMode,nextLanguage:Language)=>{setMode(nextMode);setLanguage(nextLanguage);setResult(null);setNotice('');};
 const reveal=(assessment:Assessment)=>{setResult(assessment);setStarted(true);setNotice('');window.scrollTo({top:0,behavior:'instant'});};
 useAssessmentTools(data,{answers,quick,result,mode,language,started},{setAnswers,setQuick,configure,reveal});
 useEffect(()=>{const controller=new AbortController();fetch('/game-data.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('load');return r.json();}).then(value=>setSource(value as Dataset)).catch(e=>{if(e.name!=='AbortError')setLoadError(true);});return()=>controller.abort();},[]);
 useEffect(()=>{document.documentElement.lang=language;document.title=translate(language,'法律与信念 · 维多利亚3倾向测评','Laws & Convictions · Victoria 3 Assessment');},[language]);
 const parsed=useMemo(()=>data?Object.fromEntries(data.groups.map(g=>[g.id,parseRanking(answers[g.id]||'',g)])):{},[answers,data]);
 const effective=(id:string)=>mode==='quick'?Object.keys(quick[id]||{}).length>0:parsed[id]?.valid;
 const complete=data?.groups.filter(g=>effective(g.id)).length||0;
 const submit=()=>{
  if(!data)return;
  if(!complete){setNotice(mode==='quick'?t('请先对至少一条法律点击支持或反对。','Choose Support or Oppose for at least one law.'):t('请先在至少一个类别中排列两条法律。','Rank at least two laws within one category.'));return;}
  const assessment=mode==='quick'?assessQuick(data,quick):assess(data,Object.fromEntries(Object.entries(parsed).filter(([,p])=>p.valid).map(([id,p])=>[id,p.tiers])));
  reveal(assessment);
 };
 const returnToLaws=()=>{setResult(null);setNotice('');window.scrollTo({top:0,behavior:'instant'});};
 const returnToCover=()=>{setStarted(false);setNotice('');window.scrollTo({top:0,behavior:'instant'});};
 const updateRank=(group:Group,id:string,rank:number)=>{
  const nextChoices={...draft.choices[group.id],[id]:rank};
  setDraft(previous=>({choices:{...previous.choices,[group.id]:nextChoices},text:{...previous.text,[group.id]:formatRanking(tiersFromChoices(nextChoices,group),group)}}));
  finishPanel(group.id,group.laws.every(l=>(nextChoices[l.id]||0)>0));setNotice('');
 };
 const updateOpinion=(group:Group,id:string,value:1|-1)=>{
  const choices={...quick[group.id]};if(choices[id]===value)delete choices[id];else choices[id]=value;
  setQuick(previous=>({...previous,[group.id]:choices}));
  finishPanel(group.id,group.laws.every(l=>choices[l.id]===1||choices[l.id]===-1));setNotice('');
 };
 const clearGroup=(group:Group)=>{if(mode==='quick')setQuick(previous=>({...previous,[group.id]:{}}));else setDraft(previous=>({text:{...previous.text,[group.id]:''},choices:{...previous.choices,[group.id]:{}}}));setNotice('');};
 const hasAnswers=mode==='quick'?Object.values(quick).some(x=>Object.keys(x).length>0):Object.values(answers).some(Boolean);
 return <LanguageContext.Provider value={language}>{!started?<Cover language={language} onLanguage={setLanguage} mode={mode} onMode={setMode} onStart={start} data={data} error={loadError?t('未找到法律资料。请先按 README 从本机游戏提取数据。','Law data is unavailable. Follow the README to extract it from your local game installation.'):''} hasAnswers={hasAnswers}/>:<main className={'game-shell mode-'+mode}>
  <header className="top-bar"><button onClick={returnToCover} className="brand" aria-label={t('返回封面','Back to cover')}><span className="brand-roman">V<span>III</span></span><span>VICTORIA 3<small>{t('法律与信念','Laws & Convictions')}</small></span></button><div className="window-title"><span className="gold-line"/><h1>{result?t('政治倾向','Affinities'):t('法律','Laws')}</h1><span className="gold-line"/></div><div className="version"><span>{data?.meta.targetVersion}</span><small>{mode==='quick'?t('快速答题','Quick assessment'):t('详细答题','Detailed assessment')}</small></div></header>
  <aside className="side-rail" aria-label={t('页面导航','Navigation')}><span className="rail-label">{t('政治','Politics')}</span><button className={!result?'active':''} aria-label={t('法律倾向','Law preferences')} onClick={returnToLaws}><img src="/game/law_monarchy.webp" alt=""/></button><button disabled={!result} className={result?'active':''} aria-label={t('测评结论','Assessment results')}><img src="/game/ig_intelligentsia.webp" alt=""/></button><div className="rail-spacer"/><button aria-label={t('填写说明','Instructions')} onClick={()=>setHelp(!help)}>?</button></aside>
  <div className="workspace"><nav className="page-tabs" aria-label={t('测评步骤','Assessment steps')}><button className={!result?'active':''} onClick={returnToLaws}>{t('法律倾向','Law preferences')}</button><button className={result?'active':''} disabled={!result}>{t('测评结论','Results')}</button><button onClick={returnToCover}>{t('返回封面','Cover')}</button><button className="about-button" onClick={()=>setSources(!sources)}>{t('版本与资料','Sources')}</button></nav>
  {sources&&<section className="information-panel"><h2>{t('版本与资料','Version & sources')}</h2><p>{t(`本机《维多利亚3》${data?.meta.targetVersion}，更新于 ${data?.meta.update}，构建号 ${data?.meta.buildId}。法律、名称、原版描述、意识形态立场和界面素材来自游戏原版文件。`,`Local Victoria 3 ${data?.meta.targetVersion}, updated ${data?.meta.update}, build ${data?.meta.buildId}. Laws, names, original descriptions, ideology stances and interface assets come from the game files.`)}</p><p>{t('不读取存档，不引入具体人物、国家和 MOD 的修正。匹配分衡量法律态度的一致程度，不是身份概率。','No save files or character, country or mod modifiers are used. Match scores measure agreement on laws, not the probability of an identity.')}</p></section>}
  {help&&<section className="information-panel"><h2>{t('如何表达你的倾向','How to express your views')}</h2><p>{mode==='quick'?t('点击每条法律右侧的“支持”或“反对”，再点一次取消。不点表示未评价。支持多条或反对多条都可以。','Click Support or Oppose beside any law; click the selected button again to undo. You may support or oppose several laws. Leaving both buttons unselected means unanswered.'):t('顺位 1 最优先，数字越大越靠后；相同数字为并列，数字不必连续。每类至少评价两条法律。','Rank 1 is most preferred; higher numbers are less preferred. Equal numbers indicate a tie, and ranks need not be consecutive. Rank at least two laws in a category.')}</p><p>{mode==='quick'?t('快速模式直接比较对法律的态度：一致 1，相反 0，候选中立 0.5。先在类别内平均，再对类别等权平均；候选没有立场的类别不参与。','Quick mode compares your opinion with each candidate: agreement scores 1, opposition 0, and a neutral candidate stance 0.5. Scores are averaged within each category, then equally across categories. Categories without a candidate stance are excluded.'):t('详细模式比较法律之间的先后顺序，各类别等权。没有评价的法律不参与。','Detailed mode compares the relative order of laws and weights categories equally. Unrated laws are excluded.')}</p><p>{t('原版描述在前，“进一步说明”在下。两种模式各自保留答案，可以返回封面切换。','Original descriptions appear first, with further explanation below. Each mode retains its own answers; return to the cover to switch.')}</p></section>}
  {data&&!result&&<><div className="intro-row"><div><h2>{t('你理想中的社会，应由哪些法律构成？','Which laws belong in your ideal society?')}</h2><p>{mode==='quick'?t('支持或反对，直接点选；没有想法的法律可以跳过。','Click Support or Oppose. Skip laws you have no opinion on.'):t('排列法律偏好，表达你在不同制度之间的取舍。','Rank the laws to express your preferences between different systems.')}</p></div><button className="help-link" onClick={()=>setHelp(!help)}>{t('填写说明','Instructions')} <span>?</span></button></div><div className="mobile-tabs" role="group" aria-label={t('法律领域筛选','Law category filter')}><button className={tab==='all'?'active':''} onClick={()=>setTab('all')}>{t('全部','All')}</button>{categories.map(c=><button key={c.id} className={tab===c.id?'active':''} onClick={()=>setTab(c.id)}>{t(c.name,c.english)}</button>)}</div>
  <div className="law-columns">{categories.map(c=><section className={'law-column '+(tab!=='all'&&tab!==c.id?'filtered':'')} key={c.id}><header className="category-heading"><img src={'/game/'+c.icon+'.webp'} alt=""/><div><h2>{t(c.name,c.english)}</h2><span>{t(c.subtitle,c.subtitleEnglish)}</span></div><span className="category-count">{data.groups.filter(g=>g.category===c.id&&effective(g.id)).length} / {data.groups.filter(g=>g.category===c.id).length}</span></header><div className="category-laws">{data.groups.filter(g=>g.category===c.id).map(g=><LawCard key={g.id} group={g} value={answers[g.id]||''} choices={draft.choices[g.id]||{}} opinions={quick[g.id]||{}} mode={mode} onRank={(id,rank)=>updateRank(g,id,rank)} onOpinion={(id,value)=>updateOpinion(g,id,value)} onClear={()=>clearGroup(g)} open={panels[panelKey(g.id)]?.open||false} onToggle={()=>togglePanel(g.id)}/>)}</div></section>)}</div><p className="bottom-note">{t('未填写不等于反对。你可以随时修改，结论只在提交后揭晓。','Unanswered does not mean opposed. You can change your answers; results are revealed only after submission.')}</p></>}
  {data&&result&&<AssessmentResults data={data} result={result}/>}</div>
  <footer className="assessment-bar"><div className="progress-copy"><span>{t('已表达倾向','Answered')} <strong>{complete}</strong> / {data?.groups.length||24} {t('类法律','categories')}</span><div className="progress-track"><span style={{width:complete/(data?.groups.length||24)*100+'%'}}/></div></div><p role="status" className={notice?'notice':''}>{notice||(result?t('匹配分代表法律态度一致程度，不是身份概率。','Match scores measure agreement, not identity probabilities.'):mode==='quick'?t('不必答完，有想法的法律再表态。','You do not need to answer every law.'):t('每类至少排序两条法律，才会参与比较。','Rank at least two laws in a category to include it.'))}</p>{result?<button className="game-button" onClick={returnToLaws}>{t('返回修改法律','Edit answers')}</button>:<button className="game-button primary" onClick={submit} disabled={!data}>{t('查看我的政治倾向','View my results')} <span>›</span></button>}</footer>
 </main>}</LanguageContext.Provider>;
}



