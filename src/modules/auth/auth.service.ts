import { APIError } from "better-auth/api";
import { hashPassword, signJWT, verifyJWT, verifyPassword as verifyPasswordCrypto } from "better-auth/crypto";
import { randomBytes } from "node:crypto";
import { auth } from "../../../lib/auth.js";
import { prisma } from "../../../lib/prisma.js";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "../../common/errors/app-error.js";
import { emailService, type EmailSender } from "../../common/email/email.service.js";
import { config } from "../../config/index.js";
import { ownProfileSelect } from "../../common/serialization/selectors.js";
import { serializeOwnProfile } from "../../common/serialization/serializers.js";
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "./auth.schema.js";

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
  verifyPassword?: ({ hash, password }: { hash: string; password: string }) => Promise<boolean>;
  emailSender?: EmailSender;
}

const defaultDependencies: AuthServiceDependencies = {
  database: prisma,
  authApi: {
    signInEmail: (input) => auth.api.signInEmail(input),
    signOut: (input) => auth.api.signOut(input),
    changePassword: (input) => auth.api.changePassword(input),
  },
  hash: hashPassword,
  verifyPassword: verifyPasswordCrypto,
  emailSender: emailService,
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
  if (error instanceof APIError) {
    if (
      error.body?.code === "EMAIL_NOT_VERIFIED" ||
      (error as { code?: string })?.code === "EMAIL_NOT_VERIFIED" ||
      error.message?.toLowerCase().includes("email not verified") ||
      error.status === 403
    ) {
      throw new ForbiddenError(
        "Please verify your email address before logging in.",
        "EMAIL_NOT_VERIFIED",
      );
    }
    throw genericLoginError();
  }
  throw error;
};

export const createAuthService = (dependencies: AuthServiceDependencies = defaultDependencies) => {
  const { database, authApi, hash } = dependencies;
  const verifyPassword = dependencies.verifyPassword ?? verifyPasswordCrypto;
  const emailSender = dependencies.emailSender ?? emailService;

  const generateVerificationToken = (email: string): Promise<string> =>
    signJWT(
      { email: email.toLowerCase(), purpose: "email-verification" },
      config.auth.secret,
      3600,
    );

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
    if (!user.emailVerified) {
      await database.session.deleteMany({ where: { token: signedIn.response.token } });
      throw new ForbiddenError(
        "Please verify your email address before logging in.",
        "EMAIL_NOT_VERIFIED",
      );
    }
    if (user.role === "PROVIDER" && !user.providerProfile) {
      await database.session.deleteMany({ where: { token: signedIn.response.token } });
      throw new ForbiddenError("The provider profile is unavailable.", "PROVIDER_PROFILE_REQUIRED");
    }

    const [updated, account] = await Promise.all([
      database.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: ownProfileSelect,
      }),
      database.account.findFirst({
        where: { userId: user.id },
        select: { accessToken: true, refreshToken: true },
      }),
    ]);
    return {
      data: {
        ...serializeAuthUser(updated),
        token: signedIn.response.token,
        accessToken: account?.accessToken ?? null,
        refreshToken: account?.refreshToken ?? null,
      },
      headers: signedIn.headers,
    };
  };

  return {
    async register(input: RegisterInput, _headers: Headers) {
      const credentialHash = await hash(input.password);
      let createdUserId: string | undefined;

      try {
        await database.$transaction(async (transaction) => {
          const user = await transaction.user.create({
            data: {
              fullName: input.fullName,
              email: input.email,
              phone: input.phone,
              role: input.role,
              emailVerified: false,
            },
            select: { id: true },
          });
          createdUserId = user.id;

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

      // Generate verification token and send activation email via Resend
      const token = await generateVerificationToken(input.email);
      const verificationUrl = `${config.clientUrl}/verify-email?token=${encodeURIComponent(token)}`;

      await emailSender.sendVerificationEmail({
        to: input.email,
        fullName: input.fullName,
        verificationUrl,
      });

      return {
        data: {
          user: {
            id: createdUserId!,
            fullName: input.fullName,
            email: input.email,
            phone: input.phone ?? null,
            role: input.role,
            emailVerified: false,
          },
          emailVerified: false,
          verificationEmailSent: true,
          message: "Registration successful. Please check your email to verify your account.",
        },
        headers: new Headers(),
      };
    },

    login(input: LoginInput, headers: Headers) {
      return signIn(input, headers);
    },

    async verifyEmail(token: string) {
      let payload: { email?: string; purpose?: string } | null = null;
      try {
        payload = await verifyJWT<{ email?: string; purpose?: string }>(token, config.auth.secret);
      } catch {
        throw new BadRequestError("The verification token is invalid or expired.", "INVALID_VERIFICATION_TOKEN");
      }

      if (!payload || !payload.email || payload.purpose !== "email-verification") {
        throw new BadRequestError("The verification token is invalid or expired.", "INVALID_VERIFICATION_TOKEN");
      }

      const user = await database.user.findUnique({
        where: { email: payload.email.toLowerCase() },
        select: { id: true, email: true, emailVerified: true, status: true },
      });

      if (!user) {
        throw new BadRequestError("No account found matching this verification token.", "USER_NOT_FOUND");
      }

      if (user.status === "SUSPENDED") {
        throw new ForbiddenError("This account is suspended.", "ACCOUNT_SUSPENDED");
      }

      if (!user.emailVerified) {
        await database.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      }

      return {
        data: {
          verified: true,
          email: user.email,
          message: "Your email has been verified successfully. You can now log in.",
        },
      };
    },

    async resendVerification(email: string) {
      const normalized = email.toLowerCase().trim();
      const user = await database.user.findUnique({
        where: { email: normalized },
        select: { id: true, fullName: true, email: true, emailVerified: true, status: true },
      });

      // Avoid account enumeration: always return success even if email not found or already verified
      if (user && !user.emailVerified && user.status !== "SUSPENDED") {
        const token = await generateVerificationToken(user.email);
        const verificationUrl = `${config.clientUrl}/verify-email?token=${encodeURIComponent(token)}`;
        await emailSender.sendVerificationEmail({
          to: user.email,
          fullName: user.fullName,
          verificationUrl,
        });
      }

      return {
        data: {
          sent: true,
          message: "If an unverified account with this email exists, a verification link has been sent.",
        },
      };
    },

    async forgotPassword(email: string) {
      const normalized = email.toLowerCase().trim();
      const user = await database.user.findUnique({
        where: { email: normalized },
        select: { id: true, fullName: true, email: true, status: true },
      });

      // Avoid account enumeration: always return success even if email not found or account is suspended
      if (user && user.status !== "SUSPENDED") {
        // Clean up any existing pending reset tokens for this user
        await database.verification.deleteMany({
          where: {
            identifier: { startsWith: "reset-password:" },
            value: user.id,
          },
        });

        const token = randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

        await database.verification.create({
          data: {
            identifier: `reset-password:${token}`,
            value: user.id,
            expiresAt,
          },
        });

        const resetUrl = `${config.clientUrl}/reset-password?token=${encodeURIComponent(token)}`;
        await emailSender.sendPasswordResetEmail({
          to: user.email,
          fullName: user.fullName,
          resetUrl,
        });
      }

      return {
        data: {
          sent: true,
          message: "If an account exists with this email, a password reset link has been sent.",
        },
      };
    },

    async resetPassword(input: ResetPasswordInput, requestId?: string) {
      const verification = await database.verification.findFirst({
        where: { identifier: `reset-password:${input.token}` },
      });

      if (!verification || verification.expiresAt < new Date()) {
        if (verification) {
          await database.verification.delete({ where: { id: verification.id } }).catch(() => {});
        }
        throw new BadRequestError("The password reset link is invalid or has expired.", "INVALID_RESET_TOKEN");
      }

      const user = await database.user.findUnique({
        where: { id: verification.value },
        select: { id: true, email: true, role: true, status: true },
      });

      if (!user) {
        throw new BadRequestError("The password reset link is invalid or has expired.", "INVALID_RESET_TOKEN");
      }

      if (user.status === "SUSPENDED") {
        throw new ForbiddenError("This account is suspended.", "ACCOUNT_SUSPENDED");
      }

      const credentialAccount = await database.account.findFirst({
        where: { userId: user.id, providerId: "credential" },
      });

      if (credentialAccount?.password) {
        const isSamePassword = await verifyPassword({
          hash: credentialAccount.password,
          password: input.newPassword,
        });

        if (isSamePassword) {
          throw new BadRequestError(
            "The new password cannot be the same as your current password.",
            "PASSWORD_SAME_AS_CURRENT",
          );
        }
      }

      const hashedPassword = await hash(input.newPassword);

      await database.$transaction(async (tx) => {
        // Delete the consumed verification token
        await tx.verification.delete({ where: { id: verification.id } });

        // Update password for credential account
        if (credentialAccount) {
          await tx.account.update({
            where: { id: credentialAccount.id },
            data: { password: hashedPassword },
          });
        } else {
          await tx.account.create({
            data: {
              accountId: user.id,
              providerId: "credential",
              userId: user.id,
              password: hashedPassword,
            },
          });
        }

        // Revoke all existing sessions for this user
        await tx.session.deleteMany({
          where: { userId: user.id },
        });

        // Create audit event
        await tx.auditEvent.create({
          data: {
            actorType: "USER",
            actorUserId: user.id,
            actorRole: user.role,
            action: "PASSWORD_CHANGED",
            entityType: "AUTHENTICATION",
            entityId: user.id,
            requestId: requestId ?? null,
          },
        });
      });

      return {
        data: {
          reset: true,
          message: "Your password has been reset successfully. You can now log in.",
        },
      };
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
            "The current password is incorrect.",
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
