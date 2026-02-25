-- DİKKAT: Bu script tüm verileri siler ve tabloları yeniden oluşturur.
-- Supabase SQL Editor'da çalıştırın.

-- 1. Tabloları temizle
DROP TABLE IF EXISTS cari_ekstre CASCADE;
DROP TABLE IF EXISTS cari_hesaplar CASCADE;

-- 2. cari_hesaplar Tablosu (Basitleştirilmiş)
CREATE TABLE cari_hesaplar (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cari_kod TEXT NOT NULL,
    sube_adi TEXT NOT NULL,
    musteri_adi TEXT,
    satis_temsilcisi TEXT,
    guncel_bakiye NUMERIC DEFAULT 0,
    para_birimi TEXT, -- 'TL' veya 'USD'
    durum TEXT,
    borc_donemi TEXT,
    borc_tutar NUMERIC DEFAULT 0,
    metinsel_yorum TEXT,
    detayli_yorum TEXT,
    risk_skoru NUMERIC DEFAULT 0,
    tahsilat_oran_3ay INTEGER DEFAULT 0,
    tahsilat_oran_6ay INTEGER DEFAULT 0,
    nakit_orani INTEGER DEFAULT 0,
    kk_orani INTEGER DEFAULT 0,
    cek_senet_orani INTEGER DEFAULT 0,
    havale_orani INTEGER DEFAULT 0,
    diger_orani INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cari_kod, sube_adi)
);

-- 3. cari_ekstre Tablosu
CREATE TABLE cari_ekstre (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cari_kod TEXT NOT NULL,
    sube_adi TEXT NOT NULL,
    tarih DATE,
    aciklama TEXT,
    borc NUMERIC DEFAULT 0,
    alacak NUMERIC DEFAULT 0,
    para_birimi TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 4. İndeksler
CREATE INDEX IF NOT EXISTS idx_ekstre_cari ON cari_ekstre(cari_kod, sube_adi);
CREATE INDEX IF NOT EXISTS idx_ekstre_tarih ON cari_ekstre(tarih);
CREATE INDEX IF NOT EXISTS idx_hesaplar_sube ON cari_hesaplar(sube_adi);
-- Şube ve Tarih bazlı raporlama hızı için composite indeks (IMMUTABLE hatası vermez)
CREATE INDEX IF NOT EXISTS idx_ekstre_sube_tarih ON cari_ekstre (sube_adi, tarih);
-- Mükerrer kayıt kontrolü ve Upsert desteği için benzersiz indeks
CREATE UNIQUE INDEX IF NOT EXISTS idx_ekstre_unique_row ON cari_ekstre (cari_kod, sube_adi, tarih, borc, alacak, aciklama);

-- 5. RLS Politikaları (Gelişmiş Upsert Desteği)
ALTER TABLE cari_hesaplar ENABLE ROW LEVEL SECURITY;
ALTER TABLE cari_ekstre ENABLE ROW LEVEL SECURITY;

-- Mevcut politikaları temizle
DROP POLICY IF EXISTS "Full access for authenticated users" ON cari_hesaplar;
DROP POLICY IF EXISTS "Full access for authenticated users" ON cari_ekstre;

-- cari_hesaplar için Upsert uyumlu politikalar
CREATE POLICY "Enable read for authenticated users" ON cari_hesaplar FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON cari_hesaplar FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON cari_hesaplar FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- cari_ekstre için Upsert uyumlu politikalar
CREATE POLICY "Enable read for authenticated users" ON cari_ekstre FOR SELECT TO authenticated USING (true);
CREATE POLICY "Enable insert for authenticated users" ON cari_ekstre FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users" ON cari_ekstre FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 6. Otomatik Güncelleme Trigger'ı (Delta Sync İçin Şart)
CREATE OR REPLACE FUNCTION update_last_updated_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cari_hesaplar_modtime
    BEFORE UPDATE ON cari_hesaplar
    FOR EACH ROW
    EXECUTE PROCEDURE update_last_updated_column();

-- 7. Satış ve Tahsilat Raporu RPC (Final Optimize Versiyon)
DROP FUNCTION IF EXISTS get_sales_collection_report();
CREATE OR REPLACE FUNCTION get_sales_collection_report()
RETURNS TABLE (
    donem_key TEXT,
    sube_adi TEXT,
    satis_temsilcisi TEXT,
    toplam_satis NUMERIC,
    toplam_tahsilat NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH MonthlyRaw AS (
        SELECT 
            TO_CHAR(tarih, 'YYYY-MM') as d_donem,
            e.sube_adi as d_sube,
            e.cari_kod as d_kod,
            SUM(e.borc) as d_satis,
            SUM(
                CASE 
                    WHEN e.aciklama ILIKE '%Nakit Tahsilat%' 
                      OR e.aciklama ILIKE '%Çek Giriş Bordrosu%' 
                      OR e.aciklama ILIKE '%Senet Giriş Bordrosu%' 
                      OR e.aciklama ILIKE '%Gelen Havaleler%' 
                      OR e.aciklama ILIKE '%Kredi Kartı ile Tahsilat Fişi%' 
                    THEN e.alacak 
                    ELSE 0 
                END
            ) as d_tahsilat
        FROM cari_ekstre e
        GROUP BY 1, 2, 3
    )
    SELECT 
        m.d_donem as donem_key,
        m.d_sube as sube_adi,
        h.satis_temsilcisi,
        SUM(m.d_satis) as toplam_satis,
        SUM(m.d_tahsilat) as toplam_tahsilat
    FROM MonthlyRaw m
    LEFT JOIN cari_hesaplar h ON m.d_kod = h.cari_kod AND m.d_sube = h.sube_adi
    GROUP BY m.d_donem, m.d_sube, h.satis_temsilcisi;
END;
$$ LANGUAGE plpgsql;

-- 8. Gelişmiş Risk Raporu (Hata düzeltmeleri ile)
DROP FUNCTION IF EXISTS get_advanced_risk_report(NUMERIC, NUMERIC, INTEGER);
CREATE OR REPLACE FUNCTION get_advanced_risk_report(
    min_debt_tl NUMERIC,
    min_debt_usd NUMERIC,
    months_lookback INTEGER
)
RETURNS TABLE (
    cari_kod TEXT,
    musteri_adi TEXT,
    sube_adi TEXT,
    guncel_bakiye NUMERIC,
    para_birimi TEXT,
    durum TEXT,
    risk_skoru NUMERIC,
    son_odeme_tarihi DATE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.cari_kod,
        h.musteri_adi,
        h.sube_adi,
        h.guncel_bakiye,
        h.para_birimi,
        h.durum,
        h.risk_skoru,
        MAX(CASE WHEN (e.alacak > 0) THEN e.tarih ELSE NULL END) as son_odeme_tarihi
    FROM cari_hesaplar h
    LEFT JOIN cari_ekstre e ON h.cari_kod = e.cari_kod AND h.sube_adi = e.sube_adi
    WHERE 
        (h.para_birimi = 'TL' AND h.guncel_bakiye >= min_debt_tl) OR
        (h.para_birimi = 'USD' AND h.guncel_bakiye >= min_debt_usd)
    GROUP BY h.id, h.cari_kod, h.musteri_adi, h.sube_adi, h.guncel_bakiye, h.para_birimi, h.durum, h.risk_skoru
    HAVING MAX(e.tarih) >= NOW() - (months_lookback || ' months')::INTERVAL OR MAX(e.tarih) IS NULL;
END;
$$ LANGUAGE plpgsql;
