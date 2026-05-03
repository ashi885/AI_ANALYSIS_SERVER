import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, RefreshCcw, ChevronRight, Copy, Check, Info, XCircle, 
  Terminal, Clock, ExternalLink, Activity, Database, Shield, Layout,
  Cpu, Zap, Receipt, Globe, Monitor, Code, AlertTriangle
} from 'lucide-react';
import { LogsManager } from './components/LogsManager';

const MODULE_OPTIONS = [
    {
        id: 'transcription',
        name: 'Transcription',
        description: 'Audio to text with timestamps',
        defaultProvider: 'openai',
        defaultModel: 'whisper-1',
        availableModels: [
            { provider: 'openai', model: 'whisper-1', name: 'Whisper-1' }
        ]
    },
    {
        id: 'subtitles',
        name: 'Subtitles',
        description: 'Generate SRT/VTT subtitles',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' },
            { provider: 'openrouter', model: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
            { provider: 'openrouter', model: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' }
        ]
    },
    {
        id: 'metadata',
        name: 'Metadata',
        description: 'Extract title, description, tags',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' },
            { provider: 'openrouter', model: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' }
        ]
    },
    {
        id: 'ad_breaks',
        name: 'Ad Breaks',
        description: 'Detect optimal ad placement',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.7-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    },
    {
        id: 'promo_breaks',
        name: 'Viral Highlights',
        description: 'Detect promo-worthy segments',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.7-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    },
    {
        id: 'subtitle_translation',
        name: 'Subtitle Translation',
        description: 'Translate subtitles to other languages',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.7-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    }
];

interface Client {
    id: number;
    name: string;
    api_key: string;
    billing_margin_flat: number;
    billing_margin_percent: number;
    created_at: string;
    api_endpoint?: string;
    status?: string;
    plan?: string;
    jobs_this_month?: number;
    contract_start?: string;
    contract_end?: string;
    setup_fee?: number;
    module_rates?: any;
    billing_type?: string;
    credits?: number;
    provider_bal_openai?: number;
    provider_bal_openrouter?: number;
    provider_warn_threshold?: number;
    client_uuid?: string;
    maintenance_mode?: number;
    description?: string;
    short_code?: string;
}

interface SummaryData {
    totalClients: number;
    activeClients: number;
    configuredEndpoints: number;
    modulesConfigured: number;
    totalJobsThisMonth: number;
    totalRevenue: number;
    moduleBreakdown: { module_name: string; clients: number }[];
}

const MODULES = [
    { id: 'transcription', name: 'Transcription', defaultRate: 0.006 },
    { id: 'subtitles', name: 'Subtitle Generation', defaultRate: 0.015 },
    { id: 'metadata', name: 'Metadata Extraction', defaultRate: 0.015 },
    { id: 'ad_breaks', name: 'Ad Break Detection', defaultRate: 0.025 },
    { id: 'promo_breaks', name: 'Viral Highlights', defaultRate: 0.025 },
    { id: 'subtitle_translation', name: 'Subtitle Translation', defaultRate: 0.025 },
];

const styles: Record<string, React.CSSProperties> = {
    container: { display: 'flex', height: '100vh', backgroundColor: '#0a0a0f', color: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
    sidebar: { width: '260px', backgroundColor: '#0d0d12', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column' as const, padding: '20px' },
    sidebarLogo: { display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '20px' },
    logoIcon: { width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(16,185,129,0.3)' },
    navItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', marginBottom: '4px', color: '#9ca3af', fontSize: '14px', fontWeight: 500 },
    navItemActive: { backgroundColor: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' },
    main: { flex: 1, display: 'flex', flexDirection: 'column' as const, overflow: 'hidden' },
    header: { height: '64px', backgroundColor: 'rgba(13,13,18,0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' },
    content: { flex: 1, overflow: 'auto', padding: '24px' },
    card: { backgroundColor: '#111118', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', padding: '24px', marginBottom: '20px' },
    statCard: { backgroundColor: '#111118', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', padding: '20px' },
    input: { backgroundColor: 'rgba(10,10,15,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none', width: '100%' },
    button: { backgroundColor: '#10b981', border: 'none', borderRadius: '8px', padding: '10px 20px', color: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' },
    buttonDanger: { backgroundColor: '#ef4444', border: 'none', borderRadius: '8px', padding: '10px 20px', color: 'white', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
    buttonSecondary: { backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 16px', color: 'white', fontSize: '13px', cursor: 'pointer' },
    table: { width: '100%', borderCollapse: 'collapse' },
    th: { textAlign: 'left' as const, padding: '12px 16px', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#6b7280', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    td: { padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '14px' },
    badge: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '9999px', fontSize: '12px', fontWeight: 500 },
};

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'clients', label: 'Clients', icon: '👥' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' },
    { id: 'settings', label: 'Settings', icon: '🔧' },
    { id: 'logging', label: 'Server Logs', icon: '📝' },
    { id: 'api-logs', label: 'API Logs', icon: '🔌' },
    { id: 'billing', label: 'Billing', icon: '💰' },
    { id: 'ai-jobs', label: 'AI Job Queue', icon: '🤖' },
    { id: 'license-cache', label: 'License Cache', icon: '🗂️' },
    { id: 'smtp', label: 'SMTP Settings', icon: '📧' },
    { id: 'sync-queue', label: 'Sync Queue', icon: '🔄' },
];

class SimpleErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error('[App] Crash caught by boundary:', error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', backgroundColor: '#0a0a0f', color: '#ef4444', height: '100vh', overflow: 'auto' }}>
                    <h1>Something went wrong</h1>
                    <pre style={{ backgroundColor: 'black', padding: '20px', borderRadius: '8px' }}>
                        {this.state.error?.toString()}
                    </pre>
                    <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                        Reload App
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// LogsView removed in favor of LogsManager component


function App() {
    try {
        console.log('[App] App function START');
        //alert('[App] App function is running!');
    } catch (e) {
        console.error('[App] Error in App:', e);
    }
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('cuepoint_admin_tab') || 'dashboard');
    
    useEffect(() => {
        localStorage.setItem('cuepoint_admin_tab', activeTab);
    }, [activeTab]);

    const [clients, setClients] = useState<Client[]>([]);
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingClient, setEditingClient] = useState<Client | null>(null);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [selectedBillingClient, setSelectedBillingClient] = useState<number | null>(null);
    const [apiKeys, setApiKeys] = useState<Record<number, any[]>>({});
    const [clientModels, setClientModels] = useState<Record<number, any[]>>({});
    const [logs, setLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [apiLogs, setApiLogs] = useState<any[]>([]);
    const [apiLogsLoading, setApiLogsLoading] = useState(false);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [clientCredentials, setClientCredentials] = useState<Record<number, { supabase_url: string; supabase_anon_key: string }>>({});
    const [billingSummary, setBillingSummary] = useState<any>(null);

    // Auth state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // License Cache state
    const [cacheClients, setCacheClients] = useState<any[]>([]);
    const [cacheLoading, setCacheLoading] = useState(false);
    const [cacheActionLoading, setCacheActionLoading] = useState<number | null>(null);
    const [balanceAlerts, setBalanceAlerts] = useState<any[]>([]);

    // Helper to get auth headers
    const getAuthHeaders = () => {
        const auth = localStorage.getItem('cuepoint_admin_auth');
        return auth ? { 'Authorization': `Basic ${auth}` } : {};
    };

    // Auth-aware fetch wrapper
    const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
        const auth = localStorage.getItem('cuepoint_admin_auth');
        const headers: Record<string, string> = {};
        if (auth) headers['Authorization'] = `Basic ${auth}`;
        if (options.headers) {
            const optHeaders = options.headers as Record<string, string>;
            Object.assign(headers, optHeaders);
        }
        return fetch(url, { ...options, headers });
    }, []);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await authFetch('/api/mgmt/status/balance-alerts');
                if (res.ok) {
                    const data = await res.json();
                    setBalanceAlerts(data.alerts || []);
                }
            } catch (err) {}
        };
        if (isAuthenticated) {
            fetchAlerts();
            const interval = setInterval(fetchAlerts, 300000); // 5 minutes
            return () => clearInterval(interval);
        }
    }, [isAuthenticated, authFetch]);

    console.log('[App] Rendering, isAuthenticated:', isAuthenticated, 'authLoading:', authLoading);

    // Show what we're about to render
    if (authLoading) {
        console.log('[App] About to render auth loading state');
    } else if (!isAuthenticated) {
        console.log('[App] About to render login form');
    } else {
        console.log('[App] About to render main app');
    }

    // Check auth on mount
    useEffect(() => {
        const checkAuth = async () => {
            const savedAuth = localStorage.getItem('cuepoint_admin_auth');
            if (savedAuth) {
                try {
                    // Decode base64 to get email:password
                    const decoded = atob(savedAuth);
                    const [email, password] = decoded.split(':');

                    const res = await fetch('/api/mgmt/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });
                    if (res.ok) {
                        setIsAuthenticated(true);
                    } else {
                        localStorage.removeItem('cuepoint_admin_auth');
                    }
                } catch (e) {
                    localStorage.removeItem('cuepoint_admin_auth');
                }
            }
            setAuthLoading(false);
        };
        checkAuth();
    }, []);

    const handleLogin = async () => {
        setLoginError('');
        try {
            const res = await fetch('/api/mgmt/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: loginEmail, password: loginPassword })
            });

            if (res.ok) {
                const auth = btoa(`${loginEmail}:${loginPassword}`);
                localStorage.setItem('cuepoint_admin_auth', auth);
                setIsAuthenticated(true);
            } else {
                setLoginError('Invalid credentials');
            }
        } catch (err) {
            setLoginError('Login failed');
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('cuepoint_admin_auth');
        setIsAuthenticated(false);
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            console.log('[App] Fetching data...');
            const [clientsRes, summaryRes, avRes, billingRes] = await Promise.all([
                authFetch('/api/mgmt/clients'),
                authFetch('/api/mgmt/summary'),
                authFetch('/api/mgmt/available-models'),
                authFetch('/api/mgmt/billing/summary')
            ]);

            if (!clientsRes.ok || !summaryRes.ok) {
                console.error('[App] One or more requests failed:', clientsRes.status, summaryRes.status);
                return;
            }

            const clientsData = await clientsRes.json();
            const summaryData = await summaryRes.json();
            const availableModelsData = avRes.ok ? await avRes.json() : [];
            const billingData = billingRes.ok ? await billingRes.json() : null;

            console.log('[App] Data received:', { clientsCount: clientsData.length, summary: !!summaryData, billing: !!billingData });
            setAvailableModels(availableModelsData);
            setBillingSummary(billingData);

            if (Array.isArray(clientsData)) {
                setClients(clientsData.map((c: Client) => ({
                    ...c,
                    status: c.status || 'active',
                    module_rates: typeof c.module_rates === 'string' ? JSON.parse(c.module_rates || '{}') : c.module_rates,
                    jobs_this_month: Math.floor(Math.random() * 500)
                })));

                // Fetch extra data for all clients
                const keysData: Record<number, any[]> = {};
                const modelsData: Record<number, any[]> = {};
                const credsData: Record<number, { supabase_url: string; supabase_anon_key: string }> = {};

                for (const c of clientsData) {
                    try {
                        const [keysRes, modelsRes, credsRes] = await Promise.all([
                            authFetch(`/api/mgmt/clients/${c.id}/api-keys`),
                            authFetch(`/api/mgmt/clients/${c.id}/models`),
                            authFetch(`/api/mgmt/clients/${c.id}/credentials`)
                        ]);
                        if (keysRes.ok) keysData[c.id] = await keysRes.json();
                        if (modelsRes.ok) modelsData[c.id] = await modelsRes.json();
                        if (credsRes.ok) {
                            const creds = await credsRes.json();
                            credsData[c.id] = { supabase_url: creds.supabaseUrl || '', supabase_anon_key: creds.supabaseAnonKey || '' };
                        }
                    } catch (e) {
                        console.error(`[App] Error fetching client ${c.id} details:`, e);
                    }
                }
                setApiKeys(keysData);
                setClientModels(modelsData);
                setClientCredentials(credsData);
            } else {
                console.error('[App] clientsData is not an array:', clientsData);
            }

            setSummary(summaryData);
        } catch (err) {
            console.error('[App] Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && isAuthenticated) {
            fetchData();
        }
    }, [authLoading, isAuthenticated]);

    // Show login if not authenticated
    if (authLoading) {
        console.log('[App] Showing auth loading');
        return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0f', color: 'white' }}>Loading...</div>;
    }

    if (!isAuthenticated) {
        console.log('[App] Showing login form');
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0f' }}>
                <div style={{ backgroundColor: '#111118', padding: '40px', borderRadius: '16px', width: '360px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                        <div style={{ width: '60px', height: '60px', background: 'linear-gradient(135deg, #10b981, #059669)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px' }}>⚡</div>
                        <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'white', marginBottom: '8px' }}>Cuepoint Server</h1>
                        <p style={{ color: '#6b7280', fontSize: '14px' }}>Sign in to manage your clients</p>
                    </div>
                    {loginError && <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '14px' }}>{loginError}</div>}
                    <input
                        type="text"
                        placeholder="Email or Username"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        style={{ ...styles.input, marginBottom: '12px' }}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        style={{ ...styles.input, marginBottom: '20px' }}
                    />
                    <button onClick={handleLogin} style={{ ...styles.button, width: '100%', justifyContent: 'center', padding: '12px' }}>
                        Sign In
                    </button>
                </div>
            </div>
        );
    }

    const today = new Date().toISOString().split('T')[0];

    const getClientStatus = (client: Client) => {
        if (client.contract_end && client.contract_end < today) return 'inactive';
        return client.status || 'active';
    };


    const filteredClients = clients.filter(client => {
        const status = getClientStatus(client);
        const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (client.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            client.api_key.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleToggleStatus = async (client: Client) => {
        setActionLoading(client.id);
        try {
            await authFetch(`/api/mgmt/clients/${client.id}/toggle-status`, { method: 'POST' });
            fetchData();
        } catch (err) {
            console.error('Failed to toggle status', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRegenerateKey = async (client: Client) => {
        if (!confirm(`Regenerate API key for ${client.name}? This will invalidate the current key.`)) return;
        setActionLoading(client.id);
        try {
            const res = await authFetch(`/api/mgmt/clients/${client.id}/regenerate-key`, { method: 'POST' });
            const data = await res.json();
            //  alert(`New API Key: ${data.apiKey}\n\nPlease share this with the client!`);
            fetchData();
        } catch (err) {
            console.error('Failed to regenerate key', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async (client: Client) => {
        if (!confirm(`Delete ${client.name}? This cannot be undone.`)) return;
        setActionLoading(client.id);
        try {
            await authFetch(`/api/mgmt/clients/${client.id}`, { method: 'DELETE' });
            fetchData();
        } catch (err) {
            console.error('Failed to delete client', err);
        } finally {
            setActionLoading(null);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        // alert('API Key copied!');
    };

    console.log('[App] About to render main UI, clients length:', clients.length);
    return (
        <div style={styles.container}>
            <aside style={styles.sidebar}>
                <div style={styles.sidebarLogo}>
                    <div style={styles.logoIcon}><span style={{ fontSize: '20px' }}>🛡️</span></div>
                    <div>
                        <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Cuepoint</div>
                        <div style={{ fontSize: '15px', fontWeight: 600 }}>Control Center</div>
                    </div>
                </div>

                <nav style={{ flex: 1 }}>
                    {NAV_ITEMS.map(item => (
                        <div key={item.id} onClick={() => setActiveTab(item.id)} style={{ ...styles.navItem, ...(activeTab === item.id ? styles.navItemActive : {}) }}>
                            <span>{item.icon}</span><span>{item.label}</span>
                        </div>
                    ))}
                </nav>

                <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold' }}>A</div>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 500 }}>Admin</div>
                            <div style={{ fontSize: '10px', color: '#6b7280' }}>Super Admin</div>
                        </div>
                    </div>
                </div>
            </aside>

            <main style={styles.main}>
                <header style={styles.header}>
                    <div>
                        <h1 style={{ fontSize: '18px', fontWeight: 600, textTransform: 'capitalize' }}>
                            {activeTab === 'logging' ? 'System Activity Logs' : activeTab.replace('&', ' ')}
                        </h1>
                        <p style={{ fontSize: '12px', color: '#6b7280' }}>
                            {activeTab === 'logging' ? 'Real-time monitoring & audit trail' : 'Manage your Cuepoint instances'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>{loginEmail}</span>
                        <button onClick={handleLogout} style={{ ...styles.buttonSecondary, fontSize: '12px' }}>Logout</button>
                        <button style={{ ...styles.buttonSecondary }}>🔔</button>
                        {activeTab === 'clients' && (
                            <button onClick={() => { setEditingClient(null); setShowModal(true); }} style={styles.button}>
                                <span>+</span><span>New Client</span>
                            </button>
                        )}
                    </div>
                </header>

                <div style={styles.content}>
                    {balanceAlerts.length > 0 && (
                        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {balanceAlerts.map((alert, i) => (
                                <div key={i} style={{ 
                                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                                    borderRadius: '12px', 
                                    padding: '12px 20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '12px',
                                    animation: 'slideIn 0.3s ease-out'
                                }}>
                                    <AlertTriangle size={18} color="#ef4444" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>Low Balance Alert: {alert.clientName}</div>
                                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{alert.message}</div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const client = clients.find(c => c.id === alert.clientId);
                                            if (client) { setEditingClient(client); setShowModal(true); }
                                        }}
                                        style={{ ...styles.buttonSecondary, fontSize: '11px', padding: '4px 10px' }}
                                    >
                                        Recharge
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeTab === 'dashboard' && <DashboardView summary={summary} clients={clients} loading={loading} />}
                    {activeTab === 'clients' && <ClientsView
                        clients={filteredClients}
                        loading={loading}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onEdit={(c: Client) => { setEditingClient(c); setShowModal(true); }}
                        onToggleStatus={handleToggleStatus}
                        onRegenerateKey={handleRegenerateKey}
                        onDelete={handleDelete}
                        getStatus={getClientStatus}
                        onCopy={copyToClipboard}
                        actionLoading={actionLoading}
                    />}
                    {activeTab === 'configuration' && <ConfigView
                        clients={clients}
                        apiKeys={apiKeys}
                        clientModels={clientModels}
                        availableModels={availableModels}
                        loading={loading || modelsLoading}
                        onRefresh={async () => {
                            console.log('[Config] Refreshing data...');
                            setLoading(true);
                            try {
                                const [clientsRes, summaryRes, modelsRes] = await Promise.all([
                                    authFetch('/api/mgmt/clients'),
                                    authFetch('/api/mgmt/summary'),
                                    authFetch('/api/mgmt/available-models')
                                ]);
                                console.log('[Config] clientsRes status:', clientsRes.status);
                                console.log('[Config] summaryRes status:', summaryRes.status);
                                console.log('[Config] modelsRes status:', modelsRes.status);

                                const clientsData = await clientsRes.json();
                                console.log('[Config] clientsData:', clientsData);
                                const summaryData = await summaryRes.json();
                                console.log('[Config] summaryData:', summaryData);
                                const modelsData = await modelsRes.json();
                                console.log('[Config] modelsData:', modelsData);
                                setAvailableModels(modelsData);

                                setClients(clientsData.map((c: Client) => ({
                                    ...c,
                                    status: c.status || 'active',
                                    module_rates: typeof c.module_rates === 'string' ? JSON.parse(c.module_rates || '{}') : c.module_rates,
                                    jobs_this_month: Math.floor(Math.random() * 500)
                                })));

                                setSummary(summaryData);

                                const keysData: Record<number, any[]> = {};
                                const clientModelsData: Record<number, any[]> = {};
                                const credsData: Record<number, { supabase_url: string; supabase_anon_key: string }> = {};
                                for (const c of clientsData) {
                                    console.log(`[Config] Fetching data for client ${c.id}...`);
                                    try {
                                        const [keysRes, modelsRes, credsRes] = await Promise.all([
                                            authFetch(`/api/mgmt/clients/${c.id}/api-keys`),
                                            authFetch(`/api/mgmt/clients/${c.id}/models`),
                                            authFetch(`/api/mgmt/clients/${c.id}/credentials`)
                                        ]);
                                        console.log(`[Config] Client ${c.id} keys status:`, keysRes.status);
                                        console.log(`[Config] Client ${c.id} models status:`, modelsRes.status);
                                        keysData[c.id] = await keysRes.json();
                                        clientModelsData[c.id] = await modelsRes.json();
                                        if (credsRes.ok) {
                                            const creds = await credsRes.json();
                                            credsData[c.id] = { supabase_url: creds.supabaseUrl || '', supabase_anon_key: creds.supabaseAnonKey || '' };
                                        }
                                        console.log(`[Config] Client ${c.id} keys:`, keysData[c.id]);
                                        console.log(`[Config] Client ${c.id} models:`, clientModelsData[c.id]);
                                    } catch (e) {
                                        console.error(`[Config] Error fetching client ${c.id} data:`, e);
                                    }
                                }
                                console.log('[Config] Final keysData:', keysData);
                                console.log('[Config] Final clientModelsData:', clientModelsData);
                                console.log('[Config] Final credsData:', credsData);
                                setApiKeys(keysData);
                                setClientModels(clientModelsData);
                                setClientCredentials(credsData);
                            } catch (err) {
                                console.error('Failed to fetch data', err);
                            } finally {
                                setLoading(false);
                                setModelsLoading(false);
                            }
                        }}
                        onAddApiKey={async (clientId: number, provider: string, apiKey: string) => {
                            await authFetch(`/api/mgmt/clients/${clientId}/api-keys`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ provider, api_key: apiKey })
                            });
                            // Refresh keys
                            const res = await authFetch(`/api/mgmt/clients/${clientId}/api-keys`);
                            const data = await res.json();
                            setApiKeys({ ...apiKeys, [clientId]: data });
                        }}
                        onToggleApiKey={async (keyId: number, clientId: number) => {
                            await authFetch(`/api/mgmt/api-keys/${keyId}/toggle`, { method: 'POST' });
                            // Refresh keys
                            const res = await authFetch(`/api/mgmt/clients/${clientId}/api-keys`);
                            const data = await res.json();
                            setApiKeys({ ...apiKeys, [clientId]: data });
                        }}
                        onDeleteApiKey={async (keyId: number, clientId: number) => {
                            if (!confirm('Delete this API key?')) return;
                            await authFetch(`/api/mgmt/api-keys/${keyId}`, { method: 'DELETE' });
                            // Refresh keys
                            const res = await authFetch(`/api/mgmt/clients/${clientId}/api-keys`);
                            const data = await res.json();
                            setApiKeys({ ...apiKeys, [clientId]: data });
                        }}
                        onSaveModel={async (clientUUID: string, modelsArray: any[]) => {
                            await authFetch(`/api/mgmt/clients/${clientUUID}/models`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ models: modelsArray })
                            });
                            const modelsData: Record<number, any[]> = {};
                            for (const c of clients) {
                                try {
                                    const res = await authFetch(`/api/mgmt/clients/${c.id}/models`);
                                    modelsData[c.id] = await res.json();
                                } catch { }
                            }
                            setClientModels(modelsData);
                        }}
                        clientCredentials={clientCredentials}
                        onSaveCredentials={(clientId: number, supabaseUrl: string, supabaseAnonKey: string) => {
                            setClientCredentials({ ...clientCredentials, [clientId]: { supabase_url: supabaseUrl, supabase_anon_key: supabaseAnonKey } });
                        }}
                    />}
                    {activeTab === 'logging' && (
                        <div style={{ position: 'absolute', inset: '64px 0 0 260px', zIndex: 10, background: '#0a0a0f', display: 'flex', flexDirection: 'column' }}>
                            <LogsManager authFetch={authFetch} />
                        </div>
                    )}
                    {activeTab === 'api-logs' && <ApiLogsView
                        logs={apiLogs}
                        loading={apiLogsLoading}
                        clients={clients}
                        onRefresh={async () => {
                            setApiLogsLoading(true);
                            try {
                                const res = await authFetch('/api/mgmt/client-usage-logs?limit=200');
                                const data = await res.json();
                                setApiLogs(data || []);
                            } catch (err) {
                                console.error('Failed to fetch API logs', err);
                            } finally {
                                setApiLogsLoading(false);
                            }
                        }}
                    />}
                    {activeTab === 'settings' && <SettingsView
                        availableModels={availableModels}
                        authFetch={authFetch}
                        onRefresh={async () => {
                            try {
                                const res = await authFetch('/api/mgmt/models');
                                setAvailableModels(await res.json());
                            } catch (err) {
                                console.error('Failed to refresh models', err);
                            }
                        }}
                    />}
                    {activeTab === 'billing' && <BillingView 
                        clients={clients} 
                        getStatus={getClientStatus} 
                        selectedBillingClient={selectedBillingClient} 
                        setSelectedBillingClient={setSelectedBillingClient} 
                        billingData={billingSummary}
                    />}
                    {activeTab === 'license-cache' && (
                        <LicenseCacheView
                            authFetch={authFetch}
                        />
                    )}
                    {activeTab === 'smtp' && (
                        <SmtpSettingsView authFetch={authFetch} />
                    )}
                    {activeTab === 'sync-queue' && (
                        <SyncQueueView authFetch={authFetch} />
                    )}
                    {activeTab === 'ai-jobs' && (
                        <AiJobsView authFetch={authFetch} clients={clients} />
                    )}
                </div>

                {showModal && (
                    <ClientModal
                        client={editingClient}
                        authFetch={authFetch}
                        onClose={() => setShowModal(false)}
                        onSave={async (data: any) => {
                            if (editingClient) {
                                await authFetch(`/api/mgmt/clients/${editingClient.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(data)
                                });
                            } else {
                                await authFetch('/api/mgmt/clients', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(data)
                                });
                            }
                            setShowModal(false);
                            fetchData();
                        }}
                    />
                )}
            </main>
        </div>
    );
}

function PrivateValue({ value, isCurrency = true }: { value: any, isCurrency?: boolean }) {
    const [visible, setVisible] = useState(false);
    
    return (
        <span 
            onClick={() => setVisible(!visible)} 
            style={{ 
                cursor: 'pointer', 
                backgroundColor: visible ? 'transparent' : 'rgba(255,255,255,0.05)',
                padding: visible ? '0' : '2px 8px',
                borderRadius: '4px',
                filter: visible ? 'none' : 'blur(4px)',
                transition: 'all 0.2s'
            }}
            title="Click to reveal"
        >
            {visible ? (isCurrency ? `$${value}` : value) : '****'}
        </span>
    );
}

export default function WrappedApp() {
    return (
        <SimpleErrorBoundary>
            <App />
        </SimpleErrorBoundary>
    );
}

function DashboardView({ summary, clients, loading }: { summary: SummaryData | null; clients: Client[]; loading: boolean }) {
    if (loading && !summary) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading dashboard data...</div>;
    }

    const providerTotal = clients.reduce((acc, c) => acc + (c.provider_bal_openai || 0) + (c.provider_bal_openrouter || 0), 0);

    const stats = [
        { label: 'Total Clients', value: summary?.totalClients || 0, icon: '👥', color: '#10b981', change: '+12%' },
        { label: 'Active Clients', value: summary?.activeClients || 0, icon: '✅', color: '#10b981', change: '+5%' },
        { label: 'Revenue', value: `$${((summary?.totalClients || 0) * 299).toLocaleString()}`, icon: '💰', color: '#8b5cf6', change: '+23%' },
        { label: 'Provider Reserve', value: <PrivateValue value={providerTotal.toFixed(2)} />, icon: '🛡️', color: '#10b981', change: 'Total' },
        { label: 'Jobs This Month', value: '2,450', icon: '⚡', color: '#3b82f6', change: '+8%' },
    ];

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {stats.map((stat, i) => (
                    <div key={i} style={styles.statCard}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>{stat.icon}</div>
                            <span style={{ fontSize: '11px', color: '#10b981' }}>{stat.change}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{stat.label}</div>
                        <div style={{ fontSize: '28px', fontWeight: 700 }}>{stat.value}</div>
                    </div>
                ))}
            </div>
            <div style={{ ...styles.card, padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
                <p style={{ color: '#6b7280' }}>Detailed analytics coming soon</p>
            </div>
        </div>
    );
}

function ClientsView({ clients, loading, statusFilter, setStatusFilter, searchQuery, setSearchQuery, onEdit, onToggleStatus, onRegenerateKey, onDelete, getStatus, onCopy, actionLoading }: any) {
    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <input
                    type="text"
                    placeholder="Search clients by name or API key..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                />
                {['all', 'active', 'inactive'].map(filter => (
                    <button
                        key={filter}
                        onClick={() => setStatusFilter(filter)}
                        style={{
                            ...styles.navItem,
                            padding: '8px 16px',
                            backgroundColor: statusFilter === filter ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                            color: statusFilter === filter ? '#10b981' : '#9ca3af',
                            border: statusFilter === filter ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
                            textTransform: 'capitalize'
                        }}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            <div style={styles.card}>
                {loading ? <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div> : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Client</th>
                                <th style={styles.th}>API Key</th>
                                <th style={styles.th}>Contract</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Provider Balances</th>
                                <th style={styles.th}>Jobs</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((client: Client) => {
                                const status = getStatus(client);
                                const isLoading = actionLoading === client.id;
                                return (
                                    <tr key={client.id}>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🏢</div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {client.description || client.name}
                                                        <span style={{ 
                                                            fontSize: '10px', 
                                                            padding: '2px 6px', 
                                                            backgroundColor: 'rgba(16,185,129,0.1)', 
                                                            color: '#10b981', 
                                                            borderRadius: '4px', 
                                                            border: '1px solid rgba(16,185,129,0.2)',
                                                            fontWeight: 700,
                                                            letterSpacing: '0.05em'
                                                        }}>
                                                            {client.name}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                                        {client.plan || 'Professional'} Plan • ID: {client.id}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <code style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', color: '#10b981', fontFamily: 'monospace' }}>
                                                    {client.api_key}
                                                </code>
                                                <button onClick={() => onCopy(client.api_key)} style={{ ...styles.navItem, padding: '4px', backgroundColor: 'transparent', border: 'none', fontSize: '12px' }}>📋</button>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ fontSize: '14px' }}>
                                                {client.contract_start?.slice(0, 10) || 'N/A'} to {client.contract_end?.slice(0, 10) || 'Lifetime'}
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span style={{ ...styles.badge, backgroundColor: status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: status === 'active' ? '#10b981' : '#f59e0b', width: 'fit-content' }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: status === 'active' ? '#10b981' : '#f59e0b', display: 'inline-block', marginRight: '6px' }} />
                                                    {status}
                                                </span>
                                                {client.maintenance_mode === 1 && (
                                                    <span style={{ ...styles.badge, backgroundColor: 'rgba(239,68,68,0.2)', color: '#ef4444', width: 'fit-content' }}>
                                                        🛠️ Maintenance
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                                    <span style={{ color: '#6b7280' }}>OpenAI:</span>
                                                    <span style={{ fontWeight: 600 }}>
                                                        <PrivateValue value={(client.provider_bal_openai || 0).toFixed(2)} />
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                                                    <span style={{ color: '#6b7280' }}>Router:</span>
                                                    <span style={{ fontWeight: 600 }}>
                                                        <PrivateValue value={(client.provider_bal_openrouter || 0).toFixed(2)} />
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ fontWeight: 500 }}>{client.jobs_this_month || 0}</div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => onToggleStatus(client)}
                                                    disabled={isLoading}
                                                    style={{
                                                        ...styles.buttonSecondary,
                                                        borderColor: status === 'active' ? '#ef4444' : '#10b981',
                                                        color: status === 'active' ? '#ef4444' : '#10b981',
                                                        padding: '6px 12px',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    {status === 'active' ? '⏸️ Deactivate' : '✅ Activate'}
                                                </button>
                                                <button
                                                    onClick={() => onRegenerateKey(client)}
                                                    disabled={isLoading}
                                                    style={{ ...styles.buttonSecondary, padding: '6px 12px', fontSize: '12px' }}
                                                >
                                                    🔄 Reset Key
                                                </button>
                                                <button
                                                    onClick={() => onEdit(client)}
                                                    style={{ ...styles.buttonSecondary, padding: '6px 12px', fontSize: '12px' }}
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    onClick={() => onDelete(client)}
                                                    disabled={isLoading}
                                                    style={{
                                                        ...styles.buttonSecondary,
                                                        borderColor: '#ef4444',
                                                        color: '#ef4444',
                                                        padding: '6px 12px',
                                                        fontSize: '12px'
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function BillingView({ clients, getStatus, selectedBillingClient, setSelectedBillingClient, billingData }: {
    clients: Client[];
    getStatus: (c: Client) => string;
    selectedBillingClient: number | null;
    setSelectedBillingClient: (id: number | null) => void;
    billingData: any;
}) {
    const activeClients = clients.filter(c => getStatus(c) === 'active');
    const selectedClientStats = billingData?.clientSummaries?.find((s: any) => s.id === selectedBillingClient);

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Active Clients</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>{billingData?.activeClientsCount || activeClients.length}</div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Setup Fees (Total)</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>${(billingData?.totalSetupFees || 0).toLocaleString()}</div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Billed Revenue (Month)</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>${(billingData?.monthlyRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Est. Annual Revenue</div>
                    <div style={{ fontSize: '28px', fontWeight: 700 }}>${((billingData?.monthlyRevenue || 0) * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                </div>
            </div>
            <div style={styles.card}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Client Billing</h3>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Client</th>
                             <th style={styles.th}>Module Rates</th>
                            <th style={styles.th}>Jobs (Month)</th>
                            <th style={styles.th}>Billing</th>
                            <th style={styles.th}>Revenue (Month)</th>
                            <th style={styles.th}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {clients.map(client => {
                            const rates = client.module_rates as any;
                            const clientSummary = billingData?.clientSummaries?.find((s: any) => s.id === client.id);
                            
                            const rateText = [
                                `Trans: $${rates?.transcription?.cost_per_job?.toFixed(3) || '0.006'}`,
                                `Sub: $${rates?.subtitles?.cost_per_job?.toFixed(3) || '0.015'}`,
                                `Meta: $${rates?.metadata?.cost_per_job?.toFixed(3) || '0.015'}`,
                                `Ad: $${rates?.ad_breaks?.cost_per_job?.toFixed(3) || '0.025'}`,
                                `Promo: $${rates?.promo_breaks?.cost_per_job?.toFixed(3) || '0.025'}`,
                            ].join(' | ');
                            
                            return (
                                <tr key={client.id} style={{ cursor: 'pointer', backgroundColor: selectedBillingClient === client.id ? 'rgba(255,255,255,0.02)' : 'transparent' }} onClick={() => setSelectedBillingClient(client.id === selectedBillingClient ? null : client.id)}>
                                    <td style={styles.td}>
                                        <div style={{ fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {client.description || client.name}
                                            <span style={{ 
                                                fontSize: '9px', 
                                                padding: '1px 5px', 
                                                backgroundColor: 'rgba(16,185,129,0.1)', 
                                                color: '#10b981', 
                                                borderRadius: '4px', 
                                                border: '1px solid rgba(16,185,129,0.2)',
                                                fontWeight: 800
                                            }}>{client.name}</span>
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#6b7280' }}>API: {client.api_key.substring(0, 12)}...</div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>{rateText}</div>
                                    </td>
                                     <td style={styles.td}>{clientSummary?.jobs_this_month || 0}</td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: client.billing_type === 'CREDIT' ? '#3b82f6' : '#9ca3af' }}>
                                            {client.billing_type === 'CREDIT' ? 'CREDIT' : 'REQUEST'}
                                        </div>
                                        {client.billing_type === 'CREDIT' && (
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: (client.credits || 0) < 10 ? '#ef4444' : '#10b981' }}>
                                                ${(client.credits || 0).toFixed(2)}
                                            </div>
                                        )}
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{ color: '#10b981', fontWeight: 600 }}>
                                            ${(clientSummary?.revenue_this_month || 0).toFixed(2)}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ ...styles.badge, backgroundColor: getStatus(client) === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: getStatus(client) === 'active' ? '#10b981' : '#f59e0b' }}>
                                                {getStatus(client)}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {selectedBillingClient && (
                    <div style={{ marginTop: '24px', padding: '20px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h4 style={{ fontSize: '14px', fontWeight: 600 }}>
                                Usage Breakdown - {clients.find(c => c.id === selectedBillingClient)?.name}
                            </h4>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Total Revenue (All Time): <span style={{ color: '#10b981', fontWeight: 600 }}>${(selectedClientStats?.moduleUsage?.reduce((s: number, m: any) => s + (m.billed_total || 0), 0) || 0).toFixed(2)}</span></div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                            {['transcription', 'subtitles', 'metadata', 'ad_breaks', 'promo_breaks'].map(modName => {
                                const modData = selectedClientStats?.moduleUsage?.find((m: any) => m.module_name === modName);
                                const color = modName === 'transcription' ? '#3b82f6' : modName === 'subtitles' ? '#a855f7' : modName === 'metadata' ? '#22c55e' : modName === 'ad_breaks' ? '#eab308' : '#ec4899';
                                return (
                                    <div key={modName} style={{ padding: '12px', backgroundColor: `${color}10`, borderRadius: '8px', border: `1px solid ${color}20` }}>
                                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'capitalize' }}>{modName.replace('_', ' ')}</div>
                                        <div style={{ fontSize: '18px', fontWeight: 600 }}>{modData?.count || 0}</div>
                                        <div style={{ fontSize: '12px', color: color }}>${(modData?.billed_total || 0).toFixed(2)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function LicenseCacheView({ authFetch }: { authFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
    const [clients, setClients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<number | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const CACHE_TTL_MINUTES = 15;

    const fetchClients = async () => {
        setLoading(true);
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/clients/cache');
            if (res.ok) {
                const data = await res.json();
                setClients(data.clients || []);
            } else {
                setMessage({ type: 'error', text: 'Failed to fetch cache data' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleRefreshCache = async (clientId: number) => {
        setActionLoading(clientId);
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/clients/cache/refresh', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Cache refreshed successfully' });
                await fetchClients();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to refresh cache' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setActionLoading(null);
        }
    };

    const handleClearCache = async (clientId: number) => {
        if (!confirm('Clear cache for this client? Client will reload on next request.')) return;

        setActionLoading(clientId);
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/clients/cache', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Cache cleared successfully' });
                await fetchClients();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to clear cache' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setActionLoading(null);
        }
    };

    // Fetch on mount
    useEffect(() => {
        fetchClients();
    }, []);

    return (
        <div>
            {/* Message */}
            {message && (
                <div style={{
                    padding: '12px 16px',
                    marginBottom: '20px',
                    borderRadius: '8px',
                    backgroundColor: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: message.type === 'success' ? '#10b981' : '#ef4444',
                    fontSize: '14px'
                }}>
                    {message.text}
                </div>
            )}

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Clients</div>
                    <div style={{ fontSize: '32px', fontWeight: 700 }}>{clients.length}</div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Cache TTL</div>
                    <div style={{ fontSize: '32px', fontWeight: 700 }}>{CACHE_TTL_MINUTES}<span style={{ fontSize: '14px', color: '#6b7280' }}> min</span></div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Auto Refresh</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: '#10b981' }}>Every {CACHE_TTL_MINUTES} min</div>
                </div>
            </div>

            {/* Cache List */}
            <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Client Cache Status</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280' }}>Manage server-side license cache for each client</p>
                    </div>
                    <button onClick={fetchClients} disabled={loading} style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}>
                        {loading ? '⏳' : '🔄'} Refresh List
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
                ) : clients.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No clients found</div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Client</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Cache Status</th>
                                <th style={styles.th}>Cached At</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map((client) => {
                                const isLoading = actionLoading === client.id;
                                const cachedAt = client.cachedAt ? new Date(client.cachedAt).toLocaleString() : 'Not cached';

                                return (
                                    <tr key={client.id}>
                                        <td style={styles.td}>
                                            <div style={{ fontWeight: 500 }}>{client.name}</div>
                                            <div style={{ fontSize: '12px', color: '#6b7280' }}>API: {client.apiKeyPrefix}</div>
                                        </td>
                                        <td style={styles.td}>
                                            <span style={{
                                                ...styles.badge,
                                                backgroundColor: client.status === 'active' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                                                color: client.status === 'active' ? '#10b981' : '#f59e0b'
                                            }}>
                                                {client.status || 'unknown'}
                                            </span>
                                        </td>
                                        <td style={styles.td}>
                                            {client.inCache ? (
                                                client.isExpired ? (
                                                    <span style={{ ...styles.badge, backgroundColor: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>Expired</span>
                                                ) : (
                                                    <span style={{ ...styles.badge, backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981' }}>In Cache</span>
                                                )
                                            ) : (
                                                <span style={{ ...styles.badge, backgroundColor: 'rgba(107,114,128,0.2)', color: '#9ca3af' }}>Not Cached</span>
                                            )}
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ fontSize: '13px', color: '#9ca3af' }}>{cachedAt}</div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => handleRefreshCache(client.id)}
                                                    disabled={isLoading}
                                                    style={{
                                                        ...styles.buttonSecondary,
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        opacity: isLoading ? 0.5 : 1
                                                    }}
                                                >
                                                    {isLoading ? '⏳' : '🔄'}
                                                </button>
                                                <button
                                                    onClick={() => handleClearCache(client.id)}
                                                    disabled={isLoading || !client.inCache}
                                                    style={{
                                                        ...styles.buttonSecondary,
                                                        borderColor: '#ef4444',
                                                        color: '#ef4444',
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        opacity: isLoading || !client.inCache ? 0.3 : 1
                                                    }}
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Info Box */}
            <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.2)' }}>
                <div style={{ fontWeight: 600, marginBottom: '8px', color: '#60a5fa' }}>About License Cache</div>
                <div style={{ fontSize: '13px', color: '#9ca3af', lineHeight: '1.6' }}>
                    The license cache stores client configuration (API keys, models, rates, Supabase credentials) in memory on the server.
                    It auto-refreshes every <strong style={{ color: '#fff' }}>{CACHE_TTL_MINUTES} minutes</strong>.
                    <br /><br />
                    <strong style={{ color: '#fff' }}>Refresh:</strong> Force immediate reload from database<br />
                    <strong style={{ color: '#fff' }}>Clear:</strong> Remove cached entry (client reloads on next request)
                </div>
            </div>
        </div>
    );
}
function TieredValueEditor({ label, value, onChange, defaultValue }: { label: string, value: any, onChange: (val: any) => void, defaultValue: any }) {
    const [isTiered, setIsTiered] = useState(typeof value === 'object' && value !== null && value.type === 'tiered');
    
    // Convert old string values to structured objects if needed
    const safeValue = typeof value === 'object' && value !== null ? value : { value: value || defaultValue };

    const handleAddTier = () => {
        const tiers = [...(safeValue.tiers || [])];
        tiers.push({ max_seconds: -1, value: defaultValue });
        onChange({ ...safeValue, type: 'tiered', tiers });
    };

    const handleRemoveTier = (index: number) => {
        const tiers = safeValue.tiers.filter((_: any, i: number) => i !== index);
        onChange({ ...safeValue, tiers });
    };

    const handleTierChange = (index: number, field: string, val: any) => {
        const tiers = [...safeValue.tiers];
        tiers[index] = { ...tiers[index], [field]: val };
        onChange({ ...safeValue, tiers });
    };

    return (
        <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#9ca3af' }}>{label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '10px', color: '#6b7280' }}>Tiered</span>
                    <input 
                        type="checkbox" 
                        checked={isTiered} 
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setIsTiered(checked);
                            if (checked) {
                                onChange({ 
                                    type: 'tiered', 
                                    tiers: safeValue.tiers || [{ max_seconds: 1800, value: safeValue.value || defaultValue }, { max_seconds: -1, value: safeValue.value || defaultValue }] 
                                });
                            } else {
                                onChange(safeValue.tiers?.[0]?.value || safeValue.value || defaultValue);
                            }
                        }}
                    />
                </div>
            </div>

            {!isTiered ? (
                <input 
                    type="number" 
                    value={safeValue.value} 
                    onChange={(e) => onChange(parseInt(e.target.value))} 
                    style={{ ...styles.input, width: '80px' }} 
                />
            ) : (
                <div style={{ padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {safeValue.tiers?.map((tier: any, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <select 
                                value={tier.max_seconds} 
                                onChange={(e) => handleTierChange(i, 'max_seconds', Number(e.target.value))}
                                style={{ ...styles.input, padding: '4px', fontSize: '11px', flex: 1 }}
                            >
                                <option value={600}>Up to 10m</option>
                                <option value={1200}>Up to 20m</option>
                                <option value={1800}>Up to 30m</option>
                                <option value={3600}>Up to 1h</option>
                                <option value={7200}>Up to 2h</option>
                                <option value={-1}>Infinite</option>
                            </select>
                            <input 
                                type="number" 
                                value={tier.value} 
                                onChange={(e) => handleTierChange(i, 'value', parseInt(e.target.value))}
                                style={{ ...styles.input, padding: '4px', fontSize: '11px', width: '60px' }}
                            />
                            <button onClick={() => handleRemoveTier(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                    ))}
                    <button onClick={handleAddTier} style={{ ...styles.buttonSecondary, padding: '2px 8px', fontSize: '10px' }}>+ Add Tier</button>
                </div>
            )}
        </div>
    );
}

function TieredPricingCard({ title, value, onChange }: { title: string, value: any, onChange: (val: any) => void }) {
    const [isTiered, setIsTiered] = useState(value?.pricing_type === 'tiered');
    
    const handleAddTier = () => {
        const tiers = [...(value?.tiers || [])];
        tiers.push({ max_seconds: -1, cost: 0 });
        onChange({ ...value, pricing_type: 'tiered', tiers });
    };

    const handleRemoveTier = (index: number) => {
        const tiers = value?.tiers.filter((_: any, i: number) => i !== index);
        onChange({ ...value, tiers });
    };

    const handleTierChange = (index: number, field: string, val: any) => {
        const tiers = [...value.tiers];
        tiers[index] = { ...tiers[index], [field]: val };
        onChange({ ...value, tiers });
    };

    return (
        <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981' }}>{title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#6b7280' }}>Tiered Pricing</span>
                    <input 
                        type="checkbox" 
                        checked={isTiered} 
                        onChange={(e) => {
                            const checked = e.target.checked;
                            setIsTiered(checked);
                            if (checked) {
                                onChange({ 
                                    pricing_type: 'tiered', 
                                    tiers: value?.tiers || [{ max_seconds: 1200, cost: value?.cost_per_job || 0 }, { max_seconds: -1, cost: value?.cost_per_job || 0 }] 
                                });
                            } else {
                                onChange({ cost_per_job: value?.tiers?.[0]?.cost || 0 });
                            }
                        }}
                    />
                </div>
            </div>

            {!isTiered ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>Flat Rate ($)</span>
                    <input 
                        type="number" 
                        step="0.001" 
                        value={typeof value === 'object' ? (value.cost_per_job ?? 0) : value} 
                        onChange={(e) => onChange({ cost_per_job: Number(e.target.value) })} 
                        style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', width: '80px' }} 
                    />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {value?.tiers?.map((tier: any, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>Max Duration</div>
                                <select 
                                    value={tier.max_seconds} 
                                    onChange={(e) => handleTierChange(i, 'max_seconds', Number(e.target.value))}
                                    style={{ ...styles.input, padding: '4px', fontSize: '11px' }}
                                >
                                    <option value={600}>10 Mins</option>
                                    <option value={1200}>20 Mins</option>
                                    <option value={1800}>30 Mins</option>
                                    <option value={3000}>50 Mins</option>
                                    <option value={3600}>1 Hour</option>
                                    <option value={7200}>2 Hours</option>
                                    <option value={-1}>Infinite (Default)</option>
                                </select>
                            </div>
                            <div style={{ width: '80px' }}>
                                <div style={{ fontSize: '9px', color: '#6b7280', marginBottom: '2px' }}>Cost ($)</div>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value={tier.cost} 
                                    onChange={(e) => handleTierChange(i, 'cost', Number(e.target.value))}
                                    style={{ ...styles.input, padding: '4px', fontSize: '11px' }}
                                />
                            </div>
                            <button 
                                onClick={() => handleRemoveTier(i)}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginTop: '12px' }}
                            >✕</button>
                        </div>
                    ))}
                    <button 
                        onClick={handleAddTier}
                        style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '10px', marginTop: '4px' }}
                    >+ Add Tier</button>
                </div>
            )}
        </div>
    );
}


function ClientModal({ client, authFetch, onClose, onSave }: { client: Client | null; authFetch: (url: string, options?: RequestInit) => Promise<Response>; onClose: () => void; onSave: (data: any) => void }) {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const moduleRates = client?.module_rates || { transcription: { cost_per_job: 0.006 }, subtitles: { cost_per_job: 0.015 }, metadata: { cost_per_job: 0.015 }, ad_breaks: { cost_per_job: 0.025 }, promo_breaks: { cost_per_job: 0.025 } };

    const [formData, setFormData] = useState({
        name: client?.name || '',
        short_code: client?.short_code || '',
        description: client?.description || '',
        api_key: client?.api_key || '',
        plan: client?.plan || 'Professional',
        contract_start: client?.contract_start?.slice(0, 10) || today,
        contract_end: client?.contract_end?.slice(0, 10) || '',
        setup_fee: client?.setup_fee || 0,
        billing_margin_percent: client?.billing_margin_percent || 20,
        billing_margin_flat: client?.billing_margin_flat || 0.50,
        status: client?.status || 'active',
        billing_type: client?.billing_type || 'PER_REQUEST',
        credits: client?.credits || 0,
        maintenance_mode: client?.maintenance_mode || 0,
        module_rates: moduleRates
    });
    
    const [plan, setPlan] = useState(client?.plan || 'Professional');
    const [billing_type, setBillingType] = useState(client?.billing_type || 'PER_REQUEST');
    const [credits, setCredits] = useState(client?.credits || 0);
    const [provider_bal_openai, setProviderBalOpenai] = useState(client?.provider_bal_openai || 0);
    const [provider_bal_openrouter, setProviderBalOpenrouter] = useState(client?.provider_bal_openrouter || 0);
    const [provider_warn_threshold, setProviderWarnThreshold] = useState(client?.provider_warn_threshold || 25.0);
    const [description, setDescription] = useState(client?.description || '');

    // Auto-generate short_code if empty and name is typed
    useEffect(() => {
        if (!client && !formData.short_code && formData.name.length >= 3) {
            setFormData(prev => ({ ...prev, short_code: prev.name.substring(0, 3).toUpperCase() }));
        }
    }, [formData.name, formData.short_code, client]);

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ backgroundColor: '#111118', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', padding: '24px', width: '500px', maxHeight: '90vh', overflow: 'auto' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>{client ? 'Edit Client' : 'Create New Client'}</h2>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '8px' }}>Shortcode (3-char) *</label>
                        <input 
                            type="text" 
                            value={formData.short_code} 
                            onChange={(e) => setFormData({ ...formData, short_code: e.target.value.substring(0, 3).toUpperCase() })} 
                            style={styles.input} 
                            placeholder="ACM" 
                            maxLength={3}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Full Company Name</label>
                        <input 
                            type="text" 
                            value={formData.name} 
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                            style={styles.input} 
                            placeholder="e.g. Acme Corporation Inc." 
                        />
                    </div>
                </div>

                {/* Original description field removed as it's now company name */}

                {client && (
                    <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px', color: '#10b981' }}>API Key</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input type="text" value={formData.api_key} readOnly style={{ ...styles.input, flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(formData.api_key);
                                }}
                                style={{ ...styles.buttonSecondary, padding: '8px 12px', fontSize: '12px' }}
                            >
                                📋
                            </button>
                            <button
                                onClick={async () => {
                                    const res = await authFetch(`/api/mgmt/clients/${client.id}/regenerate-key`, { method: 'POST' });
                                    const data = await res.json();
                                    setFormData({ ...formData, api_key: data.apiKey });
                                }}
                                style={{ ...styles.buttonSecondary, padding: '8px 12px', fontSize: '12px' }}
                            >
                                🔄
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Plan</label>
                        <select value={formData.plan} onChange={(e) => setFormData({ ...formData, plan: e.target.value })} style={styles.input}>
                            <option value="Starter">Starter - $99/mo</option>
                            <option value="Professional">Professional - $299/mo</option>
                            <option value="Enterprise">Enterprise - $999/mo</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Status</label>
                        <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })} style={styles.input}>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Contract Start</label>
                        <input type="date" value={formData.contract_start} onChange={(e) => setFormData({ ...formData, contract_start: e.target.value })} style={styles.input} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Contract End (empty=lifetime)</label>
                        <input type="date" value={formData.contract_end} onChange={(e) => setFormData({ ...formData, contract_end: e.target.value })} style={styles.input} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Billing Mode</label>
                        <select 
                            value={formData.billing_type} 
                            onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })} 
                            style={styles.input}
                        >
                            <option value="PER_REQUEST">Per Request Billing</option>
                            <option value="CREDIT">Credit System</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                            Maintenance Mode
                        </label>
                        <select 
                            value={formData.maintenance_mode} 
                            onChange={(e) => setFormData({ ...formData, maintenance_mode: Number(e.target.value) })} 
                            style={{ ...styles.input, backgroundColor: formData.maintenance_mode ? 'rgba(239, 68, 68, 0.1)' : 'rgba(10, 10, 15, 0.8)' }}
                        >
                            <option value={0}>Disabled (Online)</option>
                            <option value={1}>Enabled (Offline)</option>
                        </select>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                            {formData.billing_type === 'CREDIT' ? 'Credit Balance ($)' : 'Starting Balance ($)'}
                        </label>
                        <input 
                            type="number" 
                            step="0.01"
                            value={credits} 
                            onChange={(e) => setCredits(parseFloat(e.target.value))} 
                            style={styles.input} 
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Setup Fee ($)</label>
                        <input type="number" value={formData.setup_fee} onChange={(e) => setFormData({ ...formData, setup_fee: Number(e.target.value) })} style={styles.input} />
                    </div>
                </div>

                <div style={{ ...styles.card, padding: '16px', background: 'rgba(255,255,255,0.02)', borderStyle: 'dashed' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#10b981', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔒 Provider Recharge (Confidential — Staff Only)</div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>OpenAI/Whisper Balance ($)</label>
                            <input
                                type="number" step="0.01" min="0"
                                value={isNaN(provider_bal_openai) ? '' : provider_bal_openai}
                                onChange={(e) => setProviderBalOpenai(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                style={{ ...styles.input, borderColor: 'rgba(16,185,129,0.3)' }}
                                placeholder="e.g. 10.00"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>OpenRouter Balance ($)</label>
                            <input
                                type="number" step="0.01" min="0"
                                value={isNaN(provider_bal_openrouter) ? '' : provider_bal_openrouter}
                                onChange={(e) => setProviderBalOpenrouter(e.target.value === '' ? 0 : parseFloat(e.target.value))}
                                style={{ ...styles.input, borderColor: 'rgba(16,185,129,0.3)' }}
                                placeholder="e.g. 10.00"
                            />
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Low Balance Warning Threshold ($)</label>
                        <input
                            type="number" step="0.01" min="0"
                            value={isNaN(provider_warn_threshold) ? '' : provider_warn_threshold}
                            onChange={(e) => setProviderWarnThreshold(e.target.value === '' ? 25 : parseFloat(e.target.value))}
                            style={styles.input}
                            placeholder="e.g. 2.50"
                        />
                        <p style={{ fontSize: '10px', color: '#4b5563', marginTop: '4px' }}>Alert fires when balance drops below this dollar amount (e.g. $2.50).</p>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Margin %</label>
                        <input type="number" value={formData.billing_margin_percent} onChange={(e) => setFormData({ ...formData, billing_margin_percent: Number(e.target.value) })} style={styles.input} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>Margin Flat ($)</label>
                        <input type="number" step="0.01" value={formData.billing_margin_flat} onChange={(e) => setFormData({ ...formData, billing_margin_flat: Number(e.target.value) })} style={styles.input} />
                    </div>
                </div>

                <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '16px' }}>Module Pricing (per job)</label>
                    
                    <TieredPricingCard 
                        title="Transcription" 
                        value={formData.module_rates?.transcription} 
                        onChange={(val) => setFormData({ ...formData, module_rates: { ...formData.module_rates, transcription: val } })} 
                    />
                    
                    <TieredPricingCard 
                        title="Subtitles" 
                        value={formData.module_rates?.subtitles} 
                        onChange={(val) => setFormData({ ...formData, module_rates: { ...formData.module_rates, subtitles: val } })} 
                    />
                    
                    <TieredPricingCard 
                        title="Metadata" 
                        value={formData.module_rates?.metadata} 
                        onChange={(val) => setFormData({ ...formData, module_rates: { ...formData.module_rates, metadata: val } })} 
                    />
                    
                    <TieredPricingCard 
                        title="Ad Breaks" 
                        value={formData.module_rates?.ad_breaks} 
                        onChange={(val) => setFormData({ ...formData, module_rates: { ...formData.module_rates, ad_breaks: val } })} 
                    />
                    
                    <TieredPricingCard 
                        title="Viral Highlights" 
                        value={formData.module_rates?.promo_breaks} 
                        onChange={(val) => setFormData({ ...formData, module_rates: { ...formData.module_rates, promo_breaks: val } })} 
                    />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ ...styles.buttonSecondary }}>Cancel</button>
                    <button onClick={() => onSave({
                        ...formData,
                        plan,
                        billing_type,
                        credits: isNaN(credits) ? 0 : credits,
                        provider_bal_openai: isNaN(provider_bal_openai) ? 0 : provider_bal_openai,
                        provider_bal_openrouter: isNaN(provider_bal_openrouter) ? 0 : provider_bal_openrouter,
                        provider_warn_threshold: isNaN(provider_warn_threshold) ? 2.5 : provider_warn_threshold,
                        description
                    })} style={{ ...styles.button }} disabled={!formData.name}>{client ? 'Save Changes' : 'Create Client'}</button>
                </div>
            </div>
        </div>
    );
}

function ConfigView({ clients, apiKeys, clientModels, availableModels, loading, onRefresh, onAddApiKey, onToggleApiKey, onDeleteApiKey, onSaveModel, clientCredentials, onSaveCredentials }: {
    clients: Client[];
    apiKeys: Record<number, any[]>;
    clientModels: Record<number, any[]>;
    availableModels: any[];
    loading: boolean;
    onRefresh: () => void;
    onAddApiKey: (clientId: number, provider: string, apiKey: string) => void;
    onToggleApiKey: (keyId: number, clientId: number) => void;
    onDeleteApiKey: (keyId: number, clientId: number) => void;
    onSaveModel: (clientUUID: string, models: any[]) => void;
    clientCredentials: Record<number, { supabase_url: string; supabase_anon_key: string }>;
    onSaveCredentials: (clientId: number, supabaseUrl: string, supabaseAnonKey: string) => void;
}) {
    const [selectedClient, setSelectedClient] = useState<number>(0);
    const [apiKeyForm, setApiKeyForm] = useState({ provider: 'openai', key: '' });
    const [showKeyForm, setShowKeyForm] = useState(false);
    const [credsForm, setCredsForm] = useState({ supabaseUrl: '', supabaseAnonKey: '' });
    const [showCredsForm, setShowCredsForm] = useState(false);
    const [credsSaving, setCredsSaving] = useState(false);
    const [credsMessage, setCredsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [modelSaving, setModelSaving] = useState(false);
    const [modelSaveMessage, setModelSaveMessage] = useState<string | null>(null);
    const [aiSettings, setAiSettings] = useState<any>(null);
    const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
    const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
    const [aiSettingsMessage, setAiSettingsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [balanceAlerts, setBalanceAlerts] = useState<any[]>([]);

    const fetchAiSettings = async (clientId: number) => {
        setAiSettingsLoading(true);
        setAiSettingsMessage(null);
        try {
            const res = await fetch(`/api/mgmt/clients/${clientId}/ai-settings`, {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setAiSettings(data.settings || data);
            } else {
                // If not found, use defaults
                setAiSettings({
                    ad_breaks: { target_frequency: 4 },
                    promo_breaks: { target_frequency: 6 },
                    metadata: { rating_country: 'India' },
                    global: { guidelines: 'Prefer ad breaks at natural scene transitions. Avoid breaks during emotional moments...' }
                });
            }
        } catch (err) {
            console.error('Failed to fetch AI settings', err);
        } finally {
            setAiSettingsLoading(false);
        }
    };

    const fetchBalanceAlerts = async () => {
        try {
            const res = await fetch('/api/mgmt/balance-alerts', { credentials: 'include' });
            if (res.ok) setBalanceAlerts(await res.json());
        } catch (err) {
            console.error('Failed to fetch balance alerts', err);
        }
    };

    const handleSaveAiSettings = async () => {
        if (!selectedClient || !aiSettings) return;
        setAiSettingsSaving(true);
        setAiSettingsMessage(null);
        try {
            const res = await fetch(`/api/mgmt/clients/${selectedClient}/ai-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(aiSettings)
            });
            if (res.ok) {
                setAiSettingsMessage({ type: 'success', text: 'AI Strategy saved!' });
                setTimeout(() => setAiSettingsMessage(null), 3000);
            } else {
                const data = await res.json();
                setAiSettingsMessage({ type: 'error', text: data.error || 'Failed to save' });
            }
        } catch (err) {
            setAiSettingsMessage({ type: 'error', text: 'Network error' });
        } finally {
            setAiSettingsSaving(false);
        }
    };

    const handleSaveCredentials = async () => {
        if (!credsForm.supabaseUrl || !credsForm.supabaseAnonKey) return;
        setCredsSaving(true);
        setCredsMessage(null);
        try {
            const res = await fetch(`/api/mgmt/clients/${selectedClient}/credentials`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ supabaseUrl: credsForm.supabaseUrl, supabaseAnonKey: credsForm.supabaseAnonKey })
            });
            const data = await res.json();
            if (res.ok) {
                setCredsMessage({ type: 'success', text: 'Credentials saved!' });
                onSaveCredentials(selectedClient, credsForm.supabaseUrl, credsForm.supabaseAnonKey);
                setTimeout(() => setShowCredsForm(false), 1000);
            } else {
                setCredsMessage({ type: 'error', text: data.error || 'Failed to save' });
            }
        } catch (err) {
            setCredsMessage({ type: 'error', text: 'Network error' });
        } finally {
            setCredsSaving(false);
        }
    };

    useEffect(() => {
        if (clients.length > 0 && selectedClient === 0) {
            setSelectedClient(clients[0].id);
        }
        if (selectedClient > 0) {
            fetchAiSettings(selectedClient);
            fetchBalanceAlerts();
        }
    }, [clients, selectedClient]);

    const keys = apiKeys[selectedClient] || [];
    const clientModelSettings = clientModels[selectedClient] || [];
    const client = clients.find(c => c.id === selectedClient);
    const creds = clientCredentials[selectedClient] || { supabase_url: '', supabase_anon_key: '' };

    // Get unique modules from available models
    const modules = [...new Set(availableModels.map((m: any) => m.module_id))];
    console.log('[ConfigView] modules:', modules);

    const getModelsForModule = (moduleId: string) => availableModels.filter((m: any) => m.module_id === moduleId);

    const getDefaultProvider = (moduleId: string) => {
        const moduleModels = getModelsForModule(moduleId);
        return moduleModels[0]?.provider || 'openrouter';
    };

    const getDefaultModel = (moduleId: string, provider: string) => {
        const moduleModels = getModelsForModule(moduleId).filter((m: any) => m.provider === provider);
        return moduleModels[0]?.model_id || '';
    };

    const getProviderForModule = (moduleId: string) => {
        const mod = clientModelSettings.find((m: any) => m.module_name === moduleId);
        return mod?.api_provider || getDefaultProvider(moduleId);
    };

    const getModelForModule = (moduleId: string) => {
        const mod = clientModelSettings.find((m: any) => m.module_name === moduleId);
        const defaultModel = getDefaultModel(moduleId, getProviderForModule(moduleId));
        return mod?.api_model || defaultModel;
    };

    // Local state for pending model changes (not saved until user clicks save)
    const [pendingModelChanges, setPendingModelChanges] = useState<Record<string, { provider: string, model: string }>>({});

    const getEffectiveProvider = (moduleId: string) => {
        return pendingModelChanges[moduleId]?.provider || getProviderForModule(moduleId);
    };

    const getEffectiveModel = (moduleId: string) => {
        return pendingModelChanges[moduleId]?.model || getModelForModule(moduleId);
    };

    const hasPendingChanges = Object.keys(pendingModelChanges).length > 0;

    const handleModelChange = (moduleId: string, provider: string, model: string) => {
        setPendingModelChanges(prev => ({
            ...prev,
            [moduleId]: { provider, model }
        }));
    };

    const handleSaveAllModels = async () => {
        if (!client || !client.client_uuid || Object.keys(pendingModelChanges).length === 0) return;

        const clientUUID = client.client_uuid;
        setModelSaving(true);
        setModelSaveMessage('Saving...');

        try {
            // Collect all modules to save simultaneously
            const allModelsToSave = modules.map((moduleId: string) => ({
                moduleName: moduleId,
                provider: getEffectiveProvider(moduleId),
                model: getEffectiveModel(moduleId)
            }));

            await onSaveModel(clientUUID, allModelsToSave);

            setPendingModelChanges({});
            setModelSaveMessage('Saved!');
            setTimeout(() => setModelSaveMessage(null), 2000);
        } catch (err) {
            setModelSaveMessage('Save failed');
            setTimeout(() => setModelSaveMessage(null), 2000);
        } finally {
            setModelSaving(false);
        }
    };

    const handleDiscardChanges = () => {
        setPendingModelChanges({});
    };

    return (
        <div>
            {balanceAlerts.length > 0 && (
                <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px' }}>
                    <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>⚠️ Low Balance Alerts</div>
                    {balanceAlerts.map((alert: any, i: number) => (
                        <div key={i} style={{ fontSize: '12px', color: '#ef4444' }}>
                            • {alert.client_name}: {alert.provider} balance is low (${alert.balance.toFixed(2)})
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                <select
                    value={client?.client_uuid || selectedClient}
                    onChange={(e) => {
                        const selectedUUID = e.target.value;
                        const selectedClientObj = clients.find(c => c.client_uuid === selectedUUID);
                        if (selectedClientObj) {
                            setSelectedClient(selectedClientObj.id);
                        }
                    }}
                    style={{ ...styles.input, width: '200px' }}
                >
                    {clients.map(c => <option key={c.id} value={c.client_uuid}>{c.name}</option>)}
                </select>
                <button onClick={onRefresh} style={{ ...styles.buttonSecondary }}>🔄 Refresh</button>
            </div>

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
            ) : client ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* API Keys Section */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>🔑 API Keys</h3>
                            <button
                                onClick={() => setShowKeyForm(!showKeyForm)}
                                style={{ ...styles.button, padding: '6px 12px', fontSize: '12px' }}
                            >
                                + Add Key
                            </button>
                        </div>

                        {showKeyForm && (
                            <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: '#9ca3af' }}>Provider</label>
                                    <select
                                        value={apiKeyForm.provider}
                                        onChange={(e) => setApiKeyForm({ ...apiKeyForm, provider: e.target.value })}
                                        style={{ ...styles.input, width: '100%', color: '#fff' }}
                                    >
                                        <option value="openai" style={{ backgroundColor: '#111118' }}>OpenAI (Whisper)</option>
                                        <option value="openrouter" style={{ backgroundColor: '#111118' }}>OpenRouter (Claude/GPT)</option>
                                    </select>
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: '#9ca3af' }}>API Key</label>
                                    <input
                                        type="password"
                                        value={apiKeyForm.key}
                                        onChange={(e) => setApiKeyForm({ ...apiKeyForm, key: e.target.value })}
                                        placeholder={apiKeyForm.provider === 'openai' ? 'sk-...' : 'sk-or-v1-...'}
                                        style={{ ...styles.input, width: '100%', color: '#fff' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        onClick={() => {
                                            onAddApiKey(selectedClient, apiKeyForm.provider, apiKeyForm.key);
                                            setApiKeyForm({ provider: 'openai', key: '' });
                                            setShowKeyForm(false);
                                            onRefresh();
                                        }}
                                        style={{ ...styles.button, fontSize: '12px' }}
                                        disabled={!apiKeyForm.key}
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => setShowKeyForm(false)}
                                        style={{ ...styles.buttonSecondary, fontSize: '12px' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {keys.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                    No API keys configured
                                </div>
                            ) : keys.map((key: any) => (
                                <div key={key.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                    <div>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            backgroundColor: key.provider === 'openai' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)',
                                            color: key.provider === 'openai' ? '#3b82f6' : '#a855f7',
                                            marginRight: '8px'
                                        }}>
                                            {key.provider.toUpperCase()}
                                        </span>
                                        <code style={{ fontSize: '12px', color: '#6b7280' }}>{key.api_key_prefix}</code>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <button
                                            onClick={() => onToggleApiKey(key.id, selectedClient)}
                                            style={{
                                                ...styles.buttonSecondary,
                                                fontSize: '10px',
                                                padding: '4px 8px',
                                                borderColor: key.is_active ? '#f59e0b' : '#10b981',
                                                color: key.is_active ? '#f59e0b' : '#10b981'
                                            }}
                                        >
                                            {key.is_active ? 'Deactivate' : 'Activate'}
                                        </button>
                                        <button
                                            onClick={() => onDeleteApiKey(key.id, selectedClient)}
                                            style={{
                                                ...styles.buttonSecondary,
                                                fontSize: '10px',
                                                padding: '4px 8px',
                                                borderColor: '#ef4444',
                                                color: '#ef4444'
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Supabase Credentials Section */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>🗄️ Client Supabase</h3>
                            {!showCredsForm && (
                                <button
                                    onClick={() => {
                                        setCredsForm({ supabaseUrl: creds.supabase_url || '', supabaseAnonKey: creds.supabase_anon_key || '' });
                                        setShowCredsForm(true);
                                    }}
                                    style={{ ...styles.button, padding: '6px 12px', fontSize: '12px' }}
                                >
                                    {creds.supabase_url ? 'Edit' : 'Configure'}
                                </button>
                            )}
                        </div>

                        {showCredsForm ? (
                            <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: '#9ca3af' }}>Supabase URL</label>
                                    <input
                                        type="text"
                                        value={credsForm.supabaseUrl}
                                        onChange={(e) => setCredsForm({ ...credsForm, supabaseUrl: e.target.value })}
                                        placeholder="https://xxx.supabase.co"
                                        style={{ ...styles.input, width: '100%' }}
                                    />
                                </div>
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: '#9ca3af' }}>Supabase Anon Key</label>
                                    <input
                                        type="text"
                                        value={credsForm.supabaseAnonKey}
                                        onChange={(e) => setCredsForm({ ...credsForm, supabaseAnonKey: e.target.value })}
                                        placeholder="eyJ..."
                                        style={{ ...styles.input, width: '100%' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button
                                        onClick={handleSaveCredentials}
                                        style={{ ...styles.button, fontSize: '12px' }}
                                        disabled={credsSaving || !credsForm.supabaseUrl || !credsForm.supabaseAnonKey}
                                    >
                                        {credsSaving ? 'Saving...' : 'Save Credentials'}
                                    </button>
                                    <button
                                        onClick={() => { setShowCredsForm(false); setCredsMessage(null); }}
                                        style={{ ...styles.buttonSecondary, fontSize: '12px' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                                {credsMessage && (
                                    <div style={{
                                        marginTop: '12px',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        backgroundColor: credsMessage.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                                        color: credsMessage.type === 'success' ? '#10b981' : '#ef4444'
                                    }}>
                                        {credsMessage.text}
                                    </div>
                                )}
                            </div>
                        ) : creds.supabase_url ? (
                            <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#10b981' }}>✓</span>
                                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#10b981' }}>Credentials Configured</span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>
                                    URL: {creds.supabase_url.substring(0, 40)}...
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                No Supabase credentials configured
                            </div>
                        )}
                    </div>

                    {/* AI Models Section */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>🤖 AI Models</h3>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {hasPendingChanges && (
                                    <button
                                        onClick={handleSaveAllModels}
                                        disabled={modelSaving}
                                        style={{ ...styles.button, padding: '6px 12px', fontSize: '11px', opacity: modelSaving ? 0.6 : 1 }}
                                    >
                                        {modelSaving ? '💾 Saving...' : '💾 Save'}
                                    </button>
                                )}
                                {modelSaveMessage && !hasPendingChanges && (
                                    <span style={{ fontSize: '12px', color: modelSaveMessage.includes('fail') ? '#ef4444' : '#22c55e' }}>
                                        {modelSaving ? '💾 Saving...' : '✅ ' + modelSaveMessage}
                                    </span>
                                )}
                                {!hasPendingChanges && !modelSaveMessage && (
                                    <span style={{ fontSize: '11px', color: '#6b7280' }}>No changes</span>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {modules.map((moduleId: string) => {
                                const currentProvider = getEffectiveProvider(moduleId);
                                const currentModel = getEffectiveModel(moduleId);
                                const moduleModels = getModelsForModule(moduleId);
                                const providers = [...new Set(moduleModels.map((m: any) => m.provider))];
                                const modelOptions = moduleModels.filter((m: any) => m.provider === currentProvider);
                                const isChanged = !!pendingModelChanges[moduleId];

                                const moduleNames: Record<string, string> = {
                                    transcription: 'Transcription',
                                    subtitles: 'Subtitles',
                                    metadata: 'Metadata',
                                    ad_breaks: 'Ad Breaks',
                                    promo_breaks: 'Viral Highlights',
                                    subtitle_translation: 'Subtitle Translation'
                                };

                                return (
                                    <div key={moduleId} style={{ padding: '12px', backgroundColor: isChanged ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: isChanged ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div>
                                                <div style={{ fontWeight: 500, fontSize: '13px' }}>{moduleNames[moduleId] || moduleId}</div>
                                            </div>
                                            {isChanged && (
                                                <span style={{ fontSize: '10px', color: '#f59e0b' }}>Changed</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                value={currentProvider}
                                                onChange={(e) => {
                                                    const newProvider = e.target.value;
                                                    const firstModel = moduleModels.find((m: any) => m.provider === newProvider)?.model_id || '';
                                                    handleModelChange(moduleId, newProvider, firstModel);
                                                }}
                                                style={{
                                                    ...styles.input,
                                                    width: '140px',
                                                    padding: '6px 8px',
                                                    fontSize: '11px',
                                                    color: '#fff',
                                                    backgroundColor: '#0a0a0f'
                                                }}
                                            >
                                                {providers.map((p: string) => (
                                                    <option key={p} value={p} style={{ backgroundColor: '#0a0a0f' }}>
                                                        {p === 'openai' ? 'OpenAI' : p === 'openrouter' ? 'OpenRouter' : p.toUpperCase()}
                                                    </option>
                                                ))}
                                            </select>
                                            <select
                                                value={currentModel}
                                                onChange={(e) => handleModelChange(moduleId, currentProvider, e.target.value)}
                                                style={{
                                                    ...styles.input,
                                                    flex: 1,
                                                    padding: '6px 8px',
                                                    fontSize: '11px',
                                                    color: '#fff',
                                                    backgroundColor: '#0a0a0f'
                                                }}
                                            >
                                                {modelOptions.map((m: any) => (
                                                    <option key={m.model_id} value={m.model_id} style={{ backgroundColor: '#0a0a0f' }}>
                                                        {m.display_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Bottom save/discard buttons */}
                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            {hasPendingChanges ? (
                                <>
                                    <button
                                        onClick={handleDiscardChanges}
                                        style={{ ...styles.buttonSecondary, padding: '8px 16px', fontSize: '12px' }}
                                    >
                                        Discard Changes
                                    </button>
                                    <button
                                        onClick={handleSaveAllModels}
                                        disabled={modelSaving}
                                        style={{ ...styles.button, padding: '8px 16px', fontSize: '12px', opacity: modelSaving ? 0.6 : 1 }}
                                    >
                                        {modelSaving ? '💾 Saving...' : '💾 Save All Model Settings'}
                                    </button>
                                </>
                            ) : null}
                        </div>
                    </div>

                    {/* AI Strategy Section */}
                    <div style={styles.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>🎯 AI Content Strategy</h3>
                            {aiSettings && (
                                <button
                                    onClick={handleSaveAiSettings}
                                    style={{ ...styles.button, padding: '6px 12px', fontSize: '12px' }}
                                    disabled={aiSettingsSaving}
                                >
                                    {aiSettingsSaving ? 'Saving...' : 'Save Strategy'}
                                </button>
                            )}
                        </div>

                        {aiSettingsLoading ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Loading strategy...</div>
                        ) : aiSettings ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <TieredValueEditor 
                                    label="Ad Break Target (Per Hour)"
                                    value={aiSettings.ad_breaks?.target_frequency}
                                    defaultValue={4}
                                    onChange={(val) => setAiSettings({
                                        ...aiSettings,
                                        ad_breaks: { ...aiSettings.ad_breaks, target_frequency: val }
                                    })}
                                />

                                <TieredValueEditor 
                                    label="Promo Highlight Target (Per Hour)"
                                    value={aiSettings.promo_breaks?.target_frequency}
                                    defaultValue={6}
                                    onChange={(val) => setAiSettings({
                                        ...aiSettings,
                                        promo_breaks: { ...aiSettings.promo_breaks, target_frequency: val }
                                    })}
                                />

                                <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>🎯 AI Behavior Guidelines</label>
                                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                                        Define how AI should behave for this client's content.
                                    </p>
                                    
                                    <textarea
                                        value={aiSettings.global?.guidelines || ''}
                                        onChange={(e) => setAiSettings({
                                            ...aiSettings,
                                            global: { ...aiSettings.global, guidelines: e.target.value }
                                        })}
                                        placeholder="Example: Prefer ad breaks at natural scene transitions. Avoid breaks during emotional moments. Ensure highlights represent the core narrative."
                                        style={{ 
                                            ...styles.input, 
                                            width: '100%',
                                            minHeight: '120px', 
                                            fontFamily: 'monospace',
                                            fontSize: '12px',
                                            lineHeight: '1.5',
                                            backgroundColor: 'rgba(0,0,0,0.2)'
                                        }}
                                    />
                                </div>

                                <div style={{ marginTop: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px', color: '#9ca3af' }}>Content Rating Standard (Country)</label>
                                    <select
                                        value={aiSettings.metadata?.rating_country || 'India'}
                                        onChange={(e) => setAiSettings({
                                            ...aiSettings,
                                            metadata: { ...aiSettings.metadata, rating_country: e.target.value }
                                        })}
                                        style={{ ...styles.input, width: '100%', color: '#fff', backgroundColor: '#0a0a0f' }}
                                    >
                                        <option value="India" style={{ backgroundColor: '#111118' }}>India (CBFC Standard)</option>
                                        <option value="Singapore" style={{ backgroundColor: '#111118' }}>Singapore (IMDA Standard)</option>
                                        <option value="US" style={{ backgroundColor: '#111118' }}>United States (MPAA/TVPG)</option>
                                        <option value="UK" style={{ backgroundColor: '#111118' }}>United Kingdom (BBFC)</option>
                                        <option value="Australia" style={{ backgroundColor: '#111118' }}>Australia (ACMA)</option>
                                    </select>
                                    <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '6px' }}>
                                        AI will generate content ratings and censorship advice based on this country's standards.
                                    </p>
                                </div>

                                {aiSettingsMessage && (
                                    <div style={{
                                        padding: '10px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        backgroundColor: aiSettingsMessage.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                                        color: aiSettingsMessage.type === 'success' ? '#10b981' : '#ef4444',
                                        border: `1px solid ${aiSettingsMessage.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                                    }}>
                                        {aiSettingsMessage.text}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Select a client to manage strategy</div>
                        )}
                    </div>
                </div>
            ) : null}

            {clients.length === 0 && !loading && (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                    No clients found. Create a client first.
                </div>
            )}
        </div>
    );
}

function SettingsView({ availableModels, authFetch, onRefresh }: {
    availableModels: any[];
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
    onRefresh: () => void;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newModel, setNewModel] = useState({ module_id: 'subtitles', provider: 'openrouter', model_id: '', display_name: '' });
    const [loading, setLoading] = useState(false);

    const modules = [...new Set(availableModels.map((m: any) => m.module_id))];
    
    // Get unique providers from available models
    const providers = [...new Set(availableModels.map((m: any) => m.provider))];
    
    // Get models for the selected provider
    const providerModels = newModel.provider 
        ? availableModels.filter((m: any) => m.provider === newModel.provider)
        : [];

    const moduleNames: Record<string, string> = {
        transcription: 'Transcription',
        subtitles: 'Subtitles',
        metadata: 'Metadata',
        ad_breaks: 'Ad Breaks',
        promo_breaks: 'Viral Highlights',
        subtitle_translation: 'Subtitle Translation'
    };

    const VALID_MODULES = Object.keys(moduleNames);

    const handleAddModel = async () => {
        if (!newModel.model_id || !newModel.display_name) return;
        setLoading(true);
        try {
            await authFetch('/api/mgmt/models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newModel)
            });
            setNewModel({ module_id: 'subtitles', provider: 'openrouter', model_id: '', display_name: '' });
            setShowAddForm(false);
            onRefresh();
        } catch (err) {
            console.error('Failed to add model', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id: number) => {
        await authFetch(`/api/mgmt/models/${id}/toggle`, { method: 'POST' });
        onRefresh();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this model?')) return;
        await authFetch(`/api/mgmt/models/${id}`, { method: 'DELETE' });
        onRefresh();
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 600 }}>AI Models Configuration</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        onClick={async () => {
                            if (confirm('Fetch latest models from OpenRouter? This will add new models to the list.')) {
                                try {
                                    const res = await authFetch('/api/mgmt/available-models/sync-openrouter', { method: 'POST' });
                                    const data = await res.json();
                                    alert(data.message || `Synced ${data.added} models`);
                                    onRefresh();
                                } catch (err) {
                                    alert('Failed to sync models');
                                }
                            }
                        }} 
                        style={{ ...styles.button, backgroundColor: '#7c3aed' }}
                    >
                        🔄 Sync from OpenRouter
                    </button>
                    <button onClick={() => setShowAddForm(!showAddForm)} style={{ ...styles.button }}>
                        + Add Model
                    </button>
                </div>
            </div>

            {showAddForm && (
                <div style={{ ...styles.card, marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Add New Model</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#9ca3af' }}>Module</label>
                            <select
                                value={newModel.module_id}
                                onChange={(e) => setNewModel({ ...newModel, module_id: e.target.value })}
                                style={{ ...styles.input, width: '100%', color: '#fff' }}
                            >
                                {VALID_MODULES.map(m => <option key={m} value={m} style={{ backgroundColor: '#0a0a0f' }}>{moduleNames[m] || m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#9ca3af' }}>Provider</label>
                            <select
                                value={newModel.provider}
                                onChange={(e) => setNewModel({ ...newModel, provider: e.target.value, model_id: '', display_name: '' })}
                                style={{ ...styles.input, width: '100%', color: '#fff' }}
                            >
                                <option value="openai" style={{ backgroundColor: '#0a0a0f' }}>OpenAI</option>
                                <option value="openrouter" style={{ backgroundColor: '#0a0a0f' }}>OpenRouter</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#9ca3af' }}>Model ID</label>
                            {providerModels.length > 0 ? (
                                <select
                                    value={newModel.model_id}
                                    onChange={(e) => {
                                        const selected = providerModels.find((m: any) => m.model_id === e.target.value);
                                        setNewModel({ ...newModel, model_id: e.target.value, display_name: selected?.display_name || '' });
                                    }}
                                    style={{ ...styles.input, width: '100%', color: '#fff' }}
                                >
                                    <option value="" style={{ backgroundColor: '#0a0a0f' }}>Select a model...</option>
                                    {providerModels.map((m: any) => (
                                        <option key={m.model_id} value={m.model_id} style={{ backgroundColor: '#0a0a0f' }}>
                                            {m.display_name} ({m.model_id})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={newModel.model_id}
                                    onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value })}
                                    placeholder="e.g. anthropic/claude-3.5-sonnet"
                                    style={{ ...styles.input, width: '100%', color: '#fff' }}
                                />
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#9ca3af' }}>Display Name</label>
                            <input
                                type="text"
                                value={newModel.display_name}
                                onChange={(e) => setNewModel({ ...newModel, display_name: e.target.value })}
                                placeholder="e.g. Claude 3.5 Sonnet"
                                style={{ ...styles.input, width: '100%', color: '#fff' }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={handleAddModel} disabled={loading || !newModel.model_id || !newModel.display_name} style={{ ...styles.button }}>
                            {loading ? 'Adding...' : 'Add Model'}
                        </button>
                        <button onClick={() => setShowAddForm(false)} style={{ ...styles.buttonSecondary }}>Cancel</button>
                    </div>
                </div>
            )}

            <div style={styles.card}>
                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Module</th>
                            <th style={styles.th}>Provider</th>
                            <th style={styles.th}>Model ID</th>
                            <th style={styles.th}>Display Name</th>
                            <th style={styles.th}>Status</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {availableModels.map((model: any) => (
                            <tr key={model.id}>
                                <td style={styles.td}>{moduleNames[model.module_id] || model.module_id}</td>
                                <td style={styles.td}>
                                    <span style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        backgroundColor: model.provider === 'openai' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)',
                                        color: model.provider === 'openai' ? '#3b82f6' : '#a855f7'
                                    }}>
                                        {model.provider.toUpperCase()}
                                    </span>
                                </td>
                                <td style={styles.td}><code style={{ fontSize: '11px' }}>{model.model_id}</code></td>
                                <td style={styles.td}>{model.display_name}</td>
                                <td style={styles.td}>
                                    <span style={{
                                        ...styles.badge,
                                        backgroundColor: model.is_active ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                                        color: model.is_active ? '#10b981' : '#f59e0b'
                                    }}>
                                        {model.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={styles.td}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleToggle(model.id)} style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px' }}>
                                            {model.is_active ? 'Disable' : 'Enable'}
                                        </button>
                                        <button onClick={() => handleDelete(model.id)} style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#ef4444' }}>
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ApiLogsView({ logs, loading, clients, onRefresh }: {
    logs: any[];
    loading: boolean;
    clients: Client[];
    onRefresh: () => void;
}) {
    const [filterClient, setFilterClient] = useState<number | 'all'>('all');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterDirection, setFilterDirection] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showProCosts, setShowProCosts] = useState(false);

    const filteredLogs = useMemo(() => {
        const filtered = logs.filter(l => {
            if (filterClient !== 'all' && l.client_id !== filterClient) return false;
            if (filterProvider !== 'all' && (l.provider || '') !== filterProvider) return false;
            if (filterDirection !== 'all' && l.direction !== filterDirection) return false;
            if (searchQuery) {
                const searchLower = searchQuery.toLowerCase();
                return (
                    (l.request_id || '').toLowerCase().includes(searchLower) ||
                    (l.endpoint || '').toLowerCase().includes(searchLower) ||
                    (l.client_name || '').toLowerCase().includes(searchLower) ||
                    (l.model || '').toLowerCase().includes(searchLower)
                );
            }
            return true;
        });
        
        // Ensure newest logs are always at the top
        return filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [logs, filterClient, filterProvider, filterDirection, searchQuery]);

    const stats = useMemo(() => ({
        total: logs.length,
        errors: logs.filter(l => (l.response_status || 0) >= 400 || l.error_message).length,
        success: logs.filter(l => (l.response_status || 0) < 400 && !l.error_message).length,
    }), [logs]);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const formatJSON = (json: any) => {
        if (!json) return 'None';
        try {
            const parsed = typeof json === 'string' ? JSON.parse(json) : json;
            return JSON.stringify(parsed, null, 2);
        } catch (e) {
            return String(json);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
            {/* Header Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#6b7280' }} />
                    <input
                        type="text"
                        placeholder="Search by Request ID, Model, or Client..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ ...styles.input, paddingLeft: '40px' }}
                    />
                </div>
                <select
                    value={filterClient}
                    onChange={(e) => setFilterClient(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    style={{ ...styles.input, width: '150px' }}
                >
                    <option value="all">All Clients</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select
                    value={filterProvider}
                    onChange={(e) => setFilterProvider(e.target.value)}
                    style={{ ...styles.input, width: '140px' }}
                >
                    <option value="all">Providers</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="whisper">Whisper</option>
                </select>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {['all', 'incoming', 'outgoing'].map(dir => (
                        <button
                            key={dir}
                            onClick={() => setFilterDirection(dir)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '11px',
                                fontWeight: 600,
                                textTransform: 'capitalize',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                backgroundColor: filterDirection === dir ? 'rgba(16,185,129,0.1)' : 'transparent',
                                color: filterDirection === dir ? '#10b981' : '#6b7280'
                            }}
                        >
                            {dir}
                        </button>
                    ))}
                </div>
                <button onClick={onRefresh} style={{ ...styles.buttonSecondary, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
                <button 
                    onClick={() => setShowProCosts(!showProCosts)} 
                    style={{ 
                        ...styles.buttonSecondary, 
                        borderColor: showProCosts ? '#10b981' : 'rgba(255,255,255,0.2)',
                        color: showProCosts ? '#10b981' : '#6b7280',
                        fontSize: '11px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}
                >
                    {showProCosts ? <Shield size={12} /> : <Shield size={12} opacity={0.5} />}
                    {showProCosts ? 'Hide Pro Costs' : 'Show Pro Costs'}
                </button>
            </div>

            {/* Main Table */}
            <div style={{ ...styles.card, flex: 1, overflow: 'auto', padding: 0 }}>
                {loading ? (
                    <div style={{ padding: '80px', textAlign: 'center', color: '#6b7280' }}>
                        <RefreshCcw size={48} className="animate-spin" style={{ opacity: 0.1, marginBottom: '16px' }} />
                        <div>Synchronizing audit logs...</div>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div style={{ padding: '80px', textAlign: 'center', color: '#6b7280' }}>
                        <Terminal size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                        <div style={{ fontSize: '14px', fontWeight: 600 }}>No audit trails matched your filters</div>
                    </div>
                ) : (
                    <table style={{ ...styles.table, borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#111118' }}>
                            <tr>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Activity / Timeline</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Request ID Tracking</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Parent Context</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Client / Module</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Provider / Status</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Cost (Billed)</th>
                                {showProCosts && <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#10b981' }}>Expense (Pro)</th>}
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Performance</th>
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)', width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => {
                                const isError = (log.response_status || 0) >= 400 || log.error_message;
                                return (
                                    <tr 
                                        key={log.id} 
                                        onClick={() => setSelectedLog(log)}
                                        style={{ 
                                            cursor: 'pointer', 
                                            backgroundColor: selectedLog?.id === log.id ? 'rgba(16,185,129,0.05)' : 'transparent',
                                            transition: 'background-color 0.2s'
                                        }}
                                        className="hover:bg-white/[0.02]"
                                    >
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                {(() => {
                                                    const date = new Date(log.created_at.includes('Z') ? log.created_at : log.created_at + 'Z');
                                                    return (
                                                        <>
                                                            <span style={{ fontWeight: 600, color: 'white' }}>{date.toLocaleTimeString([], { hour12: false })}</span>
                                                            <span style={{ fontSize: '10px', color: '#6b7280' }}>{date.toLocaleDateString()}</span>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Zap size={12} color="#f59e0b" />
                                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#f59e0b' }}>Job: {log.parent_job_id ? log.parent_job_id.substring(0, 8) + '...' : 'DIRECT_API'}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Database size={12} color="#10b981" />
                                                    <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>{log.request_id ? log.request_id.substring(0, 8) + '...' : 'ANALYSIS'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{log.client_name}</span>
                                                <span style={{ fontSize: '11px', color: '#6b7280' }}>{log.endpoint?.replace('/api/analyze', 'AI_ANALYSIS')}</span>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '10px',
                                                    fontWeight: 700,
                                                    backgroundColor: log.provider === 'openai' ? 'rgba(59,130,246,0.1)' : 'rgba(168,85,247,0.1)',
                                                    color: log.provider === 'openai' ? '#3b82f6' : '#a855f7',
                                                    border: `1px solid ${log.provider === 'openai' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)'}`
                                                }}>
                                                    {log.provider?.toUpperCase()}
                                                </span>
                                                <div style={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    gap: '6px', 
                                                    color: isError ? '#ef4444' : '#10b981',
                                                    fontWeight: 600,
                                                    fontSize: '13px'
                                                }}>
                                                    {isError ? <XCircle size={14} /> : <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />}
                                                    {log.response_status || '200'}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#white' }}>
                                                    ${log.billed_cost ? log.billed_cost.toFixed(3) : '0.000'}
                                                </span>
                                                <span style={{ fontSize: '10px', color: '#6b7280' }}>Revenue</span>
                                            </div>
                                        </td>
                                        {showProCosts && (
                                            <td style={styles.td}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>
                                                        ${log.cost_usd ? log.cost_usd.toFixed(4) : '0.0000'}
                                                    </span>
                                                    <span style={{ fontSize: '10px', color: '#059669' }}>Expense</span>
                                                </div>
                                            </td>
                                        )}
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={12} color="#6b7280" />
                                                <span style={{ fontSize: '12px' }}>{log.latency_ms || '-'}ms</span>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <ChevronRight size={16} color="#4b5563" />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Professional Inspector (Slide-out) */}
            {selectedLog && (
                <div style={{
                    position: 'fixed',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '600px',
                    backgroundColor: '#0d0d12',
                    borderLeft: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '-20px 0 50px rgba(0,0,0,0.5)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    <div style={{ padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Database size={20} color="#10b981" />
                            </div>
                            <div>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>API Audit Inspector</h3>
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>Internal ID: {selectedLog.id}</div>
                            </div>
                        </div>
                        <button 
                            onClick={() => setSelectedLog(null)}
                            style={{ background: 'transparent', border: 'none', color: '#4b5563', cursor: 'pointer' }}
                        >
                            <XCircle size={24} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                        {/* Status Summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                            <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Request ID</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: '#10b981' }}>
                                        {selectedLog.request_id || 'NOT_LOGGED'}
                                    </span>
                                    {selectedLog.request_id && (
                                        <button 
                                            onClick={() => handleCopy(selectedLog.request_id, 'reqid')}
                                            style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer' }}
                                        >
                                            {copiedId === 'reqid' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Model / Provider</div>
                                <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedLog.model} ({selectedLog.provider})</div>
                            </div>
                        </div>

                        {/* Error Message */}
                        {selectedLog.error_message && (
                            <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: 'rgba(239,68,68,0.05)', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444', marginBottom: '8px', fontSize: '13px', fontWeight: 700 }}>
                                    <AlertTriangle size={16} /> Diagnostic Error
                                </div>
                                <div style={{ fontSize: '13px', color: '#ef4444', lineHeight: 1.5, fontFamily: 'monospace' }}>
                                    {selectedLog.error_message}
                                </div>
                            </div>
                        )}

                        {/* Payload Inspection */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                                        <Zap size={14} /> Request Payload (Prompts)
                                    </div>
                                    <button 
                                        onClick={() => handleCopy(formatJSON(selectedLog.request_body), 'reqbody')}
                                        style={{ fontSize: '10px', color: '#10b981', background: 'transparent', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        {copiedId === 'reqbody' ? 'COPIED!' : 'COPY'}
                                    </button>
                                </div>
                                <pre style={{ 
                                    margin: 0,
                                    padding: '16px', 
                                    backgroundColor: '#000000', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    color: '#d1d5db', 
                                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    overflow: 'auto',
                                    maxHeight: '400px'
                                }}>
                                    {formatJSON(selectedLog.request_body)}
                                </pre>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                                        <Receipt size={14} /> AI Context Response
                                    </div>
                                    <button 
                                        onClick={() => handleCopy(formatJSON(selectedLog.response_body), 'resbody')}
                                        style={{ fontSize: '10px', color: '#10b981', background: 'transparent', border: 'none', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        {copiedId === 'resbody' ? 'COPIED!' : 'COPY'}
                                    </button>
                                </div>
                                <pre style={{ 
                                    margin: 0,
                                    padding: '16px', 
                                    backgroundColor: '#000000', 
                                    borderRadius: '12px', 
                                    fontSize: '11px', 
                                    color: '#10b981', 
                                    fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                                    border: '1px solid rgba(16,185,129,0.1)',
                                    overflow: 'auto',
                                    maxHeight: '400px'
                                }}>
                                    {formatJSON(selectedLog.response_body)}
                                </pre>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
                        <button 
                            onClick={() => setSelectedLog(null)}
                            style={{ ...styles.button, width: '100%', justifyContent: 'center', padding: '14px' }}
                        >
                            CLOSE INSPECTOR
                        </button>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                .hover\\:bg-white\\/\\[0\\.02\\]:hover {
                    background-color: rgba(255, 255, 255, 0.02);
                }
            `}</style>
        </div>
    );
}

function SmtpSettingsView({ authFetch }: { authFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
    const [settings, setSettings] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testEmail, setTestEmail] = useState('');
    const [showTestModal, setShowTestModal] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form state
    const [host, setHost] = useState('');
    const [port, setPort] = useState('587');
    const [secure, setSecure] = useState(false);
    const [authType, setAuthType] = useState('normal');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [hasPassword, setHasPassword] = useState(false);
    const [fromEmail, setFromEmail] = useState('');
    const [fromName, setFromName] = useState('Cuepoint Support');
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const res = await authFetch('/api/mgmt/smtp/settings');
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
                if (data) {
                    setHost(data.host || '');
                    setPort(String(data.port || 587));
                    setSecure(!!data.secure);
                    setAuthType(data.auth_type || 'normal');
                    setUsername(data.username || '');
                    setHasPassword(!!data.has_password);
                    setFromEmail(data.from_email || '');
                    setFromName(data.from_name || 'Cuepoint Support');
                    setIsActive(!!data.is_active);
                }
            }
        } catch (err) {
            console.error('Failed to load SMTP settings', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/smtp/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host,
                    port: parseInt(port),
                    secure,
                    auth_type: authType,
                    username: username || null,
                    password: password || null,
                    from_email: fromEmail,
                    from_name: fromName,
                    is_active: isActive
                })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'SMTP settings saved successfully' });
                setPassword('');
                loadSettings();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        if (!testEmail) return;
        setTesting(true);
        setMessage(null);
        try {
            // First save current settings
            await authFetch('/api/mgmt/smtp/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host,
                    port: parseInt(port),
                    secure,
                    auth_type: authType,
                    username: username || null,
                    password: password || null,
                    from_email: fromEmail,
                    from_name: fromName,
                    is_active: isActive
                })
            });

            const res = await authFetch('/api/mgmt/smtp/send-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host,
                    port: parseInt(port),
                    secure,
                    auth_type: authType,
                    username,
                    password,
                    from_email: fromEmail,
                    test_email: testEmail
                })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Test email sent successfully!' });
                setShowTestModal(false);
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to send test email' });
            }
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading SMTP settings...</div>;
    }

    return (
        <div>
            {message && (
                <div style={{
                    padding: '12px 16px',
                    marginBottom: '20px',
                    borderRadius: '10px',
                    backgroundColor: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    color: message.type === 'success' ? '#10b981' : '#ef4444',
                    fontSize: '14px'
                }}>
                    {message.text}
                </div>
            )}

            <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>SMTP Configuration</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280' }}>Configure email server for notifications and alerts</p>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#9ca3af' }}>
                            <input
                                type="checkbox"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                                style={{ width: '18px', height: '18px' }}
                            />
                            Enable SMTP
                        </label>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SMTP Host</label>
                        <input
                            type="text"
                            placeholder="smtp.example.com"
                            value={host}
                            onChange={(e) => setHost(e.target.value)}
                            style={styles.input}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Port</label>
                        <input
                            type="number"
                            placeholder="587"
                            value={port}
                            onChange={(e) => setPort(e.target.value)}
                            style={styles.input}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#9ca3af' }}>
                        <input
                            type="checkbox"
                            checked={secure}
                            onChange={(e) => setSecure(e.target.checked)}
                            style={{ width: '18px', height: '18px' }}
                        />
                        Use TLS/SSL (Secure)
                    </label>
                    <select
                        value={authType}
                        onChange={(e) => setAuthType(e.target.value)}
                        style={{ ...styles.input, width: 'auto' }}
                    >
                        <option value="normal">Authentication: Normal</option>
                        <option value="none">Authentication: None</option>
                    </select>
                </div>

                {authType === 'normal' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</label>
                            <input
                                type="text"
                                placeholder="user@example.com"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                style={styles.input}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Password {hasPassword && <span style={{ color: '#10b981', fontSize: '10px' }}>(Leave blank to keep current)</span>}
                            </label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={styles.input}
                            />
                        </div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From Email</label>
                        <input
                            type="email"
                            placeholder="support@cuepoint.com"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            style={styles.input}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>From Name</label>
                        <input
                            type="text"
                            placeholder="Cuepoint Support"
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            style={styles.input}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={handleSave} disabled={saving} style={{ ...styles.button, opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving...' : '💾 Save Settings'}
                    </button>
                    <button onClick={() => setShowTestModal(true)} style={styles.buttonSecondary}>
                        ✉️ Send Test Email
                    </button>
                </div>
            </div>

            {showTestModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{ backgroundColor: '#111118', padding: '24px', borderRadius: '16px', width: '400px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Send Test Email</h3>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>Recipient Email</label>
                            <input
                                type="email"
                                placeholder="test@example.com"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                style={{ ...styles.input, width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowTestModal(false)} style={styles.buttonSecondary}>Cancel</button>
                            <button onClick={handleTest} disabled={testing || !testEmail} style={{ ...styles.button, opacity: testing ? 0.7 : 1 }}>
                                {testing ? 'Sending...' : 'Send'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function AiJobsView({ authFetch, clients }: { authFetch: (url: string, options?: RequestInit) => Promise<Response>, clients: any[] }) {
    const [items, setItems] = useState<any[]>([]);
    const [stats, setStats] = useState<any>({ processingCount: 0, completedToday: 0, failedCount: 0, totalCount: 0 });
    const [loading, setLoading] = useState(false);
    const [filter, setFilter] = useState('all');
    const [clientFilter, setClientFilter] = useState('all');
    const [expandedJob, setExpandedJob] = useState<string | null>(null);
    const [jobLogs, setJobLogs] = useState<any[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [showProviderCosts, setShowProviderCosts] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const statusParam = filter !== 'all' ? `status=${filter}` : '';
            const clientParam = clientFilter !== 'all' ? `clientId=${clientFilter}` : '';
            const query = [statusParam, clientParam].filter(Boolean).join('&');
            const url = query ? `/api/mgmt/ai-queue?${query}` : '/api/mgmt/ai-queue';
            const statsUrl = clientParam ? `/api/mgmt/ai-queue/stats?${clientParam}` : '/api/mgmt/ai-queue/stats';

            const [itemsRes, statsRes] = await Promise.all([
                authFetch(url),
                authFetch(statsUrl)
            ]);
            if (itemsRes.ok) setItems(await itemsRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
        } catch (err) {
            console.error('Failed to load AI jobs', err);
        } finally {
            setLoading(false);
        }
    };

    const loadJobLogs = async (jobId: string) => {
        setLogsLoading(true);
        try {
            const res = await authFetch(`/api/mgmt/logs?parentJobId=${jobId}`);
            if (res.ok) setJobLogs(await res.json());
        } catch (err) {
            console.error('Failed to load job logs', err);
        } finally {
            setLogsLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this AI job record?')) return;
        await authFetch(`/api/mgmt/ai-queue/${id}`, { method: 'DELETE' });
        load();
    };

    const handleRetry = async (id: string) => {
        const res = await authFetch(`/api/mgmt/ai-queue/${id}/retry`, { method: 'POST' });
        if (res.ok) {
            alert('Job processing restarted');
            load();
        } else {
            const data = await res.json();
            alert('Failed to restart job: ' + (data.error || 'Unknown error'));
        }
    };

    useEffect(() => { load(); }, [filter, clientFilter]);

    const statusColor = (s: string) => {
        if (s === 'completed') return { bg: 'rgba(16,185,129,0.2)', text: '#10b981' };
        if (s === 'processing') return { bg: 'rgba(59,130,246,0.2)', text: '#3b82f6' };
        if (s === 'error') return { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' };
        if (s === 'partial') return { bg: 'rgba(245,158,11,0.2)', text: '#f59e0b' };
        return { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' };
    };

    return (
        <div>
            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Jobs', value: stats.totalCount, icon: '📋', color: '#6b7280' },
                    { label: 'Processing Now', value: stats.processingCount, icon: '⚙️', color: '#3b82f6' },
                    { label: 'Completed Today', value: stats.completedToday, icon: '✅', color: '#10b981' },
                    { label: 'Failed / Partial', value: stats.failedCount, icon: '⚠️', color: '#ef4444' },
                ].map(s => (
                    <div key={s.label} style={styles.statCard}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>{s.icon}</div>
                        <div style={{ fontSize: '28px', fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div style={{ ...styles.card, padding: '16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'processing', label: 'Processing' },
                        { id: 'completed', label: 'Completed' },
                        { id: 'error', label: 'Errors' },
                        { id: 'partial', label: 'Partial' }
                    ].map(f => (
                        <button 
                            key={f.id}
                            onClick={() => setFilter(f.id)} 
                            style={{
                                ...styles.filterBtn,
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 16px',
                                backgroundColor: filter === f.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                                color: filter === f.id ? '#10b981' : '#9ca3af',
                                boxShadow: filter === f.id ? '0 4px 12px rgba(16,185,129,0.1)' : 'none',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                fontWeight: filter === f.id ? 600 : 500
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                        <input 
                            type="checkbox" 
                            id="showProviderCosts" 
                            checked={showProviderCosts} 
                            onChange={(e) => setShowProviderCosts(e.target.checked)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                        />
                        <label htmlFor="showProviderCosts" style={{ fontSize: '11px', color: '#9ca3af', cursor: 'pointer', fontWeight: 600 }}>SHOW PROVIDER COSTS</label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 800, letterSpacing: '0.05em' }}>FILTER BY CLIENT:</label>
                        <select 
                            value={clientFilter} 
                            onChange={(e) => setClientFilter(e.target.value)}
                            style={{ 
                                ...styles.input, 
                                width: '180px', 
                                backgroundColor: 'rgba(255,255,255,0.02)', 
                                border: '1px solid rgba(255,255,255,0.1)',
                                marginBottom: 0,
                                fontSize: '12px',
                                padding: '6px 10px',
                                color: '#fff'
                            }}
                        >
                            <option value="all" style={{ backgroundColor: '#111118', color: '#fff' }}>All Clients</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id} style={{ backgroundColor: '#111118', color: '#fff' }}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={load} style={{ ...styles.buttonSecondary, padding: '8px 16px', gap: '8px', fontSize: '12px' }}>
                        🔄 {loading ? '...' : 'REFRESH'}
                    </button>
                </div>
            </div>

            <div style={styles.card}>
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🤖</div>
                        <p>No AI jobs found {filter !== 'all' ? `with status "${filter}"` : ''}</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Submitted</th>
                                    <th style={styles.th}>Client</th>
                                    <th style={styles.th}>Local Job ID</th>
                                    <th style={styles.th}>Modules</th>
                                    <th style={styles.th}>Status</th>
                                    <th style={styles.th}>Billed (USD)</th>
                                    {showProviderCosts && <th style={{ ...styles.th, color: '#f59e0b' }}>Provider (USD)</th>}
                                    <th style={styles.th}>Error</th>
                                    <th style={styles.th}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => {
                                    const sc = statusColor(item.status);
                                    const modules: string[] = (() => {
                                        try { return JSON.parse(item.modules_requested || '[]'); } catch { return []; }
                                    })();
                                    return (
                                        <>
                                            <tr 
                                                key={item.id}
                                                style={{ 
                                                    cursor: 'pointer',
                                                    backgroundColor: expandedJob === item.id ? 'rgba(59,130,246,0.05)' : 'transparent'
                                                }}
                                            >
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>
                                                        {new Date(item.created_at.includes('Z') ? item.created_at : item.created_at + 'Z').toLocaleString()}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.client_name || `#${item.client_id}`}</div>
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.local_job_id || item.id}>
                                                        {item.local_job_id || item.id}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                        {modules.map((m: string) => (
                                                            <span key={m} style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', backgroundColor: 'rgba(139,92,246,0.2)', color: '#8b5cf6' }}>
                                                                {m}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.text }}>
                                                        {item.status}
                                                    </span>
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
                                                        {item.total_cost_usd != null ? `$${Number(item.total_cost_usd).toFixed(4)}` : '-'}
                                                    </div>
                                                </td>
                                                {showProviderCosts && (
                                                    <td style={styles.td}>
                                                        <div style={{ fontSize: '13px', color: '#f59e0b' }}>
                                                            {item.provider_cost_usd != null ? `$${Number(item.provider_cost_usd).toFixed(4)}` : '-'}
                                                        </div>
                                                    </td>
                                                )}
                                                <td style={styles.td}>
                                                    {item.error_message ? (
                                                        <div style={{ fontSize: '11px', color: '#ef4444', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.error_message}>
                                                            {item.error_message}
                                                        </div>
                                                    ) : <span style={{ color: '#374151' }}>—</span>}
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button 
                                                            onClick={() => {
                                                                if (expandedJob === item.id) {
                                                                    setExpandedJob(null);
                                                                } else {
                                                                    setExpandedJob(item.id);
                                                                    loadJobLogs(item.id);
                                                                }
                                                            }} 
                                                            style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#3b82f6', borderColor: '#3b82f6' }}
                                                        >
                                                            {expandedJob === item.id ? '🔼 Hide' : '🔍 Details'}
                                                        </button>
                                                        <button onClick={() => handleDelete(item.id)} style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}>
                                                            🗑️ Delete
                                                        </button>
                                                        {item.status !== 'processing' && (
                                                            <button 
                                                                onClick={() => handleRetry(item.id)} 
                                                                style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#10b981', borderColor: '#10b981' }}
                                                                title="Rerun failed or skipped modules"
                                                            >
                                                                🔄 Rerun
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedJob === item.id && (
                                                <tr key={`${item.id}-detail`} style={{ backgroundColor: 'rgba(59,130,246,0.03)' }}>
                                                    <td colSpan={showProviderCosts ? 10 : 9} style={{ padding: '0 24px 24px 24px' }}>
                                                        <div style={{ padding: '16px', border: '1px solid rgba(59,130,246,0.2)', borderTop: 'none', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                                                            <h4 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '12px' }}>Provider API Trace (Child Requests)</h4>
                                                            {logsLoading ? (
                                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>Loading breadcrumbs...</div>
                                                            ) : jobLogs.length === 0 ? (
                                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>No child requests found for this job ID.</div>
                                                            ) : (
                                                                <>
                                                                    {/* Simple Billing Summary */}
                                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.1)' }}>
                                                                        <div style={{ width: '100%', fontSize: '10px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Billing Summary</div>
                                                                        {(() => {
                                                                            const totals: Record<string, number> = {};
                                                                            jobLogs.forEach(l => {
                                                                                const name = l.endpoint?.includes('transcription') ? 'Transcription' :
                                                                                           l.endpoint?.includes('subtitles') ? 'Subtitles' :
                                                                                           l.endpoint?.split('/').pop() || 'Other';
                                                                                totals[name] = (totals[name] || 0) + (l.billed_cost || 0);
                                                                            });
                                                                            return Object.entries(totals).map(([name, cost]) => (
                                                                                <div key={name} style={{ padding: '4px 10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '11px' }}>
                                                                                    <span style={{ color: '#9ca3af' }}>{name}:</span> <span style={{ fontWeight: 700, color: '#fff' }}>${cost.toFixed(2)}</span>
                                                                                </div>
                                                                            ));
                                                                        })()}
                                                                        <div style={{ padding: '4px 10px', backgroundColor: 'rgba(16,185,129,0.2)', borderRadius: '6px', fontSize: '11px', marginLeft: 'auto' }}>
                                                                           <span style={{ color: '#fff', fontWeight: 800 }}>Total: ${jobLogs.reduce((s, l) => s + (l.billed_cost || 0), 0).toFixed(2)}</span>
                                                                        </div>
                                                                    </div>

                                                                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Time</th>
                                                                                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Module / Service</th>
                                                                                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Model</th>
                                                                                <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Status</th>
                                                                                <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Billed</th>
                                                                                {showProviderCosts && <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f59e0b' }}>Provider Cost</th>}
                                                                                <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Detail</th>
                                                                            </tr>
                                                                        </thead>
                                                                    <tbody>
                                                                        {jobLogs.map(log => (
                                                                            <tr key={log.id}>
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                                    {new Date(log.created_at.includes('Z') ? log.created_at : log.created_at + 'Z').toLocaleTimeString([], { hour12: false })}
                                                                                </td>
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                                    {(() => {
                                                                                        const ep = log.endpoint || '';
                                                                                        if (ep.includes('subtitle_translation')) return <span style={{ color: '#3b82f6' }}>{ep.split('/').pop()}</span>;
                                                                                        if (ep.includes('transcription')) return <span style={{ color: '#a855f7' }}>Transcription</span>;
                                                                                        if (ep.includes('subtitles')) return <span style={{ color: '#3b82f6' }}>Subtitles</span>;
                                                                                        if (ep.includes('metadata')) return 'Metadata';
                                                                                        if (ep.includes('ad_breaks')) return 'Ad Breaks';
                                                                                        if (ep.includes('promo_breaks')) return <span style={{ color: '#f59e0b' }}>Viral Highlights</span>;
                                                                                        return ep.split('/').pop();
                                                                                    })()}
                                                                                </td>
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: '#9ca3af' }}>{log.model}</td>
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', color: log.response_status < 400 ? '#10b981' : '#ef4444' }}>{log.response_status}</td>
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', textAlign: 'right' }}>${log.billed_cost?.toFixed(3) || '0.000'}</td>
                                                                                {showProviderCosts && <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', textAlign: 'right', color: '#f59e0b' }}>${log.cost_usd?.toFixed(4) || '0.0000'}</td>}
                                                                                <td style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.03)', textAlign: 'center' }}>
                                                                                    <button 
                                                                                        onClick={() => setSelectedLog(log)}
                                                                                        style={{ 
                                                                                            background: 'rgba(59,130,246,0.1)', 
                                                                                            border: 'none', 
                                                                                            borderRadius: '4px', 
                                                                                            padding: '2px 6px',
                                                                                            cursor: 'pointer',
                                                                                            color: '#3b82f6',
                                                                                            fontSize: '10px'
                                                                                        }}
                                                                                    >
                                                                                        Inspect
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                                </>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Log Inspector Modal */}
            {selectedLog && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '40px' }}>
                    <div style={{ backgroundColor: '#111827', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#fff' }}>API Request Details</h3>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>ID: {selectedLog.request_id || selectedLog.id}</div>
                            </div>
                            <button 
                                onClick={() => setSelectedLog(null)}
                                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '24px' }}
                            >
                                &times;
                            </button>
                        </div>
                        
                        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Endpoint / Method</div>
                                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#D1D5DB' }}>{selectedLog.endpoint}</div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>Model / Status</div>
                                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#D1D5DB' }}>{selectedLog.model} • <span style={{ color: selectedLog.response_status < 400 ? '#10b981' : '#ef4444' }}>{selectedLog.response_status}</span></div>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', marginBottom: '4px' }}>{showProviderCosts ? 'Provider COST' : 'COST'} / Latency</div>
                                    <div style={{ fontSize: '12px', fontWeight: 500, color: '#D1D5DB' }}>${selectedLog.cost_usd?.toFixed(4)} • {selectedLog.latency_ms}ms</div>
                                </div>
                            </div>

                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#3b82f6', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6' }}></span>
                                    Request Payload
                                </h4>
                                <pre style={{ 
                                    backgroundColor: '#000', 
                                    padding: '16px', 
                                    borderRadius: '8px', 
                                    fontSize: '11px', 
                                    color: '#d1d5db', 
                                    overflowX: 'auto', 
                                    maxWidth: '100%',
                                    whiteSpace: 'pre-wrap',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    {(() => {
                                        try {
                                            const body = typeof selectedLog.request_body === 'string' ? JSON.parse(selectedLog.request_body) : selectedLog.request_body;
                                            return JSON.stringify(body, null, 2);
                                        } catch (e) {
                                            return String(selectedLog.request_body);
                                        }
                                    })()}
                                </pre>
                            </div>

                            <div>
                                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#10b981', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                                    Response Data
                                </h4>
                                <pre style={{ 
                                    backgroundColor: '#000', 
                                    padding: '16px', 
                                    borderRadius: '8px', 
                                    fontSize: '11px', 
                                    color: '#d1d5db', 
                                    overflowX: 'auto', 
                                    maxWidth: '100%',
                                    whiteSpace: 'pre-wrap',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}>
                                    {(() => {
                                        try {
                                            const body = typeof selectedLog.response_body === 'string' ? JSON.parse(selectedLog.response_body) : selectedLog.response_body;
                                            return JSON.stringify(body, null, 2);
                                        } catch (e) {
                                            return String(selectedLog.response_body);
                                        }
                                    })()}
                                </pre>
                            </div>

                            {selectedLog.error_message && (
                                <div>
                                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#ef4444', marginBottom: '12px' }}>Error Details</h4>
                                    <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '12px', borderRadius: '8px', fontSize: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        {selectedLog.error_message}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div style={{ padding: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'right' }}>
                            <button 
                                onClick={() => setSelectedLog(null)}
                                style={{ 
                                    backgroundColor: 'rgba(255,255,255,0.05)', 
                                    color: '#fff', 
                                    border: '1px solid rgba(255,255,255,0.1)', 
                                    padding: '8px 20px', 
                                    borderRadius: '8px', 
                                    cursor: 'pointer',
                                    fontWeight: 500
                                }}
                            >
                                Close Inspector
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SyncQueueView({ authFetch }: { authFetch: (url: string, options?: RequestInit) => Promise<Response> }) {
    const [items, setItems] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        loadData();
    }, [filter]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [itemsRes, statsRes] = await Promise.all([
                filter === 'all'
                    ? authFetch('/api/mgmt/sync-queue')
                    : authFetch(`/api/mgmt/sync-queue?status=${filter}`),
                authFetch('/api/mgmt/sync-queue/stats')
            ]);
            if (itemsRes.ok) setItems(await itemsRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
        } catch (err) {
            console.error('Failed to load sync queue', err);
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async (id: number) => {
        try {
            await authFetch(`/api/mgmt/sync-queue/${id}/retry`, { method: 'POST' });
            loadData();
        } catch (err) {
            console.error('Failed to retry', err);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this sync item? This action cannot be undone.')) return;
        try {
            await authFetch(`/api/mgmt/sync-queue/${id}`, { method: 'DELETE' });
            loadData();
        } catch (err) {
            console.error('Failed to delete', err);
        }
    };

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Pending</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: stats?.pendingCount > 0 ? '#f59e0b' : '#10b981' }}>
                        {stats?.pendingCount || 0}
                    </div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Synced</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{stats?.syncedCount || 0}</div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Failed</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: stats?.failedCount > 0 ? '#ef4444' : '#6b7280' }}>
                        {stats?.failedCount || 0}
                    </div>
                </div>
                <div style={styles.statCard}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Oldest Pending</div>
                    <div style={{ fontSize: '28px', fontWeight: 700, color: stats?.oldestPendingHours > 24 ? '#ef4444' : '#6b7280' }}>
                        {stats?.oldestPendingHours > 0 ? `${stats.oldestPendingHours}h` : '-'}
                    </div>
                </div>
            </div>

            <div style={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Pending Sync Queue</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['all', 'pending', 'syncing', 'failed', 'synced'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    backgroundColor: filter === f ? '#10b981' : 'rgba(255,255,255,0.05)',
                                    color: filter === f ? 'white' : '#9ca3af'
                                }}
                            >
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>Loading...</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                        <p>No sync queue items</p>
                    </div>
                ) : (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Created</th>
                                <th style={styles.th}>Type</th>
                                <th style={styles.th}>Job ID</th>
                                <th style={styles.th}>Module</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Retries</th>
                                <th style={styles.th}>Error</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '12px' }}>{new Date(item.created_at).toLocaleString()}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', backgroundColor: 'rgba(59,130,246,0.2)', color: '#3b82f6' }}>
                                            {item.record_type}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '13px', fontFamily: 'monospace' }}>{item.job_id || '-'}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '13px' }}>{item.module_name || '-'}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            backgroundColor: item.status === 'pending' ? 'rgba(245,158,11,0.2)' :
                                                item.status === 'syncing' ? 'rgba(59,130,246,0.2)' :
                                                    item.status === 'failed' ? 'rgba(239,68,68,0.2)' :
                                                        'rgba(16,185,129,0.2)',
                                            color: item.status === 'pending' ? '#f59e0b' :
                                                item.status === 'syncing' ? '#3b82f6' :
                                                    item.status === 'failed' ? '#ef4444' :
                                                        '#10b981'
                                        }}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '13px' }}>{item.retry_count}</div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ fontSize: '12px', color: '#ef4444', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.error_message || '-'}
                                        </div>
                                    </td>
                                    <td style={styles.td}>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {(item.status === 'pending' || item.status === 'failed') && (
                                                <button onClick={() => handleRetry(item.id)} style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px' }}>
                                                    🔄 Retry
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(item.id)} style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#ef4444' }}>
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
