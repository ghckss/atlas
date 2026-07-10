import { createLocalRuntime, loadRuntimeConfig, startHttpServer } from ".";

const config = loadRuntimeConfig(process.env);
const runtime = createLocalRuntime(config);
const server = startHttpServer(runtime, config);

server.on("listening", () => {
  console.log(`Hermes local MVP runtime listening on port ${config.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
