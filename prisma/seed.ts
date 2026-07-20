import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { seedDatabase, seedOptionsFromEnvironment } from "./seed-data.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("Invalid seed configuration: DATABASE_URL is required");

const database = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const result = await seedDatabase(
    database,
    seedOptionsFromEnvironment(process.env, process.argv.includes("--development")),
  );
  console.log(`Seed complete: admin=${result.adminId}, categories=${result.categoryCount}, developmentData=${result.developmentDataSeeded}`);
} finally {
  await database.$disconnect();
}
