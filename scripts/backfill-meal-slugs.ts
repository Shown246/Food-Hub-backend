import { prisma } from "../lib/prisma.js";
import { allocateMealSlug } from "../src/modules/provider-meals/provider-meal.service.js";

export const backfillMealSlugs = async (database = prisma): Promise<{ updatedCount: number }> => {
  const unsluggedMeals = await database.meal.findMany({
    where: { slug: null },
    select: { id: true, providerId: true, name: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  let updatedCount = 0;
  for (const meal of unsluggedMeals) {
    await database.$transaction(async (transaction) => {
      const slug = await allocateMealSlug(transaction, meal.providerId, meal.name, meal.id);
      await transaction.meal.update({
        where: { id: meal.id },
        data: { slug },
      });
    });
    updatedCount += 1;
  }

  return { updatedCount };
};

const run = async () => {
  try {
    console.log("Starting meal slug backfill...");
    const { updatedCount } = await backfillMealSlugs(prisma);
    console.log(`Backfill completed successfully. ${updatedCount} meals updated.`);
  } catch (error) {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
};

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^[./]+/, ""))) {
  void run();
}
