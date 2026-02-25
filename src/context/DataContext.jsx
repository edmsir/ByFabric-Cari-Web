import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { dbService } from '../services/dbService';

const DataContext = createContext();

export function DataProvider({ children }) {
    const { user, role, profile } = useAuth();
    const { showToast } = useToast();

    const [allAccounts, setAllAccounts] = useState([]);
    const [reportData, setReportData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [reportLoading, setReportLoading] = useState(false);
    const [loadingStage, setLoadingStage] = useState('');
    const [lastSync, setLastSync] = useState(null);
    const [sqlLastUpdate, setSqlLastUpdate] = useState(null);
    const isFetching = useRef(false);

    // Initial load when user is ready
    useEffect(() => {
        if (user?.id) {
            // Reset state if user has changed (to prevent stale data from prev user)
            setAllAccounts([]);
            setLastSync(null);
            isFetching.current = false;

            fetchAccounts();
            fetchSalesReport();
        } else {
            // Clear data when logged out
            setAllAccounts([]);
            setLastSync(null);
            setReportData([]);
        }
    }, [user?.id, role, profile?.assigned_sales_rep, profile?.assigned_branch]);

    const fetchSalesReport = async () => {
        try {
            setReportLoading(true);
            const { data, error } = await supabase.rpc('get_sales_collection_report');
            if (error) throw error;
            setReportData(data || []);
        } catch (err) {
            console.error('🔴 DataContext Report Fetch Error:', err);
        } finally {
            setReportLoading(false);
        }
    };

    const fetchAccounts = async (manual = false) => {
        if (isFetching.current) return;

        try {
            isFetching.current = true;
            setLoading(true);
            setLoadingStage(manual ? 'Veriler Yenileniyor...' : 'Veriler Hazırlanıyor...');

            // --- Delta Sync Logic with IndexedDB ---
            let localData = [];
            let lastUpdateTimestamp = 0;

            if (!manual) {
                try {
                    const cached = await dbService.getItem('cari_hesaplar_cache');
                    if (cached) {
                        localData = cached;
                        lastUpdateTimestamp = localData.reduce((max, rec) => {
                            const recTime = rec.last_updated ? new Date(rec.last_updated).getTime() : 0;
                            return recTime > max ? recTime : max;
                        }, 0);
                        console.log('📦 DataContext: Loaded from IndexedDB:', localData.length, 'records');
                    }
                } catch (e) {
                    console.error('🔴 IndexedDB read error:', e);
                }
            }

            let newRecords = [];
            let from = 0;
            const PAGE_SIZE = 1000;
            let hasMore = true;

            while (hasMore) {
                let query = supabase.from('cari_hesaplar').select('*').range(from, from + PAGE_SIZE - 1);

                // Delta filter (Only fetch new/updated records)
                if (!manual && lastUpdateTimestamp > 0) {
                    query = query.gt('last_updated', new Date(lastUpdateTimestamp).toISOString());
                }

                if (role === 'sales_rep' && profile?.assigned_sales_rep) {
                    query = query.eq('satis_temsilcisi', profile.assigned_sales_rep);
                } else if (role === 'branch_manager' && profile?.assigned_branch) {
                    query = query.eq('sube_adi', profile.assigned_branch);
                }

                const { data, error } = await query;
                if (error) throw error;

                if (data && data.length > 0) {
                    newRecords = [...newRecords, ...data];
                    from += PAGE_SIZE;
                    setLoadingStage(`Yeni Veriler Alınıyor... (${newRecords.length})`);
                } else {
                    hasMore = false;
                }

                if (from > 50000) break;
            }

            // Merge Logic
            let finalRecords;
            if (manual || lastUpdateTimestamp === 0) {
                finalRecords = newRecords;
            } else {
                // Upsert logic locally
                const recordMap = new Map(localData.map(r => [`${r.cari_kod}|${r.sube_adi}`, r]));
                newRecords.forEach(r => {
                    recordMap.set(`${r.cari_kod}|${r.sube_adi}`, r);
                });
                finalRecords = Array.from(recordMap.values());
            }

            // Update stats
            const latestSyncedTime = finalRecords.reduce((max, rec) => {
                const recTime = rec.last_updated ? new Date(rec.last_updated).getTime() : 0;
                return recTime > max ? recTime : max;
            }, 0);

            if (latestSyncedTime > 0) {
                setSqlLastUpdate(new Date(latestSyncedTime).toISOString());
            }

            setAllAccounts(finalRecords);
            setLastSync(new Date().toISOString());

            // Save to IndexedDB (No 5MB limit like localStorage)
            await dbService.setItem('cari_hesaplar_cache', finalRecords);

            if (manual) showToast('Veriler başarıyla yenilendi.', 'success');
            console.log('✅ DataContext Sync:',
                manual ? 'Full Sync' : `Delta Sync (+${newRecords.length})`,
                'Total:', finalRecords.length, 'records');

        } catch (err) {
            console.error('🔴 DataContext Sync Error:', err);
            showToast('Veri senkronizasyon hatası: ' + err.message, 'error');
        } finally {
            setLoading(false);
            isFetching.current = false;
        }
    };

    return (
        <DataContext.Provider value={{
            allAccounts,
            reportData,
            loading,
            reportLoading,
            loadingStage,
            lastSync,
            sqlLastUpdate,
            refreshData: () => {
                fetchAccounts(true);
                fetchSalesReport();
            }
        }}>
            {children}
        </DataContext.Provider>
    );
}

export const useData = () => {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
};
