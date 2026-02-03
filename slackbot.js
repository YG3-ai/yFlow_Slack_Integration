const { WebClient } = require('@slack/web-api');
const fetch = require('node-fetch');

class DailyNotesSlackBot {
  constructor(slackToken, yg3ApiKey) {
    this.slack = new WebClient(slackToken);
    this.yg3ApiKey = yg3ApiKey;
  }

  async handleQuery(query, thread) {
    try {
      const response = await fetch('https://elysia-api.ngrok.io/api/public/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.yg3ApiKey}`
        },
        body: JSON.stringify({
          model: 'elysia',
          messages: [
            {
              role: 'system', 
              content: `You are a spiritually enlightened coach and angel that helps query a personal daily notes database. 
              Use the provided query to find relevant insights from past daily reflections.
              
              Key Guidelines:
              - Be precise and concise
              - Focus on extracting meaningful information
              - If no relevant information is found, clearly state that
              - Prioritize business and personal growth insights`
            },
            {
              role: 'user', 
              content: `Query the daily notes database for: ${query}

              Provide a structured response that:
              - Summarizes relevant findings
              - Highlights key insights
              - Connects past reflections to the current query`
            }
          ],
          max_tokens: 300,
          temperature: 0.5
        })
      });

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content?.trim() || 
        'Sorry, I couldn\'t find relevant information in the daily notes.';

      return responseText;
    } catch (error) {
      console.error('Query processing error:', error);
      return 'There was an error processing your query. Please try again.';
    }
  }

  async processSlackMessage(message) {
    try {
      // Extract query from message
      const query = message.text.replace('<@BOT_USER_ID>', '').trim();

      // Process the query
      const response = await this.handleQuery(query);

      // Send response to Slack
      await this.slack.chat.postMessage({
        channel: message.channel,
        thread_ts: message.thread_ts || message.ts,
        text: response
      });
    } catch (error) {
      console.error('Slack message processing error:', error);
    }
  }

  async startListening() {
    const { WebSocket } = require('ws');
    
    try {
      const rtmResponse = await fetch('https://slack.com/api/rtm.connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        }
      });

      const rtmData = await rtmResponse.json();
      
      if (!rtmData.ok) {
        throw new Error(`RTM connection failed: ${rtmData.error}`);
      }

      const socket = new WebSocket(rtmData.url);

      socket.on('open', () => {
        console.log('Connected to Slack RTM API');
      });

      socket.on('message', async (data) => {
        const message = JSON.parse(data.toString());
        
        // Check if it's a message event and mentions the bot
        if (message.type === 'message' && message.text && message.text.includes('<@BOT_USER_ID>')) {
          await this.processSlackMessage(message);
        }
      });

      socket.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      socket.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
      });

    } catch (error) {
      console.error('RTM connection error:', error);
    }
  }
}

module.exports = DailyNotesSlackBot;