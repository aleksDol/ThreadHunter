import jwt from "jsonwebtoken";

import { getJwtSecretOrThrow } from "../../config/env";

export type AuthRole = "owner";

export type AuthTokenPayload = {
  userId: string;
  workspaceId: string;
  role: AuthRole;
};

export function signSessionToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, getJwtSecretOrThrow(), { expiresIn: "7d" });
}

export function verifySessionToken(token: string): AuthTokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecretOrThrow()) as AuthTokenPayload;
  } catch {
    return null;
  }
}
