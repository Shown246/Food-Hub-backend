import { APIError } from "better-auth/api";
import { hashPassword } from "better-auth/crypto";
import { auth } from "../../../lib/auth.js";
import { prisma } from "../../../lib/prisma.js";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "../../common/errors/app-error.js";
import { ownProfileSelect } from "../../common/serialization/selectors.js";
import { serializeOwnProfile } from "../../common/serialization/serializers.js";
import type { ChangePasswordInput, LoginInput, RegisterInput } from "./auth.schema.js";

type AuthHeadersResult<T> = { headers: Headers; response: T };

interface SignInResult {
  token: string;
  user: { id: string };
}

interface AuthApi {
  signInEmail(input: { body: LoginInput; headers: Headers; returnHeaders: true }): Promise<AuthHeadersResult<SignInResult>>;
  signOut(input: { headers: Headers; returnHeaders: true }): Promise<AuthHeadersResult<{ success: boolean }>>;
  changePassword(input: {
    body: ChangePasswordInput & { revokeOtherSessions: true };
    headers: Headers;
    returnHeaders: true;
  }): Promise<AuthHeadersResult<unknown>>;
}

export interface AuthServiceDependencies {
  database: typeof prisma;
  authApi: AuthApi;
  hash: (password: string) => Promise<string>;
}

const defaultDependencies: AuthServiceDependencies = {
  database: prisma,
  authApi: {
    signInEmail: (input) => auth.api.signInEmail(input),
    signOut: (input) => auth.api.signOut(input),
    changePassword: (input) => auth.api.changePassword(input),
  },
  hash: hashPassword,
};

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "P2002";

const serializeAuthUser = (user: Awaited<ReturnType<typeof findAuthUser>>) => {
  if (!user) throw new UnauthorizedError();
  return serializeOwnProfile(user);
};

const findAuthUser = (database: typeof prisma, userId: string) => database.user.findUnique({
  where: { id: userId },
  select: ownProfileSelect,
});

const genericLoginError = () => new UnauthorizedError(
  "The email or password is incorrect.",
  "INVALID_CREDENTIALS",
);

const translateSignInError = (error: unknown): never => {
  if (error instanceof APIError) throw genericLoginError();
  throw error;
};

export const createAuthService = (dependencies: AuthServiceDependencies = defaultDependencies) => {
  const { database, authApi, hash } = dependencies;

  const signIn = async (input: LoginInput, headers: Headers) => {
    const signedIn = await authApi
      .signInEmail({ body: input, headers, returnHeaders: true })
      .catch(translateSignInError);

    const user = await findAuthUser(database, signedIn.response.user.id);
    if (!user) {
      await database.session.deleteMany({ where: { token: signedIn.response.token } });
      throw genericLoginError();
    }
    if (user.status === "SUSPENDED") {
      await database.session.deleteMany({ where: { token: signedIn.response.token } });
      throw new ForbiddenError("This account is suspended.", "ACCOUNT_SUSPENDED");
    }
    if (user.role === "PROVIDER" && !user.providerProfile) {
      await database.session.deleteMany({ where: { token: signedIn.response.token } });
      throw new ForbiddenError("The provider profile is unavailable.", "PROVIDER_PROFILE_REQUIRED");
    }

    const updated = await database.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: ownProfileSelect,
    });
    return { data: serializeAuthUser(updated), headers: signedIn.headers };
  };

  return {
    async register(input: RegisterInput, headers: Headers) {
      const credentialHash = await hash(input.password);
      try {
        await database.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              role: input.role,
            },
            select: { id: true },
          });
          await transaction.account.create({
            data: {
              accountId: user.id,
              providerId: "credential",
              userId: user.id,
              password: credentialHash,
            },
          });
          if (input.role === "PROVIDER") {
            await transaction.providerProfile.create({
              data: {
                userId: user.id,
                name: input.providerName,
                description: input.providerDescription,
                address: input.providerAddress,
                phone: input.providerPhone,
              },
            });
          }
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw new ConflictError("An account with this email already exists.", "EMAIL_ALREADY_REGISTERED");
        }
        throw error;
      }

      return signIn({ email: input.email, password: input.password }, headers);
    },

    login(input: LoginInput, headers: Headers) {
      return signIn(input, headers);
    },

    async currentUser(userId: string) {
      const user = await findAuthUser(database, userId);
      return serializeAuthUser(user);
    },

    async logout(headers: Headers) {
      const result = await authApi.signOut({ headers, returnHeaders: true });
      return { data: { loggedOut: true }, headers: result.headers };
    },

    async changePassword(userId: string, requestId: string, input: ChangePasswordInput, headers: Headers) {
      let changed: AuthHeadersResult<unknown>;
      try {
        changed = await authApi.changePassword({
          body: { ...input, revokeOtherSessions: true },
          headers,
          returnHeaders: true,
        });
      } catch (error) {
        if (error instanceof APIError) {
          throw new ValidationError(
            { currentPassword: "The current password is incorrect." },
            "The password could not be changed.",
          );
        }
        throw error;
      }

      await database.auditEvent.create({
        data: {
          actorType: "USER",
          actorUserId: userId,
          actorRole: (await database.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } })).role,
          action: "PASSWORD_CHANGED",
          entityType: "AUTHENTICATION",
          entityId: userId,
          requestId,
        },
      });
      return { data: { passwordChanged: true }, headers: changed.headers };
    },
  };
};

export const authService = createAuthService();
export type AuthService = ReturnType<typeof createAuthService>;
