export type Store = "星光店" | "开元店";
export type Role = "SS" | "BB";
export type Employment = "全职" | "兼职";
export type Availability = "unconfirmed" | "all" | "off" | "early" | "late";
export type ShiftKind = "early" | "late" | "middle";

export type Staff = {
  id: string;
  name: string;
  store: Store;
  role: Role;
  employment: Employment;
  novice?: boolean;
  mature?: boolean;
  preference?: "early";
  active: boolean;
};

export type MiddleShift = {
  id: string;
  day: number;
  store: Store;
  role: Role;
  start: string;
  end: string;
};

export type Assignment = {
  id: string;
  day: number;
  store: Store;
  shift: ShiftKind;
  role: Role;
  start: string;
  end: string;
  staffId: string | null;
  locked: boolean;
};

export type WeekState = {
  availability: Record<string, Availability[]>;
  middleShifts: MiddleShift[];
  assignments: Assignment[];
  warnings: string[];
  published: boolean;
};

export type AppState = {
  staff: Staff[];
  weeks: Record<string, WeekState>;
};

export const stores: Store[] = ["星光店", "开元店"];
export const days = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const defaultStaff: Staff[] = [
  { id: "jennifer", name: "Jennifer", store: "星光店", role: "SS", employment: "全职", active: true },
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

export function emptyWeek(staff: Staff[]): WeekState {
  return {
    availability: Object.fromEntries(staff.map((person) => [person.id, Array<Availability>(7).fill("unconfirmed")])),
    middleShifts: [],
    assignments: [],
    warnings: [],
    published: false,
  };
}

export function initialState(): AppState {
  return { staff: defaultStaff, weeks: {} };
}

const shiftTimes: Record<Store, Record<"early" | "late", [string, string]>> = {
  星光店: { early: ["07:15", "16:15"], late: ["13:15", "21:30"] },
  开元店: { early: ["06:15", "14:45"], late: ["14:30", "22:30"] },
};

function availabilityAllows(value: Availability, shift: ShiftKind) {
  if (value === "all") return true;
  if (shift === "middle") return value === "early" || value === "late";
  return value === shift;
}

function maxConsecutive(daysWorked: Set<number>) {
  let best = 0;
  let run = 0;
  for (let day = 0; day < 7; day += 1) {
    if (daysWorked.has(day)) {
      run += 1;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

export function hoursFor(assignment: Assignment) {
  const [sh, sm] = assignment.start.split(":").map(Number);
  const [eh, em] = assignment.end.split(":").map(Number);
  return Math.max(0, eh + em / 60 - sh - sm / 60);
}

export function generateSchedule(staff: Staff[], week: WeekState) {
  const active = staff.filter((person) => person.active);
  const unconfirmed = active.filter((person) =>
    (week.availability[person.id] ?? []).some((value) => value === "unconfirmed"),
  );
  if (unconfirmed.length) {
    return {
      assignments: week.assignments,
      warnings: [`以下人员本周信息尚未确认：${unconfirmed.map((p) => p.name).join("、")}`],
    };
  }

  const standard: Assignment[] = [];
  for (let day = 0; day < 7; day += 1) {
    for (const store of stores) {
      for (const shift of ["early", "late"] as const) {
        const [start, end] = shiftTimes[store][shift];
        for (const role of ["SS", "BB"] as const) {
          standard.push({ id: `${day}-${store}-${shift}-${role}`, day, store, shift, role, start, end, staffId: null, locked: false });
        }
      }
    }
  }
  const middle = week.middleShifts.map<Assignment>((slot) => ({ ...slot, shift: "middle", staffId: null, locked: false }));
  const previous = new Map(week.assignments.map((item) => [item.id, item]));
  const assignments = [...standard, ...middle].map((slot) => {
    const existing = previous.get(slot.id);
    return existing?.locked ? { ...slot, staffId: existing.staffId, locked: true } : slot;
  });

  const usedByDay = new Map<number, Set<string>>();
  const workedDays = new Map<string, Set<number>>();
  const counts = new Map<string, number>();
  const shiftCounts = new Map<string, { early: number; late: number }>();
  const lastShift = new Map<string, { day: number; shift: ShiftKind }>();
  const warnings: string[] = [];

  const record = (slot: Assignment, staffId: string) => {
    if (!usedByDay.has(slot.day)) usedByDay.set(slot.day, new Set());
    usedByDay.get(slot.day)!.add(staffId);
    if (!workedDays.has(staffId)) workedDays.set(staffId, new Set());
    workedDays.get(staffId)!.add(slot.day);
    counts.set(staffId, (counts.get(staffId) ?? 0) + 1);
    const mix = shiftCounts.get(staffId) ?? { early: 0, late: 0 };
    if (slot.shift === "early") mix.early += 1;
    if (slot.shift === "late") mix.late += 1;
    shiftCounts.set(staffId, mix);
    lastShift.set(staffId, { day: slot.day, shift: slot.shift });
  };

  for (const slot of assignments.filter((item) => item.locked && item.staffId)) record(slot, slot.staffId!);

  const choose = (slot: Assignment) => {
    const candidates = active
      .filter((person) => person.role === slot.role)
      .filter((person) => !(usedByDay.get(slot.day)?.has(person.id)))
      .filter((person) => availabilityAllows(week.availability[person.id]?.[slot.day] ?? "unconfirmed", slot.shift))
      .filter((person) => {
        const proposed = new Set(workedDays.get(person.id) ?? []);
        proposed.add(slot.day);
        return maxConsecutive(proposed) <= 6;
      })
      .filter((person) => {
        if (slot.role !== "BB" || !person.novice || person.mature) return true;
        return assignments.some((other) =>
          other.day === slot.day && other.store === slot.store && other.shift === slot.shift && other.role === "SS" &&
          other.staffId && staff.some((leader) => leader.id === other.staffId && leader.employment === "全职"),
        );
      });

    return candidates.map((person) => {
      let score = 0;
      const total = counts.get(person.id) ?? 0;
      const mix = shiftCounts.get(person.id) ?? { early: 0, late: 0 };
      if (person.store === slot.store) score += 30;
      if (person.employment === "全职") score += total < 5 ? 24 : -30;
      else score += Math.max(0, 14 - total * 4);
      if (person.preference === "early") score += slot.shift === "early" ? 18 : slot.shift === "late" ? -18 : 0;
      if (slot.shift === "early" && mix.early > mix.late) score -= 4;
      if (slot.shift === "late" && mix.late > mix.early) score -= 4;
      const prior = lastShift.get(person.id);
      if (prior?.day === slot.day - 1 && prior.shift === "late" && slot.shift === "early") score -= 24;
      if (person.id === "jennifer" && person.store !== slot.store) score += 6;
      score -= total;
      return { person, score };
    }).sort((a, b) => b.score - a.score || a.person.name.localeCompare(b.person.name))[0]?.person;
  };

  const openSlots = assignments.filter((slot) => !slot.locked).sort((a, b) => a.day - b.day || (a.role === "SS" ? -1 : 1));
  for (const slot of openSlots) {
    const selected = choose(slot);
    if (selected) {
      slot.staffId = selected.id;
      record(slot, selected.id);
    } else {
      const otherStore = slot.store === "星光店" ? "开元店" : "星光店";
      warnings.push(`${days[slot.day]}｜${slot.store}｜${shiftLabel(slot.shift)}缺少${slot.role}；请向${otherStore}确认${slot.role}支援。`);
    }
  }

  for (const person of active.filter((item) => item.employment === "全职")) {
    const total = counts.get(person.id) ?? 0;
    if (total < 5) warnings.push(`${person.name} 本周安排 ${total} 天，未达到全职 5 天目标。`);
    if (total > 5) warnings.push(`${person.name} 本周安排 ${total} 天，为满足门店覆盖增加班次。`);
  }
  return { assignments, warnings };
}

export function shiftLabel(shift: ShiftKind) {
  return shift === "early" ? "白班" : shift === "late" ? "晚班" : "中班";
}
