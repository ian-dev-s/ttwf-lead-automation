import { auth } from '@/lib/auth';
import { aiKnowledgeItemsCollection, serverTimestamp, stripUndefined } from '@/lib/firebase/collections';
import { getLanguageModel } from '@/lib/ai/providers';
import { generateText } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url('Please enter a valid URL'),
});

const EXTRACTION_PROMPT = `You are a business analyst. Extract key business information from this website content to create a knowledge base.

Create 3-6 knowledge items, each with:
- title: A short descriptive title (e.g., "Our Services", "Pricing", "About Us", "Contact Info")
- content: The relevant information summarized clearly (2-4 sentences)
- category: One of: "Services", "Pricing", "Company Info", "Value Proposition", "Process", "Contact"

IMPORTANT: Return ONLY valid JSON array, no markdown, no code blocks, just the JSON.

Example format:
[
  {
    "title": "Our Services",
    "content": "We offer web design, logo design, and branding services for small businesses.",
    "category": "Services"
  }
]

Focus on information that would help an AI write personalized outreach emails about this business. Extract:
- What they do / services offered
- Unique selling points
- Pricing info (if available)
- Company story / about
- Contact methods
- Any special offers

If the content is not about a business website or is too sparse, return an empty array [].`;

// POST /api/ai/knowledge/from-website - Scrape website and extract knowledge using AI
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role === 'VIEWER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const teamId = session.user.teamId;
    const body = await request.json();
    const { url } = requestSchema.parse(body);

    // Fetch the website content
    console.log(`[Knowledge Extraction] Fetching: ${url}`);
    
    let websiteText = '';
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        return NextResponse.json(
          { error: `Failed to fetch website: ${response.status} ${response.statusText}` },
          { status: 400 }
        );
      }

      const html = await response.text();
      
      // Basic HTML to text extraction
      websiteText = html
        // Remove script and style tags with their content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        // Remove HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode common HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();

      // Limit text length for AI processing
      if (websiteText.length > 15000) {
        websiteText = websiteText.substring(0, 15000) + '...';
      }

      if (websiteText.length < 100) {
        return NextResponse.json(
          { error: 'Website content too short or could not be extracted. Try a different page.' },
          { status: 400 }
        );
      }
    } catch (fetchError) {
      console.error('[Knowledge Extraction] Fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Could not fetch the website. Please check the URL and try again.' },
        { status: 400 }
      );
    }

    // Use AI to extract knowledge items
    console.log(`[Knowledge Extraction] Extracted ${websiteText.length} chars, sending to AI...`);
    
    const languageModel = await getLanguageModel(teamId, {
      provider: 'OPENROUTER',
      model: 'google/gemini-2.0-flash-001',
    });

    const result = await generateText({
      model: languageModel,
      system: EXTRACTION_PROMPT,
      prompt: `Website URL: ${url}\n\nWebsite Content:\n${websiteText}`,
      temperature: 0.3,
      maxOutputTokens: 2000,
    });

    // Parse the AI response
    let knowledgeItems: Array<{ title: string; content: string; category: string }> = [];
    try {
      let cleanedText = result.text.trim();
      // Remove markdown code blocks if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
      }
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
      }
      cleanedText = cleanedText.trim();

      knowledgeItems = JSON.parse(cleanedText);
      
      if (!Array.isArray(knowledgeItems)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.error('[Knowledge Extraction] Parse error:', parseError, result.text);
      return NextResponse.json(
        { error: 'AI could not extract knowledge from this website. Try a different page.' },
        { status: 400 }
      );
    }

    if (knowledgeItems.length === 0) {
      return NextResponse.json(
        { error: 'No knowledge items could be extracted from this website.' },
        { status: 400 }
      );
    }

    // Save the knowledge items to Firestore
    const savedItems: Array<{ id: string; title: string; content: string; category: string | null }> = [];
    
    for (const item of knowledgeItems) {
      if (!item.title || !item.content) continue;
      
      const itemData = stripUndefined({
        teamId,
        title: item.title.substring(0, 200),
        content: item.content,
        category: item.category || null,
        sourceUrl: url,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const docRef = aiKnowledgeItemsCollection(teamId).doc();
      await docRef.set(itemData);

      savedItems.push({
        id: docRef.id,
        title: item.title,
        content: item.content,
        category: item.category || null,
      });
    }

    console.log(`[Knowledge Extraction] Saved ${savedItems.length} items from ${url}`);

    return NextResponse.json({
      success: true,
      itemsAdded: savedItems.length,
      items: savedItems,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error extracting knowledge from website:', error);
    return NextResponse.json(
      { error: 'Failed to extract knowledge. Please try again.' },
      { status: 500 }
    );
  }
}
