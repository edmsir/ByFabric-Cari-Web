import { supabase } from './supabaseClient';

const GEMINI_KEYS = import.meta.env.VITE_GEMINI_API_KEYS?.split(',') || [];
const GROQ_KEYS = import.meta.env.VITE_GROQ_API_KEYS?.split(',') || [];

export const aiService = {

    /**
     * Ham verileri analiz edip "Adem" karakterine uygun bir özet metin oluşturur.
     * Tüm anahtarları sırasıyla dener.
     */
    async generateAnalysisMessage(userName, financialData) {
        // 1. GEMINI ROTASYONU
        for (const key of GEMINI_KEYS) {
            try {
                if (!key) continue;
                console.log(`🔵 Gemini (Key: ...${key.slice(-4)}) deneniyor...`);
                return await this.callGemini(key, userName, financialData);
            } catch (error) {
                console.warn(`⚠️ Gemini Anahtarı (...${key.slice(-4)}) başarısız:`, error.message);
                // Döngü devam eder (Bir sonraki key'e geçer)
            }
        }

        console.warn('⚠️ Tüm Gemini anahtarları tükendi. Groq servisine geçiliyor...');

        // 2. GROQ ROTASYONU
        for (const key of GROQ_KEYS) {
            try {
                if (!key) continue;
                console.log(`🟣 Groq (Key: ...${key.slice(-4)}) deneniyor...`);
                return await this.callGroq(key, userName, financialData);
            } catch (error) {
                console.warn(`⚠️ Groq Anahtarı (...${key.slice(-4)}) başarısız:`, error.message);
                // Döngü devam eder
            }
        }

        // 3. HEPSİ BAŞARISIZ OLURSA
        console.error('🔴 Tüm AI servisleri ve anahtarları başarısız oldu.');
        return this.getFallbackMessage(userName, financialData);
    },

    /**
     * Google Gemini API Çağrısı
     * Model: gemini-1.5-flash (Hızlı ve Ücretsiz)
     */
    async callGemini(key, userName, data) {
        const prompt = this.createPrompt(userName, data);

        // Model: gemini-1.5-flash (Güncel ve Ücretsiz model)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Gemini Hatası (${response.status}): ${errData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error("Gemini API boş yanıt döndürdü.");
        return text;
    },

    /**
     * Groq API Çağrısı
     * Model: llama-3.1-8b-instant (En yeni ve hızlı model)
     */
    async callGroq(key, userName, data) {
        const prompt = this.createPrompt(userName, data);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                model: 'llama-3.1-8b-instant',
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`API Hatası: ${errData.error?.message || response.statusText}`);
        }

        const result = await response.json();
        return result.choices?.[0]?.message?.content;
    },

    createPrompt(userName, data) {
        // Tek bir listeden hem USD hem TL risklerini ayıkla
        let tlText = "";
        let usdText = "";

        // ⚠️ TOKEN LİMİTİ KORUMASI: Sadece en riskli 20 müşteriyi al
        // SQL zaten risk skoruna göre sıralı getiriyor.
        const accounts = (data.unifiedRisks || []).slice(0, 20);

        // 1. Listeyi Formatla (100 Puanlık Skor ile)
        const formatAccount = (acc, index) => {
            let t = `> ${index + 1}. **${acc.musteri_adi}** (${acc.sube_adi})\n`;
            t += `   🎯 **Risk Skoru: ${acc.risk_skoru}/100** (${getRiskLabel(acc.risk_skoru)})\n`;
            t += `   💰 Bakiye: ${acc.guncel_bakiye.toLocaleString()} ${acc.currency} | 📅 ${acc.gecen_gun} gündür sessiz\n`;
            t += `   📊 Ödeme Oranı: %${acc.odeme_orani} (${acc.odeme_orani_puan}/25p)\n`;
            t += `   ⏱️ Düzenlilik: ${acc.duzenlilik_puan}/20p | 📉 İade: ${acc.iade_orani_puan}/15p\n`;
            t += `   🔥 Limit: ${acc.limit_risk_puan}/15p | 📊 Trend: ${acc.trend_puan}/10p | 📅 Yaş: ${acc.borc_yasi_puan}/10p\n`;
            t += `   ℹ️ Borç Kaynağı: ${acc.borc_kaynagi}\n`;
            return t;
        };

        const getRiskLabel = (score) => {
            if (score >= 80) return '✅ GÜVENİLİR';
            if (score >= 60) return '⚠️ DİKKAT';
            if (score >= 40) return '🔶 RİSKLİ';
            return '🚨 KRİTİK';
        };

        const tlList = accounts.filter(acc => acc.currency === 'TL');
        const usdList = accounts.filter(acc => acc.currency === 'USD');

        if (tlList.length > 0) tlText = tlList.map((acc, i) => formatAccount(acc, i)).join("\n");
        else tlText = "Önemli TL riski tespit edilmedi.";

        if (usdList.length > 0) usdText = usdList.map((acc, i) => formatAccount(acc, i)).join("\n");
        else usdText = "Önemli USD riski tespit edilmedi.";

        return `
Sen "Admin" adında, ByFabric şirketinin Finansal Denetçisi ve Yapay Zeka asistanısın.
Görevin: Aşağıdaki **ayrıştırılmış** döviz tablolarını incelemek ve Yöneticiye (${userName}) net durumu raporlamak.

**VERİLER:**

--- 💵 USD DÖVİZ RİSKLERİ ---
${usdText}

--- ₺ TL RİSKLERİ ---
${tlText}

**ANALİZ KURALLARI (Kesinlikle Uygula):**
1. **Ödeme Performansı (EN ÖNEMLİ):** 
   - %0-%30 arası: 🚨 "KRİTİK RİSK" (Hiç ödemiyor)
   - %30-%50 arası: ⚠️ "DÜŞÜK ÖDEME" (Kötü müşteri)
   - %50-%80 arası: ⚠️ "ORTA RİSK" (Takip gerekli)
   - %80-%120 arası: ✅ "İYİ" (Normal)
   - %120 üzeri: ✅ "MÜKEMMEL" (Fazla ödeme yapmış, güvenilir)
   
2. **Borç Kaynağı:** "Ocak 2025" veya daha eski tarihli borçlar için "ESKİ BORÇ" uyarısı yap.

3. **Sessizlik:** 60+ gün sessizlik varsa "ALARM" ver AMA ödeme oranı %100+ ise "Eski iyi müşteri, takip et" de.

4. **ASLA çeviri yapma:** USD borcu olana TL deme.

**RAPOR FORMATI (Örnek):**

💵 **USD Gündemi:**
- 🚨 **[Firma Adı]**: [Bakiye] USD. Ödeme Oranı %[X] (KRİTİK/DÜŞÜK/İYİ). Borç: [Tarih]. [Yorum]

ℹ️ **Genel Yorum:** (En riskli 3-5 firmayı özetle).
`.trim();
    },

    getFallbackMessage(userName, data) {
        return `Merhaba ${userName}, AI servislerine şu an ulaşılamıyor ancak verilerinizi analiz ettim. 
    
    Toplam ${data.totalCount} cari hesabınız bulunuyor. 
    ${data.riskCount > 0 ? `⚠️ Dikkat: ${data.riskCount} adet riskli cari tespit edildi.` : '✅ Riskli cari bulunmuyor, harika!'}
    ${data.churnCount > 0 ? `📉 ${data.churnCount} müşteri son 60 gündür işlem yapmamış.` : ''}
    
    İyi çalışmalar dilerim.`;
    }
};
