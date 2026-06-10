import { useEffect, useState } from 'react';
import { Modal } from '../Modal';

interface ConfirmRequest {
  message: string;
  title?: string;
  confirmLabel?: string;
  danger?: boolean;
}

let resolver: ((value: boolean) => void) | null = null;
let opener: ((req: ConfirmRequest) => void) | null = null;

/**
 * Thay thế window.confirm — trả về Promise<boolean>.
 * Yêu cầu <ConfirmHost /> được mount một lần trong App.
 */
export function confirmDialog(message: string, opts?: Omit<ConfirmRequest, 'message'>): Promise<boolean> {
  return new Promise(resolve => {
    resolver?.(false); // hủy yêu cầu cũ nếu còn treo
    resolver = resolve;
    opener?.({ message, ...opts });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    opener = setReq;
    return () => {
      opener = null;
    };
  }, []);

  function close(value: boolean) {
    setReq(null);
    resolver?.(value);
    resolver = null;
  }

  if (!req) return null;

  return (
    <Modal title={req.title ?? 'Xác nhận'} onClose={() => close(false)} width={420}>
      <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{req.message}</p>
      <div className="actions-row">
        <button
          className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`}
          onClick={() => close(true)}
          autoFocus
        >
          {req.confirmLabel ?? 'Xác nhận'}
        </button>
        <button className="btn" onClick={() => close(false)}>Hủy</button>
      </div>
    </Modal>
  );
}
