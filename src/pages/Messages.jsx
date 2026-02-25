import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { messageService } from '../services/messageService';
import { Mail, MailOpen, Calendar, User, Trash2, CheckCircle2 } from 'lucide-react';

export default function Messages() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMessage, setSelectedMessage] = useState(null);

    useEffect(() => {
        if (user) {
            fetchMessages();
            const subscription = messageService.subscribeToMessages(user.id, (newMessage) => {
                setMessages(prev => [newMessage, ...prev]);
                showToast('Yeni bir mesajınız var!', 'info');
            });
            return () => subscription.unsubscribe();
        }
    }, [user]);

    const fetchMessages = async () => {
        try {
            setLoading(true);
            const data = await messageService.getMessages(user.id);
            setMessages(data);
        } catch (error) {
            console.error('Mesajlar yüklenemedi:', error);
            showToast('Mesajlar yüklenirken bir hata oluştu.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleRead = async (msg) => {
        setSelectedMessage(msg);
        if (!msg.is_read) {
            try {
                await messageService.markAsRead(msg.id);
                setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: true } : m));
            } catch (error) {
                console.error('Okundu işaretlenemedi:', error);
            }
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Haber Merkezi</h1>
                    <p className="text-gray-500 font-medium">Adem'den gelen bültenler ve sistem mesajları</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-bold uppercase">
                        {messages.filter(m => !m.is_read).length} OKUNMAMIŞ
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-250px)]">
                {/* Message List */}
                <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    <div className="p-4 border-b bg-gray-50 font-bold text-gray-700 flex items-center gap-2">
                        <Mail size={18} /> Gelen Kutusu
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y">
                        {loading ? (
                            <div className="p-8 text-center text-gray-400">Yükleniyor...</div>
                        ) : messages.length > 0 ? (
                            messages.map((msg) => (
                                <button
                                    key={msg.id}
                                    onClick={() => handleRead(msg)}
                                    className={`w-full p-4 text-left hover:bg-blue-50 transition-colors border-l-4 ${selectedMessage?.id === msg.id ? 'bg-blue-50 border-blue-600' : 'border-transparent'
                                        } ${!msg.is_read ? 'bg-gray-50' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className={`text-sm font-bold ${!msg.is_read ? 'text-gray-900' : 'text-gray-600'}`}>
                                            {msg.sender_name}
                                        </span>
                                        <span className="text-[10px] text-gray-400">
                                            {new Date(msg.created_at).toLocaleDateString('tr-TR')}
                                        </span>
                                    </div>
                                    <h4 className={`text-sm truncate ${!msg.is_read ? 'font-black text-blue-700' : 'text-gray-500'}`}>
                                        {msg.title}
                                    </h4>
                                    <p className="text-xs text-gray-400 truncate mt-1">
                                        {msg.content}
                                    </p>
                                </button>
                            ))
                        ) : (
                            <div className="p-8 text-center text-gray-400 italic">Mesaj bulunamadı.</div>
                        )}
                    </div>
                </div>

                {/* Message Detail */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                    {selectedMessage ? (
                        <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                            <div className="p-6 border-b bg-gray-50">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white font-black text-xl">
                                            {selectedMessage.sender_name[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">{selectedMessage.sender_name}</h3>
                                            <p className="text-xs text-gray-500">Sistem Asistanı</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                                            <Calendar size={12} />
                                            {new Date(selectedMessage.created_at).toLocaleString('tr-TR')}
                                        </div>
                                        {selectedMessage.is_read && (
                                            <span className="text-[10px] text-green-600 font-bold flex items-center gap-1 justify-end">
                                                <CheckCircle2 size={10} /> OKUNDU
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <h2 className="text-xl font-black text-gray-800">{selectedMessage.title}</h2>
                            </div>
                            <div className="flex-1 p-8 overflow-y-auto text-gray-700 leading-relaxed whitespace-pre-line text-lg">
                                {selectedMessage.content}
                            </div>
                            <div className="p-4 border-t bg-gray-50 flex justify-end">
                                <p className="text-xs text-gray-400 italic">Saygılarımızla, Adem.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
                            <div className="p-6 bg-gray-100 rounded-full text-gray-300">
                                <MailOpen size={64} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-400">Mesaj Seçilmedi</h3>
                                <p className="text-gray-400 max-w-xs">Görüntülemek istediğiniz bülteni sol taraftaki listeden seçebilirsiniz.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
