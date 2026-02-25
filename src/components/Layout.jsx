import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { messageService } from '../services/messageService';
import { currencyService } from '../services/currencyService';
import {
    LayoutDashboard,
    LogOut,
    Menu,
    X,
    User,
    Settings,
    Mail,
    BarChart2,
    TrendingUp,
    FileUp,
    Settings2
} from 'lucide-react';
import clsx from 'clsx';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const { user, role, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (user) {
            fetchUnreadCount();

            // Subscribe to new messages to update badge in realtime
            const channel = messageService.subscribeToMessages(user.id, () => {
                fetchUnreadCount();
            });

            // Admin ise kurları kontrol et ve eksikleri senkronize et
            if (role === 'admin') {
                currencyService.checkAndSyncRates();
            }

            return () => channel.unsubscribe();
        }
    }, [user]);

    const fetchUnreadCount = async () => {
        try {
            const count = await messageService.getUnreadCount(user.id);
            setUnreadCount(count);
        } catch (error) {
            console.error('Unread count fetch error:', error);
        }
    };

    const handleLogout = async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            navigate('/login');
        }
    };

    const navItems = [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Değerlendirme', path: '/monthly-evaluation', icon: BarChart2 },
        { name: 'Satış ve Tahsilat', path: '/sales-collection', icon: TrendingUp },
        { name: 'Veri Yükle', path: '/import', icon: FileUp },
        { name: 'Mesajlar', path: '/messages', icon: Mail, badge: unreadCount },
        ...(role === 'admin' ? [
            { name: 'Kullanıcı Yönetimi', path: '/users', icon: Settings },
            { name: 'Çalışma Parametreleri', path: '/settings', icon: Settings2 },
        ] : []),
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-gray-800 bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={clsx(
                "fixed inset-y-0 left-0 z-50 w-64 bg-dark text-white transition-transform transform lg:translate-x-0 lg:sticky lg:top-0 h-screen flex flex-col",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-white/5">
                    <div className="flex items-center justify-center flex-1">
                        <img src="/logo.png" alt="ByFabric Logo" className="h-28 w-auto object-contain brightness-110 transition-transform duration-500 hover:scale-105" />
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
                        <X className="h-6 w-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="flex items-center space-x-3 mb-6 p-2 bg-gray-800 rounded">
                        <div className="bg-primary rounded-full p-2">
                            <User className="h-4 w-4 text-white" />
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate">
                                {user?.email?.split('@')[0]}
                            </p>
                            <p className="text-xs text-gray-400 capitalize">{role || 'Kullanıcı'}</p>
                        </div>
                    </div>

                    <nav className="space-y-2">
                        {navItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => {
                                    navigate(item.path);
                                    setSidebarOpen(false);
                                }}
                                className={clsx(
                                    "w-full flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                                    location.pathname === item.path
                                        ? "bg-primary text-white"
                                        : "text-gray-300 hover:bg-gray-800 hover:text-white"
                                )}
                            >
                                <item.icon className="h-5 w-5" />
                                <span>{item.name}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex-shrink-0 p-4 border-t border-gray-700 bg-dark">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center space-x-3 px-3 py-2 text-gray-300 hover:bg-red-600 hover:text-white rounded-md transition-colors"
                    >
                        <LogOut className="h-5 w-5" />
                        <span>Çıkış Yap</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Mobile Header */}
                <header className="lg:hidden bg-white shadow-sm border-b border-gray-200">
                    <div className="px-4 py-3 flex items-center justify-between">
                        <button onClick={() => setSidebarOpen(true)}>
                            <Menu className="h-6 w-6 text-gray-600" />
                        </button>
                        <span className="font-semibold text-gray-700">Cari Raporlama</span>
                        <div className="w-6"></div> {/* Spacer */}
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-4 lg:p-8">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
