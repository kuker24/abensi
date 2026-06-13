import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';
import type { ConfirmDialogState } from './types';
import { Btn, IconBtn } from './ui';

let riskConfirmHandler: ((dialog: { title: string; message: string }) => Promise<boolean>) | null = null;

export function setRiskConfirmHandler(handler: typeof riskConfirmHandler): void {
  riskConfirmHandler = handler;
}

export function riskConfirm(message: string, title = 'Konfirmasi aksi'): Promise<boolean> {
  if (!riskConfirmHandler) return Promise.resolve(window.confirm(message));
  return riskConfirmHandler({ title, message });
}

export function ConfirmDialog({ dialog, onCancel, onConfirm }: { dialog: ConfirmDialogState | null; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    if (!dialog) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dialog, onCancel]);

  if (!dialog) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onClick={onCancel}>
      <div className="card pad-lg elev modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div className="eyebrow"><AlertTriangle size={14} /> AKSI BERISIKO</div>
          <IconBtn label="Batal dan tutup" onClick={onCancel}><X size={15} /></IconBtn>
        </div>
        <h2 id="confirm-title" style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>{dialog.title}</h2>
        <p className="muted" style={{ margin: '0 0 24px', lineHeight: 1.6 }}>{dialog.message}</p>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
          <Btn variant="ghost" onClick={onCancel} style={{ minHeight: 44 }}>Batal</Btn>
          <Btn variant="danger" onClick={onConfirm} style={{ minHeight: 44 }}>Lanjutkan</Btn>
        </div>
      </div>
    </div>
  );
}
