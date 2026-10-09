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
  const staff = defaultStaff.map((person) => person.id === "shuanglin" ? { ...person, name: "Stefan" }
    : person.id === "dandan" ? { ...person, store: "开元店" as const }
      : person.id === "ivy" ? { ...person, store: "星光店" as const } : { ...person });
  const period = confirmEveryone(staff, "2026-10-12", "2026-10-18");
  period.availability.lisir[6] = "off";
  period.availability.allen.fill("off");
  period.availability.fox.fill("off");
  const result = generateSchedule(staff, period);
  const count = (staffId: string) => result.assignments.filter((slot) => slot.staffId === staffId).length;
  const lisirSlots = result.assignments.filter((slot) => slot.staffId === "lisir");
  const lisirEarly = lisirSlots.filter((slot) => slot.shift === "early").length;
  const lisirLate = lisirSlots.filter((slot) => slot.shift === "late").length;
  const lisirLateToEarly = lisirSlots.filter((slot) => slot.shift === "early" && lisirSlots.some((other) => other.day === slot.day - 1 && other.shift === "late")).length;

  assert.equal(count("lisir"), 6, "lisir reports six days and should receive six compatible shifts");
  assert.ok(lisirSlots.every((slot) => slot.store === "星光店"), "lisir should stay at the home store when compatible home-store shifts are available");
  assert.ok(Math.abs(lisirEarly - lisirLate) <= 1, `lisir's flexible shifts should be balanced, got ${lisirEarly} early and ${lisirLate} late`);
  assert.ok(lisirLateToEarly <= 1, `lisir should avoid repeated late-to-early transitions, got ${lisirLateToEarly}`);
  assert.ok(result.assignments.filter((slot) => slot.staffId).every((slot) => { const person = staff.find((candidate) => candidate.id === slot.staffId); return person?.id === "jennifer" || person?.role !== "SS" || person?.store === slot.store; }), "the fully available SS roster should not create unnecessary cross-store assignments");
  for (const person of staff.filter((candidate) => candidate.employment === "全职")) {
    assert.ok(count(person.id) >= 4, `${person.name} should receive the four-day full-time minimum when available`);
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

{
  const staff = defaultStaff.map((person) => person.id === "shuanglin" ? { ...person, name: "Stefan" }
    : person.id === "dandan" ? { ...person, store: "开元店" as const }
      : person.id === "ivy" ? { ...person, store: "星光店" as const } : { ...person });
  const period = emptyPeriod(staff, "2026-10-12", "2026-10-18", "manager-example");
  for (const person of staff) {
    period.participation[person.id] = ["harper", "bobo"].includes(person.id) ? "excluded" : "confirmed";
    period.availability[person.id] = Array(7).fill("off");
  }
  const set = (id: string, values: Array<"all" | "off" | "early" | "late">) => { period.availability[id] = values; };
  set("jennifer", Array(7).fill("all"));
  set("rachel", Array(7).fill("all"));
  set("dandan", ["early", "early", "late", "off", "early", "early", "off"]);
  set("lisir", ["all", "all", "all", "off", "all", "all", "all"]);
  set("allen", ["early", "off", "off", "late", "off", "off", "off"]);
  set("nemo", Array(7).fill("all"));
  set("yaki", Array(7).fill("all"));
  set("fox", ["off", "early", "early", "late", "off", "early", "off"]);
  set("shuanglin", ["all", "all", "all", "off", "off", "all", "all"]);
  set("mieleven", ["off", "all", "off", "off", "late", "late", "off"]);
  set("sia", ["off", "off", "late", "late", "off", "early", "off"]);
  set("demo", ["all", "all", "all", "all", "off", "off", "off"]);
  set("ivy", ["late", "late", "off", "all", "late", "all", "all"]);
  set("daz", ["late", "off", "off", "off", "off", "late", "early"]);

  const result = generateSchedule(staff, period);
  const slots = (id: string) => result.assignments.filter((slot) => slot.staffId === id);
  const demoSlots = slots("demo");
  assert.equal(demoSlots.length, 4, "demo should receive all four reported days");
  assert.ok(Math.abs(demoSlots.filter((slot) => slot.shift === "early").length - demoSlots.filter((slot) => slot.shift === "late").length) <= 1, "demo's four flexible days should not all be early shifts");
  assert.ok(slots("dandan").length >= 4, "dandan should reach the four-day full-time minimum without removing fox's requested shifts");
  assert.equal(slots("fox").length, 4, "fox's four specific part-time shifts should remain filled");
}

console.log("scheduler priority checks passed");
