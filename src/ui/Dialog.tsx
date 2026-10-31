import type { ComponentChildren } from 'preact';

export function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ComponentChildren; wide?: boolean }) {
  return (
    <div class="dlg-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`dlg${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div class="dlg-head">
          <h3>{title}</h3>
          <button class="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div class="dlg-body">{children}</div>
      </div>
    </div>
  );
}
