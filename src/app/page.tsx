"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Factory } from "lucide-react";

// Types & constants
type Unit = "cartons" | "online";
type ProcessKey = "Decant" | "Loadfill" | "Packaway" | "Digital" | "Online" | "Backfill";
type ProcCfg = { unit: Unit; useRoster: boolean; rate: number; roster: number };

type Issue = { id: string; name: string; impact: Partial<Record<ProcessKey, number>> };
const ISSUES: Issue[] = [
  { id: "loadfill_incomplete", name: "Loadfill Incomplete", impact: { Loadfill: 0.1 } },
  { id: "non_dem", name: "High Non-demand Mix", impact: { Loadfill: -0.1, Packaway: 0.05 } },
  { id: "new_lines", name: "High New Line Mix", impact: { Loadfill: -0.1, Digital: 0.1 } },
];

const PROCS: ProcessKey[] = ["Decant", "Loadfill", "Packaway", "Digital", "Online", "Backfill"];
const PROC_LABEL = (p: ProcessKey) => (p === "Digital" ? "Digital Shopkeeping" : p);

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
};

const DEFAULT_INPUTS = { cartonsDelivered: 12000, onlineUnits: 1600, hourlyRate: 32, stores: 270 };
const CAT_KEYS = [
  "Demand %",
  "Non-demand %",
  "Markup %",
  "Clearance %",
  "New lines %",
  "LP %",
  "OMS %",
] as const;
type CatKey = (typeof CAT_KEYS)[number];

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
const NEW_RATE_FACTOR: Record<ProcessKey, number> = PROCS.reduce((acc, p) => {
  const base = DEFAULT_CURRENT[p].rate || 1;
  const ratio = base ? DEFAULT_NEW[p].rate / base : 1;
  acc[p] = ratio && Number.isFinite(ratio) ? ratio : 1;
  return acc;
}, {} as Record<ProcessKey, number>);

// Lean / VSM defaults
const DEFAULT_VA: Record<ProcessKey, number> = {
  Decant: 0.6,
  Loadfill: 0.75,
  Packaway: 0.65,
  Digital: 0.7,
  Online: 0.7,
  Backfill: 0.5,
};
const ZERO_WAIT: Record<ProcessKey, number> = {
  Decant: 0,
  Loadfill: 0,
  Packaway: 0,
  Digital: 0,
  Online: 0,
  Backfill: 0,
};

// Utils
const fmt = (n: unknown, d = 0) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : "0";
};
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// Totals calc
function buildModel(
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

  const chBaseline: Record<string, number> = {
    Demand: cartons,
    "Non-demand": 0,
    Markup: 0,
    Clearance: 0,
    "New lines": 0,
    LP: 0,
    OMS: 0,
  };

  const buildUnitMap = (source: Record<string, number>): Record<ProcessKey, number> => {
    const r: Record<ProcessKey, number> = { Decant: cartons, Loadfill: 0, Packaway: 0, Digital: 0, Online: online, Backfill: 0 };
    r.Loadfill += source.Demand;
    r.Packaway += source["Non-demand"];
    const extra = source["New lines"] + source.Markup + source.Clearance + source.LP;
    r.Digital += extra;
    r.Online += source.OMS;
    return r;
  };

  const curUnits = buildUnitMap(chBaseline);
  const newUnits = buildUnitMap(chCartons);
  const mult = (p: ProcessKey, isNew: boolean) =>
    ISSUES.reduce(
      (m, it) => m * (issues[it.id] ? 1 + (it.impact[p] || 0) * (isNew ? 1 - mitigation : 1) : 1),
      1
    );

  const calcByProc = (
    cfg: Record<ProcessKey, ProcCfg>,
    units: Record<ProcessKey, number>,
    allowSheetHours = true
  ): Record<ProcessKey, number> =>
    PROCS.reduce((o, p) => {
      const calc = cfg[p].useRoster
        ? cfg[p].roster
        : (cfg[p].rate * (cfg[p].unit === "online" ? online : units[p])) / 1000;
      const base =
        !cfg[p].useRoster && allowSheetHours && sheetHours && sheetHours[p] != null
          ? Number(sheetHours[p])
          : calc;
      o[p] = base;
      return o;
    }, {} as Record<ProcessKey, number>);

  const curByProc = calcByProc(currentCfg, curUnits, true);
  const newByProc = Object.fromEntries(
    PROCS.map((p) => [p, calcByProc(newCfg, newUnits, false)[p] * mult(p, true)])
  ) as Record<ProcessKey, number>;

  const sum = (o: Record<ProcessKey, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const curHours = sum(curByProc);
  const newHours = sum(newByProc);
  const benefit = curHours - newHours;

  return {
    cartons,
    online,
    chCartons,
    chCurrent: chBaseline,
    curUnits,
    newUnits,
    curHours,
    newHours,
    benefit,
    savings: benefit * inputs.hourlyRate,
    curByProc,
    newByProc,
  };
}

function NumInput({ label, val, set, step = 1 }: { label: string; val: number; set: (n: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-slate-600">{label}</Label>
      <Input type="number" step={step} value={String(val)} onChange={(e) => set(Number(e.target.value || 0))} className="h-8" />
    </div>
  );
}

function PercentSlider({ label, value, onChange, maxLeft }: { label: string; value: number; onChange: (v: number) => void; maxLeft: number }) {
  const pct = Math.round(clamp(value) * 100);
  const maxPct = Math.round(clamp(maxLeft) * 100);
  const base = label.replace(" %", "");
  const color = NODE_COLORS[base] || "#94a3b8";
  return (
    <div className="space-y-2 p-2 rounded-lg border bg-white">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <div className="text-sm">{base}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input className="h-7 w-16 text-right" type="number" value={String(pct)} onChange={(e) => onChange(clamp(Number(e.target.value || 0) / 100, 0, maxPct / 100))} />
          <span className="text-xs text-slate-500">%</span>
        </div>
      </div>
      <Slider value={[pct]} max={maxPct} step={1} onValueChange={(v) => onChange(clamp((v[0] || 0) / 100, 0, maxPct / 100))} />
      <div className="flex gap-2">
        <Button variant="outline" className="h-7 px-2" onClick={() => onChange(clamp(value - 0.01, 0, maxPct / 100))}>-1%</Button>
        <Button variant="outline" className="h-7 px-2" onClick={() => onChange(clamp(value + 0.01, 0, maxPct / 100))}>+1%</Button>
      </div>
    </div>
  );
}

export default function Page() {
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [split, setSplit] = useState<Record<CatKey, number>>(DEFAULT_SPLIT);
  const [issues, setIssues] = useState<Record<string, boolean>>(() => Object.fromEntries(ISSUES.map((i) => [i.id, false])) as Record<string, boolean>);
  const [mitigation, setMitigation] = useState(0.5);
  const [currentCfg, setCurrentCfg] = useState(DEFAULT_CURRENT);
  const [newCfg, setNewCfg] = useState(DEFAULT_NEW);
  const [sheetHours, setSheetHours] = useState<Record<ProcessKey, number> | null>(null);

  const [nvatNew, setNvatNew] = useState({ bounce: 0.05, lf2d: 0 });
  const [nvatCur, setNvatCur] = useState({ bounce: 0.2, lf2d: 0.15 });

  // Lean / VSM parameters (Value-Add %, Wait hours per week)
  const [vaCur, setVaCur] = useState<Record<ProcessKey, number>>(DEFAULT_VA);
  const [vaNew, setVaNew] = useState<Record<ProcessKey, number>>(DEFAULT_VA);
  const [waitCur, setWaitCur] = useState<Record<ProcessKey, number>>(ZERO_WAIT);
  const [waitNew, setWaitNew] = useState<Record<ProcessKey, number>>(ZERO_WAIT);

  useEffect(() => {
    setNvatCur((s) => ({ ...s, bounce: issues["non_dem"] ? 0.3 : 0.2, lf2d: issues["new_lines"] ? 0.25 : 0.15 }));
  }, [issues]);

  const updateNvat = (mode: "current" | "new", key: "bounce" | "lf2d", value: number) => {
    const next = clamp(value, 0, 0.6);
    if (mode === "current") setNvatCur((s) => ({ ...s, [key]: next }));
    else setNvatNew((s) => ({ ...s, [key]: next }));
  };

  const model = useMemo(
    () => buildModel(inputs, split, currentCfg, newCfg, issues, mitigation, sheetHours),
    [inputs, split, currentCfg, newCfg, issues, mitigation, sheetHours]
  );

  const totalSplit = CAT_KEYS.reduce((a, k) => a + (split[k] || 0), 0);
  const leftFor = (k: CatKey) => clamp(1 - (totalSplit - (split[k] || 0)));

  const perProc = PROCS.map((p) => ({ key: p, name: PROC_LABEL(p), current: model.curByProc[p] || 0, next: model.newByProc[p] || 0 }));
  const procRows = perProc.map(({ name, current, next }) => ({ name, current, next }));
  const deltaRows = perProc.map(({ key, name, current, next }) => ({ key, name, delta: Math.round(current - next) }));
  // Productivity: cartons per hour (per store)
  const curProd = model.curHours > 0 ? model.cartons / model.curHours : 0;
  const newProd = model.newHours > 0 ? model.cartons / model.newHours : 0;
  const prodDelta = newProd - curProd;

  const pctSaved = model.curHours ? Math.round((model.benefit / model.curHours) * 100) : 0;
  const networkAnnual = Math.round(Math.round(model.savings) * inputs.stores * 52);

  const deriveRatesFromHours = () => {
    const derivedRates: Record<ProcessKey, number> = {} as Record<ProcessKey, number>;
    PROCS.forEach((p) => {
      const hours = model.curByProc[p] || 0;
      const units = model.curUnits[p] || 0;
      const denom = units / 1000;
      const fallback = currentCfg[p].rate || 0;
      const rate = denom > 0 ? hours / denom : fallback;
      const clean = Number.isFinite(rate) ? rate : fallback;
      derivedRates[p] = Math.max(0, Math.round(clean * 10) / 10);
    });
    setCurrentCfg((cfg) => {
      const next = { ...cfg };
      PROCS.forEach((p) => { next[p] = { ...next[p], rate: derivedRates[p] }; });
      return next;
    });
    setNewCfg((cfg) => {
      const next = { ...cfg };
      PROCS.forEach((p) => {
        const factorRaw = NEW_RATE_FACTOR[p];
        const factor = factorRaw > 0 && factorRaw < 1 ? factorRaw : 0.95;
        const improved = derivedRates[p] * factor;
        const clean = Number.isFinite(improved) ? improved : next[p].rate;
        next[p] = { ...next[p], rate: Math.max(0, Math.round(clean * 10) / 10) };
      });
      return next;
    });
  };

  async function onExcel(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const f = e.target.files?.[0]; if (!f) return;
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const target = wb.SheetNames.find((n) => n.trim().toLowerCase() === "forecast roster hours") || wb.SheetNames[0];
      const sh = wb.Sheets[target]; if (!sh) throw new Error("No usable sheet found");
      const rows = XLSX.utils.sheet_to_json(sh, { header: 1, defval: null, blankrows: false }) as unknown[][];
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
      const mapName = (s: string): ProcessKey | null => {
        const t = norm(String(s || ""));
        if (t.includes("decant")) return "Decant";
        if (t.includes("loadfill") || t === "lf") return "Loadfill";
        if (t.includes("packaway")) return "Packaway";
        if (t.includes("digitalshopkeeping") || t.includes("shopkeeping") || (t.includes("digital") && !t.includes("online"))) return "Digital";
        if (t.includes("online") || t === "oms") return "Online";
        if (t.includes("backfill")) return "Backfill";
        return null;
      };
      const numify = (v: unknown): number | null => { if (v == null) return null; const s = String(v).replace(/,/g, "").trim(); const n = Number(s); return Number.isFinite(n) ? n : null; };
      const out: Partial<Record<ProcessKey, number>> = {};
      for (const r of rows) {
        const p = mapName(String(r[0] ?? "")); const n = numify(r[1]);
        if (p && n != null) out[p] = Math.max(0, n);
      }
      setSheetHours(out as Record<ProcessKey, number>);
    } catch (err) {
      console.error(err);
      alert('Failed to read Excel. Use sheet "Forecast Roster Hours" with process in column A and hours in column B.');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3"><Factory className="w-6 h-6 text-slate-700" /><h1 className="text-xl font-semibold">Kmart Store Operating Model</h1></div>

        <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-4">
          <Card className="shadow-sm border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Story so far</div>
                  <div className="text-lg font-semibold text-slate-900">Where the new model is winning</div>
                </div>
                <div className="text-xs text-slate-500 hidden sm:block">Per store, weekly</div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <HeroStat label="Total current hours" value={fmt(Math.round(model.curHours))} helper={`${fmt(curProd, 2)} ct/hr`} color="from-sky-600 via-sky-500 to-sky-400" />
                <HeroStat label="Total new hours" value={fmt(Math.round(model.newHours))} helper={`${fmt(newProd, 2)} ct/hr`} color="from-emerald-600 via-emerald-500 to-emerald-400" />
                <HeroStat label="Benefit (per store)" value={`${fmt(Math.round(model.benefit))} hrs`} helper={`≈ A${fmt(Math.round(model.savings))}/wk`} color="from-violet-600 via-violet-500 to-violet-400" />
                <HeroStat label={`Network (${inputs.stores} stores)`} value={`${fmt(Math.round(model.benefit * inputs.stores))} hrs`} helper={`≈ A${fmt(Math.round(model.savings * inputs.stores))}/wk`} color="from-rose-600 via-rose-500 to-rose-400" />
              </div>
            </CardContent>
          </Card>
          <DriverImpactCard
            cartons={inputs.cartonsDelivered}
            topCategory={Object.entries(split).sort((a, b) => (b[1] || 0) - (a[1] || 0))[0]}
            mitigation={mitigation}
            nvatCur={nvatCur}
            nvatNew={nvatNew}
            productivityDelta={prodDelta}
            savings={model.savings}
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="shadow-sm"><CardContent className="p-4 space-y-3"><div className="text-sm font-medium">Net savings composition (by process)</div><SavingsDonut deltas={deltaRows} net={model.benefit} /></CardContent></Card>
          <Card className="shadow-sm"><CardContent className="p-4 space-y-3"><div className="text-sm font-medium flex items-center justify-between">Process rate comparison<span className="text-xs text-slate-500">Rate / 1000</span></div><RateCompareChart currentCfg={currentCfg} newCfg={newCfg} /></CardContent></Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="grid grid-cols-3 w-full md:w-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="explorer">Process Explorer</TabsTrigger>
            <TabsTrigger value="lean">Lean VSM</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <Card className="shadow-sm"><CardContent className="p-4 space-y-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Driver controls</div>
                <div className="text-xs text-slate-500">Adjust inputs & mix to see instant impact</div>
              </div>
              <div className="grid xl:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Volume & cost</div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <NumInput label="Cartons delivered (weekly)" val={inputs.cartonsDelivered} set={(n) => setInputs((s) => ({ ...s, cartonsDelivered: Math.max(0, n) }))} />
                    <NumInput label="Online units (weekly)" val={inputs.onlineUnits} set={(n) => setInputs((s) => ({ ...s, onlineUnits: Math.max(0, n) }))} />
                    <NumInput label="Average hourly rate (AHR)" val={inputs.hourlyRate} step={0.5} set={(n) => setInputs((s) => ({ ...s, hourlyRate: Math.max(0, n) }))} />
                    <NumInput label="Stores (network)" val={inputs.stores} set={(n) => setInputs((s) => ({ ...s, stores: Math.max(1, n) }))} />
                  </div>
                </div>
                <CategoryControls
                  title="Mix & NVAT levers"
                  remainingPct={Math.max(0, 100 - Math.round(totalSplit * 100))}
                  split={split}
                  setSplit={setSplit}
                  leftFor={leftFor}
                  nvatCur={nvatCur}
                  nvatNew={nvatNew}
                  onNvatChange={updateNvat}
                />
              </div>
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 space-y-6">
              <CartonFlowCompare
                current={{
                  label: "Current model",
                  subtitle: "Baseline flow",
                  hours: model.curHours,
                  cfg: currentCfg,
                  procHours: model.curByProc,
                  nvat: nvatCur,
                  cartons: model.cartons,
                  flow: model.chCurrent,
                }}
                next={{
                  label: "New model",
                  subtitle: "Target flow",
                  hours: model.newHours,
                  cfg: newCfg,
                  procHours: model.newByProc,
                  nvat: nvatNew,
                  benefit: model.benefit,
                  cartons: model.cartons,
                  flow: model.chCartons,
                }}
              />
            </CardContent></Card>

            {/* Grouped: Annualised benefit + Waterfall */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="shadow-sm"><CardContent className="p-4"><div className="text-sm font-medium mb-1">Annualised network benefit</div><div className="text-3xl font-semibold">A${fmt(networkAnnual)}</div><div className="text-sm text-slate-600 mt-1">Weekly: A${fmt(Math.round(model.savings * inputs.stores))} · Saved: {pctSaved}% of current hours</div>
                <div className="mt-3"><div className="text-xs text-slate-600 mb-1">Confidence levels</div>
                  <div className="grid grid-cols-3 gap-2 text-sm">{[{ label: "Conservative", m: 0.8 }, { label: "Expected", m: 1.0 }, { label: "Stretch", m: 1.2 }].map((b) => (
                    <div key={b.label} className="border rounded-lg p-2"><div className="text-[11px] text-slate-500">{b.label}</div><div className="font-medium">A${fmt(Math.round(networkAnnual * b.m))}/yr</div></div>
                  ))}</div>
                </div>
              </CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-4"><div className="text-sm font-medium mb-2">Benefit waterfall: Current → processes → New</div><WaterfallBenefit rows={procRows} cur={model.curHours} next={model.newHours} /></CardContent></Card>
            </div>

            {/* Waterfall moved up into grouped section */}

            <Card className="shadow-sm"><CardContent className="p-4 space-y-3"><div className="text-sm font-medium">Issue scenarios</div>
              <div className="grid md:grid-cols-3 gap-4">{ISSUES.map((it) => (
                <div key={it.id} className="border rounded-lg p-3"><div className="flex items-center justify-between"><div className="text-sm font-medium">{it.name}</div><Switch checked={!!issues[it.id]} onCheckedChange={(v) => setIssues((s) => ({ ...s, [it.id]: v }))} /></div>
                  <div className="mt-2 flex flex-wrap gap-1">{Object.entries(it.impact).map(([pk, v]) => {
                    const pct = Math.round((v || 0) * 100); const up = pct > 0; const color = up ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200";
                    return (<span key={pk} className={`text-[11px] px-2 py-0.5 rounded border ${color}`}>{PROC_LABEL(pk as ProcessKey)} {up ? "+" : ""}{pct}%</span>);
                  })}</div>
                </div>
              ))}</div>
              <div className="pt-2"><div className="text-xs mb-1">Mitigation (New model)</div>
                <Slider value={[Math.round(mitigation * 100)]} step={1} onValueChange={(v) => setMitigation(clamp((v[0] || 0) / 100))} />
                {(() => {
                  const cur: Record<ProcessKey, number> = PROCS.reduce((a, p) => { a[p] = ISSUES.reduce((s, it) => s + (issues[it.id] ? it.impact[p] || 0 : 0), 0); return a; }, {} as Record<ProcessKey, number>);
                  const nxt: Record<ProcessKey, number> = PROCS.reduce((a, p) => { a[p] = ISSUES.reduce((s, it) => s + (issues[it.id] ? (it.impact[p] || 0) * (1 - mitigation) : 0), 0); return a; }, {} as Record<ProcessKey, number>);
                  const keys = PROCS.filter((p) => (cur[p] || 0) !== 0 || (nxt[p] || 0) !== 0);
                  if (!keys.length) return null;
                  return (
                    <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {keys.map((p) => {
                        const c = Math.round((cur[p] || 0) * 100); const n = Math.round((nxt[p] || 0) * 100);
                        const cc = c >= 0 ? "text-emerald-700" : "text-rose-700"; const nc = n >= 0 ? "text-emerald-700" : "text-rose-700";
                        return (
                          <div key={p} className="text-[11px] border rounded px-2 py-1 flex items-center justify-between"><span className="text-slate-600">{PROC_LABEL(p)}</span><span className={`ml-2 ${cc}`}>Cur {c > 0 ? "+" : ""}{c}%</span><span className="mx-1 text-slate-400">→</span><span className={` ${nc}`}>New {n > 0 ? "+" : ""}{n}%</span></div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="explorer" className="space-y-6">
            <Card className="shadow-sm"><CardContent className="p-4 space-y-3"><div className="text-sm font-medium">Import forecast hours (.xlsx)</div>
              <div className="grid sm:grid-cols-2 gap-3"><div className="space-y-1"><Label className="text-xs">File (sheet: &quot;Forecast Roster Hours&quot;)</Label><Input type="file" accept=".xlsx,.xls" onChange={onExcel} /></div>
                <div className="space-y-1"><Label className="text-xs">Status</Label><div className="text-sm text-slate-700">{sheetHours ? `${Object.keys(sheetHours).length} processes loaded: ${Object.keys(sheetHours).join(", ")}` : "No file loaded"}</div></div>
              </div>
            </CardContent></Card>
            <div className="grid lg:grid-cols-2 gap-4">
              <Card className="shadow-sm"><CardContent className="p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-medium">Per-process parameters (Current)</div><Button size="sm" variant="outline" onClick={deriveRatesFromHours}>Auto-calc rates</Button></div>
                <ProcTable cfg={currentCfg} setCfg={setCurrentCfg} sheetHours={sheetHours} workload={model.curUnits} hoursMap={model.curByProc} />
              </CardContent></Card>
              <Card className="shadow-sm"><CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2"><div className="text-sm font-medium">Per-process parameters (New)</div><div className="text-xs text-slate-500">Shows % vs current</div></div>
                <ProcTable cfg={newCfg} setCfg={setNewCfg} sheetHours={sheetHours} compareRates={currentCfg} workload={model.newUnits} hoursMap={model.newByProc} />
              </CardContent></Card>
            </div>
          </TabsContent>
          <TabsContent value="lean" className="space-y-6">
            <Card className="shadow-sm"><CardContent className="p-4 space-y-3">
              <div className="text-sm font-medium">Lean parameters</div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-slate-600 mb-1">Current model</div>
                  <LeanProcTable va={vaCur} setVa={setVaCur} wait={waitCur} setWait={setWaitCur} />
                </div>
                <div>
                  <div className="text-xs text-slate-600 mb-1">New model</div>
                  <LeanProcTable va={vaNew} setVa={setVaNew} wait={waitNew} setWait={setWaitNew} onImproveRate={(p, pct) => setNewCfg((s) => ({ ...s, [p]: { ...s[p], rate: Math.max(0, s[p].rate * (1 - pct)) } }))} />
                </div>
              </div>
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4 space-y-4">
              <div className="text-sm font-medium">Value Stream Map</div>
              <LeanVSM
                curHours={model.curByProc}
                newHours={model.newByProc}
                curUnits={model.curUnits}
                newUnits={model.newUnits}
                vaCur={vaCur}
                vaNew={vaNew}
                waitCur={waitCur}
                waitNew={waitNew}
                cfgCur={currentCfg}
                cfgNew={newCfg}
              />
            </CardContent></Card>

            <Card className="shadow-sm"><CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Lean insights</div>
              <LeanInsights curHours={model.curByProc} newHours={model.newByProc} vaCur={vaCur} waitCur={waitCur}
                onApplyRate={(p, pct) => setNewCfg((s) => ({ ...s, [p]: { ...s[p], rate: Math.max(0, s[p].rate * (1 - pct)) } }))}
                onReduceWait={(p, pct) => setWaitNew((w) => ({ ...w, [p]: Math.max(0, w[p] * (1 - pct)) }))}
              />
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProcTable({ cfg, setCfg, sheetHours, compareRates, workload, hoursMap }: {
  cfg: Record<ProcessKey, ProcCfg>;
  setCfg: React.Dispatch<React.SetStateAction<Record<ProcessKey, ProcCfg>>>;
  sheetHours: Record<ProcessKey, number> | null;
  compareRates?: Record<ProcessKey, ProcCfg>;
  workload?: Record<ProcessKey, number>;
  hoursMap?: Record<ProcessKey, number>;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {PROCS.map((p) => (
        <div key={p} className="border rounded-lg p-3 space-y-2">
          <div className="text-sm font-medium flex items-center justify-between"><span>{PROC_LABEL(p)}</span><span className="text-[11px] text-slate-500">{sheetHours?.[p] != null ? `Forecast: ${fmt(sheetHours[p])} hrs` : "Forecast: —"}</span></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Unit</Label><div className="flex gap-2 text-xs">{(["cartons", "online"] as Unit[]).map((u) => (
              <Button key={u} variant={cfg[p].unit === u ? "default" : "outline"} className="h-7 px-2" onClick={() => setCfg((s) => ({ ...s, [p]: { ...s[p], unit: u } }))}>{u}</Button>
            ))}</div></div>
            <div className="space-y-1"><Label className="text-xs">Set Custom</Label><div><Switch checked={cfg[p].useRoster} onCheckedChange={(v) => setCfg((s) => ({ ...s, [p]: { ...s[p], useRoster: v } }))} /></div></div>
            <div className="space-y-1">
              <NumInput label="Rate / 1000" val={cfg[p].rate} set={(n) => setCfg((s) => ({ ...s, [p]: { ...s[p], rate: Math.max(0, n) } }))} />
              {compareRates?.[p]?.rate != null ? (() => {
                const baseRate = compareRates?.[p]?.rate ?? 0;
                const base = baseRate;
                const diff = base > 0 ? ((base - cfg[p].rate) / base) * 100 : 0;
                const color = diff >= 0 ? "text-emerald-600" : "text-rose-600";
                const label = diff >= 0 ? "faster" : "slower";
                return <div className={`text-[11px] ${color}`}>{diff >= 0 ? "+" : ""}{fmt(diff, 1)}% {label} vs current</div>;
              })() : null}
            </div>
            <NumInput label="Custom Hours" val={cfg[p].roster} set={(n) => setCfg((s) => ({ ...s, [p]: { ...s[p], roster: Math.max(0, n) } }))} />
          </div>
          {workload && (
            <div className="text-[11px] text-slate-600 flex items-center justify-between">
              <span>Workload input</span>
              <span>{fmt(workload[p] || 0)} {cfg[p].unit === "online" ? "units" : "ct"}/wk</span>
            </div>
          )}
          {hoursMap && (
            <div className="text-[11px] text-slate-600 flex items-center justify-between">
              <span>Hours required</span>
              <span>{fmt(hoursMap[p] || 0)} hrs</span>
            </div>
          )}
          {sheetHours?.[p] != null && (
            <div className="text-[11px] text-slate-600">Source: Excel (Forecast Roster Hours)
              <span className={`ml-2 px-1.5 py-0.5 rounded border ${!cfg[p].useRoster ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{!cfg[p].useRoster ? "Active" : "Inactive (Custom set)"}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SavingsDonut({ deltas, net }: { deltas: { name: string; delta: number; key?: string }[]; net: number }) {
  const pos = deltas.filter((d) => d.delta > 0);
  const negTotal = deltas.filter((d) => d.delta < 0).reduce((s, d) => s + -d.delta, 0);
  const circTotal = pos.reduce((s, d) => s + d.delta, 0) + negTotal;
  if (circTotal <= 0) return <div className="text-xs text-slate-500">No savings yet.</div>;
  const size = 200, R = 64, CX = size / 2, CY = size / 2, C = 2 * Math.PI * R;
  const slices = [...pos, { name: "Offsets", delta: negTotal, key: "Offsets" }];
  let offset = 0;
  return (
    <div className="flex gap-4 items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-[220px] h-[220px]">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={16} />
        {slices.map((p, i) => {
          const frac = (p.delta || 0) / circTotal; const dash = frac * C;
          const color = p.name === "Offsets" ? "#ef4444" : NODE_COLORS[p.key ?? p.name] || "#10b981";
          const el = (<circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={color} strokeWidth={16} strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${CX} ${CY})`} />);
          offset += dash; return el;
        })}
        <text x={CX} y={CY} textAnchor="middle" fontSize={18} fill="#0f172a">{Math.round(net).toLocaleString()} hrs</text>
        <text x={CX} y={CY + 18} textAnchor="middle" fontSize={11} fill="#475569">Net saved (per store)</text>
      </svg>
      <div className="grid grid-cols-1 gap-2 text-sm">
        {slices.sort((a, b) => (b.delta || 0) - (a.delta || 0)).slice(0, 6).map((p) => {
          const color = p.name === "Offsets" ? "#ef4444" : NODE_COLORS[p.key ?? p.name] || "#10b981";
          const pct = Math.round(((p.delta || 0) / circTotal) * 100);
          return (
            <div key={p.name} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} /><div className="grow flex items-center justify-between gap-3"><span>{p.name}</span><span className="text-slate-600">{pct}%</span></div></div>
          );
        })}
      </div>
    </div>
  );
}

function WaterfallBenefit({ rows, cur, next }: { rows: { name: string; current: number; next: number }[]; cur: number; next: number }) {
  const deltas = rows.map((r) => ({ name: r.name, delta: r.current - r.next }));
  const steps = [
    { label: "Current", type: "total" as const, value: cur },
    ...deltas.map((d) => ({ label: d.name, type: "delta" as const, value: d.delta })),
    { label: "New", type: "total" as const, value: next },
  ];
  const H = 280, padX = 24, col = 48, gap = 22, plotH = H - 70;
  const max = Math.max(cur, next, ...deltas.map((d) => Math.abs(d.delta) + next), 1);
  const y = (v: number) => plotH - (v / max) * plotH + 20;
  let baseline = cur;
  return (
    <div>
      <svg viewBox={`0 0 ${steps.length * (col + gap) + padX * 2} ${H}`} className="w-full h-[300px]">
        {steps.map((s, i) => {
          const x = padX + i * (col + gap);
          if (s.type === "total") {
            const h = plotH - (y(s.value) - 20);
            return (
              <g key={i}>
                <rect x={x} y={y(s.value)} width={col} height={h} fill={i === 0 ? "#0ea5e9" : "#10b981"} rx={4} />
                <text x={x + col / 2} y={H - 16} fontSize={11} fill="#334155" textAnchor="middle">{s.label}</text>
                <text x={x + col / 2} y={y(s.value) - 6} fontSize={11} fill="#475569" textAnchor="middle">{Math.round(s.value).toLocaleString()}</text>
              </g>
            );
          } else {
            const prev = baseline; const nextBase = baseline - s.value; baseline = nextBase;
            const y1 = y(prev), y2 = y(nextBase); const top = Math.min(y1, y2), h = Math.max(2, Math.abs(y1 - y2));
            const color = s.value > 0 ? "#10b981" : "#ef4444";
            return (
              <g key={i}>
                <rect x={x} y={top} width={col} height={h} fill={color} rx={4} />
                <line x1={x + col} y1={y(nextBase)} x2={x + col + gap} y2={y(nextBase)} stroke="#94a3b8" strokeDasharray="4 4" />
                <text x={x + col / 2} y={s.value > 0 ? top - 6 : top + h + 12} fontSize={11} fill={color} textAnchor="middle">{`${s.value > 0 ? "+" : ""}${Math.round(s.value).toLocaleString()}`}</text>
                <text x={x + col / 2} y={H - 16} fontSize={10} fill="#334155" textAnchor="middle">{s.label}</text>
              </g>
            );
          }
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-600 mt-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#0ea5e9" }} /> Current</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#10b981" }} /> New</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#10b981" }} /> Savings</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#ef4444" }} /> Increases</div>
      </div>
    </div>
  );
}

function SankeySimple({ cartons, chCartons, nvat, cfg, procHours }: { cartons: number; chCartons: Record<string, number>; nvat: { bounce: number; lf2d: number }; cfg: Record<ProcessKey, ProcCfg>; procHours: Record<ProcessKey, number> }) {
  const W = 1600, H = 560;
  const stageX = [Math.round(W * 0.05), Math.round(W * 0.3), Math.round(W * 0.58), Math.round(W * 0.88)];
  const scale = (v: number) => Math.max(2, Math.sqrt(v) * 0.25);
  const abbr = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : `${Math.round(n)}`);
  const CHANNEL_ORDER = ["Demand", "Non-demand", "Markup", "New lines", "Clearance", "LP", "OMS"] as const;
  const yCh = Object.fromEntries(CHANNEL_ORDER.map((c, i) => [c, 80 + i * 64])) as Record<string, number>;

  type NodeT = { x: number; y: number; w: number; h: number; label: string; color: string };
  const nodes: NodeT[] = [];
  nodes.push({ x: stageX[0], y: H / 2 - 24, w: 14, h: 56, label: "Decant", color: NODE_COLORS.Decant });
  CHANNEL_ORDER.forEach((c) => nodes.push({ x: stageX[1], y: yCh[c], w: 14, h: 34, label: c, color: NODE_COLORS[c] }));
  const loadfillIdx = nodes.push({ x: stageX[2], y: yCh["Demand"], w: 16, h: 42, label: "Loadfill", color: NODE_COLORS.Loadfill }) - 1;
  const packIdx = nodes.push({ x: stageX[3], y: 96, w: 14, h: 38, label: "Packaway", color: NODE_COLORS.Packaway }) - 1;
  const digIdx = nodes.push({ x: stageX[3], y: 260, w: 14, h: 38, label: "Digital Shopkeeping", color: NODE_COLORS.Digital }) - 1;
  const onIdx = nodes.push({ x: stageX[3], y: 420, w: 14, h: 38, label: "Online", color: NODE_COLORS.Online }) - 1;

  type Link = { from: number; to: number; v: number; color: string; proc?: ProcessKey; nvat?: boolean };
  const links: Link[] = [];
  const idxOfChannel = (name: string) => 1 + CHANNEL_ORDER.indexOf(name as (typeof CHANNEL_ORDER)[number]);

  CHANNEL_ORDER.forEach((c) => { const v = chCartons[c] || 0; if (v > 0) links.push({ from: 0, to: idxOfChannel(c), v, color: NODE_COLORS[c], proc: "Decant" }); });
  const demandV = chCartons["Demand"] || 0;
  const nonDemV = chCartons["Non-demand"] || 0;
  if (demandV > 0) links.push({ from: idxOfChannel("Demand"), to: loadfillIdx, v: demandV, color: NODE_COLORS["Demand"], proc: "Loadfill" });
  if (nonDemV > 0) links.push({ from: idxOfChannel("Non-demand"), to: packIdx, v: nonDemV, color: NODE_COLORS["Non-demand"], proc: "Packaway" });
  (["Markup","New lines","Clearance","LP"] as const).forEach((c) => { const v = chCartons[c] || 0; if (v > 0) links.push({ from: idxOfChannel(c), to: digIdx, v, color: NODE_COLORS[c], proc: "Digital" }); });
  const omsV = chCartons['OMS'] || 0; if (omsV > 0) links.push({ from: idxOfChannel('OMS'), to: onIdx, v: omsV, color: NODE_COLORS['OMS'], proc: "Online" });
  const bounceV = demandV * clamp(nvat.bounce, 0, 0.6);
  const lf2dV = demandV * clamp(nvat.lf2d, 0, 0.6);
  if (bounceV > 0) links.push({ from: loadfillIdx, to: packIdx, v: bounceV, color: "#ef4444", nvat: true });
  if (lf2dV > 0) links.push({ from: loadfillIdx, to: digIdx, v: lf2dV, color: "#ef4444", nvat: true });

  const inbound: Record<number, number> = {};
  links.forEach((l) => { inbound[l.to] = (inbound[l.to] || 0) + l.v; });

  // Hours bars scaling for process nodes
  const PROC_INDEX: Record<ProcessKey, number> = { Decant: 0, Loadfill: loadfillIdx, Packaway: packIdx, Digital: digIdx, Online: onIdx, Backfill: -1 };
  const procKeys: ProcessKey[] = ["Decant","Loadfill","Packaway","Digital","Online"];
  const maxHours = Math.max(1, ...procKeys.map((p) => Math.max(0, procHours[p] || 0)));
  const barW = (h: number) => 30 + ((Math.max(0, h) / maxHours) * 120);

  const path = (a: NodeT, b: NodeT) => {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2; const x2 = b.x, y2 = b.y + b.h / 2;
    const dx = Math.max(40, (x2 - x1) * 0.6); return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };
  const midPoint = (a: NodeT, b: NodeT) => {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2; const x2 = b.x, y2 = b.y + b.h / 2;
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  };
  const rateLabel = (p: ProcessKey) => {
    const r = cfg[p]?.rate ?? 0;
    const unit = cfg[p]?.unit === 'online' ? 'u' : 'ct';
    const d = Number.isInteger(r) ? 0 : 1;
    return `${fmt(r, d)} hrs/1000${unit}`;
  };

  return (
    <div className="w-full min-w-[640px]">
      <style>{`@keyframes flow { to { stroke-dashoffset: -220px; } }`}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[600px]" preserveAspectRatio="xMidYMid meet">
        {links.map((l, i) => {
          const d = path(nodes[l.from], nodes[l.to]);
          const w = scale(l.v);
          const dash = w < 8 ? 6 : 10;
          const gap = w < 8 ? 12 : 16;
          const rate = l.proc ? (cfg[l.proc]?.rate ?? null) : null;
          const dur = (3 + Math.sqrt(Math.max(0, l.v)) / 18) * (rate == null ? 1 : clamp((rate as number) / 40, 0.4, 2.2));
          const mid = midPoint(nodes[l.from], nodes[l.to]);
          const label = l.proc ? rateLabel(l.proc) : null;
          const labelW = label ? label.length * 6.8 + 10 : 0;
          const labelH = 18;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={l.color} strokeOpacity={0.25} strokeWidth={w} strokeLinecap="round" />
              <path d={d} fill="none" stroke={l.color} strokeOpacity={0.9} strokeWidth={Math.max(2, w * 0.72)} strokeLinecap="round" strokeDasharray={`${dash} ${gap}`} style={{ animation: `flow ${dur}s linear infinite` }} />
              {label && !l.nvat && (
                <g>
                  <rect x={mid.x - labelW / 2} y={mid.y - labelH - 6} width={labelW} height={labelH} rx={4} fill="#ffffff" fillOpacity={0.9} stroke={l.color} strokeOpacity={0.25} />
                  <text x={mid.x} y={mid.y - 12} textAnchor="middle" fontSize={11} fill="#0f172a">{label}</text>
                </g>
              )}
            </g>
          );
        })}
        {nodes.map((n, i) => {
          const isChannel = i > 0 && i <= CHANNEL_ORDER.length;
          const catLabel = isChannel ? (CHANNEL_ORDER[i - 1] as string) : "";
          const catVal = isChannel ? Math.round(chCartons[catLabel] || 0) : 0;
          const processForIndex = Object.entries(PROC_INDEX).find(([, idx]) => idx === i)?.[0] as ProcessKey | undefined;
          const hrs = processForIndex ? Math.max(0, procHours[processForIndex] || 0) : 0;
          const barWidth = processForIndex ? barW(hrs) : 0;
          return (
            <g key={i}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={5} fill="#f8fafc" stroke={n.color} />
              <text x={n.x + n.w / 2} y={n.y - 10} textAnchor="middle" fontSize={12} fill="#334155">{n.label}</text>
              {isChannel && catVal > 0 && (
                <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize={11} fill="#0f172a">{abbr(catVal)} ct</text>
              )}
              {i === 0 && cartons > 0 && (
                <text x={n.x + n.w / 2} y={n.y + n.h / 2 + 4} textAnchor="middle" fontSize={11} fill="#0f172a">{abbr(Math.round(cartons))} ct</text>
              )}
              {inbound[i] != null && i >= loadfillIdx && (
                <text x={n.x + n.w / 2} y={n.y + n.h + 14} textAnchor="middle" fontSize={12} fill="#475569">{abbr(Math.round(inbound[i]))} {i === onIdx ? 'u' : 'ct'}</text>
              )}
              {processForIndex && hrs > 0 && (
                <g>
                  <rect x={n.x + n.w / 2 - barWidth / 2} y={n.y + n.h + 22} width={barWidth} height={6} rx={3} fill={n.color} fillOpacity={0.35} />
                  <text x={n.x + n.w / 2} y={n.y + n.h + 38} textAnchor="middle" fontSize={11} fill="#0f172a">{fmt(Math.round(hrs))} hrs</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-end gap-4 text-xs text-slate-600 mt-1">
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded" style={{ background: "#ef4444" }} /> NVAT flows</div>
      </div>
    </div>
  );
}

type FlowPanelConfig = {
  label: string;
  subtitle: string;
  hours: number;
  cfg: Record<ProcessKey, ProcCfg>;
  procHours: Record<ProcessKey, number>;
  nvat: { bounce: number; lf2d: number };
  benefit?: number;
  cartons: number;
  flow: Record<string, number>;
};

function CartonFlowCompare({ current, next }: { current: FlowPanelConfig; next: FlowPanelConfig }) {
  const [zoom, setZoom] = useState(1);
  const zoomPct = Math.round(zoom * 100);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 text-xs text-slate-600">
        <span className="hidden sm:inline">Zoom Carton Flow</span>
        <Slider
          className="w-48"
          value={[zoomPct]}
          min={75}
          max={160}
          step={5}
          onValueChange={(val) => setZoom(Math.max(0.5, (val[0] || 100) / 100))}
        />
        <span className="font-semibold text-slate-700">{zoomPct}%</span>
      </div>
      <div className="relative left-1/2 right-1/2 w-screen max-w-none -translate-x-1/2 px-2 sm:px-6 lg:px-12">
        <div className="flex flex-col gap-10">
          <FlowPanel accent="current" zoom={zoom} {...current} />
          <FlowPanel accent="new" zoom={zoom} {...next} />
        </div>
      </div>
    </div>
  );
}

function FlowPanel({
  label,
  subtitle,
  hours,
  cfg,
  procHours,
  nvat,
  cartons,
  flow,
  accent,
  zoom,
}: FlowPanelConfig & { accent: "current" | "new"; zoom: number }) {
  const accentColor = accent === "current" ? "border-sky-200" : "border-emerald-200";
  const bgGradient = accent === "current" ? "from-sky-50" : "from-emerald-50";
  return (
    <div className={`space-y-3 rounded-2xl border ${accentColor} bg-gradient-to-br ${bgGradient} to-white p-4 shadow-sm`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{subtitle}</div>
          <div className="text-base font-semibold text-slate-900">{label}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Weekly hours</div>
          <div className="text-2xl font-semibold text-slate-900">{fmt(Math.round(hours))}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm overflow-x-auto px-3 py-6">
        <div
          className="min-w-[720px]"
          style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
        >
          <SankeySimple cartons={cartons} chCartons={flow} nvat={nvat} cfg={cfg} procHours={procHours} />
        </div>
      </div>
    </div>
  );
}

function RateCompareChart({ currentCfg, newCfg }: { currentCfg: Record<ProcessKey, ProcCfg>; newCfg: Record<ProcessKey, ProcCfg> }) {
  const rows = PROCS.filter((p) => p !== "Backfill").map((p) => ({
    key: p,
    name: PROC_LABEL(p),
    current: currentCfg[p]?.rate ?? 0,
    next: newCfg[p]?.rate ?? 0,
  }));
  const maxRate = Math.max(1, ...rows.map((r) => Math.max(r.current, r.next)));
  const avgCurrent = rows.reduce((sum, r) => sum + (r.current || 0), 0) / (rows.length || 1);
  const avgNext = rows.reduce((sum, r) => sum + (r.next || 0), 0) / (rows.length || 1);
  const overallDiff = avgCurrent > 0 ? ((avgCurrent - avgNext) / avgCurrent) * 100 : 0;
  const overallColor = overallDiff >= 0 ? "text-emerald-600" : "text-rose-600";
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>Average improvement</span>
        <span className={`text-sm font-semibold ${overallColor}`}>{overallDiff >= 0 ? "+" : ""}{fmt(overallDiff, 1)}%</span>
      </div>
      {rows.map((r) => {
        const curW = Math.max(4, (Math.max(0, r.current) / maxRate) * 100);
        const newW = Math.max(4, (Math.max(0, r.next) / maxRate) * 100);
        const diff = r.current > 0 ? ((r.current - r.next) / r.current) * 100 : 0;
        const diffColor = diff >= 0 ? "text-emerald-600" : "text-rose-600";
        return (
          <div key={r.key} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>{r.name}</span>
              <span className={diffColor}>{diff >= 0 ? "+" : ""}{fmt(diff, 1)}%</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-12">Current</span>
                <div className="flex-1 h-2 rounded bg-slate-200 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-sky-500" style={{ width: `${curW}%` }} />
                </div>
                <span>{fmt(r.current, 1)}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <span className="w-12">New</span>
                <div className="flex-1 h-2 rounded bg-slate-200 relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${newW}%` }} />
                </div>
                <span>{fmt(r.next, 1)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DriverImpactCard({
  cartons,
  topCategory,
  mitigation,
  nvatCur,
  nvatNew,
  productivityDelta,
  savings,
}: {
  cartons: number;
  topCategory?: [string, number];
  mitigation: number;
  nvatCur: { bounce: number; lf2d: number };
  nvatNew: { bounce: number; lf2d: number };
  productivityDelta: number;
  savings: number;
}) {
  const drivers = [
    {
      title: "Volume lever",
      value: `${fmt(Math.round(cartons))} ct/wk`,
      detail: "Cartons delivered drive labour demand; adjust to test load sensitivity.",
    },
    {
      title: "Mix lever",
      value: topCategory ? `${topCategory[0]} ${(topCategory[1] * 100).toFixed(0)}%` : "Balanced",
      detail: "Category split shifts workload between Loadfill, Packaway, and Digital.",
    },
    {
      title: "NVAT leakage",
      value: `Current ${Math.round((nvatCur.bounce || 0) * 100)}% → New ${Math.round((nvatNew.bounce || 0) * 100)}%`,
      detail: "Tighten bounce-back & LF→Digital rework to release more hours.",
    },
    {
      title: "Mitigation confidence",
      value: `${Math.round(mitigation * 100)}%`,
      detail: "Apply mitigation to issue scenarios to see best/worst case views.",
    },
  ];
  return (
    <Card className="shadow-sm border-slate-200">
      <CardContent className="p-4 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Driver impact</div>
          <div className="text-sm text-slate-900 font-semibold">How adjustments translate to savings</div>
        </div>
        <div className="space-y-3">
          {drivers.map((d) => (
            <div key={d.title} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium text-slate-700">{d.title}</span>
                <span className="text-slate-900 font-semibold">{d.value}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">{d.detail}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-slate-500 border-t pt-3">
          Productivity gain: <span className={productivityDelta >= 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{productivityDelta >= 0 ? "+" : ""}{fmt(productivityDelta, 2)} ct/hr</span> · Weekly savings: <span className="font-semibold text-slate-900">A${fmt(Math.round(savings))}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryControls({
  title,
  remainingPct,
  split,
  setSplit,
  leftFor,
  nvatCur,
  nvatNew,
  onNvatChange,
}: {
  title: string;
  remainingPct: number;
  split: Record<CatKey, number>;
  setSplit: React.Dispatch<React.SetStateAction<Record<CatKey, number>>>;
  leftFor: (k: CatKey) => number;
  nvatCur: { bounce: number; lf2d: number };
  nvatNew: { bounce: number; lf2d: number };
  onNvatChange: (mode: "current" | "new", key: "bounce" | "lf2d", value: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{title}</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-600">Remaining: {Math.max(0, remainingPct)}%</div>
          <Button variant="outline" className="h-7 px-2" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Show"}</Button>
        </div>
      </div>
      {open && (
        <>
          <div className="h-2 rounded bg-slate-200 overflow-hidden flex">
            {CAT_KEYS.map((k) => {
              const w = Math.round((split[k] || 0) * 100);
              const base = k.replace(" %", " ");
              const c = NODE_COLORS[base.trim()] || "#cbd5e1";
              return <div key={k} style={{ width: `${w}%`, backgroundColor: c }} />;
            })}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {CAT_KEYS.map((k) => {
              const left = leftFor(k);
              return (
                <PercentSlider key={k} label={k} value={split[k]} maxLeft={left} onChange={(v) => setSplit((s) => ({ ...s, [k]: clamp(v, 0, left) }))} />
              );
            })}
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            {[
              { mode: "current" as const, title: "Current NVAT controls", data: nvatCur, accent: "text-sky-600" },
              { mode: "new" as const, title: "New NVAT controls", data: nvatNew, accent: "text-emerald-600" },
            ].map((item) => (
              <div key={item.mode} className="space-y-2 p-3 rounded-lg border bg-white shadow-sm">
                <div className={`text-sm font-medium ${item.accent}`}>{item.title}</div>
                <div className="flex items-center justify-between text-xs text-slate-500"><span>Bounce-back from Loadfill</span><span>{Math.round((item.data.bounce || 0) * 100)}%</span></div>
                <Slider value={[Math.round((item.data.bounce || 0) * 100)]} min={0} max={40} step={1} onValueChange={(v) => onNvatChange(item.mode, "bounce", (v[0] || 0) / 100)} />
                <div className="flex items-center justify-between text-xs text-slate-500"><span>Loadfill → Digital Shopkeeping</span><span>{Math.round((item.data.lf2d || 0) * 100)}%</span></div>
                <Slider value={[Math.round((item.data.lf2d || 0) * 100)]} min={0} max={40} step={1} onValueChange={(v) => onNvatChange(item.mode, "lf2d", (v[0] || 0) / 100)} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LeanProcTable({ va, setVa, wait, setWait, onImproveRate }: { va: Record<ProcessKey, number>; setVa: React.Dispatch<React.SetStateAction<Record<ProcessKey, number>>>; wait: Record<ProcessKey, number>; setWait: React.Dispatch<React.SetStateAction<Record<ProcessKey, number>>>; onImproveRate?: (p: ProcessKey, pct: number) => void; }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {PROCS.map((p) => (
        <div key={p} className="border rounded-lg p-3 space-y-2">
          <div className="text-sm font-medium">{PROC_LABEL(p)}</div>
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Value-Add %</Label>
              <Slider value={[Math.round((va[p] || 0) * 100)]} min={0} max={100} step={1} onValueChange={(v) => setVa((s) => ({ ...s, [p]: clamp((v[0] || 0) / 100, 0, 1) }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumInput label="Wait hours / week" val={wait[p] || 0} set={(n) => setWait((s) => ({ ...s, [p]: Math.max(0, n) }))} />
              {onImproveRate && (
                <div className="space-y-1">
                  <Label className="text-xs">Improve rate (%)</Label>
                  <div className="flex flex-wrap gap-2 gap-y-1">
                    {[5,10,15].map((pct) => (
                      <Button key={pct} variant="outline" className="h-7 px-2 text-xs" onClick={() => onImproveRate(p, pct/100)}>-{pct}%</Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeanVSM({ curHours, newHours, curUnits, newUnits, vaCur, vaNew, waitCur, waitNew, cfgCur, cfgNew }: {
  curHours: Record<ProcessKey, number>;
  newHours: Record<ProcessKey, number>;
  curUnits: Record<ProcessKey, number>;
  newUnits: Record<ProcessKey, number>;
  vaCur: Record<ProcessKey, number>;
  vaNew: Record<ProcessKey, number>;
  waitCur: Record<ProcessKey, number>;
  waitNew: Record<ProcessKey, number>;
  cfgCur: Record<ProcessKey, ProcCfg>;
  cfgNew: Record<ProcessKey, ProcCfg>;
}) {
  const pad = 24;
  const rowGap = 140;
  const boxH = 28;
  const gap = 14;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [w, setW] = React.useState(1000);
  React.useEffect(() => {
    const el = containerRef.current; if (!el) return;
    let ro: ResizeObserver | null = null;
    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      ro = new window.ResizeObserver((entries: ResizeObserverEntry[]) => {
        for (const entry of entries) {
          const w = entry.contentRect?.width;
          if (w) setW(Math.max(600, Math.round(w)));
        }
      });
    }
    if (ro && el) { ro.observe(el); }
    const onWin = () => setW(Math.max(600, Math.round(el.clientWidth || 1000)));
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onWin);
    }
    onWin();
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', onWin);
      }
      if (ro && el) ro.unobserve(el);
    };
  }, []);
  const W = w; // responsive width
  const rows: Array<{ label: string; hours: Record<ProcessKey, number>; units: Record<ProcessKey, number>; va: Record<ProcessKey, number>; wait: Record<ProcessKey, number>; cfg: Record<ProcessKey, ProcCfg> }>
    = [
      { label: 'Current', hours: curHours, units: curUnits, va: vaCur, wait: waitCur, cfg: cfgCur },
      { label: 'New', hours: newHours, units: newUnits, va: vaNew, wait: waitNew, cfg: cfgNew },
    ];

  const totals = rows.map((r) => {
    let vaT = 0, nvaT = 0, waitT = 0;
    PROCS.forEach((p) => {
      const h = Math.max(0, r.hours[p] || 0);
      const vaf = clamp(r.va[p] ?? 0.7, 0, 1);
      const vaH = h * vaf;
      const nvaH = h * (1 - vaf);
      const wH = Math.max(0, r.wait[p] || 0);
      vaT += vaH; nvaT += nvaH; waitT += wH;
    });
    return { vaT, nvaT, waitT, lead: vaT + nvaT + waitT };
  });
  const maxLead = Math.max(1, ...model.map((t) => t.lead));
  const avail = W - pad * 2 - (PROCS.length - 1) * gap; // leave space for inter-process gaps
  const scaleX = (hrs: number) => (hrs / maxLead) * Math.max(100, avail);
  const H = pad * 2 + rowGap * rows.length + 40; // dynamic height

  return (
    <div className="w-full" ref={containerRef}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {rows.map((r, rowIdx) => {
          const y = pad + rowIdx * rowGap;
          let x = pad;
          return (
            <g key={r.label}>
              <text x={pad} y={y - 10} fontSize={12} fill="#334155">{r.label}</text>
              {PROCS.map((p) => {
                const h = Math.max(0, r.hours[p] || 0);
                const vaf = clamp(r.va[p] ?? 0.7, 0, 1);
                const vaH = h * vaf, nvaH = h * (1 - vaf), wH = Math.max(0, r.wait[p] || 0);
                const w1 = Math.max(1, scaleX(vaH));
                const w2 = Math.max(1, scaleX(nvaH));
                const w3 = Math.max(1, scaleX(wH));
                const yBox = y;
                const Hbox = boxH;
                const xStart = x;
                const unit = r.cfg[p].unit === 'online' ? 'u' : 'ct';
                const rate = r.cfg[p].rate;
                const u = Math.round(r.units[p] || 0);
                const label = `${PROC_LABEL(p)} · ${fmt(rate)} hrs/1000${unit} · ${fmt(u)} ${unit}/wk`;
                const out = (
                  <g key={p}>
                    <rect x={xStart} y={yBox} width={w1} height={Hbox} rx={5} fill="#bbf7d0" stroke="#10b981" />
                    <rect x={xStart + w1} y={yBox} width={w2} height={Hbox} rx={5} fill="#fecaca" stroke="#ef4444" />
                    <rect x={xStart + w1 + w2} y={yBox} width={w3} height={Hbox} rx={5} fill="#fde68a" stroke="#f59e0b" />
                    <text x={xStart + (w1 + w2 + w3) / 2} y={yBox + Hbox / 2 + 4} textAnchor="middle" fontSize={10} fill="#0f172a">{label}</text>
                    <text x={xStart + w1 / 2} y={yBox - 6} textAnchor="middle" fontSize={10} fill="#166534">VA {Math.round(vaf * 100)}%</text>
                    {(nvaH > 0) && (<text x={xStart + w1 + w2 / 2} y={yBox - 6} textAnchor="middle" fontSize={10} fill="#991b1b">NVA {Math.round((1 - vaf) * 100)}%</text>)}
                    {(wH > 0) && (<text x={xStart + w1 + w2 + w3 / 2} y={yBox - 6} textAnchor="middle" fontSize={10} fill="#92400e">Wait {fmt(wH)}h</text>)}
                  </g>
                );
                x += (w1 + w2 + w3) + gap;
                return out;
              })}
              <g>
                <text x={pad} y={y + 54} fontSize={11} fill="#334155">Lead time</text>
                <text x={pad + 70} y={y + 54} fontSize={12} fill="#0f172a">{fmt(totals[rowIdx].lead)} hrs</text>
                <text x={pad + 170} y={y + 54} fontSize={11} fill="#166534">VA {fmt(totals[rowIdx].vaT)} hrs</text>
                <text x={pad + 250} y={y + 54} fontSize={11} fill="#991b1b">NVA {fmt(totals[rowIdx].nvaT)} hrs</text>
                <text x={pad + 330} y={y + 54} fontSize={11} fill="#92400e">Wait {fmt(totals[rowIdx].waitT)} hrs</text>
                <text x={pad + 430} y={y + 54} fontSize={11} fill="#334155">VA ratio {Math.round((totals[rowIdx].vaT / Math.max(1, totals[rowIdx].lead)) * 100)}%</text>
              </g>
            </g>
          );
        })}
      </svg>
      <div className="text-xs text-slate-600">Green: Value-Add, Red: Non-Value-Add, Amber: Waiting</div>
    </div>
  );
}

function LeanInsights({ curHours, newHours, vaCur, waitCur, onApplyRate, onReduceWait }: {
  curHours: Record<ProcessKey, number>;
  newHours: Record<ProcessKey, number>;
  vaCur: Record<ProcessKey, number>;
  waitCur: Record<ProcessKey, number>;
  onApplyRate: (p: ProcessKey, pct: number) => void;
  onReduceWait: (p: ProcessKey, pct: number) => void;
}) {
  const mk = (p: ProcessKey) => {
    const h = Math.max(0, curHours[p] || 0);
    const vaf = clamp(vaCur[p] ?? 0.7, 0, 1);
    const nvaH = h * (1 - vaf) + Math.max(0, waitCur[p] || 0);
    const newH = Math.max(0, newHours[p] || 0);
    const delta = h - newH;
    return { p, name: PROC_LABEL(p), nvaH, h, newH, delta };
  };
  const rows = PROCS.map(mk).sort((a,b) => b.nvaH - a.nvaH).slice(0, 4);
  return (
    <div className="grid md:grid-cols-2 gap-3 text-sm">
      {rows.map((r) => (
        <div key={r.p} className="border rounded-lg p-3">
          <div className="font-medium flex items-center justify-between">
            <span>{r.name}</span>
            <span className="text-xs text-slate-600">NVA {fmt(Math.round(r.nvaH))} hrs/wk</span>
          </div>
          <div className="text-xs text-slate-600">Opportunity: reduce wait and improve rate</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => onReduceWait(r.p, 0.25)}>Reduce wait 25%</Button>
            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => onApplyRate(r.p, 0.1)}>Improve rate 10%</Button>
          </div>
        </div>
      ))}
    </div>
  );
}




function HeroStat({ label, value, helper, color }: { label: string; value: string; helper: string; color: string }) {
  return (
    <div className={`rounded-2xl text-white p-3 bg-gradient-to-br ${color}`}>
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-semibold leading-tight">{value}</div>
      <div className="text-xs opacity-90 mt-1">{helper}</div>
    </div>
  );
}
