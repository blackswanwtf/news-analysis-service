/**
 * Black Swan News Analysis Service
 *
 * Author: Muhammad Bilal Motiwala
 * Project: Black Swan
 *
 * This service monitors RSS feeds and performs global news searches to identify
 * events that could impact cryptocurrency markets. It uses AI-powered analysis
 * to assess market influence and generate actionable insights.
 *
 * Key Features:
 * - RSS feed monitoring with 6-hour article retention
 * - Global news search via Perplexity AI
 * - Combined analysis using OpenRouter LLM
 * - Automated impact assessment and risk classification
 * - Firestore storage for analysis results
 * - RESTful API for manual triggers and data access
 */

// Load environment variables from .env file
require("dotenv").config();

// Core dependencies for web server and security
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const compression = require("compression");

// Firebase Admin SDK for Firestore database operations
const admin = require("firebase-admin");

// HTTP client for external API calls
const axios = require("axios");

// Cron job scheduler for automated analysis cycles
const cron = require("node-cron");

// Custom prompt management system for LLM interactions
const NewsPromptManager = require("./prompts/prompt-config");

/**
 * Firebase Admin SDK Initialization
 *
 * Initializes Firebase Admin with service account credentials for Firestore access.
 * The serviceAccountKey.json file contains the Firebase service account credentials
 * required for server-side database operations.
 */
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Get Firestore database instance for storing analysis results
const db = admin.firestore();

/**
 * Service Configuration
 *
 * Centralized configuration object containing all service parameters,
 * API endpoints, timing intervals, and analysis thresholds.
 */
const CONFIG = {
  // OpenRouter API configuration for LLM access
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",

  // RSS Feed Service URL for fetching news articles
  RSS_FEED_SERVICE_URL: process.env.RSS_FEED_SERVICE_URL,

  // Server configuration
  PORT: process.env.PORT || 8088,

  // Analysis timing configuration
  // Cron expression: runs 2 minutes before every hour (00:58, 01:58, 02:58, etc.)
  ANALYSIS_INTERVAL: "58 * * * *",
  MAX_ARTICLES_PER_ANALYSIS: 50, // Maximum articles to process in one analysis cycle
  ARTICLE_LOOKBACK_HOURS: 6, // How far back to look for articles
  ARTICLE_RETENTION_HOURS: 6, // How long to keep articles in memory
  CLEANUP_INTERVAL: "0 */2 * * *", // Cleanup old articles every 2 hours

  // Perplexity search configuration for global news discovery
  PERPLEXITY_SEARCH_QUERIES: [
    "cryptocurrency and stockmarket regulatory news breaking developments today",
    "US government SEC crypto regulation policy decisions announcements",
    "global financial markets crisis recession economic impact cryptocurrency",
    "central bank interest rates monetary policy bitcoin ethereum impact",
    "geopolitical events international conflicts affecting cryptocurrency markets",
    "major financial institutions banks crypto adoption regulatory decisions",
  ],
  PERPLEXITY_MAX_TOKENS: 70000, // Maximum tokens for Perplexity responses
  PERPLEXITY_TIMEOUT: 60000, // 60 seconds timeout for Perplexity search

  // Impact classification thresholds
  IMPACT_THRESHOLDS: {
    CRITICAL_SCORE: 8, // Scores 8+ are classified as critical
    HIGH_SCORE: 6, // Scores 6+ are classified as high impact
    MEDIUM_SCORE: 4, // Scores 4+ are classified as medium impact
  },

  // LLM configuration for analysis
  LLM_MODEL: "openai/gpt-5-mini", // Model to use for news analysis
  LLM_TIMEOUT: 60000, // 60 seconds timeout for LLM requests
  LLM_MAX_TOKENS: 50000, // Maximum tokens for LLM responses
};

/**
 * Express Application Setup
 *
 * Configures the Express web server with security middleware,
 * rate limiting, and request parsing capabilities.
 */
const app = express();

// Security middleware stack
app.use(helmet()); // Sets various HTTP headers for security
app.use(compression()); // Compresses responses to reduce bandwidth
app.use(cors()); // Enables Cross-Origin Resource Sharing
app.use(express.json({ limit: "10mb" })); // Parses JSON bodies with 10MB limit

// Rate limiting configuration to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 100, // Maximum 100 requests per IP per window
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter); // Apply rate limiting to all API routes

/**
 * Global Service State
 *
 * Maintains the current state of the service including running status,
 * analysis statistics, and article retention data.
 */
let serviceState = {
  isRunning: false, // Whether the service is currently running
  isAnalyzing: false, // Whether an analysis is currently in progress
  lastAnalysis: null, // Details of the most recent analysis
  totalAnalyses: 0, // Total number of analyses performed
  stats: {
    totalArticlesProcessed: 0, // Total RSS articles processed
    totalPerplexitySearches: 0, // Total Perplexity searches performed
    criticalAlertsGenerated: 0, // Number of critical impact alerts
    highImpactEventsDetected: 0, // Number of high impact events found
    averageImpactScore: 0, // Average impact score across analyses
    lastRSSCheck: null, // Timestamp of last RSS feed check
    lastPerplexitySearch: null, // Timestamp of last Perplexity search
    recentAnalyses: [], // Array of recent analysis results (last 10)
  },
  // Article retention system for 6-hour article storage
  retainedArticles: new Map(), // key: article_id, value: {article, timestamp}
  lastCleanup: null, // Timestamp of last article cleanup
};

/**
 * Initialize Prompt Manager
 *
 * Creates an instance of the prompt management system that handles
 * loading and templating of LLM prompts for news analysis.
 */
const promptManager = new NewsPromptManager();

/**
 * RSS Article Fetcher Class
 *
 * Handles communication with the RSS Feed Service to fetch recent articles
 * and check for new content. This class manages the retrieval of news articles
 * from various RSS sources that are relevant to cryptocurrency markets.
 */
class NewsRSSFetcher {
  constructor() {
    this.lastFetchTime = null; // Timestamp of the last successful fetch
  }

  /**
   * Fetch recent articles from the RSS Feed Service
   *
   * @param {number} hours - Number of hours to look back for articles (default: 6)
   * @param {number|null} minImpact - Minimum impact score filter (not used in current implementation)
   * @returns {Array} Array of article objects from RSS feeds
   */
  async fetchRecentArticles(hours = 6, minImpact = null) {
    try {
      console.log(`📰 [RSS] Fetching articles from last ${hours} hours...`);

      // Make HTTP request to RSS Feed Service
      const response = await axios.get(
        `${CONFIG.RSS_FEED_SERVICE_URL}/api/articles/recent`,
        {
          timeout: 15000, // 15 second timeout
          params: {
            hours: hours,
            limit: CONFIG.MAX_ARTICLES_PER_ANALYSIS,
          },
          headers: {
            "User-Agent": "BlackSwan News Analysis Service/1.0.0",
          },
        }
      );

      if (!response.data.success) {
        console.warn(
          `⚠️ [RSS] Failed to fetch articles: ${response.data.error}`
        );
        return [];
      }

      const articles = response.data.articles || [];
      this.lastFetchTime = new Date().toISOString();

      console.log(`📊 [RSS] Fetched ${articles.length} articles for analysis`);
      return articles;
    } catch (error) {
      console.error(`❌ [RSS] Error fetching articles:`, error.message);
      return [];
    }
  }

  /**
   * Check if new articles are available from RSS feeds
   *
   * @returns {boolean} True if new articles are available, false otherwise
   */
  async checkForNewArticles() {
    try {
      console.log(`🔍 [RSS] Checking for new articles...`);

      // Check RSS Feed Service for new articles
      const response = await axios.get(
        `${CONFIG.RSS_FEED_SERVICE_URL}/api/articles/new`,
        {
          timeout: 10000, // 10 second timeout
          headers: {
            "User-Agent": "BlackSwan News Analysis Service/1.0.0",
          },
        }
      );

      if (!response.data.success) {
        console.warn(
          `⚠️ [RSS] New article check failed: ${response.data.error}`
        );
        return false;
      }

      return response.data.new_articles_available;
    } catch (error) {
      console.error(`❌ [RSS] Error checking for new articles:`, error.message);
      return false;
    }
  }
}

/**
 * Market Context Fetcher removed - service focuses purely on news analysis
 *
 * This service has been simplified to focus exclusively on news analysis
 * without market context integration for cleaner, more focused results.
 */

/**
 * JSON Extraction Helper Function
 *
 * Extracts JSON content from Perplexity AI responses that may be wrapped
 * in markdown code blocks or contain formatting artifacts. This function
 * handles various response formats to ensure reliable JSON parsing.
 *
 * @param {string} content - Raw response content from Perplexity
 * @returns {string} Cleaned JSON string ready for parsing
 */
function extractJsonFromResponse(content) {
  // Remove leading/trailing whitespace
  content = content.trim();

  // Define regex patterns to match various markdown code block formats
  const patterns = [
    /```(?:json)?\s*\n?([\s\S]*?)\n?```/i, // Standard markdown code blocks
    /`{3}(?:json)?\s*\n?([\s\S]*?)\n?`{3}/i, // Alternative backticks
    /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im, // Full match
  ];

  // Try each pattern to find JSON content
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].trim(); // Return the captured JSON content
    }
  }

  // Remove any stray backticks at the beginning or end
  content = content.replace(/^`+|`+$/g, "");

  // Look for JSON object boundaries if no code block found
  const jsonStartIndex = content.indexOf("{");
  const jsonEndIndex = content.lastIndexOf("}");

  // Extract JSON if valid boundaries are found
  if (
    jsonStartIndex !== -1 &&
    jsonEndIndex !== -1 &&
    jsonEndIndex > jsonStartIndex
  ) {
    return content.substring(jsonStartIndex, jsonEndIndex + 1);
  }

  // If no JSON boundaries found, return original content
  return content;
}

/**
 * Perplexity News Searcher Class
 *
 * Performs global news searches using Perplexity AI via OpenRouter to discover
 * breaking news and events that could impact cryptocurrency markets. This class
 * focuses on finding real-time global events that may not be captured by RSS feeds.
 */
class PerplexityNewsSearcher {
  constructor() {
    this.searchCount = 0; // Total number of searches performed
    this.lastSearchTime = null; // Timestamp of the last search
  }

  /**
   * Search for global news events that could impact cryptocurrency markets
   *
   * Uses Perplexity AI to search for breaking news, regulatory announcements,
   * economic indicators, and geopolitical events that may affect crypto markets.
   *
   * @returns {Object} Search results containing global news events and analysis
   */
  async searchGlobalNews() {
    try {
      console.log(
        `🔍 [PERPLEXITY] Searching for latest global crypto-relevant news...`
      );

      // Construct comprehensive search query for crypto-relevant global events
      const searchQuery = `Search for and analyze the most important global news events in the last 24 hours that could significantly impact cryptocurrency markets.

Focus specifically on:
- Regulatory announcements and government policy decisions affecting crypto
- Central bank decisions, interest rate changes, and monetary policy
- Major economic indicators, recession signals, or financial market instability
- Geopolitical events, wars, sanctions, or international conflicts
- Major financial institution decisions regarding cryptocurrency
- Technology developments, security breaches, or protocol issues
- Corporate adoption or rejection of cryptocurrency
- Breaking news from major governments (US, EU, China, etc.)

Return the results in the following JSON format:
{
  "global_news_events": [
    {
      "title": "Event title",
      "description": "Detailed description of the event and its potential crypto market impact",
      "timestamp": "ISO timestamp if available",
      "source": "Primary source of information",
      "category": "regulatory|monetary|economic|geopolitical|technology|institutional|corporate|other",
      "crypto_relevance": "high|medium|low",
      "potential_impact": "positive|negative|neutral",
      "affected_assets": ["bitcoin", "ethereum", "defi", "altcoins", "stablecoins", "entire_market"],
      "summary": "Brief one-sentence summary",
      "market_implications": "Specific explanation of how this could affect crypto markets"
    }
  ],
  "search_summary": "Overall summary of major themes and potential crypto market impacts",
  "total_events": 0,
  "search_timestamp": "${new Date().toISOString()}",
  "risk_assessment": "overall assessment of current global risk environment for crypto"
}

Provide only valid JSON, no additional text. Focus on events with medium to high crypto relevance. Aim for 8-15 of the most significant events.`;

      // Make API request to OpenRouter with Perplexity model
      const response = await axios.post(
        `${CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: "perplexity/sonar", // Perplexity's real-time search model
          messages: [
            {
              role: "user",
              content: searchQuery,
            },
          ],
          max_tokens: CONFIG.PERPLEXITY_MAX_TOKENS,
        },
        {
          headers: {
            Authorization: `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "X-Title": "BlackSwan News Analysis Service",
          },
          timeout: CONFIG.PERPLEXITY_TIMEOUT,
        }
      );

      // Extract response content from OpenRouter
      const content = response.data.choices[0].message.content.trim();

      // Extract JSON from potential markdown code blocks
      const jsonContent = extractJsonFromResponse(content);

      // Parse the JSON response and validate structure
      try {
        const searchData = JSON.parse(jsonContent);

        // Validate and ensure required data structure exists
        if (!searchData.global_news_events) {
          searchData.global_news_events = [];
        }

        // Update metadata and statistics
        searchData.total_events = searchData.global_news_events.length;
        searchData.search_timestamp = new Date().toISOString();

        // Update class and service statistics
        this.searchCount++;
        this.lastSearchTime = new Date().toISOString();
        serviceState.stats.totalPerplexitySearches++;
        serviceState.stats.lastPerplexitySearch = this.lastSearchTime;

        console.log(
          `✅ [PERPLEXITY] Successfully found ${searchData.total_events} crypto-relevant global news events`
        );

        return searchData;
      } catch (parseError) {
        console.error(
          `❌ [PERPLEXITY] Failed to parse JSON response:`,
          parseError.message
        );
        console.error(
          `❌ [PERPLEXITY] Raw response content:`,
          content.substring(0, 500) + "..."
        );
        console.error(
          `❌ [PERPLEXITY] Extracted JSON content:`,
          jsonContent.substring(0, 500) + "..."
        );

        return {
          global_news_events: [],
          search_summary: "Failed to parse search results",
          total_events: 0,
          search_timestamp: new Date().toISOString(),
          error: "JSON parsing failed",
          raw_response: content,
        };
      }
    } catch (error) {
      console.error(
        `❌ [PERPLEXITY] Error in global news search:`,
        error.message
      );

      return {
        global_news_events: [],
        search_summary: "Error occurred while searching global news",
        total_events: 0,
        search_timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }
}

/**
 * Article Retention Manager Class
 *
 * Manages the temporary storage and cleanup of RSS articles for a 6-hour period.
 * This ensures that articles are available for analysis even if they are not
 * immediately processed, providing a buffer for comprehensive analysis cycles.
 */
class ArticleRetentionManager {
  constructor() {
    this.cleanupCount = 0; // Number of cleanup operations performed
  }

  /**
   * Add articles to the retention system
   *
   * @param {Array} articles - Array of article objects to retain
   * @returns {number} Number of new articles added
   */
  addArticles(articles) {
    const now = Date.now();
    let addedCount = 0;

    // Process each article and add to retention if not already present
    articles.forEach((article) => {
      const articleId = this.generateArticleId(article);
      if (!serviceState.retainedArticles.has(articleId)) {
        serviceState.retainedArticles.set(articleId, {
          article: article,
          timestamp: now,
        });
        addedCount++;
      }
    });

    console.log(
      `📚 [RETENTION] Added ${addedCount} new articles, total retained: ${serviceState.retainedArticles.size}`
    );
    return addedCount;
  }

  /**
   * Get all currently retained articles
   *
   * @returns {Array} Array of article objects currently in retention
   */
  getRetainedArticles() {
    // Extract articles from retention map, discarding timestamps
    const articles = Array.from(serviceState.retainedArticles.values()).map(
      (item) => item.article
    );
    console.log(
      `📚 [RETENTION] Retrieved ${articles.length} retained articles`
    );
    return articles;
  }

  /**
   * Remove articles older than the retention period
   *
   * @returns {number} Number of articles removed
   */
  cleanupOldArticles() {
    const now = Date.now();
    const retentionMs = CONFIG.ARTICLE_RETENTION_HOURS * 60 * 60 * 1000;
    let removedCount = 0;

    // Iterate through retained articles and remove expired ones
    for (const [articleId, data] of serviceState.retainedArticles.entries()) {
      if (now - data.timestamp > retentionMs) {
        serviceState.retainedArticles.delete(articleId);
        removedCount++;
      }
    }

    this.cleanupCount++;
    serviceState.lastCleanup = new Date().toISOString();

    console.log(
      `🧹 [CLEANUP] Removed ${removedCount} old articles, ${serviceState.retainedArticles.size} remaining`
    );
    return removedCount;
  }

  /**
   * Generate a unique ID for an article
   *
   * @param {Object} article - Article object
   * @returns {string} Unique article identifier
   */
  generateArticleId(article) {
    // Create unique ID based on article content
    const content =
      (article.title || "") + (article.url || "") + (article.publishedAt || "");
    return Buffer.from(content).toString("base64").substring(0, 16);
  }

  /**
   * Get retention system statistics
   *
   * @returns {Object} Statistics about the retention system
   */
  getRetentionStats() {
    return {
      totalArticles: serviceState.retainedArticles.size,
      cleanupCount: this.cleanupCount,
      lastCleanup: serviceState.lastCleanup,
      retentionHours: CONFIG.ARTICLE_RETENTION_HOURS,
    };
  }
}

/**
 * News Impact Analyzer Class
 *
 * Performs AI-powered analysis of news articles and global events to assess
 * their potential impact on cryptocurrency markets. Uses OpenRouter LLM to
 * analyze content and generate structured impact assessments.
 */
class NewsImpactAnalyzer {
  constructor() {
    this.analysisCount = 0; // Total number of analyses performed
  }

  /**
   * Analyze combined RSS articles and global news events
   *
   * @param {Array} rssArticles - Array of RSS articles to analyze
   * @param {Object} perplexityResults - Global news search results from Perplexity
   * @param {Object|null} marketContext - Market context data (not used in current implementation)
   * @returns {Object|null} Analysis results or null if no content to analyze
   */
  async analyzeCombinedNews(
    rssArticles,
    perplexityResults,
    marketContext = null
  ) {
    try {
      // Count available content for analysis
      const totalRssArticles = rssArticles ? rssArticles.length : 0;
      const totalPerplexityEvents = perplexityResults
        ? perplexityResults.total_events || 0
        : 0;

      // Check if there's any content to analyze
      if (totalRssArticles === 0 && totalPerplexityEvents === 0) {
        console.log(
          `📰 [ANALYSIS] No RSS articles or global news events to analyze`
        );
        return null;
      }

      console.log(
        `🧠 [ANALYSIS] Starting combined analysis of ${totalRssArticles} RSS articles and ${totalPerplexityEvents} global news events...`
      );

      // Format content sections for LLM prompt
      const rssSection =
        rssArticles && rssArticles.length > 0
          ? this.formatRSSArticlesForPrompt(rssArticles)
          : "No RSS articles available";

      const perplexitySection =
        perplexityResults &&
        perplexityResults.global_news_events &&
        perplexityResults.global_news_events.length > 0
          ? this.formatPerplexityResultsForPrompt(perplexityResults)
          : "No global news events available";

      // Note: Market context integration removed for focused news analysis

      // Prepare data for prompt template
      const templateData = {
        timestamp: new Date().toISOString(),
        analysis_type: "combined_rss_and_global_analysis",
        total_rss_articles: totalRssArticles,
        total_global_events: totalPerplexityEvents,
        rss_articles_section: rssSection,
        global_news_section: perplexitySection,
        market_context: "Analysis based purely on news sources",
      };

      // Generate filled prompt from template
      const prompt = promptManager.getFilledPrompt(templateData);

      // Send analysis request to OpenRouter LLM
      const response = await axios.post(
        `${CONFIG.OPENROUTER_BASE_URL}/chat/completions`,
        {
          model: CONFIG.LLM_MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: CONFIG.LLM_MAX_TOKENS,
          temperature: 0.3, // Low temperature for consistent analysis
        },
        {
          timeout: CONFIG.LLM_TIMEOUT,
          headers: {
            Authorization: `Bearer ${CONFIG.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "User-Agent": "BlackSwan News Analysis Service/1.0.0",
          },
        }
      );

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error("No response from LLM");
      }

      const rawContent = response.data.choices[0].message.content;
      console.log(`🧠 [ANALYSIS] Received LLM response`);

      // Parse JSON response
      const analysis = this.parseAnalysisResponse(rawContent);
      this.analysisCount++;

      console.log(
        `✅ [ANALYSIS] Combined analysis completed - Influence: ${
          analysis.market_influence
        }, Events: ${analysis.events ? analysis.events.length : 0}`
      );
      return analysis;
    } catch (error) {
      console.error(`❌ [ANALYSIS] Error in LLM analysis:`, error.message);
      return {
        analysis: "Analysis failed due to technical error",
        summary: "Analysis failed due to technical error",
        market_influence: "minimal",
        events: [],
        error: error.message,
      };
    }
  }

  /**
   * Format articles for LLM prompt (legacy method)
   *
   * @param {Array} articles - Array of article objects
   * @returns {string} Formatted article text for prompt
   */
  formatArticlesForPrompt(articles) {
    return articles
      .map((article, index) => {
        return `### Article ${index + 1}
**Title**: ${article.title}
**Source**: ${article.source}
**Published**: ${article.publishedAt}
**Content**: ${article.content || article.summary || "No content available"}
**URL**: ${article.url}

---`;
      })
      .join("\n\n");
  }

  /**
   * Format RSS articles for LLM prompt
   *
   * @param {Array} articles - Array of RSS article objects
   * @returns {string} Formatted RSS article text for prompt
   */
  formatRSSArticlesForPrompt(articles) {
    if (!articles || articles.length === 0) {
      return "No RSS articles available";
    }

    return articles
      .map((article, index) => {
        return `### RSS Article ${index + 1}
**Title**: ${article.title}
**Source**: ${article.source}
**Published**: ${article.publishedAt}
**Content**: ${article.content || article.summary || "No content available"}
**URL**: ${article.url}

---`;
      })
      .join("\n\n");
  }

  /**
   * Format Perplexity search results for LLM prompt
   *
   * @param {Object} perplexityResults - Perplexity search results object
   * @returns {string} Formatted global news events text for prompt
   */
  formatPerplexityResultsForPrompt(perplexityResults) {
    if (
      !perplexityResults ||
      !perplexityResults.global_news_events ||
      perplexityResults.global_news_events.length === 0
    ) {
      return "No global news events available";
    }

    const eventsSection = perplexityResults.global_news_events
      .map((event, index) => {
        return `### Global News Event ${index + 1}
**Title**: ${event.title}
**Source**: ${event.source}
**Category**: ${event.category}
**Crypto Relevance**: ${event.crypto_relevance}
**Potential Impact**: ${event.potential_impact}
**Description**: ${event.description}
**Market Implications**: ${event.market_implications}
**Affected Assets**: ${
          event.affected_assets ? event.affected_assets.join(", ") : "N/A"
        }
**Timestamp**: ${event.timestamp || "N/A"}

---`;
      })
      .join("\n\n");

    return `**Global News Search Summary**: ${perplexityResults.search_summary}
**Total Events Found**: ${perplexityResults.total_events}
**Risk Assessment**: ${perplexityResults.risk_assessment}
**Search Timestamp**: ${perplexityResults.search_timestamp}

## Individual Global News Events:

${eventsSection}`;
  }

  /**
   * Market context formatting removed - service focuses purely on news analysis
   *
   * This method was removed to simplify the service and focus exclusively
   * on news analysis without market data integration.
   */

  /**
   * Parse and validate LLM analysis response
   *
   * @param {string} rawContent - Raw response content from LLM
   * @returns {Object} Parsed and validated analysis object
   * @throws {Error} If parsing fails or required fields are missing
   */
  parseAnalysisResponse(rawContent) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonContent = extractJsonFromResponse(rawContent);

      // Parse JSON response
      const analysis = JSON.parse(jsonContent);

      // Validate that all required fields are present
      const requiredFields = [
        "analysis",
        "summary",
        "market_influence",
        "events",
      ];

      for (const field of requiredFields) {
        if (!(field in analysis)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Ensure events is an array
      if (!Array.isArray(analysis.events)) {
        analysis.events = [];
      }

      // Validate and sanitize each event object
      analysis.events = analysis.events.map((event, index) => {
        return {
          title: event.title || `Event ${index + 1}`,
          summary: event.summary || "No summary available",
          analysis: event.analysis || "No analysis available",
        };
      });

      // Sanitize main analysis fields to prevent undefined values
      const sanitizedAnalysis = {
        analysis: analysis.analysis || "No analysis available",
        summary: analysis.summary || "No summary available",
        market_influence: analysis.market_influence || "minimal",
        events: analysis.events || [],
      };

      return sanitizedAnalysis;
    } catch (error) {
      console.error(
        `❌ [PARSE] Error parsing analysis response:`,
        error.message
      );
      console.error(`Raw content: ${rawContent}`);
      throw new Error(`Failed to parse analysis response: ${error.message}`);
    }
  }
}

/**
 * Analysis Storage Class
 *
 * Handles persistent storage of analysis results in Firestore database.
 * Provides methods for storing, retrieving, and managing news analysis data.
 */
class AnalysisStorage {
  constructor() {
    this.collection = db.collection("news_analysis"); // Firestore collection reference
  }

  /**
   * Store analysis results in Firestore (legacy method)
   *
   * @param {Array} articles - Array of articles that were analyzed
   * @param {Object} analysis - Analysis results object
   * @param {Object|null} marketContext - Market context data (not used)
   * @returns {Object} Storage result with success status and metadata
   */
  async storeAnalysis(articles, analysis, marketContext = null) {
    try {
      // Prepare clean analysis data for storage
      const analysisData = {
        analysis: analysis?.analysis || "No analysis available",
        summary: analysis?.summary || "No summary available",
        events: Array.isArray(analysis?.events) ? analysis.events : [],
        marketInfluence: analysis?.market_influence || "minimal",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.collection.add(analysisData);
      console.log(`💾 [STORAGE] Analysis stored with ID: ${docRef.id}`);

      return {
        success: true,
        analysisId: docRef.id,
        marketInfluence: analysis.market_influence,
        eventsCount: analysis.events ? analysis.events.length : 0,
      };
    } catch (error) {
      console.error(`❌ [STORAGE] Error storing analysis:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Store combined RSS and global news analysis results
   *
   * @param {Array} rssArticles - RSS articles that were analyzed
   * @param {Object} perplexityResults - Global news search results
   * @param {Object} analysis - Combined analysis results
   * @returns {Object} Storage result with success status and metadata
   */
  async storeCombinedAnalysis(rssArticles, perplexityResults, analysis) {
    try {
      // Prepare clean analysis data for storage
      const analysisData = {
        analysis: analysis?.analysis || "No analysis available",
        summary: analysis?.summary || "No summary available",
        events: Array.isArray(analysis?.events) ? analysis.events : [],
        marketInfluence: analysis?.market_influence || "minimal",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await this.collection.add(analysisData);
      console.log(`💾 [STORAGE] Analysis stored with ID: ${docRef.id}`);

      return {
        success: true,
        analysisId: docRef.id,
        marketInfluence: analysis.market_influence,
        eventsCount: analysis.events ? analysis.events.length : 0,
      };
    } catch (error) {
      console.error(`❌ [STORAGE] Error storing analysis:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Retrieve recent analysis results from Firestore
   *
   * @param {number} limit - Maximum number of analyses to retrieve (default: 10)
   * @returns {Array} Array of analysis objects with metadata
   */
  async getRecentAnalyses(limit = 10) {
    try {
      // Query Firestore for recent analyses
      const snapshot = await this.collection
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      // Convert Firestore documents to plain objects
      const analyses = [];
      snapshot.forEach((doc) => {
        analyses.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return analyses;
    } catch (error) {
      console.error(
        `❌ [STORAGE] Error fetching recent analyses:`,
        error.message
      );
      return [];
    }
  }
}

/**
 * Service Component Initialization
 *
 * Initialize all service components that work together to provide
 * comprehensive news analysis capabilities.
 */
const rssFetcher = new NewsRSSFetcher();
const perplexitySearcher = new PerplexityNewsSearcher();
const articleRetention = new ArticleRetentionManager();
const impactAnalyzer = new NewsImpactAnalyzer();
const analysisStorage = new AnalysisStorage();

/**
 * Main News Analysis Service Class
 *
 * Orchestrates the entire news analysis workflow including RSS monitoring,
 * global news search, AI analysis, and result storage. Manages scheduled
 * analysis cycles and provides manual analysis capabilities.
 */
class NewsAnalysisService {
  constructor() {
    this.isRunning = false; // Service running state
  }

  /**
   * Start the news analysis service
   *
   * Initializes all scheduled tasks and begins the analysis workflow.
   */
  async start() {
    console.log("🚀 [SERVICE] Starting News Analysis Service...");
    this.isRunning = true;
    serviceState.isRunning = true;

    // Initialize scheduled analysis cron job
    this.startScheduledAnalysis();

    // Initialize article cleanup cron job
    this.startArticleCleanup();

    console.log("✅ [SERVICE] News Analysis Service started successfully");
  }

  /**
   * Stop the news analysis service
   *
   * Gracefully shuts down the service and stops all scheduled tasks.
   */
  async stop() {
    console.log("🛑 [SERVICE] Stopping News Analysis Service...");
    this.isRunning = false;
    serviceState.isRunning = false;
    console.log("✅ [SERVICE] News Analysis Service stopped");
  }

  /**
   * Start the scheduled analysis cron job
   *
   * Sets up automated analysis cycles based on the configured interval.
   */
  startScheduledAnalysis() {
    console.log(
      `⏰ [CRON] Scheduling analysis every hour: ${CONFIG.ANALYSIS_INTERVAL}`
    );

    // Schedule analysis to run at configured interval
    cron.schedule(CONFIG.ANALYSIS_INTERVAL, async () => {
      if (!this.isRunning || serviceState.isAnalyzing) {
        console.log(
          "⏳ [CRON] Skipping analysis - service not running or already analyzing"
        );
        return;
      }

      await this.performScheduledAnalysis();
    });
  }

  /**
   * Start the article cleanup cron job
   *
   * Sets up automated cleanup of old articles from the retention system.
   */
  startArticleCleanup() {
    console.log(
      `🧹 [CRON] Scheduling article cleanup: ${CONFIG.CLEANUP_INTERVAL}`
    );

    // Schedule cleanup to run at configured interval
    cron.schedule(CONFIG.CLEANUP_INTERVAL, async () => {
      if (!this.isRunning) {
        console.log("⏳ [CRON] Skipping cleanup - service not running");
        return;
      }

      console.log("🧹 [CLEANUP] Starting scheduled article cleanup...");
      articleRetention.cleanupOldArticles();
    });
  }

  /**
   * Perform a complete scheduled analysis cycle
   *
   * Executes the full analysis workflow: fetch RSS articles, search global news,
   * perform AI analysis, store results, and update statistics.
   */
  async performScheduledAnalysis() {
    const startTime = Date.now();
    serviceState.isAnalyzing = true;

    try {
      console.log(
        "🔄 [ANALYSIS-CYCLE] Starting combined RSS and global news analysis..."
      );

      // Step 1: Fetch new RSS articles and add to retention system
      console.log("📰 [STEP 1] Fetching latest RSS articles...");
      const newArticles = await rssFetcher.fetchRecentArticles(
        CONFIG.ARTICLE_LOOKBACK_HOURS
      );

      if (newArticles && newArticles.length > 0) {
        articleRetention.addArticles(newArticles);
      }

      // Step 2: Retrieve all retained articles (6 hours worth)
      const retainedArticles = articleRetention.getRetainedArticles();

      // Step 3: Search for global news events using Perplexity AI
      console.log("🔍 [STEP 3] Searching global news with Perplexity...");
      const perplexityResults = await perplexitySearcher.searchGlobalNews();

      // Step 4: Validate that we have content to analyze
      if (
        (!retainedArticles || retainedArticles.length === 0) &&
        (!perplexityResults ||
          !perplexityResults.global_news_events ||
          perplexityResults.global_news_events.length === 0)
      ) {
        console.log(
          "📰 [ANALYSIS-CYCLE] No articles or global news events to analyze"
        );
        return;
      }

      // Step 5: Perform AI-powered combined analysis
      console.log(
        "🧠 [STEP 5] Performing combined RSS and global news analysis..."
      );
      const analysis = await impactAnalyzer.analyzeCombinedNews(
        retainedArticles,
        perplexityResults
      );

      if (!analysis) {
        console.log("❌ [ANALYSIS-CYCLE] Combined analysis failed");
        return;
      }

      // Step 6: Store analysis results in Firestore
      console.log("💾 [STEP 6] Storing analysis results...");
      const storageResult = await analysisStorage.storeCombinedAnalysis(
        retainedArticles,
        perplexityResults,
        analysis
      );

      // Step 7: Update service statistics and metrics
      this.updateServiceStats(
        analysis,
        retainedArticles.length,
        perplexityResults.total_events || 0
      );

      // Step 8: Log results
      const duration = Date.now() - startTime;
      console.log(`✅ [ANALYSIS-CYCLE] Completed in ${duration}ms`);
      console.log(`📊 [RESULT] Market Influence: ${analysis.market_influence}`);
      console.log(
        `📊 [RESULT] Events Identified: ${
          analysis.events ? analysis.events.length : 0
        }`
      );
      console.log(`📄 [RESULT] Summary: ${analysis.summary}`);

      serviceState.lastAnalysis = {
        timestamp: new Date().toISOString(),
        analysisId: storageResult.analysisId,
        marketInfluence: analysis.market_influence,
        eventsCount: analysis.events ? analysis.events.length : 0,
        summary: analysis.summary,
        duration: duration,
      };
    } catch (error) {
      console.error(
        "❌ [ANALYSIS-CYCLE] Error in scheduled analysis:",
        error.message
      );
    } finally {
      serviceState.isAnalyzing = false;
      serviceState.totalAnalyses++;
    }
  }

  /**
   * Perform manual analysis (triggered via API)
   *
   * @returns {Promise} Analysis results
   * @throws {Error} If analysis is already in progress
   */
  async performManualAnalysis() {
    if (serviceState.isAnalyzing) {
      throw new Error("Analysis already in progress");
    }

    return await this.performScheduledAnalysis();
  }

  /**
   * Update service statistics based on analysis results
   *
   * @param {Object} analysis - Analysis results object
   * @param {number} rssArticleCount - Number of RSS articles processed
   * @param {number} globalEventCount - Number of global events processed
   */
  updateServiceStats(analysis, rssArticleCount, globalEventCount = 0) {
    serviceState.stats.totalArticlesProcessed += rssArticleCount;

    // Track critical impact events
    if (analysis.market_influence === "major") {
      serviceState.stats.criticalAlertsGenerated++;
    }

    // Track high impact events
    if (
      analysis.market_influence === "significant" ||
      analysis.market_influence === "major"
    ) {
      serviceState.stats.highImpactEventsDetected++;
    }

    // Keep recent analyses (last 10)
    serviceState.stats.recentAnalyses.unshift({
      timestamp: new Date().toISOString(),
      marketInfluence: analysis.market_influence,
      eventsCount: analysis.events ? analysis.events.length : 0,
      summary: analysis.summary,
    });

    if (serviceState.stats.recentAnalyses.length > 10) {
      serviceState.stats.recentAnalyses =
        serviceState.stats.recentAnalyses.slice(0, 10);
    }
  }
}

/**
 * Service Instance Initialization
 *
 * Create the main service instance that will handle all analysis operations.
 */
const newsAnalysisService = new NewsAnalysisService();

/**
 * API Routes
 *
 * RESTful API endpoints for service management, analysis triggers,
 * and data retrieval. All routes include proper error handling and
 * rate limiting for security.
 */

/**
 * Root Endpoint - Service Information
 *
 * Provides comprehensive information about the service capabilities,
 * status, and configuration.
 */
app.get("/", (req, res) => {
  res.json({
    service: "BlackSwan News Analysis Service",
    version: "1.0.0",
    description:
      "AI-powered comprehensive news analysis combining RSS feeds and global news search for crypto market impact assessment",
    status: serviceState.isRunning ? "operational" : "stopped",
    capabilities: [
      "RSS feed monitoring with 6-hour retention",
      "Global news search via Perplexity",
      "Combined RSS and global news analysis",
      "AI-powered impact assessment",
      "Risk level classification",
      "Market context integration",
      "Event identification and analysis",
      "Automated article cleanup",
      "Historical analysis tracking",
    ],
    analysis_focus: [
      "Regulatory developments",
      "Economic indicators",
      "Geopolitical events",
      "Technology developments",
      "Institutional movements",
      "Market structure changes",
      "Both positive and negative crypto market impacts",
    ],
    data_sources: [
      "RSS feeds from major financial news sources",
      "Global news search via Perplexity",
    ],
  });
});

/**
 * Service Status Endpoint
 *
 * Returns detailed service status including running state, statistics,
 * configuration, and integration status.
 */
app.get("/api/status", (req, res) => {
  res.json({
    status: serviceState.isRunning ? "operational" : "stopped",
    is_analyzing: serviceState.isAnalyzing,
    uptime: process.uptime(),
    last_analysis: serviceState.lastAnalysis,
    total_analyses: serviceState.totalAnalyses,
    stats: serviceState.stats,
    configuration: {
      analysis_interval: CONFIG.ANALYSIS_INTERVAL,
      max_articles_per_analysis: CONFIG.MAX_ARTICLES_PER_ANALYSIS,
      article_lookback_hours: CONFIG.ARTICLE_LOOKBACK_HOURS,
      article_retention_hours: CONFIG.ARTICLE_RETENTION_HOURS,
      cleanup_interval: CONFIG.CLEANUP_INTERVAL,
      impact_thresholds: CONFIG.IMPACT_THRESHOLDS,
    },
    retention_stats: articleRetention.getRetentionStats(),
    integrations: {
      rss_service: true,
      perplexity_search: true,
      openrouter_llm: true,
      firestore: true,
    },
  });
});

/**
 * Manual Analysis Trigger Endpoint
 *
 * Allows manual triggering of the analysis cycle via API call.
 * Includes protection against concurrent analysis runs.
 */
app.post("/api/analyze", async (req, res) => {
  try {
    if (serviceState.isAnalyzing) {
      return res.status(429).json({
        success: false,
        error: "Analysis already in progress",
        current_analysis_started: serviceState.lastAnalysis?.timestamp,
      });
    }

    console.log("🔄 [API] Manual analysis triggered");
    await newsAnalysisService.performManualAnalysis();

    res.json({
      success: true,
      message: "Manual analysis completed",
      last_analysis: serviceState.lastAnalysis,
      status: "completed",
    });
  } catch (error) {
    console.error("❌ [API] Manual analysis failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Recent Analyses Endpoint
 *
 * Retrieves recent analysis results from Firestore with configurable limit.
 */
app.get("/api/analyses", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const analyses = await analysisStorage.getRecentAnalyses(limit);

    res.json({
      success: true,
      analyses: analyses,
      count: analyses.length,
    });
  } catch (error) {
    console.error("❌ [API] Error fetching analyses:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Current Articles Endpoint
 *
 * Fetches current articles from RSS feeds with configurable lookback period.
 */
app.get("/api/articles/current", async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 6;
    const articles = await rssFetcher.fetchRecentArticles(hours);

    res.json({
      success: true,
      articles: articles,
      count: articles.length,
      lookback_hours: hours,
    });
  } catch (error) {
    console.error("❌ [API] Error fetching current articles:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Retained Articles Endpoint
 *
 * Returns articles currently stored in the retention system with statistics.
 */
app.get("/api/articles/retained", (req, res) => {
  try {
    const retainedArticles = articleRetention.getRetainedArticles();
    const retentionStats = articleRetention.getRetentionStats();

    res.json({
      success: true,
      articles: retainedArticles,
      count: retainedArticles.length,
      retention_stats: retentionStats,
    });
  } catch (error) {
    console.error("❌ [API] Error fetching retained articles:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Manual Global News Search Endpoint
 *
 * Triggers a manual Perplexity search for global news events.
 */
app.post("/api/search/global", async (req, res) => {
  try {
    console.log("🔍 [API] Manual Perplexity search triggered");
    const perplexityResults = await perplexitySearcher.searchGlobalNews();

    res.json({
      success: true,
      message: "Global news search completed",
      results: perplexityResults,
      events_found: perplexityResults.total_events || 0,
    });
  } catch (error) {
    console.error("❌ [API] Manual Perplexity search failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Manual Article Cleanup Endpoint
 *
 * Triggers manual cleanup of old articles from the retention system.
 */
app.post("/api/articles/cleanup", (req, res) => {
  try {
    console.log("🧹 [API] Manual article cleanup triggered");
    const removedCount = articleRetention.cleanupOldArticles();

    res.json({
      success: true,
      message: "Article cleanup completed",
      articles_removed: removedCount,
      articles_remaining: serviceState.retainedArticles.size,
    });
  } catch (error) {
    console.error("❌ [API] Manual cleanup failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Health Check Endpoint
 *
 * Simple health check endpoint for monitoring and load balancer health checks.
 */
app.get("/api/health", (req, res) => {
  res.json({
    service: "news-analysis-service",
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Global Error Handling Middleware
 *
 * Catches and handles any unhandled errors in the application,
 * providing consistent error responses to clients.
 */
app.use((error, req, res, next) => {
  console.error("❌ [ERROR] Unhandled error:", error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: error.message,
  });
});

/**
 * Server Startup
 *
 * Starts the Express server and initializes the news analysis service.
 * The service begins monitoring RSS feeds and performing scheduled analyses.
 */
const PORT = CONFIG.PORT;
app.listen(PORT, async () => {
  console.log(`🌐 [SERVER] News Analysis Service running on port ${PORT}`);
  console.log(
    `📍 [SERVER] Environment: ${process.env.NODE_ENV || "development"}`
  );

  // Initialize and start the analysis service
  await newsAnalysisService.start();

  console.log(
    `🎯 [SERVER] Service ready - Monitoring RSS feeds for crypto market impact`
  );
});

/**
 * Graceful Shutdown Handlers
 *
 * Handles graceful shutdown of the service when receiving termination signals.
 * Ensures proper cleanup of resources and scheduled tasks.
 */
process.on("SIGTERM", async () => {
  console.log("🛑 [SHUTDOWN] Received SIGTERM, shutting down gracefully...");
  await newsAnalysisService.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("🛑 [SHUTDOWN] Received SIGINT, shutting down gracefully...");
  await newsAnalysisService.stop();
  process.exit(0);
});

/**
 * Module Exports
 *
 * Exports the service instance and Express app for testing and external use.
 */
module.exports = { newsAnalysisService, app };
