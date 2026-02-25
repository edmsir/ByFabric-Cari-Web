import { messageService } from './messageService';
import { supabase } from './supabaseClient';

export const insightService = {
    /**
     * Verileri analiz eder ve gerekirse "Adem" adına bülten mesajı oluşturur.
     */
    /**
     * Verileri analiz eder ve kullanıcı rolüne özel "Adem" bülten mesajı oluşturur.
     */
    async runWeeklyAnalysis(userId, allData, role, profile) {
        if (!allData || allData.length === 0) return;

        try {
            // 1. Bu hafta zaten bir bülten gönderilmiş mi kontrol et
            const lastMessages = await messageService.getMessages(userId);
            const thisWeekStart = new Date();
            thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay() + 1);
            thisWeekStart.setHours(0, 0, 0, 0);

            const alreadySent = lastMessages.some(m =>
                m.title.includes('Haftalık Cari Durum Özeti') &&
                new Date(m.created_at) >= thisWeekStart
            );

            if (alreadySent) return;

            // 2. KULLANICIYA ÖZEL VERİ FİLTRELEME
            let userSpecificData = allData;
            if (role === 'sales_rep' && profile?.assigned_sales_rep) {
                userSpecificData = allData.filter(acc => acc.satis_temsilcisi === profile.assigned_sales_rep);
            } else if (role === 'branch_manager' && profile?.assigned_branch) {
                userSpecificData = allData.filter(acc => acc.sube_adi === profile.assigned_branch);
            }

            if (userSpecificData.length === 0) return;

            // --- GELİŞMİŞ ANALİZ SÜRECİ ---

            const today = new Date();
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(today.getMonth() - 2);

            const criticalRisks = []; // Skor < 40
            const delayedPayments = []; // 2 aydan eski borç
            const risingTrends = []; // Son dönem borcu toplamın %70'inden fazlası

            let totalDebtTL = 0;
            let totalDebtUSD = 0;

            userSpecificData.forEach(acc => {
                const bakiyeTL = acc.guncel_bakiye_tl || 0;
                const bakiyeUSD = acc.guncel_bakiye_usd || 0;

                // AB Carileri Analizden Çıkar (Talebe Göre)
                if (bakiyeTL <= 0 && bakiyeUSD <= 0) return;

                if (bakiyeTL > 0) totalDebtTL += bakiyeTL;
                if (bakiyeUSD > 0) totalDebtUSD += bakiyeUSD;

                // A. Risk Skoru Analizi
                const isNew = acc.isNew;
                if (!isNew && acc.risk_skoru > 0 && acc.risk_skoru < 40) {
                    criticalRisks.push(acc);
                }

                // B. Gecikme Analizi (Borç dönemi 2 ay ve öncesiyse)
                const checkDelay = (period) => {
                    if (!period || period === 'Belirsiz') return false;
                    const parts = period.split(' ');
                    if (parts.length < 2) return false;
                    const mName = parts[0].replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
                    const monthMap = { 'OCAK': 0, 'ŞUBAT': 1, 'MART': 2, 'NİSAN': 3, 'MAYIS': 4, 'HAZİRAN': 5, 'TEMMUZ': 6, 'AĞUSTOS': 7, 'EYLÜL': 8, 'EKİM': 9, 'KASIM': 10, 'ARALIK': 11 };
                    const month = monthMap[mName];
                    const year = parseInt(parts[1]);
                    if (isNaN(month) || isNaN(year)) return false;
                    const periodDate = new Date(year, month, 1);
                    return periodDate < twoMonthsAgo;
                };

                const isTLDelayed = bakiyeTL > 0 && checkDelay(acc.borc_donemi_tl);
                const isUSDDelayed = bakiyeUSD > 0 && checkDelay(acc.borc_donemi_usd);

                if (isTLDelayed || isUSDDelayed) {
                    delayedPayments.push({
                        ...acc,
                        delayType: isTLDelayed && isUSDDelayed ? 'TL & USD' : (isTLDelayed ? 'TL' : 'USD')
                    });
                }

                // C. Trend Analizi (Son borç bakiye ilişkisi)
                const borcTutarTL = acc.borc_tutar_tl || 0;
                const borcTutarUSD = acc.borc_tutar_usd || 0;
                if (bakiyeTL > 50000 && (borcTutarTL / bakiyeTL) > 0.7) {
                    risingTrends.push({ ...acc, trendCurrency: 'TL' });
                } else if (bakiyeUSD > 1000 && (borcTutarUSD / bakiyeUSD) > 0.7) {
                    risingTrends.push({ ...acc, trendCurrency: 'USD' });
                }
            });

            // --- MESAJ İÇERİĞİ ---
            const userTitle = role === 'admin' ? 'Yönetici' : (role === 'branch_manager' ? `${profile?.assigned_branch} Şube Müdürü` : 'Satış Temsilcisi');
            let content = `👋 Merhaba, ben Adem. Sizin için sorumluluğunuzdaki verileri analiz ettim.${chr(10)}${chr(10)}`;

            content += `📊 ÖZET: ${userSpecificData.length} cari üzerinden toplam ${totalDebtTL.toLocaleString('tr-TR')} TL ve ${totalDebtUSD.toLocaleString('tr-TR')} USD alacak takibinizdedir.${chr(10)}${chr(10)}`;

            if (criticalRisks.length > 0) {
                content += `🚨 KRİTİK SKORLU CARİLER (${criticalRisks.length} adet):${chr(10)}`;
                criticalRisks.slice(0, 3).forEach(acc => {
                    content += `- ${acc.musteri_adi} (Skor: ${acc.risk_skoru})${chr(10)}`;
                });
                if (criticalRisks.length > 3) content += `- ve ${criticalRisks.length - 3} cari daha...${chr(10)}`;
                content += `${chr(10)}`;
            }

            if (delayedPayments.length > 0) {
                content += `⏳ ÖDEMESİ GECİKENLER (2+ Ay):${chr(10)}`;
                delayedPayments.slice(0, 3).forEach(acc => {
                    content += `- ${acc.musteri_adi} (${acc.delayType} vadesi geçmiş)${chr(10)}`;
                });
                content += `⚠️ Bu müşteriler için tahsilat araması planlanmalı.${chr(10)}${chr(10)}`;
            }

            if (risingTrends.length > 0) {
                content += `📈 ANİ BORÇ ARTIŞI TESPİTİ:${chr(10)}`;
                risingTrends.slice(0, 3).forEach(acc => {
                    content += `- ${acc.musteri_adi} (Borç yükü hızla artıyor)${chr(10)}`;
                });
                content += `💡 Limit aşımı riskine karşı dikkatli olunmalı.${chr(10)}${chr(10)}`;
            }

            content += `✨ Verileriniz ${userTitle} yetkisiyle analiz edilmiştir.${chr(10)}`;
            content += `İyi çalışmalar dilerim.`;

            await supabase.from('user_messages').insert([{
                recipient_id: userId,
                sender_name: 'Adem',
                title: '📊 Haftalık Cari Durum Özeti (Kişiye Özel Analiz)',
                content: content
            }]);

            console.log(`✅ Insight: ${userTitle} için bülten oluşturuldu.`);

        } catch (error) {
            console.error('🔴 Insight Error:', error);
        }
    }
};

// Yardımcı fonksiyon
const chr = (code) => String.fromCharCode(code);
