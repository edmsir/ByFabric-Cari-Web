
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lupfrugzllwiaiwcznfo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cGZydWd6bGx3aWFpd2N6bmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjE4NDEsImV4cCI6MjA4NjU5Nzg0MX0.noxyvA0mESo-0MoW-04RkOq2GlGKD4KHUEvx8QN5weE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    // Find records with amount 401.84 (matches Screenshot 1)
    const { data: records, error } = await supabase
        .from('cari_ekstre')
        .select('*')
        .eq('alacak', 401.84);

    if (error) {
        console.error(error);
        return;
    }

    console.log('Found records for 401.84:');
    console.log(JSON.stringify(records, null, 2));

    if (records.length > 0) {
        const kod = records[0].cari_kod;
        const sube = records[0].sube_adi;

        console.log(`\nInspecting all records for CariKod: ${kod}, Sube: ${sube}`);
        const { data: allRecords, error: err2 } = await supabase
            .from('cari_ekstre')
            .select('*')
            .eq('cari_kod', kod)
            .eq('sube_adi', sube)
            .order('tarih', { ascending: false });

        if (err2) {
            console.error(err2);
            return;
        }

        console.log(`Total records: ${allRecords.length}`);
        // Count currencies
        const currencies = allRecords.reduce((acc, r) => {
            acc[r.para_birimi] = (acc[r.para_birimi] || 0) + 1;
            return acc;
        }, {});
        console.log('Currencies:', currencies);

        console.log('\nFirst 5 records:');
        console.log(JSON.stringify(allRecords.slice(0, 5), null, 2));
    }
}

inspect();
