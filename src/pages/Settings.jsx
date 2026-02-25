import { useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import {
    Settings2,
    Save,
    RefreshCcw,
    AlertTriangle,
    Clock,
    TrendingUp,
    Info,
    ShieldCheck,
    Building2,
    CreditCard
} from 'lucide-react';

export default function Settings() {
    const { settings, updateSettings, resetSettings } = useSettings();
    const { showToast } = useToast();
    const [localSettings, setLocalSettings] = useState(settings);

    const handleSave = () => {
        updateSettings(localSettings);
        showToast('Çalışma parametreleri başarıyla güncellendi.', 'success');
    };

    const handleReset = () => {
        if (window.confirm('Tüm ayarları varsayılana döndürmek istediğinize emin misiniz?')) {
            resetSettings();
            setLocalSettings(settings);
            showToast('Ayarlar varsayılana döndürüldü.', 'info');
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-6 border-gray-100">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3 italic uppercase tracking-tight">
                        <Settings2 className="text-blue-600 w-8 h-8" />
                        Çalışma Parametreleri
                    </h1>
                    <p className="text-gray-500 text-sm font-medium">Analiz ve hesaplama motorunun çalışma prensiplerini buradan yönetin.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleReset}
                        className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-700 uppercase tracking-widest flex items-center gap-2 transition-all"
                    >
                        <RefreshCcw size={14} />
                        Sıfırla
                    </button>
                    <button
                        onClick={handleSave}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all active:scale-95"
                    >
                        <Save size={16} />
                        Değişiklikleri Kaydet
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Risk Seviyeleri */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 bg-rose-50 border-b border-rose-100 flex items-center gap-3">
                        <AlertTriangle className="text-rose-600 w-5 h-5" />
                        <h3 className="font-bold text-rose-900 uppercase text-xs tracking-widest">Risk & Takip Kriterleri</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Kritik Sessizlik (Gün)</label>
                            <input
                                type="number"
                                value={localSettings.riskLimits.criticalDays}
                                onChange={e => setLocalSettings(prev => ({ ...prev, riskLimits: { ...prev.riskLimits, criticalDays: parseInt(e.target.value) } }))}
                                className="w-full bg-gray-50 border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-rose-500"
                            />
                            <p className="text-[10px] text-gray-400 italic">Müşteri kaç gün ödeme yapmazsa "OLUMSUZ" olarak işaretlensin.</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Uyarı Eşiği (Gün)</label>
                            <input
                                type="number"
                                value={localSettings.riskLimits.warningDays}
                                onChange={e => setLocalSettings(prev => ({ ...prev, riskLimits: { ...prev.riskLimits, warningDays: parseInt(e.target.value) } }))}
                                className="w-full bg-gray-50 border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-rose-500"
                            />
                            <p className="text-[10px] text-gray-400 italic">Kaç gün sessizlikten sonra "TAKİPTE" durumuna geçilsin.</p>
                        </div>
                    </div>
                </div>

                {/* Finansal Parametreler */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-4 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3">
                        <TrendingUp className="text-emerald-600 w-5 h-5" />
                        <h3 className="font-bold text-emerald-900 uppercase text-xs tracking-widest">Finansal Eşikler</h3>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Sabit USD Kuru (Analiz İçin)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 font-black text-xs">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={localSettings.usdRate}
                                    onChange={e => setLocalSettings(prev => ({ ...prev, usdRate: parseFloat(e.target.value) }))}
                                    className="w-full bg-gray-50 border-0 rounded-xl p-3 pl-8 text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 italic">TL bakiyelerin raporlardaki USD karşılığı için kullanılan varsayılan kur.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Aging Alt Limit (TL)</label>
                                <input
                                    type="number"
                                    value={localSettings.agingThresholds.tl}
                                    onChange={e => setLocalSettings(prev => ({ ...prev, agingThresholds: { ...prev.agingThresholds, tl: parseFloat(e.target.value) } }))}
                                    className="w-full bg-gray-50 border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Aging Alt Limit (USD)</label>
                                <input
                                    type="number"
                                    value={localSettings.agingThresholds.usd}
                                    onChange={e => setLocalSettings(prev => ({ ...prev, agingThresholds: { ...prev.agingThresholds, usd: parseFloat(e.target.value) } }))}
                                    className="w-full bg-gray-50 border-0 rounded-xl p-3 text-sm font-bold focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Ekran Ayarları */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden md:col-span-2">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                        <ShieldCheck className="text-gray-600 w-5 h-5" />
                        <h3 className="font-bold text-gray-900 uppercase text-xs tracking-widest">Görünüm ve Filtreleme Ayarları</h3>
                    </div>
                    <div className="p-6 flex flex-wrap gap-8">
                        <div className="flex items-center gap-3">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={localSettings.display.showOnlyBB}
                                    onChange={e => setLocalSettings(prev => ({ ...prev, display: { ...prev.display, showOnlyBB: e.target.checked } }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-700">Sadece Borçlu Carileri Göster (BB)</span>
                                <span className="text-[10px] text-gray-400">Analiz ekranlarında sadece borcu olan müşterileri listeler.</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 ml-auto">
                            <label className="text-sm font-bold text-gray-700 uppercase tracking-tight">Kritik Cari Sayısı:</label>
                            <input
                                type="number"
                                value={localSettings.display.maxRiskyAccounts}
                                onChange={e => setLocalSettings(prev => ({ ...prev, display: { ...prev.display, maxRiskyAccounts: parseInt(e.target.value) } }))}
                                className="w-20 bg-gray-100 border-0 rounded-lg p-2 text-sm font-black text-center focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sistem Detaylı Kılavuzu */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden md:col-span-2">
                <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
                    <Info className="text-blue-600 w-5 h-5" />
                    <h3 className="font-bold text-blue-900 uppercase text-xs tracking-widest">Sistem Hesaplama Mantığı & Detaylar</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Şube Eşleşme Mantığı */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-black text-gray-900 uppercase flex items-center gap-2 border-b pb-2">
                            <Building2 size={14} className="text-blue-500" />
                            Şube Atama (Cari Kod)
                        </h4>
                        <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                            Sistem, her cariyi kodundaki ön eklere göre otomatik olarak şubelere ayırır:
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {[
                                { k: 'BM', s: 'Merkez' }, { k: 'BR', s: 'Bursa' },
                                { k: 'Mİ', s: 'Malzeme' }, { k: 'Bİ', s: 'İzmir' },
                                { k: 'BK', s: 'Ankara' }, { k: 'BP', s: 'B.Paşa' },
                                { k: 'BA', s: 'Modoko' }
                            ].map(item => (
                                <div key={item.k} className="bg-gray-50 p-2 rounded-lg border border-gray-100 flex justify-between items-center">
                                    <span className="text-[10px] font-black text-blue-600">{item.k}...</span>
                                    <span className="text-[9px] font-bold text-gray-500 italic">{item.s}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tahsilat Ayırıcıları */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-black text-gray-900 uppercase flex items-center gap-2 border-b pb-2">
                            <TrendingUp size={14} className="text-emerald-500" />
                            Tahsilat & Ödeme Gruplama
                        </h4>
                        <p className="text-[11px] text-gray-600 leading-relaxed font-medium">
                            Ekstredeki açıklamalar taranarak ödemeler 5 ana kategoriye ayrılır:
                        </p>
                        <ul className="space-y-2">
                            <li className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                                <span className="w-16 text-emerald-600">NAKİT:</span> "Nakit Tahsilat"
                            </li>
                            <li className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                <span className="w-16 text-blue-600">K.KARTI:</span> "Müşteri Kredi Kartı ile Tahsilat Fişi"
                            </li>
                            <li className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                                <span className="w-16 text-indigo-600">HAVALE:</span> "Gelen Havaleler"
                            </li>
                            <li className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                <span className="w-16 text-amber-600">ÇEK/SENET:</span> "Çek Giriş Bordrosu", "Senet Giriş Bordrosu"
                            </li>
                            <li className="flex items-center gap-2 text-[10px] font-bold text-gray-600">
                                <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                <span className="w-16 text-gray-500">DİĞER:</span> Tanımlanamayan tüm alacak işlemleri.
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 text-[10px] text-gray-400 italic text-center border-t border-gray-100">
                    * Tüm hesaplama motoru C# tarafındaki ReportProcessor.cs standartlarıyla %100 uyumlu çalışmaktadır.
                </div>
            </div>
        </div>
    );
}
