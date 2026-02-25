import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { FileUp, FileCheck, AlertCircle, Loader2, Save, X, Settings2, Info } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { useToast } from '../context/ToastContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { calculateBorcAyiTutar, analyzeCariHesap, calculateAdvancedMetrics, getBranchCodeFromCariKod, ReportCurrencyType } from '../services/reportService';
import { calculateRiskScore } from '../services/riskService';

const BRANCH_MAPPING = {
    'BM': 'MERKEZ ŞUBE', 'BR': 'BURSA ŞUBE', 'Mİ': 'MALZEME ŞUBE',
    'Bİ': 'İZMİR ŞUBE', 'BK': 'ANKARA ŞUBE', 'BP': 'BAYRAMPAŞA ŞUBE',
    'BA': 'MODOKO ŞUBE'
};

const AUTHORIZED_BRANCHES = ["MERKEZ", "ANKARA", "BURSA", "MALZEME", "İZMİR", "BAYRAMPAŞA", "MODOKO"];

const ExcelImport = () => {
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('idle'); // idle, processing, ready, uploading, completed, error
    const [progess, setProgress] = useState(0);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    const [branchSettings, setBranchSettings] = useState(() => {
        const saved = localStorage.getItem('branch_import_settings');
        if (saved) return JSON.parse(saved);
        // Varsayılan: Tüm şubeler TL cari içerebilir
        const initial = {};
        AUTHORIZED_BRANCHES.forEach(b => initial[b] = { hasTLCari: true });
        return initial;
    });

    const { showToast } = useToast();
    const { refreshData } = useData();
    const { settings } = useSettings();

    useEffect(() => {
        localStorage.setItem('branch_import_settings', JSON.stringify(branchSettings));
    }, [branchSettings]);

    const toggleBranchSetting = (branch) => {
        setBranchSettings(prev => ({
            ...prev,
            [branch]: { ...prev[branch], hasTLCari: !prev[branch].hasTLCari }
        }));
    };

    const onDrop = useCallback((acceptedFiles) => {
        const selectedFile = acceptedFiles[0];
        if (selectedFile) {
            setFile(selectedFile);
            setStatus('idle');
            setError(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel': ['.xls']
        },
        multiple: false
    });

    const processFile = async () => {
        if (!file) return;
        setStatus('processing');
        setProgress(0);

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (jsonData.length < 2) throw new Error("Excel dosyası boş veya başlık satırı eksik.");

            const headers = jsonData[0].map(h => String(h).trim());
            const findCol = (choices) => headers.findIndex(h => choices.some(c => h.toLowerCase() === c.toLowerCase()));

            const cols = {
                cariKod: findCol(['Cari Hesap Kodu']),
                musteriAdi: findCol(['Cari Hesap Adı']),
                satisTemsilcisi: findCol(['Satış Personeli']),
                sube: findCol(['Şube', 'Şube Adı']),
                tarih: findCol(['Fiş Tarihi']),
                borcTL: findCol(['Borç']),
                alacakTL: findCol(['Alacak']),
                borcUSD: findCol(['D.Borç']),
                alacakUSD: findCol(['D.Alacak']),
                islemTuru: findCol(['İşlem Türü', 'İşlem']),
                aciklama: findCol(['Açıklama']),
            };

            if (cols.cariKod === -1 || cols.musteriAdi === -1 || cols.tarih === -1) {
                throw new Error("Kritik sütunlar (Cari Kod, Ad, Tarih) bulunamadı.");
            }

            const cariMap = new Map();

            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                const cariKod = String(row[cols.cariKod] || "").trim();
                if (!cariKod) continue;

                let subeAdiRaw = String(row[cols.sube] || "").trim();
                let subeAdi = subeAdiRaw;
                if (!subeAdi) {
                    const branchCode = getBranchCodeFromCariKod(cariKod);
                    subeAdi = BRANCH_MAPPING[branchCode] || "Bilinmeyen Şube";
                }

                // Şube Ayarı Kontrolü
                const matchedBranch = AUTHORIZED_BRANCHES.find(b => subeAdi.toUpperCase().includes(b)) || "Other";
                const hasTLCariAyar = branchSettings[matchedBranch]?.hasTLCari ?? true;

                // Para Birimi Tespiti
                let paraBirimi = 'USD';
                if (hasTLCariAyar) {
                    paraBirimi = cariKod.includes('$') ? 'USD' : 'TL';
                }

                const key = `${cariKod}|${subeAdi}`;
                if (!cariMap.has(key)) {
                    cariMap.set(key, {
                        cari_kod: cariKod,
                        musteri_adi: String(row[cols.musteriAdi] || "").trim(),
                        satis_temsilcisi: String(row[cols.satisTemsilcisi] || "").trim(),
                        sube_adi: subeAdi,
                        para_birimi: paraBirimi,
                        islem_detaylari: []
                    });
                }

                const cari = cariMap.get(key);

                // Tarih parse
                let islem_tarihi;
                const rawDate = row[cols.tarih];
                if (typeof rawDate === 'number') {
                    const date = new Date((rawDate - 25569) * 86400 * 1000);
                    islem_tarihi = date.toISOString();
                } else {
                    islem_tarihi = new Date(rawDate).toISOString();
                }

                // Sütun seçimi (TL ise Borç/Alacak, USD ise D.Borç/D.Alacak)
                const isTL = paraBirimi === 'TL';
                const borc = isTL ? (Number(row[cols.borcTL]) || 0) : (Number(row[cols.borcUSD]) || 0);
                const alacak = isTL ? (Number(row[cols.alacakTL]) || 0) : (Number(row[cols.alacakUSD]) || 0);

                const islemTuru = String(row[cols.islemTuru] || "").trim();
                const aciklama = String(row[cols.aciklama] || "").trim();
                let finalAciklama = aciklama || islemTuru;
                if (islemTuru && aciklama && !aciklama.includes(islemTuru)) {
                    finalAciklama = `${islemTuru} - ${aciklama}`;
                }

                cari.islem_detaylari.push({
                    islem_tarihi,
                    borc,
                    alacak,
                    aciklama: finalAciklama,
                    para_birimi: paraBirimi
                });
            }

            // Analizleri yap (Simplified Schema)
            const processedAccounts = Array.from(cariMap.values())
                .filter(acc =>
                    !acc.sube_adi.toUpperCase().includes("BİLİNMEYEN") &&
                    AUTHORIZED_BRANCHES.some(b => acc.sube_adi.toUpperCase().includes(b))
                )
                .map(acc => {
                    const guncel_bakiye = acc.islem_detaylari.reduce((sum, d) => sum + d.borc - d.alacak, 0);

                    // reportService için format uydurma (borc_tl/borc_usd alanları bekleyebilir)
                    const legacyTransactions = acc.islem_detaylari.map(d => ({
                        islem_tarihi: d.islem_tarihi,
                        borc_tl: acc.para_birimi === 'TL' ? d.borc : 0,
                        alacak_tl: acc.para_birimi === 'TL' ? d.alacak : 0,
                        borc_usd: acc.para_birimi === 'USD' ? d.borc : 0,
                        alacak_usd: acc.para_birimi === 'USD' ? d.alacak : 0,
                        aciklama: d.aciklama
                    }));

                    const aging = calculateBorcAyiTutar(legacyTransactions, acc.para_birimi === 'TL' ? ReportCurrencyType.OnlyTL : ReportCurrencyType.OnlyUSD, settings);

                    const analysis = analyzeCariHesap(
                        { ...acc, guncel_bakiye_tl: acc.para_birimi === 'TL' ? guncel_bakiye : 0, guncel_bakiye_usd: acc.para_birimi === 'USD' ? guncel_bakiye : 0, islem_detaylari: legacyTransactions },
                        acc.para_birimi === 'TL' ? ReportCurrencyType.OnlyTL : ReportCurrencyType.OnlyUSD,
                        settings
                    );

                    const advancedMetrics = calculateAdvancedMetrics(legacyTransactions);

                    return {
                        cari_kod: acc.cari_kod,
                        musteri_adi: acc.musteri_adi,
                        satis_temsilcisi: acc.satis_temsilcisi,
                        sube_adi: acc.sube_adi,
                        guncel_bakiye: guncel_bakiye,
                        para_birimi: acc.para_birimi,
                        durum: analysis.durum,
                        borc_donemi: aging?.borcDonemi || "",
                        borc_tutar: aging?.tutar || 0,
                        metinsel_yorum: analysis.metinselYorum,
                        detayli_yorum: analysis.detayliYorum,
                        risk_skoru: calculateRiskScore(legacyTransactions),
                        tahsilat_oran_3ay: advancedMetrics?.tahsilat_oran_3ay || 0,
                        tahsilat_oran_6ay: advancedMetrics?.tahsilat_oran_6ay || 0,
                        nakit_orani: advancedMetrics?.nakit_orani || 0,
                        kk_orani: advancedMetrics?.kk_orani || 0,
                        cek_senet_orani: advancedMetrics?.cek_senet_orani || 0,
                        havale_orani: advancedMetrics?.havale_orani || 0,
                        diger_orani: advancedMetrics?.diger_orani || 0,
                        last_updated: new Date().toISOString(),
                        islem_detaylari: acc.islem_detaylari // Ekstreler için sakla
                    };
                });

            setResults(processedAccounts);
            setStatus('ready');
            setProgress(100);
            showToast(`${processedAccounts.length} cari hesap işlendi.`, 'success');
        } catch (err) {
            console.error(err);
            setError(err.message);
            setStatus('error');
            showToast(err.message, 'error');
        }
    };

    const uploadToSupabase = async () => {
        if (!results) return;
        setStatus('uploading');
        setProgress(0);

        try {
            // ARTIK TABLOYU SİLMİYORUZ (Quota Friendly)
            // const { error: clearError } = await supabase.rpc('clear_sync_data');
            // if (clearError) throw clearError;

            const accountsToInsert = results.map(({ islem_detaylari, ...rest }) => rest);
            const BATCH_SIZE = 500;

            console.log('🚀 Upserting accounts:', accountsToInsert.length);
            for (let i = 0; i < accountsToInsert.length; i += BATCH_SIZE) {
                const batch = accountsToInsert.slice(i, i + BATCH_SIZE);
                // upsert kullaniyoruz, cari_kod + sube_adi üzerinden çakışma kontrolü yapar
                const { error: insError } = await supabase.from('cari_hesaplar').upsert(batch, { onConflict: 'cari_kod, sube_adi' });
                if (insError) throw insError;
                setProgress(Math.round(((i + batch.length) / accountsToInsert.length) * 50));
            }

            const allStatements = [];
            results.forEach(acc => {
                acc.islem_detaylari.forEach(d => {
                    if (d.borc !== 0 || d.alacak !== 0) {
                        allStatements.push({
                            cari_kod: acc.cari_kod,
                            sube_adi: acc.sube_adi,
                            tarih: d.islem_tarihi.split('T')[0],
                            aciklama: d.aciklama || '',
                            borc: d.borc,
                            alacak: d.alacak,
                            para_birimi: acc.para_birimi,
                            last_updated: new Date().toISOString()
                        });
                    }
                });
            });

            // --- Deduplication Logic (Kritik: Batch içindeki mükerrer kayıt hatasını önler) ---
            const uniqueStatementsMap = new Map();
            allStatements.forEach(s => {
                // Benzersiz anahtar: cari + sube + tarih + borc + alacak + aciklama
                const key = `${s.cari_kod}|${s.sube_adi}|${s.tarih}|${s.borc}|${s.alacak}|${s.aciklama}`;
                if (!uniqueStatementsMap.has(key)) {
                    uniqueStatementsMap.set(key, s);
                }
            });
            const deduplicatedStatements = Array.from(uniqueStatementsMap.values());

            console.log(`🚀 Upserting statements: ${deduplicatedStatements.length} (Original: ${allStatements.length})`);

            // Batch size'ı büyük veri seti için biraz artırabiliriz
            const STATEMENT_BATCH_SIZE = 1000;
            for (let i = 0; i < deduplicatedStatements.length; i += STATEMENT_BATCH_SIZE) {
                const batch = deduplicatedStatements.slice(i, i + STATEMENT_BATCH_SIZE);
                const { error: stError } = await supabase.from('cari_ekstre').upsert(batch, {
                    onConflict: 'cari_kod, sube_adi, tarih, borc, alacak, aciklama'
                });
                if (stError) throw stError;
                setProgress(50 + Math.round(((i + batch.length) / deduplicatedStatements.length) * 50));
            }

            setStatus('completed');
            showToast("Veriler akıllı senkronizasyon ile güncellendi.", 'success');
            refreshData();
        } catch (err) {
            console.error(err);
            setError(err.message);
            setStatus('error');
            showToast('Yükleme hatası: ' + err.message, 'error');
        }
    };

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Branch Settings Panel */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <Settings2 className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 tracking-tight">Şube Veri Ayarları</h2>
                        <p className="text-xs text-slate-500">Excel aktarımı sırasında her şube için kullanılacak para birimi mantığını belirleyin.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {AUTHORIZED_BRANCHES.map(branch => (
                        <div key={branch} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-xs font-bold text-slate-700 tracking-tight uppercase">{branch}</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={branchSettings[branch]?.hasTLCari}
                                    onChange={() => toggleBranchSetting(branch)}
                                />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase">{branchSettings[branch]?.hasTLCari ? 'TL/USD' : 'USD'}</span>
                            </label>
                        </div>
                    ))}
                </div>

                <div className="mt-4 p-3 bg-blue-50/50 rounded-xl border border-blue-100 flex items-start gap-3">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-[11px] text-blue-800 leading-relaxed font-medium">
                        <strong>TL/USD:</strong> Cari kodunda <strong>$</strong> yoksa TL, varsa USD kabul edilir. Borç/Alacak sütunları kullanılır. <br />
                        <strong>Sadece USD:</strong> Cari koduna bakılmaksızın tüm kayıtlar USD kabul edilir. D.Borç/D.Alacak sütunları kullanılır.
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800 tracking-tight italic uppercase">Excel <span className="text-blue-600">Verİ Yükle</span></h1>
                        <p className="text-gray-500 mt-1">Excel dosyanızı seçin ve yaşlandırma raporu verilerini web'e aktarın.</p>
                    </div>
                    <FileUp className="w-12 h-12 text-blue-500 opacity-20" />
                </div>

                {status === 'idle' && (
                    <div
                        {...getRootProps()}
                        className={`border-3 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
                            }`}
                    >
                        <input {...getInputProps()} />
                        <FileUp className={`w-16 h-16 mb-4 ${isDragActive ? 'text-blue-500' : 'text-slate-400'}`} />
                        <p className="text-lg font-black text-slate-700 tracking-tight uppercase">
                            {file ? file.name : 'Dosyayı sürükleyip bırakın veya seçin'}
                        </p>
                        <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">Sadece .xlsx dosyaları kabul edilir</p>
                    </div>
                )}

                {status === 'processing' && (
                    <div className="text-center py-12">
                        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                        <p className="text-lg font-bold text-gray-700">Excel okunuyor ve hesaplamalar yapılıyor...</p>
                    </div>
                )}

                {status === 'ready' && (
                    <div className="bg-emerald-50 rounded-2xl p-8 mb-8 flex items-start space-x-6 border border-emerald-100">
                        <div className="p-4 bg-white rounded-2xl shadow-sm">
                            <FileCheck className="w-10 h-10 text-emerald-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-black text-emerald-900 uppercase italic tracking-tight">ANALİZ HAZIR!</h3>
                            <p className="text-emerald-800 mt-2 font-medium">
                                <strong>{results?.length}</strong> cari hesap başarıyla işlendi.
                                Şube ayarlarına göre para birimleri ve yaşlandırma hesaplamaları tamamlandı.
                            </p>
                            <div className="mt-8 flex gap-3">
                                <button
                                    onClick={uploadToSupabase}
                                    className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest flex items-center shadow-xl transition-all active:scale-95"
                                >
                                    <Save className="w-4 h-4 mr-2" />
                                    WEB'E GÖNDER & SENKRONİZE ET
                                </button>
                                <button
                                    onClick={() => { setFile(null); setStatus('idle'); }}
                                    className="bg-white border-2 border-slate-200 text-slate-600 px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                                >
                                    VAZGEÇ
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'uploading' && (
                    <div className="py-12 px-6">
                        <div className="flex items-center justify-between mb-6">
                            <p className="text-lg font-black text-slate-800 uppercase tracking-tight">Veriler Senkronize Ediliyor...</p>
                            <span className="font-black text-blue-600 text-2xl">%{progess}</span>
                        </div>
                        <div className="w-full bg-slate-100 h-6 rounded-2xl overflow-hidden p-1 shadow-inner border border-slate-50">
                            <div
                                className="bg-gradient-to-r from-blue-600 to-indigo-700 h-full rounded-xl transition-all duration-300 shadow-lg"
                                style={{ width: `${progess}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                {status === 'completed' && (
                    <div className="text-center py-12">
                        <div className="w-24 h-24 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-50">
                            <FileCheck className="w-12 h-12 text-emerald-600" />
                        </div>
                        <h2 className="text-3xl font-black text-slate-900 mb-2 uppercase italic tracking-tighter">İŞLEM BAŞARILI!</h2>
                        <p className="text-slate-500 font-bold text-sm mb-10 max-w-sm mx-auto uppercase tracking-wide">Tüm veriler temizlendi ve yeni rapor verileri başarıyla yüklendi.</p>
                        <button
                            onClick={() => { setFile(null); setStatus('idle'); }}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
                        >
                            YENİ DOSYA YÜKLE
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="bg-rose-50 rounded-2xl p-8 flex items-start space-x-6 border border-rose-100">
                        <div className="p-4 bg-white rounded-2xl shadow-sm">
                            <AlertCircle className="w-10 h-10 text-rose-500" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-rose-900 uppercase italic tracking-tight">HASAR TESPİT EDİLDİ</h3>
                            <p className="text-rose-800 mt-2 font-medium">{error}</p>
                            <button
                                onClick={() => setStatus('idle')}
                                className="mt-6 px-6 py-2 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 transition-all"
                            >
                                TEKRAR DENE
                            </button>
                        </div>
                    </div>
                )}
                <div className="mt-12 bg-slate-50 rounded-xl p-6 border border-slate-100">
                    <h4 className="font-bold text-slate-700 mb-4 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2 text-blue-500" />
                        Dikkat Edilmesi Gerekenler
                    </h4>
                    <ul className="space-y-3 text-[11px] text-slate-600 font-medium">
                        <li className="flex items-start">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 mr-3 flex-shrink-0"></span>
                            Excel dosyasında <span className="font-bold text-slate-800">Cari Hesap Kodu, Cari Hesap Adı, Fiş Tarihi, Borç, Alacak</span> sütunları bulunmalıdır (USD için D.Borç/D.Alacak).
                        </li>
                        <li className="flex items-start">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 mr-3 flex-shrink-0"></span>
                            Şube ayarlarına göre para birimi ve sütun eşleşmesi otomatik yapılır.
                        </li>
                        <li className="flex items-start">
                            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1.5 mr-3 flex-shrink-0"></span>
                            Web'e gönderim işlemi sırasında tüm eski veriler silinecek ve yeni veriler yüklenecektir.
                        </li>
                    </ul>
                </div>
            </div>

            {status === 'idle' && file && (
                <div className="mt-6 flex justify-center">
                    <button
                        onClick={processFile}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 flex items-center space-x-3 transition-all hover:scale-105 active:scale-95"
                    >
                        <Loader2 className={`w-6 h-6 animate-spin ${status !== 'processing' ? 'hidden' : ''}`} />
                        <span>DOSYAYI İŞLE VE ANALİZ ET</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExcelImport;
