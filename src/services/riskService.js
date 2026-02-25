/**
 * Risk Skoru Hesaplama Servisi
 * C# tarafındaki RiskScoreCalculator.cs mantığını temel alır.
 */

export const calculateRiskScore = (transactions) => {
    if (!transactions || transactions.length === 0) return 10.0;

    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    const lastSixMonths = transactions.filter(i => new Date(i.islem_tarihi) >= sixMonthsAgo);

    const toplamSatis = lastSixMonths
        .reduce((sum, i) => sum + (Number(i.borc_tl) || 0) + (Number(i.borc_usd) || 0), 0);

    const toplamTahsilat = lastSixMonths
        .reduce((sum, i) => sum + (Number(i.alacak_tl) || 0) + (Number(i.alacak_usd) || 0), 0);

    const toplamIade = lastSixMonths
        .filter(i => ((Number(i.borc_tl) || 0) < 0) || ((Number(i.borc_usd) || 0) < 0))
        .reduce((sum, i) => sum + Math.abs(Number(i.borc_tl) || 0) + Math.abs(Number(i.borc_usd) || 0), 0);

    // Ödeme yapılan ay sayısı
    const odemeAySet = new Set(
        lastSixMonths
            .filter(i => ((Number(i.alacak_tl) || 0) > 0) || ((Number(i.alacak_usd) || 0) > 0))
            .map(i => {
                const d = new Date(i.islem_tarihi);
                return `${d.getFullYear()}-${d.getMonth()}`;
            })
    );
    const odemeAySayisi = odemeAySet.size;

    // Son ödeme tarihi
    const lastPayment = lastSixMonths
        .filter(i => ((Number(i.alacak_tl) || 0) > 0) || ((Number(i.alacak_usd) || 0) > 0))
        .sort((a, b) => new Date(b.islem_tarihi) - new Date(a.islem_tarihi))[0];
    const sonOdeme = lastPayment ? new Date(lastPayment.islem_tarihi) : null;

    // 1. Ödeme Oranı Puanı (Max 30)
    const odemeOrani = toplamSatis > 0 ? (toplamTahsilat / toplamSatis) * 100 : 100;
    let odemePuan = 0;
    if (odemeOrani >= 100) odemePuan = 30;
    else if (odemeOrani >= 80) odemePuan = 24;
    else if (odemeOrani >= 50) odemePuan = 18;
    else if (odemeOrani >= 30) odemePuan = 6;

    // 2. Düzenlilik Puanı (Max 25)
    let duzenlilikPuan = 0;
    if (odemeAySayisi >= 6) duzenlilikPuan = 25;
    else if (odemeAySayisi >= 3) duzenlilikPuan = 15;
    else if (odemeAySayisi >= 2) duzenlilikPuan = 8;
    else if (odemeAySayisi >= 1) duzenlilikPuan = 3;

    // 3. İade Puanı (Max 20)
    const iadeOrani = toplamSatis > 0 ? (toplamIade / toplamSatis) * 100 : 0;
    let iadePuan = 0;
    if (toplamIade === 0) iadePuan = 20;
    else if (iadeOrani <= 5) iadePuan = 15;
    else if (iadeOrani <= 10) iadePuan = 8;

    // 4. Sessizlik Puanı (Max 15)
    let sessizlikPuan = 0;
    if (sonOdeme) {
        const gecenGun = Math.floor((now - sonOdeme) / (1000 * 60 * 60 * 24));
        if (gecenGun <= 30) sessizlikPuan = 15;
        else if (gecenGun <= 60) sessizlikPuan = 9;
        else if (gecenGun <= 90) sessizlikPuan = 3;
    }

    // Temel puan 10 + kriterler (Max 100)
    const result = odemePuan + duzenlilikPuan + iadePuan + sessizlikPuan + 10;
    return Math.round(result * 100) / 100;
};
