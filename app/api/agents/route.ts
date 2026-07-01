import { NextResponse, type NextRequest } from 'next/server';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

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
        let authToken: string | null = null;
        let traefikUrl: string | null = null;

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

          // Read auth token — always prefer the shared agents-token.json (user-managed)
          const cName = (c.Names?.[0] || '').replace(/^\//, '');
          try {
            const tokenRaw = fs.readFileSync(
              path.join(process.cwd(), 'data', 'agents-token.json'),
              'utf-8'
            );
            const tokenData = JSON.parse(tokenRaw);
            if (tokenData.token) {
              authToken = tokenData.token;
            }
          } catch {
            // agents-token.json unavailable
          }

          // Fallback only if shared token is missing: try the container's own gateway token
          if (!authToken) {
            try {
              const { execSync } = require('child_process');
              let token = execSync(
                `docker exec ${cName} sh -c 'grep ^OPENCLAW_GATEWAY_TOKEN= /root/….env 2>/dev/null | cut -d= -f2- | tr -d "\"\""' 2>/dev/null || echo ''`,
                { timeout: 5000, encoding: 'utf-8' }
              ).toString().trim();
              if (token && token !== 'undefined') authToken = token;
            } catch {
              // token unavailable for this container
            }
          }

          // Build Traefik URL from the traefik router rule label, fallback to container name
          const labels = c.Labels || {};
          const routerRule = Object.keys(labels).find(k => k.startsWith('traefik.http.routers.') && k.endsWith('.rule'));
          if (labels['traefik.enable'] === 'true') {
            if (routerRule) {
              const rule = labels[routerRule];
              // Extract host from rule like Host(`...`)
              const hostMatch = rule.match(/Host\([`'"]([^`'"]+)[`'"]\)/);
              if (hostMatch) {
                let baseUrl = `https://${hostMatch[1]}`;
                // Control UI expects shared-secret bootstrap in the hash fragment.
                if (authToken) {
                  baseUrl += `#token=${encodeURIComponent(authToken)}`;
                }
                traefikUrl = baseUrl;
              }
            }
            if (!traefikUrl) {
              // Fallback: use AGENT_ID as subdomain
              traefikUrl = `https://${agentId}.srv1490011.hstgr.cloud`;
              if (authToken) {
                traefikUrl += `#token=${encodeURIComponent(authToken)}`;
              }
            }
          }
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
          traefikUrl,
          authToken,
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
