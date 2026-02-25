/**
 * Cari Bakiye Yaşlandırma ve Analiz Servisi
 * C# tarafındaki ReportProcessor.cs mantığını temel alır.
 */

export const ReportCurrencyType = {
  OnlyTL: 'OnlyTL',
  OnlyUSD: 'OnlyUSD',
  TLUSDSeperate: 'TLUSDSeperate'
};

// Cari Durum Enum
export const CariDurum = {
  Normal: 'Normal',
  Takipte: 'Takipte',
  Olumsuz: 'Olumsuz'
};

// Ödeme Türü Keywords
const PAY_KEYWORDS = {
  NAKIT: ['nakit tahsilat', 'nakit', 'tahsilat faturası', 'kasa'],
  KK: ['kredi kartı ile tahsilat fişi', 'kredi kartı', 'pos', 'kk', 'banka kartı'],
  CEK_SENET: ['çek giriş bordrosu', 'senet giriş bordrosu', 'çek', 'senet', 'çek tahsilat', 'senet tahsilat', 'portföy', 'bordrosu'],
  HAVALE: ['gelen havaleler', 'havale', 'eft'],
};

const BRANCH_CODE_MAPPINGS = {
  'BM': 'MERKEZ ŞUBE',
  'BR': 'BURSA ŞUBE',
  'Mİ': 'MALZEME ŞUBE',
  'Bİ': 'İZMİR ŞUBE',
  'BK': 'ANKARA ŞUBE',
  'BP': 'BAYRAMPAŞA ŞUBE',
  'BA': 'MODOKO ŞUBE',
};

/**
 * Cari koddan şube kodunu bulur
 */
export const getBranchCodeFromCariKod = (cariKod) => {
  if (!cariKod) return 'UNKNOWN';
  const upper = cariKod.toUpperCase();
  for (const code of Object.keys(BRANCH_CODE_MAPPINGS)) {
    if (upper.includes(code)) return code;
  }
  return 'UNKNOWN';
};

/**
 * Borç dönemi ve tutarını hesaplar (Aging Logic)
 */
export const calculateBorcAyiTutar = (transactions, currencyType, settings = null) => {
  if (!transactions || transactions.length === 0) return null;

  const isTL = currencyType === ReportCurrencyType.OnlyTL;
  const borcField = isTL ? 'borc_tl' : 'borc_usd';
  const alacakField = isTL ? 'alacak_tl' : 'alacak_usd';
  const paraBirimi = isTL ? 'TL' : 'USD';

  const totalBorc = transactions.reduce((sum, d) => sum + (Number(d[borcField]) || 0), 0);
  const totalAlacak = transactions.reduce((sum, d) => sum + (Number(d[alacakField]) || 0), 0);
  const totalBakiye = totalBorc - totalAlacak;

  if (totalBakiye <= 0) return null;

  // En son işlem tarihini bul
  const dates = transactions.map(d => new Date(d.islem_tarihi)).filter(d => !isNaN(d));
  if (dates.length === 0) return null;

  const lastDate = new Date(Math.max(...dates));
  let cursorDate = new Date(lastDate.getFullYear(), lastDate.getMonth(), 1);

  const thresholds = settings?.agingThresholds || { tl: 100, usd: 10 };
  const threshold = isTL ? thresholds.tl : thresholds.usd;
  let result = null;

  // Geriye dönük 120 ay (10 yıl) tara
  for (let i = 0; i < 120; i++) {
    const endOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth() + 1, 0);

    // cursorDate ve öncesindeki borçların toplamı
    const cumulativeBorc = transactions
      .filter(d => new Date(d.islem_tarihi) <= endOfMonth)
      .reduce((sum, d) => sum + (Number(d[borcField]) || 0), 0);

    const bakiye = cumulativeBorc - totalAlacak;

    if (bakiye >= threshold) {
      const monthName = cursorDate.toLocaleString('tr-TR', { month: 'long', year: 'numeric' }).toUpperCase();
      result = {
        borcDonemi: monthName,
        tutar: bakiye,
        paraBirimi: paraBirimi,
        displayText: `${monthName} (${bakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${paraBirimi})`
      };
    } else {
      break;
    }

    // Bir ay geri git
    cursorDate.setMonth(cursorDate.getMonth() - 1);
  }

  return result;
};

/**
 * Cari hesabı analiz eder ve yorum oluşturur
 */
export const analyzeCariHesap = (cari, displayCurrency, settings = null) => {
  const transactions = cari.islem_detaylari || [];
  if (transactions.length === 0) {
    return {
      durum: CariDurum.Normal,
      detayliYorum: "Müşterinin herhangi bir işlemi bulunmamaktadır.",
      metinselYorum: "Müşteri ile henüz bir ticari hareket gerçekleşmemiştir."
    };
  }

  const isTL = displayCurrency === ReportCurrencyType.OnlyTL;
  const bakiye = isTL ? (cari.guncel_bakiye_tl || 0) : (cari.guncel_bakiye_usd || 0);

  if (bakiye <= 0) {
    return {
      durum: CariDurum.Olumlu,
      detayliYorum: "Güncel borç bakiyesi bulunmamaktadır.",
      metinselYorum: "Güncel borç bakiyesi bulunmamaktadır."
    };
  }

  // İşlemleri tarihe göre azalan sırala
  const sortedTrans = [...transactions].sort((a, b) => new Date(b.islem_tarihi) - new Date(a.islem_tarihi));
  const alacakField = isTL ? 'alacak_tl' : 'alacak_usd';
  const borcField = isTL ? 'borc_tl' : 'borc_usd';

  const lastPayment = sortedTrans.find(d => (Number(d[alacakField]) || 0) > 0);
  const lastPaymentDate = lastPayment ? new Date(lastPayment.islem_tarihi) : null;
  const now = new Date();
  const diffDays = lastPaymentDate ? Math.floor((now - lastPaymentDate) / (1000 * 60 * 60 * 24)) : null;

  // Adil Değerlendirme: Çalışma periyodu tespiti
  const firstTransDate = new Date(Math.min(...transactions.map(d => new Date(d.islem_tarihi))));
  const lastTransDate = new Date(Math.max(...transactions.map(d => new Date(d.islem_tarihi))));
  const workingDays = Math.floor((lastTransDate - firstTransDate) / (1000 * 60 * 60 * 24));
  const isNewCustomer = (now - firstTransDate) / (1000 * 60 * 60 * 24) <= 90;

  // Islem turunden bağımsız son bakiye arttıran işlem (borç)
  const lastSale = sortedTrans.find(d => (Number(d[borcField]) || 0) > 0);
  const lastSaleDate = lastSale ? new Date(lastSale.islem_tarihi) : null;

  const riskLimits = settings?.riskLimits || { criticalDays: 90, warningDays: 60 };

  let status = CariDurum.Normal;
  if (diffDays !== null) {
    if (diffDays > riskLimits.criticalDays) status = CariDurum.Olumsuz;
    else if (diffDays > riskLimits.warningDays) status = CariDurum.Takipte;
  } else if (!isNewCustomer && bakiye > 0) {
    status = CariDurum.Olumsuz; // Uzun süredir çalışan ama hiç ödeme yapmamış
  }

  // Kısa özet oluştur (Adil ve net)
  let summary = "";
  if (diffDays !== null) {
    if (diffDays > 30) summary = `Son tahsilat **${diffDays} gün önce** yapıldı.`;
    else summary = "Ödemeler düzenli olarak devam ediyor.";
  } else {
    summary = isNewCustomer ? "Yeni çalışma dönemi (Henüz ödeme yok)." : "Hiç ödeme alınmamış (Kritik Takip).";
  }

  // Detaylı rapor oluştur
  const detail = [
    `Müşteri ile **${firstTransDate.toLocaleDateString('tr-TR')}** tarihinden beri çalışılmaktadır.`,
    `Toplam çalışma süresi: **${workingDays} gün**.`,
    `Güncel bakiye: **${bakiye.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${isTL ? 'TL' : 'USD'}**`,
    lastPaymentDate
      ? `En son tahsilat **${lastPaymentDate.toLocaleDateString('tr-TR')}** tarihinde yapılmıştır.`
      : "Sistemde bu cari için henüz bir tahsilat kaydı bulunmamaktadır.",
    lastSaleDate ? `Müşteriden en son **${lastSaleDate.toLocaleDateString('tr-TR')}** tarihinde alım yapılmıştır.` : "",
    isNewCustomer ? "⚠️ Yeni müşteri olduğu için ödeme performansı gözlemleniyor." :
      (diffDays > 90 || (diffDays === null && bakiye > 0)) ? "❌ Risk uyarısı: Tahsilat süreci aksamış görünüyor." : "✅ Genel ödeme performansı stabildir."
  ].filter(Boolean).join('\n\n');

  return {
    durum: status,
    metinselYorum: summary,
    detayliYorum: detail,
    sonTahsilatGun: diffDays || 0
  };
};

/**
 * Tahsilat performansını ve ödeme kanallarını hesaplar
 */
export const calculateAdvancedMetrics = (transactions) => {
  if (!transactions || transactions.length === 0) return null;

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());

  let sales3 = 0, pay3 = 0;
  let sales6 = 0, pay6 = 0;

  const payTypeStats = {
    nakit: 0,
    kk: 0,
    cek_senet: 0,
    havale: 0,
    diger: 0,
    totalPay: 0
  };

  transactions.forEach(t => {
    const tDate = new Date(t.islem_tarihi);
    const borc = Number(t.borc_tl || t.borc_usd || 0);
    const alacak = Number(t.alacak_tl || t.alacak_usd || 0);
    const desc = (t.aciklama || '').toLowerCase();

    // Zaman tabanlı oranlar
    if (tDate >= threeMonthsAgo) {
      sales3 += borc;
      pay3 += alacak;
    }
    if (tDate >= sixMonthsAgo) {
      sales6 += borc;
      pay6 += alacak;
    }

    // Ödeme tipi analizi
    if (alacak > 0) {
      payTypeStats.totalPay += alacak;
      if (PAY_KEYWORDS.NAKIT.some(k => desc.includes(k))) {
        payTypeStats.nakit += alacak;
      } else if (PAY_KEYWORDS.KK.some(k => desc.includes(k))) {
        payTypeStats.kk += alacak;
      } else if (PAY_KEYWORDS.CEK_SENET.some(k => desc.includes(k))) {
        payTypeStats.cek_senet += alacak;
      } else if (PAY_KEYWORDS.HAVALE.some(k => desc.includes(k))) {
        payTypeStats.havale += alacak;
      } else {
        payTypeStats.diger += alacak;
      }
    }
  });

  const ratio3 = sales3 > 0 ? Math.min(100, (pay3 / sales3) * 100) : (pay3 > 0 ? 100 : 0);
  const ratio6 = sales6 > 0 ? Math.min(100, (pay6 / sales6) * 100) : (pay6 > 0 ? 100 : 0);

  return {
    tahsilat_oran_3ay: Math.round(ratio3),
    tahsilat_oran_6ay: Math.round(ratio6),
    nakit_orani: payTypeStats.totalPay > 0 ? Math.round((payTypeStats.nakit / payTypeStats.totalPay) * 100) : 0,
    kk_orani: payTypeStats.totalPay > 0 ? Math.round((payTypeStats.kk / payTypeStats.totalPay) * 100) : 0,
    cek_senet_orani: payTypeStats.totalPay > 0 ? Math.round((payTypeStats.cek_senet / payTypeStats.totalPay) * 100) : 0,
    havale_orani: payTypeStats.totalPay > 0 ? Math.round((payTypeStats.havale / payTypeStats.totalPay) * 100) : 0,
    diger_orani: payTypeStats.totalPay > 0 ? Math.round((payTypeStats.diger / payTypeStats.totalPay) * 100) : 0
  };
};
