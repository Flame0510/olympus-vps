import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const TOKEN_PATH = path.join(process.cwd(), 'data', 'agents-token.json');

interface TokenData {
  token: string;
  updated_at: number;
}

function readTokenFile(): TokenData {
  try {
    const raw = fs.readFileSync(TOKEN_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      token: typeof data.token === 'string' ? data.token : '',
      updated_at: typeof data.updated_at === 'number' ? data.updated_at : 0,
    };
  } catch {
    return { token: '', updated_at: 0 };
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(readTokenFile());
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token : null;

    if (token === null) {
      return NextResponse.json(
        { success: false, error: 'Invalid token payload' },
        { status: 400 },
      );
    }

    const payload: TokenData = {
      token,
      updated_at: Date.now(),
    };

    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload, null, 2));

    let containersUpdated = 0;
    let containerNames: string[] = [];

    try {
      const raw = execSync(
        `docker ps --filter "label=AGENT_ID" --format "{{.Names}}"`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      containerNames = raw ? raw.split('\n').map((name) => name.trim()).filter(Boolean) : [];
    } catch {
      containerNames = [];
    }

    for (const containerName of containerNames) {
      try {
        // Write token to /root/.agent-token (entrypoint reads this, overrides env var)
        execSync(
          `docker exec ${shellQuote(containerName)} sh -c 'echo ${shellQuote(token)} > /root/.agent-token'`,
          { encoding: 'utf-8', timeout: 10000 },
        );
        // Restart to pick up new token
        execSync(`docker restart ${shellQuote(containerName)}`, {
          encoding: 'utf-8',
          timeout: 20000,
        });
        containersUpdated += 1;
      } catch {
        // Skip failed containers and continue syncing the rest.
      }
    }

    return NextResponse.json({ success: true, containersUpdated });
  } catch (e: unknown) {
    return NextResponse.json(
      { success: false, error: (e as Error).message || 'Unknown error' },
      { status: 500 },
    );
  }
}
