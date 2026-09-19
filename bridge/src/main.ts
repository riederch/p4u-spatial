import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { createRepositoryProvider } from "./repository/factory.js";
import { BridgeConfigStore } from "./services/bridge-config-store.js";
import { AdminUserService } from "./services/admin-user-service.js";
import { SetupBootstrapService } from "./services/setup-bootstrap-service.js";

const bootstrapConfig = loadConfig();
const configStore = new BridgeConfigStore(bootstrapConfig.stateDir, bootstrapConfig);
const config = await configStore.loadOrMigrate();

const setupBootstrap = new SetupBootstrapService(config.stateDir);
const adminUsers = new AdminUserService(config.stateDir);
const users = await adminUsers.list();
if (users.length === 0) {
  const setup = await setupBootstrap.ensure();
  process.stderr.write(
    `\nP4U Spatial first-run setup code:\n\n  ${setup.proof}\n\nOpen /admin and enter this code. It becomes invalid after a permanent login method is configured.\n\n`,
  );
} else {
  const setup = await setupBootstrap.status();
  if (setup.available) {
    const current = await setupBootstrap.ensure();
    process.stderr.write(
      `\nP4U Spatial setup is incomplete. Setup code:\n\n  ${current.proof}\n\nOpen /admin to finish configuring a permanent login method.\n\n`,
    );
  }
}

const repository = await createRepositoryProvider(config);
const app = buildServer(config, repository, { configStore });

await app.listen({ host: config.host, port: config.port });
