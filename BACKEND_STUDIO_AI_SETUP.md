# QuickCart Backend Studio — AI provider setup

The Backend Studio AI gateway runs on Vercel server-side functions. Provider credentials are read from Vercel Environment Variables and are never sent to the browser or committed to Git.

## Supported providers

| Provider | Required Vercel variable | Optional model variable |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` |
| Groq | `GROQ_API_KEY` | `GROQ_MODEL` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` |
| xAI Grok | `XAI_API_KEY` | `XAI_MODEL` |
| Mistral | `MISTRAL_API_KEY` | `MISTRAL_MODEL` |
| Together AI | `TOGETHER_API_KEY` | `TOGETHER_MODEL` |
| Fireworks AI | `FIREWORKS_API_KEY` | `FIREWORKS_MODEL` |
| Cerebras | `CEREBRAS_API_KEY` | `CEREBRAS_MODEL` |
| Perplexity | `PERPLEXITY_API_KEY` | `PERPLEXITY_MODEL` |
| Custom OpenAI-compatible endpoint | `CUSTOM_AI_API_KEY` and `CUSTOM_AI_BASE_URL` | `CUSTOM_AI_MODEL` |

The gateway supplies a suggested model ID when the optional model variable is absent. Model availability and account access depend on the provider; set the model variable to a model enabled for your account if the suggested default is unavailable.

## Add keys in Vercel

1. Open the QuickCart project in Vercel.
2. Open **Settings → Environment Variables**.
3. Add the provider key(s) above to **Preview** first. Add to Production only after the preview has been tested and approved.
4. For each provider you enable, set the optional model variable if you want to override the default.
5. For a custom OpenAI-compatible provider, set `CUSTOM_AI_BASE_URL` to its HTTPS chat-completions endpoint and `CUSTOM_AI_MODEL` to a model ID.
6. Redeploy the preview so the serverless functions receive the new variables.

Do not paste keys into the Studio chat, browser console, HTML, source files, or GitHub issues.

## Current capability boundary

The AI Builder can send chat requests to the configured provider and retain conversation history in the Studio's protected Firebase path. Its responses are guidance and proposed code only. It does not yet create commits, execute generated code, run isolated tests, create Vercel previews, approve releases, or change merchant feature access. Those require the later build/test/release worker and explicit approval workflow.

## Security notes

- Both Studio APIs verify the signed platform-admin token on the server for every request.
- The AI keys are only read from server environment variables.
- Studio conversation history is stored under the Firebase-protected `/backups/platform_studio` path and requires the server-side Firebase secret.
- The platform's existing broad Firebase catch-all rules still require a separate audit and hardening project before changing database access patterns.
