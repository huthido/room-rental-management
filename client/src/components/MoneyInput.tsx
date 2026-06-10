interface Props {
  /** Chuỗi số thô, ví dụ "3000000" */
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  className?: string;
}

function format(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
}

/**
 * Ô nhập tiền: hiển thị có dấu phân cách nghìn (3.000.000) trong khi
 * state bên ngoài vẫn giữ chuỗi số thô ("3000000").
 */
export function MoneyInput({ value, onChange, placeholder, autoFocus, readOnly, className }: Props) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={format(value)}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder={placeholder}
      autoFocus={autoFocus}
      readOnly={readOnly}
      className={className}
    />
  );
}
