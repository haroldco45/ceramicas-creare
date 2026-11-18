// Reservas públicas: consultar disponibilidad y separar cupo
import { store, json, limpiar, ahoraCO, EXPERIENCIAS, jornadaDe, leerConfig, nuevoId } from "../../lib/comun.mjs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function ocupacion(fecha) {
  const s = store("creare-reservas");
  const { blobs } = await s.list({ prefix: `${fecha}/` });
  const usados = { manana: 0, tarde: 0 };
  const lista = [];
  for (const b of blobs) {
    const r = await s.get(b.key, { type: "json" });
    if (!r) continue;
    lista.push(r);
    if (r.estado !== "cancelada") usados[jornadaDe(r.turno)] += r.personas;
  }
  return { usados, lista };
}

export async function disponibilidad(fecha) {
  const cfg = await leerConfig();
  const { usados } = await ocupacion(fecha);
  const hoy = ahoraCO();
  const bloq = cfg.bloqueos.filter((b) => b.fecha === fecha);
  const cerrada = (j) => bloq.some((b) => b.jornada === "todo" || b.jornada === j);
  const motivo = bloq.map((b) => b.motivo).filter(Boolean).join(" · ");
  const cupo = { manana: cfg.cupoManana, tarde: cfg.cupoTarde };
  const turnos = {};
  for (const t of ["10:00", "11:00", "14:00", "15:00"]) {
    const j = jornadaDe(t);
    let libres = Math.max(0, cupo[j] - usados[j]);
    let razon = "";
    if (fecha < hoy.fecha) { libres = 0; razon = "pasada"; }
    else if (fecha === hoy.fecha && parseInt(t, 10) <= hoy.hora + 1) { libres = 0; razon = "hora"; }
    else if (cerrada(j)) { libres = 0; razon = "cerrado"; }
    turnos[t] = { libres, razon };
  }
  return { fecha, turnos, motivo };
}

export default async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const fecha = url.searchParams.get("fecha") || "";
      if (!FECHA.test(fecha)) return json({ error: "Fecha no válida" }, 400);
      return json(await disponibilidad(fecha));
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const exp = EXPERIENCIAS[b.experiencia];
      const fecha = String(b.fecha || "");
      const turno = String(b.turno || "");
      const personas = parseInt(b.personas, 10);
      const nombre = limpiar(b.nombre, 80);
      const celular = String(b.celular || "").replace(/\D/g, "").slice(-12);
      if (!exp || !FECHA.test(fecha) || !exp.turnos.includes(turno)) return json({ error: "Revisa la experiencia, la fecha y el horario." }, 400);
      if (!(personas >= 2 && personas <= 35)) return json({ error: "El grupo debe ser de 2 a 35 personas." }, 400);
      if (nombre.length < 3 || celular.length < 10) return json({ error: "Escribe tu nombre y un celular válido." }, 400);
      const d = await disponibilidad(fecha);
      const libres = d.turnos[turno]?.libres ?? 0;
      if (libres < personas) {
        return json({ ok: false, libres, razon: d.turnos[turno]?.razon, motivo: d.motivo, mensaje: libres > 0 ? `Para ese horario solo quedan ${libres} cupos.` : "Ese horario ya no tiene cupos." });
      }
      const id = "CR-" + nuevoId(5);
      const r = {
        id, fecha, turno, experiencia: Number(b.experiencia), nombreExperiencia: exp.nombre, precio: exp.precio,
        personas, total: exp.precio * personas, nombre, celular,
        ocasion: limpiar(b.ocasion, 120), idioma: b.idioma === "en" ? "en" : "es",
        estado: "pendiente", creada: new Date().toISOString(),
      };
      await store("creare-reservas").setJSON(`${fecha}/${id}`, r, { onlyIfNew: true });
      return json({ ok: true, reserva: r, libresDespues: libres - personas });
    }
    return json({ error: "Método no permitido" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "No pudimos procesar la reserva. Intenta de nuevo o escríbenos por WhatsApp." }, 500);
  }
};

export const config = { path: "/api/reservas" };
