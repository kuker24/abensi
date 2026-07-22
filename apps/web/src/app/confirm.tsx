import { AlertTriangle, LogOut, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancelRef.current(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); opener?.focus(); };
  }, [dialog]);

  if (!dialog) return null;

  const isLogoutDialog = /keluar/i.test(dialog.title);
  const DialogIcon = isLogoutDialog ? LogOut : AlertTriangle;
  const eyebrow = isLogoutDialog ? 'SESI SIAB2' : 'KONFIRMASI AKSI';
  const confirmLabel = isLogoutDialog ? 'Keluar' : 'Lanjutkan';

  return (
    <div className={`modal-backdrop siab2-confirm-backdrop${isLogoutDialog ? ' siab2-confirm-backdrop-logout' : ''}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-description" onClick={onCancel}>
      <div ref={modalRef} className="modal siab2-confirm-modal" onClick={(e) => e.stopPropagation()}>
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
