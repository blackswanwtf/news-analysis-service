# Comprehensive Crypto Market News Analysis

## Context

- **Timestamp**: {{timestamp}}
- **Analysis Type**: {{analysis_type}}
- **RSS Articles Count**: {{total_rss_articles}}
- **Global News Events Count**: {{total_global_events}}

## Inputs

### Articles From RSS News Feeds

{{rss_articles_section}}

### Global News Events via Perplexity Search

{{global_news_section}}

## Task

Analyze both sources to assess current conditions. Be concise, neutral, and factual. Focus on immediate implications only.

Rules

- Summarize the combined environment in a few sentences.
- List 3–8 key events with a one‑sentence impact note each.
- Classify overall influence as: minimal, moderate, significant, or major.

Respond with this EXACT JSON format:

```json
{
  "analysis": "Complete analysis of current market events and their implications for crypto (balanced, neutral).",
  "summary": "Extremely short summary (1-2 sentences) of the current situation",
  "market_influence": "minimal/moderate/significant/major",
  "events": [
    {
      "title": "Event title",
      "summary": "Short summary of the event",
      "analysis": "Short analysis on how this event is impactful to the crypto markets"
    }
  ]
}
```

Guidance

- Minimal: normal conditions, limited drivers.
- Moderate: some noteworthy developments.
- Significant: multiple important factors with likely impact.
- Major: substantial developments, broad influence.
