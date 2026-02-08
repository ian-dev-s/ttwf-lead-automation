---
name: SPEAR Email Framework
overview: Apply the SPEAR methodology (Short, Personal, Expects A Reply) across all AI-generated email content -- custom instructions, system prompts, templates, and samples -- while also adding "data used" transparency metadata everywhere AI generates content.
todos:
  - id: spear-custom-instructions
    content: Update DEFAULT_AI_TONE, DEFAULT_AI_WRITING_STYLE, DEFAULT_AI_CUSTOM_INSTRUCTIONS in training/route.ts and settings/route.ts with SPEAR framework
    status: completed
  - id: spear-system-prompts
    content: Rewrite MESSAGE_SYSTEM_PROMPT, REPLY_SYSTEM_PROMPT, generateMessagePrompt(), generateFollowUpPrompt(), generateReplyPrompt() in prompts.ts
    status: completed
  - id: spear-seed-templates
    content: Rewrite 3 seed templates (Initial Outreach, Friendly Follow-up, Re-engagement) in setup/route.ts
    status: completed
  - id: spear-sample-responses
    content: Rewrite 4 DEFAULT_SAMPLE_RESPONSES in samples/route.ts with SPEAR style
    status: completed
  - id: data-types
    content: Add AIDataUsed interface and dataUsed field to Message type in types/index.ts
    status: completed
  - id: data-personalize
    content: Collect and return dataUsed in personalize.ts (generatePersonalizedMessage + generateFollowUpMessage)
    status: completed
  - id: data-reply
    content: Collect and return dataUsed in reply.ts (generateInboundReply)
    status: completed
  - id: data-api-routes
    content: Include dataUsed in API responses and Firestore writes (generate/route.ts + inbox reply/route.ts)
    status: completed
  - id: data-ui-display
    content: Add collapsible 'Data used by AI' section to MessagePreview.tsx, ApprovalGate.tsx, and messages/page.tsx
    status: completed
isProject: false
---

# SPEAR Email Framework + AI Data Transparency

## What is SPEAR?

- **S**hort -- Keep emails brief and scannable. No walls of text.
- **P**ersonal -- Reference specific details about the recipient's business. Not generic.
- **E**xpects
- **A**
- **R**eply -- End with a question or low-friction CTA that invites a response.

The tone should be casual-friendly, not overly professional. The target market is small South African businesses -- people who respond better to a real, down-to-earth conversation than a corporate pitch.

---

## Part 1: Update Custom Instructions & Default Training Settings

### Files to change:

- `[src/app/api/ai/training/route.ts](src/app/api/ai/training/route.ts)` (lines 7-9)
- `[src/app/api/settings/route.ts](src/app/api/settings/route.ts)` (line 99)

### Changes:

- Change `DEFAULT_AI_TONE` from `'professional-friendly'` to `'casual-friendly'`
- Change `DEFAULT_AI_WRITING_STYLE` from `'persuasive'` to `'conversational'`
- Rewrite `DEFAULT_AI_CUSTOM_INSTRUCTIONS` to embed the SPEAR framework explicitly. Example:

```
Follow the SPEAR framework for all messages:
- Short: Keep emails brief (under 100 words for body). No long paragraphs.
- Personal: Reference specific details about their business (name, rating, reviews, industry).
- Expects A Reply: Always end with a casual question that invites a response.

Tone: Friendly and conversational -- like texting a colleague, not writing a corporate letter.
Use South African English spelling (e.g., "favour", "colour").
Mention our free draft website offer naturally. Never sound pushy or salesy.
Reference The Tiny Web Factory and link to https://thetinywebfactory.com.
```

---

## Part 2: Rewrite All System Prompts with SPEAR

### File to change:

- `[src/lib/ai/prompts.ts](src/lib/ai/prompts.ts)`

### Changes:

1. `**MESSAGE_SYSTEM_PROMPT**` (lines 4-25): Rewrite to enforce SPEAR. Remove "expert copywriter" framing. Emphasise short, personal, expects-a-reply. Drop "warm, professional, genuine" -- replace with "casual, friendly, down-to-earth".
2. `**generateMessagePrompt()**` (lines 28-68): Replace the long base template email (lines 50-66) with a short SPEAR-style example. The current template is ~150 words; the new one should be ~60-80 words max.
3. `**generateFollowUpPrompt()**` (lines 155-194): Update guidelines to emphasise SPEAR. Follow-ups should be even shorter (~40-60 words).
4. `**REPLY_SYSTEM_PROMPT**` (lines 198-213): Rewrite to match SPEAR tone -- friendly, concise, ends with a question.
5. `**generateReplyPrompt()**` (lines 218-262): Update to emphasise keeping replies short and ending with a question.

---

## Part 3: Rewrite All Seed Templates

### File to change:

- `[src/app/api/setup/route.ts](src/app/api/setup/route.ts)` (lines 204-289, `seedDefaultTemplates`)

### Changes for each template:

- **"Initial Outreach"**: Rewrite `systemPrompt` to follow SPEAR. Change `tone` from `'professional'` to `'casual-friendly'`. Reduce `maxLength` from `2000` to `800`. Update `mustInclude` to add `'question at the end'`.
- **"Friendly Follow-up"**: Rewrite `systemPrompt` for SPEAR. Reduce `maxLength` from `1000` to `500`. Add `'question at the end'` to `mustInclude`.
- **"Re-engagement"**: Rewrite `systemPrompt` for SPEAR. Reduce `maxLength` from `800` to `400`. Add `'question at the end'` to `mustInclude`.

---

## Part 4: Rewrite Default Sample Responses

### File to change:

- `[src/app/api/ai/samples/route.ts](src/app/api/ai/samples/route.ts)` (lines 13-34)

### Changes:

Rewrite all 4 `DEFAULT_SAMPLE_RESPONSES` to follow SPEAR. Each `preferredResponse` should be:

- Under 50 words
- Personal/specific
- End with a question
- Casual tone (not corporate)

Example rewrite for pricing:

```
"Honestly, it depends on what you need -- but we start by making you a free draft landing page. Zero obligation. If you love it, we chat pricing. Want us to put one together for you?"
```

---

## Part 5: AI Data Transparency ("What data was used?")

This is the biggest structural change. Everywhere the AI generates content, we need to track and expose which data points the AI used.

### New `dataUsed` structure:

```typescript
interface AIDataUsed {
  leadData: {
    businessName: string;
    location: string;
    industry?: string;
    googleRating?: number;
    reviewCount?: number;
    hasWebsite: boolean;
    hasFacebook: boolean;
  };
  templateName: string | null;
  templatePurpose: string | null;
  aiSettings: {
    tone: string | null;
    writingStyle: string | null;
    customInstructions: string | null; // truncated preview
  };
  knowledgeItemsUsed: string[]; // titles of knowledge items
  sampleResponsesCount: number;
  model: string;
  provider: string;
  previousMessageUsed: boolean; // for follow-ups
}
```

### Files to change:

**Types:**

- `[src/types/index.ts](src/types/index.ts)`: Add `AIDataUsed` interface. Add optional `dataUsed: AIDataUsed | null` to `Message` interface.

**Backend - Outbound messages:**

- `[src/lib/ai/personalize.ts](src/lib/ai/personalize.ts)`:
  - Add `dataUsed` field to `PersonalizedMessage` interface
  - In `generatePersonalizedMessage()`, collect all data points used (lead fields, template name, training settings, knowledge item titles, sample count) and return them in `dataUsed`
  - In `generateFollowUpMessage()`, include `dataUsed` when saving to Firestore

**Backend - Inbound replies:**

- `[src/lib/ai/reply.ts](src/lib/ai/reply.ts)`:
  - Add `dataUsed` field to `InboundReplyResult` interface
  - In `generateInboundReply()`, collect and return the data used

**API routes:**

- `[src/app/api/ai/generate/route.ts](src/app/api/ai/generate/route.ts)`: Include `dataUsed` in JSON response and in saved message document
- `[src/app/api/email/inbox/[id]/reply/route.ts](src/app/api/email/inbox/[id]/reply/route.ts)`: Store `dataUsed` alongside `aiReplyContent` in Firestore and return it in response

**UI Components -- add a collapsible "Data used by AI" section:**

- `[src/components/messages/MessagePreview.tsx](src/components/messages/MessagePreview.tsx)`: Add a collapsible section below the message showing what data was used (lead details, template, tone, knowledge items, model)
- `[src/components/messages/ApprovalGate.tsx](src/components/messages/ApprovalGate.tsx)`: Same collapsible section in the approval view
- `[src/app/(dashboard)/messages/page.tsx](<src/app/(dashboard)`/messages/page.tsx>): Add data-used display below AI Response card for inbound replies

The UI section would look like a subtle expandable panel:

```
[icon] AI used: 6 lead fields, "Initial Outreach" template, 3 knowledge items, casual-friendly tone
  > Click to expand full details
```

---

## Files Changed Summary

| Area              | File                                          | Scope                 |
| ----------------- | --------------------------------------------- | --------------------- |
| Training defaults | `src/app/api/ai/training/route.ts`            | 3 constants           |
| Settings defaults | `src/app/api/settings/route.ts`               | 1 constant            |
| System prompts    | `src/lib/ai/prompts.ts`                       | 5 prompts/functions   |
| Seed templates    | `src/app/api/setup/route.ts`                  | 3 templates           |
| Sample responses  | `src/app/api/ai/samples/route.ts`             | 4 samples             |
| Types             | `src/types/index.ts`                          | New interface + field |
| Personalize       | `src/lib/ai/personalize.ts`                   | dataUsed collection   |
| Reply             | `src/lib/ai/reply.ts`                         | dataUsed collection   |
| Generate API      | `src/app/api/ai/generate/route.ts`            | Include dataUsed      |
| Reply API         | `src/app/api/email/inbox/[id]/reply/route.ts` | Store/return dataUsed |
| MessagePreview    | `src/components/messages/MessagePreview.tsx`  | Display dataUsed      |
| ApprovalGate      | `src/components/messages/ApprovalGate.tsx`    | Display dataUsed      |
| Messages page     | `src/app/(dashboard)/messages/page.tsx`       | Display dataUsed      |

Total: ~13 files, with the SPEAR content changes being mostly string rewrites and the data transparency being the structural addition.
