import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const accessSecret = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-access-secret-change-in-production"
);
const refreshSecret = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-in-production"
);

export interface AccessTokenPayload extends JWTPayload {
  sub: string;
  type: "access";
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  type: "refresh";
  jti: string;
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("tether")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(accessSecret);
}

export async function signRefreshToken(userId: string, jti: string): Promise<string> {
  return new SignJWT({ type: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setJti(jti)
    .setIssuer("tether")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessSecret, {
    issuer: "tether",
    algorithms: ["HS256"],
  });
  return payload as AccessTokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, refreshSecret, {
    issuer: "tether",
    algorithms: ["HS256"],
  });
  return payload as RefreshTokenPayload;
}
