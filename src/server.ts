import "dotenv/config";
import type { Server } from "node:http";
import { prisma } from "../lib/prisma.js";
import { app } from "./app.js";
import { config } from "./config/index.js";

let server: Server | undefined;
let shuttingDown = false;

const closeServer = async (): Promise<void> => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => error ? reject(error) : resolve());
  });
};

export const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; shutting down`);

  try {
    await closeServer();
    await prisma.$disconnect();
    process.exitCode = 0;
  } catch {
    console.error("Graceful shutdown failed");
    process.exitCode = 1;
  }
};

export const startServer = async (): Promise<Server> => {
  await prisma.$connect();
  server = app.listen(config.port, () => {
    console.info(`FoodHub API listening on port ${config.port}`);
  });
  return server;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await startServer();
} catch {
  console.error("Unable to start FoodHub API");
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
}
