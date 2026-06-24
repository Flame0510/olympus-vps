import { NextResponse, type NextRequest } from 'next/server';
import * as http from 'http';

const DOCKER_SOCKET = '/var/run/docker.sock';

function dockerFetch(method: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      socketPath: DOCKER_SOCKET,
      path,
      method,
      headers: { 'Host': 'localhost' } as any,
    };
    const req = http.request(options, (res: any) => {
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON from Docker API'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    // List all running containers with AGENT_ID label via Docker API
    const containers: any[] = await dockerFetch(
      'GET',
      '/containers/json?filters={"label":["AGENT_ID"]}',
    );

    const agents = await Promise.all(
      containers.map(async (c: any) => {
        const agentId = c.Labels?.AGENT_ID || 'unknown';
        let ip: string | null = null;
        let created: string | null = null;
        let env: string[] = [];

        try {
          const inspect: any = await dockerFetch(
            'GET',
            `/containers/${c.Id}/json`,
          );
          const networks: Record<string, any> =
            inspect.NetworkSettings?.Networks || {};
          ip =
            Object.values(networks).find(
              (n: any) => n.IPAddress,
            )?.IPAddress || null;
          created = inspect.Created || null;
          env = (inspect.Config?.Env || []).filter((e: string) =>
            e.startsWith('AGENT_') || e.startsWith('MODEL_')
          );
        } catch {
          // inspect non-critical, continue with partial data
        }

        // Determine template from image name or AGENT_ID
        const image: string = c.Image || '';
        let template: string | null = null;
        if (image.startsWith('nexus-agent-base')) {
          // Template matches agentId if there is a dir with that name
          template = agentId;
        }

        const ports = (c.Ports || [])
          .filter((p: any) => p.PublicPort)
          .map(
            (p: any) =>
              `${p.PublicPort}:${p.PrivatePort}${p.Type === 'udp' ? '/udp' : ''}`,
          )
          .join(', ');

        return {
          id: (c.Id || '').slice(0, 12),
          agentId,
          name: (c.Names?.[0] || '').replace(/^\//, ''),
          image,
          imageTag: image.includes(':') ? image.split(':')[1] || 'latest' : (image.includes('@') ? 'digest' : 'latest'),
          template,
          status: c.Status || 'unknown',
          state: c.State || 'unknown',
          ports,
          ip,
          created,
          env,
        };
      }),
    );

    // Deduplicate by agentId > use the running one when multiple
    const seen = new Map<string, typeof agents[0]>();
    for (const agent of agents) {
      const existing = seen.get(agent.agentId);
      if (!existing || (agent.state === 'running' && existing.state !== 'running')) {
        seen.set(agent.agentId, agent);
      }
    }

    return NextResponse.json(Array.from(seen.values()));
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
