require('dotenv').config();
const { App } = require('@slack/bolt');
const { google } = require('googleapis');
const { getAuth } = require('./auth');
const fetch = require('node-fetch');

class BusinessPartnerBot {
  constructor() {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN
    });
    this.setupListeners();
  }

  setupListeners() {
    this.app.event('app_mention', async ({ event, say }) => {
      console.log('Received mention:', event.text);
      try {
        const query = event.text.replace(/<@.*>/, '').trim();
        console.log('Processing query:', query);
        
        const response = await this.handleBusinessInquiry(query);
        
        await say(response);
      } catch (error) {
        console.error('Error processing inquiry:', error);
        await say('Had an issue accessing the data. Let me try again.');
      }
    });

    this.app.message(async ({ message, say }) => {
      if (message.channel_type === 'im' && !message.bot_id) {
        const response = await this.handleBusinessInquiry(message.text);
        await say(response);
      }
    });
  }

  extractBusinessKeywords(query) {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
      'of', 'with', 'by', 'about', 'what', 'how', 'when', 'where', 'why',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'am', 'is', 'are', 'was', 
      'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'tell', 
      'me', 'find', 'show', 'get', 'give', 'help', 'want', 'need'
    ]);

    const words = query.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));

    const businessThemes = [];
    const categories = {
      revenue: ['revenue', 'sales', 'income', 'profit', 'earnings', 'money', 'financial', 'pricing', 'billing'],
      clients: ['client', 'customer', 'prospect', 'lead', 'account', 'relationship', 'deal', 'contract'],
      marketing: ['marketing', 'advertising', 'campaign', 'social', 'content', 'brand', 'promotion', 'outreach'],
      operations: ['operations', 'process', 'workflow', 'system', 'efficiency', 'productivity', 'automation'],
      team: ['team', 'staff', 'employee', 'hire', 'management', 'leadership', 'delegation', 'meeting'],
      strategy: ['strategy', 'planning', 'goal', 'objective', 'vision', 'direction', 'opportunity', 'growth'],
      product: ['product', 'service', 'feature', 'development', 'launch', 'improvement', 'innovation'],
      competition: ['competitor', 'competition', 'market', 'industry', 'analysis', 'positioning'],
      finance: ['budget', 'expense', 'cost', 'investment', 'cash', 'flow', 'funding', 'capital'],
      performance: ['performance', 'metrics', 'kpi', 'results', 'analytics', 'tracking', 'measurement']
    };

    for (const [category, categoryWords] of Object.entries(categories)) {
      if (categoryWords.some(cw => words.includes(cw) || query.toLowerCase().includes(cw))) {
        businessThemes.push(category);
      }
    }

    return {
      keywords: [...new Set(words)].slice(0, 10),
      themes: businessThemes,
      originalQuery: query
    };
  }

  async searchBusinessDatabase(extractedData) {
    try {
      const auth = getAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Notes!A:B',
      });
      
      const rows = response.data.values || [];
      
      if (rows.length <= 1) {
        return { relevantNotes: [], searchSummary: 'No data found' };
      }
      
      const notes = rows.slice(1);
      const { keywords, themes } = extractedData;
      const allSearchTerms = [...keywords, ...themes].map(term => term.toLowerCase());
      
      const scoredNotes = notes.map((row, index) => {
        const [date, content] = row;
        if (!content) return null;
        
        const contentLower = content.toLowerCase();
        let score = 0;
        const matchedTerms = [];
        
        allSearchTerms.forEach(term => {
          const matches = (contentLower.match(new RegExp(term, 'g')) || []).length;
          if (matches > 0) {
            const weight = themes.includes(term) ? 3 : 1;
            score += matches * weight;
            matchedTerms.push(term);
          }
        });
        
        // Recent entries get higher relevance
        const noteDate = new Date(date);
        const daysSince = (new Date() - noteDate) / (1000 * 60 * 60 * 24);
        if (daysSince <= 7) score *= 2;
        else if (daysSince <= 30) score *= 1.5;
        
        return score > 0 ? {
          date,
          content,
          score,
          matchedTerms: [...new Set(matchedTerms)],
          daysSince: Math.round(daysSince)
        } : null;
      }).filter(Boolean);
      
      const relevantNotes = scoredNotes
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      
      const searchSummary = relevantNotes.length > 0 ? 
        `Found ${relevantNotes.length} relevant entries` : 
        'No matches found';
      
      return { relevantNotes, searchSummary };
      
    } catch (error) {
      console.error('Database search error:', error);
      return { 
        relevantNotes: [], 
        searchSummary: 'Database access failed' 
      };
    }
  }

  async handleBusinessInquiry(query) {
    try {
      const extractedData = this.extractBusinessKeywords(query);
      const { relevantNotes, searchSummary } = await this.searchBusinessDatabase(extractedData);
      
      const businessContext = relevantNotes.length > 0 ? 
        relevantNotes.map(note => {
          const timeframe = note.daysSince === 0 ? 'today' : 
                          note.daysSince === 1 ? 'yesterday' :
                          note.daysSince <= 7 ? `${note.daysSince} days ago` :
                          note.date;
          return `[${timeframe}] ${note.content.substring(0, 300)}`;
        }).join('\n\n---\n\n') :
        'No specific data found for this query';
      
      const systemPrompt = `You are a business advisor who has been tracking this person's daily business activities and notes. You understand their business patterns and can provide strategic advice based on their history.

Your role:
- Analyze their question using their actual business data
- Provide practical, actionable business advice
- Reference specific activities from their notes when relevant
- Keep responses focused and professional
- Don't be overly enthusiastic or use excessive punctuation

Business context found:
- Keywords: ${extractedData.keywords.join(', ')}
- Business areas: ${extractedData.themes.join(', ')}
- Data status: ${searchSummary}`;

      const userPrompt = `Question: "${query}"

Recent business activities and notes:
${businessContext}

Based on this person's recent business activities above, provide relevant advice and insights. Reference specific activities when they relate to the question. If no specific data was found, provide general business guidance but mention the lack of recent activity data.`;

      const response = await fetch('https://elysia-api.ngrok.io/api/public/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.YG3_API_KEY}`
        },
        body: JSON.stringify({
          model: 'elysia',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 400,
          temperature: 0.6
        })
      });

      const data = await response.json();
      let businessResponse = data.choices?.[0]?.message?.content?.trim();
      
      if (!businessResponse) {
        return this.generateFallbackResponse(query, extractedData, relevantNotes);
      }

      return businessResponse;
      
    } catch (error) {
      console.error('Business analysis error:', error);
      return this.generateFallbackResponse(query, this.extractBusinessKeywords(query), []);
    }
  }

  generateFallbackResponse(query, extractedData, relevantNotes = []) {
    if (relevantNotes.length > 0) {
      const recentNote = relevantNotes[0];
      const timeframe = recentNote.daysSince === 0 ? 'today' : 
                       recentNote.daysSince === 1 ? 'yesterday' :
                       `${recentNote.daysSince} days ago`;
      
      return `I found this from ${timeframe} that might be relevant to your question about "${query}":

${recentNote.content.substring(0, 250)}...

What specific aspect of this are you looking to address?`;
    }
    
    return `I don't have recent data about "${query}" in your notes. Can you give me more context about what you're trying to figure out?`;
  }

  async start() {
    try {
      await this.app.start();
      console.log('Business bot is running on Replit');
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  }
}

async function startBot() {
  console.log('Starting business bot...');
  const bot = new BusinessPartnerBot();
  await bot.start();
}

startBot();

// Keep the bot alive on Replit
setInterval(() => {
  console.log('Bot heartbeat');
}, 60000); // Every minute