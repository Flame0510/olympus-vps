import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasPassword: !!process.env.OLYMPUS_PASSWORD,
    hasJwtSecret: !!process.env.OLYMPUS_JWT_SECRET,
    hasToken: !!process.env.OLYMPUS_TOKEN,
    password: process.env.OLYMPUS_PASSWORD,
  });
}
