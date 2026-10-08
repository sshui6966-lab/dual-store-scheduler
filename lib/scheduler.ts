export type Store = "星光店" | "开元店";
export type Role = "SS" | "BB";
export type SlotRole = Role | "ANY";
export type Employment = "全职" | "兼职";
export type Availability = "unconfirmed" | "all" | "off" | "early" | "late" | "custom";
export type Participation = "unconfirmed" | "confirmed" | "excluded";
export type ShiftKind = "early" | "late" | "middle";
export type PeriodStatus = "collecting" | "draft" | "published" | "adjusted";

export type TimeWindow = { start: string; end: string };
export type Staff = { id: string; name: string; store: Store; role: Role; employment: Employment; novice?: boolean; mature?: boolean; canCrossStore?: boolean; preference?: "early"; note?: string; active: boolean };
export type MiddleShift = { id: string; day: number; store: Store; name: string; requirement: "ANY" | "SS" | "BB" | "SS_BB"; headcount: 1 | 2; start: string; end: string; note?: string };
export type Assignment = { id: string; day: number; store: Store; shift: ShiftKind; role: SlotRole; start: string; end: string; staffId: string | null; locked: boolean; middleId?: string; customTime?: boolean };
export type Activity = { id: string; at: string; label: string };
export type PeriodState = { id: string; title: string; startDate: string; endDate: string; deadline?: string; availability: Record<string, Availability[]>; customTimes: Record<string, Record<number, TimeWindow[]>>; participation: Record<string, Participation>; middleShifts: MiddleShift[]; assignments: Assignment[]; warnings: string[]; status: PeriodStatus; version: number; publishedAt?: string; activities: Activity[] };
export type AppState = { version: 2; staff: Staff[]; periods: Record<string, PeriodState> };

export const stores: Store[] = ["星光店", "开元店"];
export const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const defaultStaff: Staff[] = [
  { id: "jennifer", name: "Jennifer", store: "星光店", role: "SS", employment: "全职", canCrossStore: true, active: true },
  { id: "rachel", name: "Rachel", store: "星光店", role: "SS", employment: "全职", active: true },
  { id: "dandan", name: "dandan", store: "星光店", role: "SS", employment: "全职", preference: "early", active: true },
  { id: "lisir", name: "lisir", store: "星光店", role: "SS", employment: "兼职", active: true },
  { id: "allen", name: "Allen", store: "星光店", role: "SS", employment: "兼职", active: true },
  { id: "shuanglin", name: "双林", store: "星光店", role: "BB", employment: "全职", active: true },
  { id: "mieleven", name: "mieleven", store: "星光店", role: "BB", employment: "兼职", active: true },
  { id: "sia", name: "sia", store: "星光店", role: "BB", employment: "兼职", active: true },
  { id: "nemo", name: "nemo", store: "开元店", role: "SS", employment: "全职", active: true },
  { id: "yaki", name: "yaki", store: "开元店", role: "SS", employment: "全职", active: true },
  { id: "fox", name: "fox", store: "开元店", role: "SS", employment: "兼职", active: true },
  { id: "demo", name: "demo", store: "开元店", role: "BB", employment: "兼职", active: true },
  { id: "harper", name: "harper", store: "开元店", role: "BB", employment: "兼职", novice: true, mature: false, active: true },
  { id: "ivy", name: "ivy", store: "开元店", role: "BB", employment: "兼职", novice: true, mature: false, active: true },
  { id: "daz", name: "daz", store: "开元店", role: "BB", employment: "兼职", active: true },
  { id: "bobo", name: "bobo", store: "开元店", role: "BB", employment: "兼职", active: true },
];
export const shiftTimes: Record<Store, Record<"early" | "late", [string, string]>> = { 星光店: { early: ["07:15", "16:15"], late: ["13:15", "21:30"] }, 开元店: { early: ["06:15", "14:45"], late: ["14:30", "22:30"] } };

export function isoDate(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function parseDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); }
export function dateList(startDate: string, endDate: string) { const start = parseDate(startDate); const end = parseDate(endDate); const result: string[] = []; for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) result.push(isoDate(cursor)); return result; }
export function shortDate(value: string) { const date = parseDate(value); return `${date.getMonth() + 1}月${date.getDate()}日`; }
export function dateLabel(value: string) { const date = parseDate(value); return `${date.getMonth() + 1}.${date.getDate()} ${weekdays[date.getDay()]}`; }

export function emptyPeriod(staff: Staff[], startDate: string, endDate: string, title?: string): PeriodState {
  const length = dateList(startDate, endDate).length;
  return { id: `period-${startDate}-${Date.now()}`, title: title || `${shortDate(startDate)}—${shortDate(endDate)}`, startDate, endDate, availability: Object.fromEntries(staff.map((person) => [person.id, Array<Availability>(length).fill("unconfirmed")])), customTimes: {}, participation: Object.fromEntries(staff.map((person) => [person.id, "unconfirmed"])), middleShifts: [], assignments: [], warnings: [], status: "collecting", version: 0, activities: [] };
}
export function initialState(): AppState { return { version: 2, staff: defaultStaff, periods: {} }; }

export function publicScheduleState(state: AppState): AppState {
  const staff = state.staff.filter((person) => person.active).map((person) => ({
    id: person.id,
    name: person.name,
    store: person.store,
    role: person.role,
    employment: person.employment,
    active: true,
  }));
  const periods = Object.fromEntries(Object.entries(state.periods)
    .filter(([, period]) => period.status === "published" || period.status === "adjusted")
    .map(([key, period]) => [key, {
      ...period,
      deadline: undefined,
      availability: {},
      customTimes: {},
      participation: {},
      warnings: [],
      activities: [],
    }]));
  return { version: 2, staff, periods };
}

type LegacyWeek = { availability?: Record<string, Availability[]>; middleShifts?: Array<Partial<MiddleShift> & { role?: Role }>; assignments?: Assignment[]; warnings?: string[]; published?: boolean };
export function migrateState(raw: unknown): AppState {
  if (!raw || typeof raw !== "object") return initialState();
  const source = raw as { version?: number; staff?: Staff[]; periods?: Record<string, PeriodState>; weeks?: Record<string, LegacyWeek> };
  const staff = (source.staff?.length ? source.staff : defaultStaff).map((person) => person.id === "sia" ? { ...person, store: "星光店" as Store } : person);
  if (source.version === 2 && source.periods) return { version: 2, staff, periods: Object.fromEntries(Object.entries(source.periods).map(([key, period]) => [key, normalizePeriod(period, staff)])) };
  const periods: Record<string, PeriodState> = {};
  Object.entries(source.weeks ?? {}).forEach(([startDate, week]) => {
    const end = parseDate(startDate); end.setDate(end.getDate() + 6);
    const period = emptyPeriod(staff, startDate, isoDate(end));
    period.id = `legacy-${startDate}`; period.title = `${shortDate(startDate)}起原周班表`;
    period.availability = Object.fromEntries(staff.map((person) => [person.id, week.availability?.[person.id] ?? Array<Availability>(7).fill("unconfirmed")]));
    period.participation = Object.fromEntries(staff.map((person) => [person.id, period.availability[person.id].every((item) => item !== "unconfirmed") ? "confirmed" : "unconfirmed"]));
    period.middleShifts = (week.middleShifts ?? []).map((slot) => ({ id: slot.id ?? `middle-${Date.now()}`, day: slot.day ?? 0, store: slot.store ?? "星光店", name: slot.name ?? "中班", requirement: slot.role ?? slot.requirement ?? "ANY", headcount: slot.headcount ?? 1, start: slot.start ?? "12:00", end: slot.end ?? "18:00" }));
    period.assignments = week.assignments ?? []; period.warnings = week.warnings ?? []; period.status = week.published ? "published" : "draft";
    periods[startDate] = period;
  });
  return { version: 2, staff, periods };
}

function normalizePeriod(period: PeriodState, staff: Staff[]): PeriodState {
  const length = dateList(period.startDate, period.endDate).length;
  return { ...period, customTimes: period.customTimes ?? {}, participation: period.participation ?? Object.fromEntries(staff.map((person) => [person.id, "unconfirmed"])), status: period.status ?? "draft", version: period.version ?? 0, activities: period.activities ?? [], availability: Object.fromEntries(staff.map((person) => { const current = period.availability?.[person.id] ?? []; return [person.id, Array.from({ length }, (_, index) => current[index] ?? "unconfirmed")]; })) };
}

function minutes(value: string) { const [hours, mins] = value.split(":").map(Number); return hours * 60 + mins; }
function availabilityMatch(period: PeriodState, staffId: string, day: number, shift: ShiftKind, start: string, end: string): { adjusted: boolean; window?: TimeWindow } | null {
  const value = period.availability[staffId]?.[day] ?? "unconfirmed";
  if (value === "all") return { adjusted: false };
  if (value === "custom") {
    const windows = period.customTimes[staffId]?.[day] ?? [];
    if (windows.some((window) => minutes(window.start) <= minutes(start) && minutes(window.end) >= minutes(end))) return { adjusted: false };
    if (shift === "middle") return null;
    const matches = windows.filter((window) => shift === "early"
      ? minutes(window.start) <= minutes(start) && minutes(window.end) > minutes(start)
      : minutes(window.end) >= minutes(end) && minutes(window.start) < minutes(end));
    const window = matches.sort((a, b) => shift === "early" ? minutes(b.end) - minutes(a.end) : minutes(a.start) - minutes(b.start))[0];
    return window ? { adjusted: true, window } : null;
  }
  if (shift === "middle") return null;
  return value === shift ? { adjusted: false } : null;
}
function maxConsecutive(daysWorked: Set<number>, dayCount: number) { let best = 0; let run = 0; for (let day = 0; day < dayCount; day += 1) { if (daysWorked.has(day)) { run += 1; best = Math.max(best, run); } else run = 0; } return best; }
function slotGroup(slot: Assignment) { return `${slot.day}-${slot.store}-${slot.shift}-${slot.middleId ?? "base"}`; }
export function hoursFor(assignment: Assignment) { return Math.max(0, (minutes(assignment.end) - minutes(assignment.start)) / 60); }

export function generateSchedule(staff: Staff[], period: PeriodState) {
  const dates = dateList(period.startDate, period.endDate);
  const fullTimeTarget = Math.min(dates.length, Math.ceil(dates.length * 5 / 7));
  const active = staff.filter((person) => person.active && period.participation[person.id] !== "excluded");
  const unconfirmed = active.filter((person) => period.participation[person.id] !== "confirmed" || (period.availability[person.id] ?? []).some((value) => value === "unconfirmed"));
  if (unconfirmed.length) return { assignments: period.assignments, warnings: [`【硬】以下人员信息尚未确认：${unconfirmed.map((person) => person.name).join("、")}`] };

  const standard: Assignment[] = [];
  for (let day = 0; day < dates.length; day += 1) for (const store of stores) for (const shift of ["early", "late"] as const) { const [start, end] = shiftTimes[store][shift]; for (const role of ["SS", "BB"] as const) standard.push({ id: `${day}-${store}-${shift}-${role}`, day, store, shift, role, start, end, staffId: null, locked: false }); }
  const middle = period.middleShifts.flatMap<Assignment>((item) => {
    const requiredRole: SlotRole = item.requirement === "SS" || item.requirement === "BB" ? item.requirement : "ANY";
    const roles: SlotRole[] = item.requirement === "SS_BB" ? ["SS", "BB"] : Array.from({ length: item.headcount }, (_, index) => index === 0 ? requiredRole : "ANY");
    return roles.map((role, index) => ({ id: `${item.id}-${index}`, day: item.day, store: item.store, shift: "middle", role, start: item.start, end: item.end, staffId: null, locked: false, middleId: item.id }));
  });
  const previous = new Map(period.assignments.map((item) => [item.id, item]));
  const assignments = [...standard, ...middle].map((slot) => { const existing = previous.get(slot.id); return existing?.locked ? { ...slot, staffId: existing.staffId, locked: true, start: existing.start, end: existing.end, customTime: existing.customTime } : slot; });
  const usedByDay = new Map<number, Set<string>>(); const workedDays = new Map<string, Set<number>>(); const counts = new Map<string, number>(); const shiftCounts = new Map<string, { early: number; late: number }>(); const lastShift = new Map<string, { day: number; shift: ShiftKind }>(); const warnings: string[] = [];
  const record = (slot: Assignment, staffId: string) => { if (!usedByDay.has(slot.day)) usedByDay.set(slot.day, new Set()); usedByDay.get(slot.day)!.add(staffId); if (!workedDays.has(staffId)) workedDays.set(staffId, new Set()); workedDays.get(staffId)!.add(slot.day); counts.set(staffId, (counts.get(staffId) ?? 0) + 1); const mix = shiftCounts.get(staffId) ?? { early: 0, late: 0 }; if (slot.shift === "early") mix.early += 1; if (slot.shift === "late") mix.late += 1; shiftCounts.set(staffId, mix); lastShift.set(staffId, { day: slot.day, shift: slot.shift }); };
  const rebuildStats = () => { usedByDay.clear(); workedDays.clear(); counts.clear(); shiftCounts.clear(); lastShift.clear(); assignments.filter((slot) => slot.staffId).sort((a, b) => a.day - b.day || minutes(a.start) - minutes(b.start)).forEach((slot) => record(slot, slot.staffId!)); };
  const requestedDays = (person: Staff) => (period.availability[person.id] ?? []).filter((value, day) => value === "all" || value === "early" || value === "late" || (value === "custom" && (period.customTimes[person.id]?.[day]?.length ?? 0) > 0)).length;
  const isStefan = (person: Staff) => person.id === "shuanglin" || person.name.trim().toLowerCase() === "stefan" || person.name.trim() === "双林";
  const isNemo = (person: Staff) => person.id === "nemo" || person.name.trim().toLowerCase() === "nemo";
  const conflictsWithGroup = (person: Staff, grouped: Assignment[]) => grouped.some((other) => { const colleague = staff.find((candidate) => candidate.id === other.staffId); return colleague && ((isStefan(person) && isNemo(colleague)) || (isNemo(person) && isStefan(colleague))); });
  assignments.filter((slot) => slot.locked && slot.staffId).forEach((slot) => record(slot, slot.staffId!));
  const choose = (slot: Assignment) => {
    const grouped = assignments.filter((other) => slotGroup(other) === slotGroup(slot) && other.staffId);
    const hasBB = grouped.some((other) => staff.find((person) => person.id === other.staffId)?.role === "BB");
    const fullTimeLeader = grouped.some((other) => { const person = staff.find((candidate) => candidate.id === other.staffId); return person?.role === "SS" && person.employment === "全职"; });
    const rank = (roles: Role[]) => active.filter((person) => roles.includes(person.role)).filter((person) => !(usedByDay.get(slot.day)?.has(person.id))).filter((person) => !(person.role === "BB" && hasBB)).filter((person) => availabilityMatch(period, person.id, slot.day, slot.shift, slot.start, slot.end)).filter((person) => { const proposed = new Set(workedDays.get(person.id) ?? []); proposed.add(slot.day); return maxConsecutive(proposed, dates.length) <= 6; }).map((person) => {
      const total = counts.get(person.id) ?? 0;
      const desired = Math.max(1, requestedDays(person));
      const mix = shiftCounts.get(person.id) ?? { early: 0, late: 0 };
      const projectedEarly = mix.early + (slot.shift === "early" ? 1 : 0);
      const projectedLate = mix.late + (slot.shift === "late" ? 1 : 0);
      const prior = lastShift.get(person.id);
      return {
        person,
        // This is a real priority tier, not one more additive score: an
        // under-filled part timer always ranks ahead of a full timer.
        workTier: person.employment === "兼职" && total < desired ? 0 : person.employment === "全职" && total < fullTimeTarget ? 1 : 2,
        fulfillment: person.employment === "兼职" ? total / desired : total,
        lateToEarly: prior?.day === slot.day - 1 && prior.shift === "late" && slot.shift === "early" ? 1 : 0,
        pairingConflict: conflictsWithGroup(person, grouped) ? 1 : 0,
        imbalance: Math.abs(projectedEarly - projectedLate),
        noviceWithoutFullTimeLeader: person.novice && !person.mature && !fullTimeLeader ? 1 : 0,
        preferenceMiss: person.preference === "early" && slot.shift === "late" ? 1 : 0,
        crossStore: person.store === slot.store || person.id === "jennifer" ? 0 : 1,
        total,
      };
    }).sort((a, b) => a.workTier - b.workTier
      || a.fulfillment - b.fulfillment
      || a.lateToEarly - b.lateToEarly
      || a.pairingConflict - b.pairingConflict
      || a.imbalance - b.imbalance
      || a.noviceWithoutFullTimeLeader - b.noviceWithoutFullTimeLeader
      || a.preferenceMiss - b.preferenceMiss
      || a.crossStore - b.crossStore
      || a.total - b.total
      || a.person.name.localeCompare(b.person.name))[0]?.person;
    const preferredRoles: Role[] = slot.role === "ANY" ? ["SS", "BB"] : [slot.role];
    const preferred = rank(preferredRoles);
    if (preferred) return preferred;
    if (!slot.middleId && slot.role === "BB") return rank(["SS"]);
  };
  const openSlots = assignments.filter((slot) => !slot.locked).sort((a, b) => a.day - b.day || (a.role === "SS" ? -1 : a.role === "BB" ? 1 : 0));
  for (const slot of openSlots) { const selected = choose(slot); if (selected) { slot.staffId = selected.id; const match = availabilityMatch(period, selected.id, slot.day, slot.shift, slot.start, slot.end); if (match?.adjusted && match.window) { slot.start = match.window.start; slot.end = match.window.end; slot.customTime = true; } record(slot, selected.id); } }
  // Full-period audit: if an unlocked full-time assignment can be handed to
  // an under-filled, same-role part timer without breaking a hard rule, do it.
  // This catches any locally-greedy choice that survived the first pass.
  let changed = true;
  while (changed) {
    changed = false;
    rebuildStats();
    const fullTimeSlots = assignments.filter((slot) => !slot.locked && !slot.middleId && slot.staffId && staff.find((person) => person.id === slot.staffId)?.employment === "全职");
    for (const slot of fullTimeSlots) {
      const current = staff.find((person) => person.id === slot.staffId);
      if (!current) continue;
      const [baseStart, baseEnd] = shiftTimes[slot.store][slot.shift as "early" | "late"];
      const candidates = active.filter((person) => person.employment === "兼职" && person.role === current.role)
        .filter((person) => (counts.get(person.id) ?? 0) < requestedDays(person))
        .filter((person) => !(usedByDay.get(slot.day)?.has(person.id)))
        .filter((person) => availabilityMatch(period, person.id, slot.day, slot.shift, baseStart, baseEnd))
        .filter((person) => { const proposed = new Set(workedDays.get(person.id) ?? []); proposed.add(slot.day); return maxConsecutive(proposed, dates.length) <= 6; })
        .sort((a, b) => ((counts.get(a.id) ?? 0) / Math.max(1, requestedDays(a))) - ((counts.get(b.id) ?? 0) / Math.max(1, requestedDays(b))) || a.name.localeCompare(b.name));
      const replacement = candidates[0];
      if (!replacement) continue;
      slot.staffId = replacement.id;
      slot.start = baseStart;
      slot.end = baseEnd;
      slot.customTime = false;
      const match = availabilityMatch(period, replacement.id, slot.day, slot.shift, baseStart, baseEnd);
      if (match?.adjusted && match.window) { slot.start = match.window.start; slot.end = match.window.end; slot.customTime = true; }
      changed = true;
      break;
    }
  }
  rebuildStats();
  const bridgeDetails = new Map<string, string>();
  for (let day = 0; day < dates.length; day += 1) for (const store of stores) for (const role of ["SS", "BB"] as const) {
    const early = assignments.find((slot) => slot.day === day && slot.store === store && slot.shift === "early" && slot.role === role);
    const late = assignments.find((slot) => slot.day === day && slot.store === store && slot.shift === "late" && slot.role === role);
    if (!early?.staffId || !late?.staffId) continue;
    const earlyPerson = staff.find((person) => person.id === early.staffId);
    const latePerson = staff.find((person) => person.id === late.staffId);
    if (minutes(early.end) < minutes(late.start)) {
      if (early.customTime && !late.customTime) {
        late.start = early.end;
        bridgeDetails.set(early.id, `晚班${latePerson?.role ?? role} ${latePerson?.name ?? "人员"}需调整为${early.end}到店`);
      } else if (late.customTime && !early.customTime) {
        early.end = late.start;
        bridgeDetails.set(late.id, `白班${earlyPerson?.role ?? role} ${earlyPerson?.name ?? "人员"}需调整为${late.start}下班`);
      } else warnings.push(`【硬】${dateLabel(dates[day])}｜${store}｜${earlyPerson?.role ?? role}在${early.end}–${late.start}无人覆盖，需要调整时间或向外店寻求${earlyPerson?.role ?? role}支援。`);
    }
  }
  const shortageGroups = new Map<string, Assignment[]>();
  assignments.filter((slot) => !slot.staffId).forEach((slot) => { const key = slotGroup(slot); shortageGroups.set(key, [...(shortageGroups.get(key) ?? []), slot]); });
  shortageGroups.forEach((slots) => {
    const first = slots[0];
    const group = assignments.filter((slot) => slotGroup(slot) === slotGroup(first));
    const isBaseShift = !first.middleId && (first.shift === "early" || first.shift === "late");
    const filledRoles = group.flatMap((slot) => { const person = staff.find((candidate) => candidate.id === slot.staffId); return person ? [person.role] : []; });
    const ss = slots.filter((slot) => slot.role === "SS").length; const bb = slots.filter((slot) => slot.role === "BB").length; const any = slots.filter((slot) => slot.role === "ANY").length;
    const needs = isBaseShift
      ? filledRoles.includes("SS")
        ? `${slots.length}名SS或BB`
        : slots.length === 1 ? "1名SS" : `${slots.length}名人员（至少1名SS，另一名SS或BB均可）`
      : [ss ? `${ss}名SS` : "", bb ? `${bb}名BB` : "", any ? `${any}名人员` : ""].filter(Boolean).join("、");
    const middleName = first.middleId ? period.middleShifts.find((item) => item.id === first.middleId)?.name : undefined;
    warnings.push(`【硬】${dateLabel(dates[first.day])}｜${first.store}｜${middleName ?? shiftLabel(first.shift)}：两店现有人员均无法覆盖，需向外店寻求${needs}支援。`);
  });
  const baseGroups = new Map<string, Assignment[]>();
  assignments.filter((slot) => !slot.middleId && (slot.shift === "early" || slot.shift === "late")).forEach((slot) => { const key = slotGroup(slot); baseGroups.set(key, [...(baseGroups.get(key) ?? []), slot]); });
  baseGroups.forEach((slots) => {
    if (slots.length !== 2 || slots.some((slot) => !slot.staffId)) return;
    const roles = slots.map((slot) => staff.find((person) => person.id === slot.staffId)?.role);
    if (roles.every((role) => role === "SS")) warnings.push(`【提醒】${dateLabel(dates[slots[0].day])}｜${slots[0].store}｜${shiftLabel(slots[0].shift)}：暂无可用BB，已由2名SS覆盖。`);
    const people = slots.flatMap((slot) => { const person = staff.find((candidate) => candidate.id === slot.staffId); return person ? [person] : []; });
    if (people.some(isStefan) && people.some(isNemo)) warnings.push(`【提醒】${dateLabel(dates[slots[0].day])}｜${slots[0].store}｜${shiftLabel(slots[0].shift)}：Stefan（双林）与nemo因班次覆盖需要同班。`);
  });
  assignments.filter((slot) => slot.staffId && slot.customTime).forEach((slot) => {
    const person = staff.find((candidate) => candidate.id === slot.staffId);
    const bridge = bridgeDetails.get(slot.id);
    warnings.push(`【注意】${person?.name ?? "员工"} ${dateLabel(dates[slot.day])}可上${slot.start}–${slot.end}，已安排${slot.store.replace("店", "")}${shiftLabel(slot.shift)}；与标准时间不完全一致，${bridge ? `${bridge}，` : ""}请协商上下班时间。`);
  });
  assignments.filter((slot) => slot.staffId).forEach((slot) => { const person = staff.find((candidate) => candidate.id === slot.staffId); if (!person?.novice || person.mature) return; const leader = assignments.find((other) => slotGroup(other) === slotGroup(slot) && other.staffId && staff.find((candidate) => candidate.id === other.staffId)?.role === "SS"); const leaderPerson = staff.find((candidate) => candidate.id === leader?.staffId); if (leaderPerson && leaderPerson.employment !== "全职") warnings.push(`【注意】${dateLabel(dates[slot.day])}｜${slot.store}｜${shiftLabel(slot.shift)}：新员工${person.name}由兼职SS ${leaderPerson.name}带班。`); });
  active.filter((person) => person.employment === "全职").forEach((person) => { const total = counts.get(person.id) ?? 0; if (total < fullTimeTarget) warnings.push(`${total <= Math.max(0, fullTimeTarget - 2) ? "【注意】" : "【提醒】"}${person.name} 本周期安排 ${total} 天，低于全职 ${fullTimeTarget} 天参考目标。`); if (total > fullTimeTarget) warnings.push(`【注意】${person.name} 本周期安排 ${total} 天，已超过全职 ${fullTimeTarget} 天参考目标；当前没有可直接替换的同角色兼职，请确认工作量和连续工作天数。`); });
  active.forEach((person) => { const mix = shiftCounts.get(person.id) ?? { early: 0, late: 0 }; if (mix.early + mix.late >= 2 && Math.abs(mix.early - mix.late) >= 2) warnings.push(`【提醒】${person.name} 本周期白班${mix.early}次、晚班${mix.late}次，因覆盖或班次衔接未能完全均分。`); });
  assignments.filter((slot) => slot.staffId && slot.shift === "early").forEach((slot) => { if (assignments.some((other) => other.staffId === slot.staffId && other.day === slot.day - 1 && other.shift === "late")) warnings.push(`【注意】${staff.find((person) => person.id === slot.staffId)?.name}存在晚班接次日白班（${dateLabel(dates[slot.day])}）。`); });
  return { assignments, warnings };
}
export function shiftLabel(shift: ShiftKind) { return shift === "early" ? "白班" : shift === "late" ? "晚班" : "中班"; }
