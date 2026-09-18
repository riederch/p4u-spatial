import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { createRepositoryProvider } from "./repository/factory.js";

const config = loadConfig();
const repository = await createRepositoryProvider(config);
const app = buildServer(config, repository);

await app.listen({ host: config.host, port: config.port });
