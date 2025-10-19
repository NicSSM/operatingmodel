"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, Legend, ResponsiveContainer, Sankey } from "recharts";
import { Factory, AlertTriangle, DollarSign, Clock, TrendingDown, CalendarDays, ArrowDownRight } from "lucide-react";

type NumericRecord = Record<string, number>;
 type SankeyNodePayload = { name: string; value: number };
 type SankeyNodeProps = { x: number; y: number; width: number; height: number; payload: SankeyNodePayload };
 type SankeyLinkNode = { name?: string };
 type SankeyLinkPayload = { dy?: number };
 type SankeyLinkProps = { source?: SankeyLinkNode; target?: SankeyLinkNode; sourceX: number; sourceY: number; targetX: number; targetY: number; sourceControlX: number; targetControlX: number; linkWidth?: number; payload?: SankeyLinkPayload };
 type SankeyLinkDatum = { source: number; target: number; value: number };
 type FlowRow = { channel: string; cartons: number; pct: number; dest: string };
 type CSSVars = React.CSSProperties & Record<'--cycle', string>;

const FLOW_CSS = `
@keyframes flowLoop { to { stroke-dashoffset: calc(-1 * var(--cycle, 64px)); } }
`;

const RAW_DATA: { inputs: Record<string, number>; scenario_params: Record<string, number>; rostered_hours: Record<string, number>; rates_per_1000: Record<string, number>; new_rates_per_1000: Record<string, number>; } = {
  inputs: { "Cartons Delivered": 12000, "Backfill Keycodes": 2500, "Backfill Apparel (RFID)": 1000, "Online Units": 1571.375 },
  scenario_params: { "Demand %": 0.68, "Non-demand %": 0.1, "Markup %": 0.005, "VIP Backfill %": 0.1, "Clearance %": 0.0, "New lines %": 0.11, "OMS %": 0.005, "LP %": 0.005 },
  rostered_hours: { Decant: 156.5, Sequence: 441, Online: 56.75 },
  rates_per_1000: { Decant: 13, Loadfill: 40.3, Packaway: 30, Backfill: 15, "Digital Tasks": 88, Online: 55 },
  new_rates_per_1000: { Decant: 13, Loadfill: 40.3, Packaway: 30, Backfill: 15, "Digital Tasks": 88, Online: 55 },
};

const fmt=(n: unknown, d=1)=>{ const x=Number(n);return Number.isFinite(x)?x.toLocaleString(undefined,{maximumFractionDigits:d}):"0" };:boolean;backfill:boolean;nd:number;ex:number;oms:numbconst uniq = <T,>(xs: T[]) => Array.from(new Set(xs));ion:string;impact:Record<string,number>};

const defaultCfg=(n:string):ProcCfg=>{const p=alias(n); if(p==="Loadfill")return{unit:"cartons",useRoster:true,demand:true,backfill:false,nd:-1,ex:-1,oms:1}; if(p==="Packaway")return{unit:"cartons",useRoconst getNum=(o: Record<string, number> | undefined, k: string, f=0): number => Number(o?.[k] ?? f);}const setNum=(o: Record<string, number>, k: string, v: number): void => { o[k] = isNaN(v)?0:v };e,demand:false,backfill:false,nd:0,ex:1,oms:0}; if(p==="Online")return{unit:"online",useRoster:true,demand:false,backfill:false,nd:0,ex:0,oms:1}; if(p==="Backfill")return{unit:"cartons",useRoster:false,demand:false,backfill:true,nd:0,ex:0,oms:0}; if(p==="Decant")return{unit:"cartons",useRoster:true,dem

const byAlias=(obj?:Record<string,number>)=>{const o:Record<string,number>={}; for(const[k,v]of Object.entries(obj||{}))o[alias(k)]=(o[alias(k)]||0)+(v||0); return o};
const sharesFrom=(pnumber>)=>{const shares:Record<string,number>={}, ks=CAT_KEYS as unknown as string[]; let tot=0; for(const k of ks){const v=Math.max(0,params[k]??defs[k]??0); shares[k]=v; tot+=v} if(tot>1){const s=1/tot; for(const k of ks) shares[k]*=s; tot=1} return{shares,total:tot,remaining:Math.max(0,1-tot)}};

const ISSUE_LIBRARY:Issue[]=[
  {id:"late_delivery",name:"Late DC Delivery",description:"Inbound late; rehandling & congestion",impact:{Decant:0.1,Loadfill:0.05}},
  {id:"high_non_demand",name:"High Non‑demand",description:"Over-index of non-demand",impact:{Backfill:0.1,Packaway:0.05}},
  {id:"roster_gaps",name:"Roster Gaps",description:"Roster misaligned to load",impact:{Decant:0.1,Loadfill:0.1,Online:0.1}},
];

function useModelconst sharesFrom=(params:Record<string,number>,defs:Record<string,number>)=>{const shares:Record<string,number>={}, ks=CAT_KEYS as readonly string[];te:boolean;storeHours:number;cfg:Record<string,ProcCfg>;bump?:number;}){
  const{hourlyRate,params,issuesEnabled,issues,mitigation,calibrate,storeHours,cfg,bump}=opts; const kRef=useRef<number|null>(null);
  return useMemo(()=>{
    const cur=byAlias(raw.rates_per_1000), neu=byAlias(raw.new_rates_per_1000), ros=byAlias(raw.rostered_hours);
    const {shares}=sharesFrom(params,raw.scenario_params); const demand=shares["Demand %"]||0, ndm=shares["Non-demand %"]||0, extras=(shares["Markup %"]||0)+(shares["Clearance %"]||0)+(shares["New lines %"]||0)+(shares["LP %"]||0), oms=shares["OMS %"]||0;
    const cartons=Number(raw.inputs?.["Cartons Delivered"]??0)||0, online=Number(raw.inputs?.["Online Units"]??0)||0;
    const procs=uniq([...Object.keys(cur),...Object.keys(ros)]).map(alias).sort();
    const units:Record<string,number>=Object.fromEntries(procs.map(p=>[p,((cfg[p]?.unit??((p==="Digital Tasks"||p==="Online")?"online":"cartons"))==="online"?online:cartons)/1000]));
    const rosSet=new Set(Object.keys(raw.rostered_hours||{}).map(alias)); if(!calibrate)kRef.current=null; if(calibrate&&kRef.current==null){let r=0,d=0; for(const p of procs){const rate=cur[p]||0,u=units[p]||0; if(cfg[p]?.useRoster||rosSet.has(p)) r+=(ros[p]||0); else d+=rate*u} kRef.current=d>0?Math.max(0,storeHours-r)/d:1}
    const k=(kRef.current??1);
    const issueMult=(p:string,isNew:boolean)=>issues.reduce((m,iss)=>!issuesEnabled[iss.id]?m:m*(1+((iss.impact[p]||0)*(isNew?(1-mitigation):1))),1);
    const rows=procs.map(p=>{const c=cfg[p]||defaultCfg(p); const u=units[p]||0, rc=cur[p]||0, rn=(neu[p]??rc); let f=1; if(c.demand)f*=demand; if(c.backfill){const vip=(params["VIP Backfill %"]??raw.scenario_params["VIP Backfill %"]??0); const bf=cap((params["Non-demand %"]??raw.scenario_params["Non-demand %"]??0)+vip,0,1); f*=Math.max(0.0001,bf)} const nf=f*Math.max(0,1+c.nd*ndm)*Math.max(0,1+c.ex*extras)*Math.max(0,1-cap(c.oms,0,1)*oms); const useRos=c.useRoster||rosSet.has(p); const curBase=useRos?(ros[p]||rc*u):(rc*u*k); return{process:p,current:curBase*issueMult(p,false),new:rn*u*nf*issueMult(p,true)}});
    const totals=rows.reduce((a,r)=>({current:a.current+r.current,new:a.new+r.new}),{current:0,new:0}); const benefitHours=totals.current-totals.new; return{rows,totals,benefitHours,savings:benefitHours*hourlyRate};
  },[raw,hourlyRate,params,issuesEnabled,issues,mitigation,calibrate,storeHours,cfg,bump])
}

const Num=({value,onChange,step=0.01,min,max,className}:{value?:number;onChange:(n:number)=>void;step?:number;min?:number;max?:number;className?:string})=> (
  <Input type="number" className={className} value={Number.isFinite(Number(value))?value:0} step={step} min={min} max={max} onChange={e=>onChange(parseFloat(e.target.value||"0"))}/>
);

const TABS:[string,string][]= [["overview","Overview"],["process","Process Explorer"],["issues","Issue Effects"]];

const Ring=({value,label}:{value:number;label:string})=>{const pct=Math.max(0,Math.min(1,Number(value)||0)); const bg=`conic-gradient(#16a34a ${pct*100}%, #e5e7eb 0)`; return(<div className="flex items-center gap-4"><div className="relative w-28 h-28" style={{backgroundImage:bg}}><div className="absolute inset-2 bg-white rounded-full"/><div className="absolute inset-0 flex items-center justify-center text-xl font-semibold">{Math.round(pct*100)}%</div></div><div className="text-slate-600 text-sm">{label}</div></div>)};

const NODE_COLORS:Record<string,string>={"Cartons Delivered":"#1f2937",Decant:"#2563eb",Demand:"#16a34a","Non‑demand":"#f59e0b",Markup:"#8b5cf6",Clearance:"#ef4444","New lines":"#0ea5e9",LP:"#10b981",OMS:"#eab308",Loadfill:"#16a34a",Packaway:"#f59e0b","Digital Tasks":"#0ea5e9"};
const CAT_COLOR:Record<string,string>={"Demand %":NODE_COLORS.Demand,"Non-demand %":NODE_COLORS["Non‑demand"],"Markup %":NODE_COLORS.Markup,"Clearance %":NODE_COLORS.Clearance,"New lines %":NODE_COLORS["New lines"],"LP %":NODE_COLORS.LP,"OMS %":NODE_COLORS.OMS};
const SankeyNode=(p:any)=>{const{ x,y,width,height,payload}=p; const name=payload?.name??"", val=Number(payload?.value??0), color=NODE_COLORS[name]||"#64748b"; return(<g><rect x={x} y={y} width={width} height={height} rx={8} fill="#f8fafc" stroke={color} strokeWidth={2}/><text x={x+width/2} y={y+height/2-2} textAnchor="middle" fontSize={11} fontWeight={600} fill={color}>{name}</text><text x={x+width/2} y={y+height/2+14} textAnchor="middle" fontSize={11} fill="#334155">{fmt(val)} ctns</text></g>)};
const SankeyLink=(p:any)=>{const{source,target,sourceX,sourceY,targetX,targetY,sourceControlX,targetControlX,linkWidth,payload}=p; const d=`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`; const ch=(source?.name==="Decant"?target?.name:sourceconst SankeyNode=(p: SankeyNodeProps)=>ODE_COLORS[ch]||"#94a3b8"; const w=Math.max(1,Number(linkWidth)||Number(payload?.dy)||2);
  const dash=Math.max(8,Math.round(w*2)); const gap=Math.max(8,Math.round(w*1.4)); const cycle=dash+gap; const dur=Math.min(10, Math.max(2.4, 1.5 + w*0.35));
  if(w<6){
    return (
      <g>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={w} strokeLinecap="round"/>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={w} strconst SankeyLink=(p: SankeyLinkProps)=>{const{source,target,sourceX,sourceY,targetX,targetY,sourceControlX,targetControlX,linkWidth,payload}=p; const d=`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`; const ch=(source?.name==="Decant"?target?.name:source?.name)||""; const color=NODE_COLORS[ch]||"#94a3b8"; const w=Math.max(1,Number(linkWidth)||Number(payload?.dy)||2);
  const dash=Math.max(8,Math.round(w*2)); const gap=Math.max(8,Math.round(w*1.4)); const cycle=dash+gap; const dur=Math.min(10, Math.max(2.4, 1.5 + w*0.35));
  if(w<6){
    const style: CSSVars = { ['--cycle']: `${16}px`, animation: `flowLoop ${dur}s linear infinite` };
    return (
      <g>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={w} strokeLinecap="round"/>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={w} strokeLinecap="round" strokeDasharray="8 8" style={style}/>
      </g>
    );
  } else if (w<14){
    const style: CSSVars = { ['--cycle']: `${cycle}px`, animation: `flowLoop ${dur}s linear infinite` };
    return (
      <g>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={w} strokeLinecap="round"/>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.78} strokeWidth={w*0.88} strokeLinecap="round" strokeDasharray={`${dash} ${gap}`} style={style}/>
      </g>
    );
  } else {
    const style: CSSVars = { ['--cycle']: `${Math.round(cycle*1.4 + gap*2)}px`, animation: `flowLoop ${Math.max(dur,6)}s linear infinite` };
    return (
      <g>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={w} strokeLinecap="round"/>
        <path d={d} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={w*0.45} strokeLinecap="round" strokeDasharray={`${Math.round(cycle*1.4)} ${Math.round(gap*2)}`} style={style}/>
        <path d={d} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={Math.max(2,w*0.08)} strokeLinecap="round"/>
      </g>
    );
  }
};]=useState<Record<string,boolean>>({}); const[mitigation,setMitigation]=useState(0.5); const[bump,setBump]=useState(0); const[calibrate,setCalibrate]=useState(true); const[issueDefs,setIssueDefs]=useState<Issue[]>(ISSUE_LIBRARY); const[stores,setStores]=useState(270); const[weeks,setWeeks]=useState(52); const[fteHours,setFteHours]=useState(38);
  const baseProcs=useMemo(()=>uniq([...Object.keys(RAW_DATA.rates_per_1000),...Object.keys(RAW_DATA.rostered_hours)].map(alias)).sort(),[]);
  const[cfg,setCfg]=useState<Record<string,ProcCfg>>(()=>Object.fromEntries(baseProcs.map(p=>[p,defaultCfg(p)])));
  const calc=useModel(RAW_DATA,{hourlyRate,params,issuesEnabled,issues:issueDefs,mitigation,calibrate,storeHours,cfg,bump});
  const {shares,total,remaining}=useMemo(()=>sharesFrom(params,RAW_DATA.scenario_params),[params]);
  const network=useMemo(()=>{const wh=Math.max(0,calc.benefitHours)*Math.max(0,stores); const ws=Math.max(0,calc.savings)*Math.max(0,stores); return{weeklyHours:wh,weeklySavings:ws,annualSavings:ws*Math.max(0,weeks),fteEq:fteHours>0?wh/fteHours:0}},[calc.benefitHours,calc.savings,stores,weeks,fteHours]);
  const currentH=calc.totals.current, newH=calc.totals.new, deltaH=currentH-newH, pctSaved=currentH>0?deltaH/currentH:0;
  const procList=useMemo(()=>uniq([...baseProcs,...calc.rows.map(r=>r.process)]),[baseProcs,calc.rows]);
  const processColors=useMemo(()=>{const m:Record<string,string>={}; procList.forEach((p,i)=>m[p] = ["#2563eb","#16a34a","#f59e0b","#ef4444","#8b5cf6","#0ea5e9","#10b981","#eab308","#f43f5e"][i%9]); return m},[procList]);
  const barData=useMemo(()=>calc.rows.map(r=>({name:r.process,current:r.current,new:r.new})),[calc.rows]);
  const distData=useMemo(()=>{const ct=calc.totals.current||1,nt=calc.totals.new||1,cur:any={name:"Current"},nw:any={name:"New"}; for(const r of calc.rows){cur[r.process]=r.current/ct; nw[r.process]=r.new/nt} return[cur,nw]},[calc.rows,calc.totals]);
  const cartonSankey=useMemo(()=>{const cartons=Number(RAW_DATA.inputs?.["Cartons Delivered"]??0)||0, dem=(shares["Demand %"]||0)+(remaining||0); const cats:[string,string,number][]= [["Demand %","Demand",dem],["Non-demand %","Non‑demand",shares["Non-demand %"]||0],["Markup %","Markup",shares["Markup %"]||0],["Clearance %","Clearance",shares["Clearance %"]||0],["New lines %","New lines",shares["New lines %"]||0],["LP %","LP",shares["LP %"]||0],["OMS %","OMS",shares["OMS %"]||0]]; const dest:{[k:string]:string}={Demand:"Loadfill","Non‑demand":"Pacconst distData=useMemo(()=>{const ct=calc.totals.current||1,nt=calc.totals.new||1,cur:Record<string, number | string>={name:"Current"},nw:Record<string, number | string>={name:"New"};nst names=["Cartons Delivered","Decant",...cats.map(c=>c[1]),"Loadfill","Packaway","Digital Tasks"], nodes=names.map(n=>({name:n})), id=(n:string)=>names.indexOf(n); const links:any[]=[{source:id("Cartons Delivered"),target:id("Decant"),value:Math.max(0.01,cartons)}]; for(const[,lab,s]of cats){const v=Math.max(0,cartons*Number(s)); if(v>0)links.push({source:id("Decant"),target:id(lab),value:Math.max(0.01,v)})} for(const[,lab,s]of cats){const v=Math.max(0,cartons*Number(s)); if(v>0)links.push({source:id(lab),target:id(dest[lab]||"Loadfill"),value:Math.max(0.01,v)})} const flowRows=cats.map(([,lab,s])=>({channel:lab,cartons:Math.max(0,cartons*Number(s)),pct:Math.max(0,Number(s)),dest:dest[lab]||"Loadfill"})); return{nodes,links,flowRows}},[params,RAW_DATA.inputs,shares,remaining]);

  useEffect(()=>{const hs=calc.totals.current-calc.totals.new; console.assert(Math.abs(hs-calc.benefitHours)<1e-6,"benefit calc"); const cat=sharesFrom(params,RAW_DATA.scenariconst links:SankeyLinkDatum[]=.assert(cat.total<=1+1e-9,"categories >100% (normalized)"); const back=cfg["Backfill"]; if(back)console.assert(back.ex===0&&back.oms===0,"Backfill unaffected by extras/OMS"); console.assert(!calc.rows.some(r=>r.process==="Sequence"),"Sequence->Loadfill only"); console.assert(fmt(undefined)==="0"&&fmt(null)==="0","fmt guard")},[calc,params,cfg]);

  const otherScenarioKeys=useMemo(()=>Object.keys(RAW_DATA.scenario_params).filter(k=>!isCategory(k)),[]);
  const removeImpact=(id:string,proc:string)=>{setIssueDefs(p=>p.map(it=>it.id===id?{...it,impact:Object.fromEntries(Object.entries(it.impact).filter(([k])=>alias(k)!==proc))}:it)); setBump(x=>x+1)};

  return(
    <TooltipProvider>
      <style>{FLOW_CSS}</style>
      <div className="w-full min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3"><Factory className="w-8 h-8 text-slate-700"/><h1 className="text-2xl font-semibold">Kmart Store Operating Model</h1></div>
          <Button variant="ghost" onClick={()=>{setIssuesEnabled({});setParams({...RAW_DATA.scenario_params});setMitigation(0.5);setIssueDefs(ISSUE_LIBRARY);setCfg(Object.fromEntries(baseProcs.map(p=>[p,defaultCfg(p)])));setHourlyRate(35);setStoreHours(1200);setStores(270);setWeeks(52);setFteHours(38);setBump(x=>x+1)}}>Reset</Button>
        </div>

        <div className="max-w-7xl mx-auto grid md:grid-cols-12 gap-4 mb-6 items-stretch">
          <Card className="shadow-sm md:col-span-4 overflow-hidden h-full min-h-[132px] border-0 text-white bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400">
            <CardContent className="p-0 bg-transparent">
              <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.35}} className="h-full w-full p-4 md:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide opacity-90">Estimated Benefit (per store)</div>
                    <div className="mt-1 text-3xl font-semibold">{fmt(calc.benefitHours,0)} hrs</div>
                    <div className="opacity-90">≈ A${fmt(calc.savings,0)} / week</div>
                  </div>
                  <TrendingDown className="w-10 h-10 opacity-80"/>
                </div>
              </motion.div>
            </CardContent>
          </Card>

          <Card className="shadow-sm md:col-span-4 overflow-hidden h-full min-h-[132px] border-0 text-white bg-gradient-to-br from-sky-600 via-sky-500 to-sky-400">
            <CardContent className="p-0 bg-transparent">
              <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.35}} className="h-full w-full p-4 md:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-90">Total Current Hours</div>
                    <div className="mt-1 text-3xl font-semibold">{fmt(currentH,0)}</div>
                    <div className="mt-1 text-sm opacity-90 flex items-center gap-1"><ArrowDownRight className="w-4 h-4"/>to New {fmt(newH,0)} (−{fmt(deltaH,0)} / −{Math.round(pctSaved*100)}%)</div>
                  </div>
                </div>
              </motion.div>
            </CardContent>
          </Card>

          <Card className="shadow-sm md:col-span-4 overflow-hidden h-full min-h-[132px] border-0 text-white bg-gradient-to-br from-teal-600 via-teal-500 to-teal-400">
            <CardContent className="p-0 bg-transparent">
              <motion.div initial={{opacity:0, y:8}} animate={{opacity:1, y:0}} transition={{duration:0.35}} className="h-full w-full p-4 md:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-90">Total New Model Hours</div>
                    <div className="mt-1 text-3xl font-semibold">{fmt(newH,0)}</div>
                    <div className="mt-1 text-sm opacity-90">Saved {fmt(deltaH,0)} hrs (−{Math.round(pctSaved*100)}%) vs current</div>
                  </div>
                </div>
              </motion.div>
            </CardContent>
          </Card>

          <Card className="shadow-sm md:col-span-12 overflow-hidden h-full min-h-[132px] border-0 bg-transparent">
            <CardContent className="p-0 bg-transparent">
              <div className="h-full w-full bg-gradient-to-br from-indigo-600 via-indigo-500 to-indigo-400 text-white p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide opacity-90">Network benefit ({stores} stores)</div>
                    <div className="mt-1 text-3xl font-semibold">{fmt(network.weeklyHours,0)} hrs / wk</div>
                    <div className="opacity-90">≈ A${fmt(network.weeklySavings,0)} / wk</div>
                    <div className="opacity-90 flex items-center gap-1 mt-1"><CalendarDays className="w-4 h-4"/>≈ A${fmt(network.annualSavings,0)} / yr</div>
                  </div>
                  <div className="space-y-2 min-w-[200px]">
                    <div className="text-[10px] uppercase opacity-90">Assumptions</div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs w-16">Stores</Label>
                      <Input type="number" className="h-8 bg-white/95 text-slate-900 placeholder-slate-600 border-white/40" value={stores} onChange={e=>setStores(Math.max(0,parseInt(e.target.value||"0",10)||0))}/>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs w-16">Weeks/yr</Label>
                      <Input type="number" className="h-8 bg-white/95 text-slate-900 placeholder-slate-600 border-white/40" value={weeks} onChange={e=>setWeeks(Math.max(1,parseInt(e.target.value||"0",10)||52))}/>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-7xl mx-auto">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="mb-4">{TABS.map(([v,l])=> <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList>

            <TabsContent value="overview">
              <div className="grid lg:grid-cols-2 gap-6">
                <Card className="shadow-sm"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="text-sm font-medium">Current vs New hours by process</div></div><div className="h-[360px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={barData}><XAxis dataKey="name" tick={{fontSize:12}} interval={0} angle={-20} textAnchor="end" height={60}/><YAxis/><RTooltip formatter={(v:any)=>fmt(Number(v))+" hrs"} contentStyle={{fontSize:12}}/><Legend/><Bar dataKey="current" name="Current" fill="#0ea5e9" radius={[4,4,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out"/><Bar dataKey="new" name="New Model" fill="#16a34a" radius={[4,4,0,0]} isAnimationActive animationDuration={800} animationEasing="ease-out"/></BarChart></ResponsiveContainer></div></CardContent></Card>
                <Card className="shadow-sm"><CardContent className="p-4"><div className="text-sm font-medium mb-2">Workload distribution by process (100%)</div><div className="h-[360px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={distData} stackOffset="expand"><XAxis dataKey="name"/><YAxis tickFormatter={(v:number)=>Math.round((Number(v)||0)*100)+"%"}/>formatter={(v: unknown)=>fmt(Number(v))+" hrs"}Number(v)||0)*100)+"%"} contentStyle={{fontSize:12}}/><Legend wrapperStyle={{fontSize:11}}/>{procList.map(p=>(<Bar key={p} dataKey={p} stackId="a" fill={processColors[p]}/>))}</BarChart></ResponsiveContainer></div></CardContent></Card>
              </div>

              <div className="mt-6 grid lg:grid-cols-3 gap-6">
                <Card className="shadow-sm lg:col-span-2"><CardContent className="p-4"><div className="flex items-center justify-between mb-2"><div className="text-sm font-medium">Carton flow</div></div><div className="h-[520px]"><ResponsiveContainer width="100%" height="100%"><Sankey data={{nodes:cartonSankey.nodes,links:cartonSankey.links}} nodePadding={36} nodeWidth={16} linkCurvature={0.5} node={<SankeyNode/>} link={<SankeyLink/>}><RTooltipformatter={(v: unknown)=>Math.round((Number(v)||0)*100)+"%"}ey></ResponsiveContainer></div></CardContent></Card>
                <Card className="shadow-sm lg:col-span-1"><CardContent className="p-4"><div className="text-sm font-medium mb-2">Channel breakdown</div><div className="border rounded-lg overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="text-left p-2">Channel</th><th className="text-right p-2">Cartons</th><th className="text-right p-2">Share</th><th className="text-left p-2">→ Dest</th></tr></thead><tbody>{cartonSankey.flowRows.map((r:any)=>(<tr key={r.channel} className="border-t"><td className="p-2"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor:NODE_COLORS[r.channel]||"#94aformatter={(v: unknown)=>fmt(Number(v))+" cartons"}p-2 text-right">{fmt(r.cartons)}</td><td className="p-2 text-right">{Math.round((r.pct||0)*100)}%</td><td className="p-2">{r.dest}</td></tr>))}</tbody></table></div></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="process">
              <Card className="shadow-sm"><CardContent className="p-4 space-y-6">
                <div className="text-sm font-medium">Per‑process parameters — core</div>
                <div className="overflow-x-auto"><table className="min-wcartonSankey.flowRows.map((r: FlowRow)text-left text-slate-500"><tr><th className="py-2 pr-4">Process</th><th className="py-2 pr-4">Unit</th><th className="py-2 pr-4">Use roster</th><th className="py-2 pr-4">Rostered hrs</th><th className="py-2 pr-4">Rate /1k (Current)</th><th className="py-2 pr-4">Rate /1k (New)</th></tr></thead><tbody>{procList.map(p=>{const c=cfg[p]||defaultCfg(p); let rH=getNum(RAW_DATA.rostered_hours,p,0); if(p==="Loadfill") rH=getNum(RAW_DATA.rostered_hours,"Loadfill",getNum(RAW_DATA.rostered_hours,"Sequence",0)); const rC=getNum(RAW_DATA.rates_per_1000,p,0), rN=getNum(RAW_DATA.new_rates_per_1000,p,rC); return(<tr key={p} className="border-t"><td className="py-2 pr-4 font-medium whitespace-nowrap">{p}</td><td className="py-2 pr-4"><select className="border rounded-md px-2 py-1 text-sm" value={c.unit} onChange={e=>{const u=parseUnit(e.target.value); setCfg(s=>({...s,[p]:{...c,unit:u}})); setBump(x=>x+1);}}><option value="cartons">Cartons</option><option value="online">Online</option></select></td><td className="py-2 pr-4"><Switch checked={!!c.useRoster} onCheckedChange={on=>{setCfg(s=>({...s,[p]:{...c,useRoster:on}})); setBump(x=>x+1);}}/></td><td className="py-2 pr-4"><Num value={rH} onChange={n=>{if(p==="Loadfill"){setNum(RAW_DATA.rostered_hours,"Loadfill",n); delete (RAW_DATA.rostered_hours as any)["Sequence"]; } else setNum(RAW_DATA.rostered_hours,p,n); setBump(x=>x+1);}}/></td><td className="py-2 pr-4"><Num value={rC} onChange={n=>{setNum(RAW_DATA.rates_per_1000,p,n); setBump(x=>x+1);}}/></td><td className="py-2 pr-4"><Num value={rN} onChange={n=>{setNum(RAW_DATA.new_rates_per_1000,p,n); setBump(x=>x+1);}}/></td></tr>)})}</tbody></table></div>
                <div className="text-sm font-medium">Per‑process parameters — advanced effects</div>
                <div className="overflow-x-auto"><table className="min-w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="py-2 pr-4">Process</th><th className="py-2 pr-4">Demand</th><th className="py-2 pr-4">Backfill driver</th><th className="py-2 pr-4">Non‑demand (−1..1)</th><delete RAW_DATA.rostered_hours["Sequence"];sName="py-2 pr-4">OMS (0..1)</th></tr></thead><tbody>{procList.map(p=>{const c=cfg[p]||defaultCfg(p); const set=(k:keyof ProcCfg,v:number|boolean)=>{setCfg(s=>({...s,[p]:{...c,[k]:v as any}})); setBump(x=>x+1)}; return(<tr key={p} className="border-t"><td className="py-2 pr-4 font-medium whitespace-nowrap">{p}</td><td className="py-2 pr-4"><Switch checked={!!c.demand} onCheckedChange={on=>set("demand",on)}/></td><td className="py-2 pr-4"><Switch checked={!!c.backfill} onCheckedChange={on=>set("backfill",on)}/></td><td className="py-2 pr-4"><Num className="w-24" value={c.nd} step={0.05} min={-1} max={1} onChange={n=>set("nd",cap(n,-1,1))}/></td><td className="py-2 pr-4"><Num className="w-24" value={c.ex} step={0.05} min={-1} max={1} onChange={n=>set("ex",cap(n,-1,1))}/></td><td className="py-2 pr-4"><Num className="w-24" value={c.oms} step={0.05} min={0} max={1} onChange={n=>set("oms",cap(n,const set=<K extends keyof ProcCfg>(key: K, v: ProcCfg[K])=>{setCfg(s=>({...s,[p]:{...c,[key]:v}})); setBump(x=>x+1)};puts</div>
                <div className="grid md:grid-cols-3 gap-4">{Object.entries(RAW_DATA.inputs).map(([k,v])=> (<div key={k} className="space-y-1"><Label className="text-xs">{k}</Label><Num value={Number(v)} onChange={n=>{setNum(RAW_DATA.inputs,k,n); setBump(x=>x+1);}}/></div>))}{otherScenarioKeys.map(k=> (<div key={k} className="space-y-1"><Label className="text-xs">{k}</Label><Num value={Number(((params[k]??(RAW_DATA.scenario_params as any)[k])*100).toFixed(1))} step={0.1} onChange={pct=>{setParams(p=>({...p,[k]:cap((isNaN(pct)?0:pct)/100)})); setBump(x=>x+1);}}/></div>))}<div className="space-y-1"><Label className="text-xs">Calibrate derived to store hours</Label><div className="flex items-center gap-2"><Switch checked={calibrate} onCheckedChange={setCalibrate}/></div></div><div className="space-y-1"><Label className="text-xs">Avg Hourly Rate (A$)</Label><Num value={hourlyRate} step={1} onChange={n=>setHourlyRate(isNaN(n)?0:n)}/></div><div className="space-y-1"><Label className="text-xs">Weekly Store Hours (for calibration)</Label><Num value={storeHours} step={1} onChange={n=>setStoreHours(isNaN(n)?0:n)}/></div></div>
              </CardContent></Card>
            </TabsContent>

           RAW_DATA.scenario_params as Record<string, number>           <Card className="shadow-sm"><CardContent className="p-4 space-y-4">
                <div className="text-sm font-medium">Per‑issue effects</div>
                {issueDefs.map(iss=>{const procs=uniq([...Object.keys(iss.impact).map(alias),...baseProcs]); return(<div key={iss.id} className="border rounded-lg p-3"><div className="flex items-center justify-between mb-2"><div className="font-medium">{iss.name}</div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">Enabled</span><Switch checked={!!issuesEnabled[iss.id]} onCheckedChange={on=>{setIssuesEnabled(s=>({...s,[iss.id]:on})); setBump(x=>x+1);}}/></div></div><div className="overflow-x-auto"><table className="min-w-full text-xs"><thead><tr><th className="text-left p-2">Process</th><th className="text-left p-2">Impact %</th><th className="text-left p-2">Current ×</th><th className="text-left p-2">New × (mitigated)</th><th/></tr></thead><tbody>{procs.map(p=>{const k=alias(p),b=iss.impact[k]||0,cur=1+b,newer=1+b*(1-mitigation); return(<tr key={k} className="border-t"><td className="p-2 font-medium whitespace-nowrap">{k}</td><td className="p-2"><div className="flex items-center gap-2"><Num className="w-24" value={Math.round(b*100)} onChange={pct=>{const v=Math.max(0,pct)/100; setIssueDefs(prev=>prev.map(it=>it.id===iss.id?{...it,impact:{...it.impact,[k]:v}}:it)); setBump(x=>x+1);}}/><span className="text-slate-500">%</span></div></td><td className="p-2">{cur.toFixed(2)}×</td><td className="p-2">{newer.toFixed(2)}×</td><td className="p-2 text-right">{iss.impact[k]!==undefined&&(<Button variant="ghost" size="sm" onClick={()=>removeImpact(iss.id,k)}>Remove</Button>)}</td></tr>)})}<tr className="border-t"><td className="p-2" colSpan={5}><div className="flex flex-wrap items-center gap-2"><Label className="text-xs">Add process impact:</Label><select className="border rounded-md px-2 py-1 text-sm" onChange={e=>{const p=alias(e.target.value); if(!p)return; if((issueDefs.find(i=>i.id===iss.id)?.impact??{})[p]==null){setIssueDefs(prev=>prev.map(it=>it.id===iss.id?{...it,impact:{...it.impact,[p]:0.05}}:it)); setBump(x=>x+1);} e.currentTarget.selectedIndex=0;}}><option value="">Select process…</option>{baseProcs.map(p=><option key={p} value={p}>{p}</option>)}</select></div></td></tr></tbody></table></div></div>)})}
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-4 mt-6">
          <Card className="shadow-sm lg:col-span-2"><CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-semibold">Category split</div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600">{Math.round(total*100)}%</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">Remaining {Math.round(remaining*100)}%</span>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-6">
                  {(CAT_KEYS as any).map((k:string)=>{
                    const cur=params[k]??(RAW_DATA.scenario_params as any)[k];
                    const others=(CAT_KEYS as any).filter((c:string)=>c!==k).reduce((s:number,c:string)=>s+(params[c]??(RAW_DATA.scenario_params as any)[c]??0),0);
                    const absMax=Math.max(0,1-others);
                    const valueP=Math.round(cur*100);
                    const maxP=Math.max(valueP, Math.round(absMax*100));
                    const color=(CAT_COLOR as any)[k] || "#64748b";
                    return (
                      <div key={k} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{k}</Label>
                          <div className="text-xs text-slate-600">{valueP}% <span className="text-slate-400">/ max {Math.RAW_DATA.scenario_params as Record<string, number>                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
     RAW_DATA.scenario_params as Record<string, number>me="h-full" style={{width: `${valueP}%`, backgroundColor: color}}/>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={()=>{
                            setParams(prev=>{
                              const curr=prev[k]??(RAW_DATA.scenario_params as any)[k]??0;
                              const others=(CAT_KEYS as any).filter((c:string)=>c!==k).reduce((s:number,c:string)=>s+(prev[c]??(RAW_DATA.scenario_params as any)[c]??0),0);
                              const allowed=Math.max(0,1-others);
                              const next=Math.max(0, Math.min(curr-0.01, allowed));
                              return {...prev,[k]:next};
                            });
                            setBump(x=>x+1);
                          }}>-1%</Button>
                          <Slider value={[valueP]} min={0} max={maxP} step={1} onValueChange={(arr)=>{
                            const nextP=(arr[0]??0);
                            setParams(prev=>{
                              const others=(CAT_KEYS as any)RAW_DATA.scenario_params as Record<string, number>((s:number,c:string)=>s+(prev[c]??(RAW_DATA.scenario_params as any)[c]??0),0);
                              const allowed=Math.max(0,1RAW_DATA.scenario_params as Record<string, number>       const next=Math.min(nextP/100, allowed);
                              return {...prev,[k]:next};
                            });
                            setBump(x=>x+1);
                          }}/>
                          <Button type="button" variant="outline" size="sm" onClick={()=>{
                            setParams(prev=>{
                              const curr=prev[k]??(RAW_DATA.scenario_params as any)[k]??0;
                              const others=(CAT_KEYS as any).filter((c:string)=>c!==k).reduce((s:number,c:string)=>s+(prev[c]??(RAW_DATA.scenario_params as any)[c]??0),0);
                              const allowed=Math.max(0RAW_DATA.scenario_params as Record<string, number>         const next=Math.min(curr+0.01, allowed);
                              return {...prev,[k]:next};
                            });
                            setBump(x=>x+1);
                          }}>+1%</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-4 space-y-3"><div className="flex items-center gRAW_DATA.scenario_params as Record<string, number>-4 h-4 text-amber-600"/><h2 className="font-semibold">Issue scenarios</h2></div><div className="space-y-3">{issueDefs.map(iss=>(<div keRAW_DATA.scenario_params as Record<string, number>center justify-between"><div className="pr-4"><div className="font-medium">{iss.name}</div><div className="text-xs text-slate-500">{iss.description}</div></div><Switch checked={!!issuesEnabled[iss.id]} onCheckedChange={on=>{setIssuesEnabled(s=>({...s,[iss.id]:on})); setBump(x=>x+1);}}/></div>))}</div><div className="pt-2"><div className="flex justify-between items-center mb-2"><Label className="text-sm">New model mitigation</Label><span className="text-sm text-slate-600">{Math.round(mitigation*100)}%</span></div><Slider value={[Math.round(mitigation*100)]} max={100} step={5} onValueChange={arr=>{setMitigation((arr[0]??0)/100); setBump(x=>x+1);}}/></div></CardContent></Card>
        </div>
      </div>
    </TooltipProvider>
  )
}
