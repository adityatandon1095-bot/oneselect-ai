import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

function timeAgo(ts) {
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState(null)
  const panelRef = useRef()
  const buttonRef = useRef()

  useEffect(() => {
    if (!user) return
    loadNotifications()
    const channel = supabase.channel(`notifications:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${user.id}`,
      }, payload => {
        setNotifications(prev => [payload.new, ...prev.slice(0, 29)])
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data ?? [])
  }

  async function handleOpen() {
    const next = !open
    if (next && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPanelPos({
        bottom: window.innerHeight - rect.top + 8,
        left: Math.max(8, rect.left + rect.width / 2 - 150),
      })
    }
    setOpen(next)
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length) {
      await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  function handleNotifClick(n) {
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const unread = notifications.filter(n => !n.read).length

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={handleOpen}
        style={{
          position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 8px', color: 'var(--text-3)', fontSize: 18, lineHeight: 1,
          borderRadius: 'var(--r)', transition: 'color 0.12s',
        }}
        title="Notifications"
      >
        ◬
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff',
            fontSize: 9, fontFamily: 'var(--font-mono)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, lineHeight: 1,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && panelPos && (
        <div style={{
          position: 'fixed', bottom: panelPos.bottom, left: panelPos.left,
          width: 300, maxHeight: 180, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 9999,
        }}>
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border)',
            fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--text-3)',
          }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleNotifClick(n)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--border2)',
                  cursor: n.link ? 'pointer' : 'default',
                  background: n.read ? 'transparent' : 'rgba(184,146,74,0.05)',
                  transition: 'background 0.12s',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', lineHeight: 1.4 }}>
                    {!n.read && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginRight: 6, verticalAlign: 'middle' }} />}
                    {n.title}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', flexShrink: 0 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                {n.body && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
