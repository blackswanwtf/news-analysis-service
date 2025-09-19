# News Analysis Prompts

This directory contains the AI prompts used for analyzing news articles for crypto market impact.

## Available Prompts

### news-impact-analysis-v1.md

The primary prompt for analyzing RSS articles to identify potential negative impacts on the cryptocurrency market.

**Features:**

- Comprehensive risk assessment framework
- Multiple impact categories (regulatory, economic, geopolitical, etc.)
- Scoring system for impact severity and timeline
- Historical context integration
- Alert level recommendations

**Template Variables:**

- `{{timestamp}}` - Current analysis timestamp
- `{{analysis_type}}` - Type of analysis being performed
- `{{total_articles}}` - Number of articles being analyzed
- `{{articles_section}}` - Formatted articles content
- `{{market_context}}` - Optional current market context data

## Prompt Management

Prompts are managed through the `NewsPromptManager` class which provides:

- Template loading and caching
- Variable substitution
- Version management
- Error handling

## Version Control

Prompts follow the naming convention: `{prompt-name}-{version}.md`

Example: `news-impact-analysis-v1.md`

When creating new versions:

1. Copy the existing prompt file
2. Increment the version number
3. Make your modifications
4. Update the default version in `prompt-config.js` if needed
