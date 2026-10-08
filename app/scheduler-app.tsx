"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Copy, Download, FileSpreadsheet, History, ImageDown, LayoutGrid, ListChecks, Lock, LogIn, LogOut, MoreHorizontal, Plus, RotateCcw, Settings2, Sparkles, Store as StoreIcon, Upload, UserPlus, UsersRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cloud, cloudConfigured } from "@/lib/cloud";
import {
  type AppState, type Assignment, type Availability, type MiddleShift, type Participation, type PeriodState, type Role, type Staff, type Store, type TimeWindow,
  dateLabel, dateList, emptyPeriod, generateSchedule, hoursFor, initialState, isoDate, migrateState, parseDate, publicScheduleState, shiftLabel, shiftTimes, shortDate, stores,
} from "@/lib/scheduler";

const availabilityOptions: Array<{ value: Availability; label: string; short: string }> = [
  { value: "unconfirmed", label: "未确认", short: "未确认" },
  { value: "all", label: "全天可排", short: "全天" },
  { value: "early", label: "只上白班", short: "白班" },
  { value: "late", label: "只上晚班", short: "晚班" },
  { value: "off", label: "休息", short: "休" },
  { value: "custom", label: "自定义时间", short: "自定" },
];
const participationLabel: Record<Participation, string> = { unconfirmed: "未确认", confirmed: "已确认", excluded: "本期不参与" };
const statusLabel = Object.fromEntries(availabilityOptions.map((item) => [item.value, item.short])) as Record<Availability, string>;
const STORAGE_KEY = "dual-store-scheduler-state-v1";

function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}
function makeActivity(label: string) { return { id: `activity-${Date.now()}-${Math.random()}`, at: new Date().toISOString(), label }; }
function safeFilename(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-"); }

export function SchedulerApp() {
  const [state, setState] = useState<AppState>(initialState);
  const [periodKey, setPeriodKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("正在读取本机数据…");
  const [isManager, setIsManager] = useState(!cloudConfigured);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginDraft, setLoginDraft] = useState({ email: "", password: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [tab, setTab] = useState("home");
  const [dayIndex, setDayIndex] = useState(0);
  const [scheduleView, setScheduleView] = useState<"daily" | "week" | "period">("daily");
  const [periodOpen, setPeriodOpen] = useState(false);
  const [periodEditing, setPeriodEditing] = useState(false);
  const range = todayRange();
  const [periodDraft, setPeriodDraft] = useState({ title: "", startDate: range.startDate, endDate: range.endDate, deadline: "" });
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [addingStaff, setAddingStaff] = useState(false);
  const [availabilityEditor, setAvailabilityEditor] = useState<{ staffId: string; day: number } | null>(null);
  const [customDraft, setCustomDraft] = useState<TimeWindow>({ start: "12:00", end: "18:00" });
  const [middleOpen, setMiddleOpen] = useState(false);
  const [middleDraft, setMiddleDraft] = useState<Omit<MiddleShift, "id">>({ day: 0, store: "星光店", name: "中班", requirement: "ANY", headcount: 1, start: "12:00", end: "18:00", note: "" });
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const undoStack = useRef<PeriodState[]>([]);

  const period = state.periods[periodKey];
  const dates = period ? dateList(period.startDate, period.endDate) : [];
  const activeStaff = state.staff.filter((person) => person.active);
  const confirmed = period ? activeStaff.filter((person) => period.participation[person.id] === "confirmed").length : 0;
  const excluded = period ? activeStaff.filter((person) => period.participation[person.id] === "excluded").length : 0;
  const unconfirmed = activeStaff.length - confirmed - excluded;
  const hardWarnings = period?.warnings.filter((warning) => warning.startsWith("【硬】")) ?? [];
  const softWarnings = period?.warnings.filter((warning) => !warning.startsWith("【硬】")) ?? [];

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(async () => {
      if (cancelled) return;
      try {
        if (cloud) {
          const { data: sessionData } = await cloud.auth.getSession();
          const signedIn = Boolean(sessionData.session);
          let manager = false;
          if (signedIn) {
            const { data } = await cloud.rpc("is_scheduler_manager");
            manager = data === true;
          }
          const { data: row, error } = await cloud.from("app_state").select("payload").eq("id", manager ? "manager" : "public").maybeSingle();
          if (error) throw error;
          if (cancelled) return;
          setIsManager(manager);
          if (row?.payload) {
            const next = migrateState(row.payload);
            const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0]?.[0] ?? "";
            setState(next); setPeriodKey(selected); setSaveStatus(manager ? "已从云端同步" : "公开班表 · 云端同步");
          } else if (manager) {
            const saved = window.localStorage.getItem(STORAGE_KEY);
            const next = migrateState(saved ? JSON.parse(saved) : null);
            if (!Object.keys(next.periods).length) {
              const initialRange = todayRange(); const created = emptyPeriod(next.staff, initialRange.startDate, initialRange.endDate); next.periods[created.id] = created;
            }
            const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0][0];
            setState(next); setPeriodKey(selected); setSaveStatus("店长模式 · 准备云端首次保存");
          } else {
            setState(initialState()); setPeriodKey(""); setSaveStatus("暂无已发布班表");
          }
          return;
        }
        const saved = window.localStorage.getItem(STORAGE_KEY);
        const next = migrateState(saved ? JSON.parse(saved) : null);
        if (!Object.keys(next.periods).length) {
          const initialRange = todayRange();
          const created = emptyPeriod(next.staff, initialRange.startDate, initialRange.endDate);
          next.periods[created.id] = created;
        }
        const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0][0];
        setState(next); setPeriodKey(selected); setSaveStatus(saved ? "已从本机载入" : "已创建新周期");
      } catch {
        const next = initialState(); const initialRange = todayRange(); const created = emptyPeriod(next.staff, initialRange.startDate, initialRange.endDate); next.periods[created.id] = created;
        setState(next); setPeriodKey(created.id); setSaveStatus("本机数据异常，已新建");
      } finally {
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded || !periodKey || !isManager) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        if (cloud) {
          const updatedAt = new Date().toISOString();
          const { error } = await cloud.from("app_state").upsert([
            { id: "manager", payload: state, updated_at: updatedAt },
            { id: "public", payload: publicScheduleState(state), updated_at: updatedAt },
          ]);
          if (error) throw error;
          setSaveStatus(`已同步云端 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
        } else {
          setSaveStatus(`已保存到本机 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
        }
      } catch {
        setSaveStatus("云端同步失败，已保留本机备份");
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, loaded, periodKey, isManager]);

  const updatePeriod = (label: string, updater: (current: PeriodState) => PeriodState, keepPublished = false) => {
    if (!periodKey) return;
    const existing = state.periods[periodKey];
    if (!existing) return;
    undoStack.current.push(structuredClone(existing));
    if (undoStack.current.length > 30) undoStack.current.shift();
    setCanUndo(true);
    const updated = updater(existing);
    const next = { ...updated, activities: [makeActivity(label), ...(updated.activities ?? [])].slice(0, 200) };
    if (!keepPublished && existing.status === "published") next.status = "adjusted";
    setState((current) => ({ ...current, periods: { ...current.periods, [periodKey]: next } }));
  };
  const undo = () => {
    const previous = undoStack.current.pop();
    if (!previous || !periodKey) return;
    setCanUndo(undoStack.current.length > 0);
    setState((current) => ({ ...current, periods: { ...current.periods, [periodKey]: { ...previous, activities: [makeActivity("撤销上一项修改"), ...previous.activities] } } }));
  };

  const openNewPeriod = () => { const initialRange = todayRange(); setPeriodEditing(false); setPeriodDraft({ title: "", startDate: initialRange.startDate, endDate: initialRange.endDate, deadline: "" }); setPeriodOpen(true); };
  const openEditPeriod = () => { if (!period) return; setPeriodEditing(true); setPeriodDraft({ title: period.title, startDate: period.startDate, endDate: period.endDate, deadline: period.deadline ?? "" }); setPeriodOpen(true); };
  const copyPeriodSettings = () => {
    if (!period) return;
    const periodLength = dateList(period.startDate, period.endDate).length;
    const start = parseDate(period.endDate); start.setDate(start.getDate() + 1);
    const end = new Date(start); end.setDate(end.getDate() + periodLength - 1);
    const created = emptyPeriod(state.staff, isoDate(start), isoDate(end));
    created.middleShifts = period.middleShifts.map((item) => ({ ...item, id: `middle-${Date.now()}-${Math.random()}` }));
    created.activities = [makeActivity(`复制“${period.title}”的班次设置`)];
    setState((current) => ({ ...current, periods: { ...current.periods, [created.id]: created } }));
    setPeriodKey(created.id); setDayIndex(0); setMoreOpen(false);
  };
  const savePeriod = () => {
    if (!periodDraft.startDate || !periodDraft.endDate || periodDraft.endDate < periodDraft.startDate) return;
    if (periodEditing && period) {
      const nextDates = dateList(periodDraft.startDate, periodDraft.endDate);
      updatePeriod("修改排班周期", (current) => ({ ...current, title: periodDraft.title || `${shortDate(periodDraft.startDate)}—${shortDate(periodDraft.endDate)}`, startDate: periodDraft.startDate, endDate: periodDraft.endDate, deadline: periodDraft.deadline || undefined, availability: Object.fromEntries(state.staff.map((person) => [person.id, Array.from({ length: nextDates.length }, (_, index) => current.availability[person.id]?.[index] ?? "unconfirmed")])), assignments: [], warnings: [], status: "collecting" }));
    } else {
      const created = emptyPeriod(state.staff, periodDraft.startDate, periodDraft.endDate, periodDraft.title || undefined); created.deadline = periodDraft.deadline || undefined; created.activities = [makeActivity("创建排班周期")];
      setState((current) => ({ ...current, periods: { ...current.periods, [created.id]: created } })); setPeriodKey(created.id); setDayIndex(0);
    }
    setPeriodOpen(false);
  };

  const setAvailability = (staffId: string, day: number, value: Availability) => updatePeriod(`修改${state.staff.find((person) => person.id === staffId)?.name}的${dates[day] ? shortDate(dates[day]) : "日期"}可排时间`, (current) => {
    const row = [...(current.availability[staffId] ?? Array<Availability>(dates.length).fill("unconfirmed"))]; row[day] = value;
    return { ...current, availability: { ...current.availability, [staffId]: row }, warnings: [], status: "collecting" };
  });
  const setWholePeriod = (staffId: string, value: Availability) => updatePeriod(`批量设置${state.staff.find((person) => person.id === staffId)?.name}全周期状态`, (current) => ({ ...current, availability: { ...current.availability, [staffId]: Array<Availability>(dates.length).fill(value) }, participation: { ...current.participation, [staffId]: value === "unconfirmed" ? "unconfirmed" : current.participation[staffId] }, warnings: [], status: "collecting" }));
  const setParticipation = (staffId: string, value: Participation) => updatePeriod(`${state.staff.find((person) => person.id === staffId)?.name}标记为${participationLabel[value]}`, (current) => ({ ...current, participation: { ...current.participation, [staffId]: value }, warnings: [] }));
  const confirmPerson = (staffId: string) => {
    if ((period.availability[staffId] ?? []).some((item) => item === "unconfirmed")) { setAvailabilityEditor({ staffId, day: Math.max(0, period.availability[staffId].findIndex((item) => item === "unconfirmed")) }); return; }
    setParticipation(staffId, "confirmed");
  };
  const saveCustomTime = () => {
    if (!availabilityEditor) return;
    const { staffId, day } = availabilityEditor;
    updatePeriod(`设置${state.staff.find((person) => person.id === staffId)?.name}自定义时间`, (current) => {
      const row = [...current.availability[staffId]]; row[day] = "custom";
      return { ...current, availability: { ...current.availability, [staffId]: row }, customTimes: { ...current.customTimes, [staffId]: { ...(current.customTimes[staffId] ?? {}), [day]: [customDraft] } }, status: "collecting" };
    }); setAvailabilityEditor(null);
  };

  const addMiddle = () => { const item: MiddleShift = { ...middleDraft, id: `middle-${Date.now()}` }; updatePeriod(`新增${item.store}${item.name}`, (current) => ({ ...current, middleShifts: [...current.middleShifts, item], assignments: [], warnings: [], status: "draft" })); setMiddleOpen(false); setDayIndex(item.day); };
  const deleteMiddle = (id: string) => updatePeriod("删除中班", (current) => ({ ...current, middleShifts: current.middleShifts.filter((item) => item.id !== id), assignments: current.assignments.filter((item) => item.middleId !== id), warnings: [] }));

  const runSchedule = () => { if (!period) return; const result = generateSchedule(state.staff, period); updatePeriod("自动生成班表", (current) => ({ ...current, assignments: result.assignments, warnings: result.warnings, status: "draft" }), true); setTab("schedule"); };
  const publish = () => {
    if (hardWarnings.length) return;
    updatePeriod("发布并锁定班表", (current) => ({ ...current, status: "published", version: current.version + 1, publishedAt: new Date().toISOString(), assignments: current.assignments.map((item) => ({ ...item, locked: true })) }), true);
  };
  const editingSlot = period?.assignments.find((item) => item.id === editingSlotId) ?? null;
  const candidateStaff = editingSlot ? state.staff.filter((person) => person.active && (editingSlot.role === "ANY" || person.role === editingSlot.role || (!editingSlot.middleId && editingSlot.role === "BB" && person.role === "SS")) && !period.assignments.some((item) => item.day === editingSlot.day && item.id !== editingSlot.id && item.staffId === person.id)) : [];
  const updateSlot = (staffId: string | null) => { if (!editingSlot) return; updatePeriod(`调整${dateLabel(dates[editingSlot.day])}${editingSlot.store}${shiftLabel(editingSlot.shift)}`, (current) => ({ ...current, assignments: current.assignments.map((item) => item.id === editingSlot.id ? { ...item, staffId, locked: true } : item), warnings: [] })); setEditingSlotId(null); };

  const staffHours = new Map<string, number>(); period?.assignments.forEach((item) => { if (item.staffId) staffHours.set(item.staffId, (staffHours.get(item.staffId) ?? 0) + hoursFor(item)); });
  const addStaff = (person: Staff) => {
    const created = { ...person, id: `staff-${Date.now()}` };
    setState((current) => ({ ...current, staff: [...current.staff, created], periods: Object.fromEntries(Object.entries(current.periods).map(([key, value]) => [key, { ...value, availability: { ...value.availability, [created.id]: Array<Availability>(dateList(value.startDate, value.endDate).length).fill("unconfirmed") }, participation: { ...value.participation, [created.id]: "unconfirmed" } }])) }));
    setAddingStaff(false);
  };
  const updateStaff = (person: Staff) => { setState((current) => ({ ...current, staff: current.staff.map((item) => item.id === person.id ? person : item) })); setEditingStaff(null); };

  const enterManagerMode = async () => {
    if (!cloud) return;
    const { data: owned, error: claimError } = await cloud.rpc("claim_scheduler_manager");
    if (claimError || owned !== true) throw new Error("该云端班表已绑定其他店长账号。");
    const { data: row, error } = await cloud.from("app_state").select("payload").eq("id", "manager").maybeSingle();
    if (error) throw error;
    const next = row?.payload ? migrateState(row.payload) : migrateState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"));
    if (!Object.keys(next.periods).length) {
      const initialRange = todayRange(); const created = emptyPeriod(next.staff, initialRange.startDate, initialRange.endDate); next.periods[created.id] = created;
    }
    const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0][0];
    setState(next); setPeriodKey(selected); setIsManager(true); setTab("home"); setLoginOpen(false); setLoginStatus(""); setSaveStatus("店长模式 · 已连接云端");
  };
  const signInManager = async () => {
    if (!cloud || !loginDraft.email || !loginDraft.password) return;
    setLoginStatus("正在登录…");
    const { error } = await cloud.auth.signInWithPassword(loginDraft);
    if (error) { setLoginStatus("邮箱或密码不正确。"); return; }
    try { await enterManagerMode(); } catch (error) { setLoginStatus(error instanceof Error ? error.message : "无法进入店长模式。"); }
  };
  const createManager = async () => {
    if (!cloud || !loginDraft.email || loginDraft.password.length < 8) { setLoginStatus("请填写邮箱，密码至少8位。"); return; }
    setLoginStatus("正在创建店长账号…");
    const { data, error } = await cloud.auth.signUp(loginDraft);
    if (error) { setLoginStatus(error.message); return; }
    if (!data.session) { setLoginStatus("验证邮件已发送，验证后返回登录。"); return; }
    try { await enterManagerMode(); } catch (error) { setLoginStatus(error instanceof Error ? error.message : "无法创建店长账号。"); }
  };
  const signOutManager = async () => {
    if (!cloud) return;
    await cloud.auth.signOut();
    const { data: row } = await cloud.from("app_state").select("payload").eq("id", "public").maybeSingle();
    const next = migrateState(row?.payload ?? null);
    const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0]?.[0] ?? "";
    setState(next); setPeriodKey(selected); setIsManager(false); setTab("schedule"); setSaveStatus(row?.payload ? "公开班表 · 云端同步" : "暂无已发布班表");
  };

  const exportExcel = () => {
    if (!period) return;
    const header = ["员工", "身份", ...dates.map(dateLabel), "本周期工时"];
    const rows = state.staff.filter((person) => person.active).map((person) => [person.name, `${person.employment}${person.role}`, ...dates.map((_, day) => {
      const slot = period.assignments.find((item) => item.day === day && item.staffId === person.id); return slot ? `${slot.store}${shiftLabel(slot.shift)}` : "休";
    }), (staffHours.get(person.id) ?? 0).toFixed(2)]);
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>${header.map((cell) => `<th>${cell}</th>`).join("")}</tr>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    downloadBlob(new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" }), `${safeFilename(period.title)}-班表.xls`);
  };
  const exportBackup = () => {
    const payload = JSON.stringify({ format: "dual-store-scheduler", version: 1, exportedAt: new Date().toISOString(), state }, null, 2);
    downloadBlob(new Blob([payload], { type: "application/json;charset=utf-8" }), `双店排班备份-${isoDate(new Date())}.json`);
    setMoreOpen(false);
  };
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string; state?: unknown };
      const next = migrateState(parsed?.format === "dual-store-scheduler" ? parsed.state : parsed);
      if (!Object.keys(next.periods).length) throw new Error("empty backup");
      const selected = Object.entries(next.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate))[0][0];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next); setPeriodKey(selected); setDayIndex(0); setMoreOpen(false); setSaveStatus("备份已恢复并保存到本机");
    } catch {
      setSaveStatus("备份无法读取，请选择本系统导出的 JSON 文件");
    }
  };
  const exportImage = () => {
    if (!period) return;
    const people = state.staff.filter((person) => person.active);
    const nameWidth = 190; const hoursWidth = 105; const columnWidth = 86;
    const width = Math.max(1080, nameWidth + hoursWidth + dates.length * columnWidth + 60);
    const rowHeight = 58; const tableTop = 224; const height = tableTop + 48 + people.length * rowHeight + 34;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d"); if (!ctx) return;
    ctx.fillStyle = "#f7f3e8"; ctx.fillRect(0, 0, width, height); ctx.fillStyle = "#720020"; ctx.fillRect(0, 0, width, 130); ctx.fillStyle = "#fffaf0"; ctx.font = "bold 42px Arial"; ctx.fillText("双店排班表", 48, 58); ctx.font = "26px Arial"; ctx.fillText(`${shortDate(period.startDate)} — ${shortDate(period.endDate)} · 版本 ${period.version || "草稿"}`, 48, 103);
    const drawLegend = (x: number, color: string, label: string) => { ctx.fillStyle = color; ctx.fillRect(x, 154, 28, 22); ctx.strokeStyle = "#35283c"; ctx.lineWidth = 2; ctx.strokeRect(x, 154, 28, 22); ctx.fillStyle = "#35283c"; ctx.font = "bold 18px Arial"; ctx.fillText(label, x + 38, 172); };
    drawLegend(48, "#d7e2f2", "星光店"); drawLegend(190, "#d3ead2", "开元店"); drawLegend(332, "#fffaf0", "休息");
    ctx.fillStyle = "#35283c"; ctx.fillRect(20, tableTop, width - 40, 48); ctx.fillStyle = "#fffaf0"; ctx.font = "bold 19px Arial"; ctx.fillText("员工", 34, tableTop + 31);
    dates.forEach((date, index) => ctx.fillText(shortDate(date).replace("月", "/").replace("日", ""), nameWidth + index * columnWidth, tableTop + 31));
    ctx.fillText("工时", nameWidth + dates.length * columnWidth, tableTop + 31);
    people.forEach((person, row) => {
      const y = tableTop + 48 + row * rowHeight; const textY = y + 35;
      ctx.fillStyle = row % 2 ? "#eee8d5" : "#fffaf0"; ctx.fillRect(20, y, nameWidth - 20, rowHeight - 2);
      ctx.fillStyle = "#35283c"; ctx.font = "bold 20px Arial"; ctx.fillText(person.name, 34, textY);
      ctx.font = "17px Arial";
      dates.forEach((_, day) => {
        const slot = period.assignments.find((item) => item.day === day && item.staffId === person.id);
        const x = nameWidth + day * columnWidth;
        ctx.fillStyle = slot?.store === "星光店" ? "#d7e2f2" : slot?.store === "开元店" ? "#d3ead2" : "#fffaf0";
        ctx.fillRect(x - 10, y, columnWidth, rowHeight - 2);
        ctx.fillStyle = "#35283c";
        ctx.fillText(slot ? `${slot.store === "星光店" ? "星" : "开"}${shiftLabel(slot.shift).slice(0, 1)}` : "休", x, textY);
      });
      ctx.fillStyle = "#eee8d5"; ctx.fillRect(nameWidth + dates.length * columnWidth - 10, y, hoursWidth, rowHeight - 2);
      ctx.fillStyle = "#35283c"; ctx.font = "bold 18px Arial"; ctx.fillText(`${(staffHours.get(person.id) ?? 0).toFixed(2)}h`, nameWidth + dates.length * columnWidth, textY);
    });
    canvas.toBlob((blob) => blob && downloadBlob(blob, `${safeFilename(period.title)}-班表.png`), "image/png");
  };

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool || !period) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "read_current_schedule", title: "读取当前班表", description: "读取当前周期确认进度和排班异常。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ period: period.title, confirmed, total: activeStaff.length, warnings: period.warnings }) }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [period, confirmed, activeStaff.length]);

  if (!loaded) return <main className="loading-screen">正在连接云端班表…</main>;
  if (!period && !isManager) return <main className="public-empty"><div className="poster-strip" aria-hidden="true"><span /><span /><span /><span /><span /></div><section><CalendarDays /><h1>暂无已发布班表</h1><p>店长发布班表后，所有人在这里看到的都是同一份最新内容。</p><button onClick={() => setLoginOpen(true)}><LogIn />店长登录</button></section><ManagerLoginDialog open={loginOpen} onOpen={setLoginOpen} draft={loginDraft} setDraft={setLoginDraft} status={loginStatus} onSignIn={signInManager} onCreate={createManager} /></main>;
  if (!period) return <main className="loading-screen">正在准备排班工作台…</main>;

  if (!isManager) return (
    <main className="app-shell public-mode">
      <div className="poster-strip" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <header className="topbar"><div><p className="eyebrow">DUAL STORE / PUBLISHED SCHEDULE</p><h1>双店班表</h1></div><button className="session-button" onClick={() => setLoginOpen(true)}><LogIn />店长登录</button></header>
      <div className="period-switcher"><button onClick={() => setPeriodKey(previousPeriodKey(state, periodKey, -1) ?? periodKey)} aria-label="上一个周期"><ChevronLeft /></button><div className="period-title"><b>{period.title}</b><small>{shortDate(period.startDate)}—{shortDate(period.endDate)} · {dates.length}天</small></div><button onClick={() => setPeriodKey(previousPeriodKey(state, periodKey, 1) ?? periodKey)} aria-label="下一个周期"><ChevronRight /></button></div>
      <div className="save-line"><span>{saveStatus}</span><span>{period.status === "published" ? `已发布 V${period.version}` : "有临时调整"}</span></div>
      <div className="page-frame public-schedule"><SchedulePanel period={period} dates={dates} staff={state.staff} dayIndex={dayIndex} onDay={setDayIndex} view={scheduleView} onView={setScheduleView} onSlot={() => undefined} onRun={() => undefined} onUndo={() => undefined} canUndo={false} onPublish={() => undefined} hardWarnings={[]} onExportImage={exportImage} onExportExcel={exportExcel} readOnly /></div>
      <ManagerLoginDialog open={loginOpen} onOpen={setLoginOpen} draft={loginDraft} setDraft={setLoginDraft} status={loginStatus} onSignIn={signInManager} onCreate={createManager} />
    </main>
  );

  return (
    <main className="app-shell">
      <div className="poster-strip" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      <header className="topbar"><div><p className="eyebrow">DUAL STORE / MANAGER DESK</p><h1>双店排班助手</h1></div><div className="topbar-actions">{cloudConfigured && <button className="session-button" onClick={signOutManager}><LogOut />退出</button>}<button className="more-button" onClick={() => setMoreOpen(true)} aria-label="更多"><MoreHorizontal /></button></div></header>
      <div className="period-switcher"><button onClick={() => setPeriodKey(previousPeriodKey(state, periodKey, -1) ?? periodKey)} aria-label="上一个周期"><ChevronLeft /></button><button className="period-title" onClick={() => setMoreOpen(true)}><b>{period.title}</b><small>{shortDate(period.startDate)}—{shortDate(period.endDate)} · {dates.length}天</small></button><button onClick={() => setPeriodKey(previousPeriodKey(state, periodKey, 1) ?? periodKey)} aria-label="下一个周期"><ChevronRight /></button></div>
      <div className="save-line"><span className={saveStatus.includes("失败") ? "error" : ""}>{saveStatus}</span><span>{period.status === "published" ? `已发布 V${period.version}` : period.status === "adjusted" ? "有临时调整" : "草稿"}</span></div>

      <Tabs value={tab} onValueChange={setTab} className="app-tabs">
        <div className="page-frame">
          <TabsContent value="home" className="tab-panel"><HomePanel period={period} confirmed={confirmed} unconfirmed={unconfirmed} excluded={excluded} activeCount={activeStaff.length} hardWarnings={hardWarnings} softWarnings={softWarnings} onAvailability={() => setTab("availability")} onDemand={() => setTab("demand")} onSchedule={runSchedule} onWarnings={() => { setTab("schedule"); setScheduleView("daily"); }} onEditPeriod={openEditPeriod} /></TabsContent>
          <TabsContent value="availability" className="tab-panel"><AvailabilityPanel period={period} dates={dates} staff={activeStaff} onEdit={(staffId, day) => { const existing = period.customTimes[staffId]?.[day]?.[0]; setCustomDraft(existing ?? { start: "12:00", end: "18:00" }); setAvailabilityEditor({ staffId, day }); }} onWhole={setWholePeriod} onConfirm={confirmPerson} onParticipation={setParticipation} /></TabsContent>
          <TabsContent value="demand" className="tab-panel"><DemandPanel period={period} dates={dates} dayIndex={dayIndex} onDay={setDayIndex} onAdd={() => { setMiddleDraft({ day: dayIndex, store: "星光店", name: "中班", requirement: "ANY", headcount: 1, start: "12:00", end: "18:00", note: "" }); setMiddleOpen(true); }} onDelete={deleteMiddle} /></TabsContent>
          <TabsContent value="schedule" className="tab-panel"><SchedulePanel period={period} dates={dates} staff={state.staff} dayIndex={dayIndex} onDay={setDayIndex} view={scheduleView} onView={setScheduleView} onSlot={setEditingSlotId} onRun={runSchedule} onUndo={undo} canUndo={canUndo} onPublish={publish} hardWarnings={hardWarnings} onExportImage={exportImage} onExportExcel={exportExcel} /></TabsContent>
          <TabsContent value="team" className="tab-panel"><TeamPanel staff={state.staff} hours={staffHours} onAdd={() => setAddingStaff(true)} onEdit={setEditingStaff} /></TabsContent>
        </div>
        <TabsList className="bottom-nav"><TabsTrigger value="home"><LayoutGrid /><span>首页</span></TabsTrigger><TabsTrigger value="availability"><ClipboardCheck /><span>可排时间</span></TabsTrigger><TabsTrigger value="demand"><Clock3 /><span>班次需求</span></TabsTrigger><TabsTrigger value="schedule"><CalendarDays /><span>班表</span></TabsTrigger><TabsTrigger value="team"><UsersRound /><span>人员</span></TabsTrigger></TabsList>
      </Tabs>

      <Dialog open={periodOpen} onOpenChange={setPeriodOpen}><DialogContent className="editor-dialog"><PeriodEditor draft={periodDraft} setDraft={setPeriodDraft} editing={periodEditing} onSave={savePeriod} /></DialogContent></Dialog>
      <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importBackup} />
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>周期与工具</DialogTitle><DialogDescription>数据自动保存在当前设备，建议定期导出备份。</DialogDescription></DialogHeader><div className="menu-grid"><button onClick={() => { setMoreOpen(false); openNewPeriod(); }}><Plus />新建周期</button><button onClick={copyPeriodSettings}><Copy />复制周期设置</button><button onClick={() => { setMoreOpen(false); openEditPeriod(); }}><Settings2 />编辑当前周期</button><button onClick={() => { setMoreOpen(false); setActivityOpen(true); }}><History />操作记录</button><button onClick={exportImage}><ImageDown />生成长图</button><button onClick={exportExcel}><FileSpreadsheet />导出Excel</button><button onClick={exportBackup}><Download />备份全部数据</button><button onClick={() => importInput.current?.click()}><Upload />恢复备份</button><button onClick={undo} disabled={!canUndo}><RotateCcw />撤销上一项</button></div><div className="period-list"><b>历史周期</b>{Object.entries(state.periods).sort((a, b) => b[1].startDate.localeCompare(a[1].startDate)).map(([key, item]) => <button key={key} className={key === periodKey ? "active" : ""} onClick={() => { setPeriodKey(key); setMoreOpen(false); setDayIndex(0); }}><span>{item.title}<small>{shortDate(item.startDate)}—{shortDate(item.endDate)}</small></span><i>{item.status === "published" ? `V${item.version}` : "草稿"}</i></button>)}</div></DialogContent></Dialog>
      <Dialog open={activityOpen} onOpenChange={setActivityOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>操作记录</DialogTitle><DialogDescription>最近200项修改都会保留。</DialogDescription></DialogHeader><div className="activity-list">{period.activities.length ? period.activities.map((item) => <div key={item.id}><b>{item.label}</b><small>{new Date(item.at).toLocaleString("zh-CN")}</small></div>) : <p className="empty-copy">还没有操作记录。</p>}</div></DialogContent></Dialog>
      <Dialog open={!!availabilityEditor} onOpenChange={(open) => !open && setAvailabilityEditor(null)}><DialogContent className="editor-dialog">{availabilityEditor && <AvailabilityEditor staff={state.staff.find((person) => person.id === availabilityEditor.staffId)!} date={dates[availabilityEditor.day]} value={period.availability[availabilityEditor.staffId]?.[availabilityEditor.day] ?? "unconfirmed"} custom={customDraft} setCustom={setCustomDraft} onSelect={(value) => { if (value === "custom") return; setAvailability(availabilityEditor.staffId, availabilityEditor.day, value); setAvailabilityEditor(null); }} onSaveCustom={saveCustomTime} />}</DialogContent></Dialog>
      <Dialog open={middleOpen} onOpenChange={setMiddleOpen}><DialogContent className="editor-dialog"><MiddleEditor draft={middleDraft} setDraft={setMiddleDraft} dates={dates} onSave={addMiddle} /></DialogContent></Dialog>
      <Dialog open={!!editingSlot} onOpenChange={(open) => !open && setEditingSlotId(null)}><DialogContent className="editor-dialog">{editingSlot && <SlotEditor slot={editingSlot} date={dates[editingSlot.day]} candidates={candidateStaff} onSave={updateSlot} />}</DialogContent></Dialog>
      <Dialog open={!!editingStaff} onOpenChange={(open) => !open && setEditingStaff(null)}><DialogContent className="editor-dialog">{editingStaff && <StaffEditor person={editingStaff} onSave={updateStaff} />}</DialogContent></Dialog>
      <Dialog open={addingStaff} onOpenChange={setAddingStaff}><DialogContent className="editor-dialog"><StaffEditor person={{ id: "new-staff", name: "", store: "星光店", role: "BB", employment: "兼职", active: true }} adding onSave={addStaff} /></DialogContent></Dialog>
      <ManagerLoginDialog open={loginOpen} onOpen={setLoginOpen} draft={loginDraft} setDraft={setLoginDraft} status={loginStatus} onSignIn={signInManager} onCreate={createManager} />
    </main>
  );
}

function HomePanel({ period, confirmed, unconfirmed, excluded, activeCount, hardWarnings, softWarnings, onAvailability, onDemand, onSchedule, onWarnings, onEditPeriod }: { period: PeriodState; confirmed: number; unconfirmed: number; excluded: number; activeCount: number; hardWarnings: string[]; softWarnings: string[]; onAvailability: () => void; onDemand: () => void; onSchedule: () => void; onWarnings: () => void; onEditPeriod: () => void }) {
  const filled = period.assignments.filter((item) => item.staffId).length;
  return <><section className="dashboard-grid"><article className="hero-card readiness-card"><div className="lamp-geometry" aria-hidden="true"><span /><i /></div><p>本周准备度</p><strong>{confirmed}<em> / {activeCount}</em></strong><div className="readiness-breakdown"><span>已确认 {confirmed}</span><span>未确认 {unconfirmed}</span><span>不参与 {excluded}</span></div><button className="primary-action" onClick={onAvailability}>继续录入</button></article><article className="metric-card color-blue"><CalendarDays /><b>{filled}</b><span>已安排人次</span></article><article className="metric-card color-orange"><AlertTriangle /><b>{hardWarnings.length}</b><span>硬规则问题</span></article></section>
    <section className="period-card"><div><span>当前周期</span><b>{shortDate(period.startDate)}—{shortDate(period.endDate)}</b><small>{dateList(period.startDate, period.endDate).length}天 · {period.deadline ? `截止提醒 ${new Date(period.deadline).toLocaleString("zh-CN")}` : "未设置截止提醒"}</small></div><button onClick={onEditPeriod}>编辑日期</button></section>
    <section className="shortcut-grid"><button onClick={onAvailability}><ClipboardCheck /><b>录入可排时间</b><span>还有{unconfirmed}人待确认</span></button><button onClick={onDemand}><Clock3 /><b>设置中班</b><span>已有{period.middleShifts.length}个中班</span></button><button onClick={onSchedule}><Sparkles /><b>自动排班</b><span>生成当前周期草稿</span></button><button onClick={onWarnings}><ListChecks /><b>查看问题</b><span>{hardWarnings.length + softWarnings.length}条提醒</span></button></section>
    {(hardWarnings.length > 0 || softWarnings.length > 0) && <WarningPanel warnings={[...hardWarnings, ...softWarnings].slice(0, 5)} onMore={onWarnings} />}</>;
}

function AvailabilityPanel({ period, dates, staff, onEdit, onWhole, onConfirm, onParticipation }: { period: PeriodState; dates: string[]; staff: Staff[]; onEdit: (staffId: string, day: number) => void; onWhole: (staffId: string, value: Availability) => void; onConfirm: (staffId: string) => void; onParticipation: (staffId: string, value: Participation) => void }) {
  return <><div className="section-heading"><div><p className="section-kicker">01 / AVAILABILITY</p><h2>人员可排时间</h2><p>点击某天，一次选择白班、晚班或休息。</p></div></div><div className="legend">{availabilityOptions.map((item) => <i key={item.value} className={`status-${item.value}`}>{item.short}</i>)}</div><div className="people-list">{staff.map((person) => { const row = period.availability[person.id] ?? []; const status = period.participation[person.id] ?? "unconfirmed"; return <article className="availability-card" key={person.id}><div className="person-line"><div className="person-name"><b>{person.name}</b><span>{person.store} · {person.employment}{person.role}</span></div><span className={`participation participation-${status}`}>{participationLabel[status]}</span></div>{status !== "excluded" && <div className="date-status-scroll">{dates.map((date, index) => <button key={date} onClick={() => onEdit(person.id, index)} className={`date-status status-${row[index] ?? "unconfirmed"}`}><small>{dateLabel(date)}</small><b>{statusLabel[row[index] ?? "unconfirmed"]}</b></button>)}</div>}<div className="quick-row"><button onClick={() => onWhole(person.id, "all")}>全周期可排</button><button onClick={() => onWhole(person.id, "off")}>全周期休息</button>{status === "excluded" ? <button onClick={() => onParticipation(person.id, "unconfirmed")}>恢复参与</button> : <button onClick={() => onParticipation(person.id, "excluded")}>本期不参与</button>}</div>{status !== "excluded" && <button className={`confirm-person ${status === "confirmed" ? "done" : ""}`} onClick={() => onConfirm(person.id)}>{status === "confirmed" ? <><Check />已确认，点击重新检查</> : <><ClipboardCheck />完成录入并确认</>}</button>}</article>; })}</div></>;
}

function DemandPanel({ period, dates, dayIndex, onDay, onAdd, onDelete }: { period: PeriodState; dates: string[]; dayIndex: number; onDay: (day: number) => void; onAdd: () => void; onDelete: (id: string) => void }) {
  return <><div className="section-heading"><div><p className="section-kicker">02 / SHIFT NEEDS</p><h2>班次需求</h2><p>基础班固定两人，优先SS＋BB；缺BB时允许2SS。中班可以增加1—2人。</p></div><button className="small-action accent" onClick={onAdd}><Plus />加中班</button></div><DateStrip dates={dates} active={dayIndex} onChange={onDay} /><div className="store-stack">{stores.map((store, storeIndex) => <article className={`store-card store-${storeIndex}`} key={store}><div className="store-head"><div><StoreIcon /><b>{store}</b></div><span>基础4人</span></div><div className="demand-body">{(["early", "late"] as const).map((shift) => <div className="base-demand" key={shift}><span><b>{shiftLabel(shift)}</b><small>{shiftTimes[store][shift][0]}—{shiftTimes[store][shift][1]}</small></span><i>优先1SS＋1BB · 可2SS</i></div>)}{period.middleShifts.filter((item) => item.day === dayIndex && item.store === store).map((item) => <div className="middle-demand" key={item.id}><span><b>{item.name}</b><small>{item.start}—{item.end} · {item.headcount}人 · {requirementLabel(item.requirement)}</small></span><button onClick={() => onDelete(item.id)}>删除</button></div>)}{!period.middleShifts.some((item) => item.day === dayIndex && item.store === store) && <p className="empty-copy">当天没有额外中班。</p>}</div></article>)}</div></>;
}

function SchedulePanel({ period, dates, staff, dayIndex, onDay, view, onView, onSlot, onRun, onUndo, canUndo, onPublish, hardWarnings, onExportImage, onExportExcel, readOnly = false }: { period: PeriodState; dates: string[]; staff: Staff[]; dayIndex: number; onDay: (day: number) => void; view: "daily" | "week" | "period"; onView: (view: "daily" | "week" | "period") => void; onSlot: (id: string) => void; onRun: () => void; onUndo: () => void; canUndo: boolean; onPublish: () => void; hardWarnings: string[]; onExportImage: () => void; onExportExcel: () => void; readOnly?: boolean }) {
  const shownDates = view === "week" ? dates.slice(Math.floor(dayIndex / 7) * 7, Math.floor(dayIndex / 7) * 7 + 7) : dates;
  return <><div className="section-heading"><div><p className="section-kicker">03 / SCHEDULE</p><h2>两店班表</h2><p>{period.status === "published" ? `已发布 V${period.version}` : period.status === "adjusted" ? "已发布后存在临时调整" : "排班草稿"}</p></div></div><div className="view-switch"><button className={view === "daily" ? "active" : ""} onClick={() => onView("daily")}>每日班表</button><button className={view === "week" ? "active" : ""} onClick={() => onView("week")}>周视图</button><button className={view === "period" ? "active" : ""} onClick={() => onView("period")}>周期总览</button></div>
    {view === "daily" ? <><DateStrip dates={dates} active={dayIndex} onChange={onDay} /><div className="store-stack">{stores.map((store, index) => <StoreSchedule key={store} store={store} storeIndex={index} day={dayIndex} assignments={period.assignments} staff={staff} onSlot={onSlot} />)}</div></> : <RosterTable dates={shownDates} allDates={dates} staff={staff} assignments={period.assignments} />}
    <div className="schedule-toolbar">{!readOnly && <><button onClick={onRun}><Sparkles />自动排班</button><button onClick={onUndo} disabled={!canUndo}><RotateCcw />撤销</button></>}<button onClick={onExportImage}><ImageDown />长图</button><button onClick={onExportExcel}><Download />Excel</button></div>
    {!readOnly && <button className={`publish-button ${period.status === "published" ? "published" : ""}`} disabled={hardWarnings.length > 0} onClick={onPublish}>{hardWarnings.length ? `先处理 ${hardWarnings.length} 个硬规则问题` : period.status === "published" ? <><Lock />班表已发布并锁定</> : <><Check />发布并锁定班表</>}</button>}
    {period.warnings.length > 0 && <WarningPanel warnings={period.warnings} />}</>;
}

function TeamPanel({ staff, hours, onAdd, onEdit }: { staff: Staff[]; hours: Map<string, number>; onAdd: () => void; onEdit: (staff: Staff) => void }) {
  return <><div className="section-heading"><div><p className="section-kicker">04 / TEAM</p><h2>人员与工时</h2><p>蓝色为星光店，绿色为开元店。</p></div><button className="small-action accent" onClick={onAdd}><UserPlus />添加员工</button></div><div className="team-grid">{staff.map((person) => <button key={person.id} onClick={() => onEdit(person)} className={`team-card ${person.store === "星光店" ? "team-xingguang" : "team-kaiyuan"} ${person.active ? "" : "inactive"}`}><span className={`role-badge role-${person.role.toLowerCase()}`}>{person.role}</span><b>{person.name}</b><small>{person.store} · {person.employment}</small><strong>{(hours.get(person.id) ?? 0).toFixed(2)}<em>h</em></strong>{person.novice && !person.mature && <i>新员工</i>}{!person.active && <i>已停用</i>}</button>)}</div></>;
}

function DateStrip({ dates, active, onChange }: { dates: string[]; active: number; onChange: (day: number) => void }) { return <div className="date-strip">{dates.map((date, index) => <button key={date} className={index === active ? "active" : ""} onClick={() => onChange(index)}><b>{dateLabel(date).split(" ")[1]}</b><span>{parseDate(date).getDate()}</span><small>{parseDate(date).getMonth() + 1}月</small></button>)}</div>; }

function StoreSchedule({ store, storeIndex, day, assignments, staff, onSlot }: { store: Store; storeIndex: number; day: number; assignments: Assignment[]; staff: Staff[]; onSlot: (id: string) => void }) {
  const today = assignments.filter((item) => item.day === day && item.store === store);
  return <article className={`store-card store-${storeIndex}`}><div className="store-head"><div><StoreIcon /><b>{store}</b></div><span>{today.filter((item) => item.staffId).length}人已排</span></div><div className="shift-list">{(["early", "middle", "late"] as const).map((shift) => { const slots = today.filter((item) => item.shift === shift); if (shift === "middle" && !slots.length) return null; return <div className="shift-row" key={shift}><div className="shift-time"><b>{shiftLabel(shift)}</b><span>{slots[0] ? `${slots[0].start}—${slots[0].end}` : "待生成"}</span></div><div className="slot-group">{slots.length ? slots.map((slot) => { const person = staff.find((item) => item.id === slot.staffId); const roleLabel = person?.role ?? (slot.role === "ANY" ? "人" : slot.role); const missingLabel = !slot.middleId && slot.role === "BB" ? "SS或BB" : slot.role === "ANY" ? "1人" : slot.role; return <button key={slot.id} onClick={() => onSlot(slot.id)} className={`staff-slot ${person ? "filled" : "empty"}`}><i>{roleLabel}</i><span><b>{person?.name ?? `缺${missingLabel}`}</b><small>{person ? person.store === store ? person.employment : `${person.store}支援` : "需外店支援"}</small></span>{slot.locked && <Lock />}</button>; }) : <p className="empty-copy">请先生成班表</p>}</div></div>; })}</div></article>;
}

function RosterTable({ dates, allDates, staff, assignments }: { dates: string[]; allDates: string[]; staff: Staff[]; assignments: Assignment[] }) {
  return <div className="roster-wrap"><table className="roster-table"><thead><tr><th>员工</th>{dates.map((date) => <th key={date}>{dateLabel(date)}</th>)}<th>工时</th></tr></thead><tbody>{staff.filter((person) => person.active).map((person) => { const personAssignments = assignments.filter((item) => item.staffId === person.id); return <tr key={person.id}><th><b>{person.name}</b><small>{person.role} · {person.store}</small></th>{dates.map((date) => { const day = allDates.indexOf(date); const item = personAssignments.find((slot) => slot.day === day); return <td key={date} className={item ? `cell-${item.store === "星光店" ? "blue" : "green"}` : ""}>{item ? <><b>{item.store.slice(0, 2)}</b><span>{shiftLabel(item.shift)}</span></> : <span className="rest-cell">休</span>}</td>; })}<td><b>{personAssignments.reduce((sum, item) => sum + hoursFor(item), 0).toFixed(2)}</b></td></tr>; })}</tbody></table></div>;
}

function WarningPanel({ warnings, onMore }: { warnings: string[]; onMore?: () => void }) { return <section className="warning-panel"><div className="warning-head"><AlertTriangle /><b>排班提醒</b><span>{warnings.length}</span></div>{warnings.map((warning, index) => <p className={warning.startsWith("【硬】") ? "hard" : "soft"} key={`${warning}-${index}`}>{warning}</p>)}{onMore && <button onClick={onMore}>查看全部提醒</button>}</section>; }

function ManagerLoginDialog({ open, onOpen, draft, setDraft, status, onSignIn, onCreate }: { open: boolean; onOpen: (open: boolean) => void; draft: { email: string; password: string }; setDraft: (value: { email: string; password: string }) => void; status: string; onSignIn: () => void; onCreate: () => void }) {
  return <Dialog open={open} onOpenChange={onOpen}><DialogContent className="editor-dialog"><DialogHeader><DialogTitle>店长登录</DialogTitle><DialogDescription>员工直接查看已发布班表；只有店长登录后可以编辑。首次使用可创建唯一的店长账号。</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">邮箱<input type="email" autoComplete="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label><label className="wide">密码<input type="password" autoComplete="current-password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} /></label></div>{status && <p className="login-status">{status}</p>}<div className="login-actions"><button className="dialog-submit" onClick={onSignIn}>登录店长模式</button><button className="secondary-submit" onClick={onCreate}>首次创建店长账号</button></div></DialogContent></Dialog>;
}

function PeriodEditor({ draft, setDraft, editing, onSave }: { draft: { title: string; startDate: string; endDate: string; deadline: string }; setDraft: (draft: { title: string; startDate: string; endDate: string; deadline: string }) => void; editing: boolean; onSave: () => void }) { return <><DialogHeader><DialogTitle>{editing ? "编辑排班周期" : "新建排班周期"}</DialogTitle><DialogDescription>日期范围可以是任意天数，也可以跨周、跨月。</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">周期名称<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="留空将按日期生成" /></label><label>开始日期<input type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} /></label><label>结束日期<input type="date" min={draft.startDate} value={draft.endDate} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label><label className="wide">收集截止提醒<input type="datetime-local" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} /></label></div><button className="dialog-submit" onClick={onSave}>{editing ? "保存周期设置" : "创建并开始录入"}</button></>; }

function AvailabilityEditor({ staff, date, value, custom, setCustom, onSelect, onSaveCustom }: { staff: Staff; date: string; value: Availability; custom: TimeWindow; setCustom: (value: TimeWindow) => void; onSelect: (value: Availability) => void; onSaveCustom: () => void }) { return <><DialogHeader><DialogTitle>{staff.name} · {dateLabel(date)}</DialogTitle><DialogDescription>直接点选，不需要反复切换。</DialogDescription></DialogHeader><div className="status-rail">{availabilityOptions.filter((item) => item.value !== "custom").map((item) => <button key={item.value} onClick={() => onSelect(item.value)} className={`status-${item.value} ${value === item.value ? "selected" : ""}`}><b>{item.short}</b><span>{item.label}</span></button>)}</div><div className="custom-time-box"><b>自定义可上时间</b><div><label>开始<input type="time" value={custom.start} onChange={(event) => setCustom({ ...custom, start: event.target.value })} /></label><label>结束<input type="time" value={custom.end} onChange={(event) => setCustom({ ...custom, end: event.target.value })} /></label></div><button onClick={onSaveCustom}>保存自定义时间</button></div></>; }

function MiddleEditor({ draft, setDraft, dates, onSave }: { draft: Omit<MiddleShift, "id">; setDraft: (value: Omit<MiddleShift, "id">) => void; dates: string[]; onSave: () => void }) { return <><DialogHeader><DialogTitle>添加中班</DialogTitle><DialogDescription>时间、人数和角色要求都可以自由设置。</DialogDescription></DialogHeader><div className="form-grid"><label>日期<select value={draft.day} onChange={(event) => setDraft({ ...draft, day: Number(event.target.value) })}>{dates.map((date, index) => <option value={index} key={date}>{dateLabel(date)}</option>)}</select></label><label>门店<select value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value as Store })}>{stores.map((store) => <option key={store}>{store}</option>)}</select></label><label className="wide">名称<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>开始<input type="time" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></label><label>结束<input type="time" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></label><label>需要人数<select value={draft.headcount} onChange={(event) => setDraft({ ...draft, headcount: Number(event.target.value) as 1 | 2 })}><option value={1}>1人</option><option value={2}>2人</option></select></label><label>人员要求<select value={draft.requirement} onChange={(event) => setDraft({ ...draft, requirement: event.target.value as MiddleShift["requirement"], headcount: event.target.value === "SS_BB" ? 2 : draft.headcount })}><option value="ANY">身份不限</option><option value="SS">至少1名SS</option><option value="BB">至少1名BB</option><option value="SS_BB">1SS＋1BB</option></select></label><label className="wide">备注<input value={draft.note ?? ""} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="例如：周末高峰" /></label></div><button className="dialog-submit" onClick={onSave}>保存中班</button></>; }

function SlotEditor({ slot, date, candidates, onSave }: { slot: Assignment; date: string; candidates: Staff[]; onSave: (staffId: string | null) => void }) { const need = !slot.middleId && slot.role === "BB" ? "优先BB，缺BB可选SS" : slot.role === "ANY" ? "1人" : slot.role; return <><DialogHeader><DialogTitle>调整{shiftLabel(slot.shift)}</DialogTitle><DialogDescription>{dateLabel(date)} · {slot.store} · 需要{need}</DialogDescription></DialogHeader><div className="candidate-list"><button onClick={() => onSave(null)} className="empty-candidate">暂时空缺</button>{candidates.map((person) => <button key={person.id} onClick={() => onSave(person.id)}><span><b>{person.name}</b><small>{person.store} · {person.employment}{person.role}</small></span>{person.store !== slot.store && <i>跨店</i>}</button>)}</div></>; }

function StaffEditor({ person, adding, onSave }: { person: Staff; adding?: boolean; onSave: (person: Staff) => void }) { const [draft, setDraft] = useState(person); return <><DialogHeader><DialogTitle>{adding ? "添加新员工" : "编辑人员条件"}</DialogTitle><DialogDescription>人员状态可以随时修改，停用后仍保留历史班表。</DialogDescription></DialogHeader><div className="form-grid"><label className="wide">姓名<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>所属门店<select value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value as Store })}>{stores.map((store) => <option key={store}>{store}</option>)}</select></label><label>角色<select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}><option>SS</option><option>BB</option></select></label><label>类型<select value={draft.employment} onChange={(event) => setDraft({ ...draft, employment: event.target.value as Staff["employment"] })}><option>全职</option><option>兼职</option></select></label><label>个人偏好<select value={draft.preference ?? "none"} onChange={(event) => setDraft({ ...draft, preference: event.target.value === "early" ? "early" : undefined })}><option value="none">无特别偏好</option><option value="early">优先白班</option></select></label><label className="wide">备注<input value={draft.note ?? ""} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label></div><label className="switch-line"><span><b>当前启用</b><small>关闭后不参与新周期排班</small></span><Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} /></label><label className="switch-line"><span><b>新员工</b><small>成熟前优先由全职SS带班</small></span><Switch checked={draft.novice ?? false} onCheckedChange={(novice) => setDraft({ ...draft, novice, mature: novice ? draft.mature : false })} /></label>{draft.novice && <label className="switch-line"><span><b>已经成熟</b><small>开启后取消全职SS优先提醒</small></span><Switch checked={draft.mature ?? false} onCheckedChange={(mature) => setDraft({ ...draft, mature })} /></label>}<label className="switch-line"><span><b>允许跨店支援</b><small>缺人时加入另一家店候选名单</small></span><Switch checked={draft.canCrossStore ?? true} onCheckedChange={(canCrossStore) => setDraft({ ...draft, canCrossStore })} /></label><button className="dialog-submit" disabled={!draft.name.trim()} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>{adding ? "添加并开始使用" : "保存人员资料"}</button></>; }

function requirementLabel(value: MiddleShift["requirement"]) { return value === "ANY" ? "身份不限" : value === "SS_BB" ? "1SS＋1BB" : `至少1名${value}`; }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function previousPeriodKey(state: AppState, current: string, offset: -1 | 1) { const entries = Object.entries(state.periods).sort((a, b) => a[1].startDate.localeCompare(b[1].startDate)); const index = entries.findIndex(([key]) => key === current); return entries[index + offset]?.[0]; }
