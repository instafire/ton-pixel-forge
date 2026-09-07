// TON Pixel Forge - metadata + app host worker (KV-backed)
// Serves: app files, tonconnect manifest, collection/item metadata, GIFs

const APP_FILES = ["index.html", "styles.css", "app.js", "art.js", "icon.png", "mock.jpg"];

const MANIFEST = {
  name: "TON Pixel Forge",
  iconUrl: "icon.png",
  termsOfUseUrl: "https://ton.org/terms",
  privacyPolicyUrl: "https://ton.org/privacy"
};

function baseHeaders(extra) {
  const h = Object.assign({
    "Access-Control-Allow-Origin": "*"
  }, extra || {});
  return h;
}

function jsonResp(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: baseHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60"
    })
  });
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}

async function serveAppFile(env, name, origin) {
  let rec = await env.FORGE_KV.get("asset:" + name, "json");
  if (typeof rec === "string") rec = JSON.parse(rec);
  if (!rec || !rec.body) return new Response("missing asset", { status: 404 });
  let body = rec.body;
  if (name === "app.js") body = body.split("__WORKER_BASE__").join(origin);
  if (name === "index.html") body = body.split("__WORKER_BASE__").join(origin);
  if (name === "icon.png" || name === "mock.jpg") {
    const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
    return new Response(bytes, { headers: baseHeaders({ "Content-Type": rec.type, "Cache-Control": "public, max-age=86400" }) });
  }
  return new Response(body, { headers: baseHeaders({ "Content-Type": rec.type, "Cache-Control": "public, max-age=300" }) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = url.origin;

    if (request.method === "OPTIONS") return corsPreflight();

    if (request.method === "GET") {
      if (path === "/" || path === "/index.html") return serveAppFile(env, "index.html", origin);
      if (path === "/styles.css") return serveAppFile(env, "styles.css", origin);
      if (path === "/art.js") return serveAppFile(env, "art.js", origin);
      if (path === "/app.js") return serveAppFile(env, "app.js", origin);
      if (path === "/icon.png") return serveAppFile(env, "icon.png", origin);
      if (path === "/mock.jpg") return serveAppFile(env, "mock.jpg", origin);

      if (path === "/tonconnect-manifest.json") {
        const m = Object.assign({}, MANIFEST, { url: origin, iconUrl: origin + "/icon.png" });
        return jsonResp(m);
      }

      const metaMatch = path.match(/^\/meta\/([a-z0-9]+)\/(collection\.json|(\d+)\.json|(\d+)\.gif)$/);
      if (metaMatch) {
        const collId = metaMatch[1];
        if (metaMatch[2] === "collection.json") {
          const v = await env.FORGE_KV.get("meta:" + collId + ":collection");
          if (!v) return jsonResp({ error: "not found" }, 404);
          return new Response(v, { headers: baseHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" }) });
        }
        const idx = metaMatch[3] || metaMatch[4];
        if (path.endsWith(".gif")) {
          const b64 = await env.FORGE_KV.get("gif:" + collId + ":" + idx);
          if (!b64) return jsonResp({ error: "not found" }, 404);
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          return new Response(bytes, { headers: baseHeaders({ "Content-Type": "image/gif", "Cache-Control": "public, max-age=31536000, immutable" }) });
        }
        const v = await env.FORGE_KV.get("meta:" + collId + ":" + idx);
        if (!v) return jsonResp({ error: "not found" }, 404);
        return new Response(v, { headers: baseHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" }) });
      }

      return new Response("TON Pixel Forge", { status: 200, headers: { "Content-Type": "text/plain" } });
    }

    if (request.method === "POST" && path === "/mint") {
      let body;
      try { body = await request.json(); } catch (e) { return jsonResp({ error: "bad json" }, 400); }
      const collId = String(body.collId || "").replace(/[^a-z0-9]/g, "");
      const index = parseInt(body.index, 10);
      if (!collId || isNaN(index) || index < 0) return jsonResp({ error: "bad collId or index" }, 400);
      if (!body.gif || typeof body.gif !== "string" || body.gif.length > 14000000) {
        return jsonResp({ error: "gif missing or too large" }, 400);
      }

      const itemMeta = {
        name: String(body.name || "Pixel Forge NFT").slice(0, 80),
        description: String(body.collectionDesc || "Animated pixel art minted on TON"),
        image: origin + "/meta/" + collId + "/" + index + ".gif",
        attributes: Array.isArray(body.attributes) ? body.attributes.slice(0, 20) : [],
        royalty: { royalty_percent: Number(body.royalty) || 0, royalty_address: body.owner || "" }
      };
      await env.FORGE_KV.put("meta:" + collId + ":" + index, JSON.stringify(itemMeta));
      await env.FORGE_KV.put("gif:" + collId + ":" + index, body.gif);

      let collMeta = await env.FORGE_KV.get("meta:" + collId + ":collection");
      if (!collMeta) {
        collMeta = JSON.stringify({
          name: String(body.collectionName || "Pixel Forge Collection"),
          description: String(body.collectionDesc || "Animated pixel art minted on TON"),
          image: origin + "/icon.png",
          cover_image: origin + "/icon.png",
          social_links: []
        });
        await env.FORGE_KV.put("meta:" + collId + ":collection", collMeta);
      }
      return jsonResp({ ok: true, item: itemMeta.image });
    }

    if (request.method === "POST" && path === "/mockgen") {
      return jsonResp({ url: origin + "/mock.jpg", created: Date.now() });
    }

    return jsonResp({ error: "method not allowed" }, 405);
  }
};