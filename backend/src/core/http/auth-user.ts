// Adds what the auth middleware attaches to every authenticated request.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  org_id?: string | null;
  specialty?: string | null;
}

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every route registered after it. */
      user?: AuthUser;
      /** The raw session token from the cookie, so logout can end exactly this session. */
      sessionToken?: string;
    }
  }
}
