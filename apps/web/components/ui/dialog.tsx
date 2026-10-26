"use client";

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

const subscribe = () => () => {};
export function Dialog({ open, onClose, title, description, children, className = "" }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; className?: string }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const titleId = useId();
  const descriptionId = useId();
  const ref = useDialogAccessibility<HTMLElement>(open && mounted, onClose);
  if (!open || !mounted) return null;
  return createPortal(<div className="ma-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={ref} className={`ma-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}><button className="ma-dialog-close" type="button" aria-label="Fechar" onClick={onClose}><X size={20}/></button><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId} className="ma-dialog-description">{description}</p>}{children}</section></div>, document.body);
}
