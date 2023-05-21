interface Env {
  DISCORD_TOKEN: string;
  QUERIES: KVNamespace
}
type ROUTEFUNC = (request: Request, env: Env) => Promise<Response>;

const genHex = (length: Number) => [...Array(length)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

const API_BASE = "https://discord.com/api/v10"

const API = async (path: string, env: Env): Promise<any> => {
  let req = await fetch(API_BASE + path, {
    headers: {
      "content-type": "application/json",
      "user-agent": "AssystTagAPI Worker/0.0",
      "authorization": "Bot " + env.DISCORD_TOKEN
    }
  })
  return await req.json()
}

const serverinfo = async (request: Request, env: Env): Promise<Response> => {
  let params = new URL(request.url).searchParams;

  let query = params.get("query");
  if (query) return new Response(await env.QUERIES.get(query))

  let servers = params.get("servers");
  if (!servers) return new Response('{"summary": "No server IDs provided"}', {status: 400})

  let serverlist = servers.split(" ");
  if (serverlist.length > 5) return new Response('{"summary": "Only 5 IDs can be checked at once. Blame Discord ratelimits."}', {status: 400})

  let fullres: string[] = [];
  let summary: string[] = [];
  for (let server of serverlist) {
    let res = await API(`/guilds/${server}/preview`, env);
    if ("code" in res && "message" in res) continue;
    if ("retry_after" in res && "message" in res) return new Response(`{"summary": "Got ratelimited. Try again in ${Math.round(res.retry_after) + 2} seconds"}`, {status: 503})

    // Delete useless datat that takes up majority of response
    delete res.emojis
    delete res.stickers

    fullres.push(JSON.stringify(res, null, 2));
    summary.push(`${res.id} - ${res.name}`);
  }

  let queryID = null;
  if (fullres.length != 0) {
    queryID = genHex(8);
    await env.QUERIES.put(queryID, fullres.join("\n\n--------\n\n"));
  }

  if (summary.length == 0) summary.push("None of the server IDs provided were public");

  return new Response(JSON.stringify({
    summary: summary.join("\n"),
    query_id: queryID
  }), {
    headers: {
      "content-type": "application/json;charset=UTF-8",
    }
  });
}

const health = async (request: Request, env: Env): Promise<Response> => {
  console.log(request);

  let api = await API("/users/@me", env);
  let res = JSON.stringify(api);
  return new Response(res, {
    headers: {
      "content-type": "application/json;charset=UTF-8",
    }
  });
}

const ROUTEMAP: Record<string, ROUTEFUNC> = {
  "GET /a/health": health,
  "GET /a/serverinfo": serverinfo
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    let route = `${request.method} ${new URL(request.url).pathname}`;

    if (!(route in ROUTEMAP)) return new Response(null, {status: 404});

    return await ROUTEMAP[route](request, env);
  }
};