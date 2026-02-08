'use client';

import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { modelOptions } from '@/lib/ai/constants';
import { ArrowDownToLine, ArrowUpFromLine, Bell, Brain, Check, CheckCircle2, Globe, Key, Loader2, Mail, MessageSquare, Palette, Save, Send, Search, Trash2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface ProviderStatus {
  provider: string;
  name: string;
  isAvailable: boolean;
  maskedToken: string | null;
  setupUrl: string;
}

interface EmailConfig {
  smtp: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    from: string | null;
    debugMode: boolean;
    debugAddress: string | null;
    isConfigured: boolean;
  };
  imap: {
    host: string | null;
    port: number;
    secure: boolean;
    user: string | null;
    isConfigured: boolean;
  };
}

interface ApiKey {
  id: string;
  provider: string;
  label: string | null;
  maskedKey: string | null;
  isActive: boolean;
}

interface TeamSettingsState {
  dailyLeadTarget: number;
  leadGenerationEnabled: boolean;
  scrapeDelayMs: number;
  maxLeadsPerRun: number;
  searchRadiusKm: number;
  minGoogleRating: number;
  targetIndustries: string[];
  blacklistedIndustries: string[];
  targetCities: string[];
  autoGenerateMessages: boolean;
  // Branding
  companyName: string;
  companyWebsite: string;
  companyTagline: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  whatsappPhone: string | null;
  socialFacebookUrl: string | null;
  socialInstagramUrl: string | null;
  socialLinkedinUrl: string | null;
  socialTwitterUrl: string | null;
  socialTiktokUrl: string | null;
  // IMAP Polling
  imapPollingIntervalMinutes: number;
}

interface AIConfig {
  id: string;
  name: string;
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<TeamSettingsState | null>(null);
  const [aiConfigs, setAIConfigs] = useState<AIConfig[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [emailStatus, setEmailStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [isTestingImap, setIsTestingImap] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [imapTestResult, setImapTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveEmailResult, setSaveEmailResult] = useState<{ success: boolean; message: string } | null>(null);

  // AI config form state
  const [selectedProvider, setSelectedProvider] = useState<string>('CURSOR');
  const [selectedModel, setSelectedModel] = useState(modelOptions[0].value);
  const [temperature, setTemperature] = useState(0.7);

  // Email config state
  const [, setEmailConfig] = useState<EmailConfig | null>(null);
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    maskedUser: null as string | null,
    from: '',
    debugMode: false,
    debugAddress: '',
  });
  const [imapForm, setImapForm] = useState({
    host: '',
    port: 993,
    secure: true,
    username: '',
    password: '',
    maskedUser: null as string | null,
  });
  const [proxyForm, setProxyForm] = useState({
    mode: 'none' as 'none' | 'system' | 'manual',
    httpHost: '',
    httpPort: '',
    useHttpForHttps: false,
    httpsHost: '',
    httpsPort: '',
    socksHost: '',
    socksPort: '',
    socksVersion: 5 as 4 | 5,
    noProxyFor: '',
    dnsOverSocks: false,
  });
  const [systemProxyInfo, setSystemProxyInfo] = useState<{ url: string | null; type: string | null } | null>(null);
  const [isSavingProxy, setIsSavingProxy] = useState(false);
  const [saveProxyResult, setSaveProxyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavingEmail, setIsSavingEmail] = useState(false);

  // API keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newApiKey, setNewApiKey] = useState({
    provider: 'OPENROUTER',
    apiKey: '',
    label: '',
  });

  // Notification state
  const [notifSettings, setNotifSettings] = useState({
    notificationsEnabled: false,
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    telegramBotTokenMasked: null as string | null,
    telegramChatIdMasked: null as string | null,
    telegramHasToken: false,
    telegramHasChatId: false,
    telegramEvents: ['message:approved', 'scraper:completed', 'scraper:error'] as string[],
    // Detected info (shown after verification)
    telegramBotUsername: null as string | null,
    telegramChatTitle: null as string | null,
  });
  const [isSavingNotif, setIsSavingNotif] = useState(false);
  const [isTestingNotif, setIsTestingNotif] = useState(false);
  const [isVerifyingTelegram, setIsVerifyingTelegram] = useState(false);
  const [notifSaveResult, setNotifSaveResult] = useState<{ success: boolean; message: string } | null>(null);
  const [notifTestResult, setNotifTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, aiRes, emailRes, emailConfigRes, apiKeysRes, notifRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/ai/config'),
        fetch('/api/email/status'),
        fetch('/api/settings/email-config'),
        fetch('/api/ai/keys'),
        fetch('/api/notifications/settings'),
      ]);

      const settingsData = await settingsRes.json();
      const aiData = await aiRes.json();
      const emailData = emailRes.ok ? await emailRes.json() : null;
      const emailConfigData = emailConfigRes.ok ? await emailConfigRes.json() : null;
      const apiKeysData = apiKeysRes.ok ? await apiKeysRes.json() : [];
      const notifData = notifRes.ok ? await notifRes.json() : null;

      setSettings(settingsData);
      setAIConfigs(aiData.configs || []);
      setProviderStatuses(aiData.providerStatuses || []);
      setEmailStatus(emailData);
      setEmailConfig(emailConfigData);
      setApiKeys(apiKeysData);

      // Initialize notification settings
      if (notifData) {
        setNotifSettings({
          notificationsEnabled: notifData.notificationsEnabled ?? false,
          telegramEnabled: notifData.telegramEnabled ?? false,
          telegramBotToken: '',
          telegramChatId: '',
          telegramBotTokenMasked: notifData.telegramBotTokenMasked ?? null,
          telegramChatIdMasked: notifData.telegramChatIdMasked ?? null,
          telegramHasToken: notifData.telegramHasToken ?? false,
          telegramHasChatId: notifData.telegramHasChatId ?? false,
          telegramEvents: notifData.telegramEvents ?? ['message:approved', 'scraper:completed', 'scraper:error'],
          telegramBotUsername: null,
          telegramChatTitle: null,
        });
      }

      // Initialize email forms from config
      if (emailConfigData) {
        setSmtpForm({
          host: emailConfigData.smtp.host || '',
          port: emailConfigData.smtp.port || 587,
          secure: emailConfigData.smtp.secure || false,
          username: '',
          password: '',
          maskedUser: emailConfigData.smtp.user || null,
          from: emailConfigData.smtp.from || '',
          debugMode: emailConfigData.smtp.debugMode || false,
          debugAddress: emailConfigData.smtp.debugAddress || '',
        });
        setImapForm({
          host: emailConfigData.imap.host || '',
          port: emailConfigData.imap.port || 993,
          secure: emailConfigData.imap.secure !== false,
          username: '',
          password: '',
          maskedUser: emailConfigData.imap.user || null,
        });
        if (emailConfigData.proxy) {
          setProxyForm({
            mode: emailConfigData.proxy.mode || 'none',
            httpHost: emailConfigData.proxy.httpHost || '',
            httpPort: emailConfigData.proxy.httpPort ? String(emailConfigData.proxy.httpPort) : '',
            useHttpForHttps: emailConfigData.proxy.useHttpForHttps || false,
            httpsHost: emailConfigData.proxy.httpsHost || '',
            httpsPort: emailConfigData.proxy.httpsPort ? String(emailConfigData.proxy.httpsPort) : '',
            socksHost: emailConfigData.proxy.socksHost || '',
            socksPort: emailConfigData.proxy.socksPort ? String(emailConfigData.proxy.socksPort) : '',
            socksVersion: emailConfigData.proxy.socksVersion || 5,
            noProxyFor: emailConfigData.proxy.noProxyFor || '',
            dnsOverSocks: emailConfigData.proxy.dnsOverSocks || false,
          });
        }
        if (emailConfigData.systemProxy) {
          setSystemProxyInfo(emailConfigData.systemProxy);
        }
      }
      
      // Set default provider to first available
      if (aiData.providerStatuses?.length > 0) {
        const firstAvailable = aiData.providerStatuses.find((p: ProviderStatus) => p.isAvailable);
        if (firstAvailable) {
          setSelectedProvider(firstAvailable.provider);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to save settings');
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAIConfig = async () => {
    const providerName = providerStatuses.find(p => p.provider === selectedProvider)?.name || selectedProvider;
    const modelLabel = modelOptions.find(m => m.value === selectedModel)?.label || selectedModel;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${providerName} - ${modelLabel}`,
          provider: selectedProvider,
          model: selectedModel,
          temperature,
          isActive: aiConfigs.length === 0,
        }),
      });

      if (!response.ok) throw new Error('Failed to create AI config');

      await fetchData();
    } catch (error) {
      console.error('Error creating AI config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetActiveConfig = async (configId: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: configId, isActive: true }),
      });

      if (!response.ok) throw new Error('Failed to update AI config');

      await fetchData();
    } catch (error) {
      console.error('Error updating AI config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/config', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: configId }),
      });

      if (!response.ok) throw new Error('Failed to delete AI config');

      await fetchData();
    } catch (error) {
      console.error('Error deleting AI config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestSmtpConnection = async () => {
    setIsTestingSmtp(true);
    setSmtpTestResult(null);
    try {
      const response = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'smtp' }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setSmtpTestResult({ success: true, message: data.message || 'SMTP connection successful!' });
        await fetchData();
      } else {
        setSmtpTestResult({ success: false, message: data.message || data.error || 'SMTP connection failed' });
      }
    } catch {
      setSmtpTestResult({ success: false, message: 'Failed to test SMTP connection' });
    } finally {
      setIsTestingSmtp(false);
    }
  };

  const handleTestImapConnection = async () => {
    setIsTestingImap(true);
    setImapTestResult(null);
    try {
      const response = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'imap' }),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setImapTestResult({ success: true, message: data.message || 'IMAP connection successful!' });
        await fetchData();
      } else {
        setImapTestResult({ success: false, message: data.message || data.error || 'IMAP connection failed' });
      }
    } catch {
      setImapTestResult({ success: false, message: 'Failed to test IMAP connection' });
    } finally {
      setIsTestingImap(false);
    }
  };

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/email/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setTestResult({ success: true, message: 'Test email sent successfully!' });
      } else {
        setTestResult({ success: false, message: data.message || data.error || 'Failed to send test email' });
      }
    } catch {
      setTestResult({ success: false, message: 'Failed to send test email' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleSaveEmailConfig = async () => {
    setIsSavingEmail(true);
    setSaveEmailResult(null);
    try {
      const payload: Record<string, unknown> = {
        smtpHost: smtpForm.host || null,
        smtpPort: smtpForm.port,
        smtpSecure: smtpForm.secure,
        emailFrom: smtpForm.from || null,
        emailDebugMode: smtpForm.debugMode,
        emailDebugAddress: smtpForm.debugAddress || null,
        imapHost: imapForm.host || null,
        imapPort: imapForm.port,
        imapSecure: imapForm.secure,
      };

      // Only include username/password if they were provided
      if (smtpForm.password) {
        payload.smtpUser = smtpForm.username;
        payload.smtpPass = smtpForm.password;
      } else if (smtpForm.username) {
        payload.smtpUser = smtpForm.username;
      }

      if (imapForm.password) {
        payload.imapUser = imapForm.username;
        payload.imapPass = imapForm.password;
      } else if (imapForm.username) {
        payload.imapUser = imapForm.username;
      }

      const response = await fetch('/api/settings/email-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save email config');
      }

      const data = await response.json();
      setEmailConfig(data);
      
      // Save polling interval to team settings
      if (settings) {
        await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imapPollingIntervalMinutes: settings.imapPollingIntervalMinutes ?? 0 }),
        });
      }

      // Clear password fields after successful save
      setSmtpForm(prev => ({ ...prev, password: '' }));
      setImapForm(prev => ({ ...prev, password: '' }));

      setSaveEmailResult({ success: true, message: 'Email configuration saved successfully!' });

      // Refresh email status
      const emailRes = await fetch('/api/email/status');
      if (emailRes.ok) {
        const emailData = await emailRes.json();
        setEmailStatus(emailData);
      }

      // Auto-dismiss success message after 5 seconds
      setTimeout(() => setSaveEmailResult(null), 5000);
    } catch (error) {
      console.error('Error saving email config:', error);
      setSaveEmailResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to save email config' 
      });
    } finally {
      setIsSavingEmail(false);
    }
  };

  const handleSaveProxyConfig = async () => {
    setIsSavingProxy(true);
    setSaveProxyResult(null);
    try {
      const payload: Record<string, unknown> = {
        proxyMode: proxyForm.mode,
      };

      if (proxyForm.mode === 'manual') {
        payload.proxyHttpHost = proxyForm.httpHost || null;
        payload.proxyHttpPort = proxyForm.httpPort ? parseInt(proxyForm.httpPort) : null;
        payload.proxyUseHttpForHttps = proxyForm.useHttpForHttps;
        payload.proxyHttpsHost = proxyForm.httpsHost || null;
        payload.proxyHttpsPort = proxyForm.httpsPort ? parseInt(proxyForm.httpsPort) : null;
        payload.proxySocksHost = proxyForm.socksHost || null;
        payload.proxySocksPort = proxyForm.socksPort ? parseInt(proxyForm.socksPort) : null;
        payload.proxySocksVersion = proxyForm.socksVersion;
        payload.proxyNoProxyFor = proxyForm.noProxyFor || null;
        payload.proxyDnsOverSocks = proxyForm.dnsOverSocks;
      } else {
        // Clear manual fields when not in manual mode
        payload.proxyHttpHost = null;
        payload.proxyHttpPort = null;
        payload.proxyUseHttpForHttps = false;
        payload.proxyHttpsHost = null;
        payload.proxyHttpsPort = null;
        payload.proxySocksHost = null;
        payload.proxySocksPort = null;
        payload.proxySocksVersion = null;
        payload.proxyNoProxyFor = null;
        payload.proxyDnsOverSocks = false;
      }

      const response = await fetch('/api/settings/email-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save proxy config');
      }

      const data = await response.json();

      // Update form state from response
      if (data.proxy) {
        setProxyForm({
          mode: data.proxy.mode || 'none',
          httpHost: data.proxy.httpHost || '',
          httpPort: data.proxy.httpPort ? String(data.proxy.httpPort) : '',
          useHttpForHttps: data.proxy.useHttpForHttps || false,
          httpsHost: data.proxy.httpsHost || '',
          httpsPort: data.proxy.httpsPort ? String(data.proxy.httpsPort) : '',
          socksHost: data.proxy.socksHost || '',
          socksPort: data.proxy.socksPort ? String(data.proxy.socksPort) : '',
          socksVersion: data.proxy.socksVersion || 5,
          noProxyFor: data.proxy.noProxyFor || '',
          dnsOverSocks: data.proxy.dnsOverSocks || false,
        });
      }
      if (data.systemProxy) {
        setSystemProxyInfo(data.systemProxy);
      }

      setSaveProxyResult({ success: true, message: 'Connection settings saved successfully!' });

      // Auto-dismiss success message after 5 seconds
      setTimeout(() => setSaveProxyResult(null), 5000);
    } catch (error) {
      console.error('Error saving proxy config:', error);
      setSaveProxyResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save proxy config',
      });
    } finally {
      setIsSavingProxy(false);
    }
  };

  const handleAddApiKey = async () => {
    if (!newApiKey.apiKey.trim()) {
      setTestResult({ success: false, message: 'API key is required' });
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newApiKey.provider,
          apiKey: newApiKey.apiKey,
          label: newApiKey.label || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add API key');
      }

      // Reset form and refresh
      setNewApiKey({ provider: 'OPENROUTER', apiKey: '', label: '' });
      await fetchData();
    } catch (error) {
      console.error('Error adding API key:', error);
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to add API key' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteApiKey = async (id: string) => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete API key');
      }

      await fetchData();
    } catch (error) {
      console.error('Error deleting API key:', error);
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to delete API key' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Notification Handlers ─────────────────────────────────

  const NOTIFIABLE_EVENT_OPTIONS = [
    { type: 'lead:created', label: 'New lead created' },
    { type: 'lead:status_changed', label: 'Lead status changed' },
    { type: 'message:created', label: 'Message generated' },
    { type: 'message:approved', label: 'Message approved / sent' },
    { type: 'scraper:completed', label: 'Scraper completed' },
    { type: 'scraper:error', label: 'Scraper error' },
  ];

  const handleSaveNotifSettings = async () => {
    setIsSavingNotif(true);
    setNotifSaveResult(null);
    try {
      const payload: Record<string, unknown> = {
        notificationsEnabled: notifSettings.notificationsEnabled,
        telegramEnabled: notifSettings.telegramEnabled,
        telegramEvents: notifSettings.telegramEvents,
      };
      // Only send credentials if the user entered new values
      if (notifSettings.telegramBotToken) {
        payload.telegramBotToken = notifSettings.telegramBotToken;
      }
      if (notifSettings.telegramChatId) {
        payload.telegramChatId = notifSettings.telegramChatId;
      }

      const res = await fetch('/api/notifications/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      setNotifSaveResult({ success: true, message: 'Notification settings saved' });
      // Refresh settings to get new masked values
      const refreshRes = await fetch('/api/notifications/settings');
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setNotifSettings((prev) => ({
          ...prev,
          telegramBotToken: '',
          telegramChatId: '',
          telegramBotTokenMasked: refreshData.telegramBotTokenMasked ?? null,
          telegramChatIdMasked: refreshData.telegramChatIdMasked ?? null,
          telegramHasToken: refreshData.telegramHasToken ?? false,
          telegramHasChatId: refreshData.telegramHasChatId ?? false,
        }));
      }
    } catch (error) {
      setNotifSaveResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save notification settings',
      });
    } finally {
      setIsSavingNotif(false);
    }
  };

  const handleVerifyTelegram = async () => {
    if (!notifSettings.telegramBotToken) {
      setNotifTestResult({ success: false, message: 'Please enter a bot token first' });
      return;
    }

    setIsVerifyingTelegram(true);
    setNotifTestResult(null);
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'telegram',
          action: 'verify',
          botToken: notifSettings.telegramBotToken,
        }),
      });
      const data = await res.json();

      if (data.success && data.chatId) {
        // Auto-fill the detected chat ID
        setNotifSettings((prev) => ({
          ...prev,
          telegramChatId: data.chatId,
          telegramBotUsername: data.bot?.username || null,
          telegramChatTitle: data.chatTitle || null,
        }));
        setNotifTestResult({
          success: true,
          message: `Connected to @${data.bot?.username}! Chat "${data.chatTitle}" detected.`,
        });
      } else if (data.tokenValid) {
        // Token valid but no chat found
        setNotifSettings((prev) => ({
          ...prev,
          telegramBotUsername: data.bot?.username || null,
        }));
        setNotifTestResult({
          success: false,
          message: `Bot @${data.bot?.username} verified, but: ${data.error}`,
        });
      } else {
        setNotifTestResult({ success: false, message: data.error || 'Verification failed' });
      }
    } catch (error) {
      setNotifTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Verification failed',
      });
    } finally {
      setIsVerifyingTelegram(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTestingNotif(true);
    setNotifTestResult(null);
    try {
      const payload: Record<string, unknown> = { channel: 'telegram', action: 'test' };
      // Use current values from state
      if (notifSettings.telegramBotToken) {
        payload.botToken = notifSettings.telegramBotToken;
      }
      if (notifSettings.telegramChatId) {
        payload.chatId = notifSettings.telegramChatId;
      }

      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setNotifTestResult({ success: true, message: 'Test message sent to Telegram!' });
      } else {
        setNotifTestResult({ success: false, message: data.error || 'Test failed' });
      }
    } catch (error) {
      setNotifTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed',
      });
    } finally {
      setIsTestingNotif(false);
    }
  };

  const toggleNotifEvent = (eventType: string) => {
    setNotifSettings((prev) => {
      const events = prev.telegramEvents.includes(eventType)
        ? prev.telegramEvents.filter((e) => e !== eventType)
        : [...prev.telegramEvents, eventType];
      return { ...prev, telegramEvents: events };
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const availableProviders = providerStatuses.filter(p => p.isAvailable);

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" description="Configure AI and scraping parameters" />

      <div className="flex-1 p-6 overflow-y-auto">
        <Tabs defaultValue="ai" className="space-y-4">
          <TabsList>
            <TabsTrigger value="ai" className="gap-2">
              <Brain className="h-4 w-4" />
              AI Configuration
            </TabsTrigger>
            <TabsTrigger value="email" className="gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Message Settings
            </TabsTrigger>
            <TabsTrigger value="proxy" className="gap-2">
              <Globe className="h-4 w-4" />
              Proxy
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* AI Configuration Tab */}
          <TabsContent value="ai" className="space-y-4">
            {/* API Keys Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Manage your AI provider API keys
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing Keys */}
                {apiKeys.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Configured Keys</Label>
                    <div className="grid gap-3">
                      {apiKeys.map((key) => (
                        <div
                          key={key.id}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            key.isActive 
                              ? 'border-green-500/30 bg-green-500/5' 
                              : 'border-muted'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${
                              key.isActive ? 'bg-green-500' : 'bg-muted-foreground/30'
                            }`} />
                            <div>
                              <div className="font-medium">{key.label || key.provider}</div>
                              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                                {key.maskedKey || '••••••••'}
                              </code>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {key.isActive && (
                              <Badge variant="default" className="bg-green-600">
                                <Check className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApiKey(key.id)}
                              disabled={isSaving}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add New Key Form */}
                <div className="pt-4 border-t space-y-4">
                  <Label className="text-sm font-medium">Add New API Key</Label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select
                        value={newApiKey.provider}
                        onValueChange={(value) => setNewApiKey(prev => ({ ...prev, provider: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                          <SelectItem value="OPENAI">OpenAI</SelectItem>
                          <SelectItem value="ANTHROPIC">Anthropic</SelectItem>
                          <SelectItem value="GOOGLE">Google</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        value={newApiKey.apiKey}
                        onChange={(e) => setNewApiKey(prev => ({ ...prev, apiKey: e.target.value }))}
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Label (optional)</Label>
                      <Input
                        value={newApiKey.label}
                        onChange={(e) => setNewApiKey(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="My API Key"
                      />
                    </div>
                  </div>
                  <Button onClick={handleAddApiKey} disabled={isSaving || !newApiKey.apiKey.trim()}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add Key
                  </Button>
                </div>

                {apiKeys.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No API keys configured</p>
                    <p className="text-sm">Add your API keys above to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Configurations */}
            <Card>
              <CardHeader>
                <CardTitle>Active Configuration</CardTitle>
                <CardDescription>
                  Select which AI provider and model to use for message generation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing Configs */}
                {aiConfigs.length > 0 ? (
                  <div className="space-y-2">
                    {aiConfigs.map((config) => (
                      <div
                        key={config.id}
                        className={`flex items-center justify-between p-4 rounded-lg border ${
                          config.isActive ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{config.name}</span>
                            {config.isActive && (
                              <Badge variant="default">Active</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Temperature: {config.temperature} | Max tokens: {config.maxTokens}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!config.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetActiveConfig(config.id)}
                              disabled={isSaving}
                            >
                              Set Active
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteConfig(config.id)}
                            disabled={isSaving}
                            className="text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/20">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-medium">No active AI configuration</p>
                    <p className="text-xs mt-1">
                      {availableProviders.length > 0
                        ? 'Add a configuration below to enable AI-powered message generation'
                        : 'Add an API key above first, then a default configuration will be created automatically'}
                    </p>
                  </div>
                )}

                {/* Add New Config */}
                {availableProviders.length > 0 && (
                  <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base">Add Configuration</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select
                          value={selectedProvider}
                          onValueChange={setSelectedProvider}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableProviders.map((provider) => (
                              <SelectItem key={provider.provider} value={provider.provider}>
                                {provider.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {modelOptions.map((model) => (
                              <SelectItem key={model.value} value={model.value}>
                                {model.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Temperature ({temperature})</Label>
                        <Slider
                          value={[temperature]}
                          onValueChange={(v) => setTemperature(v[0])}
                          min={0}
                          max={1}
                          step={0.1}
                        />
                      </div>
                    </div>

                    <Button onClick={handleCreateAIConfig} disabled={isSaving}>
                      {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Add Configuration
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Tab */}
          <TabsContent value="email" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Configuration
                </CardTitle>
                <CardDescription>
                  Configure your incoming (IMAP) and outgoing (SMTP) email server settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Save result feedback */}
                {saveEmailResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    saveEmailResult.success
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-destructive/10 border border-destructive/30'
                  }`}>
                    {saveEmailResult.success 
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    }
                    <span className={`text-sm ${
                      saveEmailResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {saveEmailResult.message}
                    </span>
                  </div>
                )}

                {/* ── IMAP (Incoming) ── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <ArrowDownToLine className="h-4 w-4 text-blue-500" />
                    <h3 className="font-semibold text-base">Incoming Mail (IMAP)</h3>
                    <span className="text-xs text-muted-foreground ml-auto">For receiving emails</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>IMAP Host</Label>
                      <Input
                        value={imapForm.host}
                        onChange={(e) => setImapForm(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="imap.gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IMAP Port</Label>
                      <Input
                        type="number"
                        value={imapForm.port}
                        onChange={(e) => setImapForm(prev => ({ ...prev, port: parseInt(e.target.value) || 993 }))}
                        placeholder="993"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IMAP Username</Label>
                      <Input
                        value={imapForm.username}
                        onChange={(e) => setImapForm(prev => ({ ...prev, username: e.target.value }))}
                        placeholder={imapForm.maskedUser || 'your-email@gmail.com'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>IMAP Password</Label>
                      <Input
                        type="password"
                        value={imapForm.password}
                        onChange={(e) => setImapForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Leave empty to keep current password"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Use Secure Connection (TLS/SSL)</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable for secure IMAP connections (port 993). Disable for plain or STARTTLS (port 143).
                      </p>
                    </div>
                    <Switch
                      checked={imapForm.secure}
                      onCheckedChange={(checked) => setImapForm(prev => ({ ...prev, secure: checked }))}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={handleTestImapConnection}
                      disabled={isTestingImap}
                      variant="outline"
                      size="sm"
                    >
                      {isTestingImap && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Test IMAP Connection
                    </Button>
                    {imapTestResult && (
                      <div className={`flex items-center gap-1.5 text-sm ${
                        imapTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                      }`}>
                        {imapTestResult.success 
                          ? <CheckCircle2 className="h-4 w-4 shrink-0" /> 
                          : <XCircle className="h-4 w-4 shrink-0" />
                        }
                        {imapTestResult.message}
                      </div>
                    )}
                  </div>

                  {/* Auto-check interval */}
                  <div className="flex items-center justify-between pt-2">
                    <div className="space-y-1">
                      <Label>Check for New Emails Automatically</Label>
                      <p className="text-sm text-muted-foreground">
                        How often to automatically check the inbox for new messages
                      </p>
                    </div>
                    <Select
                      value={String(settings?.imapPollingIntervalMinutes ?? 0)}
                      onValueChange={(value) =>
                        setSettings((prev) =>
                          prev ? { ...prev, imapPollingIntervalMinutes: parseInt(value) } : null
                        )
                      }
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Disabled</SelectItem>
                        <SelectItem value="1">Every 1 minute</SelectItem>
                        <SelectItem value="2">Every 2 minutes</SelectItem>
                        <SelectItem value="5">Every 5 minutes</SelectItem>
                        <SelectItem value="10">Every 10 minutes</SelectItem>
                        <SelectItem value="15">Every 15 minutes</SelectItem>
                        <SelectItem value="30">Every 30 minutes</SelectItem>
                        <SelectItem value="60">Every 60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* ── SMTP (Outgoing) ── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <ArrowUpFromLine className="h-4 w-4 text-emerald-500" />
                    <h3 className="font-semibold text-base">Outgoing Mail (SMTP)</h3>
                    <span className="text-xs text-muted-foreground ml-auto">For sending emails</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>SMTP Host</Label>
                      <Input
                        value={smtpForm.host}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, host: e.target.value }))}
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Port</Label>
                      <Input
                        type="number"
                        value={smtpForm.port}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, port: parseInt(e.target.value) || 587 }))}
                        placeholder="587"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Username</Label>
                      <Input
                        value={smtpForm.username}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, username: e.target.value }))}
                        placeholder={smtpForm.maskedUser || 'your-email@gmail.com'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SMTP Password</Label>
                      <Input
                        type="password"
                        value={smtpForm.password}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Leave empty to keep current password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>From Address</Label>
                      <Input
                        type="email"
                        value={smtpForm.from}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, from: e.target.value }))}
                        placeholder="noreply@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Debug Address</Label>
                      <Input
                        type="email"
                        value={smtpForm.debugAddress}
                        onChange={(e) => setSmtpForm(prev => ({ ...prev, debugAddress: e.target.value }))}
                        placeholder="debug@example.com"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Use Secure Connection (TLS/SSL)</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable for port 465 (SSL). Disable for port 587 (STARTTLS) or port 25 (plain).
                      </p>
                    </div>
                    <Switch
                      checked={smtpForm.secure}
                      onCheckedChange={(checked) => setSmtpForm(prev => ({ ...prev, secure: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Debug Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Send all emails to debug address instead of recipients
                      </p>
                    </div>
                    <Switch
                      checked={smtpForm.debugMode}
                      onCheckedChange={(checked) => setSmtpForm(prev => ({ ...prev, debugMode: checked }))}
                    />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button
                      onClick={handleTestSmtpConnection}
                      disabled={isTestingSmtp}
                      variant="outline"
                      size="sm"
                    >
                      {isTestingSmtp && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Test SMTP Connection
                    </Button>
                    <Button
                      onClick={handleSendTestEmail}
                      disabled={isSendingTest}
                      variant="outline"
                      size="sm"
                    >
                      {isSendingTest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Send Test Email
                    </Button>
                    {smtpTestResult && (
                      <div className={`flex items-center gap-1.5 text-sm ${
                        smtpTestResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                      }`}>
                        {smtpTestResult.success 
                          ? <CheckCircle2 className="h-4 w-4 shrink-0" /> 
                          : <XCircle className="h-4 w-4 shrink-0" />
                        }
                        {smtpTestResult.message}
                      </div>
                    )}
                    {testResult && (
                      <div className={`flex items-center gap-1.5 text-sm ${
                        testResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                      }`}>
                        {testResult.success 
                          ? <CheckCircle2 className="h-4 w-4 shrink-0" /> 
                          : <XCircle className="h-4 w-4 shrink-0" />
                        }
                        {testResult.message}
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Save Button ── */}
                <div className="pt-4 border-t">
                  <Button onClick={handleSaveEmailConfig} disabled={isSavingEmail}>
                    {isSavingEmail && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Email Config
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Branding Tab */}
          <TabsContent value="branding" className="space-y-4">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Configure your company details used in email templates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <input
                      type="text"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.companyName || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, companyName: e.target.value } : null
                        )
                      }
                      placeholder="The Tiny Web Factory"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company Website</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.companyWebsite || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, companyWebsite: e.target.value } : null
                        )
                      }
                      placeholder="https://thetinywebfactory.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Company Tagline</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings?.companyTagline || ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, companyTagline: e.target.value } : null
                      )
                    }
                    placeholder="Professional Web Design for Your Business"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo & Banner */}
            <Card>
              <CardHeader>
                <CardTitle>Logo & Banner</CardTitle>
                <CardDescription>
                  Add your company logo or banner image to email headers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <input
                    type="url"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings?.logoUrl || ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, logoUrl: e.target.value || null } : null
                      )
                    }
                    placeholder="https://example.com/logo.png"
                  />
                  {settings?.logoUrl && (
                    <div className="mt-2 p-4 border rounded-lg bg-muted/30">
                      <img
                        src={settings.logoUrl}
                        alt="Logo preview"
                        className="max-h-16 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Banner URL</Label>
                  <input
                    type="url"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings?.bannerUrl || ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, bannerUrl: e.target.value || null } : null
                      )
                    }
                    placeholder="https://example.com/banner.png"
                  />
                  {settings?.bannerUrl && (
                    <div className="mt-2 p-4 border rounded-lg bg-muted/30">
                      <img
                        src={settings.bannerUrl}
                        alt="Banner preview"
                        className="max-w-full max-h-32 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    If both logo and banner are set, the banner takes priority in emails. Recommended banner width: 600px.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* WhatsApp CTA */}
            <Card>
              <CardHeader>
                <CardTitle>WhatsApp CTA</CardTitle>
                <CardDescription>
                  Configure the WhatsApp call-to-action button in emails
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>WhatsApp Phone Number</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={settings?.whatsappPhone || ''}
                    onChange={(e) =>
                      setSettings((prev) =>
                        prev ? { ...prev, whatsappPhone: e.target.value || null } : null
                      )
                    }
                    placeholder="27662565938"
                  />
                  <p className="text-xs text-muted-foreground">
                    International format without + sign. Leave empty to hide the WhatsApp CTA button.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Social Media Links */}
            <Card>
              <CardHeader>
                <CardTitle>Social Media Links</CardTitle>
                <CardDescription>
                  Add social media links to the email footer. Only links with URLs will be shown.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Facebook</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.socialFacebookUrl || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, socialFacebookUrl: e.target.value || null } : null
                        )
                      }
                      placeholder="https://facebook.com/yourpage"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instagram</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.socialInstagramUrl || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, socialInstagramUrl: e.target.value || null } : null
                        )
                      }
                      placeholder="https://instagram.com/yourprofile"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>LinkedIn</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.socialLinkedinUrl || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, socialLinkedinUrl: e.target.value || null } : null
                        )
                      }
                      placeholder="https://linkedin.com/company/yourcompany"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Twitter / X</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.socialTwitterUrl || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, socialTwitterUrl: e.target.value || null } : null
                        )
                      }
                      placeholder="https://x.com/yourhandle"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>TikTok</Label>
                    <input
                      type="url"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      value={settings?.socialTiktokUrl || ''}
                      onChange={(e) =>
                        setSettings((prev) =>
                          prev ? { ...prev, socialTiktokUrl: e.target.value || null } : null
                        )
                      }
                      placeholder="https://tiktok.com/@yourhandle"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button onClick={handleSaveSettings} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                Save Branding
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open('/api/email/preview', '_blank')}
              >
                <Mail className="h-4 w-4 mr-2" />
                Preview Email
              </Button>
              <Button
                variant="outline"
                onClick={handleSendTestEmail}
                disabled={isSendingTest || !emailStatus?.isConfigured}
              >
                {isSendingTest && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send Test Email
              </Button>
            </div>
          </TabsContent>

          {/* Message Settings Tab */}
          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Message Generation Settings</CardTitle>
                <CardDescription>
                  Configure how messages are generated for leads.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto-Generate Messages</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically generate messages for new leads
                    </p>
                  </div>
                  <Switch
                    checked={settings?.autoGenerateMessages ?? true}
                    onCheckedChange={(checked) =>
                      setSettings((prev) =>
                        prev ? { ...prev, autoGenerateMessages: checked } : null
                      )
                    }
                  />
                </div>

                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Proxy Tab (Thunderbird-style Connection Settings) */}
          <TabsContent value="proxy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Connection Settings
                </CardTitle>
                <CardDescription>
                  Configure proxies to access the internet. These settings apply to all mail connections (IMAP &amp; SMTP).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Save result feedback */}
                {saveProxyResult && (
                  <div className={`flex items-center gap-2 p-3 rounded-lg ${
                    saveProxyResult.success
                      ? 'bg-green-500/10 border border-green-500/30'
                      : 'bg-destructive/10 border border-destructive/30'
                  }`}>
                    {saveProxyResult.success
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      : <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    }
                    <span className={`text-sm ${
                      saveProxyResult.success ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                    }`}>
                      {saveProxyResult.message}
                    </span>
                  </div>
                )}

                {/* ── Proxy Mode Radio Buttons ── */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="proxyMode"
                      checked={proxyForm.mode === 'none'}
                      onChange={() => setProxyForm(prev => ({ ...prev, mode: 'none' }))}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm font-medium">No proxy</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="proxyMode"
                      checked={proxyForm.mode === 'system'}
                      onChange={() => setProxyForm(prev => ({ ...prev, mode: 'system' }))}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm font-medium">Use system proxy settings</span>
                  </label>

                  {/* System proxy detected info */}
                  {proxyForm.mode === 'system' && (
                    <div className="ml-7 p-3 rounded-lg bg-muted/50 border text-sm">
                      <span className="font-medium">Detected: </span>
                      {systemProxyInfo?.url ? (
                        <code className="text-muted-foreground">{systemProxyInfo.url}</code>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">
                          No system proxy detected. Set HTTP_PROXY, HTTPS_PROXY, or ALL_PROXY environment variable.
                        </span>
                      )}
                    </div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="proxyMode"
                      checked={proxyForm.mode === 'manual'}
                      onChange={() => setProxyForm(prev => ({ ...prev, mode: 'manual' }))}
                      className="h-4 w-4 text-primary"
                    />
                    <span className="text-sm font-medium">Manual proxy configuration:</span>
                  </label>
                </div>

                {/* ── Manual Proxy Fields ── */}
                {proxyForm.mode === 'manual' && (
                  <div className="ml-7 space-y-4 p-4 rounded-lg border bg-muted/20">
                    {/* HTTP Proxy */}
                    <div className="flex items-center gap-3">
                      <Label className="w-28 text-sm shrink-0">HTTP Proxy:</Label>
                      <Input
                        value={proxyForm.httpHost}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, httpHost: e.target.value }))}
                        placeholder="proxy.example.com"
                        className="flex-1"
                      />
                      <Label className="text-sm shrink-0">Port:</Label>
                      <Input
                        type="number"
                        value={proxyForm.httpPort}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, httpPort: e.target.value }))}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>

                    {/* "Also use this proxy for HTTPS" checkbox */}
                    <div className="ml-28 pl-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={proxyForm.useHttpForHttps}
                          onChange={(e) => setProxyForm(prev => ({ ...prev, useHttpForHttps: e.target.checked }))}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Also use this proxy for HTTPS</span>
                      </label>
                    </div>

                    {/* HTTPS Proxy */}
                    <div className="flex items-center gap-3">
                      <Label className={`w-28 text-sm shrink-0 ${proxyForm.useHttpForHttps ? 'text-muted-foreground' : ''}`}>
                        HTTPS Proxy:
                      </Label>
                      <Input
                        value={proxyForm.useHttpForHttps ? proxyForm.httpHost : proxyForm.httpsHost}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, httpsHost: e.target.value }))}
                        placeholder="proxy.example.com"
                        className="flex-1"
                        disabled={proxyForm.useHttpForHttps}
                      />
                      <Label className={`text-sm shrink-0 ${proxyForm.useHttpForHttps ? 'text-muted-foreground' : ''}`}>
                        Port:
                      </Label>
                      <Input
                        type="number"
                        value={proxyForm.useHttpForHttps ? proxyForm.httpPort : proxyForm.httpsPort}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, httpsPort: e.target.value }))}
                        placeholder="0"
                        className="w-24"
                        disabled={proxyForm.useHttpForHttps}
                      />
                    </div>

                    {/* SOCKS Host */}
                    <div className="flex items-center gap-3">
                      <Label className="w-28 text-sm shrink-0">SOCKS Host:</Label>
                      <Input
                        value={proxyForm.socksHost}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, socksHost: e.target.value }))}
                        placeholder="127.0.0.1"
                        className="flex-1"
                      />
                      <Label className="text-sm shrink-0">Port:</Label>
                      <Input
                        type="number"
                        value={proxyForm.socksPort}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, socksPort: e.target.value }))}
                        placeholder="0"
                        className="w-24"
                      />
                    </div>

                    {/* SOCKS version radio */}
                    <div className="ml-28 pl-1 flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="socksVersion"
                          checked={proxyForm.socksVersion === 4}
                          onChange={() => setProxyForm(prev => ({ ...prev, socksVersion: 4 }))}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">SOCKS v4</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="socksVersion"
                          checked={proxyForm.socksVersion === 5}
                          onChange={() => setProxyForm(prev => ({ ...prev, socksVersion: 5 }))}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">SOCKS v5</span>
                      </label>
                    </div>

                    {/* Separator */}
                    <div className="border-t my-2" />

                    {/* No proxy for */}
                    <div className="space-y-2">
                      <Label className="text-sm text-destructive font-medium">No proxy for:</Label>
                      <textarea
                        value={proxyForm.noProxyFor}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, noProxyFor: e.target.value }))}
                        placeholder=".mozilla.org, .net.nz, 192.168.1.0/24"
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[60px] resize-y"
                      />
                      <p className="text-xs text-muted-foreground">
                        Example: .mozilla.org, .net.nz, 192.168.1.0/24
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Connections to localhost, 127.0.0.1, and ::1 are never proxied.
                      </p>
                    </div>

                    {/* Proxy DNS when using SOCKS v5 */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={proxyForm.dnsOverSocks}
                        onChange={(e) => setProxyForm(prev => ({ ...prev, dnsOverSocks: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      <span className="text-sm">Proxy DNS when using SOCKS v5</span>
                    </label>
                  </div>
                )}

                <div className="pt-4 border-t flex gap-3">
                  <Button onClick={handleSaveProxyConfig} disabled={isSavingProxy}>
                    {isSavingProxy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Connection Settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            {/* Master Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notification Settings
                </CardTitle>
                <CardDescription>
                  Receive real-time alerts about leads, messages, and scraper activity on your favourite messaging platforms.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Notifications</Label>
                    <p className="text-sm text-muted-foreground">Master switch for all notification providers</p>
                  </div>
                  <Switch
                    checked={notifSettings.notificationsEnabled}
                    onCheckedChange={(checked) =>
                      setNotifSettings((prev) => ({ ...prev, notificationsEnabled: checked }))
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Telegram Provider */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5" />
                      Telegram
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      Send notifications to a Telegram chat via a bot.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {notifSettings.telegramHasToken && notifSettings.telegramHasChatId ? (
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Not configured
                      </Badge>
                    )}
                    <Switch
                      checked={notifSettings.telegramEnabled}
                      onCheckedChange={(checked) =>
                        setNotifSettings((prev) => ({ ...prev, telegramEnabled: checked }))
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground space-y-1">
                  <p><strong>Quick setup:</strong></p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Message <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-primary underline">@BotFather</a> on Telegram and create a new bot.</li>
                    <li>Copy the <strong>Bot Token</strong> and paste it below.</li>
                    <li>Start a chat with your bot (or add it to a group) and send <code>/start</code>.</li>
                    <li>Click <strong>Verify & Detect Chat</strong> — we'll find your chat automatically!</li>
                  </ol>
                </div>

                {/* Bot Token */}
                <div className="space-y-2">
                  <Label htmlFor="telegram-bot-token">Bot Token</Label>
                  {notifSettings.telegramHasToken && !notifSettings.telegramBotToken && (
                    <p className="text-xs text-muted-foreground">
                      Current: {notifSettings.telegramBotTokenMasked} — leave blank to keep
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      id="telegram-bot-token"
                      type="password"
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                      value={notifSettings.telegramBotToken}
                      onChange={(e) =>
                        setNotifSettings((prev) => ({ ...prev, telegramBotToken: e.target.value }))
                      }
                      className="flex-1"
                    />
                    <Button
                      variant="secondary"
                      onClick={handleVerifyTelegram}
                      disabled={isVerifyingTelegram || !notifSettings.telegramBotToken}
                    >
                      {isVerifyingTelegram && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Verify & Detect Chat
                    </Button>
                  </div>
                </div>

                {/* Detected Chat Info */}
                {(notifSettings.telegramChatId || notifSettings.telegramHasChatId) && (
                  <div className="rounded-lg border bg-green-50 dark:bg-green-950/20 p-3 text-sm space-y-1">
                    <p className="font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4 inline mr-1" />
                      Chat detected
                    </p>
                    <p className="text-muted-foreground">
                      {notifSettings.telegramChatTitle && (
                        <span>Chat: <strong>{notifSettings.telegramChatTitle}</strong> • </span>
                      )}
                      ID: <code className="bg-muted px-1 rounded">{notifSettings.telegramChatId || notifSettings.telegramChatIdMasked}</code>
                    </p>
                    {notifSettings.telegramBotUsername && (
                      <p className="text-muted-foreground">
                        Bot: <a href={`https://t.me/${notifSettings.telegramBotUsername}`} target="_blank" rel="noreferrer" className="text-primary">@{notifSettings.telegramBotUsername}</a>
                      </p>
                    )}
                  </div>
                )}

                {/* Event Toggles */}
                <div className="space-y-2">
                  <Label>Events to notify</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {NOTIFIABLE_EVENT_OPTIONS.map((opt) => (
                      <label key={opt.type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={notifSettings.telegramEvents.includes(opt.type)}
                          onChange={() => toggleNotifEvent(opt.type)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Result Messages */}
                {notifSaveResult && (
                  <div className={`flex items-center gap-2 text-sm ${notifSaveResult.success ? 'text-green-600' : 'text-destructive'}`}>
                    {notifSaveResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {notifSaveResult.message}
                  </div>
                )}
                {notifTestResult && (
                  <div className={`flex items-center gap-2 text-sm ${notifTestResult.success ? 'text-green-600' : 'text-destructive'}`}>
                    {notifTestResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    {notifTestResult.message}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 border-t flex gap-3">
                  <Button onClick={handleSaveNotifSettings} disabled={isSavingNotif}>
                    {isSavingNotif && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTestNotification}
                    disabled={isTestingNotif || (!notifSettings.telegramChatId && !notifSettings.telegramHasChatId)}
                  >
                    {isTestingNotif && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Send className="h-4 w-4 mr-2" />
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Slack (Coming Soon) */}
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Slack
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      Post notifications to a Slack channel via webhook.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
              </CardHeader>
            </Card>

            {/* WhatsApp (Coming Soon) */}
            <Card className="opacity-60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      WhatsApp
                    </CardTitle>
                    <CardDescription className="mt-1.5">
                      Send notifications via WhatsApp Business API.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Coming soon</Badge>
                </div>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
