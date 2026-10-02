export function cleanBase(url) {
  if (!url) return "";
  let u = String(url).trim().replace(/\/$/, "");
  u = u.replace(/\/\.json$/i, "").replace(/\.json$/i, "");
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

/** Decode ?s=  formats: url|||url  OR  url|||Label */
export function decodeShareParam(s) {
  try {
    const raw = atob(String(s).trim());
    const parts = raw.split("|||");
    const left = (parts[0] || "").trim();
    const right = (parts[1] || "").trim();
    const url = cleanBase(left.split("|")[0]);
    let label = "";
    if (right && !right.includes("firebaseio.com") && !right.includes("firebasedatabase.app")) {
      label = right;
    }
    if (!label) label = "Shared Session";
    return { url, label };
  } catch {
    return { url: "", label: "" };
  }
}

export function encodeShareParam(url, label = "") {
  const u = cleanBase(url);
  const raw = label ? `${u}|||${label}` : `${u}|||${u}`;
  return btoa(raw);
}

export function maskSession(label, url) {
  if (label && !String(label).includes("firebase")) return label;
  try {
    const host = String(url).replace(/^https?:\/\//, "").split("/")[0];
    return `Session · ${(host.split(".")[0] || "db").slice(0, 12)}`;
  } catch {
    return "Session";
  }
}
