import { loadConfig } from "./config.js";
import { createApp } from "./app.js";

const config = loadConfig();
const server = createApp(config).listen(config.port, () => {
  console.log(`MCP server for ${config.resource.href} on port ${config.port}`);
});

// Podman stops the container with SIGTERM: finish requests, then exit
const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10_000).unref(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
