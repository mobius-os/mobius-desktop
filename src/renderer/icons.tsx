import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (props: IconProps) => <IconBase {...props}><path d="M5 12h14M13 6l6 6-6 6" /></IconBase>;
export const BackIcon = (props: IconProps) => <IconBase {...props}><path d="m15 18-6-6 6-6" /></IconBase>;
export const CheckIcon = (props: IconProps) => <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
export const CloudIcon = (props: IconProps) => <IconBase {...props}><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.25 8.2 4.5 4.5 0 0 0 7 18Z" /></IconBase>;
export const ExternalIcon = (props: IconProps) => <IconBase {...props}><path d="M14 5h5v5M19 5l-8 8" /><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></IconBase>;
export const FolderIcon = (props: IconProps) => <IconBase {...props}><path d="M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" /><path d="M3.5 7.5V6a2 2 0 0 1 2-2h3l2 2h8a2 2 0 0 1 2 2v1.5" /></IconBase>;
export const LinkIcon = (props: IconProps) => <IconBase {...props}><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" /></IconBase>;
export const LocalIcon = (props: IconProps) => <IconBase {...props}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></IconBase>;
export const PlusIcon = (props: IconProps) => <IconBase {...props}><path d="M12 5v14M5 12h14" /></IconBase>;
export const StopIcon = (props: IconProps) => <IconBase {...props}><rect x="6" y="6" width="12" height="12" rx="2" /></IconBase>;
export const TrashIcon = (props: IconProps) => <IconBase {...props}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></IconBase>;
