/** "Oct 30" */
export const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Oct 30, 2026", or "Fri, Oct 30" with the weekday. */
export const fmtDay = (d: Date, weekday = false) =>
  weekday
    ? d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** "9:00 AM" */
export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Short zone name in the viewer's locale, e.g. "WAT". */
export const tzName = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";

/** "Fri, Oct 30, 2026, 9:00 AM WAT" */
export const fmtLong = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

export function countdown(ms: number) {
  let s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const label =
    d > 0 ? `${plural(d, "day")}, ${plural(h, "hour")}` : h > 0 ? `${plural(h, "hour")}, ${plural(m, "minute")}` : m > 0 ? `${plural(m, "minute")}, ${plural(s, "second")}` : plural(s, "second");
  const p = (n: number) => String(n).padStart(2, "0");
  return { label, parts: [{ v: String(d), l: "Days" }, { v: p(h), l: "Hours" }, { v: p(m), l: "Min" }, { v: p(s), l: "Sec" }] };
}

/** A downloadable calendar reminder for when a locked gift opens. */
export function calendarFile(title: string, at: Date, url: string) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(at.getTime() + 15 * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SLING//Gift unlock//EN",
    "BEGIN:VEVENT",
    `UID:${at.getTime()}-${Math.abs(hash(url))}@sling`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:Your gift opens now. Claim it here: ${url}`,
    `URL:${url}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
