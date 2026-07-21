import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { seedDatabase, seedOptionsFromEnvironment, seedRichDevelopmentFixtures } from "./seed-data.js";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("Invalid seed configuration: DATABASE_URL is required");

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
