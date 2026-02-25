import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
    Users,
    UserPlus,
    Shield,
    MapPin,
    UserCircle,
    Trash2,
    Save,
    AlertCircle,
    Loader,
    Search,
    X
} from 'lucide-react';

export default function UserManagement() {
    const { user: currentUser, role: currentRole } = useAuth();
    const { showToast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingUser, setEditingUser] = useState(null);
    const [error, setError] = useState(null);

    // Form Stats
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'sales_rep',
        assigned_branch: '',
        assigned_sales_rep: ''
    });

    const [availableBranches, setAvailableBranches] = useState([]);
    const [availableSalesReps, setAvailableSalesReps] = useState([]);

    useEffect(() => {
        if (currentRole === 'admin') {
            fetchUsers();
            fetchAvailableOptions();
        }
    }, [currentRole]);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('user_profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError('Kullanıcılar yüklenirken bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    const fetchAvailableOptions = async () => {
        try {
            // Get branches and reps from cari_hesaplar table directly
            const { data: branchData } = await supabase
                .from('cari_hesaplar')
                .select('sube_adi')
                .not('sube_adi', 'is', null);

            const branches = [...new Set(branchData?.map(b => b.sube_adi))].sort();
            setAvailableBranches(branches);

            const { data: repData } = await supabase
                .from('cari_hesaplar')
                .select('satis_temsilcisi')
                .not('satis_temsilcisi', 'is', null);

            const reps = [...new Set(repData?.map(r => r.satis_temsilcisi))].sort();
            setAvailableSalesReps(reps);
        } catch (err) {
            console.error('Error fetching options:', err);
        }
    };

    const handleCreateUser = async (e) => {
        if (e) e.preventDefault();
        try {
            setActionLoading(true);
            setError(null);

            if (!formData.email || !formData.password) {
                setError('Email ve şifre zorunludur.');
                return;
            }

            let finalEmail = formData.email;
            if (!finalEmail.includes('@')) {
                if (finalEmail.toLowerCase() === 'admin') {
                    finalEmail = `${finalEmail}@cari.com`;
                } else {
                    finalEmail = `${finalEmail}@takip.com`;
                }
            }

            const { data, error: rpcError } = await supabase.rpc('create_user_admin', {
                u_email: finalEmail,
                u_password: formData.password,
                u_role: formData.role,
                u_branch: (formData.role === 'branch_manager' || formData.role === 'sales_rep') ? formData.assigned_branch : null,
                u_rep: formData.role === 'sales_rep' ? formData.assigned_sales_rep : null
            });

            if (rpcError) throw rpcError;
            if (data?.error) throw new Error(data.error);

            await fetchUsers();
            setShowModal(false);
            setFormData({
                email: '',
                password: '',
                role: 'sales_rep',
                assigned_branch: '',
                assigned_sales_rep: ''
            });
            showToast('Kullanıcı başarıyla oluşturuldu.', 'success');

        } catch (err) {
            console.error('Error creating user:', err);
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpdateUser = async (userId) => {
        try {
            setActionLoading(userId);
            const { error } = await supabase
                .from('user_profiles')
                .update({
                    role: formData.role,
                    assigned_branch: (formData.role === 'branch_manager' || formData.role === 'sales_rep') ? formData.assigned_branch : null,
                    assigned_sales_rep: formData.role === 'sales_rep' ? formData.assigned_sales_rep : null
                })
                .eq('id', userId);

            if (error) throw error;
            await fetchUsers();
            setShowModal(false);
            setEditingUser(null);
            showToast('Yetkiler başarıyla güncellendi.', 'success');
        } catch (err) {
            setError(err.message);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteUser = async (userId) => {
        if (!window.confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;
        try {
            const { error } = await supabase
                .from('user_profiles')
                .delete()
                .eq('id', userId);

            if (error) throw error;
            setUsers(prev => prev.filter(u => u.id !== userId));
            showToast('Kullanıcı başarıyla silindi.', 'success');
        } catch (err) {
            setError(err.message);
        }
    };

    const openEditModal = (u) => {
        setEditingUser(u);
        setFormData({
            email: u.email,
            password: '', // Password not editable here
            role: u.role || 'sales_rep',
            assigned_branch: u.assigned_branch || '',
            assigned_sales_rep: u.assigned_sales_rep || ''
        });
        setShowModal(true);
    };

    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({
            email: '',
            password: '',
            role: 'sales_rep',
            assigned_branch: '',
            assigned_sales_rep: ''
        });
        setShowModal(true);
    };

    const filteredUsers = users.filter(u =>
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.role?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (currentRole !== 'admin') {
        return <div className="p-10 text-center">Bu sayfayı görüntüleme yetkiniz yok.</div>;
    }

    return (
        <div className="space-y-6 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-blue-600" /> Kullanıcı Yönetimi
                    </h1>
                    <p className="text-gray-500 text-sm">Sistem kullanıcılarını ve erişim yetkilerini buradan yönetin.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Email veya rol ile ara..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700 transition-all"
                    >
                        <UserPlus size={16} /> Yeni Kullanıcı Ekle
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 text-gray-400 text-[10px] uppercase font-bold tracking-wider">
                                <th className="px-6 py-3">Kullanıcı</th>
                                <th className="px-6 py-3">Rol</th>
                                <th className="px-6 py-3">Erişim Yetkisi</th>
                                <th className="px-6 py-3 text-right">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-10 text-center">
                                        <Loader className="animate-spin h-6 w-6 text-blue-500 mx-auto" />
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-10 text-center text-gray-400 italic">Kullanıcı bulunamadı.</td>
                                </tr>
                            ) : filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="bg-blue-100 p-2 rounded-full">
                                                <UserCircle className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <span className="text-sm font-medium text-gray-700">
                                                {u.email?.includes('@takip.com') ? u.email.split('@')[0] : u.email}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                            u.role === 'branch_manager' ? 'bg-orange-100 text-orange-700' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                            {u.role === 'admin' ? 'Admin' : u.role === 'branch_manager' ? 'Şube Sorumlusu' : 'Satış Temsilcisi'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                                        {u.role === 'admin' ? 'Tam Erişim' :
                                            u.role === 'branch_manager' ? (u.assigned_branch || 'Tanımsız Şube') :
                                                (u.assigned_sales_rep || 'Tanımsız Temsilci')}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => openEditModal(u)}
                                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Düzenle"
                                            >
                                                <Save className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Sil"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-800">
                                {editingUser ? 'Kullanıcı Düzenle' : 'Yeni Kullanıcı Oluştur'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Kullanıcı Adı</label>
                                {editingUser ? (
                                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
                                        {formData.email?.split('@')[0]}
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={formData.email}
                                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="Örn: ahmet_sales"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                )}
                            </div>

                            {!editingUser && (
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase">Şifre</label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase">Rol Ataması</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['admin', 'branch_manager', 'sales_rep'].map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => setFormData(prev => ({ ...prev, role: r }))}
                                            className={`px-2 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${formData.role === r ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-gray-200 text-gray-600'
                                                }`}
                                        >
                                            {r === 'admin' ? 'Admin' : r === 'branch_manager' ? 'Şube' : 'Temsilci'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(formData.role === 'branch_manager' || formData.role === 'sales_rep') && (
                                <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                        <MapPin size={12} /> Sorumlu Olduğu Şube
                                    </label>
                                    <select
                                        value={formData.assigned_branch}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_branch: e.target.value }))}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Şube Seçin...</option>
                                        {availableBranches.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {formData.role === 'sales_rep' && (
                                <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                                        <UserCircle size={12} /> Sorumlu Olduğu Satış Temsilcisi
                                    </label>
                                    <select
                                        value={formData.assigned_sales_rep}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_sales_rep: e.target.value }))}
                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Temsilci Seçin...</option>
                                        {availableSalesReps.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs flex items-center gap-2">
                                    <AlertCircle size={14} /> {error}
                                </div>
                            )}

                            <div className="pt-4">
                                <button
                                    onClick={editingUser ? () => handleUpdateUser(editingUser.id) : handleCreateUser}
                                    disabled={actionLoading}
                                    className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold text-sm shadow-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {actionLoading ? <Loader className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />}
                                    {editingUser ? 'Yetkileri Kaydet' : 'Kullanıcıyı Oluştur'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
