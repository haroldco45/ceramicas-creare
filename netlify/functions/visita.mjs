// Cuenta visitas a la app (una entrada por visita, sin contadores compartidos)
import { store, json, ahoraCO, nuevoId } from "../../lib/comun.mjs";
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const { fecha } = ahoraCO();
  const b = await req.json().catch(() => ({}));
  await store("creare-visitas").setJSON(`${fecha}/${Date.now()}-${nuevoId(4)}`, { idioma: b.idioma === "en" ? "en" : "es", origen: String(b.origen || "").slice(0, 80) });
  return json({ ok: true });
};
export const config = { path: "/api/visita" };
