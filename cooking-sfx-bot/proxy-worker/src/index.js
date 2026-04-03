export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // トンネルURL更新API: POST /update-tunnel
    if (url.pathname === "/update-tunnel" && request.method === "POST") {
      const authHeader = request.headers.get("X-Auth-Key");
      if (authHeader !== env.AUTH_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }
      const body = await request.json();
      if (!body.tunnel_url) {
        return new Response("Missing tunnel_url", { status: 400 });
      }
      await env.KV.put("tunnel_url", body.tunnel_url);
      return Response.json({ ok: true, tunnel_url: body.tunnel_url });
    }

    // ヘルスチェック
    if (url.pathname === "/health") {
      const tunnelUrl = await env.KV.get("tunnel_url");
      return Response.json({ status: "ok", tunnel_url: tunnelUrl || "not set" });
    }

    // それ以外は全てトンネルへプロキシ
    const tunnelUrl = await env.KV.get("tunnel_url");
    if (!tunnelUrl) {
      return new Response("Tunnel URL not configured", { status: 503 });
    }

    const targetUrl = tunnelUrl + url.pathname + url.search;
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    try {
      return await fetch(proxyRequest);
    } catch (e) {
      return new Response("Tunnel unreachable: " + e.message, { status: 502 });
    }
  },
};
