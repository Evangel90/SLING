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

// ---------- time zones ----------

export const TIME_ZONES: { value: string; label: string }[] = [
  { value: "local", label: "Your local time" },
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Los Angeles (Pacific)" },
  { value: "America/New_York", label: "New York (Eastern)" },
  { value: "America/Sao_Paulo", label: "São Paulo" },
  { value: "Europe/London", label: "London" },
  { value: "Africa/Lagos", label: "Lagos (WAT)" },
  { value: "Europe/Berlin", label: "Berlin (Central Europe)" },
  { value: "Africa/Nairobi", label: "Nairobi (EAT)" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Kolkata", label: "Mumbai (IST)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function partsIn(ms: number, zone: string) {
  const o: Record<string, string> = {};
  new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .formatToParts(new Date(ms))
    .forEach((p) => (o[p.type] = p.value));
  return o;
}

function offsetMs(ms: number, zone: string) {
  const o = partsIn(ms, zone);
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(ms / 60000) * 60000;
}

/** The instant when the clock in `zone` reads y-m-d h:mi (month is 1-based). Handles DST by refining twice. */
export function wallTime(y: number, m: number, d: number, h: number, mi: number, zone: string): number {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let u = guess - offsetMs(guess, zone);
  u = guess - offsetMs(u, zone);
  return u;
}

/** "2026-10-30" and "09:00" as seen in `zone`. */
export function isoIn(ms: number, zone: string) {
  const o = partsIn(ms, zone);
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour}:${o.minute}` };
}

export const fmtDayIn = (d: Date, zone: string, weekday = false) =>
  d.toLocaleDateString("en-US", {
    timeZone: zone,
    ...(weekday ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }),
  } as Intl.DateTimeFormatOptions);

export const fmtShortIn = (d: Date, zone: string) => d.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" });

export const fmtTimeIn = (d: Date, zone: string) =>
  d.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });

// en-US only knows US abbreviations ("GMT+11" for Sydney), so ask locales that name each region's zones:
// AEDT (en-AU), WAT/EAT (en-NG), IST (en-IN), SGT (en-SG), GST/CET/BST (en-GB), BRT (pt-BR), JST (ja-JP).
const TZ_LOCALES = ["en-US", "en-GB", "en-AU", "en-IN", "en-NG", "en-SG", "pt-BR", "ja-JP"];
const isOffsetOnly = (n: string) => /^(GMT|UTC)[+-−]/.test(n);

/** Short zone name at that moment, e.g. "EDT", "AEDT", "WAT"; "GMT+4" only if no locale has a name for it. */
export function tzNameIn(d: Date, zone: string): string {
  let fallback = "";
  for (const locale of TZ_LOCALES) {
    const name =
      new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")
        ?.value ?? "";
    if (name && !isOffsetOnly(name)) return name;
    fallback ||= name;
  }
  return fallback;
}
