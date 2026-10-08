import assert from "node:assert/strict";
// @ts-expect-error Node 22 runs this regression check with type stripping.
import { defaultStaff, emptyPeriod, generateSchedule, type Assignment, type Staff } from "../lib/scheduler.ts";

function confirmEveryone(staff: Staff[], startDate: string, endDate: string) {
  const period = emptyPeriod(staff, startDate, endDate, "priority-test");
  for (const person of staff) {
    period.participation[person.id] = "confirmed";
    period.availability[person.id] = period.availability[person.id].map(() => "all");
  }
  return period;
}

{
  const staff = defaultStaff.map((person) => person.id === "shuanglin" ? { ...person, name: "Stefan" } : { ...person });
  const period = confirmEveryone(staff, "2026-10-12", "2026-10-18");
  period.availability.lisir[6] = "off";
  const result = generateSchedule(staff, period);
  const count = (staffId: string) => result.assignments.filter((slot) => slot.staffId === staffId).length;

  assert.equal(count("lisir"), 6, "lisir reports six days and should receive six compatible shifts");
  for (const person of staff.filter((candidate) => candidate.employment === "全职")) {
    assert.ok(count(person.id) <= 5, `${person.name} should not reach a sixth day while part-time demand can cover shifts`);
  }
}

{
  const staff: Staff[] = [
    { id: "nemo", name: "nemo", store: "开元店", role: "SS", employment: "全职", active: true },
    { id: "shuanglin", name: "Stefan", store: "星光店", role: "BB", employment: "全职", active: true },
    { id: "alt-bb", name: "Alternative", store: "开元店", role: "BB", employment: "全职", active: true },
    ...Array.from({ length: 7 }, (_, index): Staff => ({ id: `locked-${index}`, name: `Locked ${index}`, store: index < 3 ? "星光店" : "开元店", role: index % 2 ? "BB" : "SS", employment: "全职", active: true })),
  ];
  const period = confirmEveryone(staff, "2026-10-12", "2026-10-12");
  const ids = [
    "0-星光店-early-SS", "0-星光店-early-BB", "0-星光店-late-SS", "0-星光店-late-BB",
    "0-开元店-early-SS", "0-开元店-late-SS", "0-开元店-late-BB",
  ];
  period.assignments = ids.map((id, index): Assignment => {
    const isNemo = id === "0-开元店-early-SS";
    const [store, shift, role] = id.replace("0-", "").split("-") as ["星光店" | "开元店", "early" | "late", "SS" | "BB"];
    return { id, day: 0, store, shift, role, start: shift === "early" ? (store === "星光店" ? "07:15" : "06:15") : (store === "星光店" ? "13:15" : "14:30"), end: shift === "early" ? (store === "星光店" ? "16:15" : "14:45") : (store === "星光店" ? "21:30" : "22:30"), staffId: isNemo ? "nemo" : `locked-${index}`, locked: true };
  });

  const result = generateSchedule(staff, period);
  const target = result.assignments.find((slot) => slot.id === "0-开元店-early-BB");
  assert.equal(target?.staffId, "alt-bb", "Stefan should not share nemo's shift when another BB is available");
}

console.log("scheduler priority checks passed");
