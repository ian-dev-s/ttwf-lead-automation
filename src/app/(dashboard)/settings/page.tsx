'use client';

import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { modelOptions, providerDisplayNames } from '@/lib/ai/providers';
import { AIProvider } from '@prisma/client';
import { Brain, Loader2, MessageSquare, Save, Search } from 'lucide-react';
import { useEffect, useState } from 'react';

interface SystemSettings {
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
}

interface AIConfig {
  id: string;
  name: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [aiConfigs, setAIConfigs] = useState<AIConfig[]>([]);
  const [availableProviders, setAvailableProviders] = useState<AIProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // AI config form state
  const [newProvider, setNewProvider] = useState<AIProvider>('OPENAI');
  const [newModel, setNewModel] = useState('gpt-4o-mini');
  const [newTemperature, setNewTemperature] = useState(0.7);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [settingsRes, aiRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/ai/config'),
      ]);

      const settingsData = await settingsRes.json();
      const aiData = await aiRes.json();

      setSettings(settingsData);
      setAIConfigs(aiData.configs || []);
      setAvailableProviders(aiData.availableProviders || []);
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
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${providerDisplayNames[newProvider]} - ${newModel}`,
          provider: newProvider,
          model: newModel,
          temperature: newTemperature,
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
            <TabsTrigger value="scraping" className="gap-2">
              <Search className="h-4 w-4" />
              Scraping Settings
            </TabsTrigger>
            <TabsTrigger value="messages" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Message Settings
            </TabsTrigger>
          </TabsList>

          {/* AI Configuration Tab */}
          <TabsContent value="ai" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>AI Provider Configuration</CardTitle>
                <CardDescription>
                  Configure which AI provider to use for message generation.
                  You can switch between providers without losing your settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing Configs */}
                {aiConfigs.length > 0 && (
                  <div className="space-y-2">
                    <Label>Active Configuration</Label>
                    <div className="space-y-2">
                      {aiConfigs.map((config) => (
                        <div
                          key={config.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
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
                              Temperature: {config.temperature} | Max tokens:{' '}
                              {config.maxTokens}
                            </p>
                          </div>
                          {!config.isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetActiveConfig(config.id)}
                              disabled={isSaving}
                            >
                              Activate
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add New Config */}
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-base">Add New Configuration</Label>

                  {availableProviders.length === 0 ? (
                    <p className="text-muted-foreground">
                      No API keys configured. Please add your API keys to the
                      .env file.
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Provider</Label>
                          <Select
                            value={newProvider}
                            onValueChange={(v) => {
                              setNewProvider(v as AIProvider);
                              setNewModel(modelOptions[v as AIProvider][0].value);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableProviders.map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  {providerDisplayNames[provider]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Model</Label>
                          <Select value={newModel} onValueChange={setNewModel}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {modelOptions[newProvider]?.map((model) => (
                                <SelectItem key={model.value} value={model.value}>
                                  {model.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Temperature ({newTemperature})</Label>
                          <Slider
                            value={[newTemperature]}
                            onValueChange={(v) => setNewTemperature(v[0])}
                            min={0}
                            max={1}
                            step={0.1}
                          />
                        </div>
                      </div>

                      <Button onClick={handleCreateAIConfig} disabled={isSaving}>
                        {isSaving && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Add Configuration
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Scraping Settings Tab */}
          <TabsContent value="scraping" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scraping Configuration</CardTitle>
                <CardDescription>
                  Configure how the lead scraper searches for businesses.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Automatic Lead Generation</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically find and add new leads daily
                    </p>
                  </div>
                  <Switch
                    checked={settings?.leadGenerationEnabled ?? true}
                    onCheckedChange={(checked) =>
                      setSettings((prev) =>
                        prev ? { ...prev, leadGenerationEnabled: checked } : null
                      )
                    }
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Daily Lead Target</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings?.dailyLeadTarget ?? 10]}
                        onValueChange={(v) =>
                          setSettings((prev) =>
                            prev ? { ...prev, dailyLeadTarget: v[0] } : null
                          )
                        }
                        min={5}
                        max={50}
                        step={5}
                        className="flex-1"
                      />
                      <span className="w-12 text-center font-medium">
                        {settings?.dailyLeadTarget ?? 10}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Min Google Rating</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings?.minGoogleRating ?? 4.0]}
                        onValueChange={(v) =>
                          setSettings((prev) =>
                            prev ? { ...prev, minGoogleRating: v[0] } : null
                          )
                        }
                        min={3}
                        max={5}
                        step={0.5}
                        className="flex-1"
                      />
                      <span className="w-12 text-center font-medium">
                        {settings?.minGoogleRating ?? 4.0}+
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Search Radius (km)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings?.searchRadiusKm ?? 50]}
                        onValueChange={(v) =>
                          setSettings((prev) =>
                            prev ? { ...prev, searchRadiusKm: v[0] } : null
                          )
                        }
                        min={10}
                        max={100}
                        step={10}
                        className="flex-1"
                      />
                      <span className="w-12 text-center font-medium">
                        {settings?.searchRadiusKm ?? 50}km
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Delay Between Requests (ms)</Label>
                    <div className="flex items-center gap-4">
                      <Slider
                        value={[settings?.scrapeDelayMs ?? 2000]}
                        onValueChange={(v) =>
                          setSettings((prev) =>
                            prev ? { ...prev, scrapeDelayMs: v[0] } : null
                          )
                        }
                        min={1000}
                        max={5000}
                        step={500}
                        className="flex-1"
                      />
                      <span className="w-16 text-center font-medium">
                        {settings?.scrapeDelayMs ?? 2000}ms
                      </span>
                    </div>
                  </div>
                </div>

                <Button onClick={handleSaveSettings} disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Save className="h-4 w-4 mr-2" />
                  Save Settings
                </Button>
              </CardContent>
            </Card>
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
        </Tabs>
      </div>
    </div>
  );
}
