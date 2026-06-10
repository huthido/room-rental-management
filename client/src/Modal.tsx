import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

export function Modal({ title, onClose, children, width = 480 }: Props) {
  // Chỉ đóng khi thao tác nhấn chuột BẮT ĐẦU trên overlay — nếu không,
  // bôi đen text trong modal rồi nhả chuột ra ngoài sẽ làm modal đóng oan.
  const pressStartedOnOverlay = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={e => {
        pressStartedOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={e => {
        if (e.target === e.currentTarget && pressStartedOnOverlay.current) onClose();
        pressStartedOnOverlay.current = false;
      }}
    >
      <div className="modal" style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
