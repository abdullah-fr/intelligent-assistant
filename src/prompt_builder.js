/**
 * Prompt builder module.
 * Constructs the messages array sent to the AI API.
 * Requirements: 4.2
 */

class PromptBuilder {
  /**
   * Build the messages array for the AI API.
   *
   * @param {Object} context - ContextObject with platform, pageType, and extracted fields
   * @param {Array<{role: string, content: string}>} history - Prior conversation turns
   * @param {string} userPrompt - The user's current prompt
   * @returns {Array<{role: string, content: string}>} Messages array: [systemTurn, ...historyTurns, userTurn]
   */
  build(context, history, userPrompt) {
    const { platform, pageType, ...fields } = context;

    // Serialize context fields, skipping undefined/null values
    const serializedFields = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");

    const systemContent =
      `You are a helpful assistant. The user is currently on a ${platform} page (${pageType}).\n` +
      `Page context:\n${serializedFields}\n` +
      `Answer the user's question based on this context.`;

    const systemTurn = { role: "system", content: systemContent };
    const userTurn = { role: "user", content: userPrompt };

    return [systemTurn, ...history, userTurn];
  }
}

export default PromptBuilder;
