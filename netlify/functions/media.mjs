// Fotos y videos que sube la dueña desde el panel. Se guardan por partes (4 MB) para aceptar videos del celular.
import { store, json, limpiar, rolDe, nuevoId } from "../../lib/comun.mjs";

const MAX_PARTES = 40; // ~160 MB
const MIME_OK = /^(image\/(jpeg|png|webp)|video\/(mp4|quicktime|webm))$/;

async function servir(req, id) {
  const s = store("creare-media");
  const meta = await s.get(`meta/${id}`, { type: "json" });
  if (!meta || !meta.listo) return new Response("No encontrado", { status: 404 });
  const total = meta.tamanos.reduce((a, b) => a + b, 0);
  const rango = req.headers.get("range");
  let ini = 0, fin = total - 1, status = 200;
  if (rango) {
    const m = /bytes=(\d*)-(\d*)/.exec(rango);
    if (m) {
      if (m[1] === "" && m[2]) { ini = Math.max(0, total - Number(m[2])); }
      else { ini = Number(m[1] || 0); if (m[2]) fin = Math.min(Number(m[2]), total - 1); }
      if (ini > fin || ini >= total) return new Response(null, { status: 416, headers: { "content-range": `bytes */${total}` } });
      status = 206;
    }
  }
  // Tomar solo las partes que tocan el rango
  const trozos = [];
  let pos = 0;
  for (let i = 0; i < meta.tamanos.length; i++) {
    const a = pos, z = pos + meta.tamanos[i] - 1;
    pos += meta.tamanos[i];
    if (z < ini || a > fin) continue;
    const buf = new Uint8Array(await s.get(`partes/${id}/${i}`, { type: "arrayBuffer" }));
    trozos.push(buf.subarray(Math.max(0, ini - a), Math.min(buf.length, fin - a + 1)));
  }
  const headers = {
    "content-type": meta.mime, "accept-ranges": "bytes", "content-length": String(fin - ini + 1),
    "cache-control": "public, max-age=31536000, immutable",
  };
  if (status === 206) headers["content-range"] = `bytes ${ini}-${fin}/${total}`;
  return new Response(new Blob(trozos), { status, headers });
}

export default async (req) => {
  const url = new URL(req.url);
  const s = store("creare-media");
  try {
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (id) return servir(req, id.replace(/[^A-Za-z0-9]/g, ""));
      const { blobs } = await s.list({ prefix: "meta/" });
      const items = [];
      for (const b of blobs) {
        const m = await s.get(b.key, { type: "json" });
        if (m?.listo) items.push({ id: m.id, tipo: m.tipo, titulo: m.titulo, creado: m.creado, url: `/api/media?id=${m.id}` });
      }
      items.sort((a, b) => b.creado.localeCompare(a.creado));
      return json({ items });
    }

    const rol = await rolDe(req);
    if (!rol) return json({ error: "Clave incorrecta" }, 401);

    if (req.method === "POST") {
      const accion = url.searchParams.get("accion");
      if (accion === "iniciar") {
        const b = await req.json();
        if (!MIME_OK.test(b.mime || "")) return json({ error: "Solo fotos (JPG, PNG, WEBP) o videos (MP4, MOV, WEBM)." }, 400);
        const partes = parseInt(b.partes, 10);
        if (!(partes >= 1 && partes <= MAX_PARTES)) return json({ error: "El archivo es muy grande (máximo unos 160 MB)." }, 400);
        const id = nuevoId(10);
        await s.setJSON(`meta/${id}`, { id, mime: b.mime, tipo: b.mime.startsWith("video") ? "video" : "foto", titulo: limpiar(b.titulo, 90), partes, tamanos: [], listo: false, creado: new Date().toISOString(), por: rol });
        return json({ id });
      }
      if (accion === "parte") {
        const id = (url.searchParams.get("id") || "").replace(/[^A-Za-z0-9]/g, "");
        const i = parseInt(url.searchParams.get("i"), 10);
        const meta = await s.get(`meta/${id}`, { type: "json" });
        if (!meta || meta.listo || !(i >= 0 && i < meta.partes)) return json({ error: "Parte no válida" }, 400);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > 4.5 * 1024 * 1024) return json({ error: "Parte muy grande" }, 413);
        await s.set(`partes/${id}/${i}`, buf);
        return json({ ok: true, i, bytes: buf.byteLength });
      }
      if (accion === "cerrar") {
        const b = await req.json();
        const id = String(b.id || "").replace(/[^A-Za-z0-9]/g, "");
        const meta = await s.get(`meta/${id}`, { type: "json" });
        if (!meta) return json({ error: "No encontrado" }, 404);
        const tamanos = [];
        for (let i = 0; i < meta.partes; i++) {
          const m = await s.get(`partes/${id}/${i}`, { type: "arrayBuffer" });
          if (!m) return json({ error: `Falta la parte ${i + 1}` }, 400);
          tamanos.push(m.byteLength);
        }
        await s.setJSON(`meta/${id}`, { ...meta, tamanos, listo: true });
        return json({ ok: true, id, url: `/api/media?id=${id}` });
      }
      if (accion === "titulo") {
        const b = await req.json();
        const id = String(b.id || "").replace(/[^A-Za-z0-9]/g, "");
        const meta = await s.get(`meta/${id}`, { type: "json" });
        if (!meta) return json({ error: "No encontrado" }, 404);
        await s.setJSON(`meta/${id}`, { ...meta, titulo: limpiar(b.titulo, 90) });
        return json({ ok: true });
      }
      return json({ error: "Acción no válida" }, 400);
    }

    if (req.method === "DELETE") {
      const id = (url.searchParams.get("id") || "").replace(/[^A-Za-z0-9]/g, "");
      const meta = await s.get(`meta/${id}`, { type: "json" });
      if (!meta) return json({ error: "No encontrado" }, 404);
      for (let i = 0; i < meta.partes; i++) await s.delete(`partes/${id}/${i}`);
      await s.delete(`meta/${id}`);
      return json({ ok: true });
    }
    return json({ error: "Método no permitido" }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: "Error con el archivo. Intenta de nuevo." }, 500);
  }
};

export const config = { path: "/api/media" };
