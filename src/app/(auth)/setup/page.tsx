'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, ChevronLeft, ChevronRight, Key, Loader2, Mail, Shield, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Step = 'account' | 'team' | 'email' | 'ai';

interface SetupData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  teamName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailFrom: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  aiProvider: string;
  aiApiKey: string;
}

const STEPS: { key: Step; title: string; description: string; icon: React.ReactNode }[] = [
  { key: 'account', title: 'Create Account', description: 'Set up your admin account', icon: <Shield className="h-5 w-5" /> },
  { key: 'team', title: 'Create Team', description: 'Name your organization', icon: <Users className="h-5 w-5" /> },
  { key: 'email', title: 'Email Config', description: 'SMTP & IMAP (optional)', icon: <Mail className="h-5 w-5" /> },
  { key: 'ai', title: 'AI Provider', description: 'API key (optional)', icon: <Key className="h-5 w-5" /> },
];

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SetupData>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    teamName: '',
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    emailFrom: '',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapUser: '',
    imapPass: '',
    aiProvider: 'OPENROUTER',
    aiApiKey: '',
  });

  // Check if setup is needed
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await fetch('/api/setup');
        const result = await res.json();
        if (!result.needsSetup) {
          router.replace('/login');
        }
      } catch {
        // If check fails, show setup anyway
      } finally {
        setIsChecking(false);
      }
    }
    checkSetup();
  }, [router]);

  const updateField = <K extends keyof SetupData>(field: K, value: SetupData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateStep = (): boolean => {
    const step = STEPS[currentStep].key;
    
    if (step === 'account') {
      if (!data.name.trim()) { setError('Name is required'); return false; }
      if (!data.email.trim()) { setError('Email is required'); return false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { setError('Invalid email address'); return false; }
      if (data.password.length < 6) { setError('Password must be at least 6 characters'); return false; }
      if (data.password !== data.confirmPassword) { setError('Passwords do not match'); return false; }
    }
    
    if (step === 'team') {
      if (!data.teamName.trim()) { setError('Team name is required'); return false; }
    }

    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setIsLoading(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        password: data.password,
        teamName: data.teamName,
      };

      // Include SMTP config if host is provided
      if (data.smtpHost) {
        payload.smtpHost = data.smtpHost;
        payload.smtpPort = data.smtpPort;
        payload.smtpSecure = data.smtpSecure;
        if (data.smtpUser) payload.smtpUser = data.smtpUser;
        if (data.smtpPass) payload.smtpPass = data.smtpPass;
        if (data.emailFrom) payload.emailFrom = data.emailFrom;
      }

      // Include IMAP config if host is provided
      if (data.imapHost) {
        payload.imapHost = data.imapHost;
        payload.imapPort = data.imapPort;
        payload.imapSecure = data.imapSecure;
        if (data.imapUser) payload.imapUser = data.imapUser;
        if (data.imapPass) payload.imapPass = data.imapPass;
      }

      // Include AI key if provided
      if (data.aiApiKey) {
        payload.aiProvider = data.aiProvider;
        payload.aiApiKey = data.aiApiKey;
      }

      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Setup failed');
        return;
      }

      // Redirect to login
      router.push('/login?setup=complete');
    } catch {
      setError('An error occurred during setup. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-bold text-2xl">T</span>
          </div>
          <h1 className="text-3xl font-bold">Welcome to TTWF Lead Generator</h1>
          <p className="text-muted-foreground mt-2">Let&apos;s get your workspace set up in a few steps.</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, i) => (
            <div key={step.key} className="flex items-center">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  i === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : i < currentStep
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStep ? <CheckCircle2 className="h-4 w-4" /> : step.icon}
                <span className="hidden sm:inline">{step.title}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${i < currentStep ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card>
          <CardHeader>
            <CardTitle>{STEPS[currentStep].title}</CardTitle>
            <CardDescription>{STEPS[currentStep].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}

            {STEPS[currentStep].key === 'account' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={data.name}
                    onChange={e => updateField('name', e.target.value)}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={data.email}
                    onChange={e => updateField('email', e.target.value)}
                    placeholder="admin@yourcompany.com"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={data.password}
                      onChange={e => updateField('password', e.target.value)}
                      placeholder="Min 6 characters"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={data.confirmPassword}
                      onChange={e => updateField('confirmPassword', e.target.value)}
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            {STEPS[currentStep].key === 'team' && (
              <div className="space-y-2">
                <Label htmlFor="teamName">Team / Organization Name</Label>
                <Input
                  id="teamName"
                  value={data.teamName}
                  onChange={e => updateField('teamName', e.target.value)}
                  placeholder="My Company"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  This will be used to identify your workspace. You can invite team members later.
                </p>
              </div>
            )}

            {STEPS[currentStep].key === 'email' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Configure your email server to send and receive emails. You can skip this and set it up later in Settings.
                </p>
                
                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-sm">SMTP (Sending)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtpHost">Host</Label>
                      <Input
                        id="smtpHost"
                        value={data.smtpHost}
                        onChange={e => updateField('smtpHost', e.target.value)}
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPort">Port</Label>
                      <Input
                        id="smtpPort"
                        type="number"
                        value={data.smtpPort}
                        onChange={e => updateField('smtpPort', parseInt(e.target.value) || 587)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtpUser">Username</Label>
                      <Input
                        id="smtpUser"
                        value={data.smtpUser}
                        onChange={e => updateField('smtpUser', e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPass">Password</Label>
                      <Input
                        id="smtpPass"
                        type="password"
                        value={data.smtpPass}
                        onChange={e => updateField('smtpPass', e.target.value)}
                        placeholder="App password"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="smtpSecure"
                        checked={data.smtpSecure}
                        onChange={e => updateField('smtpSecure', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="smtpSecure" className="text-sm">Use SSL/TLS</Label>
                    </div>
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="emailFrom">From Address</Label>
                      <Input
                        id="emailFrom"
                        value={data.emailFrom}
                        onChange={e => updateField('emailFrom', e.target.value)}
                        placeholder="Company Name <hello@example.com>"
                      />
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-4 space-y-4">
                  <h3 className="font-semibold text-sm">IMAP (Receiving)</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapHost">Host</Label>
                      <Input
                        id="imapHost"
                        value={data.imapHost}
                        onChange={e => updateField('imapHost', e.target.value)}
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPort">Port</Label>
                      <Input
                        id="imapPort"
                        type="number"
                        value={data.imapPort}
                        onChange={e => updateField('imapPort', parseInt(e.target.value) || 993)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="imapUser">Username</Label>
                      <Input
                        id="imapUser"
                        value={data.imapUser}
                        onChange={e => updateField('imapUser', e.target.value)}
                        placeholder="user@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="imapPass">Password</Label>
                      <Input
                        id="imapPass"
                        type="password"
                        value={data.imapPass}
                        onChange={e => updateField('imapPass', e.target.value)}
                        placeholder="App password"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="imapSecure"
                      checked={data.imapSecure}
                      onChange={e => updateField('imapSecure', e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="imapSecure" className="text-sm">Use SSL/TLS</Label>
                  </div>
                </div>
              </>
            )}

            {STEPS[currentStep].key === 'ai' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Add an API key for AI-powered message generation. You can skip this and configure it later in Settings.
                </p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="aiProvider">Provider</Label>
                    <select
                      id="aiProvider"
                      value={data.aiProvider}
                      onChange={e => updateField('aiProvider', e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="OPENROUTER">OpenRouter</option>
                      <option value="OPENAI">OpenAI</option>
                      <option value="ANTHROPIC">Anthropic</option>
                      <option value="GOOGLE">Google AI</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="aiApiKey">API Key</Label>
                    <Input
                      id="aiApiKey"
                      type="password"
                      value={data.aiApiKey}
                      onChange={e => updateField('aiApiKey', e.target.value)}
                      placeholder="sk-..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Your API key will be encrypted with AES-256-GCM before being stored in the database.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>

              {currentStep < STEPS.length - 1 ? (
                <Button type="button" onClick={handleNext}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={isLoading}>
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Complete Setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
