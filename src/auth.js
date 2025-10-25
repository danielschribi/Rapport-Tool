import crypto from "node:crypto";

export function hash(pw) {
  return crypto.createHash("sha256").update(String(pw)).digest("hex");
}
export function initials(vorname, nachname) {
  return (String(vorname||"")[0]||"") + (String(nachname||"")[0]||"");
}
