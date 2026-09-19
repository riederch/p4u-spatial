import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { createRepositoryProvider } from "./repository/factory.js";
import { BridgeConfigStore } from "./services/bridge-config-store.js";

const bootstrapConfig = loadConfig();
const configStore = new BridgeConfigStore(bootstrapConfig.stateDir, bootstrapConfig);
const config = await configStore.loadOrMigrate();
const repository = await createRepositoryProvider(config);
const app = buildServer(config, repository, { configStore });

await app.listen({ host: config.host, port: config.port });
