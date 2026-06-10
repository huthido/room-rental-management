import { useState } from 'react';
import { Modal } from '../Modal';
import { api } from '../api';
import { Msg, type Notice } from '../components/Msg';
import { monthYear, nextPeriod } from '../format';
import type { NewMonthResult } from '../types';

interface Props {
  basePeriod: { month: number; year: number };
  onClose: () => void;
  onGoToMonth: (period: { month: number; year: number }) => void;
}

export function NewMonthModal({ basePeriod, onClose, onGoToMonth }: Props) {
  const target = nextPeriod(basePeriod);
  const [form, setForm] = useState({
    month: String(target.month),
    year: String(target.year),
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<NewMonthResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const res = await api.periods.create({ month: +form.month, year: +form.year });
      setResult(res);
    } catch (err) {
      setNotice({ kind: 'error', text: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Modal title={`Đã tạo kỳ ${monthYear(result.month, result.year)}`} onClose={onClose}>
        <div className="reading-result" style={{ marginTop: 0 }}>
          ✅ <strong>{result.carried}</strong> phòng được chuyển chỉ số từ tháng trước
          {result.skippedNoPrev > 0 && (
            <>
              <br />⚠ <strong>{result.skippedNoPrev}</strong> phòng đang thuê chưa có chỉ số tháng trước — cần ghi thủ công
            </>
          )}
          {result.skippedExisting > 0 && (
            <>
              <br />ℹ <strong>{result.skippedExisting}</strong> phòng đã có chỉ số kỳ này từ trước (bỏ qua)
            </>
          )}
        </div>
        <div className="actions-row" style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={() => onGoToMonth({ month: result.month, year: result.year })}
          >
            Xem kỳ {monthYear(result.month, result.year)}
          </button>
          <button className="btn" onClick={onClose}>Đóng</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Tạo tháng mới" onClose={onClose}>
      <Msg notice={notice} />
      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Với mỗi phòng đang thuê, chỉ số <strong>cũ</strong> của kỳ mới sẽ lấy từ chỉ số <strong>mới</strong> của
        tháng trước. Giá điện nước tính theo giá riêng của từng phòng (hoặc giá mặc định nếu phòng không có giá riêng).
      </p>
      <form onSubmit={submit}>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="field">
            <label>Tháng</label>
            <select value={form.month} onChange={e => setForm(p => ({ ...p, month: e.target.value }))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Năm</label>
            <input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: e.target.value }))} />
          </div>
        </div>
        <div className="actions-row" style={{ marginTop: 16 }}>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Đang tạo...' : `Tạo kỳ ${monthYear(+form.month, +form.year)}`}
          </button>
          <button type="button" className="btn" onClick={onClose}>Hủy</button>
        </div>
      </form>
    </Modal>
  );
}
