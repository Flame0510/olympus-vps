export type ToolStatus = 'Configured' | 'Available' | 'Coming soon';

export interface ToolCatalogItem {
  name: string;
  description: string;
  icon: string;
  status?: ToolStatus;
}

export interface ToolCatalogCategory {
  name: string;
  description: string;
  icon: string; // SVG path data (d attribute)
  viewBox?: string;
  tools: ToolCatalogItem[];
}

export const TOOL_CATALOG: ToolCatalogCategory[] = [
  {
    name: 'File & Code',
    description: 'Read, write, and patch files in the active workspace.',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM6 2v4h8V2M6 6l12 0',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'read', icon: 'M4 6h16M4 12h16M4 18h12', description: 'Read text files and supported images.' },
      { name: 'write', icon: 'M12 3v14m-7-7l7 7 7-7', description: 'Create or overwrite workspace files.' },
      { name: 'edit', icon: 'M15.232 5.232l3.536 3.536M9 11l-3 3V8l3-3a2 2 0 0 1 2.828 0L16.5 8.5a2 2 0 0 1 0 2.828l-5.5 5.5', description: 'Apply precise text replacements.' },
      { name: 'apply_patch', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4', description: 'Apply structured multi-file patches.' },
    ],
  },
  {
    name: 'Shell & Processes',
    description: 'Run commands and manage long-running sessions.',
    icon: 'M4 17l6-6L4 5m8 14h8',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'exec', icon: 'M4 17l6-6L4 5', description: 'Execute shell commands with optional PTY/background mode.' },
      { name: 'process', icon: 'M12 8v4l3 3M12 2a10 10 0 1 0 10 10', description: 'Inspect, poll, and control running command sessions.' },
    ],
  },
  {
    name: 'Web',
    description: 'Search, fetch, and automate browser workflows.',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'web_search', icon: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', description: 'Search the web for current information.' },
      { name: 'web_fetch', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z', description: 'Fetch readable markdown or text from URLs.' },
      { name: 'browser', icon: 'M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9', description: 'Control browser tabs, pages, snapshots, and actions.' },
    ],
  },
  {
    name: 'Devices & Nodes',
    description: 'Interact with paired phones, desktops, and node capabilities.',
    icon: 'M17 1H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3a2 2 0 0 0-2-2zm0 17H7V6h10v12z',
    viewBox: '0 0 24 24',
    tools: [{ name: 'nodes', icon: 'M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7zm4 10V7m8 10V7', description: 'List nodes, notify devices, capture screens, photos, and status.' }],
  },
  {
    name: 'Automation',
    description: 'Scheduled and durable operational automation.',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z',
    viewBox: '0 0 24 24',
    tools: [{ name: 'cron', icon: 'M12 8v4l3 3M12 2a10 10 0 1 0 10 10', description: 'Schedule recurring jobs and maintenance tasks.', status: 'Coming soon' }],
  },
  {
    name: 'Messaging',
    description: 'Send and manage messages across connected channels.',
    icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z',
    viewBox: '0 0 24 24',
    tools: [{ name: 'message', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z', description: 'Send messages, attachments, reactions, polls, and channel actions.' }],
  },
  {
    name: 'Gateway & Config',
    description: 'Gateway lifecycle and configuration operations.',
    icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
    viewBox: '0 0 24 24',
    tools: [{ name: 'gateway', icon: 'M19.14 12.94a3.6 3.6 0 1 0-7.14-1.88M12 8.4V12l1.5 1.5', description: 'Inspect and update OpenClaw gateway configuration.', status: 'Coming soon' }],
  },
  {
    name: 'Sessions & Agents',
    description: 'Inspect sessions and coordinate agent work.',
    icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'agents_list', icon: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2', description: 'List available agents and their status.' },
      { name: 'sessions_list', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 12h6m-6 4h6', description: 'List active and recent sessions.' },
      { name: 'sessions_history', icon: 'M12 8v4l3 3M12 2a10 10 0 1 0 10 10', description: 'Read session transcript history.' },
      { name: 'sessions_send', icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z', description: 'Send messages into existing sessions.' },
      { name: 'sessions_spawn', icon: 'M17 5l4 4-4 4m-6 0H3m14 6l4-4-4-4', description: 'Create delegated agent sessions.' },
      { name: 'sessions_yield', icon: 'M17 5l-4 4 4 4m6-4H3', description: 'Yield while waiting for spawned work to complete.' },
      { name: 'subagents', icon: 'M12 4.354a4 4 0 1 1 0 5.292M9 15H3a1 1 0 0 0-1 1v4m18-5h-6m-3-5a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', description: 'Coordinate subagent execution and results.' },
      { name: 'session_status', icon: 'M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', description: 'Inspect current runtime, model, date, and capability status.' },
    ],
  },
  {
    name: 'Media & AI',
    description: 'Analyze or generate media with configured AI providers.',
    icon: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'image', icon: 'M15 8h.01M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM3 16l5-5 4 4 5-5 4 4', description: 'Analyze images with a vision model.' },
      { name: 'image_generate', icon: 'M4 16l4-4 5 5 3-3 4 4m-5-9a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm2-6a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', description: 'Generate or edit images.' },
      { name: 'music_generate', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z', description: 'Create music, songs, loops, or instrumentals.' },
      { name: 'video_generate', icon: 'M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14M5 18h8a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2z', description: 'Generate videos from text and media references.' },
      { name: 'tts', icon: 'M19 11a7 7 0 0 1-7 7m0 0a7 7 0 0 1-7-7m7 7v4m-4 0h8M5 8h1m7 0h1m-4 3h2', description: 'Convert explicit speech requests into audio.' },
      { name: 'pdf', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM6 2v4h8V2m-2 6v6m-3-3l3 3 3-3', description: 'Analyze PDF documents.' },
    ],
  },
  {
    name: 'File Transfer',
    description: 'Move files and directory listings between paired nodes and the gateway.',
    icon: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'dir_fetch', icon: 'M19 9l-7 7-7-7', description: 'Fetch directory trees from paired nodes.' },
      { name: 'dir_list', icon: 'M9 5H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm10 0h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zM9 15H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2zm10 0h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z', description: 'List node directory metadata.' },
      { name: 'file_fetch', icon: 'M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8l-4-4m0 0L8 8m4-4v12', description: 'Retrieve files from paired nodes.' },
      { name: 'file_write', icon: 'M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4 0l-4 4m0 0l-4-4m4 4V4', description: 'Write files to paired nodes.' },
    ],
  },
  {
    name: 'Memory',
    description: 'Search and read persisted workspace memory.',
    icon: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
    viewBox: '0 0 24 24',
    tools: [
      { name: 'memory_get', icon: 'M4 7v10c0 2 1.5 3 4 3s4-1 4-3V7c0-2-1.5-3-4-3S4 5 4 7zm12 0v10c0 2 1.5 3 4 3s4-1 4-3V7c0-2-1.5-3-4-3s-4 1-4 3z', description: 'Read bounded excerpts from memory files.' },
      { name: 'memory_search', icon: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z', description: 'Semantic search over memory and session records.' },
    ],
  },
  {
    name: 'Planning',
    description: 'Keep multi-step work visible and current.',
    icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM17.99 9l-1.41-1.42-6.59 6.59-2.58-2.57-1.42 1.41 4 3.99z',
    viewBox: '0 0 24 24',
    tools: [{ name: 'update_plan', icon: 'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4', description: 'Create and update the current run plan.' }],
  },
];

export const TOTAL_TOOL_COUNT = TOOL_CATALOG.reduce((total, category) => total + category.tools.length, 0);
