import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { FilesystemRepositoryProvider } from "./repository/filesystem.js";

const config = loadConfig();
const repository = new FilesystemRepositoryProvider(config.repositoryRoot);
const app = buildServer(config, repository);

await app.listen({ host: config.host, port: config.port });
