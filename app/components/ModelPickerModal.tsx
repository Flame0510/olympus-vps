'use client';

import { useState } from 'react';
import { useModels } from '../lib/models-context';

interface ProviderEntry {
  provider: string;
  emoji: string;
  models: { id: string; label: string }[];
}

interface ModelPickerModalProps {
  open: boolean;
  value?: string;
  title?: string;
  onClose: () => void;
  onSelect: (model: string) => void;
}

const FALLBACK_PROVIDERS: ProviderEntry[] = [
  { provider: 'Default', emoji: '🔧', models: [{ id: '', label: 'Default' }] },
];

export default function ModelPickerModal({ open, value = '', title = 'Select model', onClose, onSelect }: ModelPickerModalProps) {
  const { providers: contextProviders, loaded } = useModels();
  const [expanded, setExpanded] = useState<Record<number, boolean>>({ 0: true });
  const providers = loaded && contextProviders.length ? contextProviders : FALLBACK_PROVIDERS;

  if (!open) return null;

  const current = value ? value.split('/').slice(1).join('/') || value : 'Default';

  return (
    <div className="model-picker" onClick={onClose}>
      <div className="model-picker__panel" onClick={(e) => e.stopPropagation()}>
        <div className="model-picker__header">
          <div>
            <div className="model-picker__title">{title}</div>
            <div className="model-picker__current">Attuale: {current}</div>
          </div>
          <button className="model-picker__close" onClick={onClose} aria-label="Chiudi">×</button>
        </div>
        <div className="model-picker__body">
          {providers.map((provider, pIdx) => (
            <div key={`${provider.provider}-${pIdx}`} className="model-picker__provider">
              <button
                className={`model-picker__provider-header${expanded[pIdx] ? ' model-picker__provider-header--expanded' : ''}`}
                onClick={() => setExpanded((prev) => ({ ...prev, [pIdx]: !prev[pIdx] }))}
              >
                <span className="model-picker__chevron">{expanded[pIdx] ? '▾' : '▸'}</span>
                <span className="model-picker__emoji">{provider.emoji}</span>
                <span className="model-picker__provider-name">{provider.provider}</span>
                <span className="model-picker__count">{provider.models.length}</span>
              </button>
              {expanded[pIdx] && (
                <div className="model-picker__models">
                  {provider.models.map((m) => (
                    <button
                      key={m.id || '__default__'}
                      className={`model-picker__model${(value || '') === m.id ? ' model-picker__model--active' : ''}`}
                      onClick={() => onSelect(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .model-picker { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .model-picker__panel { width: min(520px, 100%); max-height: min(720px, 88dvh); background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 20px 80px rgba(0,0,0,.45); overflow: hidden; display: flex; flex-direction: column; }
        .model-picker__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--border); }
        .model-picker__title { color: var(--text); font-size: 14px; font-weight: 600; }
        .model-picker__current { color: var(--text-dim); font-size: 10px; margin-top: 3px; }
        .model-picker__close { background: none; border: 1px solid var(--border); color: var(--text-dim); border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 18px; line-height: 1; }
        .model-picker__body { overflow: auto; padding: 8px; }
        .model-picker__provider-header { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 10px; border: 0; border-radius: 8px; background: none; color: var(--text-dim); cursor: pointer; font: inherit; font-size: 12px; }
        .model-picker__provider-header:hover, .model-picker__provider-header--expanded { background: var(--bg3); color: var(--text); }
        .model-picker__chevron { width: 14px; }
        .model-picker__emoji { width: 18px; text-align: center; }
        .model-picker__provider-name { flex: 1; text-align: left; font-weight: 600; }
        .model-picker__count { font-size: 10px; color: var(--text-dim); background: var(--bg); border-radius: 8px; padding: 1px 6px; }
        .model-picker__models { display: grid; gap: 2px; padding: 2px 0 6px 40px; }
        .model-picker__model { text-align: left; border: 0; border-radius: 7px; background: none; color: var(--text); cursor: pointer; padding: 7px 9px; font: inherit; font-size: 11px; }
        .model-picker__model:hover { background: var(--bg3); }
        .model-picker__model--active { background: rgba(212,155,53,.14); color: var(--copper); }
        @media (max-width: 600px) { .model-picker { align-items: flex-end; padding: 0; } .model-picker__panel { border-radius: 14px 14px 0 0; max-height: 82dvh; } }
      `}</style>
    </div>
  );
}
