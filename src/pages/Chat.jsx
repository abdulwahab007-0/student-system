import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icon';
import api from '../services/api';

const AVATAR_COLORS = ['#059669', '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#dc2626', '#db2777', '#0ea5e9', '#ea580c', '#047857'];

function getInitials(name) {
  return name ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';
}

function getAvatarColor(name) {
  if (!name) return '#059669';
  const sum = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function formatDateSeparator(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

const ROLE_BADGE_COLORS = {
  super_admin: { bg: '#ecfdf5', color: '#059669', label: 'Admin' },
  cr_admin: { bg: '#fff7ed', color: '#c2410c', label: 'CR Admin' },
  teacher_admin: { bg: '#f5f3ff', color: '#6d28d9', label: 'Teacher' },
  student: { bg: '#eff6ff', color: '#2563eb', label: 'Student' },
};

function Chat() {
  const { currentUser, hasPermission } = useAuth();
  const [activeTab, setActiveTab] = useState('public');
  const [messages, setMessages] = useState({ public: [], announcements: [] });
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);

  // Role admins can delete messages (server also enforces this)
  const isAdmin = ['super_admin', 'cr_admin', 'teacher_admin'].includes(currentUser?.role);
  // Posting announcements is governed by the 'post_announcements' right (User Rights page)
  const canPostAnnouncements = hasPermission('post_announcements');
  const canChat = hasPermission('use_chat');

  const loadMessages = useCallback(async (channel) => {
    try {
      const data = await api.getChatMessages(channel, 200);
      setMessages(prev => ({ ...prev, [channel]: data.messages || [] }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMessages('public'), loadMessages('announcements')])
      .finally(() => setLoading(false));

    const token = api.getToken();
    const evtSource = new EventSource(`/api/chat/stream?token=${encodeURIComponent(token || '')}`);

    evtSource.addEventListener('new-message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        setMessages(prev => {
          const list = prev[msg.channel] || [];
          // Dedupe: skip if this message id is already in the list — the sender's
          // optimistic copy gets replaced with the confirmed message on POST success,
          // so the SSE echo (same id) must not be appended a second time.
          if (list.some(m => m.id === msg.id)) return prev;
          return { ...prev, [msg.channel]: [...list, msg] };
        });
      } catch {}
    });

    evtSource.addEventListener('delete-message', (e) => {
      try {
        const { id, channel } = JSON.parse(e.data);
        setMessages(prev => ({
          ...prev,
          [channel]: (prev[channel] || []).filter(m => m.id !== id),
        }));
      } catch {}
    });

    evtSource.onerror = () => {};
    return () => evtSource.close();
  }, [loadMessages]);

  // Auto-scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (nearBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { inputRef.current?.focus(); }, [activeTab]);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    const channel = activeTab;
    const text = newMessage.trim();

    // tempId lets us reconcile the optimistic copy with the server-confirmed
    // message once POST succeeds (the SSE echo carries the real DB id).
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMsg = {
      id: tempId, tempId,
      userId: currentUser.id, userName: currentUser.fullName,
      userRole: currentUser.role, channel, message: text,
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    };
    setMessages(prev => ({ ...prev, [channel]: [...(prev[channel] || []), optimisticMsg] }));
    setNewMessage('');
    setSending(true);

    try {
      const data = await api.sendChatMessage(channel, text);
      const realMsg = data?.message;
      if (realMsg) {
        // Remove the optimistic copy and add the confirmed message — unless the
        // SSE echo already delivered it (dedupe by real id).
        setMessages(prev => {
          const list = (prev[channel] || []).filter(m => m.tempId !== tempId);
          if (list.some(m => m.id === realMsg.id)) return { ...prev, [channel]: list };
          return { ...prev, [channel]: [...list, realMsg] };
        });
      }
    } catch {
      setMessages(prev => ({
        ...prev,
        [channel]: (prev[channel] || []).filter(m => m.tempId !== tempId),
      }));
      setNewMessage(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteChatMessage(id);
      setDeleteConfirm(null);
      // Remove locally (SSE 'delete-message' also mirrors this for other clients)
      setMessages(prev => ({
        ...prev,
        [activeTab]: (prev[activeTab] || []).filter(m => m.id !== id),
      }));
    } catch {}
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const currentMessages = messages[activeTab] || [];

  // Group messages by date
  const groupedMessages = [];
  let lastDate = '';
  currentMessages.forEach(msg => {
    const msgDate = msg.createdAt ? msg.createdAt.split(' ')[0] : '';
    if (msgDate !== lastDate) {
      groupedMessages.push({ type: 'date', date: msg.createdAt, key: `date-${msgDate}` });
      lastDate = msgDate;
    }
    groupedMessages.push({ type: 'message', ...msg, key: `msg-${msg.id}` });
  });

  return (
    <div className="chat-page">
      <div className="chat-tabs">
        <button className={`chat-tab ${activeTab === 'public' ? 'active' : ''}`} onClick={() => setActiveTab('public')}>
          <Icon name="chat" size={16} />
          <span>Public Chat</span>
        </button>
        <button className={`chat-tab ${activeTab === 'announcements' ? 'active' : ''}`} onClick={() => setActiveTab('announcements')}>
          <Icon name="megaphone" size={16} />
          <span>Announcements</span>
        </button>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {loading ? (
          <div className="chat-empty">
            <div className="chat-loading-spinner" />
            <p>Loading messages...</p>
          </div>
        ) : currentMessages.length === 0 ? (
          <div className="chat-empty">
            <Icon name={activeTab === 'public' ? 'chat' : 'megaphone'} size={48} style={{ color: 'var(--border)', marginBottom: '12px' }} />
            <p style={{ color: 'var(--gray)', fontWeight: '500' }}>
              {activeTab === 'public' ? 'No messages yet. Start the conversation!' : 'No announcements yet.'}
            </p>
          </div>
        ) : (
          groupedMessages.map((item) => {
            if (item.type === 'date') {
              return (
                <div key={item.key} className="chat-date-separator">
                  <span>{formatDateSeparator(item.date)}</span>
                </div>
              );
            }
            const isOwn = item.userId === currentUser?.id;
            const roleStyle = ROLE_BADGE_COLORS[item.userRole] || ROLE_BADGE_COLORS.student;

            return (
              <div key={item.key} className={`chat-message ${isOwn ? 'own' : ''} ${item.channel === 'announcements' ? 'announcement' : ''}`}>
                {!isOwn && (
                  <div className="chat-avatar" style={{ background: getAvatarColor(item.userName) }}>
                    {getInitials(item.userName)}
                  </div>
                )}
                <div className="chat-message-body">
                  {!isOwn && (
                    <div className="chat-message-header">
                      <span className="chat-sender">{item.userName}</span>
                      <span className="chat-role-badge" style={{ background: roleStyle.bg, color: roleStyle.color }}>{roleStyle.label}</span>
                      <span className="chat-time">{formatTime(item.createdAt)}</span>
                      {isAdmin && (
                        <button className="chat-delete-btn" onClick={() => setDeleteConfirm(item)} title="Delete message">
                          <Icon name="delete" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                  <div className={`chat-bubble ${isOwn ? 'own' : ''} ${item.channel === 'announcements' ? 'announcement' : ''}`}>
                    {item.message}
                  </div>
                  {isOwn && (
                    <div className="chat-message-header own-header">
                      <span className="chat-time">{formatTime(item.createdAt)}</span>
                      {isAdmin && (
                        <button className="chat-delete-btn" onClick={() => setDeleteConfirm(item)} title="Delete message">
                          <Icon name="delete" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {!canChat ? (
          <div className="chat-readonly-notice" style={{ padding: '12px', textAlign: 'center' }}>
            <span>You don't have permission to use the chat. Contact an administrator.</span>
          </div>
        ) : (
        <>
      {/* Input area */}
      <div className="chat-input-area">
        {activeTab === 'announcements' && !canPostAnnouncements && (
          <div className="chat-readonly-notice">
            <Icon name="view" size={14} />
            <span>Only users with the Post Announcements permission can post announcements</span>
          </div>
        )}
        <div className="chat-input-row">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder={
              activeTab === 'public'
                ? 'Type a message...'
                : canPostAnnouncements ? 'Post an announcement...' : 'Announcements are read-only...'
            }
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={activeTab === 'announcements' && !canPostAnnouncements}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!newMessage.trim() || sending || (activeTab === 'announcements' && !canPostAnnouncements)}
            title="Send"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" />
            </svg>
          </button>
        </div>
      </div>
        </>
        )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="chat-modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="chat-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Message</h3>
            <p>Are you sure you want to delete this message from <strong>{deleteConfirm.userName}</strong>?</p>
            <div className="chat-modal-preview">&ldquo;{deleteConfirm.message}&rdquo;</div>
            <div className="chat-modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>
                <Icon name="delete" size={14} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat;
