import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'solid' | 'outline';
  children: ReactNode;
}

export default function GradientButton({ variant = 'solid', children, className = '', ...props }: GradientButtonProps) {
  const variantClass = variant === 'outline' ? 'siab2p-button siab2p-button-outline' : 'siab2p-button siab2p-button-solid';
  return (
    <button className={`${variantClass} ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
