// ============================================================================
// ✅ ZONO Mobile Field Operations™ — pure self-tests (offline). 41.0.
// Validates the Visit Mode assembler (facts, directions, contact, checklist,
// documents, empty-safe). No I/O.
// ============================================================================
import { buildVisitMode, STANDARD_CHECKLIST } from "./assemble";
import type { PropertyLean } from "./types";

export interface FCheck { name: string; pass: boolean; detail: string }
export interface FSelfCheck { ok: boolean; total: number; passed: number; checks: FCheck[] }

const prop = (o: Partial<PropertyLean> = {}): PropertyLean => ({
  id: "p1", title: "דירת 4 חדרים", city: "חיפה", neighborhood: "כרמל", buildingNumber: "10",
  price: 2400000, rooms: 4, size: 110, type: "apartment", status: "active", image: "img.jpg",
  aiDescription: "נכס מבוקש עם נוף פתוח.", zonoScore: 82, lat: 32.79, lng: 34.98, ...o,
});

export function runSelfCheck(): FSelfCheck {
  const checks: FCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const v = buildVisitMode(prop(), { name: "יוסי כהן", phone: "050-1234567" }, [{ id: "d1", title: "טאבו", url: "u" }]);
  add("facts mapped", v.facts.title === "דירת 4 חדרים" && v.facts.location === "כרמל, חיפה" && v.facts.zonoScore === 82);
  add("directions from lat/lng", v.directionsUrl === "https://www.google.com/maps/search/?api=1&query=32.79,34.98");
  add("contact + whatsapp digits", v.contact?.phone === "050-1234567" && v.contact?.whatsapp === "0501234567");
  add("checklist standard 12 items", v.checklist.length === STANDARD_CHECKLIST.length && v.checklist.length === 12);
  add("documents mapped", v.documents.length === 1 && v.documents[0].title === "טאבו");
  add("href to property page", v.href === "/properties/p1");

  const noGeo = buildVisitMode(prop({ lat: null, lng: null }), null, []);
  add("directions falls back to address", noGeo.directionsUrl?.includes("maps/search") === true && noGeo.directionsUrl.includes("query="));
  add("no seller → contact null + note", noGeo.contact === null && noGeo.notes.length > 0);

  const bare = buildVisitMode(prop({ city: null, neighborhood: null, lat: null, lng: null, title: "" }), null, []);
  add("empty-safe (no address → null directions)", bare.directionsUrl === null && bare.facts.location === "—");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
