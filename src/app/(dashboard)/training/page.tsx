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
import { Brain, BookOpen, MessageSquare, Plus, Pencil, Trash2, Loader2, Save, Lightbulb, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TrainingConfig {
  aiTone: string | null;
  aiWritingStyle: string | null;
  aiCustomInstructions: string | null;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  createdAt: string;
}

interface SampleResponse {
  id: string;
  customerQuestion: string;
  preferredResponse: string;
  category: string | null;
  createdAt: string;
}

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'professional-friendly', label: 'Professional & Friendly' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'formal', label: 'Formal' },
];

const writingStyleOptions = [
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'persuasive', label: 'Persuasive' },
  { value: 'educational', label: 'Educational' },
];

export default function AITrainingPage() {
  const [config, setConfig] = useState<TrainingConfig>({
    aiTone: null,
    aiWritingStyle: null,
    aiCustomInstructions: null,
  });
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [sampleResponses, setSampleResponses] = useState<SampleResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Knowledge item form
  const [showKnowledgeForm, setShowKnowledgeForm] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<KnowledgeItem | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeContent, setKnowledgeContent] = useState('');
  const [knowledgeCategory, setKnowledgeCategory] = useState('');

  // Sample response form
  const [showSampleForm, setShowSampleForm] = useState(false);
  const [editingSample, setEditingSample] = useState<SampleResponse | null>(null);
  const [sampleQuestion, setSampleQuestion] = useState('');
  const [sampleResponse, setSampleResponse] = useState('');
  const [sampleCategory, setSampleCategory] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [trainingRes, knowledgeRes, samplesRes] = await Promise.all([
        fetch('/api/ai/training'),
        fetch('/api/ai/knowledge'),
        fetch('/api/ai/samples'),
      ]);

      if (trainingRes.ok) {
        const trainingData = await trainingRes.json();
        setConfig(trainingData);
      }
      if (knowledgeRes.ok) {
        const knowledgeData = await knowledgeRes.json();
        setKnowledgeItems(knowledgeData);
      }
      if (samplesRes.ok) {
        const samplesData = await samplesRes.json();
        setSampleResponses(samplesData);
      }
    } catch (error) {
      console.error('Error fetching training data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/ai/training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Failed to save');
    } catch (error) {
      console.error('Error saving training config:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Knowledge CRUD
  const handleSaveKnowledge = async () => {
    try {
      if (editingKnowledge) {
        const response = await fetch(`/api/ai/knowledge/${editingKnowledge.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: knowledgeTitle,
            content: knowledgeContent,
            category: knowledgeCategory || null,
          }),
        });
        if (!response.ok) throw new Error('Failed to update');
      } else {
        const response = await fetch('/api/ai/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: knowledgeTitle,
            content: knowledgeContent,
            category: knowledgeCategory || null,
          }),
        });
        if (!response.ok) throw new Error('Failed to create');
      }
      resetKnowledgeForm();
      await fetchData();
    } catch (error) {
      console.error('Error saving knowledge item:', error);
    }
  };

  const handleEditKnowledge = (item: KnowledgeItem) => {
    setEditingKnowledge(item);
    setKnowledgeTitle(item.title);
    setKnowledgeContent(item.content);
    setKnowledgeCategory(item.category || '');
    setShowKnowledgeForm(true);
  };

  const handleDeleteKnowledge = async (id: string) => {
    try {
      await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting knowledge item:', error);
    }
  };

  const resetKnowledgeForm = () => {
    setShowKnowledgeForm(false);
    setEditingKnowledge(null);
    setKnowledgeTitle('');
    setKnowledgeContent('');
    setKnowledgeCategory('');
  };

  // Sample CRUD
  const handleSaveSample = async () => {
    try {
      if (editingSample) {
        const response = await fetch(`/api/ai/samples/${editingSample.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerQuestion: sampleQuestion,
            preferredResponse: sampleResponse,
            category: sampleCategory || null,
          }),
        });
        if (!response.ok) throw new Error('Failed to update');
      } else {
        const response = await fetch('/api/ai/samples', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerQuestion: sampleQuestion,
            preferredResponse: sampleResponse,
            category: sampleCategory || null,
          }),
        });
        if (!response.ok) throw new Error('Failed to create');
      }
      resetSampleForm();
      await fetchData();
    } catch (error) {
      console.error('Error saving sample response:', error);
    }
  };

  const handleEditSample = (sample: SampleResponse) => {
    setEditingSample(sample);
    setSampleQuestion(sample.customerQuestion);
    setSampleResponse(sample.preferredResponse);
    setSampleCategory(sample.category || '');
    setShowSampleForm(true);
  };

  const handleDeleteSample = async (id: string) => {
    try {
      await fetch(`/api/ai/samples/${id}`, { method: 'DELETE' });
      await fetchData();
    } catch (error) {
      console.error('Error deleting sample response:', error);
    }
  };

  const resetSampleForm = () => {
    setShowSampleForm(false);
    setEditingSample(null);
    setSampleQuestion('');
    setSampleResponse('');
    setSampleCategory('');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="AI Training" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="AI Training" description="Train your AI to write better emails" />

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* How Training Works */}
        <Card className="border-blue-500/20 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-blue-500" />
              How AI Training Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                The AI training system enhances how your emails are generated. It combines three layers:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li><strong>Personality & Tone</strong> — Sets the overall voice and writing style for all emails</li>
                <li><strong>Sample Responses</strong> — Teaches the AI your preferred way of responding to common questions</li>
                <li><strong>Knowledge Base</strong> — Provides business-specific information the AI can reference</li>
              </ul>
              <p>
                These settings are combined with your email templates to generate highly personalized, on-brand messages.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Personality & Tone */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Personality & Tone
            </CardTitle>
            <CardDescription>
              Configure the overall voice and style for AI-generated emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select
                  value={config.aiTone || ''}
                  onValueChange={(value) =>
                    setConfig((prev) => ({ ...prev, aiTone: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select tone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {toneOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Writing Style</Label>
                <Select
                  value={config.aiWritingStyle || ''}
                  onValueChange={(value) =>
                    setConfig((prev) => ({ ...prev, aiWritingStyle: value || null }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select writing style..." />
                  </SelectTrigger>
                  <SelectContent>
                    {writingStyleOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Custom Instructions</Label>
              <textarea
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={config.aiCustomInstructions || ''}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    aiCustomInstructions: e.target.value || null,
                  }))
                }
                placeholder="Add any custom instructions for the AI... e.g., 'Always mention our free consultation offer' or 'Use South African English spelling'"
              />
            </div>
            <Button onClick={handleSaveConfig} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Personality Settings
            </Button>
          </CardContent>
        </Card>

        {/* Sample Responses */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Sample Responses
                  <Badge variant="secondary">{sampleResponses.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Teach the AI how you prefer to respond to common customer questions
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  resetSampleForm();
                  setShowSampleForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Sample
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showSampleForm && (
              <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">
                    {editingSample ? 'Edit Sample' : 'New Sample Response'}
                  </Label>
                  <Button variant="ghost" size="sm" onClick={resetSampleForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Customer Question</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={sampleQuestion}
                    onChange={(e) => setSampleQuestion(e.target.value)}
                    placeholder="What question might a customer ask?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Preferred Response</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={sampleResponse}
                    onChange={(e) => setSampleResponse(e.target.value)}
                    placeholder="How should the AI respond?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category (optional)</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={sampleCategory}
                    onChange={(e) => setSampleCategory(e.target.value)}
                    placeholder="e.g., Pricing, Services, General"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveSample} disabled={!sampleQuestion || !sampleResponse}>
                    {editingSample ? 'Update' : 'Add'} Sample
                  </Button>
                  <Button variant="outline" onClick={resetSampleForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {sampleResponses.length === 0 && !showSampleForm ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sample responses yet</p>
                <p className="text-sm">Add examples of how you want the AI to respond</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sampleResponses.map((sample) => (
                  <div key={sample.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">CUSTOMER ASKS:</span>
                          <p className="text-sm mt-1">{sample.customerQuestion}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">PREFERRED RESPONSE:</span>
                          <p className="text-sm mt-1 text-muted-foreground">{sample.preferredResponse}</p>
                        </div>
                        {sample.category && (
                          <Badge variant="outline" className="text-xs">{sample.category}</Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSample(sample)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSample(sample.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Business Knowledge Base
                  <Badge variant="secondary">{knowledgeItems.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Add business information the AI can reference when generating emails
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  resetKnowledgeForm();
                  setShowKnowledgeForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {showKnowledgeForm && (
              <div className="p-4 border rounded-lg space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">
                    {editingKnowledge ? 'Edit Knowledge Item' : 'New Knowledge Item'}
                  </Label>
                  <Button variant="ghost" size="sm" onClick={resetKnowledgeForm}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label>Title</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={knowledgeTitle}
                    onChange={(e) => setKnowledgeTitle(e.target.value)}
                    placeholder="e.g., Our Pricing, Services Offered, Company History"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Content</Label>
                  <textarea
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={knowledgeContent}
                    onChange={(e) => setKnowledgeContent(e.target.value)}
                    placeholder="Add detailed information the AI should know about..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category (optional)</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={knowledgeCategory}
                    onChange={(e) => setKnowledgeCategory(e.target.value)}
                    placeholder="e.g., Services, Pricing, Company Info"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveKnowledge} disabled={!knowledgeTitle || !knowledgeContent}>
                    {editingKnowledge ? 'Update' : 'Add'} Item
                  </Button>
                  <Button variant="outline" onClick={resetKnowledgeForm}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {knowledgeItems.length === 0 && !showKnowledgeForm ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No knowledge base items yet</p>
                <p className="text-sm">Add information about your business for the AI to reference</p>
              </div>
            ) : (
              <div className="space-y-3">
                {knowledgeItems.map((item) => (
                  <div key={item.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium">{item.title}</h4>
                          {item.category && (
                            <Badge variant="outline" className="text-xs">{item.category}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {item.content}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditKnowledge(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteKnowledge(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
