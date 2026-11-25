// 轻量弹窗：对外契约不变（open/title/description/onClose/children/footer），内部改用 Fluent Dialog。
// 行为对齐原有实现：点遮罩关闭、按 Esc 关闭。
import type { ReactNode } from 'react';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, description, onClose, children, footer }: ModalProps) {
  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_event, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface aria-label={title}>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>
            {description ? (
              <p className="mb-3 text-sm text-slate-500">{description}</p>
            ) : null}
            <div className="space-y-4">{children}</div>
          </DialogContent>
          {footer ? <DialogActions>{footer}</DialogActions> : null}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
