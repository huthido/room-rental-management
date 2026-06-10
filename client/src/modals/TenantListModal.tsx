import { useEffect, useState } from 'react';
import { Modal } from '../Modal';
import { api } from '../api';
import { Msg, type Notice } from '../components/Msg';
import { formatCurrency, formatDate, monthYear } from '../format';
import type { MonthlyBill, TenantSummary } from '../types';

type Filter = 'all' | 'active' | 'former';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang thuê' },
  { key: 'former', label: 'Đã trả phòng' },
];

interface Props {
  onClose: () => void;
}

export function TenantListModal({ onClose }: Props) {
  const [summaries, setSummaries] = useState<TenantSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [billsByTenant, setBillsByTenant] = useState<Record<string, MonthlyBill[]>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    api.tenants
      .stats()
      .then(setSummaries)
      .catch(err => setNotice({ kind: 'error', text: (err as Error).message }))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(tenantId: string) {
    if (expandedId === tenantId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(tenantId);
    if (!billsByTenant[tenantId]) {
      try {
        const bills = await api.tenants.bills(tenantId);
        setBillsByTenant(prev => ({ ...prev, [tenantId]: bills }));
      } catch (err) {
        setNotice({ kind: 'error', text: (err as Error).message });
      }
    }
  }

  const visible = summaries.filter(s =>
    filter === 'all' ? true : filter === 'active' ? s.tenant.active : !s.tenant.active
  );

  const grandTotal = visible.reduce(
    (acc, s) => ({ billed: acc.billed + s.totalBilled, unpaid: acc.unpaid + s.totalUnpaid }),
    { billed: 0, unpaid: 0 }
  );

  return (
    <Modal title="Người thuê — danh sách & thống kê" onClose={onClose} width={840}>
      <Msg notice={notice} />

      <div className="filter-row" style={{ marginBottom: 12 }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`btn btn-small${filter === f.key ? ' btn-primary' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} ({summaries.filter(s => (f.key === 'all' ? true : f.key === 'active' ? s.tenant.active : !s.tenant.active)).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty">Đang tải...</div>
      ) : visible.length === 0 ? (
        <div className="empty">Không có người thuê nào</div>
      ) : (
        <div className="table-wrap">
          <table className="main-table">
            <thead>
              <tr>
                <th>Người thuê</th>
                <th>Phòng</th>
                <th>Thời gian ở</th>
                <th>Trạng thái</th>
                <th className="num">Số HĐ</th>
                <th className="num">Tổng tiền</th>
                <th className="num">Còn nợ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const expanded = expandedId === s.tenant.id;
                const bills = billsByTenant[s.tenant.id];
                return (
                  <FragmentRow
                    key={s.tenant.id}
                    summary={s}
                    expanded={expanded}
                    bills={bills}
                    onToggle={() => void toggle(s.tenant.id)}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="fee-total">
                <td colSpan={5}><strong>Tổng ({visible.length} người)</strong></td>
                <td className="num"><strong>{formatCurrency(grandTotal.billed)}</strong></td>
                <td className="num"><strong>{grandTotal.unpaid > 0 ? formatCurrency(grandTotal.unpaid) : '—'}</strong></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}

function FragmentRow({
  summary: s,
  expanded,
  bills,
  onToggle,
}: {
  summary: TenantSummary;
  expanded: boolean;
  bills: MonthlyBill[] | undefined;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="tenant-row" onClick={onToggle} title="Nhấn để xem lịch sử hóa đơn">
        <td>
          <div className="tenant-cell">
            <span><strong>{s.tenant.name}</strong></span>
            <span className="sub">{s.tenant.phoneNumber}</span>
          </div>
        </td>
        <td>{s.roomNumber ?? '—'}</td>
        <td>
          <span className="sub">
            {formatDate(s.tenant.moveInDate)} → {s.tenant.active ? 'nay' : formatDate(s.tenant.moveOutDate)}
          </span>
        </td>
        <td>
          <span className={`badge ${s.tenant.active ? 'badge-occupied' : 'badge-maintenance'}`}>
            {s.tenant.active ? 'Đang thuê' : 'Đã trả phòng'}
          </span>
        </td>
        <td className="num">{s.billCount}</td>
        <td className="num">{s.billCount > 0 ? formatCurrency(s.totalBilled) : '—'}</td>
        <td className="num">
          {s.totalUnpaid > 0 ? <strong style={{ color: '#dc2626' }}>{formatCurrency(s.totalUnpaid)}</strong> : '—'}
        </td>
        <td className="num">{s.billCount > 0 ? (expanded ? '▾' : '▸') : ''}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="tenant-bills-cell">
            {!bills ? (
              <div className="empty">Đang tải hóa đơn...</div>
            ) : bills.length === 0 ? (
              <div className="empty">Chưa có hóa đơn nào</div>
            ) : (
              <table className="tenant-bills">
                <thead>
                  <tr>
                    <th>Kỳ</th>
                    <th className="num">Tiền phòng</th>
                    <th className="num">Điện</th>
                    <th className="num">Nước</th>
                    <th className="num">Phí khác</th>
                    <th className="num">Tổng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(b => (
                    <tr key={b.id}>
                      <td>{monthYear(b.month, b.year)}</td>
                      <td className="num" title={`Tiền phòng tháng ${monthYear(b.rentMonth, b.rentYear)}`}>
                        {formatCurrency(b.roomRent)}
                        {(b.rentMonth !== b.month || b.rentYear !== b.year) && (
                          <span className="sub"> (T{monthYear(b.rentMonth, b.rentYear)})</span>
                        )}
                      </td>
                      <td className="num">{formatCurrency(b.electricCost)}</td>
                      <td className="num">{formatCurrency(b.waterCost)}</td>
                      <td
                        className="num"
                        title={b.lateFee > 0 ? `Phí khác ${formatCurrency(b.extraFees)} + phí trễ hạn ${formatCurrency(b.lateFee)}` : undefined}
                      >
                        {b.extraFees + b.lateFee > 0 ? formatCurrency(b.extraFees + b.lateFee) : '—'}
                      </td>
                      <td className="num"><strong>{formatCurrency(b.totalAmount)}</strong></td>
                      <td>
                        <span className={`badge ${b.paid ? 'badge-paid' : 'badge-unpaid'}`}>
                          {b.paid ? 'Đã thanh toán' : 'Chưa thanh toán'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
