"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, CircleUserRound, Clock3, Lock, Plus, Sparkles, Store as StoreIcon, UsersRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { type AppState, type Assignment, type Availability, type MiddleShift, type Role, type Staff, type Store, days, emptyWeek, generateSchedule, hoursFor, initialState, shiftLabel, stores } from "@/lib/scheduler";

const statusLabel: Record<Availability, string> = { unconfirmed: "未确认", all: "全天", off: "休", early: "白", late: "晚" };
const statusCycle: Availability[] = ["unconfirmed", "all", "early", "late", "off"];

function mondayOf(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}
function weekKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function weekRange(date: Date) {
  const end = new Date(date);
  end.setDate(end.getDate() + 6);
  return `${date.getMonth() + 1}.${date.getDate()} — ${end.getMonth() + 1}.${end.getDate()}`;
}

export function SchedulerApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("正在连接…");
  const [dayIndex, setDayIndex] = useState(0);
  const [tab, setTab] = useState("home");
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [middleOpen, setMiddleOpen] = useState(false);
  const [middleDraft, setMiddleDraft] = useState<{ day: number; store: Store; role: Role; start: string; end: string }>({ day: 0, store: "星光店", role: "SS", start: "12:00", end: "18:00" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = weekKey(weekStart);
  const week = state.weeks[key] ?? emptyWeek(state.staff);

  useEffect(() => {
    let alive = true;
    fetch("/api/state").then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      return response.json() as Promise<{ state: AppState | null; updatedAt: string | null }>;
    }).then((data) => {
      if (!alive) return;
      if (data.state) setState(data.state);
      setSaveStatus(data.state ? "已同步" : "已创建新班表");
    }).catch(() => setSaveStatus("暂未连接云端")).finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("保存中…");
    saveTimer.current = setTimeout(() => {
      fetch("/api/state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(state) })
        .then((response) => { if (!response.ok) throw new Error("save failed"); setSaveStatus("已同步"); })
        .catch(() => setSaveStatus("保存失败，请重试"));
    }, 650);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, loaded]);

  const updateWeek = (updater: (current: ReturnType<typeof emptyWeek>) => ReturnType<typeof emptyWeek>) => {
    setState((current) => {
      const existing = current.weeks[key] ?? emptyWeek(current.staff);
      return { ...current, weeks: { ...current.weeks, [key]: updater(existing) } };
    });
  };

  const activeStaff = state.staff.filter((person) => person.active);
  const confirmed = activeStaff.filter((person) => (week.availability[person.id] ?? []).every((value) => value !== "unconfirmed")).length;
  const hardWarnings = week.warnings.filter((warning) => warning.includes("缺少") || warning.includes("尚未确认"));

  const runSchedule = () => {
    updateWeek((current) => {
      const result = generateSchedule(state.staff, current);
      return { ...current, assignments: result.assignments, warnings: result.warnings, published: false };
    });
    setTab("schedule");
  };
  const confirmFullTime = () => updateWeek((current) => {
    const availability = { ...current.availability };
    state.staff.filter((person) => person.active && person.employment === "全职").forEach((person) => { availability[person.id] = Array<Availability>(7).fill("all"); });
    return { ...current, availability };
  });
  const setPersonWeek = (staffId: string, value: Availability) => updateWeek((current) => ({ ...current, availability: { ...current.availability, [staffId]: Array<Availability>(7).fill(value) } }));
  const cycleStatus = (staffId: string, day: number) => updateWeek((current) => {
    const row = [...(current.availability[staffId] ?? Array<Availability>(7).fill("unconfirmed"))];
    row[day] = statusCycle[(statusCycle.indexOf(row[day]) + 1) % statusCycle.length];
    return { ...current, availability: { ...current.availability, [staffId]: row } };
  });
  const addMiddle = () => {
    const slot: MiddleShift = { ...middleDraft, id: `middle-${Date.now()}` };
    updateWeek((current) => ({ ...current, middleShifts: [...current.middleShifts, slot], assignments: [], warnings: [] }));
    setMiddleOpen(false);
    setDayIndex(middleDraft.day);
  };
  const updateStaff = (next: Staff) => {
    setState((current) => ({ ...current, staff: current.staff.map((person) => person.id === next.id ? next : person) }));
    setEditingStaff(null);
  };
  const editingSlot = week.assignments.find((item) => item.id === editingSlotId) ?? null;
  const alreadyWorking = new Set(week.assignments.filter((item) => item.day === editingSlot?.day && item.id !== editingSlot?.id && item.staffId).map((item) => item.staffId));
  const candidates = editingSlot ? state.staff.filter((person) => person.active && person.role === editingSlot.role && !alreadyWorking.has(person.id)) : [];
  const updateSlot = (staffId: string | null, locked = true) => {
    if (!editingSlot) return;
    updateWeek((current) => ({ ...current, assignments: current.assignments.map((item) => item.id === editingSlot.id ? { ...item, staffId, locked } : item), published: false }));
  };
  const staffHours = useMemo(() => {
    const totals = new Map<string, number>();
    week.assignments.forEach((item) => { if (item.staffId) totals.set(item.staffId, (totals.get(item.staffId) ?? 0) + hoursFor(item)); });
    return totals;
  }, [week.assignments]);
  const moveWeek = (offset: number) => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + offset * 7);
    setWeekStart(next);
    setDayIndex(0);
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: unknown) => Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined);
    void register({ name: "read_current_schedule", title: "读取当前班表", description: "读取当前周确认进度和排班异常。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ week: key, confirmed, total: activeStaff.length, warnings: week.warnings }) });
    void register({ name: "generate_current_schedule", title: "生成当前周班表", description: "根据当前人员条件生成本周班表。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute: () => { const result = generateSchedule(state.staff, week); updateWeek((current) => ({ ...current, assignments: result.assignments, warnings: result.warnings, published: false })); return { generated: result.assignments.length > 0, warnings: result.warnings }; } });
    return () => lifecycle.abort();
  }, [key, confirmed, activeStaff.length, state.staff, week]);

  return (
    <main className="app-shell">
      <div className="poster-strip" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <header className="topbar"><div><p className="eyebrow">DUAL STORE / WEEKLY ROSTER</p><h1>双店排班助手</h1></div><div className="sync-pill"><span />{saveStatus}</div></header>
      <div className="week-switcher"><button aria-label="上一周" onClick={() => moveWeek(-1)}><ChevronLeft /></button><div><b>{weekRange(weekStart)}</b><small>{key} 开始</small></div><button aria-label="下一周" onClick={() => moveWeek(1)}><ChevronRight /></button></div>

      <Tabs value={tab} onValueChange={setTab} className="app-tabs">
        <div className="page-frame">
          <TabsContent value="home" className="tab-panel">
            <section className="dashboard-grid">
              <article className="hero-card color-wine"><div className="lamp-geometry" aria-hidden="true"><span /><i /></div><p>本周准备度</p><strong>{confirmed}<em> / {activeStaff.length}</em></strong><span>人员信息已确认</span><button className="primary-action" onClick={() => setTab("availability")}>继续确认人员</button></article>
              <article className="metric-card color-blue"><CalendarDays /><b>{week.assignments.filter((item) => item.staffId).length}</b><span>已安排人次</span></article>
              <article className="metric-card color-orange"><AlertTriangle /><b>{hardWarnings.length}</b><span>需要处理</span></article>
            </section>
            <section className="action-stage"><div><p className="section-kicker">AUTO SCHEDULE</p><h2>先确认，再排班。</h2><p>普通班固定 1 SS + 1 BB；中班可按繁忙时段临时增加。</p></div><button className="generate-button" onClick={runSchedule} disabled={confirmed !== activeStaff.length}><Sparkles />{confirmed === activeStaff.length ? "生成本周班表" : `还差 ${activeStaff.length - confirmed} 人确认`}</button></section>
            {week.warnings.length > 0 && <WarningPanel warnings={week.warnings.slice(0, 4)} onMore={() => setTab("schedule")} />}
          </TabsContent>

          <TabsContent value="availability" className="tab-panel">
            <div className="section-heading"><div><p className="section-kicker">01 / AVAILABILITY</p><h2>本周人员状态</h2></div><button className="small-action" onClick={confirmFullTime}><Check />全职全部正常</button></div>
            <div className="legend"><span>点击日期切换：</span>{statusCycle.map((item) => <i key={item} className={`status-${item}`}>{statusLabel[item]}</i>)}</div>
            <div className="people-list">{activeStaff.map((person) => {
              const row = week.availability[person.id] ?? Array<Availability>(7).fill("unconfirmed");
              const complete = row.every((value) => value !== "unconfirmed");
              return <article className="availability-card" key={person.id}><div className="person-line"><button onClick={() => setEditingStaff(person)} className="person-name"><b>{person.name}</b><span>{person.store} · {person.employment}{person.role}</span></button><div className={`completion-dot ${complete ? "done" : ""}`}>{complete ? <Check /> : "!"}</div></div><div className="day-grid">{days.map((day, index) => <button key={day} onClick={() => cycleStatus(person.id, index)} className={`day-status status-${row[index]}`}><small>{day.slice(1)}</small><b>{statusLabel[row[index]]}</b></button>)}</div><div className="quick-row"><button onClick={() => setPersonWeek(person.id, "all")}>整周可排</button><button onClick={() => setPersonWeek(person.id, "off")}>本周排休</button></div></article>;
            })}</div>
          </TabsContent>

          <TabsContent value="schedule" className="tab-panel">
            <div className="section-heading"><div><p className="section-kicker">02 / SCHEDULE</p><h2>两店周班表</h2></div><button className="small-action accent" onClick={() => { setMiddleDraft((draft) => ({ ...draft, day: dayIndex })); setMiddleOpen(true); }}><Plus />加中班</button></div>
            <div className="day-tabs">{days.map((day, index) => <button key={day} onClick={() => setDayIndex(index)} className={dayIndex === index ? "active" : ""}><b>{day}</b><span>{new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index).getDate()}</span></button>)}</div>
            <div className="store-stack">{stores.map((store, storeIndex) => <StoreSchedule key={store} store={store} storeIndex={storeIndex} day={dayIndex} weekAssignments={week.assignments} staff={state.staff} onSlot={setEditingSlotId} />)}</div>
            <div className="schedule-actions"><button onClick={runSchedule}><Sparkles />重新排未锁定班次</button><button className={week.published ? "published" : ""} onClick={() => updateWeek((current) => ({ ...current, published: !current.published }))}>{week.published ? <Check /> : <Clock3 />}{week.published ? "本周已确认" : "确认本周班表"}</button></div>
            {week.warnings.length > 0 && <WarningPanel warnings={week.warnings} />}
          </TabsContent>

          <TabsContent value="team" className="tab-panel">
            <div className="section-heading"><div><p className="section-kicker">03 / TEAM</p><h2>人员与工时</h2></div></div>
            <div className="team-grid">{state.staff.map((person) => <button key={person.id} onClick={() => setEditingStaff(person)} className={`team-card ${person.active ? "" : "inactive"}`}><span className={`role-badge role-${person.role.toLowerCase()}`}>{person.role}</span><b>{person.name}</b><small>{person.store} · {person.employment}</small><strong>{(staffHours.get(person.id) ?? 0).toFixed(2)}<em>h</em></strong>{person.novice && !person.mature && <i>新员工</i>}</button>)}</div>
          </TabsContent>
        </div>
        <TabsList className="bottom-nav"><TabsTrigger value="home"><CalendarDays /><span>总览</span></TabsTrigger><TabsTrigger value="availability"><CircleUserRound /><span>可排时间</span></TabsTrigger><TabsTrigger value="schedule"><Clock3 /><span>班表</span></TabsTrigger><TabsTrigger value="team"><UsersRound /><span>人员</span></TabsTrigger></TabsList>
      </Tabs>

      <Dialog open={!!editingStaff} onOpenChange={(open) => !open && setEditingStaff(null)}><DialogContent className="editor-dialog">{editingStaff && <StaffEditor person={editingStaff} onSave={updateStaff} />}</DialogContent></Dialog>
      <Dialog open={middleOpen} onOpenChange={setMiddleOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>增加中班</DialogTitle><DialogDescription>默认 12:00–18:00，可指定需要 SS 或 BB。</DialogDescription></DialogHeader><div className="form-grid"><label>日期<select value={middleDraft.day} onChange={(e) => setMiddleDraft({ ...middleDraft, day: Number(e.target.value) })}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label><label>门店<select value={middleDraft.store} onChange={(e) => setMiddleDraft({ ...middleDraft, store: e.target.value as Store })}>{stores.map((store) => <option key={store}>{store}</option>)}</select></label><label>需要角色<select value={middleDraft.role} onChange={(e) => setMiddleDraft({ ...middleDraft, role: e.target.value as Role })}><option>SS</option><option>BB</option></select></label><label>开始<input type="time" value={middleDraft.start} onChange={(e) => setMiddleDraft({ ...middleDraft, start: e.target.value })} /></label><label>结束<input type="time" value={middleDraft.end} onChange={(e) => setMiddleDraft({ ...middleDraft, end: e.target.value })} /></label></div><button className="dialog-submit" onClick={addMiddle}>添加中班</button></DialogContent></Dialog>
      <Dialog open={!!editingSlot} onOpenChange={(open) => !open && setEditingSlotId(null)}><DialogContent className="editor-dialog">{editingSlot && <><DialogHeader><DialogTitle>调整{shiftLabel(editingSlot.shift)}</DialogTitle><DialogDescription>{days[editingSlot.day]} · {editingSlot.store} · 需要 {editingSlot.role}</DialogDescription></DialogHeader><Select value={editingSlot.staffId ?? "empty"} onValueChange={(value) => updateSlot(value === "empty" ? null : value)}><SelectTrigger className="assignment-select"><SelectValue placeholder="选择员工" /></SelectTrigger><SelectContent><SelectItem value="empty">暂时空缺</SelectItem>{candidates.map((person) => <SelectItem value={person.id} key={person.id}>{person.name} · {person.store}</SelectItem>)}</SelectContent></Select><label className="switch-line"><span><b>锁定这个班次</b><small>重新排班时保留当前安排</small></span><Switch checked={editingSlot.locked} onCheckedChange={(locked) => updateSlot(editingSlot.staffId, locked)} /></label></>}</DialogContent></Dialog>
    </main>
  );
}

function WarningPanel({ warnings, onMore }: { warnings: string[]; onMore?: () => void }) {
  return <section className="warning-panel"><div className="warning-head"><AlertTriangle /><b>排班提醒</b><span>{warnings.length}</span></div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}{onMore && <button onClick={onMore}>查看全部提醒</button>}</section>;
}

function StoreSchedule({ store, storeIndex, day, weekAssignments, staff, onSlot }: { store: Store; storeIndex: number; day: number; weekAssignments: Assignment[]; staff: Staff[]; onSlot: (id: string) => void }) {
  const today = weekAssignments.filter((item) => item.day === day && item.store === store);
  return <article className={`store-card store-${storeIndex}`}><div className="store-head"><div><StoreIcon /><b>{store}</b></div><span>{today.filter((item) => item.staffId).length} 人</span></div><div className="shift-list">{(["early", "middle", "late"] as const).map((shift) => {
    const slots = today.filter((item) => item.shift === shift);
    if (shift === "middle" && !slots.length) return null;
    const fallback = store === "星光店" ? (shift === "early" ? "07:15" : "13:15") : (shift === "early" ? "06:15" : "14:30");
    return <div className="shift-row" key={shift}><div className="shift-time"><b>{shiftLabel(shift)}</b><span>{slots[0]?.start ?? fallback}</span></div><div className="slot-group">{slots.map((slot) => { const person = staff.find((item) => item.id === slot.staffId); return <button key={slot.id} onClick={() => onSlot(slot.id)} className={`staff-slot ${person ? "filled" : "empty"}`}><i>{slot.role}</i><b>{person?.name ?? `缺${slot.role}`}</b>{slot.locked && <Lock />}</button>; })}</div></div>;
  })}</div></article>;
}

function StaffEditor({ person, onSave }: { person: Staff; onSave: (person: Staff) => void }) {
  const [draft, setDraft] = useState(person);
  return <><DialogHeader><DialogTitle>编辑人员条件</DialogTitle><DialogDescription>门店、角色、用工类型和新员工状态都可以随时修改。</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">姓名<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><label>所属门店<select value={draft.store} onChange={(e) => setDraft({ ...draft, store: e.target.value as Store })}>{stores.map((store) => <option key={store}>{store}</option>)}</select></label><label>角色<select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}><option>SS</option><option>BB</option></select></label><label>类型<select value={draft.employment} onChange={(e) => setDraft({ ...draft, employment: e.target.value as Staff["employment"] })}><option>全职</option><option>兼职</option></select></label></div><label className="switch-line"><span><b>当前启用</b><small>关闭后不会参与排班</small></span><Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /></label>{draft.role === "BB" && <label className="switch-line"><span><b>新员工已成熟</b><small>开启后可由兼职 SS 带班</small></span><Switch checked={draft.mature ?? false} onCheckedChange={(mature) => setDraft({ ...draft, novice: true, mature })} /></label>}<button className="dialog-submit" onClick={() => onSave(draft)}>保存人员资料</button></>;
}
