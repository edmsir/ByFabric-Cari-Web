import { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
    TrendingUp,
    TrendingDown,
    Download,
    Filter,
    Calendar,
    Building2,
    Briefcase,
    RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import clsx from 'clsx';

const MONTH_NAMES = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan', '05': 'Mayıs', '06': 'Haziran',
    '07': 'Temmuz', '08': 'Ağustos', '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
};

export default function SalesCollectionReport() {
    const { role, profile } = useAuth();
    const { reportData: data, reportLoading: loading, refreshData } = useData();

    // Filters
    const [selectedBranch, setSelectedBranch] = useState(() => {
        if (role === 'branch_manager' || role === 'sales_rep') return profile?.assigned_branch || 'ALL';
        return 'ALL';
    });
    const [selectedRep, setSelectedRep] = useState(() => {
        if (role === 'sales_rep') return profile?.assigned_sales_rep || 'ALL';
        return 'ALL';
    });

    // Filter Options
    const branches = useMemo(() => ['ALL', ...new Set(data.map(d => d.sube_adi).filter(b => b && !b.toLowerCase().includes('bilinmeyen')))], [data]);
    const reps = useMemo(() => {
        const filteredByBranch = selectedBranch === 'ALL' ? data : data.filter(d => d.sube_adi === selectedBranch);
        return ['ALL', ...new Set(filteredByBranch.map(d => d.satis_temsilcisi).filter(r => r && !r.toUpperCase().includes('DİKKATE ALMA')))];
    }, [data, selectedBranch]);

    // Processed Data (Grouped by Period after filters)
    const filteredData = useMemo(() => {
        return data.filter(item => {
            const branch = (item.sube_adi || '').toLowerCase();
            const rep = (item.satis_temsilcisi || '').toUpperCase();
            if (branch.includes('bilinmeyen')) return false;
            if (rep.includes('DİKKATE ALMA')) return false;

            // RBAC Enforcements
            if (role === 'sales_rep' && item.satis_temsilcisi !== profile?.assigned_sales_rep) return false;
            if (role === 'branch_manager' && item.sube_adi !== profile?.assigned_branch) return false;

            const matchBranch = selectedBranch === 'ALL' || item.sube_adi === selectedBranch;
            const matchRep = selectedRep === 'ALL' || item.satis_temsilcisi === selectedRep;
            return matchBranch && matchRep;
        });
    }, [data, selectedBranch, selectedRep, role, profile]);

    const groupedData = useMemo(() => {
        const groups = {};
        filteredData.forEach(item => {
            const key = item.donem_key;
            if (!groups[key]) {
                const [year, month] = key.split('-');
                const monthName = MONTH_NAMES[month] || `Ay ${month}`;
                groups[key] = {
                    key: key,
                    label: `${monthName} ${year}`,
                    satis: 0,
                    tahsilat: 0
                };
            }
            groups[key].satis += parseFloat(item.toplam_satis || 0);
            groups[key].tahsilat += parseFloat(item.toplam_tahsilat || 0);
        });
        return Object.values(groups).sort((a, b) => {
            return b.key.localeCompare(a.key);
        });
    }, [filteredData]);

    const totals = useMemo(() => {
        return groupedData.reduce((acc, curr) => ({
            satis: acc.satis + curr.satis,
            tahsilat: acc.tahsilat + curr.tahsilat
        }), { satis: 0, tahsilat: 0 });
    }, [groupedData]);

    const exportToExcel = () => {
        const exportData = groupedData.map(d => ({
            'Dönem': d.label,
            'Net Satış (USD)': d.satis,
            'Tahsilat (USD)': d.tahsilat,
            'Tahsilat Oranı': d.satis > 0 ? `%${((d.tahsilat / d.satis) * 100).toFixed(1)}` : '-%'
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "SatisTahsilat");
        XLSX.writeFile(wb, `Satis_Tahsilat_Raporu_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
            <p className="text-gray-500 font-medium animate-pulse text-sm uppercase tracking-widest">Rapor Verileri Hesaplanıyor...</p>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <TrendingUp size={24} />
                        </div>
                        SATIŞ VE TAHSİLAT RAPORU (USD)
                    </h1>
                    <p className="text-gray-500 mt-1 font-medium italic text-sm">
                        TL işlemler TCMB kurları ile USD'ye çevrilerek netleştirilmiştir.
                    </p>
                </div>
                <button
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all font-bold shadow-lg shadow-emerald-600/20"
                >
                    <Download size={20} />
                    EXCEL'E AKTAR
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2 text-gray-400">
                    <Filter size={20} />
                    <span className="text-sm font-bold uppercase tracking-wider">Filtreler:</span>
                </div>

                {(role === 'admin') && (
                    <div className="flex items-center gap-2 min-w-[200px]">
                        <Building2 size={18} className="text-gray-400" />
                        <select
                            value={selectedBranch}
                            onChange={(e) => { setSelectedBranch(e.target.value); setSelectedRep('ALL'); }}
                            className="bg-white border border-gray-200 rounded-lg text-gray-900 text-sm font-bold p-2 w-full focus:ring-2 focus:ring-blue-500"
                        >
                            {branches.map(b => <option key={b} value={b} className="text-gray-900">{b === 'ALL' ? 'Tüm Şubeler' : b}</option>)}
                        </select>
                    </div>
                )}

                {(role === 'admin' || role === 'branch_manager') && (
                    <div className="flex items-center gap-2 min-w-[200px]">
                        <Briefcase size={18} className="text-gray-400" />
                        <select
                            value={selectedRep}
                            onChange={(e) => setSelectedRep(e.target.value)}
                            className="bg-white border border-gray-200 rounded-lg text-gray-900 text-sm font-bold p-2 w-full focus:ring-2 focus:ring-blue-500"
                        >
                            {reps.map(r => <option key={r} value={r} className="text-gray-900">{r === 'ALL' ? 'Tüm Temsilciler' : r}</option>)}
                        </select>
                    </div>
                )}
            </div>

            {/* Main Table */}
            <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50/50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-black text-gray-400 uppercase tracking-widest">DÖNEM</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-gray-400 uppercase tracking-widest">TOPLAM SATIŞ (USD)</th>
                            <th className="px-6 py-4 text-right text-xs font-black text-gray-400 uppercase tracking-widest">TOPLAM TAHSİLAT (USD)</th>
                            <th className="px-6 py-4 text-center text-xs font-black text-gray-400 uppercase tracking-widest">PERFORMANS</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {groupedData.map((row) => (
                            <tr key={row.key} className="hover:bg-blue-50/30 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-gray-100 rounded-lg text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                            <Calendar size={18} />
                                        </div>
                                        <span className="font-bold text-gray-900">{row.label}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="font-black text-gray-900">
                                        ${row.satis.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <span className="font-black text-emerald-600">
                                        ${row.tahsilat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    {(() => {
                                        const ratio = row.satis > 0 ? (row.tahsilat / row.satis) * 100 : 0;
                                        const diff = row.tahsilat - row.satis;
                                        return (
                                            <div className="flex flex-col items-center">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex-1 bg-gray-100 h-2 rounded-full overflow-hidden min-w-[100px]">
                                                        <div className={clsx(
                                                            "h-full transition-all duration-1000",
                                                            ratio >= 100 ? "bg-emerald-500" : (ratio > 50 ? "bg-blue-500" : "bg-rose-500")
                                                        )} style={{ width: `${Math.min(100, ratio)}%` }}></div>
                                                    </div>
                                                    <span className={clsx("text-sm font-black min-w-[45px] text-right", ratio >= 100 ? "text-emerald-600" : (ratio > 50 ? "text-blue-600" : "text-rose-600"))}>
                                                        %{ratio.toFixed(1)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td className={clsx("px-6 py-4 text-right font-black", (row.tahsilat - row.satis) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                    {(row.tahsilat - row.satis) >= 0 ? '+' : ''}{(row.tahsilat - row.satis).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-900 text-white font-bold">
                        <tr>
                            <td className="px-6 py-5 uppercase tracking-widest text-sm">GENEL TOPLAM</td>
                            <td className="px-6 py-5 text-right text-lg">
                                ${totals.satis.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-5 text-right text-lg text-emerald-400">
                                ${totals.tahsilat.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-5 text-center">
                                <span className="text-xs bg-white/10 px-3 py-1 rounded-full border border-white/20">
                                    GENEL ORAN: %{totals.satis > 0 ? ((totals.tahsilat / totals.satis) * 100).toFixed(1) : 0}
                                </span>
                            </td>
                            <td className={clsx("px-6 py-5 text-right text-lg", (totals.tahsilat - totals.satis) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {(totals.tahsilat - totals.satis) >= 0 ? '+' : ''}{(totals.tahsilat - totals.satis).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Info Legend */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-4">
                    <div className="p-3 bg-blue-500 rounded-xl text-white">
                        <TrendingUp size={24} />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-tighter">Net Satış</div>
                        <div className="text-sm font-medium text-blue-900">Satışlar - İadeler</div>
                    </div>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-4">
                    <div className="p-3 bg-emerald-500 rounded-xl text-white">
                        <TrendingDown size={24} className="rotate-180" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-tighter">Tahsilat</div>
                        <div className="text-sm font-medium text-emerald-900">Nakit, Çek, Senet, K.Kartı</div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-4 text-center justify-center">
                    <p className="text-xs text-gray-500 font-medium">
                        * TCMB kurları iş günleri baz alınarak uygulanmıştır. Hafta sonu işlemleri için bir önceki iş günü kuru kullanılır.
                    </p>
                </div>
            </div>
        </div>
    );
}
