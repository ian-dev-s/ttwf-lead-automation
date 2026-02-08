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
import { Switch } from '@/components/ui/switch';
import {
  FileText,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Copy,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  purpose: string;
  systemPrompt: string;
  bodyTemplate: string | null;
  subjectLine: string | null;
  isActive: boolean;
  isDefault: boolean;
  tone: string | null;
  maxLength: number | null;
  mustInclude: string[];
  avoidTopics: string[];
  createdAt: string;
  updatedAt: string;
}

const purposeOptions = [
  { value: 'outreach', label: 'Outreach' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 're_engagement', label: 'Re-engagement' },
];

const toneOptions = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'casual', label: 'Casual' },
  { value: 'enthusiastic', label: 'Enthusiastic' },
  { value: 'formal', label: 'Formal' },
];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState<string>('all');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    purpose: 'outreach',
    systemPrompt: '',
    bodyTemplate: '',
    subjectLine: '',
    isActive: true,
    isDefault: false,
    tone: '',
    maxLength: '',
    mustInclude: '',
    avoidTopics: '',
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        purpose: formData.purpose,
        systemPrompt: formData.systemPrompt,
        bodyTemplate: formData.bodyTemplate || null,
        subjectLine: formData.subjectLine || null,
        isActive: formData.isActive,
        isDefault: formData.isDefault,
        tone: formData.tone || null,
        maxLength: formData.maxLength ? parseInt(formData.maxLength) : null,
        mustInclude: formData.mustInclude
          ? formData.mustInclude.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
        avoidTopics: formData.avoidTopics
          ? formData.avoidTopics.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [],
      };

      if (editingTemplate) {
        const response = await fetch(`/api/templates/${editingTemplate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to update');
      } else {
        const response = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error('Failed to create');
      }

      resetForm();
      await fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      purpose: template.purpose,
      systemPrompt: template.systemPrompt,
      bodyTemplate: template.bodyTemplate || '',
      subjectLine: template.subjectLine || '',
      isActive: template.isActive,
      isDefault: template.isDefault,
      tone: template.tone || '',
      maxLength: template.maxLength?.toString() || '',
      mustInclude: template.mustInclude.join(', '),
      avoidTopics: template.avoidTopics.join(', '),
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const handleDuplicate = (template: EmailTemplate) => {
    setEditingTemplate(null);
    setFormData({
      name: `${template.name} (Copy)`,
      description: template.description || '',
      purpose: template.purpose,
      systemPrompt: template.systemPrompt,
      bodyTemplate: template.bodyTemplate || '',
      subjectLine: template.subjectLine || '',
      isActive: false,
      isDefault: false,
      tone: template.tone || '',
      maxLength: template.maxLength?.toString() || '',
      mustInclude: template.mustInclude.join(', '),
      avoidTopics: template.avoidTopics.join(', '),
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      purpose: 'outreach',
      systemPrompt: '',
      bodyTemplate: '',
      subjectLine: '',
      isActive: true,
      isDefault: false,
      tone: '',
      maxLength: '',
      mustInclude: '',
      avoidTopics: '',
    });
  };

  // Filtering
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      searchQuery === '' ||
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPurpose = filterPurpose === 'all' || t.purpose === filterPurpose;
    return matchesSearch && matchesPurpose;
  });

  // Stats
  const stats = {
    total: templates.length,
    active: templates.filter((t) => t.isActive).length,
    outreach: templates.filter((t) => t.purpose === 'outreach').length,
    followUp: templates.filter((t) => t.purpose === 'follow_up').length,
    reEngagement: templates.filter((t) => t.purpose === 're_engagement').length,
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Email Templates" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Email Templates"
        description="Manage AI email generation templates and guardrails"
      />

      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total Templates</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.outreach}</div>
              <p className="text-xs text-muted-foreground">Outreach</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.followUp}</div>
              <p className="text-xs text-muted-foreground">Follow-up</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{stats.reEngagement}</div>
              <p className="text-xs text-muted-foreground">Re-engagement</p>
            </CardContent>
          </Card>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={filterPurpose} onValueChange={setFilterPurpose}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {purposeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {editingTemplate ? 'Edit Template' : 'Create New Template'}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Template name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={formData.purpose}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, purpose: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {purposeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <input
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Brief description of this template"
                />
              </div>

              <div className="space-y-2">
                <Label>Default Subject Line</Label>
                <input
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.subjectLine}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, subjectLine: e.target.value }))
                  }
                  placeholder="e.g., A Website for {businessName}"
                />
              </div>

              <div className="space-y-2">
                <Label>System Prompt (AI Instructions)</Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                  value={formData.systemPrompt}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, systemPrompt: e.target.value }))
                  }
                  placeholder="Instructions for the AI on how to generate this type of email..."
                />
              </div>

              <div className="space-y-2">
                <Label>Body Template (optional base text)</Label>
                <textarea
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={formData.bodyTemplate}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, bodyTemplate: e.target.value }))
                  }
                  placeholder="Optional base template the AI can personalize from..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tone</Label>
                  <Select
                    value={formData.tone || 'none'}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        tone: value === 'none' ? '' : value,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tone..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No preference</SelectItem>
                      {toneOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Max Length (characters)</Label>
                  <input
                    type="number"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.maxLength}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, maxLength: e.target.value }))
                    }
                    placeholder="e.g., 2000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Must Include (comma-separated)</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.mustInclude}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, mustInclude: e.target.value }))
                    }
                    placeholder="e.g., free draft, no obligation"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avoid Topics (comma-separated)</Label>
                  <input
                    type="text"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.avoidTopics}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, avoidTopics: e.target.value }))
                    }
                    placeholder="e.g., competitor names, pricing"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isActive: checked }))
                    }
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={formData.isDefault}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isDefault: checked }))
                    }
                  />
                  <Label>Default for category</Label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSave} disabled={!formData.name || !formData.systemPrompt}>
                  {editingTemplate ? 'Update Template' : 'Create Template'}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Template Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No templates found</p>
            <p className="text-sm">
              {searchQuery || filterPurpose !== 'all'
                ? 'Try adjusting your search or filters'
                : 'Create your first email template to get started'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className={`relative ${
                  !template.isActive ? 'opacity-60' : ''
                } ${template.isDefault ? 'ring-2 ring-primary/30' : ''}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {template.name}
                        {template.isDefault && (
                          <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        )}
                      </CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1 line-clamp-2">
                          {template.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline">
                      {purposeOptions.find((p) => p.value === template.purpose)?.label ||
                        template.purpose}
                    </Badge>
                    <Badge variant={template.isActive ? 'default' : 'secondary'}>
                      {template.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {template.tone && (
                      <Badge variant="outline" className="text-xs">
                        {template.tone}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {template.subjectLine && (
                    <p className="text-xs text-muted-foreground mb-2">
                      <span className="font-medium">Subject:</span> {template.subjectLine}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                    {template.systemPrompt.substring(0, 120)}...
                  </p>

                  {/* Guardrails summary */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.maxLength && (
                      <Badge variant="outline" className="text-xs">
                        Max {template.maxLength} chars
                      </Badge>
                    )}
                    {template.mustInclude.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {template.mustInclude.length} required phrases
                      </Badge>
                    )}
                    {template.avoidTopics.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {template.avoidTopics.length} avoided topics
                      </Badge>
                    )}
                  </div>

                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(template)}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                      className="text-destructive hover:text-destructive ml-auto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
