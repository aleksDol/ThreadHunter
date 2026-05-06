import { NextFunction, Request, Response } from "express";

import { verifySessionToken, type AuthTokenPayload } from "../modules/auth/jwt";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.header("authorization");
  if (!authHeader) return null;

  const [type, token] = authHeader.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export function getAuthContext(req: Request): AuthTokenPayload | null {
  const cookieToken = req.cookies?.session as string | undefined;
  const bearerToken = getBearerToken(req);
  const token = cookieToken || bearerToken;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuthContext(req);

  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.auth = auth;
  next();
}
