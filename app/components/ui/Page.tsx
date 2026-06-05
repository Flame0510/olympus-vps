import type { ReactNode } from 'react';

export function Page({ children, maxWidth = 1280 }: { children: ReactNode; maxWidth?: number }) {
  return <div className="ui-page"><div className="ui-page__inner" style={{ maxWidth }}>{children}</div></div>;
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-description">{description}</p>}
      </div>
      {action}
    </header>
  );
}
