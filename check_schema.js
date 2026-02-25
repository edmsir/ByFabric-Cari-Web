import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://lupfrugzllwiaiwcznfo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cGZydWd6bGx3aWFpd2N6bmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjE4NDEsImV4cCI6MjA4NjU5Nzg0MX0.noxyvA0mESo-0MoW-04RkOq2GlGKD4KHUEvx8QN5weE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkColumns() {
    console.log('--- Script Başladı ---');
    try {
        const { data, error } = await supabase.from('cari_hesaplar').select('*').limit(1);
        if (error) {
            console.error('Cari Hesaplar Hatası:', error);
        } else if (data && data.length > 0) {
            console.log('--- Cari Hesaplar Kolonları ---');
            console.log(JSON.stringify(Object.keys(data[0])));
        } else {
            console.log('Cari Hesaplar tablosunda veri bulunamadı.');
        }

        const { data: ekstre, error: ekstreError } = await supabase.from('cari_ekstre').select('*').limit(1);
        if (ekstreError) {
            console.error('Cari Ekstre Hatası:', ekstreError);
        } else if (ekstre && ekstre.length > 0) {
            console.log('--- Cari Ekstre Kolonları ---');
            console.log(JSON.stringify(Object.keys(ekstre[0])));
        } else {
            console.log('Cari Ekstre tablosunda veri bulunamadı.');
        }
    } catch (e) {
        console.error('Beklenmedik Hata:', e);
    }
}

await checkColumns();
console.log('--- Script Bitti ---');
