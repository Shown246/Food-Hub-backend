import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../src/config/index.js";

const adapter = new PrismaPg({
  connectionString: config.databaseUrl,
  max: config.databasePoolMax,
});
const prisma = new PrismaClient({ adapter });

export { prisma };
