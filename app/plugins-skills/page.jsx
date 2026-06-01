'use client';

import { useState, useEffect, useCallback } from 'react';

const TOKEN = 'olympus2026';
const AUTH = { Authorization: `Bearer ${TOKEN}` };

// ─── helpers ────────────────────────────────────────────────────────────────

function Badge({ children, color }) {
  const colors = {
    green: { background: '#14532d', color: '#22c55e', border: '1px solid #166534' },
    red: { background: '#450a0a', color: '#ef4444', border: '1px solid #7f1d1d' },
    gray: { background: '#18181c', color: '#888', border: '1px solid #222228' },
    copper: { background: '#1a1208', color: '#B87333', border: '1px solid #7a4d22' },
    blue: { background: '#0c1a2e', color: '#60a5fa', border: '1px solid #1e3a5f' },
  };
  const s = colors[color] || colors.gray;
  return (
    <span style={{
      ...s,
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 9,
      padding: '2px 7px',
      borderRadius: 3,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function PanelTitle({ children }) {
  return (
    <div style={{
      padding: '8px 16px',
      fontSize: 10,
      letterSpacing: '2px',
      color: '#B87333',
      borderBottom: '1px solid #222228',
      background: '#111114',
      textTransform: 'uppercase',
      flexShrink: 0,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ color: '#444', padding: '32px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'center' }}>
      {message}
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div style={{ color: '#ef4444', padding: '32px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'center' }}>
      ⚠ {message}
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ color: '#555', padding: '32px 16px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, textAlign: 'center' }}>
      loading…
    </div>
  );
}

// ─── Plugins Tab ─────────────────────────────────────────────────────────────

export function PluginsTab() {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [toggling, setToggling] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/plugins', { headers: AUTH });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPlugins(data.plugins || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = plugins.filter(p => {
    if (filter === 'enabled') return p.enabled;
    if (filter === 'disabled') return !p.enabled;
    return true;
  });

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleToggle = async (plugin) => {
    const action = plugin.enabled ? 'disable' : 'enable';
    setToggling(plugin.id);
    try {
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pluginId: plugin.id }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Plugin ${plugin.id} ${action}d`);
        await load();
        if (selected?.id === plugin.id) setSelected(p => ({ ...p, enabled: !p.enabled }));
      } else {
        showToast(`Error: ${data.error}`);
      }
    } catch (e) {
      showToast(`Error: ${e.message}`);
    } finally {
      setToggling(null);
    }
  };

  const counts = {
    all: plugins.length,
    enabled: plugins.filter(p => p.enabled).length,
    disabled: plugins.filter(p => !p.enabled).length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ width: 340, borderRight: '1px solid #222228', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Filter bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #222228', background: '#111114', display: 'flex', gap: 6 }}>
          {['all', 'enabled', 'disabled'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              padding: '3px 10px',
              border: '1px solid',
              borderColor: filter === f ? '#B87333' : '#222228',
              background: filter === f ? '#1a1208' : '#18181c',
              color: filter === f ? '#B87333' : '#888',
              borderRadius: 3,
              cursor: 'pointer',
            }}>
              {f.toUpperCase()} <span style={{ color: '#555' }}>{counts[f]}</span>
            </button>
          ))}
          <button onClick={load} style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: '3px 8px', border: '1px solid #222228', background: '#18181c', color: '#555', borderRadius: 3, cursor: 'pointer' }}>
            ⟳
          </button>
        </div>

        {/* List body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} />}
          {!loading && !error && filtered.length === 0 && <EmptyState message="no plugins match" />}
          {!loading && !error && filtered.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(p)}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #18181c',
                cursor: 'pointer',
                background: selected?.id === p.id ? '#18181c' : 'transparent',
                borderLeft: selected?.id === p.id ? '2px solid #B87333' : '2px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#E8E8E8', flex: 1 }}>
                  {p.name || p.id}
                </span>
                <Badge color={p.enabled ? 'green' : 'gray'}>{p.status || (p.enabled ? 'enabled' : 'disabled')}</Badge>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#555' }}>
                {p.id} {p.version ? `· v${p.version}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            ← select a plugin
          </div>
        ) : (
          <>
            <PanelTitle>PLUGIN — {selected.id}</PanelTitle>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#E8E8E8', margin: 0 }}>{selected.name || selected.id}</h2>
                <Badge color={selected.enabled ? 'green' : 'gray'}>{selected.status || (selected.enabled ? 'enabled' : 'disabled')}</Badge>
                <Badge color={selected.origin === 'bundled' ? 'blue' : 'copper'}>{selected.origin || 'unknown'}</Badge>
              </div>

              {selected.version && (
                <Row label="Version" value={selected.version} />
              )}
              <Row label="ID" value={selected.id} />
              <Row label="Format" value={selected.format || '—'} />
              {selected.source && <Row label="Source" value={selected.source} mono small />}

              {/* Capabilities */}
              {[
                ['Tools', selected.toolNames],
                ['Channels', selected.channelIds],
                ['Providers', selected.providerIds],
                ['CLI Backends', selected.cliBackendIds],
                ['Hooks', selected.hookNames],
                ['Services', selected.services],
              ].map(([label, arr]) => arr && arr.length > 0 && (
                <div key={label} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#555', letterSpacing: '0.1em', marginBottom: 4 }}>{label.toUpperCase()}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {arr.map(s => <Badge key={s} color="gray">{s}</Badge>)}
                  </div>
                </div>
              ))}

              {/* Compat tags */}
              {selected.compat && selected.compat.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#555', letterSpacing: '0.1em', marginBottom: 4 }}>COMPAT</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {selected.compat.map(c => <Badge key={c} color="copper">{c}</Badge>)}
                  </div>
                </div>
              )}

              {/* Toggle button — only for non-bundled or if allowed */}
              <div style={{ marginTop: 24 }}>
                <button
                  onClick={() => handleToggle(selected)}
                  disabled={toggling === selected.id}
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    padding: '8px 20px',
                    border: '1px solid',
                    borderColor: selected.enabled ? '#7f1d1d' : '#166534',
                    background: selected.enabled ? '#450a0a' : '#14532d',
                    color: selected.enabled ? '#ef4444' : '#22c55e',
                    borderRadius: 4,
                    cursor: toggling === selected.id ? 'not-allowed' : 'pointer',
                    opacity: toggling === selected.id ? 0.6 : 1,
                  }}
                >
                  {toggling === selected.id ? '...' : selected.enabled ? 'DISABLE' : 'ENABLE'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#111114', border: '1px solid #B87333',
          color: '#E8E8E8', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, padding: '10px 18px', borderRadius: 4,
          zIndex: 1000,
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono, small }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#555', letterSpacing: '0.1em', marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: small ? 10 : 12,
        color: '#E8E8E8',
        wordBreak: 'break-all',
        ...(mono ? { background: '#18181c', padding: '4px 8px', borderRadius: 3, border: '1px solid #222228' } : {}),
      }}>
        {value}
      </div>
    </div>
  );
}

// ─── Skills Tab ──────────────────────────────────────────────────────────────

export function SkillsTab() {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [skillContent, setSkillContent] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [loadingContent, setLoadingContent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/skills', { headers: AUTH });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkills(data.skills || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = skills.filter(s => {
    if (filter === 'shared') return s.type === 'shared';
    if (filter === 'workspace') return s.type === 'workspace';
    if (filter === 'bundled') return s.type === 'bundled';
    return true;
  });

  const counts = {
    all: skills.length,
    shared: skills.filter(s => s.type === 'shared').length,
    workspace: skills.filter(s => s.type === 'workspace').length,
    bundled: skills.filter(s => s.type === 'bundled').length,
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleSelect = async (skill) => {
    setSelected(skill);
    setEditMode(false);
    setSkillContent(null);
    if (skill.skillMdPath) {
      setLoadingContent(true);
      try {
        const res = await fetch(`/api/skills/save?path=${encodeURIComponent(skill.skillMdPath)}`, { headers: AUTH });
        const data = await res.json();
        setSkillContent(data.content || null);
      } catch {
        setSkillContent(null);
      } finally {
        setLoadingContent(false);
      }
    }
  };

  const handleEdit = () => {
    setEditText(skillContent || '');
    setEditMode(true);
  };

  const handleSave = async () => {
    if (!selected?.skillMdPath) return;
    // Guard: only shared/workspace
    if (!['shared', 'workspace'].includes(selected.type)) {
      showToast('Read-only: bundled skills cannot be edited');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/skills/save', {
        method: 'POST',
        headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillPath: selected.skillMdPath, content: editText }),
      });
      const data = await res.json();
      if (data.ok) {
        setSkillContent(editText);
        setEditMode(false);
        showToast('SKILL.md saved (backup created)');
      } else {
        showToast(`Error: ${data.error}`);
      }
    } catch (e) {
      showToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const typeColor = { shared: 'copper', workspace: 'green', bundled: 'blue' };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ width: 300, borderRight: '1px solid #222228', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Filter bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #222228', background: '#111114', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'shared', 'workspace', 'bundled'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              padding: '3px 8px',
              border: '1px solid',
              borderColor: filter === f ? '#B87333' : '#222228',
              background: filter === f ? '#1a1208' : '#18181c',
              color: filter === f ? '#B87333' : '#888',
              borderRadius: 3,
              cursor: 'pointer',
            }}>
              {f.toUpperCase()} <span style={{ color: '#555' }}>{counts[f]}</span>
            </button>
          ))}
        </div>

        {/* List body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <LoadingState />}
          {!loading && error && <ErrorState message={error} />}
          {!loading && !error && filtered.length === 0 && <EmptyState message="no skills found" />}
          {!loading && !error && filtered.map(s => (
            <div
              key={`${s.type}:${s.name}`}
              onClick={() => handleSelect(s)}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #18181c',
                cursor: 'pointer',
                background: selected?.name === s.name && selected?.type === s.type ? '#18181c' : 'transparent',
                borderLeft: selected?.name === s.name && selected?.type === s.type ? '2px solid #B87333' : '2px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#E8E8E8', flex: 1 }}>
                  {s.name}
                </span>
                <Badge color={typeColor[s.type] || 'gray'}>{s.type}</Badge>
              </div>
              {s.description && (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Detail / Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            ← select a skill
          </div>
        ) : (
          <>
            <PanelTitle>SKILL — {selected.name}</PanelTitle>

            {/* Detail header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #222228', background: '#0f0f12' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#E8E8E8' }}>{selected.name}</span>
                <Badge color={typeColor[selected.type] || 'gray'}>{selected.type}</Badge>
                {selected.version && <Badge color="gray">v{selected.version}</Badge>}
              </div>
              {selected.description && (
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#888', marginBottom: 8 }}>
                  {selected.description}
                </div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#444' }}>
                {selected.path}
              </div>

              {/* Actions */}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                {!editMode && selected.skillMdPath && ['shared', 'workspace'].includes(selected.type) && (
                  <button onClick={handleEdit} style={btnStyle('#1a1208', '#B87333', '#7a4d22')}>
                    EDIT SKILL.MD
                  </button>
                )}
                {editMode && (
                  <>
                    <button onClick={handleSave} disabled={saving} style={btnStyle('#14532d', '#22c55e', '#166534')}>
                      {saving ? 'SAVING…' : 'SAVE'}
                    </button>
                    <button onClick={() => setEditMode(false)} style={btnStyle('#18181c', '#888', '#222228')}>
                      CANCEL
                    </button>
                  </>
                )}
                {selected.type === 'bundled' && selected.skillMdPath && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#444', alignSelf: 'center' }}>
                    read-only (bundled)
                  </span>
                )}
              </div>
            </div>

            {/* Content area */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {loadingContent && <LoadingState />}
              {!loadingContent && editMode && (
                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  spellCheck={false}
                  style={{
                    flex: 1,
                    background: '#0a0a0b',
                    color: '#E8E8E8',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    border: 'none',
                    outline: 'none',
                    padding: 16,
                    resize: 'none',
                    lineHeight: 1.6,
                  }}
                />
              )}
              {!loadingContent && !editMode && skillContent && (
                <pre style={{
                  flex: 1,
                  overflowY: 'auto',
                  margin: 0,
                  padding: 16,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: '#aaa',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {skillContent}
                </pre>
              )}
              {!loadingContent && !editMode && !skillContent && selected.skillMdPath && (
                <EmptyState message="could not load SKILL.md" />
              )}
              {!loadingContent && !editMode && !selected.skillMdPath && (
                <EmptyState message="no SKILL.md found for this skill" />
              )}
            </div>
          </>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          background: '#111114', border: '1px solid #B87333',
          color: '#E8E8E8', fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12, padding: '10px 18px', borderRadius: 4,
          zIndex: 1000,
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

function btnStyle(bg, color, border) {
  return {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    padding: '5px 14px',
    border: `1px solid ${border}`,
    background: bg,
    color,
    borderRadius: 3,
    cursor: 'pointer',
    letterSpacing: '0.05em',
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PluginsSkillsPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0A0A0B',
      color: '#E8E8E8',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'JetBrains Mono', monospace",
      gap: 12,
    }}>
      <div style={{ color: '#B87333', letterSpacing: '0.12em', fontSize: 12 }}>PLUGINS & SKILLS</div>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/plugins" style={{ color: '#E8E8E8', border: '1px solid #222228', padding: '8px 14px', textDecoration: 'none' }}>Plugins</a>
        <a href="/skills" style={{ color: '#E8E8E8', border: '1px solid #222228', padding: '8px 14px', textDecoration: 'none' }}>Skills</a>
      </div>
    </div>
  );
}
