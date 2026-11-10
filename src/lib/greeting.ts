// Time-of-day Hebrew greeting, always computed in Israel time (servers run in UTC,
// so a bare `new Date().getHours()` greeted "בוקר טוב" at 20:30).
export function greetingHe(now: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Jerusalem" }).format(now));
  return h >= 5 && h < 12 ? "בוקר טוב" : h < 17 && h >= 12 ? "צהריים טובים" : h >= 17 && h < 22 ? "ערב טוב" : "לילה טוב";
}
