import type { Request, RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../../lib/auth.js";
import { prisma } from "../../../lib/prisma.js";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../errors/app-error.js";
import type { AppRole, SessionIdentity } from "../auth/types.js";

interface AuthUserRecord {
  id: string;
  role: AppRole;
  status: "ACTIVE" | "SUSPENDED";
  providerProfile: { id: string } | null;
}

export interface AuthenticationDependencies {
  resolveSession: (headers: Headers) => Promise<SessionIdentity | null>;
  findUser: (userId: string) => Promise<AuthUserRecord | null>;
}

const defaultDependencies: AuthenticationDependencies = {
  resolveSession: async (headers) => auth.api.getSession({ headers }) as Promise<SessionIdentity | null>,
  findUser: (userId) => prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      status: true,
      providerProfile: { select: { id: true } },
    },
  }),
};

export const createAuthenticate = (
  dependencies: AuthenticationDependencies = defaultDependencies,
): RequestHandler => async (request, _response, next) => {
  try {
    const identity = await dependencies.resolveSession(fromNodeHeaders(request.headers));
    if (!identity) throw new UnauthorizedError();

    const user = await dependencies.findUser(identity.user.id);
    if (!user) throw new UnauthorizedError();
    if (user.status === "SUSPENDED") {
      throw new ForbiddenError("This account is suspended.", "ACCOUNT_SUSPENDED");
    }
    if (user.role === "PROVIDER" && !user.providerProfile) {
      throw new ForbiddenError("The provider profile is unavailable.", "PROVIDER_PROFILE_REQUIRED");
    }

    request.auth = {
      userId: user.id,
      sessionId: identity.session.id,
      role: user.role,
      providerId: user.providerProfile?.id ?? null,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const authenticate = createAuthenticate();

export const requireRole = (...roles: AppRole[]): RequestHandler => (request, _response, next) => {
  if (!request.auth) {
    next(new UnauthorizedError());
    return;
  }
  if (!roles.includes(request.auth.role)) {
    next(new ForbiddenError());
    return;
  }
  next();
};

type OwnershipResolver = (request: Request) => string | null | undefined | Promise<string | null | undefined>;

export const requireUserOwnership = (resolveOwnerId: OwnershipResolver): RequestHandler =>
  async (request, _response, next) => {
    try {
      if (!request.auth) throw new UnauthorizedError();
      const ownerId = await resolveOwnerId(request);
      if (!ownerId || ownerId !== request.auth.userId) throw new NotFoundError();
      next();
    } catch (error) {
      next(error);
    }
  };

export const requireProviderOwnership = (resolveProviderId: OwnershipResolver): RequestHandler =>
  async (request, _response, next) => {
    try {
      if (!request.auth) throw new UnauthorizedError();
      const providerId = await resolveProviderId(request);
      if (!providerId || providerId !== request.auth.providerId) throw new NotFoundError();
      next();
    } catch (error) {
      next(error);
    }
  };
