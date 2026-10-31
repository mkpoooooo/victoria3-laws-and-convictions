'use client';
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { Dispatch, SetStateAction } from 'react';
import type { AnswerMode, Assessment, Dataset, Language, QuickAnswers, Ranking } from '@/lib/model';
import { parseRanking } from '@/lib/ranking';
import { assess, assessQuick } from '@/lib/scoring';

type Tool = {name:string;title:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
type Context = {registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>};
type State = {answers:Record<string,string>;quick:QuickAnswers;result:Assessment|null;mode:AnswerMode;language:Language;started:boolean};
type Actions = {setAnswers:Dispatch<SetStateAction<Record<string,string>>>;setQuick:Dispatch<SetStateAction<QuickAnswers>>;configure:(mode:AnswerMode,language:Language)=>void;reveal:(result:Assessment)=>void};
export function useAssessmentTools(data:Dataset|null,current:State,actions:Actions){
 const state=useRef(current),handlers=useRef(actions);
 useEffect(()=>{state.current=current;handlers.current=actions;},[current,actions]);
 useEffect(()=>{
  const context=(document as Document & {modelContext?:Context}).modelContext;
  if(!data||!context?.registerTool)return;
  const lifecycle=new AbortController();
  const empty={type:'object',properties:{},additionalProperties:false};
  const register=(name:string,title:string,description:string,readOnly:boolean,schema:object,execute:Tool['execute'])=>{
   try{void Promise.resolve(context.registerTool({name,title,description,inputSchema:schema,annotations:{readOnlyHint:readOnly,untrustedContentHint:false},execute},{signal:lifecycle.signal})).catch(()=>{});}catch{/* Optional browser tooling must not affect the website. */}
  };
  register('get_law_catalog','Law catalog','Read law IDs, numbers, localized names and dataset version.',true,empty,()=>({version:data.meta.targetVersion,groups:data.groups.map(g=>({id:g.id,name:g.name,laws:g.laws.map((l,i)=>({number:i+1,id:l.id,name:l.name}))}))}));
  register('get_assessment_state','Assessment state','Read mode, language and answers. Results are returned only after they have been revealed.',true,empty,()=>({...state.current,result:state.current.result?{ideologies:state.current.result.primaryIdeologies,supplementary:state.current.result.supplementaryIdeologies,igs:state.current.result.primaryIGs}:null,revealed:!!state.current.result}));
  register('configure_assessment','Configure assessment','Select quick or detailed mode and interface language. Each mode retains its own answers; changing settings hides existing results.',false,{type:'object',properties:{mode:{enum:['quick','detailed']},language:{enum:['zh-CN','en']}},required:['mode','language'],additionalProperties:false},input=>{
   if(!input||typeof input!=='object'||!('mode' in input)||!('language' in input)||(input.mode!=='quick'&&input.mode!=='detailed')||(input.language!=='zh-CN'&&input.language!=='en'))throw new Error('Invalid mode or language.');
   const {mode,language}=input;flushSync(()=>handlers.current.configure(mode,language));return {mode,language,revealed:false};
  });
  register('set_law_rankings','Set detailed rankings','Set law-number rankings for detailed mode. Uses the same validation as the ranking parser; does not reveal results.',false,{type:'object',properties:{answers:{type:'object',additionalProperties:{type:'string'}}},required:['answers'],additionalProperties:false},input=>{
   if(!input||typeof input!=='object'||!('answers' in input)||!input.answers||typeof input.answers!=='object'||Array.isArray(input.answers))throw new Error('An answers object is required.');
   const next={...state.current.answers};
   for(const [id,value] of Object.entries(input.answers)){
    const group=data.groups.find(g=>g.id===id);
    if(!group||typeof value!=='string')throw new Error('Unknown category or invalid ranking.');
    const parsed=parseRanking(value,group);if(parsed.error)throw new Error(parsed.error);next[id]=value;
   }
   flushSync(()=>{handlers.current.setAnswers(next);handlers.current.configure('detailed',state.current.language);});return {updated:Object.keys(input.answers),revealed:false};
  });
  register('set_quick_opinions','Set quick opinions','Set opinions by group ID and law ID: 1 support, -1 oppose, 0 clear. Unspecified laws retain their answers. Validates the complete batch before applying it; does not reveal results.',false,{type:'object',properties:{answers:{type:'object',additionalProperties:{type:'object',additionalProperties:{type:'integer',enum:[-1,0,1]}}}},required:['answers'],additionalProperties:false},input=>{
   if(!input||typeof input!=='object'||!('answers' in input)||!input.answers||typeof input.answers!=='object'||Array.isArray(input.answers))throw new Error('An answers object is required.');
   const next:QuickAnswers={...state.current.quick};
   for(const [gid,opinions] of Object.entries(input.answers)){
    const group=data.groups.find(g=>g.id===gid);
    if(!group||!opinions||typeof opinions!=='object'||Array.isArray(opinions))throw new Error('Invalid law category.');
    const choices={...next[gid]};
    for(const [id,value] of Object.entries(opinions)){
     if(!group.laws.some(l=>l.id===id)||(value!==1&&value!==-1&&value!==0))throw new Error('Invalid law opinion.');
     if(value===0)delete choices[id];else choices[id]=value;
    }
    next[gid]=choices;
   }
   flushSync(()=>{handlers.current.setQuick(next);handlers.current.configure('quick',state.current.language);});return {updated:Object.keys(input.answers),revealed:false};
  });
  register('reveal_assessment','Reveal results','Compute and display results for the selected mode, using exactly the same scoring as the website.',false,empty,()=>{
   let assessment:Assessment;
   if(state.current.mode==='quick')assessment=assessQuick(data,state.current.quick);
   else {
    const ranked:Record<string,Ranking>={};
    for(const g of data.groups){const p=parseRanking(state.current.answers[g.id]||'',g);if(p.error)throw new Error(p.error);if(p.valid)ranked[g.id]=p.tiers;}
    assessment=assess(data,ranked);
   }
   if(!assessment.validGroups)throw new Error(state.current.mode==='quick'?'Support or oppose at least one law.':'Rank at least two laws in one category.');
   flushSync(()=>handlers.current.reveal(assessment));
   return {mode:assessment.mode,validGroups:assessment.validGroups,preliminary:assessment.preliminary,ideologies:assessment.primaryIdeologies.map(m=>({id:m.id,score:m.score,groupCount:m.groupCount})),supplementary:assessment.supplementaryIdeologies?.map(m=>({id:m.id,score:m.score,groupCount:m.groupCount})),igs:assessment.primaryIGs.map(m=>({id:m.id,score:m.score,groupCount:m.groupCount}))};
  });
  return ()=>lifecycle.abort();
 },[data]);
}
