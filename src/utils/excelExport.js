import * as XLSX from 'xlsx';

/**
 * Profesyonel Excel raporu üretir. 
 * Her şube için ayrı bir sayfa (sheet) oluşturur.
 * TL ve USD carilerini bölümlere ayırır, detaylı analiz kolonları ekler.
 */
export const exportToExcel = (allAccounts, fileName = 'Cari_Rapor.xlsx') => {
    try {
        const wb = XLSX.utils.book_new();

        // Sütun Başlıkları
        const headers = [
            'Cari Kod',
            'Müşteri Adı',
            'Satış Temsilcisi',
            'Borç Kaynağı (Dönem)',
            'Borç Kaynağı Tutarı',
            'Güncel Bakiye',
            'Para Birimi',
            'Durum'
        ];

        // Sütun Genişlikleri
        const colWidths = [
            { wch: 15 }, // Cari Kod
            { wch: 45 }, // Müşteri Adı
            { wch: 20 }, // Satış Temsilcisi
            { wch: 20 }, // Borç Kaynağı
            { wch: 20 }, // Borç Kaynağı Tutarı
            { wch: 18 }, // Güncel Bakiye
            { wch: 12 }, // Para Birimi
            { wch: 15 }, // Durum
        ];

        const formatRow = (acc) => {
            const currency = (acc.report_currency || 'TL').toUpperCase();
            const bakiye = currency === 'TL' ? (acc.guncel_bakiye_tl || 0) : (acc.guncel_bakiye_usd || 0);
            const borcTutar = currency === 'TL' ? (acc.borc_tutar_tl || 0) : (acc.borc_tutar_usd || 0);

            return [
                acc.cari_kod || '',
                acc.musteri_adi || '',
                acc.satis_temsilcisi || '-',
                currency === 'TL' ? (acc.borc_donemi_tl || '-') : (acc.borc_donemi_usd || '-'),
                { v: borcTutar, t: 'n', z: '#,##0.00' },
                { v: bakiye, t: 'n', z: '#,##0.00' },
                currency,
                acc.durum || '-'
            ];
        };

        // Filter and Ignore "Bilinmeyen" branches
        const records = allAccounts.filter(acc =>
            acc.sube_adi &&
            !acc.sube_adi.toLowerCase().includes('bilinmeyen')
        );

        if (records.length === 0) return false;

        // Benzersiz şubeleri bul
        const branches = [...new Set(records.map(acc => acc.sube_adi))].sort((a, b) => {
            if (a.toUpperCase().includes('MERKEZ')) return -1;
            if (b.toUpperCase().includes('MERKEZ')) return 1;
            return a.localeCompare(b);
        });

        branches.forEach(branch => {
            const branchRecords = records.filter(acc => acc.sube_adi === branch);

            // TL Carileri: Hem TL çalışanlar hem sadece TL olanlar
            const branchTL = branchRecords
                .filter(acc => (acc.report_currency || 'TL').toUpperCase() === 'TL')
                .sort((a, b) => (b.guncel_bakiye_tl || 0) - (a.guncel_bakiye_tl || 0));

            // USD Carileri: Hem USD çalışanlar hem sadece USD olanlar
            const branchUSD = branchRecords
                .filter(acc => (acc.report_currency || 'TL').toUpperCase() === 'USD')
                .sort((a, b) => (b.guncel_bakiye_usd || 0) - (a.guncel_bakiye_usd || 0));

            const sheetData = [];

            // --- TL Bölümü ---
            if (branchTL.length > 0) {
                sheetData.push([`📍 ${branch} - TL CARİ RAPORU`]);
                sheetData.push(headers);
                branchTL.forEach(acc => sheetData.push(formatRow(acc)));
                sheetData.push([]); // Ayırıcı boşluk
            }

            // --- USD Bölümü ---
            if (branchUSD.length > 0) {
                sheetData.push([`📍 ${branch} - USD CARİ RAPORU`]);
                sheetData.push(headers);
                branchUSD.forEach(acc => sheetData.push(formatRow(acc)));
            }

            if (sheetData.length > 0) {
                const ws = XLSX.utils.aoa_to_sheet(sheetData);
                ws['!cols'] = colWidths;
                const safeName = branch.substring(0, 31).replace(/[\\/?*[\]]/g, '');
                XLSX.utils.book_append_sheet(wb, ws, safeName);
            }
        });

        XLSX.writeFile(wb, fileName);
        return true;
    } catch (error) {
        console.error('Excel Export Error:', error);
        return false;
    }
};
