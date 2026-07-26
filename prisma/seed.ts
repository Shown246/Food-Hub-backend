import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { seedDatabase, seedOptionsFromEnvironment, seedRichDevelopmentFixtures } from "./seed-data.js";

const runtimeEnv = process.env.NODE_ENV?.trim() || "development";
const databaseUrlName = runtimeEnv === "production" ? "DATABASE_URL" : "TEST_DATABASE_URL";
const databaseUrl = process.env[databaseUrlName]?.trim();
if (!databaseUrl) throw new Error(`Invalid seed configuration: ${databaseUrlName} is required`);

const database = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

try {
  const options = seedOptionsFromEnvironment(process.env, process.argv.includes("--development"));
  const result = await seedDatabase(database, options);
  if (result.developmentDataSeeded && options.developmentPassword) {
    await seedRichDevelopmentFixtures(database, options.developmentPassword);
  }
  console.log(`Seed complete: admin=${result.adminId}, categories=${result.categoryCount}, developmentData=${result.developmentDataSeeded}`);
} finally {
  await database.$disconnect();
}
