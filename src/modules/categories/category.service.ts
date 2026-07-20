import { prisma } from "../../../lib/prisma.js";
import { NotFoundError } from "../../common/errors/app-error.js";
import { publicCategorySelect } from "../../common/serialization/selectors.js";
import { serializePublicCategory } from "../../common/serialization/serializers.js";

export interface CategoryServiceDependencies {
  database: typeof prisma;
}

export const createCategoryService = (
  { database }: CategoryServiceDependencies = { database: prisma },
) => ({
  async listActive() {
    const categories = await database.category.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: publicCategorySelect,
    });
    return categories.map(serializePublicCategory);
  },

  async getActive(categoryId: string) {
    const category = await database.category.findFirst({
      where: { id: categoryId, isActive: true },
      select: publicCategorySelect,
    });
    if (!category) throw new NotFoundError("The category was not found.", "CATEGORY_NOT_FOUND");
    return serializePublicCategory(category);
  },
});

export const categoryService = createCategoryService();
export type CategoryService = ReturnType<typeof createCategoryService>;
