import { X, TrendingUp, TrendingDown, AlertTriangle, FileText, History, Calendar, Clock, CreditCard } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export default function AccountDetailModal({ account, onClose }) {
    const [ekstre, setEkstre] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (account) {
            fetchEkstre();
        }
    }, [account]);

    const fetchEkstre = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('cari_ekstre')
                .select('*')
                .eq('cari_kod', account.cari_kod)
                .eq('sube_adi', account.sube_adi)
                .eq('para_birimi', account.para_birimi)
                .order('tarih', { ascending: false });

            if (error) throw error;
            setEkstre(data || []);
        } catch (err) {
            console.error('Error fetching ekstre:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!account) return null;

    const isTL = account.para_birimi === 'TL';
    const balance = account.guncel_bakiye;
    const currencySign = isTL ? '₺' : '$';

    // Status color and icon
    const getStatusColor = (status) => {
        switch (status) {
            case 'Olumlu': return 'text-green-500';
            case 'Olumsuz': return 'text-red-500';
            case 'Takipte': return 'text-orange-500';
            default: return 'text-gray-500';
        }
    };

    // Calculate 3/6 Month Stats from ekstre
    const calculateStats = (months) => {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);

        const periodData = ekstre.filter(e => new Date(e.tarih) >= cutoff);
        const sales = periodData.reduce((sum, e) => sum + (Number(e.borc) || 0), 0);
        const payments = periodData.reduce((sum, e) => sum + (Number(e.alacak) || 0), 0);

        return { sales, payments };
    };

    const stats3m = calculateStats(3);
    const stats6m = calculateStats(6);

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
            <div className="bg-gray-950 sm:bg-gray-900 rounded-none sm:rounded-xl w-full h-full sm:max-w-5xl sm:max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border-none sm:border border-gray-700" onClick={(e) => e.stopPropagation()}>
                {/* Header: Ultra Compact on Mobile */}
                <div className="bg-gray-900 border-b border-gray-800 p-2 sm:p-6 flex justify-between items-center text-left">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <h2 className="text-[11px] sm:text-2xl font-black text-white leading-none uppercase truncate">
                                {account.musteri_adi}
                            </h2>
                            <span className={`text-[7px] sm:text-sm px-1.5 py-0.5 rounded-full bg-gray-800 ${getStatusColor(account.durum)} border border-current font-black uppercase tracking-tighter leading-none`}>
                                {account.durum}
                            </span>
                        </div>
                        <p className="text-gray-500 mt-0.5 flex items-center gap-1.5 text-[8px] sm:text-sm leading-none">
                            <span className="bg-gray-800 px-1 py-0.5 rounded font-mono text-gray-400">{account.cari_kod}</span>
                            <span className="opacity-30">|</span>
                            <span className="font-bold uppercase italic">{account.sube_adi}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="ml-2 p-1 bg-gray-800 sm:bg-transparent hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-all">
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-1.5 sm:p-6 space-y-2 sm:space-y-8">
                    {/* Main Info Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-6">
                        {/* Balance Card: Stacked on Mobile */}
                        <div className="lg:col-span-2 bg-gradient-to-br from-gray-900 to-black rounded-lg p-3 sm:p-6 border border-gray-800 shadow-lg relative overflow-hidden group">
                            <div className="relative z-10">
                                <div className="text-gray-500 text-[8px] sm:text-xs font-black uppercase tracking-widest mb-1">GÜNCEL BAKİYE ({account.para_birimi})</div>
                                <div className={`text-3xl sm:text-5xl font-black tracking-tight leading-none ${balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {balance.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-xl sm:text-3xl font-light opacity-60 ml-1">{currencySign}</span>
                                </div>
                                {balance > 0 ? (
                                    <div className="mt-3 text-rose-400 bg-rose-500/5 px-2.5 py-2 rounded-lg border border-rose-500/10 flex items-start gap-2">
                                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                                        <span className="text-[10px] sm:text-sm font-bold leading-tight">
                                            {account.borc_donemi} döneminden {account.borc_tutar?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySign} borç
                                        </span>
                                    </div>
                                ) : (
                                    <div className="mt-3 text-emerald-400 bg-emerald-500/5 px-2.5 py-2 rounded-lg border border-emerald-500/10 flex items-start gap-2">
                                        <TrendingUp size={14} className="mt-0.5 shrink-0" />
                                        <span className="text-[10px] sm:text-sm font-bold leading-tight">Vadesi geçmiş borcu bulunmuyor.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Rep & Risk Info: Side by side on Mobile */}
                        <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 grid grid-cols-2 lg:grid-cols-1 gap-4">
                            <div>
                                <div className="text-gray-600 text-[8px] sm:text-xs font-black uppercase tracking-widest mb-1">Temsilci</div>
                                <div className="text-gray-300 font-bold text-xs sm:text-lg truncate">{account.satis_temsilcisi || '-'}</div>
                            </div>
                            <div>
                                <div className="text-gray-600 text-[8px] sm:text-xs font-black uppercase tracking-widest mb-1">Risk Skoru</div>
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const score = account.risk_skoru || 0;
                                        const isNew = account.isNew || false;
                                        const bgColor = isNew ? 'text-blue-400' : score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : score >= 40 ? 'text-orange-400' : 'text-rose-400';
                                        return (
                                            <div className={`font-black text-sm sm:text-xl ${bgColor}`}>
                                                {isNew ? 'YENİ' : score}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* AI Analysis Section: Tight on Mobile */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-6 text-left">
                        <div className="bg-blue-600/5 rounded-lg border border-blue-500/10 p-2.5 relative">
                            <div className="flex items-center gap-1.5 mb-1">
                                <FileText size={12} className="text-blue-400" />
                                <h3 className="text-[8px] sm:text-base font-black text-white uppercase tracking-tighter">AI Özeti</h3>
                            </div>
                            <div className="text-gray-400 leading-snug text-[9.5px] sm:text-lg italic">
                                {account.metinsel_yorum || "Analiz kaydı bulunamadı."}
                            </div>
                        </div>

                        <div className="bg-emerald-600/5 rounded-lg border border-emerald-500/10 p-2.5 relative">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp size={12} className="text-emerald-400" />
                                <h3 className="text-[8px] sm:text-base font-black text-white uppercase tracking-tighter">Analiz Detayı</h3>
                            </div>
                            <div className="text-gray-400 leading-snug text-[9px] sm:text-sm whitespace-pre-line overflow-y-auto max-h-[80px] sm:max-h-none">
                                {account.detayli_yorum || "Detaylı analiz verisi senkronizasyon bekliyor."}
                            </div>
                        </div>
                    </div>

                    {/* Advanced Metrics Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Tahsilat Oranları (3 ve 6 Aylık Tutar Detaylı) */}
                        <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Clock size={14} className="text-blue-400" />
                                    Performans Analizi
                                </div>
                                <span className="text-[8px] opacity-40 font-mono tracking-tight lowercase">3/6 Ay Kıyasla</span>
                            </h4>
                            <div className="space-y-6">
                                {/* 3 Aylık */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div className="text-gray-400 text-[10px] font-bold uppercase">Son 3 Ay</div>
                                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-tighter self-end mb-0.5">VERİMLİLİK %{account.tahsilat_oran_3ay || 0}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mb-1">
                                        <div className="bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                                            <div className="text-[7px] text-gray-600 font-bold uppercase tracking-widest mb-0.5">Satış (Borç)</div>
                                            <div className="text-xs sm:text-sm font-black text-rose-500/80 leading-none">
                                                {stats3m.sales.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[8px] opacity-40">{currencySign}</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                                            <div className="text-[7px] text-gray-600 font-bold uppercase tracking-widest mb-0.5">Tahsilat (Alacak)</div>
                                            <div className="text-xs sm:text-sm font-black text-emerald-500/80 leading-none">
                                                {stats3m.payments.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[8px] opacity-40">{currencySign}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500" style={{ width: `${account.tahsilat_oran_3ay || 0}%` }}></div>
                                    </div>
                                </div>

                                {/* 6 Aylık */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <div className="text-gray-400 text-[10px] font-bold uppercase">Son 6 Ay</div>
                                        <div className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter self-end mb-0.5">VERİMLİLİK %{account.tahsilat_oran_6ay || 0}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mb-1">
                                        <div className="bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                                            <div className="text-[7px] text-gray-600 font-bold uppercase tracking-widest mb-0.5">Satış (Borç)</div>
                                            <div className="text-xs sm:text-sm font-black text-rose-500/80 leading-none">
                                                {stats6m.sales.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[8px] opacity-40">{currencySign}</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                                            <div className="text-[7px] text-gray-600 font-bold uppercase tracking-widest mb-0.5">Tahsilat (Alacak)</div>
                                            <div className="text-xs sm:text-sm font-black text-emerald-500/80 leading-none">
                                                {stats6m.payments.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} <span className="text-[8px] opacity-40">{currencySign}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${account.tahsilat_oran_6ay || 0}%` }}></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ödeme Tipleri */}
                        <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                <CreditCard size={14} className="text-purple-400" />
                                Ödeme Alışkanlığı (Tüm Zamanlar)
                            </h4>
                            <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-800">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${account.nakit_orani || 0}%` }} title={`Nakit: %${account.nakit_orani}`}></div>
                                <div className="h-full bg-blue-400 transition-all" style={{ width: `${account.kk_orani || 0}%` }} title={`Kredi Kartı: %${account.kk_orani}`}></div>
                                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${account.havale_orani || 0}%` }} title={`Havale/EFT: %${account.havale_orani}`}></div>
                                <div className="h-full bg-amber-500 transition-all" style={{ width: `${account.cek_senet_orani || 0}%` }} title={`Çek/Senet: %${account.cek_senet_orani}`}></div>
                                <div className="h-full bg-gray-600 transition-all" style={{ width: `${account.diger_orani || 0}%` }} title={`Diğer: %${account.diger_orani}`}></div>
                            </div>
                            <div className="grid grid-cols-5 gap-0.5 mt-3">
                                <div className="text-center">
                                    <div className="text-[7px] text-gray-500 font-bold uppercase truncate">Nakit</div>
                                    <div className="text-[10px] font-black text-emerald-400">%{account.nakit_orani || 0}</div>
                                </div>
                                <div className="text-center border-l border-gray-800">
                                    <div className="text-[7px] text-gray-500 font-bold uppercase truncate">K.Kartı</div>
                                    <div className="text-[10px] font-black text-blue-400">%{account.kk_orani || 0}</div>
                                </div>
                                <div className="text-center border-l border-gray-800">
                                    <div className="text-[7px] text-gray-500 font-bold uppercase truncate">Havale</div>
                                    <div className="text-[10px] font-black text-indigo-400">%{account.havale_orani || 0}</div>
                                </div>
                                <div className="text-center border-l border-gray-800">
                                    <div className="text-[7px] text-gray-500 font-bold uppercase truncate">Çek/Senet</div>
                                    <div className="text-[10px] font-black text-amber-400">%{account.cek_senet_orani || 0}</div>
                                </div>
                                <div className="text-center border-l border-gray-800">
                                    <div className="text-[7px] text-gray-500 font-bold uppercase truncate">Diğer</div>
                                    <div className="text-[10px] font-black text-gray-400">%{account.diger_orani || 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Transaction History: Optimized Table for Mobile */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <History size={16} className="text-purple-400" />
                                <h3 className="text-[10px] sm:text-lg font-black text-white uppercase tracking-widest">Hareket Geçmişi</h3>
                            </div>
                            <div className="text-gray-600 text-[8px] sm:text-xs font-bold uppercase tracking-widest">
                                {ekstre.length} KAYIT
                            </div>
                        </div>

                        <div className="bg-gray-950 sm:rounded-xl border-y sm:border border-gray-800 overflow-hidden">
                            <div className="overflow-x-auto scrollbar-hide">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-gray-900/50 text-gray-500 text-[7px] sm:text-xs uppercase font-black tracking-tighter border-b border-gray-800">
                                            <th className="px-1 sm:px-6 py-2">Tarih</th>
                                            <th className="px-1 sm:px-6 py-2">Açıklama</th>
                                            <th className="px-1 py-2 text-right">Borç</th>
                                            <th className="px-1 sm:px-6 py-2 text-right">Alacak</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-900/30">
                                        {loading ? (
                                            <tr>
                                                <td colSpan="4" className="px-4 py-8 text-center text-gray-600 text-[10px] italic">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                                        Yükleniyor...
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : ekstre.length > 0 ? (
                                            ekstre.map((row, idx) => (
                                                <tr key={idx} className="hover:bg-gray-900/40 transition-colors group border-b border-gray-900/20">
                                                    <td className="px-1 sm:px-6 py-1 text-gray-400 font-mono text-[7px] sm:text-sm whitespace-nowrap">
                                                        {new Date(row.tarih).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-1 sm:px-6 py-1 text-gray-500 text-[7px] sm:text-sm max-w-[80px] sm:max-w-md truncate leading-tight">
                                                        {row.aciklama}
                                                    </td>
                                                    <td className="px-1 py-1 text-right text-rose-500/80 font-black tabular-nums text-[7px] sm:text-sm whitespace-nowrap leading-none">
                                                        {row.borc > 0 ? row.borc.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                    <td className="px-1 sm:px-6 py-1 text-right text-emerald-500/80 font-black tabular-nums text-[7px] sm:text-sm whitespace-nowrap leading-none">
                                                        {row.alacak > 0 ? row.alacak.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="px-4 py-8 text-center text-gray-600 text-[10px] uppercase font-black tracking-widest">
                                                    Hareket kaydı bulunamadı.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer: Compact */}
                <div className="bg-gray-900 p-2 sm:p-4 border-t border-gray-800 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 sm:flex-none px-4 py-2 sm:px-8 sm:py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 font-black rounded-lg text-[9px] sm:text-sm uppercase tracking-widest transition-all"
                    >
                        Kapat
                    </button>
                    <button
                        className="flex-1 sm:flex-none px-4 py-2 sm:px-8 sm:py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-lg text-[9px] sm:text-sm uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20 active:scale-95 flex items-center justify-center gap-2"
                        onClick={() => window.print()}
                    >
                        <History size={14} />
                        YAZDIR
                    </button>
                </div>
            </div>
        </div>
    );
}

// Add these to existing imports if missing
const Banknote = ({ size, className }) => <FileText size={size} className={className} />; // Placeholder as Banknote icon or use appropriate lucide-react name if available
