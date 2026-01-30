/**
 * Azure Grounding with Bing Search using Azure AI Foundry Agent Service
 * This replaces the old Bing Search v7 API which was retired in August 2025
 */

import { AgentsClient, ToolUtility } from '@azure/ai-agents';
import { ClientSecretCredential } from '@azure/identity';

export interface GroundingSearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface GroundingCitation {
  url: string;
  title?: string;
  snippet?: string;
}

/**
 * Search using Azure Grounding with Bing via AI Foundry Agent Service
 * Returns citations that can be used as sources
 */
export async function searchWithAzureGrounding(
  query: string,
  maxResults: number = 15
): Promise<GroundingSearchResult[]> {
  // Check required environment variables
  const projectEndpoint = process.env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT;
  const bingConnectionId = process.env.AZURE_BING_CONNECTION_ID;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const modelDeploymentName = process.env.AZURE_MODEL_DEPLOYMENT_NAME || 'gpt-4o';
  
  console.log(`🔧 Azure config: model="${modelDeploymentName}", endpoint="${projectEndpoint?.substring(0, 50)}..."`);

  if (!projectEndpoint) {
    console.warn('⚠️ AZURE_AI_FOUNDRY_PROJECT_ENDPOINT not configured - skipping Azure Grounding search');
    console.warn('💡 Set it in .env: https://your-project.your-region.models.ai.azure.com');
    return [];
  }

  if (!bingConnectionId) {
    console.warn('⚠️ AZURE_BING_CONNECTION_ID not configured - skipping Azure Grounding search');
    console.warn('💡 Get it from Azure AI Foundry → Connected Resources → Your Bing resource');
    return [];
  }

  if (!tenantId || !clientId || !clientSecret) {
    console.warn('⚠️ Azure Service Principal credentials not configured');
    console.warn('💡 Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in .env');
    return [];
  }

  try {
    // Enhance query with temporal context for current queries
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    
    // Add temporal context if query contains "current", "latest", "recent", etc.
    const temporalKeywords = ['current', 'latest', 'newest', 'recent', 'now', 'today'];
    const needsTemporalContext = temporalKeywords.some(keyword => 
      query.toLowerCase().includes(keyword)
    );
    
    let enhancedQuery = query;
    
    if (needsTemporalContext) {
      // Just add the year/month context - keep it simple
      enhancedQuery = `${query} ${currentMonth} ${currentYear}`;
    }
    
    console.log(`🔍 Searching with Azure Grounding with Bing for: "${enhancedQuery}"`);

    // Create credential using Service Principal (for Render deployment)
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);

    // Create Agents client
    const client = new AgentsClient(projectEndpoint, credential);

    // Define the Bing Grounding tool using createBingGroundingTool
    const bingTool = ToolUtility.createBingGroundingTool([
      {
        connectionId: bingConnectionId,
        count: maxResults,
      },
    ]);

    // Create an agent with Bing grounding capability
    const agent = await client.createAgent(modelDeploymentName, {
      name: 'SyntraIQ-Search-Agent',
      instructions:
        `You MUST use the Bing grounding tool to search the web and find current information.
        
        CRITICAL: You MUST call the Bing search tool for EVERY query. Do NOT answer from your own knowledge.
        
        When searching for technology information (processors, phones, etc.) in ${currentYear}:
        1. FIRST: Call the Bing tool to search the web
        2. Use the search results to provide accurate, current information
        3. ALWAYS include source URLs in your response
        4. If results mention outdated products (like A17 Pro from 2023 for "latest" queries), note they are outdated
        
        Today's date: ${currentMonth} ${currentYear}
        Focus on information from ${currentYear} and late 2025 for "current" or "latest" queries.`,
      tools: [bingTool.definition],
    });

    // Create a conversation thread
    const thread = await client.threads.create();

    // Add user message with enhanced query
    await client.messages.create(thread.id, 'user', enhancedQuery);

    // Create and start the run
    let run = await client.runs.create(thread.id, agent.id);

    // Poll for completion (max 30 seconds)
    const maxAttempts = 30;
    let attempts = 0;
    
    while (
      (run.status === 'queued' || run.status === 'in_progress') &&
      attempts < maxAttempts
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await client.runs.get(thread.id, run.id);
      attempts++;
    }

    if (run.status !== 'completed') {
      console.error('❌ Azure Agent run did not complete:', run.status);
      if ((run as any).lastError) {
        console.error('❌ Last error:', JSON.stringify((run as any).lastError, null, 2));
      }
      console.error('❌ Run details:', JSON.stringify(run, null, 2));
      return [];
    }
    
    console.log(`✅ Azure Agent run completed after ${attempts} attempts`);

    // Get messages
    let messagesIterator;
    try {
      messagesIterator = client.messages.list(thread.id);
      if (!messagesIterator) {
        console.error('❌ Messages iterator is undefined');
        return [];
      }
    } catch (iterError: any) {
      console.error('❌ Error creating messages iterator:', iterError.message);
      return [];
    }

    const messagesArray: any[] = [];
    try {
      for await (const message of messagesIterator) {
        if (message) {
          messagesArray.push(message);
        }
      }
    } catch (iterLoopError: any) {
      console.error('❌ Error iterating messages:', iterLoopError.message);
      return [];
    }

    const assistantMessage = messagesArray?.find((m: any) => m?.role === 'assistant');

    if (!assistantMessage) {
      console.warn('⚠️ No assistant response from Azure Agent');
      console.log('📋 All messages:', JSON.stringify(messagesArray, null, 2));
      return [];
    }

    console.log(`✅ Assistant message found, content items: ${assistantMessage?.content?.length || 0}`);

    // Extract citations from the response
    const citations: GroundingCitation[] = [];

    // Parse citations from message content - use optional chaining
    const contentArray = assistantMessage?.content || [];
    console.log(`📊 Processing ${contentArray.length} content items for citations`);
    
    for (const contentItem of contentArray) {
      // Annotations are nested inside text object
      const annotations = contentItem?.text?.annotations || contentItem?.annotations || [];
      console.log(`📊 Content item has ${annotations.length} annotations`);
      
      for (const annotation of annotations) {
        // Check for urlCitation (camelCase - Azure uses this format)
        if (annotation?.urlCitation) {
          citations.push({
            url: annotation.urlCitation.url || '',
            title: annotation.urlCitation.title || undefined,
            snippet: undefined,
          });
        }
        // Also check for url_citation (snake_case - older format)
        else if (annotation?.url_citation) {
          citations.push({
            url: annotation.url_citation.url || '',
            title: annotation.url_citation.title || undefined,
            snippet: undefined,
          });
        } 
        // Check for text with URLs as fallback
        else if (annotation?.text) {
          const urlMatch = annotation.text.match(/https?:\/\/[^\s)]+/);
          if (urlMatch) {
            citations.push({
              url: urlMatch[0],
              title: undefined,
              snippet: undefined,
            });
          }
        }
      }
    }

    console.log(`✅ Azure Grounding with Bing found ${citations.length} sources`);
    
    // If no citations found, log the message content for debugging
    if (citations.length === 0) {
      console.warn('⚠️ No citations extracted from assistant message');
      console.log('📋 Assistant message content sample:', JSON.stringify(contentArray[0], null, 2).substring(0, 500));
    }

    // Clean up (delete agent and thread to avoid clutter)
    try {
      await client.deleteAgent(agent.id);
      await client.threads.delete(thread.id);
    } catch (cleanupError) {
      console.warn('⚠️ Failed to cleanup Azure resources:', cleanupError);
    }

    // Convert citations to SearchResult format with optional chaining
    const results: GroundingSearchResult[] = citations?.map((citation, index) => {
      try {
        const url = new URL(citation.url);
        return {
          title: citation.title || url.hostname,
          url: citation.url,
          content: citation.snippet || `Source from ${url.hostname}`,
          score: 1 - index / maxResults,
        };
      } catch (urlError) {
        console.warn(`⚠️ Invalid URL in citation: ${citation.url}`);
        return null;
      }
    }).filter((result): result is GroundingSearchResult => result !== null) || [];

    return results;
  } catch (error: any) {
    console.error('❌ Azure Grounding with Bing error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    console.error('💡 Troubleshooting:');
    console.error('   1. Verify AZURE_AI_FOUNDRY_PROJECT_ENDPOINT is correct');
    console.error('   2. Verify AZURE_BING_CONNECTION_ID is correct');
    console.error('   3. Verify Service Principal has access to the AI Foundry project');
    console.error('   4. Check Azure Portal for any quota/billing issues');
    return [];
  }
}
