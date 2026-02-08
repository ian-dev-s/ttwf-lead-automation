'use client';

import { Badge } from '@/components/ui/badge';
import type { AIDataUsed } from '@/types';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import { useState } from 'react';

interface AIDataUsedPanelProps {
  dataUsed: AIDataUsed | null | undefined;
}

export function AIDataUsedPanel({ dataUsed }: AIDataUsedPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!dataUsed) return null;

  // Count lead data fields that were populated
  const leadFieldCount = [
    dataUsed.leadData.businessName,
    dataUsed.leadData.location,
    dataUsed.leadData.industry,
    dataUsed.leadData.googleRating,
    dataUsed.leadData.reviewCount,
    dataUsed.leadData.hasWebsite,
    dataUsed.leadData.hasFacebook,
  ].filter(Boolean).length;

  const summaryParts: string[] = [];
  summaryParts.push(`${leadFieldCount} lead fields`);
  if (dataUsed.templateName) {
    summaryParts.push(`"${dataUsed.templateName}" template`);
  }
  if (dataUsed.knowledgeItemsUsed.length > 0) {
    summaryParts.push(`${dataUsed.knowledgeItemsUsed.length} knowledge items`);
  }
  if (dataUsed.sampleResponsesCount > 0) {
    summaryParts.push(`${dataUsed.sampleResponsesCount} samples`);
  }
  if (dataUsed.aiSettings.tone) {
    summaryParts.push(`${dataUsed.aiSettings.tone} tone`);
  }

  return (
    <div className="border rounded-lg bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors rounded-lg text-left"
      >
        <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground text-xs font-medium">AI used:</span>
        <span className="text-xs text-foreground truncate">
          {summaryParts.join(', ')}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t">
          {/* Lead Data */}
          <div className="pt-2">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Lead Data</p>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs py-0">
                {dataUsed.leadData.businessName}
              </Badge>
              <Badge variant="outline" className="text-xs py-0">
                {dataUsed.leadData.location}
              </Badge>
              {dataUsed.leadData.industry && (
                <Badge variant="outline" className="text-xs py-0">
                  {dataUsed.leadData.industry}
                </Badge>
              )}
              {dataUsed.leadData.googleRating && (
                <Badge variant="outline" className="text-xs py-0">
                  {dataUsed.leadData.googleRating} stars
                </Badge>
              )}
              {dataUsed.leadData.reviewCount && (
                <Badge variant="outline" className="text-xs py-0">
                  {dataUsed.leadData.reviewCount} reviews
                </Badge>
              )}
              <Badge variant="outline" className="text-xs py-0">
                Website: {dataUsed.leadData.hasWebsite ? 'Yes' : 'No'}
              </Badge>
              <Badge variant="outline" className="text-xs py-0">
                Facebook: {dataUsed.leadData.hasFacebook ? 'Yes' : 'No'}
              </Badge>
            </div>
          </div>

          {/* Template */}
          {dataUsed.templateName && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Template</p>
              <p className="text-xs">
                {dataUsed.templateName}
                {dataUsed.templatePurpose && (
                  <span className="text-muted-foreground"> ({dataUsed.templatePurpose})</span>
                )}
              </p>
            </div>
          )}

          {/* AI Settings */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">AI Settings</p>
            <div className="flex flex-wrap gap-1">
              {dataUsed.aiSettings.tone && (
                <Badge variant="secondary" className="text-xs py-0">
                  Tone: {dataUsed.aiSettings.tone}
                </Badge>
              )}
              {dataUsed.aiSettings.writingStyle && (
                <Badge variant="secondary" className="text-xs py-0">
                  Style: {dataUsed.aiSettings.writingStyle}
                </Badge>
              )}
            </div>
            {dataUsed.aiSettings.customInstructions && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                Instructions: {dataUsed.aiSettings.customInstructions}
              </p>
            )}
          </div>

          {/* Knowledge Base */}
          {dataUsed.knowledgeItemsUsed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Knowledge Base</p>
              <div className="flex flex-wrap gap-1">
                {dataUsed.knowledgeItemsUsed.map((title) => (
                  <Badge key={title} variant="outline" className="text-xs py-0">
                    {title}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Samples & Model */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {dataUsed.sampleResponsesCount > 0 && (
              <span>{dataUsed.sampleResponsesCount} sample responses</span>
            )}
            <span>Model: {dataUsed.model}</span>
            <span>Provider: {dataUsed.provider}</span>
            {dataUsed.previousMessageUsed && (
              <Badge variant="outline" className="text-xs py-0">
                Follow-up
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
