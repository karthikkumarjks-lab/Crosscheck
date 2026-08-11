import { createApp } from "./server.js";
import { InMemoryRunStore } from "./runStore.js";

const PORT = Number(process.env.PORT ?? 4000);

const app = createApp(new InMemoryRunStore());

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CrossCheck API listening on http://localhost:${PORT}`);
});
