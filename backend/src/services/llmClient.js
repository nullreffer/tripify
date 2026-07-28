const fetch = require('node-fetch');

// Minimal LLM client wrapper. Reads GEMINI_API_KEY but when absent
// it provides a helpful error. Implement provider switch later.
async function callLLM(prompt, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    // For minimal PR we return an error-like response so the route can
    // still function and return a 501-like message to the frontend.
    throw new Error('GEMINI_API_KEY not configured. Set GEMINI_API_KEY in env to enable LLM parsing.');
  }
  // Placeholder: implement real Gemini call when key is available.
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: opts.temperature ?? 0,
      max_tokens: opts.maxTokens ?? 1000
    })
  });
  if (!res.ok) throw new Error(`LLM provider error ${res.status}`);
  const json = await res.json();
  // This is an example for OpenAI-style response; adapt to Gemini when available.
  const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  return content;
}

module.exports = { callLLM };
