import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './confirm';

afterEach(cleanup);

describe('ConfirmDialog accessibility', () => {
  it('traps focus, closes on Escape, and restores the opener', async () => {
    const onCancel = vi.fn();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<ConfirmDialog dialog={{ title: 'Hapus data', message: 'Aksi ini tidak dapat dibatalkan.', resolve: vi.fn() }} onCancel={onCancel} onConfirm={vi.fn()} />);

    const close = await screen.findByRole('button', { name: 'Batal dan tutup' });
    const confirm = screen.getByRole('button', { name: 'Lanjutkan' });
    expect(close).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();

    rerender(<ConfirmDialog dialog={null} onCancel={onCancel} onConfirm={vi.fn()} />);
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });
});
