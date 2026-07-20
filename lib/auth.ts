import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config } from "../src/config/index.js";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
  baseURL: config.auth.baseUrl,
  secret: config.auth.secret,
  trustedOrigins: config.corsOrigins,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    fields: {
      name: "fullName",
      image: "profileImageUrl",
    },
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
    },
  },
});
