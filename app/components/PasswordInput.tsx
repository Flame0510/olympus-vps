'use client';

import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from './Icons';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

export default function PasswordInput({
  value,
  onChange,
  placeholder = '',
  disabled = false,
  style,
  inputStyle,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        type={visible ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          border: '1px solid var(--border)',
          borderRadius: 6,
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 13,
          padding: '10px 36px 10px 12px',
          fontFamily: 'var(--font-mono-stack)',
          outline: 'none',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      <button
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        type="button"
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--text-dim)',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
        }}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
      </button>
    </div>
  );
}
