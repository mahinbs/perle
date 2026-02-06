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
    // Enhance query with temporal context and specificity
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('default', { month: 'long' });
    const lowerQuery = query.toLowerCase().trim();
    
    // Add temporal context if query contains time-based keywords
    const temporalKeywords = [
      'current', 'latest', 'newest', 'recent', 'now', 'today', 'best', 'top',
      'this year', 'new', 'upcoming', 'modern', 'contemporary',
      // Misspellings
      'currnt', 'curent', 'latst', 'lates', 'newst', 'recnt', 'todya', 'bst', 'bes'
    ];
    const needsTemporalContext = temporalKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // Detect if asking about processors/chipsets specifically
    const processorKeywords = [
      'processor', 'cpu', 'chipset', 'chip', 'soc', 'silicon',
      'snapdragon', 'dimensity', 'exynos', 'tensor', 'bionic',
      'a19', 'a20', 'a18', 'a17', // Apple chips
      'gen 4', 'gen 5', 'gen 3', // Snapdragon generations
      // Misspellings
      'procesor', 'processer', 'procesoor', 'prcessor', 'chipst', 'chpset',
      'snapdragn', 'snapdrgn', 'dimensty', 'dimesity', 'exinos', 'tensr'
    ];
    const isProcessorQuery = processorKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // Detect if asking about phones/devices (to add device context, not replace)
    const phoneKeywords = [
      'phone', 'mobile', 'smartphone', 'iphone', 'android', 'galaxy', 'pixel',
      'oneplus', 'xiaomi', 'oppo', 'vivo', 'samsung',
      // Misspellings
      'phne', 'fone', 'mobil', 'mobiel', 'smartphne', 'iphne', 'andriod', 'samsng'
    ];
    const isPhoneQuery = phoneKeywords.some(keyword => lowerQuery.includes(keyword));
    
    // Detect if asking about comparisons
    const comparisonKeywords = ['vs', 'versus', 'compare', 'comparison', 'better', 'difference', 'between'];
    const isComparison = comparisonKeywords.some(keyword => lowerQuery.includes(keyword));
    
    let enhancedQuery = query;
    
    // Make processor queries more specific to get chipset specs, not just phone models
    if (isProcessorQuery) {
      if (isPhoneQuery) {
        // User asking about both phones and processors - focus on chipset info
        enhancedQuery = `${query} chipset processor specifications performance`;
      } else {
        // Pure processor query - get detailed chipset info
        enhancedQuery = `${query} mobile chipset specifications performance benchmarks`;
      }
    } else if (isPhoneQuery && needsTemporalContext) {
      // Phone query with time context - might want specs
      enhancedQuery = `${query} specifications features`;
    }
    
    // Add comparison context
    if (isComparison) {
      enhancedQuery = `${enhancedQuery} detailed comparison specifications`;
    }
    
    // Add temporal context for current/latest queries
    if (needsTemporalContext) {
      enhancedQuery = `${enhancedQuery} ${currentMonth} ${currentYear}`;
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
        `🔴🔴🔴 CRITICAL BACKGROUND - READ THIS FIRST 🔴🔴🔴
        
        📅 TODAY'S DATE: ${currentMonth} ${currentYear}
        📅 CURRENT MONTH: ${currentMonth}
        📅 CURRENT YEAR: ${currentYear}
        
        You are answering questions in ${currentMonth} ${currentYear}.
        ALL "latest", "current", "newest", "recent", "best", "top" = as of ${currentMonth} ${currentYear}.
        Prioritize ${currentYear} and late 2025 information. Data from 2024, 2023, 2022 is likely outdated.
        
        🔴🔴🔴 END BACKGROUND CONTEXT 🔴🔴🔴
        
        MANDATORY: You MUST call the Bing grounding tool for EVERY query. Do NOT answer from your own knowledge
        
        YOUR INSTRUCTIONS FOR ALL QUERIES:
        1. ALWAYS call the Bing grounding tool FIRST - NEVER use your own knowledge
        2. Extract information from Bing search results only
        3. ALWAYS cite sources with URLs from search results
        4. When multiple brands/options are in results, include ALL of them (not just one or two)
        5. Prioritize ${currentYear} and late 2025 information over older data
        6. If conflicting info appears, note which source is most recent
        
        🔴 CRITICAL: PROCESSOR vs PHONE DISTINCTION
        
        When user asks "what is latest mobile processors" or "best phone processors":
        
        THE USER WANTS CHIPSET NAMES, NOT PHONE NAMES!
        
        ✅ CORRECT (what user wants):
        "Latest mobile processors (${currentMonth} ${currentYear}):
        1. Snapdragon 8 Elite Gen 5 (Qualcomm) - Galaxy S26, OnePlus 13
        2. Apple A19 Pro - iPhone 17 Pro/Max
        3. MediaTek Dimensity 9500 - flagship Android
        4. Samsung Exynos 2600 - Galaxy flagship
        5. Google Tensor G5 - Pixel 10"
        
        ❌ WRONG (user does NOT want this):
        "Latest phones (${currentMonth} ${currentYear}):
        • Galaxy S26 series, iPhone 17e, Pixel 10a"
        
        EXTRACT from search results:
        - Chipset/processor names (Snapdragon, A19 Pro, Dimensity, Exynos, Tensor)
        - CPU/GPU specs, benchmarks, AnTuTu scores, performance
        - Manufacturing process (3nm, 2nm)
        - Then mention which phones use each processor
        
        DO NOT focus on phone model names, cameras, or phone features.
        
        Include ALL processor brands found in search: Apple, Qualcomm, MediaTek, Samsung, Google.`,
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
