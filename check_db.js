
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lupfrugzllwiaiwcznfo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cGZydWd6bGx3aWFpd2N6bmZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMjE4NDEsImV4cCI6MjA4NjU5Nzg0MX0.noxyvA0mESo-0MoW-04RkOq2GlGKD4KHUEvx8QN5weE';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    const { data, error } = await supabase.from('cari_hesaplar').select('*').limit(1);
    if (error) {
        console.error(error);
        return;
    }
    console.log(JSON.stringify(data[0], null, 2));
}

check();
