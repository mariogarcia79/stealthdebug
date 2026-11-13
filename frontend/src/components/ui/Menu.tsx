import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon, { type IconName } from './Icon';

// Dropdown menu: a trigger button and a list of items. Closes on outside
// click, Escape (focus returns to the trigger) and after choosing an item;
// arrow keys move between items.
interface MenuProps {
  label: ReactNode;             // trigger content
  ariaLabel?: string;           // when the trigger is only an icon
  triggerClassName?: string;
  children: ReactNode;          // MenuItem / MenuLink / MenuSep / MenuLabel
}

export function Menu({ label, ariaLabel, triggerClassName = 'menu-trigger', children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(root.current?.querySelectorAll<HTMLElement>('.menu-item') ?? [])];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="menu" ref={root}>
      <button ref={trigger} type="button" className={triggerClassName} aria-label={ariaLabel}
        aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      <div id={id} className="menu-list" role="menu" hidden={!open}
        onClick={(e) => { if ((e.target as HTMLElement).closest('.menu-item')) setOpen(false); }}>
        {children}
      </div>
    </div>
  );
}

export function MenuItem({ icon, onSelect, checked, hint, children }: { icon?: IconName; onSelect: () => void; checked?: boolean; hint?: string; children: ReactNode }) {
  return (
    <button type="button" className="menu-item" role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked} onClick={onSelect}>
      {icon && <Icon name={icon} />}<span>{children}</span>
      {checked && <Icon name="check" className="hint" />}
      {hint && <span className="hint">{hint}</span>}
    </button>
  );
}

export function MenuLink({ icon, to, active, children }: { icon?: IconName; to: string; active?: boolean; children: ReactNode }) {
  return (
    <Link to={to} className={`menu-item${active ? ' active' : ''}`} role="menuitem">
      {icon && <Icon name={icon} />}<span>{children}</span>
    </Link>
  );
}

export const MenuSep = () => <div className="menu-sep" role="separator" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="menu-label">{children}</div>;
