// Panel de la dueña (y del creador): reservas, cupos, bloqueos y visitas
import { store, json, limpiar, rolDe, leerConfig, guardarConfig, huella, ahoraCO } from "../../lib/comun.mjs";
import { ocupacion, disponibilidad } from "./reservas.mjs";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const sumarDias = (f, n) => new Date(Date.parse(f + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const rol = await rolDe(req);
  if (!rol) return json({ error: "Clave incorrecta" }, 401);
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.accion) {
      case "entrar": return json({ ok: true, rol, hoy: ahoraCO().fecha });

      case "reservas": { // rango de fechas, máximo 62 días
        const desde = FECHA.test(b.desde) ? b.desde : ahoraCO().fecha;
        const dias = Math.min(62, Math.max(1, parseInt(b.dias, 10) || 14));
        const out = [];
        for (let i = 0; i < dias; i++) {
          const f = sumarDias(desde, i);
          const { lista } = await ocupacion(f);
          out.push(...lista);
        }
        out.sort((x, y) => (x.fecha + x.turno).localeCompare(y.fecha + y.turno));
        return json({ reservas: out });
      }

      case "estado": {
        if (!FECHA.test(b.fecha) || !/^CR-[A-Z0-9]+$/.test(b.id || "")) return json({ error: "Reserva no válida" }, 400);
        if (!["pendiente", "confirmada", "cancelada", "asistio"].includes(b.estado)) return json({ error: "Estado no válido" }, 400);
        const s = store("creare-reservas");
        const r = await s.get(`${b.fecha}/${b.id}`, { type: "json" });
        if (!r) return json({ error: "No encontrada" }, 404);
        r.estado = b.estado; r.nota = limpiar(b.nota ?? r.nota, 200); r.actualizada = new Date().toISOString();
        await s.setJSON(`${b.fecha}/${b.id}`, r);
        return json({ ok: true, reserva: r });
      }

      case "dia": return json(await disponibilidad(b.fecha));

      case "config": return json(await leerConfig());

      case "guardarCupos": {
        const c = await leerConfig();
        c.cupoManana = Math.min(200, Math.max(0, parseInt(b.cupoManana, 10) || 0));
        c.cupoTarde = Math.min(200, Math.max(0, parseInt(b.cupoTarde, 10) || 0));
        await guardarConfig(c);
        return json(c);
      }

      case "bloquear": {
        if (!FECHA.test(b.fecha) || !["todo", "manana", "tarde"].includes(b.jornada)) return json({ error: "Datos no válidos" }, 400);
        const c = await leerConfig();
        c.bloqueos = c.bloqueos.filter((x) => !(x.fecha === b.fecha && x.jornada === b.jornada));
        c.bloqueos.push({ fecha: b.fecha, jornada: b.jornada, motivo: limpiar(b.motivo, 80) });
        c.bloqueos = c.bloqueos.filter((x) => x.fecha >= ahoraCO().fecha).sort((x, y) => x.fecha.localeCompare(y.fecha));
        await guardarConfig(c);
        return json(c);
      }

      case "desbloquear": {
        const c = await leerConfig();
        c.bloqueos = c.bloqueos.filter((x) => !(x.fecha === b.fecha && x.jornada === b.jornada));
        await guardarConfig(c);
        return json(c);
      }

      case "visitas": {
        const hoy = ahoraCO().fecha;
        const s = store("creare-visitas");
        const dias = [];
        for (let i = 13; i >= 0; i--) {
          const f = sumarDias(hoy, -i);
          const { blobs } = await s.list({ prefix: `${f}/` });
          dias.push({ fecha: f, visitas: blobs.length });
        }
        return json({ dias });
      }

      // ---- Solo el creador
      case "cambiarClaveDuena": {
        if (rol !== "creador") return json({ error: "Solo el creador puede hacer esto" }, 403);
        const nueva = String(b.nueva || "");
        if (nueva.length < 6) return json({ error: "La clave debe tener mínimo 6 caracteres" }, 400);
        await store("creare-config").setJSON("clave-duena", { huella: huella(nueva), cambiada: new Date().toISOString() });
        return json({ ok: true });
      }
      case "restaurarClaveDuena": {
        if (rol !== "creador") return json({ error: "Solo el creador puede hacer esto" }, 403);
        await store("creare-config").delete("clave-duena");
        return json({ ok: true });
      }
      default: return json({ error: "Acción no válida" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: "Error en el panel. Intenta de nuevo." }, 500);
  }
};

export const config = { path: "/api/admin" };
