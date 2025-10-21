"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Factory } from "lucide-react";

type Unit = "cartons" | "online";

type ProcCfg = { unit: Unit; useRoster: boolean; rate: number; roster: number };

type Issue = { id: string; name: string; impact: Partial<Record<ProcessKey, number>> };

type ProcessKey = "Decant" | "Loadfill" | "Packaway" | "Digital" | "Online" | "Backfill";

const PROCS: ProcessKey[] = ["Decant", "Loadfill", "Packaway", "Digital", "Online", "Backfill"];
const PROC_LABEL = (p: ProcessKey) => (p === "Digital" ? "Digital Shopkeeping" : p);

const fmt = (n: unknown, d = 0) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : "0";
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

const CAT_KEYS = [
  "Demand %",
  "Non-demand %",
  "Markup %",
  "Clearance %",
  "New lines %",
  "LP %",
  "OMS %",
] as const;

type CatKey = typeof CAT_KEYS[number];

const NODE_COLORS: Record<string, string> = {
  Inbound: "#1f2937",
  Decant: "#2563eb",
  Demand: "#16a34a",
  "Non-demand": "#f59e0b",
  Markup: "#8b5cf6",
  Clearance: "#ef4444",
  "New lines": "#0ea5e9",
  LP: "#10b981",
  OMS: "#eab308",
  Loadfill: "#16a34a",
  Packaway: "#f59e0b",
  Digital: "#0ea5e9",
  Online: "#0ea5e9",
  Backfill: "#334155",
};

const DEFAULT_INPUTS = { cartonsDelivered: 12000, onlineUnits: 1600, hourlyRate: 32, stores: 270 };

const DEFAULT_SPLIT: Record<CatKey, number> = {
  "Demand %": 0.68,
  "Non-demand %": 0.1,
  "Markup %": 0.02,
  "Clearance %": 0.02,
  "New lines %": 0.11,
  "LP %": 0.02,
  "OMS %": 0.05,
};

const DEFAULT_CURRENT: Record<ProcessKey, ProcCfg> = {
  Decant: { unit: "cartons", useRoster: false, rate: 13, roster: 0 },
  Loadfill: { unit: "cartons", useRoster: false, rate: 40, roster: 0 },
  Packaway: { unit: "cartons", useRoster: false, rate: 30, roster: 0 },
  Digital: { unit: "cartons", useRoster: false, rate: 88, roster: 0 },
  Online: { unit: "online", useRoster: false, rate: 55, roster: 0 },
  Backfill: { unit: "cartons", useRoster: false, rate: 15, roster: 0 },
};

const DEFAULT_NEW: Record<ProcessKey, ProcCfg> = {
  Decant: { unit: "cartons", useRoster: false, rate: 12, roster: 0 },
  Loadfill: { unit: "cartons", useRoster: false, rate: 36, roster: 0 },
  Packaway: { unit: "cartons", useRoster: false, rate: 32, roster: 0 },
  Digital: { unit: "cartons", useRoster: false, rate: 92, roster: 0 },
  Online: { unit: "online", useRoster: false, rate: 50, roster: 0 },
  Backfill: { unit: "cartons", useRoster: false, rate: 15, roster: 0 },
};

const ISSUES: Issue[] = [
  { id: "late", name: "Late DC Delivery", impact: { Decant: 0.08, Loadfill: 0.04 } },
  { id: "non_dem", name: "High Non‑demand Mix", impact: { Packaway: 0.08, Loadfill: 0.03 } },
  { id: "roster", name: "Roster Gaps", impact: { Decant: 0.07, Loadfill: 0.07, Online: 0.07 } },
];

function useTotals(
  inputs: typeof DEFAULT_INPUTS,
  split: Record<CatKey, number>,
  currentCfg: Record<ProcessKey, ProcCfg>,
  newCfg: Record<ProcessKey, ProcCfg>,
  issues: Record<string, boolean>,
  mitigation: number,
  sheetHours?: Record<ProcessKey, number> | null
) {
  const cartons = Math.max(0, inputs.cartonsDelivered);
  const online = Math.max(0, inputs.onlineUnits);
  const s = CAT_KEYS.reduce((a, k) => a + (split[k] || 0), 0) || 1;
  const g = (k: CatKey) => (split[k] || 0) / s;
  const chCartons: Record<string, number> = {
    Demand: cartons * g("Demand %"),
    "Non-demand": cartons * g("Non-demand %"),
    Markup: cartons * g("Markup %"),
    Clearance: cartons * g("Clearance %"),
    "New lines": cartons * g("New lines %"),
    LP: cartons * g("LP %"),
    OMS: cartons * g("OMS %"),
  };
  const mapCur = (): Record<ProcessKey, number> => {
    const r: Record<ProcessKey, number> = { Decant: cartons, Loadfill: 0, Packaway: 0, Digital: 0, Online: online, Backfill: 0 };
    r.Loadfill += chCartons.Demand + (chCartons["New lines"] + chCartons.Markup + chCartons.Clearance + chCartons.LP) * 0.7 + chCartons.OMS * 0.8;
    r.Packaway += chCartons["Non-demand"] * 0.6 + chCartons.OMS * 0.2;
    r.Digital += (chCartons["New lines"] + chCartons.Markup + chCartons.Clearance + chCartons.LP) * 0.3;
    r.Backfill += chCartons["Non-demand"] * 0.4;
    return r;
  };
  const mapNew = (): Record<ProcessKey, number> => {
    const r: Record<ProcessKey, number> = { Decant: cartons, Loadfill: 0, Packaway: 0, Digital: 0, Online: online, Backfill: 0 };
    r.Loadfill += chCartons.Demand + chCartons["Non-demand"] * 0.2;
    r.Packaway += chCartons["Non-demand"] * 0.8;
    const extra = chCartons["New lines"] + chCartons.Markup + chCartons.Clearance + chCartons.LP;
    r.Digital += extra * 0.7 + chCartons.OMS;
    r.Loadfill += extra * 0.3;
    return r;
  };
  const curUnits = mapCur();
  const newUnits = mapNew();
  const mult = (p: ProcessKey, isNew: boolean) => ISSUES.reduce((m, it) => m * (issues[it.id] ? 1 + (it.impact[p] || 0) * (isNew ? 1 - mitigation : 1) : 1), 1);
  const curByProc = PROCS.reduce((o, p) => { const calc = currentCfg[p].useRoster ? currentCfg[p].roster : (currentCfg[p].rate * (currentCfg[p].unit === "online" ? online : curUnits[p]) / 1000); const base = (!currentCfg[p].useRoster && sheetHours && sheetHours[p] != null) ? Number(sheetHours[p]) : calc; o[p] = base * mult(p, false); return o; }, {} as Record<ProcessKey, number>);
  const newByProc = PROCS.reduce((o, p) => { const calc = newCfg[p].useRoster ? newCfg[p].roster : (newCfg[p].rate * (newCfg[p].unit === "online" ? online : newUnits[p]) / 1000); const base = (!newCfg[p].useRoster && sheetHours && sheetHours[p] != null) ? Number(sheetHours[p]) : calc; o[p] = base * mult(p, true); return o; }, {} as Record<ProcessKey, number>);
  const sum = (obj: Record<ProcessKey, number>) => Object.values(obj).reduce((a,b)=>a+b,0);
  const curHours = sum(curByProc);
  const newHours = sum(newByProc);
  const benefit = curHours - newHours;
  return { cartons, online, chCartons, curUnits, newUnits, curHours, newHours, benefit, savings: benefit * inputs.hourlyRate, curByProc, newByProc };
}

function PercentSlider({ label, value, onChange, maxLeft }: { label: string; value: number; onChange: (v: number) => void; maxLeft: number }) {
  const pct = Math.round(clamp(value) * 100), maxPct = Math.round(clamp(maxLeft) * 100), base = label.replace(" %", ""), color = NODE_COLORS[base] || "#94a3b8";
  return (
    <div className="space-y-2 p-2 rounded-lg border bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} /><div className="text-sm">{base}</div></div>
        <div className="flex items-center gap-2"><Input className="h-7 w-16 text-right" type="number" value={String(pct)} onChange={(e)=> onChange(clamp(Number(e.target.value||0)/100, 0, maxPct/100))} /><span className="text-xs text-slate-500">%</span></div>
      </div>
      <Slider value={[pct]} max={maxPct} step={1} onValueChange={(v) => onChange(clamp((v[0] || 0) / 100, 0, maxPct/100))} />
      <div className="flex gap-2"><Button variant="outline" className="h-7 px-2" onClick={() => onChange(clamp(value - 0.01, 0, maxPct/100))}>-1%</Button><Button variant="outline" className="h-7 px-2" onClick={() => onChange(clamp(value + 0.01, 0, maxPct/100))}>+1%</Button></div>
    </div>
  );
}

function NumInput({ label, val, set, step = 1 }: { label: string; val: number; set: (n: number) => void; step?: number }) {
  return (<div className="space-y-1"><Label className="text-xs text-slate-600">{label}</Label><Input type="number" step={step} value={String(val)} onChange={(e) => set(Number(e.target.value || 0))} className="h-8" /></div>);
}

export default function Page() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [split, setSplit] = useState<Record<CatKey, number>>(DEFAULT_SPLIT);
  const [issues, setIssues] = useState<Record<string, boolean>>({ late: false, non_dem: false, roster: false });
  const [mitigation, setMitigation] = useState(0.5);
  const [currentCfg, setCurrentCfg] = useState(DEFAULT_CURRENT);
  const [newCfg, setNewCfg] = useState(DEFAULT_NEW);
  const [sheetHours, setSheetHours] = useState<Record<ProcessKey, number> | null>(null);

  const totals = useTotals(inputs, split, currentCfg, newCfg, issues, mitigation, sheetHours);
  const totalSplit = CAT_KEYS.reduce((a, k) => a + (split[k] || 0), 0);
  const leftFor = (k: CatKey) => clamp(1 - (totalSplit - (split[k] || 0)));

  const perProc = PROCS.map((p) => ({
    key: p,
    name: PROC_LABEL(p),
    current: totals.curByProc[p] || 0,
    next: totals.newByProc[p] || 0,
  }));
  const procRows = perProc.map(({ name, current, next }) => ({ name, current, next }));

  const benefitRounded = Math.round(totals.benefit), savingsRounded = Math.round(totals.savings);
  const deltaRows = perProc.map(({ key, name, current, next }) => ({ key, name, delta: Math.round(current - next) }));
  const deltaByKey = Object.fromEntries(deltaRows.map(d => [d.key as ProcessKey, d.delta])) as Record<ProcessKey, number>;
  const pctSaved = totals.curHours ? Math.round((totals.benefit / totals.curHours) * 100) : 0;
  const networkAnnual = Math.round(savingsRounded * inputs.stores * 52);
  const confBands = [
    { label: 'Conservative', m: 0.8 },
    { label: 'Expected', m: 1.0 },
    { label: 'Stretch', m: 1.2 },
  ] as const;

  const DESTS: ProcessKey[] = ["Decant","Loadfill","Packaway","Digital","Online"];
  const per1k = Object.fromEntries(DESTS.map((p)=>{
    const base = newCfg[p].rate * (newCfg[p].unit === "online" ? (totals.online / Math.max(1, totals.cartons)) : 1);
    const multNew = ISSUES.reduce((m, it) => m * (issues[it.id] ? 1 + (it.impact[p] || 0) * (1 - mitigation) : 1), 1);
    return [p, base * multNew];
  })) as Record<ProcessKey, number>;
  const per1kMax = Math.max(...DESTS.map(p => per1k[p] || 0), 1);
  const curPer1k = Object.fromEntries(DESTS.map((p)=>{
    const base = currentCfg[p].rate * (currentCfg[p].unit === "online" ? (totals.online / Math.max(1, totals.cartons)) : 1);
    const multCur = ISSUES.reduce((m, it) => m * (issues[it.id] ? 1 + (it.impact[p] || 0) : 1), 1);
    return [p, base * multCur];
  })) as Record<ProcessKey, number>;
  const rateDelta = Object.fromEntries(DESTS.map((p)=> [p, (curPer1k[p]||0) - (per1k[p]||0)])) as Record<ProcessKey, number>;

  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const f = e.target.files?.[0]; if (!f) return;
      const buf = await f.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const sh = wb.Sheets["Forecast Hours Alternate"] || wb.Sheets[wb.SheetNames[0]];
      const rows: Array<Record<string, unknown>> = XLSX.utils.sheet_to_json(sh, { defval: null });
      const mapName = (s: string): ProcessKey | null => {
        const t = String(s || "").toLowerCase();
        if (t.includes("decant")) return "Decant";
        if (t.includes("loadfill") || t.includes("sequence")) return "Loadfill";
        if (t.includes("packaway")) return "Packaway";
        if (t.includes("digital")) return "Digital";
        if (t.includes("online")) return "Online";
        if (t.includes("backfill")) return "Backfill";
        return null;
      };
      const out: Partial<Record<ProcessKey, number>> = {};
      rows.forEach(r => {
        const keys = Object.keys(r);
        const nameKey = keys.find(k => /process|activity|name/i.test(k)) || keys[0];
        const p = mapName(String(r[nameKey] ?? '')); if (!p) return;
        let num: number | null = null;
        const pref = keys.find(k => /hours|weekly|total|value|forecast/i.test(k));
        if (pref && (typeof r[pref] === 'number' || typeof r[pref] === 'string')) num = Number(r[pref]);
        if (num == null) {
          for (const k of keys) { if (k === nameKey) continue; const v = Number(r[k]); if (Number.isFinite(v)) { num = v; break; } }
        }
        if (Number.isFinite(num as number)) out[p] = Math.max(0, Number(num));
      });
      setSheetHours(out as Record<ProcessKey, number>);
    } catch (err) { console.error(err); alert('Failed to read Excel. Ensure the sheet "Forecast Hours Alternate" exists.'); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3"><Factory className="w-6 h-6 text-slate-700" /><h1 className="text-xl font-semibold">Kmart Store Operating Model</h1></div>

        <div className="grid md:grid-cols-4 gap-4">
          <Card className="overflow-hidden border-0 text-white bg-gradient-to-br from-sky-600 via-sky-500 to-sky-400"><CardContent className="p-4"><div className="text-xs uppercase opacity-90">Total Current Hours</div><div className="text-3xl font-semibold">{fmt(Math.round(totals.curHours))}</div></CardContent></Card>
          <Card className="overflow-hidden border-0 text-white bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400"><CardContent className="p-4"><div className="text-xs uppercase opacity-90">Total New Model Hours</div><div className="text-3xl font-semibold">{fmt(Math.round(totals.newHours))}</div></CardContent></Card>
          <Card className="overflow-hidden border-0 text-white bg-gradient-to-br from-violet-600 via-violet-500 to-violet-400"><CardContent className="p-4"><div className="text-xs uppercase opacity-90">Estimated Benefit (per store)</div><div className="text-3xl font-semibold">{fmt(benefitRounded)} hrs</div><div className="opacity-90">≈ A${fmt(savingsRounded)}/week</div></CardContent></Card>
          <Card className="overflow-hidden border-0 text-white bg-gradient-to-br from-rose-600 via-rose-500 to-rose-400"><CardContent className="p-4"><div className="text-xs uppercase opacity-90">{`Network Benefit (${inputs.stores} stores)`}</div><div className="text-3xl font-semibold">{fmt(Math.round(benefitRounded * inputs.stores))} hrs</div><div className="opacity-90">≈ A${fmt(Math.round(savingsRounded * inputs.stores))}/week</div></CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid grid-cols-2 w-full md:w-auto"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="explorer">Process Explorer</TabsTrigger></TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="shadow-sm"><CardContent className="p-4">
              <div className="text-sm font-medium mb-3">Model inputs</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <NumInput label="Cartons delivered (weekly)" val={inputs.cartonsDelivered} set={(n)=>setInputs(s=>({...s,cartonsDelivered:Math.max(0,n)}))} />
                <NumInput label="Online units (weekly)" val={inputs.onlineUnits} set={(n)=>setInputs(s=>({...s,onlineUnits:Math.max(0,n)}))} />
                <NumInput label="Average hourly rate (AHR)" val={inputs.hourlyRate} set={(n)=>setInputs(s=>({...s,hourlyRate:Math.max(0,n)}))} step={0.5} />
                <NumInput label="Stores (network)" val={inputs.stores} set={(n)=>setInputs(s=>({...s,stores:Math.max(1,n)}))} />
              </div>
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 space-y-6">
              <div>
                <div className="text-sm font-medium mb-2">Carton flow</div>
                <SankeySimple cartons={totals.cartons} chCartons={totals.chCartons} unitsNew={totals.newUnits} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between"><div className="text-sm font-medium">Category split</div><div className="text-xs text-slate-600">Remaining: {Math.max(0, 100 - Math.round(totalSplit*100))}%</div></div>
                <div className="h-2 rounded bg-slate-200 overflow-hidden flex">
                  {CAT_KEYS.map((k)=>{ const w = Math.round((split[k]||0)*100); const base = k.replace(" %",""); const c = NODE_COLORS[base] || "#cbd5e1"; return <div key={k} style={{width: w + "%", backgroundColor: c}} /> })}
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {CAT_KEYS.map((k)=>{ const left = leftFor(k); return (<PercentSlider key={k} label={k} value={split[k]} maxLeft={left} onChange={(v)=>setSplit(s=>({...s,[k]: clamp(v, 0, left)}))} />); })}
                </div>
                <div className="text-xs text-slate-500">Total: {Math.round(totalSplit*100)}%</div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {DESTS.map((p)=>{
                  const val = Math.round(per1k[p] || 0); const color = NODE_COLORS[p]; const w = Math.min(100, Math.round(((per1k[p]||0)/per1kMax)*100));
                  return (
                    <div key={p} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-2"><span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: color}} /><div className="text-sm font-medium">{PROC_LABEL(p)}</div></div>
                      <div className="text-[11px] text-slate-500 mb-1">Hours / 1000 cartons</div>
                      <div className="text-xl font-semibold">{fmt(val)}</div>
                      <div className={`mt-1 text-xs font-medium ${(rateDelta[p]||0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {(rateDelta[p]||0) >= 0 ? '▲' : '▼'} {fmt(Math.round(Math.abs(rateDelta[p]||0)))} hrs/1k
                      </div>
                      <div className="h-1.5 mt-2 rounded bg-slate-200 overflow-hidden"><div className="h-1.5" style={{width: `${w}%`, backgroundColor: color, opacity:.6}} /></div>
                    </div>
                  );
                })}
              </div>
            </CardContent></Card>

            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="shadow-sm"><CardContent className="p-4 space-y-3">
                <div className="text-sm font-medium">Net savings composition (by process)</div>
                <SavingsDonut deltas={deltaRows} net={totals.benefit} />
              </CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-4">
                <div className="text-sm font-medium mb-1">Annualised network benefit</div>
                <div className="text-3xl font-semibold">A${fmt(networkAnnual)}</div>
                <div className="text-sm text-slate-600 mt-1">Weekly: A${fmt(Math.round(savingsRounded * inputs.stores))} · Saved: {pctSaved}% of current hours</div>
                <div className="mt-3">
                  <div className="text-xs text-slate-600 mb-1">Confidence levels</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {confBands.map(b=> (
                      <div key={b.label} className="border rounded-lg p-2">
                        <div className="text-[11px] text-slate-500">{b.label}</div>
                        <div className="font-medium">A${fmt(Math.round(networkAnnual * b.m))}/yr</div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent></Card>
            </div>

            <Card className="shadow-sm"><CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Benefit waterfall: Current → processes → New</div>
              <WaterfallBenefit rows={procRows} cur={totals.curHours} next={totals.newHours} />
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 space-y-3">
              <div className="text-sm font-medium">Issue scenarios</div>
              <div className="grid md:grid-cols-3 gap-4">
                {ISSUES.map(it=> (
                  <div key={it.id} className="flex items-center justify-between border rounded-lg p-3"><div className="text-sm">{it.name}</div><Switch checked={!!issues[it.id]} onCheckedChange={(v)=>setIssues(s=>({...s,[it.id]: v}))} /></div>
                ))}
              </div>
              <div className="pt-2"><div className="text-xs mb-1">Mitigation (New model)</div><Slider value={[Math.round(mitigation*100)]} step={1} onValueChange={(v)=>setMitigation(clamp((v[0]||0)/100))} /></div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="explorer" className="space-y-6">
            <Card className="shadow-sm"><CardContent className="p-4 space-y-3">
              <div className="text-sm font-medium">Import forecast hours (.xlsx)</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">File (sheet: "Forecast Hours Alternate")</Label>
                  <Input type="file" accept=".xlsx,.xls" onChange={onExcel} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <div className="text-sm text-slate-700">{sheetHours ? `${Object.keys(sheetHours).length} processes loaded` : 'No file loaded'}</div>
                </div>
              </div>
            </CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 space-y-4"><div className="text-sm font-medium">Per‑process parameters (Current)</div><ProcTable cfg={currentCfg} setCfg={setCurrentCfg} /></CardContent></Card>
            <Card className="shadow-sm"><CardContent className="p-4 space-y-4"><div className="text-sm font-medium">Per‑process parameters (New)</div><ProcTable cfg={newCfg} setCfg={setNewCfg} /></CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProcTable({ cfg, setCfg }: { cfg: Record<ProcessKey, ProcCfg>; setCfg: React.Dispatch<React.SetStateAction<Record<ProcessKey, ProcCfg>>> }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {PROCS.map((p)=> (
        <div key={p} className="border rounded-lg p-3 space-y-2">
          <div className="text-sm font-medium">{PROC_LABEL(p)}</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Unit</Label>
              <div className="flex gap-2 text-xs">{(["cartons","online"] as Unit[]).map(u=> (<Button key={u} variant={cfg[p].unit===u?"default":"outline"} className="h-7 px-2" onClick={()=>setCfg(s=>({...s,[p]:{...s[p],unit:u}}))}>{u}</Button>))}</div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Set Custom</Label><div><Switch checked={cfg[p].useRoster} onCheckedChange={(v)=>setCfg(s=>({...s,[p]:{...s[p],useRoster:v}}))} /></div></div>
            <NumInput label="Rate / 1000" val={cfg[p].rate} set={(n)=>setCfg(s=>({...s,[p]:{...s[p],rate:Math.max(0,n)}}))} />
            <NumInput label="Custom Hours" val={cfg[p].roster} set={(n)=>setCfg(s=>({...s,[p]:{...s[p],roster:Math.max(0,n)}}))} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SavingsDonut({ deltas, net }: { deltas: { name: string; delta: number; key?: string }[]; net: number }) {
  const pos = deltas.filter(d=>d.delta>0);
  const negTotal = deltas.filter(d=>d.delta<0).reduce((s,d)=> s + (-d.delta), 0);
  const circTotal = pos.reduce((s,d)=>s+d.delta,0) + negTotal;
  if (circTotal<=0) return <div className="text-xs text-slate-500">No savings yet.</div>;
  const size = 200, R = 64, CX = size/2, CY = size/2, C = 2*Math.PI*R;
  const slices = [...pos, { name: 'Offsets', delta: negTotal, key: 'Offsets' }];
  let offset = 0;
  return (
    <div className="flex gap-4 items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-[220px] h-[220px]">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={16} />
        {slices.map((p,i)=>{
          const frac = (p.delta||0)/circTotal; const dash = frac*C; const color = p.name==='Offsets'?"#ef4444":(NODE_COLORS[p.key??p.name]||"#10b981");
          const el = (
            <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={16}
              strokeDasharray={`${dash} ${C-dash}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${CX} ${CY})`} />
          );
          offset += dash; return el;
        })}
        <text x={CX} y={CY} textAnchor="middle" fontSize={18} fill="#0f172a">{Math.round(net).toLocaleString()} hrs</text>
        <text x={CX} y={CY+18} textAnchor="middle" fontSize={11} fill="#475569">Net saved (per store)</text>
      </svg>
      <div className="grid grid-cols-1 gap-2 text-sm">
        {slices.sort((a,b)=> (b.delta||0)-(a.delta||0)).slice(0,6).map(p=>{
          const color = p.name==='Offsets'?"#ef4444":(NODE_COLORS[p.key??p.name]||"#10b981");
          const pct = Math.round(((p.delta||0)/circTotal)*100);
          return (
            <div key={p.name} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: color}} />
              <div className="grow flex items-center justify-between gap-3"><span>{p.name}</span><span className="text-slate-600">{pct}%</span></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WaterfallBenefit({ rows, cur, next }: { rows: { name: string; current: number; next: number }[]; cur: number; next: number }) {
  const deltas = rows.map(r=>({ name: r.name, delta: r.current - r.next }));
  const steps = [{ label: 'Current', type:'total' as const, value: cur }, ...deltas.map(d=>({ label: d.name, type:'delta' as const, value: d.delta })), { label: 'New', type:'total' as const, value: next }];
  const H = 280, padX = 24, col = 48, gap = 22, plotH = H - 70;
  const max = Math.max(cur, next, ...deltas.map(d=>Math.abs(d.delta)+next), 1);
  const y = (v:number)=> plotH - (v/max)*plotH + 20;
  let baseline = cur;
  return (
    <div>
      <svg viewBox={`0 0 ${steps.length*(col+gap)+padX*2} ${H}`} className="w-full h-[300px]">
        {steps.map((s,i)=>{
          const x = padX + i*(col+gap);
          if (s.type==='total') {
            const h = plotH - (y(s.value)-20);
            return (
              <g key={i}>
                <rect x={x} y={y(s.value)} width={col} height={h} fill={i===0?"#0ea5e9":"#10b981"} rx={4} />
                <text x={x+col/2} y={H-16} fontSize={11} fill="#334155" textAnchor="middle">{s.label}</text>
                <text x={x+col/2} y={y(s.value)-6} fontSize={11} fill="#475569" textAnchor="middle">{Math.round(s.value).toLocaleString()}</text>
              </g>
            );
          } else {
            const prev = baseline; const nextBase = baseline - s.value; baseline = nextBase;
            const y1 = y(prev), y2 = y(nextBase);
            const top = Math.min(y1,y2), h = Math.max(2, Math.abs(y1-y2));
            const color = s.value>0?"#10b981":"#ef4444";
            return (
              <g key={i}>
                <rect x={x} y={top} width={col} height={h} fill={color} rx={4} />
                <line x1={x+col} y1={y(nextBase)} x2={x+col+gap} y2={y(nextBase)} stroke="#94a3b8" strokeDasharray="4 4" />
                <text x={x+col/2} y={(s.value>0 ? top-6 : top+h+12)} fontSize={11} fill={color} textAnchor="middle">{`${s.value>0?'+':''}${Math.round(s.value).toLocaleString()}`}</text>
                <text x={x+col/2} y={H-16} fontSize={10} fill="#334155" textAnchor="middle">{s.label}</text>
              </g>
            );
          }
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-600 mt-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{background:'#0ea5e9'}}></span> Current</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{background:'#10b981'}}></span> New</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{background:'#10b981'}}></span> Savings</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{background:'#ef4444'}}></span> Increases</div>
      </div>
    </div>
  );
}

function SankeySimple({ cartons, chCartons, unitsNew }: { cartons: number; chCartons: Record<string, number>; unitsNew: Record<ProcessKey, number> }) {
  const W = 1200, H = 520;
  const stageX = [Math.round(W*0.06), Math.round(W*0.36), Math.round(W*0.75)];
  const scale = (v: number) => Math.max(2, Math.sqrt(v) * 0.25);
  const channels = ["Demand","Non-demand","Markup","Clearance","New lines","LP","OMS"] as const;
  const dests: ProcessKey[] = ["Loadfill","Packaway","Digital","Online"];
  const labelDest = (d: ProcessKey)=> d === "Digital" ? "Digital Shopkeeping" : d;

  const nodes: { x: number; y: number; w: number; h: number; label: string; value: number; color: string }[] = [];
  nodes.push({ x: stageX[0], y: H/2-24, w: 14, h: 56, label: "Decant", value: cartons, color: NODE_COLORS.Decant });
  channels.forEach((c, i)=> nodes.push({ x: stageX[1], y: 40 + i*64, w: 14, h: 34, label: c, value: chCartons[c], color: NODE_COLORS[c] }));
  dests.forEach((d, i)=> nodes.push({ x: stageX[2], y: 40 + i*78, w: 14, h: 38, label: labelDest(d), value: unitsNew[d], color: NODE_COLORS[d] }));

  const links: { from: number; to: number; v: number; color: string }[] = [];
  channels.forEach((c, i)=> {
    const base = 1 + i, v = chCartons[c] || 0; if (v<=0) return;
    const toIdx = (name: ProcessKey) => 1 + channels.length + dests.indexOf(name);
    links.push({ from: 0, to: base, v, color: NODE_COLORS[c] });
    const share: Partial<Record<ProcessKey, number>> = c === "Demand" ? { Loadfill: 1 } : c === "Non-demand" ? { Packaway: 1 } : c === "OMS" ? { Online: 1 } : { Digital: 1 };
    Object.entries(share).forEach(([k, pct])=> links.push({ from: base, to: toIdx(k as ProcessKey), v: v * (pct || 0), color: NODE_COLORS[c] }));
  });

  const path = (a: {x:number;y:number}, b:{x:number;y:number}) => `M${a.x},${a.y} C ${(a.x+b.x)/2},${a.y} ${(a.x+b.x)/2},${b.y} ${b.x},${b.y}`;

  return (
    <div className="border rounded-lg p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[520px]">
        <defs><style>{`@keyframes flow { to { stroke-dashoffset: -80; } }`}</style></defs>
        {links.map((l, i)=>{ const a = nodes[l.from], b = nodes[l.to]; const y1 = a.y + a.h/2, y2 = b.y + b.h/2; const sw = scale(l.v); return (
          <g key={i}>
            <path d={path({x:a.x+a.w,y:y1},{x:b.x,y:y2})} fill="none" stroke={l.color} strokeOpacity={0.35} strokeWidth={sw} strokeLinecap="round" />
            <path d={path({x:a.x+a.w,y:y1},{x:b.x,y:y2})} fill="none" stroke={l.color} strokeOpacity={0.9} strokeWidth={sw*0.9} strokeLinecap="round" strokeDasharray="40 40" style={{ animation: `flow ${Math.max(2, sw/1.2)}s linear infinite` }} />
          </g>
        );})}
        {nodes.map((n, i)=> (
          <g key={i}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={6} fill="#f8fafc" stroke={n.color} />
            <text x={n.x + n.w + 8} y={n.y + n.h/2 - 2} fontSize={12} fill="#0f172a">{n.label}</text>
            <text x={n.x + n.w + 8} y={n.y + n.h/2 + 12} fontSize={11} fill="#475569">{fmt(Math.round(n.value))} ctns</text>
          </g>
        ))}
      </svg>
    </div>
  );
}
