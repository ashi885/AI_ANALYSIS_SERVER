import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, RefreshCcw, ChevronRight, Copy, Check, Info, XCircle, X,
  Terminal, Clock, ExternalLink, Activity, Database, Shield, Layout,
  Cpu, Zap, Receipt, Globe, Monitor, Code, AlertTriangle, Settings, Lock, AlertCircle
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
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    },
    {
        id: 'promo_breaks',
        name: 'Viral Highlights',
        description: 'Detect promo-worthy segments',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    },
    {
        id: 'subtitle_translation',
        name: 'Subtitle Translation',
        description: 'Translate subtitles to other languages',
        defaultProvider: 'openrouter',
        defaultModel: 'anthropic/claude-3.5-sonnet',
        availableModels: [
            { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { provider: 'openrouter', model: 'openai/gpt-4o', name: 'GPT-4o' }
        ]
    }
];

const COLORS = {
    bg: '#0a0a0f',
    sidebar: '#0d0d12',
    card: '#111118',
    primary: '#10b981',
    border: 'rgba(255,255,255,0.05)',
    textMain: '#ffffff',
    textDim: '#9ca3af',
    textMuted: '#6b7280',
    error: '#ef4444',
    warn: '#f59e0b',
    info: '#3b82f6'
};

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
    allow_rate_card_fetch?: number;
}

interface SummaryData {
    totalClients: number;
    activeClients: number;
    configuredEndpoints: number;
    modulesConfigured: number;
    totalJobsThisMonth: number;
    totalRevenue: number;
    moduleBreakdown: { module_name: string; clients: number }[];
    recentLogs: any[];
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
    { id: 'reports', label: 'Reports & Analytics', icon: '📈' },
    { id: 'clients', label: 'Clients', icon: '👥' },
    { id: 'configuration', label: 'Configuration', icon: '⚙️' },
    { id: 'billing', label: 'Billing', icon: '💰' },
    { id: 'api-logs', label: 'AI Request Logs', icon: '🔌' },
    { id: 'logging', label: 'Server Logs', icon: '📝' },
    { id: 'provider-billing', label: 'Provider Billing', icon: '🏦' },
    { id: 'ai-jobs', label: 'AI Job Queue', icon: '🤖' },
    { id: 'license-cache', label: 'License Cache', icon: '🗂️' },
    { id: 'smtp', label: 'SMTP Settings', icon: '📧' },
    { id: 'sync-queue', label: 'Sync Queue', icon: '🔄' },
    { id: 'settings', label: 'Settings', icon: '🔧' },
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

function App() {
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('cuepoint_admin_tab') || 'dashboard');
    
    useEffect(() => {
        localStorage.setItem('cuepoint_admin_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        const handleNav = (e: any) => {
            if (e.detail) setActiveTab(e.detail);
        };
        window.addEventListener('changeTab' as any, handleNav);
        return () => window.removeEventListener('changeTab' as any, handleNav);
    }, []);

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
    const [apiLogs, setApiLogs] = useState<any[]>([]);
    const [apiLogsLoading, setApiLogsLoading] = useState(false);
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [clientCredentials, setClientCredentials] = useState<Record<number, { supabase_url: string; supabase_anon_key: string }>>({});
    const [billingSummary, setBillingSummary] = useState<any>(null);
    const [providerBilling, setProviderBilling] = useState<any[]>([]);
    const [providerBillingLoading, setProviderBillingLoading] = useState(false);
    const [openaiTotalMtd, setOpenaiTotalMtd] = useState(0);
    const [balanceAlerts, setBalanceAlerts] = useState<any[]>([]);
    const [globalDefaultModel, setGlobalDefaultModel] = useState<string>('');

    // Auth state
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authLoading, setAuthLoading] = useState(true);
    const [loginError, setLoginError] = useState('');
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [savingClient, setSavingClient] = useState(false);

    const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
        const auth = localStorage.getItem('cuepoint_admin_auth');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (auth) headers['Authorization'] = `Basic ${auth}`;
        if (options.headers) Object.assign(headers, options.headers);
        return fetch(url, { ...options, headers });
    }, []);

    const fetchProviderBilling = useCallback(async () => {
        setProviderBillingLoading(true);
        try {
            const res = await authFetch('/api/mgmt/provider-billing');
            if (res.ok) {
                const data = await res.json();
                setProviderBilling(data.billing || []);
                setOpenaiTotalMtd(data.openai_total_mtd || 0);
            }
        } catch (err) {
            console.error('Failed to fetch provider billing', err);
        } finally {
            setProviderBillingLoading(false);
        }
    }, [authFetch]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [clientsRes, summaryRes, modelsRes, billingRes, fallbackRes] = await Promise.all([
                authFetch('/api/mgmt/clients'),
                authFetch('/api/mgmt/summary'),
                authFetch('/api/mgmt/available-models'),
                authFetch('/api/mgmt/billing/summary'),
                authFetch('/api/mgmt/settings/global-fallback')
            ]);

            const clientsData = await clientsRes.json();
            const summaryData = await summaryRes.json();
            const modelsData = await modelsRes.json();
            const billingData = billingRes.ok ? await billingRes.json() : null;
            const fallbackData = await fallbackRes.json();

            setAvailableModels(modelsData.models || modelsData);
            setBillingSummary(billingData);
            setSummary(summaryData);
            setGlobalDefaultModel(fallbackData.model || '');

            setClients(clientsData.map((c: Client) => ({
                ...c,
                status: c.status || 'active',
                module_rates: typeof c.module_rates === 'string' ? JSON.parse(c.module_rates || '{}') : c.module_rates
            })));

            const keysData: Record<number, any[]> = {};
            const clientModelsData: Record<number, any[]> = {};
            const credsData: Record<number, { supabase_url: string; supabase_anon_key: string }> = {};

            for (const c of clientsData) {
                const [keysRes, modelsRes, credsRes] = await Promise.all([
                    authFetch(`/api/mgmt/clients/${c.id}/api-keys`),
                    authFetch(`/api/mgmt/clients/${c.id}/models`),
                    authFetch(`/api/mgmt/clients/${c.id}/credentials`)
                ]);
                keysData[c.id] = await keysRes.json();
                clientModelsData[c.id] = await modelsRes.json();
                if (credsRes.ok) {
                    const creds = await credsRes.json();
                    credsData[c.id] = { supabase_url: creds.supabaseUrl || '', supabase_anon_key: creds.supabaseAnonKey || '' };
                }
            }
            setApiKeys(keysData);
            setClientModels(clientModelsData);
            setClientCredentials(credsData);
            
            fetchProviderBilling();
        } catch (err) {
            console.error('Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    }, [authFetch, fetchProviderBilling]);

    useEffect(() => {
        if (isAuthenticated) fetchData();
    }, [isAuthenticated, fetchData]);

    useEffect(() => {
        const checkAuth = async () => {
            const savedAuth = localStorage.getItem('cuepoint_admin_auth');
            if (savedAuth) {
                const decoded = atob(savedAuth);
                const [email, password] = decoded.split(':');
                const res = await fetch('/api/mgmt/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (res.ok) setIsAuthenticated(true);
                else localStorage.removeItem('cuepoint_admin_auth');
            }
            setAuthLoading(false);
        };
        checkAuth();
    }, []);

    const handleLogin = async () => {
        try {
            const res = await fetch('/api/mgmt/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword })
            });
            if (res.ok) {
                localStorage.setItem('cuepoint_admin_auth', btoa(`${loginUsername}:${loginPassword}`));
                setIsAuthenticated(true);
            } else setLoginError('Invalid credentials');
        } catch { setLoginError('Login failed'); }
    };

    const handleToggleStatus = async (client: Client) => {
        setActionLoading(client.id);
        try {
            const res = await authFetch(`/api/mgmt/clients/${client.id}/toggle-status`, { method: 'POST' });
            if (res.ok) fetchData();
        } finally { setActionLoading(null); }
    };

    const handleDelete = async (client: Client) => {
        if (!confirm(`Are you sure you want to delete client ${client.name}?`)) return;
        setActionLoading(client.id);
        try {
            const res = await authFetch(`/api/mgmt/clients/${client.id}`, { method: 'DELETE' });
            if (res.ok) fetchData();
        } finally { setActionLoading(null); }
    };

    const handleEdit = (client: Client) => {
        setEditingClient(client);
        setShowModal(true);
    };

    const handleSaveClient = async (data: any) => {
        try {
            const url = editingClient ? `/api/mgmt/clients/${editingClient.id}` : '/api/mgmt/clients';
            const method = editingClient ? 'PUT' : 'POST';
            setSavingClient(true);
            const res = await authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                setShowModal(false);
                setEditingClient(null);
                fetchData();
            }
        } catch (err) { 
            console.error('Save failed', err); 
        } finally {
            setSavingClient(false);
        }
    };

    const handleRegenerateKey = async (client: Client) => {
        if (!confirm('Regenerate API key? This will break existing integrations.')) return;
        setActionLoading(client.id);
        try {
            const res = await authFetch(`/api/mgmt/clients/${client.id}/regenerate-key`, { method: 'POST' });
            if (res.ok) fetchData();
        } finally { setActionLoading(null); }
    };

    const handleToggleApiKey = async (keyId: number, clientId: number) => {
        try {
            const res = await authFetch(`/api/mgmt/api-keys/${keyId}/toggle`, { method: 'POST' });
            if (res.ok) fetchData();
        } catch (err) { console.error(err); }
    };

    const handleDeleteApiKey = async (keyId: number, clientId: number) => {
        if (!confirm('Delete this API key?')) return;
        try {
            const res = await authFetch(`/api/mgmt/api-keys/${keyId}`, { method: 'DELETE' });
            if (res.ok) fetchData();
        } catch (err) { console.error(err); }
    };

    const handleSaveCredentials = async (clientId: number, credentials: any) => {
        const res = await authFetch(`/api/mgmt/clients/${clientId}/credentials`, {
            method: 'POST',
            body: JSON.stringify(credentials)
        });
        if (res.ok) fetchData();
    };

    const handleSaveGlobalDefaultModel = async (model: string) => {
        const res = await authFetch('/api/mgmt/settings/global-fallback', {
            method: 'POST',
            body: JSON.stringify({ model })
        });
        if (res.ok) fetchData();
    };

    const handleAddApiKey = async (clientId: number, provider: string, apiKey: string) => {
        try {
            const res = await authFetch(`/api/mgmt/clients/${clientId}/api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey })
            });
            if (res.ok) fetchData();
        } catch (err) { console.error(err); }
    };

    const handleSaveModel = async (clientUUID: string, models: any[]) => {
        try {
            const res = await authFetch(`/api/mgmt/clients/${clientUUID}/models`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ models })
            });
            if (res.ok) await fetchData();
            else throw new Error('Failed to save models');
        } catch (err) {
            console.error(err);
            throw err;
        }
    };

    const getStatus = (client: Client) => {
        if (client.status === 'inactive') return 'inactive';
        const end = client.contract_end ? new Date(client.contract_end) : null;
        if (end && end < new Date()) return 'expired';
        return 'active';
    };

    const onCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const fetchApiLogs = useCallback(async () => {
        setApiLogsLoading(true);
        try {
            const res = await authFetch('/api/mgmt/api-logs');
            if (res.ok) {
                const data = await res.json();
                setApiLogs(data.logs || data);
            }
        } catch (err) {
            console.error('Failed to fetch API logs', err);
        } finally {
            setApiLogsLoading(false);
        }
    }, [authFetch]);

    useEffect(() => {
        if (activeTab === 'api-logs' || activeTab === 'reports') fetchApiLogs();
    }, [activeTab, fetchApiLogs]);

    if (authLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0f', color: 'white' }}>Loading...</div>;

    if (!isAuthenticated) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0a0a0f' }}>
            <div style={{ backgroundColor: '#111118', padding: '40px', borderRadius: '16px', width: '360px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h1 style={{ color: 'white', marginBottom: '20px' }}>Cuepoint Admin</h1>
                {loginError && <div style={{ color: '#ef4444', marginBottom: '10px' }}>{loginError}</div>}
                <input type="text" placeholder="Username" value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} style={{ ...styles.input, marginBottom: '10px' }} />
                <input type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={{ ...styles.input, marginBottom: '20px' }} />
                <button onClick={handleLogin} style={{ ...styles.button, width: '100%' }}>Sign In</button>
            </div>
        </div>
    );

    const filteredClients = clients.filter(c => {
        const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (c.api_key || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || getStatus(c) === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div style={styles.container}>
            <aside style={styles.sidebar}>
                <div style={styles.sidebarLogo}>
                    <div style={styles.logoIcon}>🛡️</div>
                    <div><div style={{ fontSize: '10px', color: '#6b7280' }}>CUEPOINT</div><div style={{ fontWeight: 600 }}>Admin</div></div>
                </div>
                <nav style={{ flex: 1, overflowY: 'auto' }}>
                    {NAV_ITEMS.map(item => (
                        <div key={item.id} onClick={() => setActiveTab(item.id)} style={{ ...styles.navItem, ...(activeTab === item.id ? styles.navItemActive : {}) }}>
                            <span>{item.icon}</span><span>{item.label}</span>
                        </div>
                    ))}
                </nav>
            </aside>
            <main style={styles.main}>
                <header style={styles.header}>
                    <h1 style={{ fontSize: '18px', textTransform: 'capitalize' }}>{activeTab.replace('-', ' ')}</h1>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        {activeTab === 'clients' && <button onClick={() => { setEditingClient(null); setShowModal(true); }} style={styles.button}>+ New Client</button>}
                        <button onClick={() => { localStorage.removeItem('cuepoint_admin_auth'); window.location.reload(); }} style={styles.buttonSecondary}>Logout</button>
                    </div>
                </header>
                <div style={styles.content}>
                    {activeTab === 'dashboard' && <DashboardView summary={summary} clients={clients} loading={loading} />}
                    {activeTab === 'clients' && (
                        <ClientsView 
                            clients={filteredClients} 
                            loading={loading} 
                            statusFilter={statusFilter} 
                            setStatusFilter={setStatusFilter}
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            onEdit={handleEdit}
                            onToggleStatus={handleToggleStatus}
                            onRegenerateKey={handleRegenerateKey}
                            onDelete={handleDelete}
                            getStatus={getStatus}
                            onCopy={onCopy}
                            actionLoading={actionLoading}
                        />
                    )}
                    {activeTab === 'configuration' && (
                        <ConfigView 
                            clients={clients}
                            apiKeys={apiKeys}
                            clientModels={clientModels}
                            availableModels={availableModels}
                            loading={loading}
                            onRefresh={fetchData}
                            onAddApiKey={handleAddApiKey}
                            onToggleApiKey={handleToggleApiKey}
                            onDeleteApiKey={handleDeleteApiKey}
                            onSaveModel={handleSaveModel}
                            clientCredentials={clientCredentials}
                            onSaveCredentials={handleSaveCredentials}
                            globalDefaultModel={globalDefaultModel}
                            onSaveGlobalDefaultModel={handleSaveGlobalDefaultModel}
                            authFetch={authFetch}
                        />
                    )}
                    {activeTab === 'settings' && (
                        <SettingsView 
                            availableModels={availableModels} 
                            clientModels={Object.values(clientModels).flat()}
                            clients={clients}
                            authFetch={authFetch} 
                            onRefresh={fetchData} 
                        />
                    )}
                    {activeTab === 'logging' && <LogsManager authFetch={authFetch} />}
                    {activeTab === 'api-logs' && <ApiLogsView logs={apiLogs} loading={apiLogsLoading} clients={clients} onRefresh={fetchApiLogs} />}
                    {activeTab === 'billing' && <BillingView clients={clients} getStatus={getStatus} selectedBillingClient={selectedBillingClient} setSelectedBillingClient={setSelectedBillingClient} billingData={billingSummary} />}
                    {activeTab === 'provider-billing' && (
                        <ProviderBillingView 
                            billing={providerBilling} 
                            loading={providerBillingLoading} 
                            onRefresh={fetchProviderBilling} 
                            authFetch={authFetch}
                            openaiTotalMtd={openaiTotalMtd}
                        />
                    )}
                    {activeTab === 'ai-jobs' && <AiJobsView authFetch={authFetch} clients={clients} />}
                    {activeTab === 'reports' && <ReportsView logs={apiLogs} loading={apiLogsLoading} clients={clients} onRefresh={fetchApiLogs} />}
                    {activeTab === 'license-cache' && <LicenseCacheView authFetch={authFetch} />}
                    {activeTab === 'smtp' && <SmtpSettingsView authFetch={authFetch} />}
                    {activeTab === 'sync-queue' && <SyncQueueView authFetch={authFetch} />}
                </div>
            </main>
            {showModal && <ClientModal client={editingClient} authFetch={authFetch} onClose={() => setShowModal(false)} onSave={handleSaveClient} saving={savingClient} />}
        </div>
    );
}

function ReportsView({ logs, loading, clients, onRefresh }: { logs: any[], loading: boolean, clients: any[], onRefresh: () => void }) {
    const formatDateForInput = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return formatDateForInput(d);
    });
    const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
    const [clientFilter, setClientFilter] = useState('all');
    const [selectedTab, setSelectedTab] = useState<'financial' | 'client' | 'technical'>('financial');

    // Filter logs based on dates and clients in real-time
    const filteredLogs = React.useMemo(() => {
        return logs.filter(log => {
            const logDate = new Date(log.created_at);
            const start = startDate ? new Date(startDate + 'T00:00:00') : null;
            const end = endDate ? new Date(endDate + 'T23:59:59') : null;
            
            if (start && logDate < start) return false;
            if (end && logDate > end) return false;
            
            if (clientFilter !== 'all') {
                const client = clients.find(c => String(c.id) === clientFilter || c.name === clientFilter);
                if (client) {
                    if (log.client_id !== client.id && log.client_name !== client.name) return false;
                } else {
                    if (log.client_name !== clientFilter) return false;
                }
            }
            return true;
        });
    }, [logs, startDate, endDate, clientFilter, clients]);

    // Compute metrics
    const totalRequests = filteredLogs.length;
    const successCount = filteredLogs.filter(l => (l.response_status || 0) < 400).length;
    const errorCount = filteredLogs.filter(l => (l.response_status || 0) >= 400).length;
    const successRate = totalRequests > 0 ? (successCount / totalRequests) * 100 : 100;
    const errorRate = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    const totalRevenue = filteredLogs.reduce((sum, l) => sum + (l.billed_cost || 0), 0);
    const totalExpense = filteredLogs.reduce((sum, l) => sum + (l.cost_usd || 0), 0);
    const netProfit = totalRevenue - totalExpense;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const avgLatency = totalRequests > 0 ? (filteredLogs.reduce((sum, l) => sum + (l.latency_ms || 0), 0) / totalRequests) / 1000 : 0;

    // Grouping Breakdowns
    const clientBreakdown = React.useMemo(() => {
        const map: Record<string, { name: string; count: number; revenue: number; expense: number; success: number; latencySum: number }> = {};
        filteredLogs.forEach(l => {
            const key = l.client_name || `Client ${l.client_id || 'Unknown'}`;
            if (!map[key]) {
                map[key] = { name: key, count: 0, revenue: 0, expense: 0, success: 0, latencySum: 0 };
            }
            map[key].count++;
            map[key].revenue += (l.billed_cost || 0);
            map[key].expense += (l.cost_usd || 0);
            if ((l.response_status || 0) < 400) map[key].success++;
            map[key].latencySum += (l.latency_ms || 0);
        });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
    }, [filteredLogs]);

    const technicalBreakdown = React.useMemo(() => {
        const map: Record<string, { model: string; count: number; cost: number; expense: number; success: number; latencySum: number }> = {};
        filteredLogs.forEach(l => {
            const key = l.model || l.endpoint || 'Unknown Model';
            if (!map[key]) {
                map[key] = { model: key, count: 0, cost: 0, expense: 0, success: 0, latencySum: 0 };
            }
            map[key].count++;
            map[key].cost += (l.billed_cost || 0);
            map[key].expense += (l.cost_usd || 0);
            if ((l.response_status || 0) < 400) map[key].success++;
            map[key].latencySum += (l.latency_ms || 0);
        });
        return Object.values(map).sort((a, b) => b.count - a.count);
    }, [filteredLogs]);

    const dateBreakdown = React.useMemo(() => {
        const map: Record<string, { date: string; count: number; revenue: number; expense: number; errors: number }> = {};
        filteredLogs.forEach(l => {
            const dateStr = new Date(l.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (!map[dateStr]) {
                map[dateStr] = { date: dateStr, count: 0, revenue: 0, expense: 0, errors: 0 };
            }
            map[dateStr].count++;
            map[dateStr].revenue += (l.billed_cost || 0);
            map[dateStr].expense += (l.cost_usd || 0);
            if ((l.response_status || 0) >= 400) map[dateStr].errors++;
        });
        return Object.values(map).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [filteredLogs]);

    return (
        <div>
            {/* Range and Client Filter Bar */}
            <div style={{ ...styles.card, padding: '20px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 800, letterSpacing: '0.05em' }}>START DATE:</label>
                    <input 
                        type="date" 
                        value={startDate} 
                        onChange={(e) => setStartDate(e.target.value)} 
                        style={{ ...styles.input, width: '160px', padding: '8px 12px', fontSize: '13px' }} 
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 800, letterSpacing: '0.05em' }}>END DATE:</label>
                    <input 
                        type="date" 
                        value={endDate} 
                        onChange={(e) => setEndDate(e.target.value)} 
                        style={{ ...styles.input, width: '160px', padding: '8px 12px', fontSize: '13px' }} 
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                    <label style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 800, letterSpacing: '0.05em' }}>FILTER BY CLIENT:</label>
                    <select 
                        value={clientFilter} 
                        onChange={(e) => setClientFilter(e.target.value)}
                        style={{ ...styles.input, padding: '8px 12px', fontSize: '13px', backgroundColor: 'rgba(255,255,255,0.02)' }}
                    >
                        <option value="all" style={{ backgroundColor: '#111118', color: '#fff' }}>All Clients</option>
                        {clients.map(c => (
                            <option key={c.id} value={c.id} style={{ backgroundColor: '#111118', color: '#fff' }}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <button 
                    onClick={onRefresh} 
                    disabled={loading}
                    style={{ ...styles.buttonSecondary, alignSelf: 'flex-end', height: '38px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                    🔄 {loading ? 'Syncing...' : 'REFRESH'}
                </button>
            </div>

            {/* Glowing Analytics Badges */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ ...styles.statCard, border: '1px solid rgba(59,130,246,0.1)' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Requests</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#fff' }}>{totalRequests.toLocaleString()}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>API Transactions</div>
                </div>
                <div style={{ ...styles.statCard, border: '1px solid rgba(139,92,246,0.1)' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Billed Revenue</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#a78bfa' }}>${totalRevenue.toFixed(2)}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>Charged to Clients</div>
                </div>
                <div style={{ ...styles.statCard, border: '1px solid rgba(245,158,11,0.1)' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Provider Expense</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b' }}>${totalExpense.toFixed(3)}</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>OpenRouter/OpenAI Cost</div>
                </div>
                <div style={{ ...styles.statCard, border: '1px solid rgba(16,185,129,0.2)', backgroundColor: 'rgba(16,185,129,0.02)' }}>
                    <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Net Server Profit</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>${netProfit.toFixed(3)}</div>
                    <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 600, marginTop: '4px' }}>{profitMargin.toFixed(1)}% Margin</div>
                </div>
                <div style={{ ...styles.statCard, border: '1px solid rgba(59,130,246,0.1)' }}>
                    <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Average Latency</div>
                    <div style={{ fontSize: '28px', fontWeight: 800, color: '#3b82f6' }}>{avgLatency.toFixed(2)}s</div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>AI Service Speed</div>
                </div>
            </div>

            {/* Sub-view Selector Tabs */}
            <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', width: 'fit-content', marginBottom: '24px' }}>
                {[
                    { id: 'financial', label: '📈 Financial Performance & Timeline' },
                    { id: 'client', label: '👥 Client Ingest Volumes' },
                    { id: 'technical', label: '🔌 AI Service & Model Health' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id as any)}
                        style={{
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            backgroundColor: selectedTab === tab.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                            color: selectedTab === tab.id ? '#10b981' : '#9ca3af',
                            fontWeight: selectedTab === tab.id ? 600 : 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* TAB 1: Financial Performance Timeline */}
            {selectedTab === 'financial' && (
                <div style={styles.card}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: '#fff' }}>📅 Date-Wise Activity & Revenue Timeline</h3>
                    <div style={{ overflowX: 'auto' }}>
                        {dateBreakdown.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No transactional data found in this range.</div>
                        ) : (
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Date</th>
                                        <th style={styles.th}>Total Transactions</th>
                                        <th style={styles.th}>Billed Revenue</th>
                                        <th style={styles.th}>Provider Expense</th>
                                        <th style={styles.th}>Server Profit</th>
                                        <th style={styles.th}>Technical Errors</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dateBreakdown.map((row, idx) => {
                                        const profit = row.revenue - row.expense;
                                        return (
                                            <tr key={idx}>
                                                <td style={{ ...styles.td, fontWeight: 600, color: '#fff' }}>{row.date}</td>
                                                <td style={styles.td}>{row.count} requests</td>
                                                <td style={{ ...styles.td, color: '#a78bfa', fontWeight: 600 }}>${row.revenue.toFixed(2)}</td>
                                                <td style={{ ...styles.td, color: '#f59e0b', fontWeight: 500 }}>${row.expense.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: '#10b981', fontWeight: 600 }}>${profit.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: row.errors > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                                    {row.errors > 0 ? `⚠️ ${row.errors} failed` : '✅ 0 errors'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: Client Ingest Volumes */}
            {selectedTab === 'client' && (
                <div style={styles.card}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: '#fff' }}>👥 Client-Wise Consumption & Profit Report</h3>
                    <div style={{ overflowX: 'auto' }}>
                        {clientBreakdown.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No client transactions found.</div>
                        ) : (
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>Client Name</th>
                                        <th style={styles.th}>Requests Sent</th>
                                        <th style={styles.th}>Total Billed</th>
                                        <th style={styles.th}>Provider Expense</th>
                                        <th style={styles.th}>Net Margin</th>
                                        <th style={styles.th}>Technical Success Rate</th>
                                        <th style={styles.th}>Avg AI Latency</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clientBreakdown.map((row, idx) => {
                                        const profit = row.revenue - row.expense;
                                        const rate = row.count > 0 ? (row.success / row.count) * 100 : 100;
                                        const avgLat = row.count > 0 ? (row.latencySum / row.count) / 1000 : 0;
                                        return (
                                            <tr key={idx}>
                                                <td style={{ ...styles.td, fontWeight: 600, color: '#fff' }}>{row.name}</td>
                                                <td style={styles.td}>{row.count} requests</td>
                                                <td style={{ ...styles.td, color: '#a78bfa', fontWeight: 600 }}>${row.revenue.toFixed(2)}</td>
                                                <td style={{ ...styles.td, color: '#f59e0b', fontWeight: 500 }}>${row.expense.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: '#10b981', fontWeight: 600 }}>${profit.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: rate > 95 ? '#10b981' : (rate > 80 ? '#f59e0b' : '#ef4444'), fontWeight: 600 }}>
                                                    {rate.toFixed(1)}%
                                                </td>
                                                <td style={styles.td}>{avgLat.toFixed(2)}s</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: AI Service & Model Health */}
            {selectedTab === 'technical' && (
                <div style={styles.card}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: '#fff' }}>🔌 AI Model Provider Health & Latency Audits</h3>
                    <div style={{ overflowX: 'auto' }}>
                        {technicalBreakdown.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No AI model logs recorded.</div>
                        ) : (
                            <table style={styles.table}>
                                <thead>
                                    <tr>
                                        <th style={styles.th}>AI Model / Endpoint</th>
                                        <th style={styles.th}>Invocations</th>
                                        <th style={styles.th}>Billed Revenue</th>
                                        <th style={styles.th}>Actual Expense</th>
                                        <th style={styles.th}>Provider Margin</th>
                                        <th style={styles.th}>Success Rate</th>
                                        <th style={styles.th}>Avg Response Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {technicalBreakdown.map((row, idx) => {
                                        const profit = row.cost - row.expense;
                                        const rate = row.count > 0 ? (row.success / row.count) * 100 : 100;
                                        const avgLat = row.count > 0 ? (row.latencySum / row.count) / 1000 : 0;
                                        return (
                                            <tr key={idx}>
                                                <td style={{ ...styles.td, fontWeight: 600, color: '#fff', fontFamily: 'monospace', fontSize: '12px' }}>
                                                    {row.model?.split('/').pop()}
                                                </td>
                                                <td style={styles.td}>{row.count} times</td>
                                                <td style={{ ...styles.td, color: '#a78bfa', fontWeight: 600 }}>${row.cost.toFixed(2)}</td>
                                                <td style={{ ...styles.td, color: '#f59e0b', fontWeight: 500 }}>${row.expense.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: '#10b981', fontWeight: 600 }}>${profit.toFixed(3)}</td>
                                                <td style={{ ...styles.td, color: rate > 95 ? '#10b981' : (rate > 80 ? '#f59e0b' : '#ef4444'), fontWeight: 600 }}>
                                                    {rate.toFixed(1)}%
                                                </td>
                                                <td style={{ ...styles.td, color: avgLat > 10 ? '#f59e0b' : '#fff' }}>{avgLat.toFixed(2)}s</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function PrivateValue({ value, isCurrency = true }: { value: any, isCurrency?: boolean }) {
    const [visible, setVisible] = useState(true);
    return (
        <span 
            onClick={() => setVisible(!visible)} 
            style={{ cursor: 'pointer', padding: visible ? '0' : '2px 8px', borderRadius: '4px', backgroundColor: visible ? 'transparent' : 'rgba(255,255,255,0.05)' }}
        >
            {visible ? (isCurrency ? `$${value}` : value) : '****'}
        </span>
    );
}

const ProviderBillingView = ({ billing, loading, onRefresh, authFetch, openaiTotalMtd }: { billing: any[], loading: boolean, onRefresh: () => void, authFetch: any, openaiTotalMtd: number }) => {
    const [mgmtKey, setMgmtKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await authFetch('/api/mgmt/system-settings');
                if (res.ok) {
                    const data = await res.json();
                    setMgmtKey(data.settings?.openrouter_management_key || '');
                }
            } catch (err) {
                console.error('Failed to fetch system settings', err);
            }
        };
        fetchSettings();
    }, [authFetch]);

    const handleSaveMgmtKey = async () => {
        const trimmedKey = mgmtKey.trim();
        if (!trimmedKey) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/system-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'openrouter_management_key', value: trimmedKey })
            });
            if (res.ok) {
                setMessage({ type: 'success', text: 'Management Key saved! Refreshing billing data...' });
                setTimeout(() => setMessage(null), 3000);
                onRefresh();
            } else {
                const data = await res.json();
                setMessage({ type: 'error', text: data.error || 'Failed to save key' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network error' });
        } finally {
            setSaving(false);
        }
    };

    // Calculate account-wide balance from the first management-key entry that has it
    const accountBalanceEntry = Array.isArray(billing) ? billing.find(b => b.source === 'management_key' && b.account_balance !== null) : null;
    const accountBalance = accountBalanceEntry?.account_balance;

    const totalLocalMtd = Array.isArray(billing) ? billing.reduce((sum, item) => sum + (Number(item.local_mtd) || 0), 0) : 0;
    const totalRemainingCredits = Array.isArray(billing) ? billing.reduce((sum, item) => {
        if (item.limit_remaining !== null && item.limit_remaining !== undefined && typeof item.limit_remaining === 'number') {
            return sum + item.limit_remaining;
        }
        return sum;
    }, 0) : 0;
    const activeKeysCount = Array.isArray(billing) ? billing.filter(item => !item.disabled && !item.error).length : 0;
    const keyErrorsCount = Array.isArray(billing) ? billing.filter(item => item.error).length : 0;

    // Helper to safely render potential objects from API errors
    const safeRender = (val: any) => {
        if (!val) return null;
        if (typeof val === 'object') return val.message || JSON.stringify(val);
        return String(val);
    };

    return (
        <div style={{ animation: 'fadeIn 0.4s cubic-bezier(0, 0, 0.2, 1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', letterSpacing: '-0.02em' }}>Financial Infrastructure</h2>
                    <p style={{ fontSize: '14px', color: '#6b7280' }}>Real-time monitoring of AI provider liquidity and client-level consumption.</p>
                </div>
                <div style={{ display: 'flex', gap: '16px' }}>
                    {/* OpenAI Strategy Card */}
                    <div style={{ 
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.02))', 
                        border: '1px solid rgba(16, 185, 129, 0.2)', 
                        borderRadius: '16px', 
                        padding: '12px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        minWidth: '160px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                    }}>
                        <span style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '4px' }}>OpenAI MTD Usage</span>
                        <span style={{ fontSize: '22px', fontWeight: 800, color: '#34d399' }}>
                            ${Number(openaiTotalMtd).toFixed(2)}
                        </span>
                    </div>

                    {/* OpenRouter Balance Card */}
                    {accountBalance !== undefined && accountBalance !== null && (
                        <div style={{ 
                            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(124, 58, 237, 0.02))', 
                            border: '1px solid rgba(124, 58, 237, 0.2)', 
                            borderRadius: '16px', 
                            padding: '12px 20px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            minWidth: '200px',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                        }}>
                            <span style={{ fontSize: '11px', color: '#a78bfa', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', marginBottom: '4px' }}>Master Liquidity (OR)</span>
                            <span style={{ fontSize: '22px', fontWeight: 800, color: '#c084fc' }}>
                                <PrivateValue value={Number(accountBalance).toFixed(2)} />
                            </span>
                        </div>
                    )}
                    <button 
                        onClick={onRefresh} 
                        disabled={loading}
                        style={{ 
                            ...styles.buttonSecondary, 
                            height: '48px', 
                            width: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '12px',
                            alignSelf: 'center',
                            backgroundColor: 'rgba(255,255,255,0.03)'
                        }}
                    >
                        <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {accountBalance !== undefined && accountBalance !== null && accountBalance < 10.0 && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.03))',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '16px',
                    padding: '16px 24px',
                    marginBottom: '32px',
                }}
                className="pulse-glow-warning"
                >
                    <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(239,68,68,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <AlertTriangle size={24} color="#ef4444" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>CRITICAL: OpenRouter Master Account Liquidity is Low</h4>
                        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
                            The current master balance is only <strong style={{ color: '#ef4444' }}>${Number(accountBalance).toFixed(2)}</strong>. Sub-account limits shown below are shared and will fail to execute once the master balance is depleted. Please recharge timely on the <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline', fontWeight: 600 }}>OpenRouter Dashboard</a>.
                        </p>
                    </div>
                </div>
            )}

            {/* Management Key Section */}
            <div style={{ 
                ...styles.card, 
                marginBottom: '32px', 
                backgroundColor: 'rgba(13,13,18,0.6)', 
                border: '1px dashed rgba(16, 185, 129, 0.3)',
                padding: '24px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Settings size={18} color="#10b981" />
                        </div>
                        <div>
                            <span style={{ fontWeight: 700, fontSize: '15px', color: '#fff' }}>OpenRouter Infrastructure Link</span>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Enable automated sub-key synchronization and workspace-wide auditing.</div>
                        </div>
                    </div>
                    {message && (
                        <div style={{ 
                            fontSize: '12px', 
                            color: message.type === 'success' ? '#10b981' : '#ef4444',
                            backgroundColor: message.type === 'success' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}`
                        }}>
                            {safeRender(message.text)}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Lock size={14} style={{ position: 'absolute', left: '12px', top: '14px', color: '#4b5563' }} />
                        <input 
                            type="text"
                            placeholder="sk-or-v1-................................................................"
                            value={mgmtKey}
                            onChange={(e) => setMgmtKey(e.target.value)}
                            style={{ ...styles.input, paddingLeft: '36px', fontFamily: 'monospace', fontSize: '13px', backgroundColor: 'rgba(0,0,0,0.2)', WebkitTextSecurity: 'disc', textSecurity: 'disc' } as any}
                            autoComplete="new-password"
                        />
                    </div>
                    <button 
                        onClick={handleSaveMgmtKey}
                        disabled={saving || !mgmtKey}
                        style={{ ...styles.button, padding: '0 24px', height: '44px' }}
                    >
                        {saving ? 'Synchronizing...' : 'Establish Connection'}
                    </button>
                </div>
            </div>

            {loading && (!Array.isArray(billing) || billing.length === 0) ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '120px' }}>
                    <div className="animate-spin" style={{ width: '48px', height: '48px', border: '3px solid rgba(16,185,129,0.1)', borderTopColor: '#10b981', borderRadius: '50%', marginBottom: '20px' }}></div>
                    <div style={{ color: '#6b7280', fontSize: '14px', fontWeight: 500 }}>Polling provider telemetry...</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {/* 1. Consolidated Summary Stats Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                        <div style={styles.statCard}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Total Local MTD Usage</div>
                            <div style={{ fontSize: '24px', fontWeight: 700 }}>${totalLocalMtd.toFixed(3)}</div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Remaining Shared Limits</div>
                            <div style={{ fontSize: '24px', fontWeight: 700 }}>
                                <PrivateValue value={totalRemainingCredits.toFixed(2)} />
                            </div>
                        </div>
                        <div style={styles.statCard}>
                            <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Active API Sub-Keys</div>
                            <div style={{ fontSize: '24px', fontWeight: 700 }}>{activeKeysCount} / {billing.length}</div>
                        </div>
                        <div style={{
                            ...styles.statCard,
                            borderColor: keyErrorsCount > 0 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.05)',
                            backgroundColor: keyErrorsCount > 0 ? 'rgba(239, 68, 68, 0.05)' : '#111118'
                        }}>
                            <div style={{ fontSize: '11px', color: keyErrorsCount > 0 ? '#ef4444' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>API Configurations Alerts</div>
                            <div style={{ fontSize: '24px', fontWeight: 700, color: keyErrorsCount > 0 ? '#ef4444' : '#fff' }}>{keyErrorsCount} {keyErrorsCount > 0 ? '⚠️' : '✓'}</div>
                        </div>
                    </div>

                    {/* 2. Consolidated Provider Billing Table */}
                    <div style={styles.card}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>🏦 API Provider Billing Summary</h3>
                        <table style={styles.table}>
                            <thead>
                                <tr>
                                    <th style={styles.th}>Provider</th>
                                    <th style={styles.th}>Sub-Account / Key Label</th>
                                    <th style={styles.th}>Associated Client</th>
                                    <th style={styles.th}>Local MTD Usage</th>
                                    <th style={styles.th}>Remaining Credit</th>
                                    <th style={styles.th}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.isArray(billing) && billing.map((item, idx) => {
                                    const statusColor = item.error ? '#ef4444' : item.disabled ? '#ef4444' : (item.limit_remaining !== null && item.limit_remaining < 5) ? '#f59e0b' : '#10b981';
                                    const statusText = item.error ? 'Error' : item.disabled ? 'Suspended' : (item.limit_remaining !== null && item.limit_remaining < 5) ? 'Low Credit' : 'Healthy';
                                    return (
                                        <tr key={idx}>
                                            <td style={styles.td}>
                                                <span style={{ 
                                                    fontSize: '10px', 
                                                    padding: '3px 8px', 
                                                    borderRadius: '6px', 
                                                    backgroundColor: item.provider === 'openai' ? 'rgba(16,185,129,0.15)' : 'rgba(124, 58, 237, 0.15)',
                                                    color: item.provider === 'openai' ? '#10b981' : '#a78bfa',
                                                    fontWeight: 800,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.05em'
                                                }}>
                                                    {item.provider}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#fff' }}>
                                                    {item.api_key_label || (item.api_key_hash ? item.api_key_hash.substring(0, 16) + '...' : 'System Key')}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <div style={{ fontWeight: 600, color: '#fff' }}>
                                                    {item.client_name}
                                                </div>
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{ fontWeight: 600, color: '#10b981' }}>
                                                    ${Number(item.local_mtd || 0).toFixed(3)}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{ color: item.limit_remaining === null ? '#9ca3af' : '#10b981', fontWeight: 600 }}>
                                                    {item.limit_remaining !== null ? (
                                                        <PrivateValue value={Number(item.limit_remaining).toFixed(2)} />
                                                    ) : 'UNLIMITED'}
                                                </span>
                                            </td>
                                            <td style={styles.td}>
                                                <span style={{ ...styles.badge, backgroundColor: `${statusColor}20`, color: statusColor }}>
                                                    {statusText}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* 3. Detailed Sub-Key Configuration Cards */}
                    <div>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>🔍 Detailed Sub-Key Telemetry</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '24px' }}>
                            {Array.isArray(billing) && billing.map((item, idx) => (
                                <div key={idx} style={{ 
                                    ...styles.card, 
                                    margin: 0, 
                                    position: 'relative', 
                                    overflow: 'hidden',
                                    border: item.error ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(255,255,255,0.07)',
                                    backgroundColor: item.error ? 'rgba(239, 68, 68, 0.03)' : 'rgba(17,17,24,0.8)',
                                    backdropFilter: 'blur(10px)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    cursor: 'default'
                                }}
                                className="hover:bg-white/[0.02]"
                                >
                                    <div style={{ position: 'relative', zIndex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                    <span style={{ 
                                                        fontSize: '10px', 
                                                        padding: '3px 8px', 
                                                        borderRadius: '6px', 
                                                        backgroundColor: item.provider === 'openai' ? 'rgba(16,185,129,0.15)' : 'rgba(124, 58, 237, 0.15)',
                                                        color: item.provider === 'openai' ? '#10b981' : '#a78bfa',
                                                        fontWeight: 800,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.05em'
                                                    }}>
                                                        {item.provider}
                                                    </span>
                                                    {item.source === 'management_key' && (
                                                        <span style={{ fontSize: '10px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                                                            <Activity size={10} /> Sync Active
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                                                    {item.client_name}
                                                    {item.matched_client && item.matched_client !== item.client_name && (
                                                        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 400, marginLeft: '8px' }}>
                                                            ({item.matched_client})
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#4b5563', fontFamily: 'monospace', marginTop: '6px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '4px 8px', borderRadius: '6px', display: 'inline-block' }}>
                                                    {item.api_key_label || item.api_key_hash?.substring(0, 16) + '...'}
                                                </div>
                                            </div>
                                            <div style={{ 
                                                width: '44px',
                                                height: '44px',
                                                borderRadius: '12px', 
                                                backgroundColor: 'rgba(255,255,255,0.03)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                                            }}>
                                                {item.provider === 'openai' ? <Zap size={22} color="#10b981" /> : <Cpu size={22} color="#7c3aed" />}
                                            </div>
                                        </div>

                                        {item.error ? (
                                            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                                <div style={{ fontSize: '13px', color: '#f87171', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                                    <span>{safeRender(item.error)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                {/* Main Stats Grid */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                                    <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <div style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.02em', marginBottom: '8px' }}>Local Usage (MTD)</div>
                                                        <div style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>${Number(item.local_mtd || 0).toFixed(3)}</div>
                                                    </div>
                                                    <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.03)', borderRadius: '14px', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                                        <div>
                                                            <div style={{ fontSize: '11px', color: '#10b981', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.02em', marginBottom: '8px' }}>Available Credit</div>
                                                            <div style={{ fontSize: '24px', fontWeight: 800, color: '#10b981' }}>
                                                                {item.limit_remaining !== null ? (
                                                                    <PrivateValue value={Number(item.limit_remaining).toFixed(2)} />
                                                                ) : 'UNLIMITED'}
                                                            </div>
                                                        </div>
                                                        {((item.limit_remaining !== null && accountBalance !== null && accountBalance !== undefined && item.limit_remaining > accountBalance) || (item.limit_remaining === null && accountBalance !== null && accountBalance !== undefined && accountBalance < 10.0)) && (
                                                            <div style={{ 
                                                                marginTop: '8px', 
                                                                fontSize: '10px', 
                                                                color: '#f87171', 
                                                                backgroundColor: 'rgba(239, 68, 68, 0.12)', 
                                                                padding: '6px 8px', 
                                                                borderRadius: '6px',
                                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                fontWeight: 600,
                                                                lineHeight: '1.2'
                                                            }}>
                                                                ⚠️ Shared Master Balance Low (${Number(accountBalance).toFixed(2)})
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Progress Bar for Limits */}
                                                {item.limit && item.limit > 0 && (
                                                    <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '10px' }}>
                                                            <span style={{ color: '#9ca3af', fontWeight: 500 }}>Consumption of ${item.limit} Threshold</span>
                                                            <span style={{ color: '#fff', fontWeight: 700 }}>{Math.round((item.usage_total / item.limit) * 100)}%</span>
                                                        </div>
                                                        <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <div style={{ 
                                                                height: '100%', 
                                                                width: `${Math.min(100, (item.usage_total / item.limit) * 100)}%`, 
                                                                backgroundColor: (item.usage_total / item.limit) > 0.85 ? '#ef4444' : '#10b981',
                                                                boxShadow: (item.usage_total / item.limit) > 0.85 ? '0 0 10px rgba(239,68,68,0.5)' : 'none',
                                                                transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)'
                                                            }} />
                                                        </div>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: '11px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Clock size={12} />
                                                        Updated {new Date(item.last_updated).toLocaleTimeString()}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '16px' }}>
                                                        {item.disabled && (
                                                            <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 800, letterSpacing: '0.05em' }}>SUSPENDED</span>
                                                        )}
                                                        <a 
                                                            href={item.provider === 'openai' ? 'https://platform.openai.com/usage' : 'https://openrouter.ai/activity'} 
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            style={{ fontSize: '11px', color: '#10b981', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            EXPLORE <ExternalLink size={12} />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {(!Array.isArray(billing) || billing.length === 0) && !loading && (
                <div style={{ textAlign: 'center', padding: '120px', backgroundColor: 'rgba(17,17,24,0.6)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '24px', backgroundColor: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                        <Database size={40} color="#374151" />
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginBottom: '12px' }}>Operational Data Missing</div>
                    <p style={{ fontSize: '15px', color: '#6b7280', maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
                        No billing telemetry found. Link a workspace management key above or register client-specific API keys in the configuration portal.
                    </p>
                </div>
            )}
        </div>
    );
};

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
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
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={18} color="#10b981" />
                            Recent AI Activity
                        </h3>
                        <button onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'api-logs' }))} style={{ ...styles.buttonSecondary, fontSize: '12px', padding: '4px 12px' }}>View All</button>
                    </div>
                    
                    {summary?.recentLogs && summary.recentLogs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {summary.recentLogs.map((log: any) => (
                                <div key={log.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: log.response_status < 400 ? '#10b981' : '#ef4444' }}></div>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{log.model?.split('/').pop()}</div>
                                            <div style={{ fontSize: '11px', color: '#6b7280' }}>{log.client_name} • {new Date(log.created_at).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#10b981' }}>${(log.billed_cost || 0).toFixed(3)}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                            <p>No recent AI activity recorded</p>
                        </div>
                    )}
                </div>

                <div style={styles.card}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Zap size={18} color="#f59e0b" />
                            Service Status
                        </h3>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.1)' }}>
                            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>OPENROUTER</div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>OPERATIONAL</div>
                        </div>
                        <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.05)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.1)' }}>
                            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, marginBottom: '4px' }}>OPENAI WHISPER</div>
                            <div style={{ fontSize: '18px', fontWeight: 700 }}>OPERATIONAL</div>
                        </div>
                    </div>
                    <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700, marginBottom: '8px' }}>QUICK ACTIONS</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'ai-jobs' }))} style={{ ...styles.buttonSecondary, fontSize: '11px', flex: 1 }}>Job Queue</button>
                            <button onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'clients' }))} style={{ ...styles.buttonSecondary, fontSize: '11px', flex: 1 }}>Manage Clients</button>
                        </div>
                    </div>
                </div>
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

    const exportCSV = () => {
        const headers = ['Client Name', 'Shortcode', 'Plan', 'Billing Type', 'Credits ($)', 'Setup Fee ($)', 'Jobs (Month)', 'Revenue (Month)', 'Status'];
        const rows = clients.map(client => {
            const clientSummary = billingData?.clientSummaries?.find((s: any) => s.id === client.id);
            return [
                `"${client.description || client.name}"`,
                client.name,
                client.plan,
                client.billing_type || 'PER_REQUEST',
                (client.credits || 0).toFixed(2),
                (client.setup_fee || 0).toFixed(2),
                clientSummary?.jobs_this_month || 0,
                (clientSummary?.revenue_this_month || 0).toFixed(2),
                getStatus(client)
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `billing-report-${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportExcel = () => {
        const headers = ['Client Name', 'Shortcode', 'Plan', 'Billing Type', 'Credits ($)', 'Setup Fee ($)', 'Jobs (Month)', 'Revenue (Month)', 'Status'];
        const rows = clients.map(client => {
            const clientSummary = billingData?.clientSummaries?.find((s: any) => s.id === client.id);
            return [
                client.description || client.name,
                client.name,
                client.plan,
                client.billing_type || 'PER_REQUEST',
                (client.credits || 0).toFixed(2),
                (client.setup_fee || 0).toFixed(2),
                clientSummary?.jobs_this_month || 0,
                (clientSummary?.revenue_this_month || 0).toFixed(2),
                getStatus(client)
            ];
        });

        let xml = `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:o="urn:schemas-microsoft-com:office:office"\n xmlns:x="urn:schemas-microsoft-com:office:excel"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:html="http://www.w3.org/TR/REC-html40">\n <Worksheet ss:Name="Billing Report">\n  <Table>\n   <Row ss:Index="1">`;
        headers.forEach(h => {
            xml += `\n    <Cell><Data ss:Type="String">${h}</Data></Cell>`;
        });
        xml += '\n   </Row>';
        rows.forEach(r => {
            xml += '\n   <Row>';
            r.forEach(val => {
                const type = typeof val === 'number' || (!isNaN(Number(val)) && val !== '') ? 'Number' : 'String';
                xml += `\n    <Cell><Data ss:Type="${type}">${val}</Data></Cell>`;
            });
            xml += '\n   </Row>';
        });
        xml += `\n  </Table>\n </Worksheet>\n</Workbook>`;

        const link = document.createElement("a");
        link.setAttribute("href", 'data:application/vnd.ms-excel;charset=utf-8,' + encodeURIComponent(xml));
        link.setAttribute("download", `billing-report-${new Date().toISOString().split('T')[0]}.xls`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Client Billing</h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={exportCSV} style={{ ...styles.buttonSecondary, padding: '6px 12px', fontSize: '12px' }}>📥 Export CSV</button>
                        <button onClick={exportExcel} style={{ ...styles.buttonSecondary, padding: '6px 12px', fontSize: '12px' }}>📊 Export Excel</button>
                        <button onClick={() => window.print()} style={{ ...styles.buttonSecondary, padding: '6px 12px', fontSize: '12px' }}>🖨️ Print PDF</button>
                    </div>
                </div>
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
                            
                            const formatRate = (moduleRate: any, defaultVal: string) => {
                                if (!moduleRate) return `$${defaultVal}`;
                                if (typeof moduleRate === 'object') {
                                    if (moduleRate.pricing_type === 'per_minute') {
                                        return `$${Number(moduleRate.cost_per_minute).toFixed(3)}/m`;
                                    }
                                    if (moduleRate.pricing_type === 'tiered') {
                                        return 'Tiered';
                                    }
                                    return `$${Number(moduleRate.cost_per_job ?? defaultVal).toFixed(3)}`;
                                }
                                return `$${Number(moduleRate).toFixed(3)}`;
                            };
                            
                            const rateText = [
                                `Trans: ${formatRate(rates?.transcription, '0.006')}`,
                                `Sub: ${formatRate(rates?.subtitles, '0.015')}`,
                                `Meta: ${formatRate(rates?.metadata, '0.015')}`,
                                `Ad: ${formatRate(rates?.ad_breaks, '0.025')}`,
                                `Promo: ${formatRate(rates?.promo_breaks, '0.025')}`,
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
    const pricingType = value?.pricing_type || (value?.tiers ? 'tiered' : 'flat');
    
    const handleTypeChange = (type: 'flat' | 'tiered' | 'per_minute') => {
        if (type === 'flat') {
            onChange({ cost_per_job: typeof value === 'object' ? (value.cost_per_job ?? 0) : (value ?? 0) });
        } else if (type === 'tiered') {
            onChange({ 
                pricing_type: 'tiered', 
                tiers: value?.tiers || [{ max_seconds: 1200, cost: typeof value === 'object' ? (value.cost_per_job ?? 0) : (value ?? 0) }, { max_seconds: -1, cost: typeof value === 'object' ? (value.cost_per_job ?? 0) : (value ?? 0) }] 
            });
        } else if (type === 'per_minute') {
            onChange({
                pricing_type: 'per_minute',
                cost_per_minute: value?.cost_per_minute || 0.05
            });
        }
    };

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
                    <span style={{ fontSize: '10px', color: '#6b7280' }}>Model</span>
                    <select
                        value={pricingType}
                        onChange={(e) => handleTypeChange(e.target.value as any)}
                        style={{ ...styles.input, padding: '2px 6px', fontSize: '11px', width: '110px', color: '#fff', backgroundColor: '#0a0a0f' }}
                    >
                        <option value="flat">Flat Rate</option>
                        <option value="tiered">Tiered</option>
                        <option value="per_minute">Per Minute</option>
                    </select>
                </div>
            </div>

            {pricingType === 'flat' && (
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
            )}

            {pricingType === 'per_minute' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>Per Minute ($)</span>
                    <input 
                        type="number" 
                        step="0.001" 
                        value={value?.cost_per_minute ?? 0.05} 
                        onChange={(e) => onChange({ pricing_type: 'per_minute', cost_per_minute: Number(e.target.value) })} 
                        style={{ ...styles.input, padding: '4px 8px', fontSize: '12px', width: '80px' }} 
                    />
                </div>
            )}

            {pricingType === 'tiered' && (
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


function ClientModal({ client, authFetch, onClose, onSave, saving }: { client: Client | null; authFetch: (url: string, options?: RequestInit) => Promise<Response>; onClose: () => void; onSave: (data: any) => void; saving: boolean }) {
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
        module_rates: moduleRates,
        provider_bal_openai: client?.provider_bal_openai || 0,
        provider_bal_openrouter: client?.provider_bal_openrouter || 0,
        provider_warn_threshold: client?.provider_warn_threshold || 25.0,
        allow_rate_card_fetch: client?.allow_rate_card_fetch || 0,
    });

    // Auto-generate short_code if empty and name is typed
    useEffect(() => {
        if (!formData.short_code && formData.name.length >= 3) {
            setFormData(prev => ({ ...prev, short_code: prev.name.substring(0, 3).toUpperCase() }));
        }
    }, [formData.name, formData.short_code]);

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
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
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
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>
                            Allow Rate Card Sync
                        </label>
                        <select 
                            value={formData.allow_rate_card_fetch} 
                            onChange={(e) => setFormData({ ...formData, allow_rate_card_fetch: Number(e.target.value) })} 
                            style={{ ...styles.input, backgroundColor: formData.allow_rate_card_fetch ? 'rgba(16, 185, 129, 0.1)' : 'rgba(10, 10, 15, 0.8)' }}
                        >
                            <option value={0}>Disabled (Hidden)</option>
                            <option value={1}>Enabled (Public)</option>
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
                            value={formData.credits} 
                            onChange={(e) => setFormData({ ...formData, credits: parseFloat(e.target.value) })} 
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
                                value={isNaN(formData.provider_bal_openai) ? '' : formData.provider_bal_openai}
                                onChange={(e) => setFormData({ ...formData, provider_bal_openai: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                style={{ ...styles.input, borderColor: 'rgba(16,185,129,0.3)' }}
                                placeholder="e.g. 10.00"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>OpenRouter Balance ($)</label>
                            <input
                                type="number" step="0.01" min="0"
                                value={isNaN(formData.provider_bal_openrouter) ? '' : formData.provider_bal_openrouter}
                                onChange={(e) => setFormData({ ...formData, provider_bal_openrouter: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                style={{ ...styles.input, borderColor: 'rgba(16,185,129,0.3)' }}
                                placeholder="e.g. 10.00"
                            />
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>Low Balance Warning Threshold ($)</label>
                        <input
                            type="number" step="0.01" min="0"
                            value={isNaN(formData.provider_warn_threshold) ? '' : formData.provider_warn_threshold}
                            onChange={(e) => setFormData({ ...formData, provider_warn_threshold: e.target.value === '' ? 25 : parseFloat(e.target.value) })}
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
                    <button 
                        onClick={() => onSave({
                            ...formData,
                            credits: isNaN(formData.credits) ? 0 : formData.credits,
                            provider_bal_openai: isNaN(formData.provider_bal_openai) ? 0 : formData.provider_bal_openai,
                            provider_bal_openrouter: isNaN(formData.provider_bal_openrouter) ? 0 : formData.provider_bal_openrouter,
                            provider_warn_threshold: isNaN(formData.provider_warn_threshold) ? 2.5 : formData.provider_warn_threshold
                        })} 
                        style={{ ...styles.button, opacity: (saving || !formData.name || !formData.short_code) ? 0.6 : 1, cursor: (saving || !formData.name || !formData.short_code) ? 'not-allowed' : 'pointer' }} 
                        disabled={saving || !formData.name || !formData.short_code}
                    >
                        {saving ? '💾 Saving...' : (client ? 'Save Changes' : 'Create Client')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ConfigView({ 
    clients, apiKeys, clientModels, availableModels, loading, onRefresh, 
    onAddApiKey, onToggleApiKey, onDeleteApiKey, onSaveModel, clientCredentials, 
    onSaveCredentials, globalDefaultModel, onSaveGlobalDefaultModel, authFetch
}: {
    clients: Client[];
    apiKeys: Record<number, any[]>;
    clientModels: Record<number, any[]>;
    availableModels: any[];
    loading: boolean;
    onRefresh: () => void;
    onAddApiKey: (clientId: number, provider: string, apiKey: string) => void;
    onToggleApiKey: (keyId: number, clientId: number) => void;
    onDeleteApiKey: (keyId: number, clientId: number) => void;
    onSaveModel: (clientUUID: string, models: any[]) => Promise<void>;
    clientCredentials: Record<number, { supabase_url: string; supabase_anon_key: string }>;
    onSaveCredentials: (clientId: number, credentials: any) => void;
    globalDefaultModel: string;
    onSaveGlobalDefaultModel: (model: string) => void;
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
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
            const res = await authFetch(`/api/mgmt/clients/${clientId}/ai-settings`, {
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
            const res = await authFetch('/api/mgmt/status/balance-alerts');
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
            const res = await authFetch(`/api/mgmt/clients/${selectedClient}/ai-settings`, {
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
            const res = await authFetch(`/api/mgmt/clients/${selectedClient}/credentials`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ supabaseUrl: credsForm.supabaseUrl, supabaseAnonKey: credsForm.supabaseAnonKey })
            });
            const data = await res.json();
            if (res.ok) {
                setCredsMessage({ type: 'success', text: 'Credentials saved!' });
                onSaveCredentials(selectedClient, { supabase_url: credsForm.supabaseUrl, supabase_anon_key: credsForm.supabaseAnonKey });
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

    const [localGlobalModel, setLocalGlobalModel] = useState(globalDefaultModel);

    useEffect(() => {
        setLocalGlobalModel(globalDefaultModel);
    }, [globalDefaultModel]);

    return (
        <div>
            {/* Global Fallback Setting */}
            <div style={{ ...styles.card, marginBottom: '24px', border: '1px solid rgba(16,185,129,0.1)', background: 'linear-gradient(to right, rgba(16,185,129,0.03), transparent)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Zap size={20} color="#10b981" />
                        Global AI Fallback Model
                    </h3>
                    <span style={{ fontSize: '11px', color: '#6b7280', backgroundColor: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '12px' }}>System Policy</span>
                </div>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '20px', maxWidth: '800px' }}>
                    This model will be used as a last resort for any module that has no specific model configuration. 
                    If this is empty, jobs with missing configurations will be <strong style={{ color: '#ef4444' }}>rejected</strong> with an error.
                </p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: '8px' }}>Fallback Model Identifier (OpenRouter)</label>
                        <input 
                            style={{ ...styles.input, width: '100%' }}
                            placeholder="e.g. anthropic/claude-3.5-sonnet"
                            value={localGlobalModel}
                            onChange={(e) => setLocalGlobalModel(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={() => onSaveGlobalDefaultModel(localGlobalModel)}
                        style={{ ...styles.button, padding: '12px 24px' }}
                    >
                        Update Global Policy
                    </button>
                </div>
            </div>
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
                                        type="text"
                                        value={apiKeyForm.key}
                                        onChange={(e) => setApiKeyForm({ ...apiKeyForm, key: e.target.value })}
                                        placeholder={apiKeyForm.provider === 'openai' ? 'sk-...' : 'sk-or-v1-...'}
                                        style={{ ...styles.input, width: '100%', color: '#fff', WebkitTextSecurity: 'disc', textSecurity: 'disc' } as any}
                                        autoComplete="new-password"
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

function SettingsView({ availableModels, clientModels, clients, authFetch, onRefresh }: {
    availableModels: any[];
    clientModels: any[];
    clients: any[];
    authFetch: (url: string, options?: RequestInit) => Promise<Response>;
    onRefresh: () => void;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [newModel, setNewModel] = useState({ module_id: 'subtitles', provider: 'openrouter', model_id: '', display_name: '' });
    const [loading, setLoading] = useState(false);
    const [modelSearch, setModelSearch] = useState('');
    const [tableFilter, setTableFilter] = useState('');
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const [discoveredModels, setDiscoveredModels] = useState<any[]>([]);
    const [discovering, setDiscovering] = useState(false);

    const triggerDiscovery = useCallback(async (force = false) => {
        const providersRequiringDiscovery = ['openrouter', 'anthropic', 'google', 'deepseek', 'meta'];
        if (providersRequiringDiscovery.includes(newModel.provider) && (discoveredModels.length === 0 || force)) {
            setDiscovering(true);
            try {
                const res = await authFetch('/api/mgmt/available-models/discover-openrouter');
                const data = await res.json();
                console.log('[UI] Discovery response:', data);
                if (data.success) {
                    setDiscoveredModels(data.models || []);
                    console.log(`[UI] Set ${data.models?.length} discovered models`);
                }
            } catch (err) {
                console.error('Discovery failed:', err);
            } finally {
                setDiscovering(false);
            }
        }
    }, [newModel.provider, discoveredModels.length, authFetch]);

    useEffect(() => {
        triggerDiscovery();
    }, [newModel.provider, triggerDiscovery]);

    const modules = [...new Set(availableModels.map((m: any) => m.module_id))];
    
    // Get unique providers from available models
    const providers = [...new Set(availableModels.map((m: any) => m.provider))];
    
    const providerModels = useMemo(() => {
        if (!newModel.provider) return [];
        
        const results: any[] = [];
        const seen = new Set();
        
        // 1. Add models already in the DB for this provider
        availableModels.forEach((m: any) => {
            if (m.provider === newModel.provider && !seen.has(m.model_id)) {
                seen.add(m.model_id);
                results.push({
                    model_id: m.model_id,
                    display_name: m.display_name,
                    provider: m.provider,
                    already_added: true
                });
            }
        });

        // 2. Add discovered models from OpenRouter
        // If provider is 'openrouter', show all. Otherwise filter by provider name prefix
        let targetPrefix = newModel.provider;
        if (targetPrefix === 'openrouter') targetPrefix = '';
        
        discoveredModels.forEach((dm: any) => {
            if (!seen.has(dm.id)) {
                if (!targetPrefix || dm.id.startsWith(targetPrefix + '/')) {
                    seen.add(dm.id);
                    results.push({
                        model_id: dm.id,
                        display_name: dm.name,
                        provider: 'openrouter',
                        is_discovered: true,
                        already_added: false
                    });
                }
            }
        });

        console.log(`[UI] Provider: ${newModel.provider}, DB Models: ${results.filter(r => r.already_added).length}, Discovered: ${results.filter(r => !r.already_added).length}`);

        return results.sort((a, b) => {
            if (a.already_added && !b.already_added) return 1;
            if (!a.already_added && b.already_added) return -1;
            return a.display_name.localeCompare(b.display_name);
        });
    }, [availableModels, newModel.provider, discoveredModels]);

    const filteredProviderModels = useMemo(() => {
        if (!modelSearch) return providerModels;
        const search = modelSearch.toLowerCase();
        return providerModels.filter(m => 
            m.display_name.toLowerCase().includes(search) || 
            m.model_id.toLowerCase().includes(search)
        );
    }, [providerModels, modelSearch]);

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
        setMessage(null);
        try {
            const res = await authFetch('/api/mgmt/available-models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newModel)
            });
            if (res.ok) {
                setMessage({ text: 'Model added successfully', type: 'success' });
                setNewModel({ module_id: 'subtitles', provider: 'openrouter', model_id: '', display_name: '' });
                setShowAddForm(false);
                onRefresh();
            } else {
                const data = await res.json();
                setMessage({ text: data.error || 'Failed to add model', type: 'error' });
            }
        } catch (err) {
            console.error('Failed to add model', err);
            setMessage({ text: 'Network error while adding model', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (id: number) => {
        await authFetch(`/api/mgmt/available-models/${id}/toggle`, { method: 'POST' });
        onRefresh();
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Are you absolutely sure? Deleting a model that is currently in use by a client will break their AI functionality.')) return;
        setLoading(true);
        try {
            const res = await authFetch(`/api/mgmt/available-models/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setMessage({ text: 'Model deleted successfully', type: 'success' });
                onRefresh();
            } else {
                const data = await res.json();
                setMessage({ text: data.error || 'Failed to delete model', type: 'error' });
            }
        } catch (err) {
            setMessage({ text: 'Error deleting model', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const getModelAssignments = (modelId: string, provider: string) => {
        return clientModels.filter(cm => cm.api_model === modelId && cm.api_provider === provider);
    };

    const [activeSubTab, setActiveSubTab] = useState<'assignments' | 'catalog'>('assignments');

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
                                    setDiscoveredModels([]); // Clear to force re-fetch on next select
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

            {/* Sub-Tabs */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <button 
                    onClick={() => setActiveSubTab('assignments')}
                    style={{ 
                        padding: '12px 4px', 
                        fontSize: '14px', 
                        fontWeight: 500, 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        color: activeSubTab === 'assignments' ? '#10b981' : '#6b7280',
                        borderBottom: activeSubTab === 'assignments' ? '2px solid #10b981' : '2px solid transparent'
                    }}
                >
                    📋 Active Assignments
                </button>
                <button 
                    onClick={() => setActiveSubTab('catalog')}
                    style={{ 
                        padding: '12px 4px', 
                        fontSize: '14px', 
                        fontWeight: 500, 
                        background: 'none', 
                        border: 'none', 
                        cursor: 'pointer',
                        color: activeSubTab === 'catalog' ? '#10b981' : '#6b7280',
                        borderBottom: activeSubTab === 'catalog' ? '2px solid #10b981' : '2px solid transparent'
                    }}
                >
                    📂 Full Catalog ({availableModels.length})
                </button>
            </div>

            {/* Feedback Message */}
            {message && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    backgroundColor: message.type === 'success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    color: message.type === 'success' ? '#10b981' : '#ef4444',
                    border: `1px solid ${message.type === 'success' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span>{message.text}</span>
                    <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={14} /></button>
                </div>
            )}

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
                                <option value="openrouter" style={{ backgroundColor: '#0a0a0f' }}>OpenRouter (All)</option>
                                <option value="anthropic" style={{ backgroundColor: '#0a0a0f' }}>Anthropic</option>
                                <option value="google" style={{ backgroundColor: '#0a0a0f' }}>Google / Gemini</option>
                                <option value="deepseek" style={{ backgroundColor: '#0a0a0f' }}>DeepSeek</option>
                                <option value="meta" style={{ backgroundColor: '#0a0a0f' }}>Meta / Llama</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', marginBottom: '6px', color: '#9ca3af' }}>Model ID</label>
                            
                            {/* Search Filter for Adding */}
                            <div style={{ marginBottom: '8px', position: 'relative' }}>
                                <input 
                                    type="text"
                                    placeholder="Search catalog..."
                                    value={modelSearch}
                                    onChange={(e) => setModelSearch(e.target.value)}
                                    style={{ 
                                        ...styles.input, 
                                        width: '100%', 
                                        fontSize: '11px', 
                                        padding: '8px 12px',
                                        borderColor: modelSearch ? COLORS.primary : 'rgba(255,255,255,0.1)',
                                        backgroundColor: 'rgba(255,255,255,0.02)'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
                                    <select
                                        value={newModel.model_id}
                                        onChange={(e) => {
                                            if (e.target.value === 'CUSTOM') {
                                                setNewModel({ ...newModel, model_id: '', display_name: '' });
                                            } else {
                                                const selected = providerModels.find((m: any) => m.model_id === e.target.value);
                                                setNewModel({ ...newModel, model_id: e.target.value, display_name: selected?.display_name || '' });
                                            }
                                        }}
                                        style={{ ...styles.input, flex: 1, color: '#fff' }}
                                    >
                                        <option value="" style={{ backgroundColor: '#0a0a0f' }}>
                                            {discovering ? 'Searching OpenRouter...' : `Select a model (${filteredProviderModels.length})...`}
                                        </option>
                                        <option value="CUSTOM" style={{ backgroundColor: '#0a0a0f', color: COLORS.primary }}>+ Enter Custom ID...</option>
                                        {filteredProviderModels.map((m: any) => (
                                            <option key={m.model_id} value={m.model_id} style={{ backgroundColor: '#0a0a0f', color: m.already_added ? COLORS.textMuted : '#fff' }}>
                                                {m.display_name} {m.already_added ? '(Added)' : (m.is_discovered ? '(New)' : '')}
                                            </option>
                                        ))}
                                    </select>
                                    <button 
                                        onClick={() => triggerDiscovery(true)}
                                        disabled={discovering}
                                        title="Refresh catalog"
                                        style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', cursor: 'pointer' }}
                                    >
                                        <RefreshCcw size={16} className={discovering ? 'animate-spin' : ''} color={COLORS.primary} />
                                    </button>
                                </div>
                                {(!newModel.model_id || !providerModels.find(m => m.model_id === newModel.model_id)) && (
                                    <input
                                        type="text"
                                        value={newModel.model_id}
                                        onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value })}
                                        placeholder="Enter ID..."
                                        style={{ ...styles.input, flex: 1, color: COLORS.primary, borderColor: COLORS.primary }}
                                    />
                                )}
                            </div>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Available Models Table</h3>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#6b7280' }} />
                        <input 
                            type="text"
                            placeholder="Filter table models..."
                            value={tableFilter}
                            onChange={(e) => setTableFilter(e.target.value)}
                            style={{ ...styles.input, paddingLeft: '32px', width: '250px', fontSize: '12px' }}
                        />
                    </div>
                </div>

                <table style={styles.table}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Module</th>
                            <th style={styles.th}>Provider</th>
                            <th style={styles.th}>Model ID</th>
                            <th style={styles.th}>Display Name</th>
                            <th style={styles.th}>Assignments</th>
                            <th style={styles.th}>Status</th>
                            <th style={styles.th}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {availableModels
                            .filter((m: any) => {
                                const assignments = getModelAssignments(m.model_id, m.provider);
                                if (activeSubTab === 'assignments' && assignments.length === 0) return false;
                                
                                const search = tableFilter.toLowerCase();
                                return (
                                    m.display_name.toLowerCase().includes(search) || 
                                    m.model_id.toLowerCase().includes(search) ||
                                    m.provider.toLowerCase().includes(search)
                                );
                            })
                            .map((model: any) => {
                                const assignments = getModelAssignments(model.model_id, model.provider);
                                return (
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
                                            {assignments.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                    {assignments.map((a, i) => {
                                                        const client = clients.find(c => c.id === a.client_id);
                                                        return (
                                                            <span key={i} style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }} title={a.module_name}>
                                                                {client?.name || `ID:${a.client_id}`}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: '11px', color: '#6b7280' }}>Unassigned</span>
                                            )}
                                        </td>
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
                                                <button 
                                                    onClick={() => handleDelete(model.id)} 
                                                    disabled={loading}
                                                    style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#ef4444', borderColor: '#ef4444', opacity: assignments.length > 0 ? 0.3 : 1 }}
                                                    title={assignments.length > 0 ? "Cannot delete: This model is assigned to clients" : "Delete model"}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
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
                                <th style={{ ...styles.th, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Request Content</th>
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
                                        title="Click to open deep-dive diagnostic inspector for this request"
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
                                                    <span style={{ fontSize: '10px', color: '#6b7280', fontFamily: 'monospace' }}>{log.request_id || 'ANALYSIS'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600 }}>{log.client_name}</span>
                                                <span style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }} title={log.parent_job_id}>
                                                    {log.parent_job_id ? `JOB: ${log.parent_job_id}` : 'DIRECT_API'}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ fontSize: '11px', color: COLORS.textDim, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    try {
                                                        const body = typeof log.request_body === 'string' ? JSON.parse(log.request_body) : log.request_body;
                                                        if (body?.module === 'subtitle_translation') return `Translate -> ${body.target_language || '?'}`;
                                                        if (body?.filename) return body.filename;
                                                        if (body?.messages) return body.messages[body.messages.length - 1]?.content?.substring(0, 50);
                                                        return log.endpoint?.replace('/api/', '');
                                                    } catch {
                                                        return log.endpoint;
                                                    }
                                                })()}
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
    const [searchQuery, setSearchQuery] = useState('');

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

    const handleFreeResource = async (id: string) => {
        if (!confirm('Forcefully abort this processing job to free up resources? This will fail the job instantly.')) return;
        const res = await authFetch(`/api/mgmt/ai-queue/${id}/free`, { method: 'POST' });
        if (res.ok) {
            load();
        } else {
            const data = await res.json();
            alert('Failed to free resource: ' + (data.error || 'Unknown error'));
        }
    };

    const handleChangePriority = async (id: string, priority: number) => {
        await authFetch(`/api/mgmt/ai-queue/${id}/priority`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority })
        });
        load();
    };

    useEffect(() => { load(); }, [filter, clientFilter]);

    const statusColor = (s: string) => {
        if (s === 'completed') return { bg: 'rgba(16,185,129,0.2)', text: '#10b981' };
        if (s === 'processing') return { bg: 'rgba(59,130,246,0.2)', text: '#3b82f6' };
        if (s === 'error') return { bg: 'rgba(239,68,68,0.2)', text: '#ef4444' };
        if (s === 'partial') return { bg: 'rgba(245,158,11,0.2)', text: '#f59e0b' };
        return { bg: 'rgba(107,114,128,0.2)', text: '#9ca3af' };
    };

    const filteredItems = items.filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        
        const idMatch = String(item.id || '').toLowerCase().includes(q);
        const localIdMatch = String(item.local_job_id || '').toLowerCase().includes(q);
        const clientNameMatch = String(item.client_name || '').toLowerCase().includes(q);
        const audioPathMatch = String(item.audio_path || '').toLowerCase().includes(q);
        const errorMessageMatch = String(item.error_message || '').toLowerCase().includes(q);
        
        return idMatch || localIdMatch || clientNameMatch || audioPathMatch || errorMessageMatch;
    });

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

            <div style={{ ...styles.card, padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                    {/* Left: Tab Switcher */}
                    <div style={{ display: 'flex', gap: '8px', padding: '4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {[
                            { id: 'all', label: 'All' },
                            { id: 'pending', label: 'Queue' },
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

                    {/* Middle/Right: Beautiful Search Bar */}
                    <div style={{ flex: 1, minWidth: '320px', position: 'relative' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: '#6b7280' }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search by Job ID, Client Name, File Name, or Error..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                ...styles.input,
                                width: '100%',
                                paddingLeft: '38px',
                                paddingRight: searchQuery ? '32px' : '12px',
                                marginBottom: 0,
                                fontSize: '13px',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: '8px',
                                color: '#fff',
                                transition: 'all 0.2s'
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: '#9ca3af',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    padding: '4px'
                                }}
                            >
                                &times;
                            </button>
                        )}
                    </div>
                </div>

                {/* Sub-row for filters and toggles */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', flexWrap: 'wrap', gap: '16px' }}>
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
                                    <th style={styles.th}>Queue Status</th>
                                    <th style={styles.th}>Priority</th>
                                    <th style={styles.th}>Duration</th>
                                    <th style={styles.th}>AI Latency</th>
                                    <th style={styles.th}>Billed (USD)</th>
                                    {showProviderCosts && <th style={{ ...styles.th, color: '#f59e0b' }}>Provider (USD)</th>}
                                    <th style={styles.th}>Error</th>
                                    <th style={styles.th}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map(item => {
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
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ padding: '4px 10px', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, backgroundColor: sc.bg, color: sc.text, width: 'fit-content' }}>
                                                            {item.queue_status || item.status}
                                                        </span>
                                                        {item.queue_status === 'processing' && item.sub_status && (
                                                            <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                                                                {item.sub_status}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    {item.queue_status === 'pending' ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <button onClick={() => handleChangePriority(item.id, (item.priority || 0) + 1)} style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px' }}>⬆️</button>
                                                            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{item.priority || 0}</span>
                                                            <button onClick={() => handleChangePriority(item.id, (item.priority || 0) - 1)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}>⬇️</button>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#6b7280', fontSize: '12px' }}>-</span>
                                                    )}
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#60a5fa' }}>
                                                        {item.file_duration ? (() => {
                                                            const d = item.file_duration;
                                                            return d < 60 ? `${d}s` : `${Math.floor(d/60)}m ${Math.round(d%60)}s`;
                                                        })() : '-'}
                                                    </div>
                                                </td>
                                                <td style={styles.td}>
                                                    <div style={{ fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>
                                                        {item.status === 'processing' || item.status === 'pending' ? '-' : (() => {
                                                            const start = new Date(item.created_at.includes('Z') ? item.created_at : item.created_at + 'Z').getTime();
                                                            const end = new Date(item.updated_at.includes('Z') ? item.updated_at : item.updated_at + 'Z').getTime();
                                                            const s = Math.floor((end - start) / 1000);
                                                            if (s < 0 || isNaN(s)) return '-';
                                                            if (s < 60) return `${s}s`;
                                                            return `${Math.floor(s/60)}m ${s%60}s`;
                                                        })()}
                                                    </div>
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
                                                        {item.status !== 'processing' && item.queue_status !== 'processing' && item.queue_status !== 'pending' && (
                                                            <button 
                                                                onClick={() => handleRetry(item.id)} 
                                                                style={{ ...styles.buttonSecondary, padding: '4px 8px', fontSize: '11px', color: '#10b981', borderColor: '#10b981' }}
                                                                title="Rerun failed or skipped modules"
                                                            >
                                                                🔄 Rerun
                                                            </button>
                                                        )}
                                                        {item.queue_status === 'processing' && (
                                                            <button 
                                                                onClick={() => handleFreeResource(item.id)} 
                                                                style={{ ...styles.buttonDanger, padding: '4px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                title="Abort this job instantly"
                                                            >
                                                                🛑 Free Resource
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
                                                                    {/* Side-by-Side Media Info and Billing Dashboard */}
                                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                                                        {/* Media Info Card */}
                                                                        <div style={{ padding: '16px', backgroundColor: 'rgba(59,130,246,0.04)', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.1)' }}>
                                                                            <div style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                📁 Media File Information
                                                                            </div>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                                    <span style={{ color: '#9ca3af', fontSize: '10px', textTransform: 'uppercase' }}>Source Audio Path</span>
                                                                                    <span style={{ fontFamily: 'monospace', color: '#fff', wordBreak: 'break-all', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }} title={item.audio_path}>
                                                                                        {item.audio_path || 'N/A'}
                                                                                    </span>
                                                                                </div>
                                                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '4px' }}>
                                                                                    <div>
                                                                                        <span style={{ color: '#9ca3af', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>File Name</span>
                                                                                        <span style={{ fontWeight: 600, color: '#60a5fa', fontSize: '13px' }}>
                                                                                            {item.audio_path ? item.audio_path.split(/[\\/]/).pop() : 'N/A'}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div>
                                                                                        <span style={{ color: '#9ca3af', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>Media Duration</span>
                                                                                        <span style={{ fontWeight: 600, color: '#fff', fontSize: '13px' }}>
                                                                                            {item.file_duration ? (() => {
                                                                                                const d = item.file_duration;
                                                                                                return d < 60 ? `${d}s` : `${Math.floor(d/60)}m ${Math.round(d%60)}s`;
                                                                                            })() : 'N/A'}
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Billing Summary Card */}
                                                                        <div style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.04)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.1)', display: 'flex', flexDirection: 'column' }}>
                                                                            <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                                                                                💰 API Billing Summary (Client Billed)
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', flex: 1 }}>
                                                                                {(() => {
                                                                                    const totals: Record<string, number> = {};
                                                                                    jobLogs.forEach(l => {
                                                                                        const name = l.endpoint?.includes('transcription') ? 'Transcription' :
                                                                                                   l.endpoint?.includes('subtitles') ? 'Subtitles' :
                                                                                                   l.endpoint?.split('/').pop() || 'Other';
                                                                                        totals[name] = (totals[name] || 0) + (l.billed_cost || 0);
                                                                                    });
                                                                                    if (Object.keys(totals).length === 0) {
                                                                                        return <span style={{ color: '#6b7280', fontSize: '11px' }}>No billed events recorded yet.</span>;
                                                                                    }
                                                                                    return Object.entries(totals).map(([name, cost]) => (
                                                                                        <div key={name} style={{ padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '11px' }}>
                                                                                            <span style={{ color: '#9ca3af' }}>{name}:</span> <span style={{ fontWeight: 700, color: '#fff' }}>${cost.toFixed(4)}</span>
                                                                                        </div>
                                                                                    ));
                                                                                })()}
                                                                            </div>
                                                                            <div style={{ padding: '8px 14px', backgroundColor: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', fontSize: '13px', alignSelf: 'flex-start', color: '#10b981', fontWeight: 800 }}>
                                                                                Total Billed: ${(item.total_cost_usd != null ? Number(item.total_cost_usd) : jobLogs.reduce((s, l) => s + (l.billed_cost || 0), 0)).toFixed(4)}
                                                                            </div>
                                                                        </div>

                                                                        {/* Provider Cost Summary Card */}
                                                                        {showProviderCosts && (
                                                                            <div style={{ padding: '16px', backgroundColor: 'rgba(245,158,11,0.04)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.1)', display: 'flex', flexDirection: 'column' }}>
                                                                                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '10px' }}>
                                                                                    🏦 Provider Cost Summary (Actual API Cost)
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px', flex: 1 }}>
                                                                                    {(() => {
                                                                                        const totals: Record<string, number> = {};
                                                                                        jobLogs.forEach(l => {
                                                                                            const name = l.endpoint?.includes('transcription') ? 'Transcription' :
                                                                                                       l.endpoint?.includes('subtitles') ? 'Subtitles' :
                                                                                                       l.endpoint?.split('/').pop() || 'Other';
                                                                                            totals[name] = (totals[name] || 0) + (l.cost_usd || 0);
                                                                                        });
                                                                                        if (Object.keys(totals).length === 0) {
                                                                                            return <span style={{ color: '#6b7280', fontSize: '11px' }}>No provider costs recorded yet.</span>;
                                                                                        }
                                                                                        return Object.entries(totals).map(([name, cost]) => (
                                                                                            <div key={name} style={{ padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '11px' }}>
                                                                                                <span style={{ color: '#9ca3af' }}>{name}:</span> <span style={{ fontWeight: 700, color: '#f59e0b' }}>${cost.toFixed(4)}</span>
                                                                                            </div>
                                                                                        ));
                                                                                    })()}
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                    <div style={{ padding: '8px 14px', backgroundColor: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '13px', color: '#f59e0b', fontWeight: 800 }}>
                                                                                        Total Cost: ${(item.provider_cost_usd != null ? Number(item.provider_cost_usd) : jobLogs.reduce((s, l) => s + (l.cost_usd || 0), 0)).toFixed(4)}
                                                                                    </div>
                                                                                    {(() => {
                                                                                        const totalBilled = item.total_cost_usd != null ? Number(item.total_cost_usd) : jobLogs.reduce((s, l) => s + (l.billed_cost || 0), 0);
                                                                                        const totalProvider = item.provider_cost_usd != null ? Number(item.provider_cost_usd) : jobLogs.reduce((s, l) => s + (l.cost_usd || 0), 0);
                                                                                        const margin = totalBilled > 0 ? ((totalBilled - totalProvider) / totalBilled) * 100 : 0;
                                                                                        if (totalBilled <= 0) return null;
                                                                                        return (
                                                                                            <div style={{ 
                                                                                                padding: '8px 12px', 
                                                                                                backgroundColor: margin >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', 
                                                                                                border: `1px solid ${margin >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`, 
                                                                                                borderRadius: '8px', 
                                                                                                fontSize: '11px', 
                                                                                                fontWeight: 700,
                                                                                                color: margin >= 0 ? '#34d399' : '#f87171'
                                                                                            }}>
                                                                                                Profit Margin: {margin.toFixed(1)}%
                                                                                            </div>
                                                                                        );
                                                                                    })()}
                                                                                </div>
                                                                            </div>
                                                                        )}
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

                                                            {/* AI Module Database Results (Source of Truth) */}
                                                            {(() => {
                                                                const isProcessing = item.status === 'processing' || item.status === 'pending';
                                                                if (isProcessing) {
                                                                    return (
                                                                        <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                                                                            <h4 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                🤖 AI Module Database Results (Source of Truth)
                                                                            </h4>
                                                                            <div style={{ padding: '16px', backgroundColor: 'rgba(59,130,246,0.04)', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                                <span className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#3b82f6', display: 'inline-block', boxShadow: '0 0 8px #3b82f6' }} />
                                                                                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                                                                                    Job is currently <strong>{item.status.toUpperCase()}</strong>. Final SQLite results will populate here once processing completes.
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                const parsedResults = (() => {
                                                                    try {
                                                                        return typeof item.result_data === 'string' ? JSON.parse(item.result_data) : item.result_data;
                                                                    } catch (e) {
                                                                        return null;
                                                                    }
                                                                })();
                                                                if (!parsedResults || !Array.isArray(parsedResults) || parsedResults.length === 0) return null;
                                                                return (
                                                                    <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '20px' }}>
                                                                        <h4 style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: '#9ca3af', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            🤖 AI Module Database Results (Source of Truth)
                                                                        </h4>
                                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                                                                            {parsedResults.map((mod: any, index: number) => {
                                                                                const name = mod.module_name || mod.moduleName || 'Original / Transcription';
                                                                                const lang = mod.result_type || mod.resultType || 'original';
                                                                                const data = mod.result_data || mod.resultData;
                                                                                const hasError = data && (data.error || (typeof data === 'object' && Object.keys(data).length === 1 && data.error));
                                                                                const errorText = hasError ? (data.error || 'Failed to process') : null;
                                                                                
                                                                                // Surgically map this module to its corresponding child log inside jobLogs to calculate absolute Request In / Out times
                                                                                const matchingLog = jobLogs.find(l => {
                                                                                    const ep = (l.endpoint || '').toLowerCase();
                                                                                    const mName = name.toLowerCase();
                                                                                    const targetLang = lang.replace('subtitle_', '').toLowerCase();
                                                                                    
                                                                                    if (mName === 'transcription' && ep.includes('transcription')) return true;
                                                                                    if (mName === 'subtitles' && ep.includes('subtitles')) return true;
                                                                                    if (mName === 'metadata' && ep.includes('metadata')) return true;
                                                                                    if (mName === 'ad_breaks' && ep.includes('ad_breaks')) return true;
                                                                                    if (mName === 'promo_breaks' && ep.includes('promo_breaks')) return true;
                                                                                    if (mName === 'subtitle_translation' && ep.includes('subtitle_translation') && ep.includes(targetLang)) return true;
                                                                                    return false;
                                                                                });

                                                                                // Calculate absolute timestamps
                                                                                let inTimeStr = 'N/A';
                                                                                let outTimeStr = 'N/A';
                                                                                let latencyStr = 'N/A';

                                                                                if (matchingLog) {
                                                                                    const outDate = new Date(matchingLog.created_at.includes('Z') ? matchingLog.created_at : matchingLog.created_at + 'Z');
                                                                                    const latencyMs = matchingLog.latency_ms || matchingLog.latencyMs || 0;
                                                                                    const inDate = new Date(outDate.getTime() - latencyMs);
                                                                                    
                                                                                    const formatTimeWithMs = (d: Date) => {
                                                                                        return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
                                                                                    };
                                                                                    
                                                                                    inTimeStr = formatTimeWithMs(inDate);
                                                                                    outTimeStr = formatTimeWithMs(outDate);
                                                                                    latencyStr = `${(latencyMs / 1000).toFixed(2)}s (${latencyMs.toLocaleString()} ms)`;
                                                                                } else {
                                                                                    const latencyMs = mod.processing_time_ms || mod.processingTimeMs || 0;
                                                                                    if (latencyMs > 0) {
                                                                                        latencyStr = `${(latencyMs / 1000).toFixed(2)}s (${latencyMs.toLocaleString()} ms)`;
                                                                                    }
                                                                                }

                                                                                return (
                                                                                    <div 
                                                                                        key={index} 
                                                                                        style={{ 
                                                                                            padding: '14px', 
                                                                                            backgroundColor: 'rgba(255,255,255,0.02)', 
                                                                                            borderRadius: '10px', 
                                                                                            border: hasError ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
                                                                                            display: 'flex',
                                                                                            flexDirection: 'column',
                                                                                            gap: '8px'
                                                                                        }}
                                                                                    >
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                            <span style={{ fontSize: '13px', fontWeight: 700, color: hasError ? '#ef4444' : '#10b981' }}>
                                                                                                {name}
                                                                                            </span>
                                                                                            <span style={{ 
                                                                                                fontSize: '9px', 
                                                                                                fontWeight: 700, 
                                                                                                textTransform: 'uppercase', 
                                                                                                padding: '2px 6px', 
                                                                                                borderRadius: '4px',
                                                                                                backgroundColor: hasError ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                                                                                                color: hasError ? '#ef4444' : '#10b981'
                                                                                            }}>
                                                                                                {lang}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.4' }}>
                                                                                            {hasError ? (
                                                                                                <div style={{ color: '#fca5a5', fontWeight: 500, backgroundColor: 'rgba(239,68,68,0.05)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.1)', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                                                                                                    ⚠️ <strong>Error:</strong> {errorText}
                                                                                                </div>
                                                                                            ) : (
                                                                                                <div style={{ color: '#a7f3d0' }}>
                                                                                                    ✅ <strong>Processed successfully.</strong>
                                                                                                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px', fontFamily: 'monospace' }}>
                                                                                                        Size: {JSON.stringify(data).length} chars
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                        
                                                                                        {/* Timestamps Section */}
                                                                                        <div style={{ 
                                                                                            marginTop: '4px',
                                                                                            padding: '8px 10px', 
                                                                                            backgroundColor: 'rgba(255,255,255,0.015)', 
                                                                                            borderRadius: '8px', 
                                                                                            border: '1px solid rgba(255,255,255,0.03)',
                                                                                            fontSize: '11px',
                                                                                            display: 'flex',
                                                                                            flexDirection: 'column',
                                                                                            gap: '5px'
                                                                                        }}>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                                <span style={{ color: '#9ca3af', fontWeight: 500 }}>🕒 Request In:</span>
                                                                                                <span style={{ fontFamily: 'monospace', color: '#fff', fontSize: '11px', fontWeight: 600 }}>{inTimeStr}</span>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                                <span style={{ color: '#9ca3af', fontWeight: 500 }}>⏱️ Request Out:</span>
                                                                                                <span style={{ fontFamily: 'monospace', color: '#fff', fontSize: '11px', fontWeight: 600 }}>{outTimeStr}</span>
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '5px', marginTop: '3px' }}>
                                                                                                <span style={{ color: '#9ca3af', fontWeight: 500 }}>⚡ Latency:</span>
                                                                                                <span style={{ fontFamily: 'monospace', color: '#3b82f6', fontWeight: 700 }}>{latencyStr}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setSelectedLog({
                                                                                                    id: `db-res-${item.id}-${index}`,
                                                                                                    request_id: `db-payload-${index}`,
                                                                                                    endpoint: `/api/ai/job/${name}`,
                                                                                                    model: mod.model || 'AI Model',
                                                                                                    response_status: hasError ? 403 : 200,
                                                                                                    cost_usd: mod.api_cost || mod.apiCost || 0,
                                                                                                    latency_ms: mod.processing_time_ms || mod.processingTimeMs || 0,
                                                                                                    request_body: JSON.stringify({ module: name, lang }),
                                                                                                    response_body: JSON.stringify(data),
                                                                                                    error_message: hasError ? errorText : null
                                                                                                });
                                                                                            }}
                                                                                            style={{
                                                                                                marginTop: 'auto',
                                                                                                alignSelf: 'flex-start',
                                                                                                background: 'rgba(255,255,255,0.03)',
                                                                                                border: '1px solid rgba(255,255,255,0.08)',
                                                                                                borderRadius: '6px',
                                                                                                padding: '4px 10px',
                                                                                                color: '#fff',
                                                                                                fontSize: '10px',
                                                                                                cursor: 'pointer',
                                                                                                fontWeight: 600,
                                                                                                transition: 'all 0.2s'
                                                                                            }}
                                                                                        >
                                                                                            🔍 Inspect DB Output
                                                                                        </button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
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
