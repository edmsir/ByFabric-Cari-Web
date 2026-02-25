import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    ChevronRight,
    ChevronDown,
    RefreshCw,
    CreditCard,
    DollarSign
} from 'lucide-react';
import clsx from 'clsx';
import React from 'react';

import { useFilters } from '../context/FilterContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';

const MONTH_MAP = {
    'OCAK': 1, 'ŞUBAT': 2, 'MART': 3, 'NİSAN': 4, 'MAYIS': 5, 'HAZİRAN': 6,
    'TEMMUZ': 7, 'AĞUSTOS': 8, 'EYLÜL': 9, 'EKİM': 10, 'KASIM': 11, 'ARALIK': 12
};

const toTurkishUpper = (str) => {
    if (!str) return '';
    return str.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
};

export default function MonthlyEvaluation() {
    const { user, role, profile } = useAuth();
    const { filters } = useFilters();
    const { allAccounts, loading: dataLoading, loadingStage: dataLoadingStage, refreshData } = useData();
    const { settings } = useSettings();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState('');
    const [expandedRows, setExpandedRows] = useState({});
    const isFetching = useRef(false);

    const { minTL, minUSD, balanceType } = filters;

    useEffect(() => {
        if (allAccounts.length > 0) {
            const processed = allAccounts.filter(acc => {
                // RBAC: Check role-based access
                if (role === 'sales_rep' && acc.satis_temsilcisi !== profile?.assigned_sales_rep) return false;
                if (role === 'branch_manager' && acc.sube_adi !== profile?.assigned_branch) return false;

                const isUnknownBranch = !acc.sube_adi || acc.sube_adi.toLowerCase().includes('bilinmeyen');
                const isIgnoreRep = acc.satis_temsilcisi && acc.satis_temsilcisi.includes('DİKKATE ALMA');
                const isBB = parseFloat(acc.guncel_bakiye || 0) > 0;
                return !isUnknownBranch && !isIgnoreRep && isBB;
            });
            setData(processed);
        }
    }, [allAccounts, role, profile]);

    const toggleRow = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const riskyAccounts = useMemo(() => {
        return data
            .filter(acc => {
                const isUSD = acc.para_birimi === 'USD';
                const bakiye = parseFloat(acc.guncel_bakiye || 0);
                const minLimit = isUSD ? minUSD : minTL;
                const hasRisk = acc.durum === 'Takipte' || acc.durum === 'Olumsuz' || (acc.risk_skoru && acc.risk_skoru < settings.riskLimits.mediumRiskScore);

                return hasRisk && bakiye >= minLimit;
            })
            .sort((a, b) => a.risk_skoru - b.risk_skoru) // Düşük puan daha riskli
            .slice(0, settings.display.maxRiskyAccounts);
    }, [data, minTL, minUSD]);

    const branchSummaries = useMemo(() => {
        const branchGroups = {};
        const months = ['OCAK', 'ŞUBAT', 'MART', 'NİSAN', 'MAYIS', 'HAZİRAN', 'TEMMUZ', 'AĞUSTOS', 'EYLÜL', 'EKİM', 'KASIM', 'ARALIK'];
        const now = new Date();
        const CURRENT_PERIOD = `${months[now.getMonth()]} ${now.getFullYear()}`;

        data.forEach(acc => {
            const branch = acc.sube_adi;
            const bakiye = parseFloat(acc.guncel_bakiye || 0);
            const reportCurrency = acc.para_birimi || 'TL';

            // Filtre kontrolü: Sadece BB (Borçlu) ve min bakiye üstü carileri al
            if (bakiye <= 0) return;

            const minLimit = reportCurrency === 'USD' ? minUSD : minTL;
            if (bakiye < minLimit) return;

            if (!branch || branch.toLowerCase().includes('bilinmeyen')) return;

            if (!branchGroups[branch]) {
                branchGroups[branch] = {
                    name: branch,
                    tlMonths: {},
                    usdMonths: {},
                    tlTotal: { debt: 0, balance: 0, count: 0 },
                    usdTotal: { debt: 0, balance: 0, count: 0 },
                    performance: {
                        ratio3: 0, ratio6: 0, count: 0,
                        payTypes: { nakit: 0, kk: 0, cek: 0, total: 0 }
                    }
                };
            }

            const bg = branchGroups[branch];
            const p = bg.performance;
            p.ratio3 += Number(acc.tahsilat_oran_3ay || 0);
            p.ratio6 += Number(acc.tahsilat_oran_6ay || 0);
            p.payTypes.nakit += Number(acc.nakit_orani || 0);
            p.payTypes.kk += Number(acc.kk_orani || 0);
            p.payTypes.cek += Number(acc.cek_senet_orani || 0);
            p.payTypes.total += (Number(acc.nakit_orani || 0) + Number(acc.kk_orani || 0) + Number(acc.cek_senet_orani || 0) + Number(acc.diger_orani || 0)) > 0 ? 1 : 0;
            p.count++;

            // Para birimine göre uygun gruba ekle
            const isTL = reportCurrency === 'TL';
            const monthsGroup = isTL ? bg.tlMonths : bg.usdMonths;
            const totalGroup = isTL ? bg.tlTotal : bg.usdTotal;

            let period = acc.borc_donemi;
            if (!period || period === 'Belirsiz' || period.includes('Dönemsiz')) {
                period = CURRENT_PERIOD;
            }

            if (!monthsGroup[period]) {
                monthsGroup[period] = { period: period, debt: 0, balance: 0, count: 0, sortKey: 0, accounts: [] };

                const parts = period.split(' ');
                if (parts.length >= 2) {
                    const m = toTurkishUpper(parts[0]);
                    const y = parseInt(parts[1]);
                    if (MONTH_MAP[m] && !isNaN(y)) {
                        monthsGroup[period].sortKey = (y * 100) + MONTH_MAP[m];
                    } else {
                        monthsGroup[period].sortKey = 999999;
                    }
                } else {
                    monthsGroup[period].sortKey = 999999;
                }
            }

            const vDebt = parseFloat(acc.borc_tutar || 0);
            monthsGroup[period].debt += vDebt;
            monthsGroup[period].balance += bakiye;
            monthsGroup[period].count += 1;
            monthsGroup[period].accounts.push({
                name: acc.musteri_adi,
                code: acc.cari_kod,
                debt: vDebt,
                balance: bakiye
            });
            totalGroup.debt += vDebt;
            totalGroup.balance += bakiye;
            totalGroup.count += 1;
        });

        return Object.values(branchGroups)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(b => ({
                ...b,
                tlMonths: Object.values(b.tlMonths).sort((a, b) => a.sortKey - b.sortKey), // Eskiden yeniye sıralama
                usdMonths: Object.values(b.usdMonths).sort((a, b) => a.sortKey - b.sortKey)
            }));
    }, [data, minTL, minUSD]);

    if (loading || dataLoading) return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <RefreshCw className="animate-spin h-10 w-10 text-primary" />
            <p className="text-gray-500 font-medium">{loadingStage || dataLoadingStage || 'Veriler Hazırlanıyor...'}</p>
        </div>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">
            <div className="flex justify-between items-end border-b pb-4 border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">Aylık Değerlendirme & Pivot Analizi</h1>
                    <p className="text-gray-500 text-sm">Gerçek zamanlı borç kaynağı ve bakiye dağılımı (Sadece BB Cariler)</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => refreshData()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 font-bold text-xs uppercase hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                    >
                        <RefreshCw size={14} className={dataLoading ? 'animate-spin' : ''} />
                        Yenile
                    </button>
                    <div className="text-right">
                        <span className="bg-gray-100 px-3 py-1 rounded-full text-xs font-bold text-gray-600">
                            {data.length} Aktif Cari İncelendi
                        </span>
                    </div>
                </div>
            </div>

            {/* Risky Accounts Section */}
            <section>
                <div className="flex items-center space-x-2 mb-4">
                    <AlertTriangle className="text-red-500 h-5 w-5" />
                    <h2 className="text-lg font-semibold text-gray-700">Takip Edilmesi Gereken Riskli Cariler</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {riskyAccounts.map(acc => {
                        const isUSD = acc.report_currency === 'USD';
                        return (
                            <div key={acc.cari_kod} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-3 overflow-hidden">
                                    <div className="min-w-0 pr-2">
                                        <h3 className="font-bold text-gray-800 truncate" title={acc.musteri_adi}>{acc.musteri_adi}</h3>
                                        <div className="flex items-center space-x-2">
                                            <p className="text-xs text-gray-400">{acc.cari_kod}</p>
                                            <span className={clsx("text-[10px] px-1 rounded-sm font-bold uppercase", isUSD ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700")}>
                                                {isUSD ? 'USD CARİ' : 'TL CARİ'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={clsx("flex-shrink-0 px-2 py-1 rounded text-xs font-bold", acc.risk_skoru < 40 ? "bg-red-100 text-red-600" : "bg-yellow-100 text-yellow-600")}>
                                        {acc.risk_skoru} Puan
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex justify-between text-[10px] mb-1 font-bold uppercase tracking-wider text-gray-400">
                                            <span>Risk Seviyesi</span>
                                            <span className={acc.risk_skoru < 30 ? "text-red-600" : "text-yellow-600"}>{acc.risk_skoru < 30 ? 'KRİTİK' : 'YÜKSEK'}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                            <div className={clsx("h-1.5 rounded-full transition-all duration-1000", acc.risk_skoru < 30 ? "bg-red-600" : "bg-yellow-500")} style={{ width: `${acc.risk_skoru}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end border-t pt-2 border-gray-50">
                                        <div className="text-[10px] text-gray-400 uppercase font-black tracking-tight">Güncel Bakiye</div>
                                        <div className="text-right">
                                            {isUSD ? (
                                                <div className="font-bold text-green-700 text-sm">{(acc.guncel_bakiye || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</div>
                                            ) : (
                                                <div className="font-bold text-gray-900 text-sm">{(acc.guncel_bakiye || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end border-t pt-2 border-gray-50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-tight">Sessizlik</span>
                                            <span className={clsx(
                                                "text-[10px] sm:text-sm font-black italic",
                                                acc.gecen_gun === 0 && acc.is_new_customer ? "text-blue-500" : (acc.gecen_gun > 60 ? "text-rose-600" : "text-gray-900")
                                            )}>
                                                {acc.gecen_gun === 0 && acc.is_new_customer ? "YENİ CARİ" : (acc.gecen_gun >= 999 ? "HİÇ ÖDEME YOK" : `${acc.gecen_gun} GÜN`)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    {riskyAccounts.length === 0 && <div className="col-span-full py-10 bg-white rounded-xl border border-dashed border-gray-200 text-center text-gray-400">Aranan kriterlerde riskli cari bulunamadı.</div>}
                </div>
            </section>

            {/* Branch-based summaries */}
            <div className="space-y-16">
                {branchSummaries.map((branch) => (
                    <div key={branch.name} className="space-y-6">
                        <div className="flex items-center justify-between border-l-4 border-slate-900 pl-4">
                            <h2 className="text-xl font-black text-slate-900 uppercase tracking-widest">{branch.name} PERFORMANSI</h2>
                            <div className="flex gap-4">
                                <div className="text-right border-r pr-4 border-gray-200">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">TL Bakiye (Net)</p>
                                    <p className="text-sm font-bold text-blue-700">{branch.tlTotal.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">USD Bakiye (Net)</p>
                                    <p className="text-sm font-bold text-emerald-700">{branch.usdTotal.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</p>
                                </div>
                            </div>
                        </div>

                        {/* Performance Scorecard Table Context */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                                    <span>Tahsilat Verimliliği</span>
                                    <TrendingUp size={14} className="text-blue-500" />
                                </div>
                                <div className="flex items-end justify-between">
                                    <div className="space-y-1">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">3 Ay Ort.</p>
                                        <p className="text-2xl font-black text-slate-800 tracking-tighter">
                                            %{branch.performance.count > 0 ? Math.round(branch.performance.ratio3 / branch.performance.count) : 0}
                                        </p>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <p className="text-[9px] font-bold text-gray-400 uppercase">6 Ay Ort.</p>
                                        <p className="text-2xl font-black text-slate-900 tracking-tighter">
                                            %{branch.performance.count > 0 ? Math.round(branch.performance.ratio6 / branch.performance.count) : 0}
                                        </p>
                                    </div>
                                </div>
                                <div className="w-full bg-slate-100 h-1 rounded-full mt-3 overflow-hidden flex">
                                    <div className="bg-blue-600 h-full" style={{ width: `${branch.performance.count > 0 ? (branch.performance.ratio3 / branch.performance.count) : 0}%` }}></div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm flex flex-col justify-between">
                                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                                    <span>Tahsilat Karakteri</span>
                                    <CreditCard size={14} className="text-emerald-500" />
                                </div>
                                {(() => {
                                    const { nakit, kk, cek, total } = branch.performance.payTypes;
                                    const nOran = total > 0 ? Math.round(nakit / total) : 0;
                                    const kOran = total > 0 ? Math.round(kk / total) : 0;
                                    const cOran = total > 0 ? Math.round(cek / total) : 0;

                                    let dominant = "Bilinmeyen";
                                    let color = "text-slate-400";
                                    if (nOran > kOran && nOran > cOran) { dominant = "Nakit Ağırlıklı"; color = "text-emerald-600"; }
                                    else if (kOran > nOran && kOran > cOran) { dominant = "K. Kartı Ağırlıklı"; color = "text-blue-600"; }
                                    else if (cOran > nOran && cOran > kOran) { dominant = "Çek/Senet Ağırlıklı"; color = "text-amber-600"; }

                                    return (
                                        <>
                                            <div className={`text-xl font-black tracking-tighter leading-none mb-2 ${color}`}>{dominant.toUpperCase()}</div>
                                            <div className="w-full bg-slate-50 h-2 rounded-full overflow-hidden flex ring-1 ring-slate-100">
                                                <div className="bg-emerald-500 h-full" style={{ width: `${nOran}%` }}></div>
                                                <div className="bg-blue-500 h-full" style={{ width: `${kOran}%` }}></div>
                                                <div className="bg-amber-500 h-full" style={{ width: `${cOran}%` }}></div>
                                            </div>
                                            <div className="flex justify-between mt-2">
                                                <div className="flex flex-col"><span className="text-[8px] font-bold text-gray-400">NAKİT</span><span className="text-[10px] font-black text-emerald-600">%{nOran}</span></div>
                                                <div className="flex flex-col"><span className="text-[8px] font-bold text-gray-400">K.KARTI</span><span className="text-[10px] font-black text-blue-600">%{kOran}</span></div>
                                                <div className="flex flex-col items-end"><span className="text-[8px] font-bold text-gray-400">ÇEK</span><span className="text-[10px] font-black text-amber-600">%{cOran}</span></div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            {/* TL Pivot Table */}
                            {branch.tlTotal.count > 0 && (
                                <section className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-blue-600">
                                        <div className="flex items-center space-x-2">
                                            <CreditCard className="text-white h-5 w-5" />
                                            <h3 className="font-bold text-white uppercase tracking-tight text-sm">TL Pivot Değerlendirme</h3>
                                        </div>
                                        <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">{branch.tlTotal.count} Cari</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase font-black border-b border-gray-100">
                                                    <th className="px-4 py-3">Satır Etiketleri</th>
                                                    <th className="px-4 py-3 text-right">Borç Kaynağı Tutar</th>
                                                    <th className="px-4 py-3 text-right">Güncel Bakiye (TL)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {branch.tlMonths.map(m => {
                                                    const rowId = `${branch.name}-TL-${m.period}`;
                                                    const isExpanded = expandedRows[rowId];
                                                    return (
                                                        <React.Fragment key={m.period}>
                                                            <tr
                                                                className="hover:bg-blue-50 transition-colors cursor-pointer select-none group"
                                                                onClick={() => toggleRow(rowId)}
                                                            >
                                                                <td className="px-4 py-3 text-xs font-bold text-gray-700 flex items-center">
                                                                    {isExpanded ? <ChevronDown className="h-3 w-3 mr-2 text-blue-600" /> : <ChevronRight className="h-3 w-3 mr-2 text-gray-300 group-hover:text-blue-400" />}
                                                                    <span>{m.period}</span>
                                                                    <span className="ml-2 text-[9px] text-gray-400 font-normal">({m.count} Cari)</span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono text-xs text-blue-600 font-medium">{m.debt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                                <td className="px-4 py-3 text-right font-mono text-xs font-bold text-gray-800">{m.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                            {isExpanded && m.accounts.map(acc => (
                                                                <tr key={acc.code} className="bg-gray-50/40">
                                                                    <td className="px-4 py-2 text-xs text-gray-500 pl-10 border-l-2 border-blue-200">
                                                                        <div className="flex items-baseline space-x-2">
                                                                            <span className="font-medium text-gray-700">{acc.name}</span>
                                                                            <span className="text-[9px] opacity-40 font-mono tracking-tighter">{acc.code}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-400">{acc.debt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-600">{acc.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-800 text-white font-bold">
                                                <tr>
                                                    <td className="px-4 py-3 text-[10px] uppercase tracking-wider">TL GENEL TOPLAM</td>
                                                    <td className="px-4 py-3 text-right font-mono text-sm">{branch.tlTotal.debt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-sm">{branch.tlTotal.balance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </section>
                            )}

                            {/* USD Pivot Table */}
                            {branch.usdTotal.count > 0 && (
                                <section className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-green-700">
                                        <div className="flex items-center space-x-2">
                                            <DollarSign className="text-white h-5 w-5" />
                                            <h3 className="font-bold text-white uppercase tracking-tight text-sm">USD Pivot Değerlendirme</h3>
                                        </div>
                                        <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-bold">{branch.usdTotal.count} Cari</span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50 text-gray-400 text-[10px] uppercase font-black border-b border-gray-100">
                                                    <th className="px-4 py-3">Satır Etiketleri</th>
                                                    <th className="px-4 py-3 text-right">Borç Kaynağı Tutar</th>
                                                    <th className="px-4 py-3 text-right">Güncel Bakiye (USD)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {branch.usdMonths.map(m => {
                                                    const rowId = `${branch.name}-USD-${m.period}`;
                                                    const isExpanded = expandedRows[rowId];
                                                    return (
                                                        <React.Fragment key={m.period}>
                                                            <tr
                                                                className="hover:bg-green-50 transition-colors cursor-pointer select-none group"
                                                                onClick={() => toggleRow(rowId)}
                                                            >
                                                                <td className="px-4 py-3 text-xs font-bold text-gray-700 flex items-center">
                                                                    {isExpanded ? <ChevronDown className="h-3 w-3 mr-2 text-green-700" /> : <ChevronRight className="h-3 w-3 mr-2 text-gray-300 group-hover:text-green-500" />}
                                                                    <span>{m.period}</span>
                                                                    <span className="ml-2 text-[9px] text-gray-400 font-normal">({m.count} Cari)</span>
                                                                </td>
                                                                <td className="px-4 py-3 text-right font-mono text-xs text-green-700 font-medium">{m.debt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                                <td className="px-4 py-3 text-right font-mono text-xs font-bold text-gray-800">{m.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                            </tr>
                                                            {isExpanded && m.accounts.map(acc => (
                                                                <tr key={acc.code} className="bg-gray-50/40">
                                                                    <td className="px-4 py-2 text-xs text-gray-500 pl-10 border-l-2 border-green-200">
                                                                        <div className="flex items-baseline space-x-2">
                                                                            <span className="font-medium text-gray-700">{acc.name}</span>
                                                                            <span className="text-[9px] opacity-40 font-mono tracking-tighter">{acc.code}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-400">{acc.debt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="px-4 py-2 text-right font-mono text-[10px] text-gray-600">{acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-800 text-white font-bold">
                                                <tr>
                                                    <td className="px-4 py-3 text-[10px] uppercase tracking-wider">USD GENEL TOPLAM</td>
                                                    <td className="px-4 py-3 text-right font-mono text-sm">{branch.usdTotal.debt.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right font-mono text-sm">{branch.usdTotal.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </section>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
