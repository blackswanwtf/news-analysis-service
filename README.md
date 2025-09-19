# Black Swan News Analysis Service

**Author:** Muhammad Bilal Motiwala  
**Project:** Black Swan  
**Version:** 1.0.0

## Overview

The Black Swan News Analysis Service is an AI-powered comprehensive news analysis system that monitors RSS feeds and performs global news searches to identify events that could impact cryptocurrency markets. The service combines real-time RSS monitoring with Perplexity AI-powered global news discovery to provide comprehensive market impact assessments.

## Key Features

### 🔍 **Multi-Source News Monitoring**

- **RSS Feed Integration**: Monitors RSS feeds from major financial news sources
- **Global News Search**: Uses Perplexity AI to discover breaking global news events
- **6-Hour Article Retention**: Maintains articles in memory for comprehensive analysis cycles

### 🤖 **AI-Powered Analysis**

- **OpenRouter LLM Integration**: Uses advanced language models for news analysis
- **Impact Assessment**: Classifies market influence as minimal, moderate, significant, or major
- **Event Identification**: Extracts and analyzes key events from news sources
- **Risk Classification**: Provides structured risk assessments for crypto markets

### ⚡ **Real-Time Processing**

- **Automated Analysis Cycles**: Runs every hour (at 58 minutes past the hour)
- **Manual Triggers**: API endpoints for on-demand analysis
- **Article Cleanup**: Automated cleanup of old articles every 2 hours
- **Live Statistics**: Real-time monitoring of service performance

### 🗄️ **Data Management**

- **Firestore Integration**: Persistent storage of analysis results
- **Historical Tracking**: Maintains analysis history and statistics
- **API Access**: RESTful endpoints for data retrieval and service management

## Architecture

### Service Components

1. **NewsRSSFetcher**: Handles RSS feed communication and article retrieval
2. **PerplexityNewsSearcher**: Performs global news searches using Perplexity AI
3. **ArticleRetentionManager**: Manages 6-hour article retention system
4. **NewsImpactAnalyzer**: Performs AI-powered analysis of news content
5. **AnalysisStorage**: Handles Firestore database operations
6. **NewsAnalysisService**: Orchestrates the complete analysis workflow

### Data Flow

```
RSS Feeds → RSS Fetcher → Article Retention → Combined Analysis ← Perplexity Search
                                                      ↓
                                              Impact Analyzer
                                                      ↓
                                              Analysis Storage
                                                      ↓
                                              API Endpoints
```

## Installation

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Firebase Project**: With Firestore enabled
- **OpenRouter API Key**: For LLM access
- **RSS Feed Service**: Running instance for article retrieval

### Setup Steps

1. **Clone the Repository**

   ```bash
   git clone <repository-url>
   cd news-analysis-service
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment Variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup Firebase**

   - Create a Firebase project
   - Enable Firestore
   - Download service account key as `serviceAccountKey.json`
   - Place the file in the project root

5. **Start the Service**

   ```bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   ```

## Configuration

### Environment Variables

| Variable               | Description                          | Required | Default     |
| ---------------------- | ------------------------------------ | -------- | ----------- |
| `OPENROUTER_API_KEY`   | OpenRouter API key for LLM access    | Yes      | -           |
| `RSS_FEED_SERVICE_URL` | URL of the RSS Feed Service          | Yes      | -           |
| `PORT`                 | Server port                          | No       | 8088        |
| `NODE_ENV`             | Environment (development/production) | No       | development |

### Service Configuration

The service configuration is defined in the `CONFIG` object:

```javascript
const CONFIG = {
  // Analysis timing
  ANALYSIS_INTERVAL: "58 * * * *", // Every hour at 58 minutes
  CLEANUP_INTERVAL: "0 */2 * * *", // Every 2 hours

  // Article management
  MAX_ARTICLES_PER_ANALYSIS: 50,
  ARTICLE_LOOKBACK_HOURS: 6,
  ARTICLE_RETENTION_HOURS: 6,

  // LLM configuration
  LLM_MODEL: "openai/gpt-5-mini",
  LLM_MAX_TOKENS: 50000,
  LLM_TIMEOUT: 60000,

  // Perplexity configuration
  PERPLEXITY_MAX_TOKENS: 70000,
  PERPLEXITY_TIMEOUT: 60000,
};
```

## API Documentation

### Base URL

```
http://localhost:8088
```

### Endpoints

#### 1. Service Information

```http
GET /
```

Returns comprehensive service information including capabilities, status, and configuration.

**Response:**

```json
{
  "service": "BlackSwan News Analysis Service",
  "version": "1.0.0",
  "status": "operational",
  "capabilities": [...],
  "analysis_focus": [...],
  "data_sources": [...]
}
```

#### 2. Service Status

```http
GET /api/status
```

Returns detailed service status, statistics, and configuration.

**Response:**

```json
{
  "status": "operational",
  "is_analyzing": false,
  "uptime": 3600,
  "last_analysis": {...},
  "total_analyses": 24,
  "stats": {...},
  "configuration": {...},
  "retention_stats": {...},
  "integrations": {...}
}
```

#### 3. Manual Analysis Trigger

```http
POST /api/analyze
```

Triggers a manual analysis cycle.

**Response:**

```json
{
  "success": true,
  "message": "Manual analysis completed",
  "last_analysis": {...},
  "status": "completed"
}
```

#### 4. Recent Analyses

```http
GET /api/analyses?limit=10
```

Retrieves recent analysis results from Firestore.

**Parameters:**

- `limit` (optional): Number of analyses to retrieve (default: 10)

**Response:**

```json
{
  "success": true,
  "analyses": [...],
  "count": 10
}
```

#### 5. Current Articles

```http
GET /api/articles/current?hours=6
```

Fetches current articles from RSS feeds.

**Parameters:**

- `hours` (optional): Lookback period in hours (default: 6)

**Response:**

```json
{
  "success": true,
  "articles": [...],
  "count": 15,
  "lookback_hours": 6
}
```

#### 6. Retained Articles

```http
GET /api/articles/retained
```

Returns articles currently stored in the retention system.

**Response:**

```json
{
  "success": true,
  "articles": [...],
  "count": 25,
  "retention_stats": {...}
}
```

#### 7. Global News Search

```http
POST /api/search/global
```

Triggers a manual Perplexity search for global news events.

**Response:**

```json
{
  "success": true,
  "message": "Global news search completed",
  "results": {...},
  "events_found": 8
}
```

#### 8. Article Cleanup

```http
POST /api/articles/cleanup
```

Triggers manual cleanup of old articles.

**Response:**

```json
{
  "success": true,
  "message": "Article cleanup completed",
  "articles_removed": 5,
  "articles_remaining": 20
}
```

#### 9. Health Check

```http
GET /api/health
```

Simple health check endpoint.

**Response:**

```json
{
  "service": "news-analysis-service",
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 3600
}
```

## Analysis Process

### Automated Analysis Cycle

The service performs automated analysis every hour at 58 minutes past the hour:

1. **RSS Article Fetching**: Retrieves recent articles from RSS feeds
2. **Article Retention**: Adds new articles to the 6-hour retention system
3. **Global News Search**: Performs Perplexity search for breaking news
4. **Combined Analysis**: Analyzes both RSS and global news sources
5. **Result Storage**: Stores analysis results in Firestore
6. **Statistics Update**: Updates service statistics and metrics

### Analysis Output Format

```json
{
  "analysis": "Comprehensive analysis of current market events...",
  "summary": "Brief summary of the current situation",
  "market_influence": "minimal|moderate|significant|major",
  "events": [
    {
      "title": "Event title",
      "summary": "Event summary",
      "analysis": "Impact analysis"
    }
  ]
}
```

### Market Influence Classification

- **Minimal**: Normal conditions, limited market drivers
- **Moderate**: Some noteworthy developments
- **Significant**: Multiple important factors with likely impact
- **Major**: Substantial developments with broad market influence

## Monitoring and Logging

### Log Levels and Format

The service uses structured logging with emoji prefixes for easy identification:

- 🚀 Service startup and initialization
- 📰 RSS feed operations
- 🔍 Perplexity search operations
- 🧠 AI analysis operations
- 💾 Database operations
- ⏰ Scheduled task operations
- ❌ Error conditions
- ✅ Success operations

### Key Metrics

- **Total Analyses**: Number of analysis cycles completed
- **Articles Processed**: Total RSS articles analyzed
- **Perplexity Searches**: Number of global news searches performed
- **Critical Alerts**: Number of major impact events detected
- **High Impact Events**: Number of significant/major impact events
- **Average Impact Score**: Mean impact score across analyses

## Security Features

### Rate Limiting

- 100 requests per 15-minute window per IP address
- Applied to all `/api/` endpoints

### Security Headers

- Helmet.js for security headers
- CORS enabled for cross-origin requests
- Request size limits (10MB)

### Error Handling

- Comprehensive error handling middleware
- Graceful error responses
- No sensitive data exposure in error messages

## Development

### Project Structure

```
news-analysis-service/
├── index.js                 # Main service file
├── package.json            # Dependencies and scripts
├── .env.example           # Environment variables template
├── serviceAccountKey.json # Firebase service account (not in repo)
├── prompts/               # LLM prompt templates
│   ├── prompt-config.js   # Prompt management system
│   └── news-impact-analysis-v1.md
└── README.md             # This file
```

### Available Scripts

```bash
# Start in development mode with auto-reload
npm run dev

# Start in production mode
npm start

# Install dependencies
npm install
```

### Adding New Features

1. **New Analysis Types**: Extend the `NewsImpactAnalyzer` class
2. **Additional Data Sources**: Create new fetcher classes
3. **Custom Prompts**: Add new prompt templates in the `prompts/` directory
4. **API Endpoints**: Add new routes following the existing pattern

## Troubleshooting

### Common Issues

#### 1. Service Won't Start

- Check that all environment variables are set
- Verify Firebase service account key is present
- Ensure port 8088 is available

#### 2. Analysis Failures

- Check OpenRouter API key validity
- Verify RSS Feed Service is accessible
- Review LLM model availability

#### 3. Database Connection Issues

- Verify Firebase project configuration
- Check Firestore rules and permissions
- Ensure service account has proper access

#### 4. Rate Limiting

- Check if you're hitting API rate limits
- Verify OpenRouter account limits
- Review RSS Feed Service rate limits

### Debug Mode

Enable debug logging by setting:

```bash
NODE_ENV=development
```

### Health Checks

Use the health check endpoint to verify service status:

```bash
curl http://localhost:8088/api/health
```

## Performance Optimization

### Recommended Settings

- **Memory**: Minimum 512MB RAM
- **CPU**: 1+ cores recommended
- **Storage**: 1GB+ for logs and temporary data
- **Network**: Stable internet connection for API calls

### Scaling Considerations

- **Horizontal Scaling**: Run multiple instances behind a load balancer
- **Database**: Consider Firestore scaling limits for high-volume usage
- **API Limits**: Monitor OpenRouter and Perplexity API usage
- **Memory Management**: Article retention system has built-in cleanup

## Contributing

### Code Style

- Use JSDoc comments for all functions and classes
- Follow existing naming conventions
- Include error handling for all async operations
- Add logging for important operations

### Testing

- Test all API endpoints
- Verify analysis accuracy with sample data
- Check error handling scenarios
- Validate configuration changes

## License

MIT License - see LICENSE file for details.

## Support

For issues, questions, or contributions:

1. Check the troubleshooting section
2. Review API documentation
3. Check service logs for error details
4. Create an issue with detailed information

## Changelog

### Version 1.0.0

- Initial release
- RSS feed monitoring
- Perplexity global news search
- AI-powered analysis
- Firestore integration
- RESTful API
- Automated scheduling
- Article retention system

---

**Black Swan News Analysis Service** - Comprehensive AI-powered news analysis for cryptocurrency market impact assessment.
