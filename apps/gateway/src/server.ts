import { createGatewayApplication } from "./app.js";

async function main() {
  const app = await createGatewayApplication();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({
    port,
    host
  });

  app.log.info(`Lightway gateway is listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
