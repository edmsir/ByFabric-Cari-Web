import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const FilterContext = createContext();

const DEFAULT_FILTERS = {
    minTL: 0,
    minUSD: 0,
    usdRate: 35.50,
    balanceType: 'ALL',
    salesRep: 'ALL',
    branch: 'ALL',
    search: ''
};

export function FilterProvider({ children }) {
    const { user } = useAuth();
    const userId = user?.id || 'guest';
    const filterKey = `cari_filters_${userId}`;

    const [filters, setFilters] = useState(() => {
        const saved = localStorage.getItem(filterKey);
        if (saved) {
            try {
                return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Filtre yükleme hatası:', e);
            }
        }
        return DEFAULT_FILTERS;
    });

    // Handle user change - reload filters for the new user
    useEffect(() => {
        const saved = localStorage.getItem(filterKey);
        if (saved) {
            try {
                setFilters({ ...DEFAULT_FILTERS, ...JSON.parse(saved) });
            } catch (e) {
                console.error('Filtre geçiş hatası:', e);
                setFilters(DEFAULT_FILTERS);
            }
        } else {
            setFilters(DEFAULT_FILTERS);
        }
    }, [userId]);

    useEffect(() => {
        if (userId !== 'guest') {
            localStorage.setItem(filterKey, JSON.stringify(filters));
        }
    }, [filters, filterKey]);

    const updateFilter = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const updateFilters = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
    };

    const resetFilters = () => {
        setFilters(DEFAULT_FILTERS);
        localStorage.removeItem(filterKey);
    };

    return (
        <FilterContext.Provider value={{ filters, updateFilter, updateFilters, resetFilters }}>
            {children}
        </FilterContext.Provider>
    );
}

export const useFilters = () => {
    const context = useContext(FilterContext);
    if (!context) {
        throw new Error('useFilters bir FilterProvider içinde kullanılmalıdır.');
    }
    return context;
};
