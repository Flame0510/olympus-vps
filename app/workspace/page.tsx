import type { Metadata } from 'next';
import WorkspaceClient from './WorkspaceClient';

export const metadata: Metadata = { title: 'Workspace — Olympus' };

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
