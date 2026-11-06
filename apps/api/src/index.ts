import { createApp } from "./server.js";
import { InMemoryRunStore } from "./runStore.js";

const PORT = Number(process.env.PORT ?? 4000);

// onlinemanipal.com's Cloudflare edge answers 403 to Node's own TLS stack
// but accepts curl (same honest CrossCheckBot User-Agent) -- see
// modules/website-quality/src/transport.ts. Read lazily on each request, so
// setting it here, after the imports above have run, is sufficient. Set
// CROSSCHECK_HTTP_TRANSPORT=node to opt back out.
process.env.CROSSCHECK_HTTP_TRANSPORT ??= "curl";

const app = createApp(new InMemoryRunStore());

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CrossCheck API listening on http://localhost:${PORT}`);
});
