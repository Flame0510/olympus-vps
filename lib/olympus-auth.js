import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getExpectedToken() {
  return process.env.OLYMPUS_TOKEN || "olympus2026";
}

export function requireAuth(request) {
  const auth = request.headers.get("authorization");
  if (!auth || auth !== `Bearer ${getExpectedToken()}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.OLYMPUS_JWT_SECRET || "olympus-jwt-secret-change-in-prod"
);

export async function requireAuthJWT(request) {
  const cookieToken = request.cookies?.get?.("olympus_token")?.value;
  if (cookieToken) {
    try {
      await jwtVerify(cookieToken, JWT_SECRET);
      return null;
    } catch {}
  }

  const auth = request.headers.get("authorization");
  const expectedToken = process.env.OLYMPUS_TOKEN || "olympus2026";
  if (auth === `Bearer ${expectedToken}`) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
