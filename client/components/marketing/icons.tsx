import type { ReactNode } from 'react';

// Small line icons (24px grid, 1.75 stroke). Decorative, so hidden from screen readers.
function Icon({ children, className = 'size-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconUpload = (p: { className?: string }) => (
  <Icon {...p}><path d="M12 16V4m0 0 4 4m-4-4L8 8" /><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></Icon>
);
export const IconScan = (p: { className?: string }) => (
  <Icon {...p}><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M8 12h8" /></Icon>
);
export const IconTimeline = (p: { className?: string }) => (
  <Icon {...p}><path d="M12 3v18" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M14 7h6M4 17h6" /></Icon>
);
export const IconBrief = (p: { className?: string }) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icon>
);
export const IconLink = (p: { className?: string }) => (
  <Icon {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></Icon>
);
export const IconShieldCheck = (p: { className?: string }) => (
  <Icon {...p}><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /><path d="m9 12 2 2 4-4" /></Icon>
);
export const IconFlag = (p: { className?: string }) => (
  <Icon {...p}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></Icon>
);
export const IconPageMissing = (p: { className?: string }) => (
  <Icon {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M10 13l4 4m0-4-4 4" /></Icon>
);
export const IconPen = (p: { className?: string }) => (
  <Icon {...p}><path d="m4 20 4-1 11-11a2.12 2.12 0 0 0-3-3L5 16z" /><path d="m14 7 3 3" /></Icon>
);
export const IconArrow = (p: { className?: string }) => (
  <Icon {...p}><path d="M5 12h14m-6-6 6 6-6 6" /></Icon>
);
