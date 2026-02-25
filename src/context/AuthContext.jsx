import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [role, setRole] = useState(() => localStorage.getItem('user_role'));
    const [profile, setProfile] = useState(() => {
        const saved = localStorage.getItem('user_profile');
        return saved ? JSON.parse(saved) : null;
    });
    const [loading, setLoading] = useState(true);

    const roleFetchedFor = useRef(null);
    const isFetchingRole = useRef(false);

    useEffect(() => {
        let mounted = true;

        // Fallback: Max 60 seconds for loading
        const timeout = setTimeout(() => {
            if (mounted && loading) {
                console.warn('🕒 Auth fallback timeout reached. Forcing loading to false');
                setLoading(false);
            }
        }, 60000);

        const initializeAuth = async () => {
            console.log('🔵 Auth: Initializing (Fast)...');
            try {
                // 1. First get session locally (fast)
                const { data: { session } } = await supabase.auth.getSession();
                const foundUser = session?.user;

                if (mounted && foundUser) {
                    setUser(foundUser);
                    console.log('✅ Auth: Session found locally');

                    // Check cache for instant load
                    const cachedUserId = localStorage.getItem('user_id');
                    const cachedRole = localStorage.getItem('user_role');

                    if (cachedUserId === foundUser.id && cachedRole) {
                        console.log('✅ Auth: Instant load using cache');
                        setRole(cachedRole);
                        const savedProfile = localStorage.getItem('user_profile');
                        if (savedProfile) setProfile(JSON.parse(savedProfile));
                        setLoading(false); // UI shows up immediately
                    }
                }

                // 2. Start full verification in background
                // We use getUser() to verify the token with Supabase
                const { data: { user: verifiedUser }, error: verifyError } = await supabase.auth.getUser();

                if (mounted) {
                    if (verifyError || !verifiedUser) {
                        console.log('🟡 Auth: No session verified or error');
                        clearAuthState();
                        setLoading(false);
                        return;
                    }

                    console.log('🔵 Auth: Background verify complete');
                    setUser(verifiedUser);

                    // START Role fetch but DO NOT await it if we want to be non-blocking
                    // If we don't have a role yet (not in cache), we might want to wait a bit
                    if (roleFetchedFor.current !== verifiedUser.id) {
                        if (!role) {
                            console.log('🔵 Auth: No cached role, waiting for fetch...');
                            await fetchUserRole(verifiedUser.id);
                        } else {
                            console.log('🔵 Auth: Starting background role refresh');
                            fetchUserRole(verifiedUser.id); // No await!
                        }
                    }

                    // Ensure loading is false if we reached here
                    setLoading(false);
                }
            } catch (error) {
                console.error('🔴 Auth initialization error:', error);
                if (mounted) setLoading(false);
            }
        };

        initializeAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log('🔔 Auth Event Triggered:', event);

            if (mounted) {
                if (session?.user) {
                    setUser(session.user);

                    // If it's a login or a token refresh, ensure we have the role
                    if (roleFetchedFor.current !== session.user.id || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        console.log('🔵 Auth Event: Role fetch needed');
                        // For SIGNED_IN, we might want to wait for the role to show the right UI
                        // For others, background refresh is fine
                        if (event === 'SIGNED_IN' && !role) {
                            await fetchUserRole(session.user.id);
                        } else {
                            fetchUserRole(session.user.id); // Background
                        }
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log('🟡 Auth Event: Sign out');
                    clearAuthState();
                    setLoading(false);
                }
            }
        });

        return () => {
            mounted = false;
            clearTimeout(timeout);
            subscription.unsubscribe();
        };
    }, [role]); // Added role to deps to prevent stale closure if needed, though mounted ref is better

    const clearAuthState = () => {
        setUser(null);
        setRole(null);
        setProfile(null);
        roleFetchedFor.current = null;
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_profile');
        localStorage.removeItem('user_id');
    };

    const fetchUserRole = async (userId) => {
        if (isFetchingRole.current) {
            console.log('🟠 Role: Already fetching, skipping parallel call');
            return;
        }
        isFetchingRole.current = true;

        console.log('🔵 Role: Fetching for', userId);

        // Faster timeout: 8 seconds is enough for a PK query
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Database Timeout')), 8000)
        );

        try {
            const queryPromise = supabase
                .from('user_profiles')
                .select('role, assigned_branch, assigned_sales_rep')
                .eq('id', userId)
                .maybeSingle();

            const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

            if (error) {
                console.error('🔴 Role query error:', error);
                if (!role) setRole('user');
            } else if (data) {
                console.log('✅ Role fetched:', data.role);
                setRole(data.role);
                const profileData = {
                    assigned_branch: data.assigned_branch,
                    assigned_sales_rep: data.assigned_sales_rep
                };
                setProfile(profileData);

                // Cache the results
                localStorage.setItem('user_role', data.role);
                localStorage.setItem('user_profile', JSON.stringify(profileData));
                localStorage.setItem('user_id', userId);

                roleFetchedFor.current = userId;
            } else {
                console.warn('🟡 Role: Profile not found in database');
                if (!role) {
                    setRole('user');
                    setProfile(null);
                }
            }
        } catch (error) {
            console.warn('⚠️ Role Fetch Issue:', error.message);
            if (!role) {
                setRole('user');
                setProfile(null);
            }
        } finally {
            console.log('🔵 Role: Setting loading to false (Final)');
            setLoading(false);
            isFetchingRole.current = false;
        }
    };

    const login = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    };

    const logout = async () => {
        try {
            await supabase.auth.signOut();
        } catch (error) {
            console.error('🔴 Logout Error:', error);
        } finally {
            // Force clear state locally
            setUser(null);
            setRole(null);
            setProfile(null);
            roleFetchedFor.current = null;
            clearAuthState(); // Ensure all local storage is cleared
            window.location.reload(); // Hard refresh to clear all context states
        }
    };

    const value = {
        user,
        role,
        profile,
        login,
        logout,
        loading
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    return useContext(AuthContext);
};
