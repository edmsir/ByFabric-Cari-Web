import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        // Kullanıcı adı girildiyse otomatik domain ekle
        let loginEmail = email;
        if (!loginEmail.includes('@')) {
            if (loginEmail.toLowerCase() === 'admin') {
                loginEmail = `${loginEmail}@cari.com`;
            } else {
                loginEmail = `${loginEmail}@takip.com`;
            }
        }

        try {
            await login(loginEmail, password);
            navigate('/');
        } catch (err) {
            setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
            {/* Animated Background Orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        x: [0, 100, 0],
                        y: [0, -50, 0],
                        scale: [1, 1.2, 1],
                    }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute -top-24 -left-24 w-96 h-96 bg-blue-600/20 rounded-full blur-[120px]"
                />
                <motion.div
                    animate={{
                        x: [0, -120, 0],
                        y: [0, 80, 0],
                        scale: [1, 1.3, 1],
                    }}
                    transition={{
                        duration: 25,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute top-1/2 -right-24 w-[30rem] h-[30rem] bg-indigo-600/10 rounded-full blur-[150px]"
                />
                <motion.div
                    animate={{
                        x: [0, 50, 0],
                        y: [0, 100, 0],
                    }}
                    transition={{
                        duration: 15,
                        repeat: Infinity,
                        ease: "linear"
                    }}
                    className="absolute -bottom-32 left-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-[100px]"
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="glass p-8 sm:p-12 rounded-[3rem] shadow-2xl w-full max-w-xl relative overflow-hidden z-10"
            >

                <div className="text-center mb-10 relative z-10">
                    <div className="mb-10 inline-block p-10 bg-white/5 rounded-[3.5rem] backdrop-blur-2xl border border-white/10 shadow-2xl transition-all duration-700 hover:scale-110 hover:shadow-sky-500/20">
                        <img src="/logo.png" alt="ByFabric Logo" className="h-44 sm:h-72 w-auto object-contain drop-shadow-[0_35px_35px_rgba(0,0,0,0.5)]" />
                    </div>
                    <h1 className="text-5xl font-black text-white mb-2 tracking-tighter italic">Cari Raporlama</h1>
                    <p className="text-sky-400 font-black tracking-[0.5em] uppercase text-[12px] opacity-90">ByFabric • Akıllı Finans Paneli</p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg mb-6 text-sm backdrop-blur-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Kullanıcı Adı</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="h-4 w-4 text-sky-500" />
                            </div>
                            <input
                                type="text"
                                required
                                className="pl-11 block w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all duration-200"
                                placeholder="Örn: ebru_admin"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Şifre</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-slate-500" />
                            </div>
                            <input
                                type="password"
                                required
                                className="pl-10 block w-full input-modern py-3 px-4 transition-all duration-200"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:opacity-50 transition-all duration-300 transform hover:scale-[1.02]"
                    >
                        {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                    </button>
                </form>

                <div className="mt-6 text-center relative z-10">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold opacity-50">
                        Sadece yetkili personel erişebilir
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
