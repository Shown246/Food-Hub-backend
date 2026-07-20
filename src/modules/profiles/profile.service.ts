import { prisma } from "../../../lib/prisma.js";
import { NotFoundError, UnauthorizedError } from "../../common/errors/app-error.js";
import { ownProfileSelect, publicProviderSelect } from "../../common/serialization/selectors.js";
import { serializeOwnProfile, serializePublicProvider } from "../../common/serialization/serializers.js";
import type { UpdateProfileInput, UpdateProviderProfileInput } from "./profile.schema.js";

export interface ProfileServiceDependencies {
  database: typeof prisma;
}

export const createProfileService = (
  { database }: ProfileServiceDependencies = { database: prisma },
) => ({
  async getOwnProfile(userId: string) {
    const profile = await database.user.findUnique({
      where: { id: userId },
      select: ownProfileSelect,
    });
    if (!profile) throw new UnauthorizedError();
    return serializeOwnProfile(profile);
  },

  async updateOwnProfile(userId: string, input: UpdateProfileInput) {
    const profile = await database.user.update({
      where: { id: userId },
      data: input,
      select: ownProfileSelect,
    });
    return serializeOwnProfile(profile);
  },

  async updateOwnProviderProfile(providerId: string, input: UpdateProviderProfileInput) {
    const provider = await database.providerProfile.update({
      where: { id: providerId },
      data: input,
      select: publicProviderSelect,
    }).catch((error: unknown) => {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
        throw new NotFoundError("The provider profile was not found.", "PROVIDER_PROFILE_NOT_FOUND");
      }
      throw error;
    });
    return { providerProfile: serializePublicProvider(provider) };
  },
});

export const profileService = createProfileService();
export type ProfileService = ReturnType<typeof createProfileService>;
