"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const LS_ACCOUNTS = "ab_accounts";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    try {
      setAccounts(JSON.parse(localStorage.getItem(LS_ACCOUNTS) || "[]"));
    } catch {
      setAccounts([]);
    }
    if (localStorage.getItem("ab_auth") === "1") router.replace("/dashboard");
  }, [router]);

  function login(e) {
    e.preventDefault();
    const expected = process.env.NEXT_PUBLIC_PANEL_PASSWORD || "admin123";
    if (password === expected) {
      localStorage.setItem("ab_auth", "1");
      router.push("/dashboard");
    } else {
      setErr("Wrong password");
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ justifyContent: "center" }}>
          <div className="logo">V</div>
        </div>
        <h1 style={{ textAlign: "center" }}>AnneBella</h1>
        <p style={{ textAlign: "center" }}>Device Management Console</p>
        <form onSubmit={login}>
          <input
            type="password"
            placeholder="Panel password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button className="btn primary" style={{ width: "100%" }} type="submit">
            Login
          </button>
          {err && <div className="err">{err}</div>}
        </form>

        <div style={{ marginTop: 18, color: "var(--muted)", fontSize: 13 }}>
          Saved Accounts <span className="pill">{accounts.length} accounts</span>
        </div>
        <div className="accounts">
          {accounts.length === 0 && <div className="empty">No saved Firebase accounts yet</div>}
          {accounts.map((a) => (
            <div className="account" key={a.id}>
              <div className="u">{a.url}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
