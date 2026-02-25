import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useFilters } from '../context/FilterContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { aiService } from '../services/aiService';
import AccountDetailModal from '../components/AccountDetailModal';
import {
    TrendingUp,
    DollarSign,
    CreditCard,
    RefreshCw,
    Download,
    AlertTriangle,
    Search,
    Filter,
    Bot,
    MessageSquare,
    Sparkles,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { exportToExcel } from '../utils/excelExport';
import clsx from 'clsx';

export default function Dashboard() {
    const navigate = useNavigate();
    const { role, user, profile } = useAuth();
    const { showToast } = useToast();
    const { filters, updateFilter } = useFilters();

    const { allAccounts, reportData, loading, loadingStage, lastSync, sqlLastUpdate, refreshData } = useData();
    const { settings } = useSettings();
    const [salesReps, setSalesReps] = useState([]);
    const [branches, setBranches] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [expandedBranch, setExpandedBranch] = useState(null);
    const [activeCurrency, setActiveCurrency] = useState('TL');

    const {
        minTL,
        minUSD,
        balanceType,
        salesRep,
        branch: branchFilter,
        search
    } = filters;

    const usdRate = settings.usdRate;

    useEffect(() => {
        if (user?.id) {
            fetchExchangeRate();
        }
    }, [user?.id, role, profile?.assigned_sales_rep, profile?.assigned_branch]);

    // Update branches and reps when data changes
    useEffect(() => {
        if (allAccounts.length > 0) {
            const uniqueBranches = [...new Set(allAccounts.map(r => r.sube_adi).filter(b => b && !b.toLowerCase().includes('bilinmeyen')))].sort();
            setSalesReps([...new Set(allAccounts.map(r => r.satis_temsilcisi).filter(Boolean))].sort());
            setBranches(uniqueBranches);
            if (!expandedBranch && uniqueBranches.length > 0) {
                // RBAC: Default to assigned branch if exists
                if (role === 'branch_manager' && profile?.assigned_branch) {
                    setExpandedBranch(profile.assigned_branch);
                } else {
                    const merkezIndex = uniqueBranches.findIndex(b => b.toUpperCase() === 'MERKEZ');
                    setExpandedBranch(merkezIndex !== -1 ? uniqueBranches[merkezIndex] : uniqueBranches[0]);
                }
            }
        }
    }, [allAccounts]);

    const fetchExchangeRate = async () => {
        // Otomatik kur çekme işlemi artık Çalışma Parametreleri'nden yönetiliyor.
        // İsterseniz burada ayarları güncelleyen bir buton sunulabilir.
    };


    const toggleBranch = (branchName) => {
        setExpandedBranch(prev => prev === branchName ? null : branchName);
    };


    const { filteredGroups, stats } = useMemo(() => {
        const grouped = {};
        let debtTL = 0, creditTL = 0, debtUSD = 0, creditUSD = 0, risk = 0, count = 0;
        let dL = 0, dT = 0, dR = 0, dS = 0, dB = 0;

        const parseNum = (val) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const str = String(val).trim();
            // Turkish format: 1.250,50
            if (str.includes('.') && str.includes(',')) return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
            if (str.includes(',')) return parseFloat(str.replace(',', '.')) || 0;
            return parseFloat(str) || 0;
        };

        allAccounts.forEach((acc) => {
            const branch = (acc.sube_adi || 'Diğer').trim();
            const rep = (acc.satis_temsilcisi || '').trim();

            if (rep.includes('DİKKATE ALMA')) return;
            if (branch.toUpperCase().includes('BİLİNMEYEN') || branch === 'Diğer') return;

            const isSearching = search.trim().length > 0;
            const searchTerm = isSearching ? search.toLowerCase().toLocaleLowerCase('tr-TR') : '';

            // --- RBAC MANDATORY FILTERS ---
            if (role === 'sales_rep') {
                if (rep !== profile?.assigned_sales_rep) return;
            }
            if (role === 'branch_manager') {
                if (branch !== profile?.assigned_branch) return;
            }

            if (!isSearching) {
                if (branchFilter !== 'ALL' && branch !== branchFilter) { dB++; return; }
                if (salesRep !== 'ALL' && rep !== salesRep) { dR++; return; }
            }

            const bakiye = parseNum(acc.guncel_bakiye);
            const reportCurrency = (acc.para_birimi || 'TL').trim().toUpperCase();
            const minLimit = reportCurrency === 'TL' ? minTL : minUSD;

            if (Math.abs(bakiye) < minLimit) { dL++; return; }
            if (balanceType === 'BB' && bakiye <= 0) { dT++; return; }
            if (balanceType === 'AB' && bakiye >= 0) { dT++; return; }

            if (isSearching) {
                const matchName = acc.musteri_adi?.toLowerCase().toLocaleLowerCase('tr-TR').includes(searchTerm);
                const matchCode = acc.cari_kod?.toLowerCase().includes(searchTerm);
                if (!matchName && !matchCode) {
                    dS++;
                    return;
                }
            }

            // --- Stats Calculation for Performance Scorecard ---
            if (!grouped[branch]) {
                const branchReport = reportData.filter(r => r.sube_adi === branch);
                const tSatis = branchReport.reduce((sum, r) => sum + Number(r.toplam_satis || 0), 0);
                const tTahsilat = branchReport.reduce((sum, r) => sum + Number(r.toplam_tahsilat || 0), 0);

                grouped[branch] = {
                    TL: { BB: [], AB: [], totalDebt: 0, totalCredit: 0 },
                    USD: { BB: [], AB: [], totalDebt: 0, totalCredit: 0 },
                    performance: {
                        ratio3: 0, ratio6: 0, count: 0,
                        totalSales: tSatis,
                        totalPayments: tTahsilat,
                        payTypes: { nakit: 0, kk: 0, cek: 0, total: 0 }
                    }
                };
            }

            const p = grouped[branch].performance;
            p.ratio3 += Number(acc.tahsilat_oran_3ay || 0);
            p.ratio6 += Number(acc.tahsilat_oran_6ay || 0);
            p.payTypes.nakit += Number(acc.nakit_orani || 0);
            p.payTypes.kk += Number(acc.kk_orani || 0);
            p.payTypes.cek += Number(acc.cek_senet_orani || 0);
            p.payTypes.total += (Number(acc.nakit_orani || 0) + Number(acc.kk_orani || 0) + Number(acc.cek_senet_orani || 0) + Number(acc.diger_orani || 0)) > 0 ? 1 : 0;
            p.count++;

            const target = grouped[branch][reportCurrency];
            if (bakiye > 0) {
                target.BB.push(acc);
                target.totalDebt += bakiye;
                if (reportCurrency === 'TL') { debtTL += bakiye; }
                else { debtUSD += bakiye; }
            } else if (bakiye < 0) {
                target.AB.push(acc);
                target.totalCredit += Math.abs(bakiye);
                if (reportCurrency === 'TL') creditTL += Math.abs(bakiye);
                else creditUSD += Math.abs(bakiye);
            }

            if (acc.durum === 'Takipte' || acc.durum === 'Olumsuz') risk++;
            count++;
        });

        // Bakiyeleri büyükten küçüğe sırala
        Object.values(grouped).forEach(branch => {
            ['TL', 'USD'].forEach(cur => {
                // BB: En yüksek borç en üstte
                branch[cur].BB.sort((a, b) => (parseNum(b.guncel_bakiye)) - (parseNum(a.guncel_bakiye)));
                // AB: En yüksek alacak (mutlak değerce büyük olan) en üstte
                branch[cur].AB.sort((a, b) => Math.abs(parseNum(b.guncel_bakiye)) - Math.abs(parseNum(a.guncel_bakiye)));
            });
        });

        console.log('🔍 Filter Debug:', { total: allAccounts.length, visible: count, dropped: { limit: dL, type: dT, rep: dR, search: dS, branch: dB } });

        const netUSD = (debtTL / usdRate + debtUSD) - (creditTL / usdRate + creditUSD);
        const netTL = (debtTL + debtUSD * usdRate) - (creditTL + creditUSD * usdRate);

        return {
            filteredGroups: grouped,
            stats: { totalDebtTL: debtTL, totalCreditTL: creditTL, totalDebtUSD: debtUSD, totalCreditUSD: creditUSD, netUSD, netTL, riskCount: risk, totalCount: count }
        };
    }, [allAccounts, minTL, minUSD, usdRate, balanceType, salesRep, branchFilter, search]);

    // Şube değişince otomatik para birimi seçimi
    useEffect(() => {
        if (expandedBranch && filteredGroups[expandedBranch]) {
            const branchData = filteredGroups[expandedBranch];
            const hasTL = (branchData.TL.BB.length > 0 || branchData.TL.AB.length > 0);
            const hasUSD = (branchData.USD.BB.length > 0 || branchData.USD.AB.length > 0);

            if (activeCurrency === 'TL' && !hasTL && hasUSD) {
                setActiveCurrency('USD');
            } else if (activeCurrency === 'USD' && !hasUSD && hasTL) {
                setActiveCurrency('TL');
            }
        }
    }, [expandedBranch, filteredGroups]);

    const handleExport = () => {
        exportToExcel(allAccounts, `Cari_Rapor_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleAIAnalysis = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        showToast('AI risk analizi yapıyor...', 'info');
        try {
            const { data: riskReport } = await supabase.rpc('get_advanced_risk_report', {
                min_debt_tl: minTL, min_debt_usd: minUSD, months_lookback: 6
            });
            const analysisData = { totalCount: stats.totalCount, unifiedRisks: riskReport || [], totalDebtTL: stats.totalDebtTL, totalDebtUSD: stats.totalDebtUSD };
            const aiMessage = await aiService.generateAnalysisMessage(user?.email?.split('@')[0] || 'Yönetici', analysisData);
            await supabase.from('user_messages').insert([{ recipient_id: user.id, sender_name: 'Adem (AI)', title: '🧠 Risk Analizi', content: aiMessage, is_read: false }]);
            showToast('AI Analizi tamamlandı!', 'success');
        } catch (error) {
            console.error('AI Error:', error);
            showToast('AI Hatası: ' + error.message, 'error');
        } finally {
            setAnalyzing(false);
        }
    };

    const formatCurrency = (val, currency) => {
        return new Intl.NumberFormat('tr-TR', {
            style: 'currency',
            currency: currency === 'TL' ? 'TRY' : currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val || 0);
    };

    const branchNamesFromData = Object.keys(filteredGroups)
        .filter(name => !name.toLowerCase().includes('bilinmeyen'))
        .map(name => name.replace(/ ŞUBESİ/gi, '').replace(/ ŞUBE/gi, '').trim()) // Clear "ŞUBE" suffix
        .sort((a, b) => {
            if (a.toUpperCase() === 'MERKEZ') return -1;
            if (b.toUpperCase() === 'MERKEZ') return 1;
            const priority = { 'BAYRAMPAŞA': 1, 'BURSA': 2, 'ANKARA': 3 };
            const pA = priority[a.toUpperCase()] ?? 999;
            const pB = priority[b.toUpperCase()] ?? 999;
            if (pA !== pB) return pA - pB;
            return a.localeCompare(b);
        });

    const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleRefresh = () => refreshData();

    return (
        <div className="space-y-1 sm:space-y-6 pb-2">
            {/* Header: Ultra Compact on Mobile */}
            <header className="px-1 py-1 sm:px-12 sm:py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0">
                <div className="flex items-center gap-1.5 sm:gap-6">
                    <div className="w-6 h-6 sm:w-16 sm:h-16 bg-blue-600 rounded-lg sm:rounded-3xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Sparkles className="text-white w-3 h-3 sm:w-8 sm:h-8" />
                    </div>
                    <div>
                        <h1 className="text-[10px] sm:text-5xl font-black text-slate-900 tracking-tighter leading-none italic uppercase">
                            CARI RAPORLAMA <span className="text-blue-600">MERKEZİ</span>
                        </h1>
                        <div className="flex items-center gap-1 mt-0.5 whitespace-nowrap">
                            <span className="bg-slate-900 text-white text-[5px] sm:text-[10px] px-1 py-0.5 rounded font-black tracking-widest leading-none">V3.1 PREMIUM</span>
                            <span className="text-slate-500 text-[5px] sm:text-[10px] font-bold ml-1">
                                VERİ GÜNCELLEME: {sqlLastUpdate ? new Date(sqlLastUpdate).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'YÜKLENİYOR...'}
                            </span>
                            <span className="text-slate-300 text-[5px] sm:text-[10px] font-bold ml-1 opacity-40">| {currentTime}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-1">
                    <button
                        onClick={handleRefresh}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 font-black text-[8px] sm:text-[11px] uppercase tracking-tighter hover:bg-slate-50 transition-all active:scale-95"
                    >
                        <RefreshCw size={10} className={loading ? 'animate-spin' : ''} /> YENİLE
                    </button>
                    <button
                        onClick={() => navigate('/ai-report')}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1 px-2 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg font-black text-[8px] sm:text-[11px] uppercase tracking-tighter shadow-md shadow-blue-500/20 hover:scale-105 transition-all active:scale-95"
                    >
                        <Bot size={10} /> AI RAPOR
                    </button>
                </div>
            </header>

            {/* KPI Section: 3-column row on Mobile */}
            <div className="grid grid-cols-3 gap-0.5 px-1 mb-1">
                <div className="group relative bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 p-1.5 rounded-lg text-white shadow-md text-left overflow-hidden">
                    <div className="relative z-10">
                        <p className="text-[5px] sm:text-[10px] font-black uppercase tracking-tighter text-blue-200/80 leading-none mb-0.5">
                            {stats.netUSD >= 0 ? 'NET ALACAĞIMIZ (USD)' : 'NET BORCUMUZ (USD)'}
                        </p>
                        <h3 className="text-[9px] sm:text-lg font-black tracking-tighter tabular-nums leading-none">
                            {formatCurrency(Math.abs(stats.netUSD), 'USD')}
                        </h3>
                    </div>
                </div>

                <div className="group relative bg-white p-1.5 rounded-lg shadow-sm ring-1 ring-slate-100 overflow-hidden">
                    <div className="text-left">
                        <p className="text-[5px] sm:text-[10px] font-black uppercase tracking-tighter text-slate-400 leading-none mb-0.5">RİSKLİ</p>
                        <h3 className="text-[10px] sm:text-xl font-black text-slate-900 tracking-tighter leading-none">{stats.riskCount}</h3>
                    </div>
                </div>

                <div className="group relative bg-white p-1.5 rounded-lg shadow-sm ring-1 ring-slate-100 overflow-hidden">
                    <div className="text-left">
                        <p className="text-[5px] sm:text-[10px] font-black uppercase tracking-tighter text-slate-400 leading-none mb-0.5">TOPLAM</p>
                        <h3 className="text-[10px] sm:text-xl font-black text-slate-900 tracking-tighter leading-none">{stats.totalCount}</h3>
                    </div>
                </div>
            </div>

            {/* Dashboard Container: Zero padding on Mobile */}
            <div className="flex flex-col gap-1 sm:gap-6">
                <div className="bg-white/60 backdrop-blur-xl p-1 rounded-lg border border-white shadow-sm">
                    <div className="flex flex-col gap-1.5">
                        {/* Tab-style Branch Nav: Optimized for Mobile Scrolling */}
                        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide px-0.5 py-0.5">
                            {branchNamesFromData.map(name => (
                                <button
                                    key={name}
                                    onClick={() => setExpandedBranch(Object.keys(filteredGroups).find(k => k.includes(name)))}
                                    className={clsx(
                                        "px-3 py-2 rounded-lg font-black text-[9px] sm:text-xs uppercase tracking-tighter whitespace-nowrap transition-all shrink-0",
                                        expandedBranch?.includes(name)
                                            ? "bg-slate-900 text-white shadow-md shadow-slate-200"
                                            : "text-slate-400 hover:bg-slate-50 border border-transparent hover:border-slate-100"
                                    )}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>

                        {/* Search & Export: Ultra Compact */}
                        <div className="flex gap-1">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-2.5 h-2.5" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => updateFilter('search', e.target.value)}
                                    placeholder="Müşteri veya Cari Kod ara..."
                                    className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-[10px] sm:text-sm font-black text-slate-900 outline-none placeholder:text-slate-300 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                />
                            </div>
                            <button onClick={handleExport} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[8px] font-black shadow-sm flex items-center gap-1 uppercase tracking-tighter">
                                <Download size={10} /> EXCEL
                            </button>
                        </div>
                    </div>
                </div>

                {/* Filters Pane: More Visible */}
                <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-end gap-1.5 bg-slate-50/50 p-1.5 rounded-xl border border-slate-100 shadow-inner">
                    <FilterField label="Bakiye Tipi">
                        <select value={balanceType} onChange={e => updateFilter('balanceType', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg text-[9px] sm:text-[11px] font-black text-slate-900 py-1.5 sm:py-2.5 px-2 uppercase outline-none shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                            <option value="ALL" className="text-slate-900">TÜMÜ</option>
                            <option value="BB" className="text-slate-900">BORÇLULAR</option>
                            <option value="AB" className="text-slate-900">ALACAKLILAR</option>
                        </select>
                    </FilterField>
                    <FilterField label="S. Temsilcisi">
                        <select value={salesRep} onChange={e => updateFilter('salesRep', e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg text-[9px] sm:text-[11px] font-black text-slate-900 py-1.5 sm:py-2.5 px-2 uppercase outline-none shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                            <option value="ALL" className="text-slate-900">PERSONEL</option>
                            {salesReps.map(r => <option key={r} value={r} className="text-slate-900">{r}</option>)}
                        </select>
                    </FilterField>
                    <FilterField label="Min. TL">
                        <input type="number" value={minTL} onChange={e => updateFilter('minTL', parseFloat(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg text-[9px] sm:text-[11px] font-black text-slate-900 py-1.5 sm:py-2.5 px-2 outline-none shadow-sm focus:ring-1 focus:ring-blue-500/20" />
                    </FilterField>
                    <FilterField label="Min. USD">
                        <input type="number" value={minUSD} onChange={e => updateFilter('minUSD', parseFloat(e.target.value) || 0)} className="w-full bg-white border border-slate-200 rounded-lg text-[9px] sm:text-[11px] font-black text-slate-900 py-1.5 sm:py-2.5 px-2 outline-none shadow-sm focus:ring-1 focus:ring-blue-500/20" />
                    </FilterField>
                </div>

                {/* Content Area: Reduced spacing and padding on Mobile */}
                <main>
                    {loading && allAccounts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 sm:py-40 animate-pulse">
                            <div className="relative">
                                <RefreshCw className="h-12 w-12 sm:h-20 sm:w-20 text-blue-500 opacity-20 animate-spin" />
                                <RefreshCw className="h-8 w-8 sm:h-12 sm:w-12 text-blue-600 animate-spin absolute inset-0 m-auto" />
                            </div>
                            <p className="mt-6 sm:mt-8 font-black uppercase tracking-[0.2em] text-[10px] sm:text-[12px] text-blue-600">{loadingStage}</p>
                        </div>
                    ) : (
                        <div className="animate-in fade-in zoom-in-95 duration-700">
                            {Object.entries(filteredGroups).map(([branchName, branchData]) => {
                                const isSearching = search.trim().length > 0;
                                if (!isSearching && branchName !== expandedBranch) return null;

                                const hasTL = (branchData.TL.BB.length > 0 || branchData.TL.AB.length > 0);
                                const hasUSD = (branchData.USD.BB.length > 0 || branchData.USD.AB.length > 0);
                                const currentActiveCurrency = isSearching ? (hasTL ? 'TL' : (hasUSD ? 'USD' : '')) : activeCurrency;

                                if (!hasTL && !hasUSD && isSearching) return null;

                                return (
                                    <div key={branchName} className={clsx("space-y-1 sm:space-y-4", isSearching && "mb-10 p-2 bg-slate-50/30 rounded-2xl border border-slate-100")}>
                                        {/* Branch Title */}
                                        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 px-1 sm:px-2 pt-1 sm:pt-2">
                                            {/* Branch Title & Info */}
                                            <div className="flex items-center gap-1.5 min-w-[200px] lg:border-r border-slate-100 lg:pr-6 py-2">
                                                <div className="h-6 sm:h-12 w-1 sm:w-2 bg-blue-600 rounded-full shrink-0"></div>
                                                <div className="min-w-0">
                                                    <h2 className="text-sm sm:text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none truncate">
                                                        {branchName.replace(/ ŞUBESİ/gi, '').replace(/ ŞUBE/gi, '')}
                                                    </h2>
                                                    <p className="text-[6px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest mt-0.5 flex items-center gap-1 leading-none">
                                                        {branchData.TL.BB.length + branchData.TL.AB.length + branchData.USD.BB.length + branchData.USD.AB.length} Kayıt
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Performance Cards Integration */}
                                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                                                <div className="bg-white/60 backdrop-blur-sm border border-slate-100 rounded-xl p-2 sm:p-3 flex items-center justify-between group hover:border-blue-200 transition-colors">
                                                    <div className="flex-1">
                                                        <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                            <TrendingUp size={10} className="text-blue-500" />
                                                            <span>Tahsilat Verimliliği</span>
                                                        </div>
                                                        <div className="flex items-end gap-3">
                                                            <div className="text-xl sm:text-2xl font-black text-slate-800 tracking-tighter leading-none">
                                                                %{branchData.performance.count > 0 ? Math.round(branchData.performance.ratio3 / branchData.performance.count) : 0}
                                                            </div>
                                                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                                                                <div className="bg-blue-500 h-full" style={{ width: `${branchData.performance.count > 0 ? (branchData.performance.ratio3 / branchData.performance.count) : 0}%` }}></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-4 border-l border-slate-100 pl-4 py-1 ml-4">
                                                        <div className="text-right">
                                                            <p className="text-[7px] font-bold text-slate-400 uppercase leading-none mb-1">Toplam Satış</p>
                                                            <p className="text-[10px] sm:text-xs font-black text-slate-700 leading-none">
                                                                {branchData.performance.totalSales.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} $
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[7px] font-bold text-emerald-500 uppercase leading-none mb-1">Tahsilat</p>
                                                            <p className="text-[10px] sm:text-xs font-black text-emerald-600 leading-none">
                                                                {branchData.performance.totalPayments.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} $
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-white/60 backdrop-blur-sm border border-slate-100 rounded-xl p-2 sm:p-3 flex flex-col justify-center group hover:border-emerald-200 transition-colors">
                                                    <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                        <CreditCard size={10} className="text-emerald-500" />
                                                        <span>Hakim Ödeme Türü</span>
                                                    </div>
                                                    {(() => {
                                                        const { nakit, kk, cek, total } = branchData.performance.payTypes;
                                                        const nOran = total > 0 ? Math.round(nakit / total) : 0;
                                                        const kOran = total > 0 ? Math.round(kk / total) : 0;
                                                        const cOran = total > 0 ? Math.round(cek / total) : 0;

                                                        let dominant = "Nakit";
                                                        let color = "text-emerald-600";
                                                        if (kOran > nOran && kOran > cOran) { dominant = "K. Kartı"; color = "text-blue-600"; }
                                                        else if (cOran > nOran && cOran > kOran) { dominant = "Çek/Senet"; color = "text-amber-600"; }

                                                        return (
                                                            <div className="flex items-center gap-4">
                                                                <div className={`text-[10px] sm:text-sm font-black tracking-tight leading-none ${color} uppercase whitespace-nowrap`}>
                                                                    {dominant}
                                                                </div>
                                                                <div className="flex-1 space-y-1">
                                                                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden flex">
                                                                        <div className="bg-emerald-500 h-full shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]" style={{ width: `${nOran}%` }}></div>
                                                                        <div className="bg-blue-500 h-full shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]" style={{ width: `${kOran}%` }}></div>
                                                                        <div className="bg-amber-500 h-full shadow-[inset_0_-1px_0_rgba(0,0,0,0.1)]" style={{ width: `${cOran}%` }}></div>
                                                                    </div>
                                                                    <div className="flex justify-between">
                                                                        <span className="text-[7px] font-bold text-emerald-500">N:%{nOran}</span>
                                                                        <span className="text-[7px] font-bold text-blue-500">K:%{kOran}</span>
                                                                        <span className="text-[7px] font-bold text-amber-500">Ç:%{cOran}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Currency Tabs */}
                                        <div className="flex gap-1 px-1 sm:px-2">
                                            {[
                                                { id: 'TL', label: 'TL', icon: <CreditCard size={12} />, exists: hasTL },
                                                { id: 'USD', label: 'USD', icon: <DollarSign size={12} />, exists: hasUSD }
                                            ].map(cur => {
                                                if (!cur.exists) return null;
                                                return (
                                                    <button
                                                        key={cur.id}
                                                        onClick={() => setActiveCurrency(cur.id)}
                                                        className={clsx(
                                                            "flex items-center gap-1 px-3 py-1.5 rounded-lg font-black text-[8px] sm:text-xs uppercase tracking-tighter transition-all duration-300",
                                                            (isSearching ? currentActiveCurrency === cur.id : activeCurrency === cur.id)
                                                                ? (cur.id === 'TL' ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20")
                                                                : "bg-white text-slate-400 border border-slate-100 hover:bg-slate-50"
                                                        )}
                                                    >
                                                        {cur.icon}
                                                        {cur.label}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Tables Container */}
                                        <div className="px-0 sm:px-2 pb-2 sm:pb-6">
                                            {(isSearching ? currentActiveCurrency === 'TL' : activeCurrency === 'TL') && hasTL && (
                                                <div className="space-y-1 sm:space-y-4">
                                                    {branchData.TL.BB.length > 0 && (
                                                        <TableSection title="📉 Borçlu Bakiyeler (BB)" color="rose" list={branchData.TL.BB} total={branchData.TL.totalDebt} currency="TL" formatCurrency={formatCurrency} onSelect={setSelectedAccount} />
                                                    )}
                                                    {branchData.TL.AB.length > 0 && (
                                                        <TableSection title="📈 Alacaklı Bakiyeler (AB)" color="emerald" list={branchData.TL.AB} total={branchData.TL.totalCredit} currency="TL" formatCurrency={formatCurrency} onSelect={setSelectedAccount} />
                                                    )}
                                                </div>
                                            )}
                                            {(isSearching ? currentActiveCurrency === 'USD' : activeCurrency === 'USD') && hasUSD && (
                                                <div className="space-y-1 sm:space-y-4">
                                                    {branchData.USD.BB.length > 0 && (
                                                        <TableSection title="📉 Borçlu Bakiyeler (BB)" color="rose" list={branchData.USD.BB} total={branchData.USD.totalDebt} currency="USD" formatCurrency={formatCurrency} onSelect={setSelectedAccount} />
                                                    )}
                                                    {branchData.USD.AB.length > 0 && (
                                                        <TableSection title="📈 Alacaklı Bakiyeler (AB)" color="emerald" list={branchData.USD.AB} total={branchData.USD.totalCredit} currency="USD" formatCurrency={formatCurrency} onSelect={setSelectedAccount} />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {search.trim().length > 0 && Object.values(filteredGroups).every(g => g.TL.BB.length === 0 && g.TL.AB.length === 0 && g.USD.BB.length === 0 && g.USD.AB.length === 0) && (
                                <EmptyState message="Aradığınız kriterlere uygun cari bulunamadı." />
                            )}

                            {search.trim().length === 0 && !expandedBranch && (
                                <div className="py-60 text-center bg-white/40 backdrop-blur-xl rounded-[4rem] border-2 border-dashed border-slate-200 shadow-inner flex flex-col items-center mx-1 sm:mx-6">
                                    <div className="p-10 bg-white w-28 h-28 rounded-[2.5rem] mb-8 flex items-center justify-center shadow-2xl shadow-slate-200 transform hover:scale-110 transition-transform duration-500">
                                        <Sparkles size={48} className="text-blue-500 opacity-30" />
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase italic">PANEL KULLANIMA HAZIR</h3>
                                    <p className="text-slate-400 font-bold text-[11px] uppercase tracking-[0.3em] mt-3 max-w-sm mx-auto leading-relaxed opacity-70">Lütfen üst menüden bir şube seçerek verileri incelemeye başlayın.</p>
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
            {selectedAccount && <AccountDetailModal account={selectedAccount} onClose={() => setSelectedAccount(null)} />}
        </div>
    );
}

function TableSection({ title, color, list, total, currency, formatCurrency, onSelect }) {
    const bgColor = color === 'rose' ? 'bg-rose-50/80' : 'bg-emerald-50/80';
    const textColor = color === 'rose' ? 'text-rose-600' : 'text-emerald-600';
    const borderColor = color === 'rose' ? 'border-rose-100' : 'border-emerald-100';
    const tagBg = color === 'rose' ? 'text-rose-500' : 'text-emerald-500';

    return (
        <div className="bg-white rounded-none sm:rounded-[1rem] shadow-sm border-y sm:border border-slate-100 overflow-hidden">
            <div className={clsx("px-1.5 sm:px-6 py-1 sm:py-2.5 border-b flex items-center justify-between", bgColor, borderColor)}>
                <div className="flex items-center gap-1.5 sm:gap-4">
                    <h3 className={clsx("font-black uppercase italic tracking-tighter text-[7.5px] sm:text-xs", textColor)}>{title}</h3>
                    <div className={clsx("px-1 py-0.5 rounded-lg border bg-white font-black text-[6.5px] sm:text-[10px] tracking-tighter shadow-sm", textColor, borderColor)}>
                        {formatCurrency(total, currency)}
                    </div>
                </div>
                <span className={clsx("hidden sm:inline text-[9px] font-black bg-white px-2 py-0.5 rounded-full border", borderColor, tagBg)}>{list.length} CARİ</span>
            </div>
            <AccountTable accounts={list} formatCurrency={formatCurrency} onSelect={onSelect} />
        </div>
    );
}

function AccountTable({ accounts, formatCurrency, onSelect }) {
    return (
        <div className="w-full">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-900 text-white">
                        <th className="pl-1.5 pr-0.5 sm:px-4 py-2 text-[6.5px] sm:text-[10px] font-black uppercase tracking-tighter sm:tracking-widest opacity-95 border-r border-white/5">Müşteri</th>
                        <th className="px-0.5 py-2 text-[6.5px] sm:text-[10px] font-black uppercase tracking-tighter sm:tracking-widest opacity-95 text-center border-r border-white/5">Risk</th>
                        <th className="px-0.5 py-2 text-[6.5px] sm:text-[10px] font-black uppercase tracking-tighter sm:tracking-widest opacity-95 text-right border-r border-white/5">Kaynak/Tutar</th>
                        <th className="pl-0.5 pr-1.5 sm:px-4 py-2 text-[6.5px] sm:text-[10px] font-black uppercase tracking-tighter sm:tracking-widest opacity-95 text-right">Bakiye</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/50">
                    {accounts.map(acc => {
                        const isTL = acc.para_birimi === 'TL';
                        const borcDonemi = acc.borc_donemi;
                        const borcTutar = acc.borc_tutar;
                        const bakiye = acc.guncel_bakiye;
                        return (
                            <tr key={acc.cari_kod} onClick={() => onSelect(acc)} className="hover:bg-blue-50/50 cursor-pointer transition-all group">
                                <td className="pl-1.5 pr-0.5 sm:px-4 py-1.5 sm:py-3 max-w-[90px] sm:max-w-none">
                                    <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors uppercase text-[7px] sm:text-[11px] leading-none truncate">{acc.musteri_adi}</div>
                                    <div className="text-[5.5px] sm:text-[8px] font-bold text-slate-400 mt-0.5 leading-none flex items-center gap-1">
                                        <span>{acc.cari_kod}</span>
                                        <span className="opacity-50">|</span>
                                        <span className="text-blue-500/80 uppercase">{acc.satis_temsilcisi}</span>
                                    </div>
                                </td>
                                <td className="px-0.5 py-1.5 sm:py-3 text-center">
                                    <div className={clsx("font-black text-[8px] sm:text-sm tracking-tighter", (acc.risk_skoru || 0) >= 80 ? 'text-emerald-500' : (acc.risk_skoru || 0) >= 50 ? 'text-orange-500' : 'text-rose-500')}>{acc.risk_skoru || '-'}</div>
                                </td>
                                <td className="px-0.5 py-1.5 sm:py-3 text-right border-r border-slate-100/50">
                                    <div className="text-[6.5px] sm:text-[10px] font-black text-slate-600 uppercase tracking-tighter leading-none">{borcDonemi || '-'}</div>
                                    <div className="text-[6px] sm:text-[9px] font-bold text-slate-400 mt-0.5 leading-none">{borcTutar ? formatCurrency(borcTutar, acc.para_birimi) : '-'}</div>
                                </td>
                                <td className={clsx("pl-0.5 pr-1.5 sm:px-4 py-1.5 sm:py-3 text-right font-black text-[7.5px] sm:text-[12px] tabular-nums tracking-tighter", bakiye > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                    {formatCurrency(bakiye, acc.para_birimi)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function FilterField({ label, children }) {
    return (
        <div className="flex flex-col gap-0.5 sm:gap-1">
            <label className="text-[7.5px] sm:text-[10px] font-black text-gray-500 uppercase ml-1.5 tracking-tighter sm:tracking-widest opacity-90">{label}</label>
            {children}
        </div>
    );
}

function EmptyState({ message }) {
    return (
        <div className="py-12 bg-white/50 rounded-3xl border border-dashed border-slate-200 text-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{message}</p>
        </div>
    );
}
