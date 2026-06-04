import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Calendar, RefreshCcw, Info, AlertTriangle, 
  XCircle, ChevronRight, Activity, HardDrive, 
  ExternalLink, Clock, Terminal, Filter, Trash2, Copy, Check, Shield, Database,
  Zap, Globe, Cpu, Monitor, Layout
} from 'lucide-react';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  action: string;
  message: string;
  clientId?: number | string;
  clientName?: string;
  userId?: number | string;
  jobId?: string | number;
  details?: any;
  error?: string;
  durationMs?: number;
  statusCode?: number;
  requestId?: string;
}

interface LogsManagerProps {
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

// Design Tokens (Matching App.tsx)
const COLORS = {
  bg: 'var(--color-bg)',
  sidebar: 'var(--color-sidebar)',
  card: 'var(--color-card)',
  primary: 'var(--color-primary)',
  border: 'var(--color-border)',
  textMain: 'var(--color-text-main)',
  textDim: 'var(--color-text-dim)',
  textMuted: 'var(--color-text-muted)',
  error: 'var(--color-error)',
  warn: 'var(--color-warn)',
  info: 'var(--color-info)'
};

const localStyles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', backgroundColor: COLORS.bg, color: COLORS.textMain, overflow: 'hidden' },
  headerReplacementSlot: { padding: '12px 24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', backgroundColor: COLORS.sidebar, backdropFilter: 'blur(10px)', flexShrink: 0 },
  
  dateStrip: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', padding: '12px 24px', backgroundColor: COLORS.sidebar, borderBottom: `1px solid ${COLORS.border}`, overflowX: 'auto', flexShrink: 0, transition: 'opacity 0.3s ease' },
  dateButton: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '64px', padding: '8px 4px', borderRadius: '12px', border: '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s' },
  dateButtonActive: { backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--color-primary) 30%, transparent)', color: COLORS.primary },
  dateButtonInactive: { backgroundColor: 'color-mix(in srgb, var(--color-border) 50%, transparent)', color: COLORS.textMuted },
  
  mainArea: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: '260px', borderRight: `1px solid ${COLORS.border}`, backgroundColor: 'color-mix(in srgb, var(--color-text-main) 3%, transparent)', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto' },
  filterSection: { display: 'flex', flexDirection: 'column', gap: '12px' },
  sectionTitle: { fontSize: '10px', fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' },
  
  diagButton: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderRadius: '12px', border: '1px solid transparent', cursor: 'pointer', transition: 'all 0.2s', width: '100%', textAlign: 'left', backgroundColor: 'color-mix(in srgb, var(--color-text-main) 3%, transparent)' },
  diagButtonActive: { backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', borderColor: 'color-mix(in srgb, var(--color-primary) 25%, transparent)', color: COLORS.textMain },
  
  pillContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  pill: { padding: '6px 10px', borderRadius: '8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', border: '1px solid transparent' },
  pillActive: { backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', borderColor: COLORS.primary, color: COLORS.primary },
  pillInactive: { backgroundColor: 'color-mix(in srgb, var(--color-text-main) 5%, transparent)', color: COLORS.textMuted },

  content: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  toolbar: { padding: '12px 24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', gap: '16px', alignItems: 'center' },
  searchContainer: { flex: 1, position: 'relative' },
  input: { width: '100%', backgroundColor: COLORS.sidebar, border: `1px solid ${COLORS.border}`, borderRadius: '10px', padding: '12px 14px 12px 40px', color: COLORS.textMain, fontSize: '13px', outline: 'none' },
  
  tableContainer: { flex: 1, overflow: 'auto', padding: '0 24px 24px 24px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: COLORS.bg },
  th: { textAlign: 'left' as const, padding: '16px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.textMuted, borderBottom: `1px solid ${COLORS.border}` },
  tr: { borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer' },
  td: { padding: '14px 16px', fontSize: '13px' },
  
  badge: { padding: '4px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' },
  errorText: { color: COLORS.error, fontWeight: 600, fontSize: '11px' },
  
  inspector: { position: 'fixed', right: 0, top: 0, bottom: 0, width: '500px', backgroundColor: COLORS.card, borderLeft: `1px solid ${COLORS.border}`, zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-20px 0 50px rgba(0,0,0,0.5)' },
  inspectorHeader: { padding: '24px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  
  toggleContainer: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' },
  toggleTrack: { width: '36px', height: '20px', borderRadius: '20px', backgroundColor: 'color-mix(in srgb, var(--color-text-main) 15%, transparent)', position: 'relative', transition: 'background-color 0.2s' },
  toggleThumb: { width: '16px', height: '16px', borderRadius: '50%', backgroundColor: 'white', position: 'absolute', top: '2px', left: '2px', transition: 'left 0.2s' }
};

export const LogsManager: React.FC<LogsManagerProps> = ({ authFetch }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [filterKeyword, setFilterKeyword] = useState<string>('');
  const [liveMode, setLiveMode] = useState(true);
  const [searchAll, setSearchAll] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [historyMode, setHistoryMode] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [filterClientId, setFilterClientId] = useState<string>('ALL');
  const [filterRequestId, setFilterRequestId] = useState<string>('');

  const fetchClients = async () => {
    try {
      const res = await authFetch('/api/mgmt/clients');
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients || []);
      }
    } catch { }
  };

  const fetchDates = async () => {
    try {
      const res = await authFetch('/api/logs/dates');
      if (res.ok) {
        const data = await res.json();
        const dates = data.dates || [];
        const today = new Date().toISOString().split('T')[0];
        if (!dates.includes(today)) setAvailableDates([today, ...dates]);
        else setAvailableDates(dates);
      }
    } catch { }
  };
 
  const fetchLogs = async (date: string, isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      // In Live mode, always target today's date regardless of selection
      const today = new Date().toISOString().split('T')[0];
      const targetDate = (liveMode || !date) ? today : date;
      
      let url = searchAll 
        ? `/api/logs/search-all?level=${filterLevel}&category=${filterCategory}&keyword=${filterKeyword}` 
        : `/api/logs?date=${targetDate}&level=${filterLevel}&category=${filterCategory}&keyword=${filterKeyword}`;
      
      if (filterClientId !== 'ALL') {
        url += `&clientId=${filterClientId}`;
      }
      
      if (filterRequestId) {
        url += `&requestId=${filterRequestId}`;
      }
      
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        let entries = Array.isArray(data.entries) ? data.entries : [];
        
        // Strictly enforce latest-first sorting
        entries.sort((a: any, b: any) => {
            const dateA = new Date(a.timestamp.includes(' ') && !a.timestamp.includes('T') ? a.timestamp.replace(' ', 'T') : a.timestamp);
            const dateB = new Date(b.timestamp.includes(' ') && !b.timestamp.includes('T') ? b.timestamp.replace(' ', 'T') : b.timestamp);
            return dateB.getTime() - dateA.getTime();
        });
        
        setLogs(entries);
      }
    } catch { } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => { 
    fetchDates(); 
    fetchClients();
  }, []);

  useEffect(() => { 
    fetchLogs(selectedDate); 
  }, [selectedDate, searchAll, filterLevel, filterCategory, filterKeyword, filterClientId, filterRequestId, liveMode]);

  useEffect(() => {
    if (!liveMode || loading || searchAll) return;
    const interval = setInterval(() => fetchLogs(selectedDate, true), 3000);
    return () => clearInterval(interval);
  }, [selectedDate, liveMode, loading, searchAll]);

  const stats = useMemo(() => ({
    total: logs.length,
    errors: logs.filter(l => l.level === 'ERROR').length,
    warnings: logs.filter(l => l.level === 'WARN').length,
  }), [logs]);

  const recentDates = useMemo(() => {
    const dts = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dts.push(d.toISOString().split('T')[0]);
    }
    return dts;
  }, []);

  return (
    <div style={localStyles.container}>
      {/* Top Diagnostic Toolbar */}
      <div style={{ ...localStyles.headerReplacementSlot, padding: '16px 24px', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: COLORS.primary }}>
                <Terminal size={20} />
                <span style={{ fontSize: '14px', fontWeight: 900, letterSpacing: '0.05em' }}>DIAGNOSTIC CONSOLE</span>
            </div>
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: COLORS.textDim }}>
                    <Activity size={12} color={COLORS.primary} />
                    <span>{stats.total} EVENTS</span>
                </div>
                {stats.errors > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: COLORS.error }}>
                        <XCircle size={12} />
                        <span>{stats.errors} CRITICAL</span>
                    </div>
                )}
            </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
             <Filter size={14} color={filterClientId !== 'ALL' ? COLORS.primary : COLORS.textMuted} />
             <select 
                value={filterClientId}
                onChange={(e) => setFilterClientId(e.target.value)}
                style={{ 
                    backgroundColor: 'transparent', 
                    border: 'none', 
                    color: filterClientId !== 'ALL' ? COLORS.primary : COLORS.textDim, 
                    fontSize: '11px', 
                    fontWeight: 800, 
                    outline: 'none',
                    cursor: 'pointer'
                }}
             >
                <option value="ALL">ALL CLIENTS</option>
                {clients.map(c => <option key={c.id} value={c.id} style={{ backgroundColor: COLORS.sidebar }}>{c.name.toUpperCase()}</option>)}
             </select>
          </div>
          <div 
             onClick={() => { setSearchAll(!searchAll); if(!searchAll) setLiveMode(false); }}
             style={{ ...localStyles.toggleContainer, backgroundColor: 'rgba(255,255,255,0.03)', padding: '6px 14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <span style={{ fontSize: '10px', fontWeight: 900, color: searchAll ? COLORS.primary : COLORS.textMuted, marginRight: '10px' }}>SEARCH ALL HISTORY</span>
            <div style={{ ...localStyles.toggleTrack, width: '32px', height: '18px', backgroundColor: searchAll ? COLORS.primary : 'rgba(255,255,255,0.1)' }}>
               <div style={{ ...localStyles.toggleThumb, width: '14px', height: '14px', left: searchAll ? '16px' : '2px' }} />
            </div>
          </div>

          <button 
            onClick={() => setLiveMode(!liveMode)}
            style={{ 
              ...localStyles.pill, 
              backgroundColor: liveMode ? 'rgba(16,185,129,0.1)' : 'transparent',
              borderColor: liveMode ? COLORS.primary : 'rgba(255,255,255,0.1)',
              color: liveMode ? COLORS.primary : COLORS.textMuted,
              display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px'
            }}
          >
            <Zap size={14} className={liveMode ? 'animate-pulse' : ''} />
            <span style={{ fontSize: '11px', fontWeight: 800 }}>{liveMode ? 'LIVE STREAM' : 'STATIC VIEW'}</span>
          </button>

          <button onClick={() => fetchLogs(selectedDate)} style={{ ...localStyles.pill, padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Timeline Selector */}
      <div style={{ ...localStyles.dateStrip, padding: '12px 24px', backgroundColor: 'rgba(0,0,0,0.4)', gap: '16px' }}>
        <button 
            onClick={() => {
                const newMode = !historyMode;
                setHistoryMode(newMode);
                if (newMode) setLiveMode(false);
            }}
            style={{ 
                background: historyMode ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${historyMode ? COLORS.primary : 'rgba(255,255,255,0.1)'}`,
                color: historyMode ? COLORS.primary : 'white',
                padding: '8px 16px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.2s'
            }}
        >
            <Calendar size={16} />
            {historyMode ? 'CLOSE CALENDAR' : 'ANY TIME TREKKING'}
        </button>

        {historyMode ? (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                <span style={{ fontSize: '10px', fontWeight: 900, color: COLORS.textMuted, letterSpacing: '0.1em' }}>SELECT HISTORICAL ARCHIVE:</span>
                <select 
                    value={selectedDate}
                    onChange={(e) => {
                        setSelectedDate(e.target.value);
                        setLiveMode(false);
                    }}
                    style={{ 
                        backgroundColor: '#1a1a24',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: COLORS.textMain,
                        padding: '6px 16px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: 700,
                        outline: 'none',
                        cursor: 'pointer'
                    }}
                >
                    {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
            </div>
        ) : (
            <div style={{ display: 'flex', gap: '10px', flex: 1, overflowX: 'auto' }} className="no-scrollbar">
                {recentDates.map(date => {
                    const isSel = selectedDate === date;
                    const d = new Date(date);
                    return (
                        <div key={date} 
                            onClick={() => {
                                setSelectedDate(date);
                                setLiveMode(false);
                            }}
                            style={{ 
                                padding: '8px 18px', 
                                borderRadius: '12px', 
                                backgroundColor: isSel ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${isSel ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.05)'}`,
                                color: isSel ? COLORS.primary : COLORS.textMuted,
                                cursor: 'pointer',
                                fontSize: '11px',
                                fontWeight: 800,
                                transition: 'all 0.2s',
                                minWidth: '95px',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column'
                            }}
                        >
                            <span style={{ fontSize: '9px', opacity: 0.6, marginBottom: '2px' }}>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span>
                            <span>{isSel ? 'TODAY' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                        </div>
                    );
                })}
            </div>
        )}
      </div>

      <div style={localStyles.mainArea}>
        {/* Navigation Sidebar */}
        <aside style={{ ...localStyles.sidebar, width: '240px', padding: '24px', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={localStyles.filterSection}>
            <div style={{ ...localStyles.sectionTitle, marginBottom: '16px' }}>SYSTEM CHANNELS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[
                    { id: 'ALL', icon: <Globe size={15} />, name: 'All Activity' },
                    { id: 'AI', icon: <Cpu size={15} />, name: 'AI Analysis' },
                    { id: 'JOB', icon: <Zap size={15} />, name: 'Job Manager' },
                    { id: 'API', icon: <Monitor size={15} />, name: 'API Requests' },
                    { id: 'DB', icon: <Database size={15} />, name: 'Data Engine' },
                    { id: 'AUTH', icon: <Shield size={15} />, name: 'Auth / Security' },
                    { id: 'SYSTEM', icon: <Layout size={15} />, name: 'Kernel Core' }
                ].map(cat => (
                    <button 
                      key={cat.id}
                      onClick={() => setFilterCategory(cat.id)} 
                      style={{ 
                        ...localStyles.diagButton, 
                        ...(filterCategory === cat.id ? { backgroundColor: 'rgba(16,185,129,0.1)', color: COLORS.primary, border: '1px solid rgba(16,185,129,0.2)' } : { border: '1px solid transparent' }),
                        fontSize: '13px',
                        fontWeight: filterCategory === cat.id ? 800 : 500,
                        gap: '12px',
                        padding: '12px 16px',
                        borderRadius: '12px'
                      }}
                    >
                      <span style={{ opacity: filterCategory === cat.id ? 1 : 0.4 }}>{cat.icon}</span>
                      {cat.name}
                    </button>
                ))}
            </div>
          </div>

          <div style={{ ...localStyles.filterSection, marginTop: '32px' }}>
            <div style={{ ...localStyles.sectionTitle, marginBottom: '16px' }}>DIAGNOSTIC LEVELS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'].map(lvl => (
                    <div 
                        key={lvl}
                        onClick={() => setFilterLevel(lvl)}
                        style={{ 
                            fontSize: '10px', 
                            fontWeight: 900, 
                            cursor: 'pointer',
                            color: filterLevel === lvl ? '#fff' : COLORS.textMuted,
                            padding: '6px 12px',
                            borderRadius: '8px',
                            backgroundColor: filterLevel === lvl ? (lvl === 'ERROR' ? COLORS.error : COLORS.primary) : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${filterLevel === lvl ? 'transparent' : 'rgba(255,255,255,0.05)'}`,
                            transition: 'all 0.2s',
                            letterSpacing: '0.05em'
                        }}
                    >
                        {lvl}
                    </div>
                ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div style={{ padding: '20px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '16px', border: '1px solid rgba(16,185,129,0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLORS.primary, marginBottom: '12px' }}>
                <Activity size={14} /> <span style={{ fontSize: '11px', fontWeight: 900 }}>REAL-TIME MONITOR</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: COLORS.textMuted }}>Captured</span>
                  <span style={{ fontWeight: 800 }}>{stats.total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: COLORS.textMuted }}>Faults</span>
                  <span style={{ fontWeight: 800, color: COLORS.error }}>{stats.errors}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Console Stream Area */}
        <main style={{ ...localStyles.content, backgroundColor: '#000000', borderRadius: '0' }}>
          <div style={{ padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
             <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ position: 'relative', flex: 2 }}>
                    <Search size={16} style={{ position: 'absolute', left: '16px', top: '14px', color: COLORS.textMuted }} />
                    <input 
                        placeholder="Search diagnostic events (Action, Message, Job ID)..." 
                        value={filterKeyword}
                        onChange={(e) => setFilterKeyword(e.target.value)}
                        style={{ 
                            ...localStyles.input, 
                            backgroundColor: 'rgba(255,255,255,0.02)', 
                            padding: '12px 16px 12px 48px', 
                            border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            fontSize: '13px',
                            color: COLORS.textMain,
                            width: '100%'
                        }}
                    />
                </div>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Monitor size={16} style={{ position: 'absolute', left: '16px', top: '14px', color: COLORS.textMuted }} />
                    <input 
                        placeholder="Filter by Request ID..." 
                        value={filterRequestId}
                        onChange={(e) => setFilterRequestId(e.target.value)}
                        style={{ 
                            ...localStyles.input, 
                            backgroundColor: 'rgba(255,255,255,0.02)', 
                            padding: '12px 16px 12px 48px', 
                            border: '1px solid rgba(255,255,255,0.05)',
                            borderRadius: '12px',
                            fontSize: '13px',
                            color: COLORS.info,
                            width: '100%'
                        }}
                    />
                    {filterRequestId && (
                        <XCircle 
                            size={14} 
                            onClick={() => setFilterRequestId('')}
                            style={{ position: 'absolute', right: '16px', top: '15px', color: COLORS.textMuted, cursor: 'pointer' }} 
                        />
                    )}
                </div>
             </div>
          </div>

          <div style={{ ...localStyles.tableContainer, padding: '0' }}>
             {loading ? (
                <div style={{ padding: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                    <RefreshCcw size={48} className="animate-spin" color={COLORS.primary} style={{ opacity: 0.3 }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: COLORS.textMuted, letterSpacing: '0.1em' }}>SYNCHRONIZING CONSOLE...</span>
                </div>
             ) : logs.length === 0 ? (
                <div style={{ padding: '150px 0', textAlign: 'center' }}>
                    <Terminal size={40} style={{ opacity: 0.1, marginBottom: '20px' }} />
                    <div style={{ fontSize: '14px', fontWeight: 800, color: COLORS.textMuted }}>NO DATA IN SELECTED CHANNEL</div>
                    <div style={{ fontSize: '12px', color: COLORS.textMuted, opacity: 0.5, marginTop: '8px' }}>Waiting for system events...</div>
                </div>
             ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {logs.map((log, idx) => {
                        const isErr = log.level === 'ERROR';
                        const isWarn = log.level === 'WARN';
                        return (
                            <div 
                                key={idx}
                                onClick={() => setSelectedLog(log)}
                                style={{ 
                                    padding: '12px 32px',
                                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                                    fontSize: '12px',
                                    lineHeight: '1.6',
                                    display: 'flex',
                                    gap: '24px',
                                    cursor: 'pointer',
                                    backgroundColor: selectedLog === log ? 'rgba(16,185,129,0.08)' : 'transparent',
                                    borderLeft: `4px solid ${isErr ? COLORS.error : isWarn ? COLORS.warn : 'transparent'}`,
                                    borderBottom: '1px solid rgba(255,255,255,0.02)',
                                    transition: 'all 0.1s'
                                }}
                                className="hover:bg-white/[0.03]"
                            >
                                <span style={{ color: COLORS.textMuted, fontWeight: 700, width: '85px', flexShrink: 0 }}>
                                    {(() => {
                                        try {
                                            const ts = log.timestamp;
                                            // Handle "YYYY-MM-DD HH:mm:ss" format by inserting 'T'
                                            const normalizedTs = ts.includes(' ') && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
                                            const date = new Date(normalizedTs);
                                            return isNaN(date.getTime()) ? ts : date.toLocaleTimeString([], { hour12: false });
                                        } catch {
                                            return log.timestamp;
                                        }
                                    })()}
                                </span>
                                <span style={{ 
                                    color: isErr ? COLORS.error : isWarn ? COLORS.warn : (log.level === 'INFO' ? COLORS.primary : COLORS.textDim),
                                    fontWeight: 900,
                                    width: '60px',
                                    flexShrink: 0,
                                    letterSpacing: '0.05em'
                                }}>
                                    {log.level}
                                </span>
                                <div style={{ color: COLORS.textMain, flex: 1 }}>
                                    <span style={{ color: COLORS.textMuted, fontWeight: 800, marginRight: '10px' }}>[{log.category}]</span>
                                    <span style={{ color: '#fff', fontWeight: 900, marginRight: '12px' }}>{log.action}:</span>
                                    <span style={{ color: COLORS.textDim }}>{log.message}</span>
                                    {log.jobId && (
                                        <span style={{ marginLeft: '12px', fontSize: '10px', color: COLORS.primary, backgroundColor: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 800 }}>
                                            JOB: {log.jobId}
                                        </span>
                                    )}
                                    {log.requestId && (
                                        <span 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFilterRequestId(log.requestId || '');
                                                setSearchAll(true);
                                            }}
                                            style={{ marginLeft: '12px', fontSize: '10px', color: COLORS.info, backgroundColor: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer' }}
                                            title="Click to filter by this Request ID across all logs"
                                        >
                                            REQ: {log.requestId}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
             )}
          </div>
        </main>
      </div>

      {/* Slide-out Diagnostic Inspector */}
      {selectedLog && (
        <div style={{ ...localStyles.inspector, width: '650px', backgroundColor: '#0a0a0f', borderLeft: '1px solid rgba(255,255,255,0.1)', boxShadow: '-20px 0 50px rgba(0,0,0,0.5)' }}>
            <div style={{ ...localStyles.inspectorHeader, padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ padding: '12px', backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: '12px' }}>
                        <Terminal size={22} color={COLORS.primary} />
                    </div>
                    <div>
                        <div style={{ fontSize: '10px', fontWeight: 900, color: COLORS.primary, letterSpacing: '0.1em' }}>EVENT INSPECTOR</div>
                        <span style={{ fontSize: '18px', fontWeight: 900 }}>{selectedLog.action}</span>
                    </div>
                </div>
                <button onClick={() => setSelectedLog(null)} style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, cursor: 'pointer', padding: '8px' }}>
                    <XCircle size={24} />
                </button>
            </div>
            
            <div style={{ padding: '32px', flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 900, color: COLORS.textMuted, marginBottom: '6px' }}>VERSIONED TIMELINE</div>
                        <div style={{ fontSize: '13px', fontWeight: 800 }}>
                            {(() => {
                                try {
                                    const ts = selectedLog.timestamp;
                                    const normalizedTs = ts.includes(' ') && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
                                    const date = new Date(normalizedTs);
                                    return isNaN(date.getTime()) ? ts : date.toLocaleString();
                                } catch {
                                    return selectedLog.timestamp;
                                }
                            })()}
                        </div>
                    </div>
                    <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 900, color: COLORS.textMuted, marginBottom: '6px' }}>LOG CHANNEL</div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: COLORS.primary }}>#{selectedLog.category}</div>
                    </div>
                    <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '9px', fontWeight: 900, color: COLORS.textMuted, marginBottom: '6px' }}>SEVERITY LEVEL</div>
                        <span style={{ color: selectedLog.level === 'ERROR' ? COLORS.error : COLORS.primary, fontWeight: 900 }}>{selectedLog.level}</span>
                    </div>
                </div>

                {selectedLog.jobId && (
                    <div style={{ padding: '20px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '16px', border: '1px dashed rgba(16,185,129,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '9px', fontWeight: 900, color: COLORS.primary, marginBottom: '4px' }}>ASSOCIATED JOB IDENTIFIER</div>
                            <div style={{ fontSize: '15px', fontWeight: 900, fontFamily: 'monospace' }}>{selectedLog.jobId}</div>
                        </div>
                        <button style={{ padding: '8px 16px', backgroundColor: COLORS.primary, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '11px', fontWeight: 900, cursor: 'pointer' }}>
                            COPY ID
                        </button>
                    </div>
                )}

                <div>
                    <div style={{ fontSize: '10px', fontWeight: 900, color: COLORS.textMuted, marginBottom: '12px', letterSpacing: '0.05em' }}>PRIMARY DIAGNOSTIC MESSAGE</div>
                    <div style={{ padding: '24px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '15px', lineHeight: 1.8, color: '#fff', fontWeight: 500 }}>
                        {selectedLog.message}
                    </div>
                </div>

                {selectedLog.details && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 900, color: COLORS.textMuted, letterSpacing: '0.05em' }}>STRUCTURED METADATA (JSON)</div>
                            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedLog.details, null, 2))} style={{ color: COLORS.primary, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '10px', fontWeight: 900 }}>
                                <Copy size={12} style={{ marginRight: '6px' }} /> COPY OBJECT
                            </button>
                        </div>
                        <pre style={{ margin: 0, padding: '24px', backgroundColor: '#000', borderRadius: '20px', border: '1px solid rgba(16,185,129,0.2)', fontSize: '12px', color: COLORS.primary, overflow: 'auto', maxHeight: '400px', lineHeight: 1.6 }}>
                            {JSON.stringify(selectedLog.details, null, 2)}
                        </pre>
                    </div>
                )}
            </div>
            <div style={{ padding: '32px', backgroundColor: 'rgba(0,0,0,0.5)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button 
                  onClick={() => setSelectedLog(null)} 
                  style={{ 
                    width: '100%', 
                    padding: '16px', 
                    backgroundColor: 'rgba(255,255,255,0.05)', 
                    color: '#fff', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '16px', 
                    fontSize: '14px', 
                    fontWeight: 900, 
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                >
                    CLOSE INSPECTOR
                </button>
            </div>
        </div>
      )}
    </div>
  );
};
