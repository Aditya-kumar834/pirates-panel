"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { decodeShareParam, encodeShareParam, maskSession, cleanBase } from "@/lib/share";

const LS_ACCOUNTS = "pb_accounts";
const LS_ACTIVE = "pb_active";
const LS_JOINED = "pb_tg_joined";
const CHANNEL_LINK = "https://t.me/piratesbabaz";
const CHANNEL_NAME = "@piratesbabaz";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function HomePage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [auth, setAuth] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [err, setErr] = useState("");
  const [shareOut, setShareOut] = useState("");

  function load() {
    try {
      const acc = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]");
      setAccounts(acc);
    } catch {
      setAccounts([]);
    }
  }

  useEffect(() => {
    load();
    if (localStorage.getItem(LS_JOINED) !== "1") setShowJoin(true);

    const params = new URLSearchParams(window.location.search);
    const sp = params.get("s");
    if (sp) {
      const { url: sharedUrl, label: sharedLabel } = decodeShareParam(sp);
      if (sharedUrl) {
        let acc = [];
        try {
          acc = JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]");
        } catch {}
        let item = acc.find((a) => a.url === sharedUrl);
        if (!item) {
          item = {
            id: uid(),
            url: sharedUrl,
            auth: "",
            label: sharedLabel || "Shared Session",
            hidden: true, // never show raw firebase to user
            addedAt: new Date().toISOString(),
          };
          acc = [item, ...acc];
          localStorage.setItem(LS_ACCOUNTS, JSON.stringify(acc));
        } else if (item.hidden !== true) {
          // if came from share link, force hide
          item = { ...item, hidden: true, label: item.label || sharedLabel || "Shared Session" };
          acc = acc.map((a) => (a.id === item.id ? item : a));
          localStorage.setItem(LS_ACCOUNTS, JSON.stringify(acc));
        }
        localStorage.setItem(LS_ACTIVE, item.id);
        try {
          window.history.replaceState({}, "", "/");
        } catch {}
        router.replace("/dashboard");
        return;
      }
    }
  }, [router]);

  function saveAccounts(next) {
    setAccounts(next);
    localStorage.setItem(LS_ACCOUNTS, JSON.stringify(next));
  }

  function addAccount() {
    const u = cleanBase(url);
    if (!u.includes("firebase")) {
      setErr("Valid Firebase URL required");
      return;
    }
    const item = {
      id: uid(),
      url: u,
      auth: auth.trim(),
      label: label.trim() || maskSession("", u),
      hidden: false, // user added themselves — they know URL; still mask in list if you want
      addedAt: new Date().toISOString(),
    };
    // For display: always mask in UI list; keep url only in storage
    item.displayLabel = label.trim() || maskSession("", u);
    const next = [item, ...accounts];
    saveAccounts(next);
    setShowAdd(false);
    setUrl("");
    setLabel("");
    setAuth("");
    setErr("");
  }

  function openAccount(a) {
    localStorage.setItem(LS_ACTIVE, a.id);
    router.push("/dashboard");
  }

  function removeAccount(id, e) {
    e.stopPropagation();
    const next = accounts.filter((a) => a.id !== id);
    saveAccounts(next);
  }

  function copyShare(a, e) {
    e.stopPropagation();
    const s = encodeShareParam(a.url, a.label || "Session");
    const link = `${window.location.origin}/?s=${s}`;
    setShareOut(link);
    navigator.clipboard?.writeText(link);
  }

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="brand" style={{ justifyContent: "center" }}>
          <div className="logo">PB</div>
        </div>
        <h1 style={{ textAlign: "center", marginBottom: 4 }}>Pirates Babaz</h1>
        <p style={{ textAlign: "center" }}>Device Management Console</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <div style={{ fontWeight: 600 }}>Saved Accounts</div>
          <span className="pill">{accounts.length} accounts</span>
        </div>

        <div className="accounts" style={{ maxHeight: 320 }}>
          {accounts.length === 0 && <div className="empty">No accounts yet</div>}
          {accounts.map((a) => (
            <div
              className="account"
              key={a.id}
              onClick={() => openAccount(a)}
              style={{ cursor: "pointer" }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="u" style={{ fontWeight: 600 }}>
                  {a.hidden ? a.label || "Shared Session" : a.label || maskSession("", a.url)}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 2 }}>
                  {a.hidden ? "Protected session · Firebase hidden" : a.addedAt ? new Date(a.addedAt).toLocaleString() : ""}
                </div>
              </div>
              <button className="btn" title="Copy share link" onClick={(e) => copyShare(a, e)}>Share</button>
              <button className="btn danger" onClick={(e) => removeAccount(a.id, e)}>Del</button>
            </div>
          ))}
        </div>

        <button className="btn primary" style={{ width: "100%", marginTop: 12 }} onClick={() => setShowAdd(true)}>
          + New Account
        </button>

        {shareOut && (
          <div style={{ marginTop: 10, fontSize: 11, wordBreak: "break-all", color: "var(--muted)" }}>
            Copied share link (Firebase hidden from receivers’ UI)
          </div>
        )}
        {err && <div className="err">{err}</div>}
      </div>

      {showAdd && (
        <div className="modal-bg" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>New Account</h3>
            <input
              style={inp}
              placeholder="Firebase URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <input
              style={inp}
              placeholder="Label (what others see)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              style={inp}
              placeholder="Auth token (optional)"
              value={auth}
              onChange={(e) => setAuth(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="btn primary" onClick={addAccount}>Save</button>
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div className="modal-bg">
          <div className="modal" style={{ maxWidth: 420, textAlign: "center" }}>
            <h3>Join Telegram Channel</h3>
            <p style={{ color: "var(--muted)" }}>
              Continue se pehle join karo: <b>{CHANNEL_NAME}</b>
            </p>
            <a className="btn primary" style={{ display: "inline-block", marginBottom: 10 }} href={CHANNEL_LINK} target="_blank" rel="noreferrer">
              Join Channel
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

const inp = {
  width: "100%",
  marginBottom: 8,
  padding: 10,
  borderRadius: 10,
  border: "1px solid var(--line)",
  background: "#0b1220",
  color: "white",
};
