export interface Notice {
  kind: 'error' | 'success' | 'info';
  text: string;
}

export function Msg({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return <div className={`msg msg-${notice.kind}`}>{notice.text}</div>;
}
