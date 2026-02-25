import { supabase } from './supabaseClient';

export const messageService = {
    /**
     * Kullanıcının mesajlarını getirir
     */
    async getMessages(userId) {
        const { data, error } = await supabase
            .from('user_messages')
            .select('*')
            .eq('recipient_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    /**
     * Okunmamış mesaj sayısını getirir
     */
    async getUnreadCount(userId) {
        const { data, error } = await supabase
            .rpc('get_unread_message_count', { p_user_id: userId });

        if (error) throw error;
        return data || 0;
    },

    /**
     * Mesajı okundu olarak işaretler
     */
    async markAsRead(messageId) {
        const { error } = await supabase
            .from('user_messages')
            .update({ is_read: true })
            .eq('id', messageId);

        if (error) throw error;
    },

    /**
     * Yeni mesajlar için abone olur
     */
    subscribeToMessages(userId, onMessage) {
        return supabase
            .channel(`user-messages-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'user_messages',
                    filter: `recipient_id=eq.${userId}`
                },
                (payload) => onMessage(payload.new)
            )
            .subscribe();
    }
};
