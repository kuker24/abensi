import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Navbar from './Navbar';

afterEach(() => cleanup());

describe('SIAB2 preview navbar', () => {
  it('marks Kontak active when scrolling reaches the document bottom', () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 2000 });

    render(<Navbar />);
    fireEvent.scroll(window);

    for (const link of screen.getAllByRole('button', { name: 'Kontak' })) {
      expect(link.className).toContain('active');
    }
    for (const link of screen.getAllByRole('button', { name: 'Tampilan' })) {
      expect(link.className).not.toContain('active');
    }
  });
});
