import { supabase } from './supabaseClient';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export const currencyService = {
    /**
     * Veritabanındaki son kur tarihini kontrol eder ve eksik olanları TCMB'den çeker.
     * Sadece Admin kullanıcılar tarafından tetiklenmesi önerilir.
     */
    async checkAndSyncRates() {
        if (sessionStorage.getItem('tcmb_sync_attempted')) return;
        sessionStorage.setItem('tcmb_sync_attempted', 'true');

        try {
            // 1. Veritabanındaki en son tarihi al
            const { data: lastRate, error: lastError } = await supabase
                .from('doviz_kurlari')
                .select('tarih')
                .order('tarih', { ascending: false })
                .limit(1)
                .single();

            let startDate;
            if (lastError || !lastRate) {
                startDate = new Date('2024-01-01');
            } else {
                startDate = new Date(lastRate.tarih);
                startDate.setDate(startDate.getDate() + 1);
            }

            const today = new Date();
            startDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            if (startDate > today) return;

            let current = new Date(startDate);
            let syncCount = 0;

            while (current <= today) {
                // Bugünün kuru ise saat 15:30'dan önce çekme (TCMB 15:30'da açıklar)
                if (current.toDateString() === today.toDateString()) {
                    const now = new Date();
                    if (now.getHours() < 15 || (now.getHours() === 15 && now.getMinutes() < 30)) {
                        break;
                    }
                }

                const rate = await this.fetchTCMBRate(current);
                if (rate) {
                    const { error: upsertError } = await supabase.rpc('upsert_doviz_kurlari', {
                        p_tarih: rate.tarih,
                        p_usd_buy: rate.usd_buy,
                        p_usd_sell: rate.usd_sell,
                        p_eur_buy: rate.eur_buy,
                        p_eur_sell: rate.eur_sell
                    });

                    if (!upsertError) syncCount++;
                }
                current.setDate(current.getDate() + 1);
                await new Promise(r => setTimeout(r, 200));
            }

            if (syncCount > 0) {
                console.log(`✅ ${syncCount} yeni günün kuru TCMB'den senkronize edildi.`);
            }
        } catch (error) {
            // Sessiz hata
        }
    },

    async fetchTCMBRate(date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');

        // Proxy kullanmak gerekebilir çünkü TCMB CORS izin vermeyebilir (Frontend tarafında)
        // Ancak bu uygulama bir desktop app veya dashboard olduğu için CORS sorunları çözülmüş olabilir.
        // Eğer CORS sorunu olursa, bu isteği bir bileşen veya aracı servis üzerinden yapmalıyız.
        const url = `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;

        try {
            // Haftasonu kontrolü (Cumartesi: 6, Pazar: 0) - TCMB haftasonu kur yayınlamaz
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (date > today) return null;

            const day = date.getDay();
            if (day === 0 || day === 6) return null;

            // NOT: Frontend'den doğrudan TCMB'ye gitmek CORS engeline takılacaktır.
            // Bu hatayı sessizce yakalayıp konsolu temiz tutuyoruz.
            const response = await axios.get(url, { timeout: 2000 }).catch(() => null);
            if (!response?.data) return null;

            const jsonObj = parser.parse(response.data);
            const currencies = jsonObj.Tarih_Date.Currency;

            const usd = currencies.find(c => c.Kod === 'USD');
            const eur = currencies.find(c => c.Kod === 'EUR');

            return {
                tarih: `${yyyy}-${mm}-${dd}`,
                usd_buy: parseFloat(usd.ForexBuying),
                usd_sell: parseFloat(usd.ForexSelling),
                eur_buy: parseFloat(eur.ForexBuying),
                eur_sell: parseFloat(eur.ForexSelling)
            };
        } catch (error) {
            // Sessizce geç (Hafta sonu, tatil veya CORS engeli normal durumdur)
            return null;
        }
    }
};
