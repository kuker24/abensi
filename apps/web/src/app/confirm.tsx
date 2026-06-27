import { AlertTriangle, LogOut, X } from 'lucide-react';
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

  const isLogoutDialog = /keluar/i.test(dialog.title);
  const DialogIcon = isLogoutDialog ? LogOut : AlertTriangle;
  const eyebrow = isLogoutDialog ? 'SESI SIAB2' : 'KONFIRMASI AKSI';
  const confirmLabel = isLogoutDialog ? 'Keluar' : 'Lanjutkan';

  return (
    <div className={`modal-backdrop siab2-confirm-backdrop${isLogoutDialog ? ' siab2-confirm-backdrop-logout' : ''}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" onClick={onCancel}>
      <div className="modal siab2-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="siab2-confirm-top">
          <div className="siab2-confirm-icon" aria-hidden="true"><DialogIcon size={20} /></div>
          <div className="siab2-confirm-heading">
            <span>{eyebrow}</span>
            <h2 id="confirm-title">{dialog.title}</h2>
          </div>
          <IconBtn className="siab2-confirm-close" label="Batal dan tutup" onClick={onCancel}><X size={15} /></IconBtn>
        </div>
        <p id="confirm-description" className="siab2-confirm-description">{dialog.message}</p>
        <div className="siab2-confirm-actions">
          <Btn className="siab2-confirm-secondary" variant="ghost" onClick={onCancel}>Batal</Btn>
          <Btn className="siab2-confirm-primary" variant={isLogoutDialog ? 'primary' : 'danger'} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}
