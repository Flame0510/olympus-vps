import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    OLYMPUS_PASSWORD: process.env.OLYMPUS_PASSWORD || '(not set)',
    OLYMPUS_TOKEN: process.env.OLYMPUS_TOKEN || '(not set)',
    OLYMPUS_JWT_SECRET: process.env.OLYMPUS_JWT_SECRET?.substring(0,10) + '...' || '(not set)',
    NODE_ENV: process.env.NODE_ENV,
  });
}
