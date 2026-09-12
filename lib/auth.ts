import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { config } from "../src/config/index.js";
import { prisma } from "./prisma.js";
import { bearer } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: config.auth.baseUrl,
  secret: config.auth.secret,
  trustedOrigins: config.corsOrigins,
  plugins: [bearer()],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: false,
    expiresIn: 3600,
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
