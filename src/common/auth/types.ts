export type AppRole = "ADMIN" | "CUSTOMER" | "PROVIDER";

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: AppRole;
  providerId: string | null;
}

export interface SessionIdentity {
  session: { id: string };
  user: { id: string };
}
