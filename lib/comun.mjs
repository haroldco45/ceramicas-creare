// Utilidades compartidas — Cerámicas Creare (Vibras Positivas HM)
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual, randomBytes } from "node:crypto";

export const store = (name) => getStore({ name, consistency: "strong" });

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const limpiar = (v, max = 120) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

// Fecha y hora de Colombia (UTC-5, sin horario de verano)
export function ahoraCO() {
  const d = new Date(Date.now() - 5 * 3600e3);
  return { fecha: d.toISOString().slice(0, 10), hora: d.getUTCHours() + d.getUTCMinutes() / 60 };
}

// Experiencias y turnos (la jornada agrupa los turnos que comparten el taller)
export const EXPERIENCIAS = {
  1: { nombre: "Pintar y disfrutar", precio: 85000, turnos: ["11:00", "15:00"] },
  2: { nombre: "Tour + 1 pieza", precio: 95000, turnos: ["10:00", "14:00"] },
  3: { nombre: "Tour + 2 piezas", precio: 105000, turnos: ["10:00", "14:00"] },
  4: { nombre: "Experiencia completa", precio: 125000, turnos: ["10:00", "14:00"] },
};
export const jornadaDe = (turno) => (parseInt(turno, 10) < 12 ? "manana" : "tarde");

export const CONFIG_BASE = { cupoManana: 35, cupoTarde: 35, bloqueos: [] }; // bloqueos: [{fecha, jornada:'todo'|'manana'|'tarde', motivo}]

export async function leerConfig() {
  const c = await store("creare-config").get("config", { type: "json" });
  return { ...CONFIG_BASE, ...(c || {}) };
}
export const guardarConfig = (c) => store("creare-config").setJSON("config", c);

// ---- Claves: dueña y creador. Nunca se guardan en el repo; viven en Netlify (variables de entorno).
const sha = (t) => createHash("sha256").update(String(t)).digest();
const igual = (a, b) => { const x = sha(a), y = sha(b); return timingSafeEqual(x, y); };

export async function rolDe(req) {
  const clave = req.headers.get("x-clave") || "";
  if (!clave) return null;
  const creador = process.env.CLAVE_CREADOR;
  if (creador && igual(clave, creador)) return "creador";
  // La dueña puede tener una clave cambiada por el creador (se guarda solo su huella)
  const cambio = await store("creare-config").get("clave-duena", { type: "json" });
  if (cambio?.huella) {
    if (createHash("sha256").update(clave).digest("hex") === cambio.huella) return "duena";
    return null;
  }
  const duena = process.env.CLAVE_DUENA;
  if (duena && igual(clave, duena)) return "duena";
  return null;
}
export const huella = (t) => createHash("sha256").update(String(t)).digest("hex");
export const nuevoId = (n = 6) => randomBytes(n).toString("base64url").replace(/[-_]/g, "").slice(0, n).toUpperCase();
