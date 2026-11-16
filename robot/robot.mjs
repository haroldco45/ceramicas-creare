// Robot de redes de Cerámicas Creare — Vibras Positivas HM
// 1) Instagram: usa la API oficial de Instagram (Graph API) con el permiso de Creare.
//    Se activa cuando en GitHub existan los secretos IG_TOKEN e IG_USER_ID.
// 2) Web: trae lo que se publique sobre Creare en medios (Google News RSS).
// Si una fuente falla, conserva lo que ya había para que la app nunca quede vacía.
import fs from 'node:fs';

const OUT = 'redes.json';
const previo = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { instagram: { posts: [] }, web: [] };
const { IG_TOKEN, IG_USER_ID } = process.env;

async function instagram() {
  if (!IG_TOKEN || !IG_USER_ID) throw new Error('falta el permiso de Creare (IG_TOKEN / IG_USER_ID)');
  const base = 'https://graph.facebook.com/v21.0';
  const campos = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  const [perfil, media] = await Promise.all([
    fetch(`${base}/${IG_USER_ID}?fields=username,name,biography,followers_count,media_count&access_token=${IG_TOKEN}`).then(r => r.json()),
    fetch(`${base}/${IG_USER_ID}/media?fields=${campos}&limit=12&access_token=${IG_TOKEN}`).then(r => r.json())
  ]);
  if (perfil.error) throw new Error(perfil.error.message);
  if (media.error) throw new Error(media.error.message);
  return {
    nombre: perfil.name, bio: perfil.biography,
    seguidores: perfil.followers_count ?? null, publicaciones: perfil.media_count ?? null,
    posts: (media.data || []).map(m => ({
      url: m.permalink,
      video: m.media_type === 'VIDEO',
      imagen: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      texto: (m.caption || '').slice(0, 280),
      fecha: m.timestamp,
      likes: m.like_count ?? null,
      comentarios: m.comments_count ?? null
    }))
  };
}

async function web() {
  const q = encodeURIComponent('"Cerámicas Creare" OR "ceramicascreare"');
  const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=es-419&gl=CO&ceid=CO:es-419`);
  if (!r.ok) throw new Error('Google News respondió ' + r.status);
  const x = await r.text();
  const tag = (s, t) => (s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || '';
  return [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 15).map(([, i]) => ({
    titulo: tag(i, 'title'), url: tag(i, 'link'), fuente: tag(i, 'source'), fecha: new Date(tag(i, 'pubDate')).toISOString()
  }));
}

const salida = { ...previo, actualizado: new Date().toISOString(), estado: {} };
try { salida.instagram = await instagram(); salida.estado.instagram = 'ok'; }
catch (e) { salida.estado.instagram = 'sin cambios: ' + e.message; }
try { const w = await web(); if (w.length) salida.web = w; salida.estado.web = 'ok'; }
catch (e) { salida.estado.web = 'sin cambios: ' + e.message; }

fs.writeFileSync(OUT, JSON.stringify(salida, null, 2));
console.log(JSON.stringify(salida.estado), 'posts:', salida.instagram?.posts?.length || 0, 'web:', salida.web?.length || 0);
