/**
 * Prompt Configuration and Management for News Analysis Service
 * Handles loading, versioning, and templating of news analysis prompts
 */

const fs = require("fs");
const path = require("path");

class NewsPromptManager {
  constructor() {
    this.promptsDir = path.join(__dirname);
    this.currentVersion = "v1";
    this.promptCache = new Map();
  }

  /**
   * Load a prompt template from file
   * @param {string} promptName - Name of the prompt (e.g., 'news-impact-analysis')
   * @param {string} version - Version (e.g., 'v1', 'v2')
   * @returns {string} Raw prompt template
   */
  loadPromptTemplate(promptName = "news-impact-analysis", version = null) {
    const promptVersion = version || this.currentVersion;
    const cacheKey = `${promptName}-${promptVersion}`;

    // Check cache first
    if (this.promptCache.has(cacheKey)) {
      return this.promptCache.get(cacheKey);
    }

    try {
      const promptFile = path.join(
        this.promptsDir,
        `${promptName}-${promptVersion}.md`
      );
      const template = fs.readFileSync(promptFile, "utf8");

      // Cache the template
      this.promptCache.set(cacheKey, template);
      console.log(`📝 [PROMPT] Loaded ${promptName}-${promptVersion}.md`);

      return template;
    } catch (error) {
      console.error(
        `❌ [PROMPT] Failed to load ${promptName}-${promptVersion}.md:`,
        error.message
      );
      throw new Error(
        `Prompt template not found: ${promptName}-${promptVersion}.md`
      );
    }
  }

  /**
   * Fill template with actual data
   * @param {string} template - Raw template string
   * @param {object} data - Data to inject into template
   * @returns {string} Filled prompt
   */
  fillTemplate(template, data) {
    let filledTemplate = template;

    // Replace all template variables
    Object.entries(data).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      const replacement =
        typeof value === "object"
          ? JSON.stringify(value, null, 2)
          : String(value);
      filledTemplate = filledTemplate.replace(
        new RegExp(placeholder, "g"),
        replacement
      );
    });

    return filledTemplate;
  }

  /**
   * Get a complete, filled prompt ready for LLM
   * @param {object} templateData - All data needed for the template
   * @param {string} promptName - Optional prompt name
   * @param {string} version - Optional version
   * @returns {string} Complete prompt
   */
  getFilledPrompt(
    templateData,
    promptName = "news-impact-analysis",
    version = null
  ) {
    const template = this.loadPromptTemplate(promptName, version);
    return this.fillTemplate(template, templateData);
  }

  /**
   * List available prompt versions
   * @param {string} promptName - Name of the prompt
   * @returns {Array<string>} Available versions
   */
  getAvailableVersions(promptName = "news-impact-analysis") {
    try {
      const files = fs.readdirSync(this.promptsDir);
      const versions = files
        .filter(
          (file) => file.startsWith(`${promptName}-`) && file.endsWith(".md")
        )
        .map((file) => file.replace(`${promptName}-`, "").replace(".md", ""))
        .sort();

      return versions;
    } catch (error) {
      console.error(`❌ [PROMPT] Error listing versions:`, error.message);
      return [];
    }
  }

  /**
   * Clear prompt cache (useful for development)
   */
  clearCache() {
    this.promptCache.clear();
    console.log(`🧹 [PROMPT] Cache cleared`);
  }

  /**
   * Set the default version for prompts
   * @param {string} version - Version to use as default
   */
  setDefaultVersion(version) {
    this.currentVersion = version;
    console.log(`📝 [PROMPT] Default version set to: ${version}`);
  }
}

module.exports = NewsPromptManager;
