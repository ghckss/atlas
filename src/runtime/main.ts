import {
  createLocalRuntime,
  loadRuntimeConfig,
  startDiscordGateway,
  startHttpServer
} from ".";

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const config = loadRuntimeConfig(process.env);
  const runtime = createLocalRuntime(config);
  const server = startHttpServer(runtime, config);
  const discordClient = await startDiscordGateway(runtime, config);

  server.on("listening", () => {
    console.log(`Hermes local MVP runtime listening on port ${config.port}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      discordClient?.destroy();
      server.close(() => {
        process.exit(0);
      });
    });
  }
}
