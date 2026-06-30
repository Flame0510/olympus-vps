import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    if (!id || id.length < 1) {
      return NextResponse.json(
        { success: false, error: 'Container name or ID is required' },
        { status: 400 },
      );
    }

    // Try to find the container by name first, then by id
    let containerName = id;
    try {
      const found = execSync(
        `docker ps -a --filter "label=AGENT_ID=${id}" --format '{{.Names}}'`,
        { encoding: 'utf-8', timeout: 5000 },
      ).trim();
      if (found) {
        containerName = found;
      }
    } catch {
      // fall through
    }

    execSync(`docker rm -f "${containerName}"`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    // Log event to events.db if it exists
    try {
      const Database = require('better-sqlite3');
      const dbPath = path.join(process.cwd(), 'data', 'events.db');
      if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: false });
        db.pragma('journal_mode = WAL');
        db.prepare(
          `INSERT INTO events (ts, session_id, type, data) VALUES (?, ?, ?, ?)`,
        ).run(Date.now(), `system:agents`, 'agent_deleted', JSON.stringify({
          name: id,
          containerName,
        }));
        db.close();
      }
    } catch {
      // DB logging is optional, ignore failures
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const err = e as Error;
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error' },
      { status: 500 },
    );
  }
}
