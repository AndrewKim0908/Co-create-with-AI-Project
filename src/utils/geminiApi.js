/**
 * Google Gemini — sprint conflict analysis.
 * Uses VITE_GEMINI_API_KEY. Image fetch failures are skipped (text-only).
 */

const GEMINI_MODEL = 'gemini-pro';

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`;

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * @param {string} url
 * @returns {Promise<{ inline_data: { mime_type: string, data: string } } | null>}
 */
export async function fetchImageInlinePart(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const buf = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);
    const mimeType = blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'image/jpeg';
    return { inline_data: { mime_type: mimeType, data: base64 } };
  } catch {
    return null;
  }
}

const LANGUAGE_INSTRUCTION = {
  en: 'Respond in English. All user-visible strings in the JSON (titles, summaries, messages, topics, pros, cons, etc.) must be in English.',
  ko: '한국어로 응답해 주세요. JSON 안의 사용자에게 보이는 모든 문자열(제목, 요약, 메시지, 주제, 장단점 등)은 한국어여야 합니다.',
  zh: '请用中文回答。JSON 中所有面向用户的可见字符串（标题、摘要、消息、主题、优缺点等）必须使用中文。',
};

function buildPrompt({
  project,
  chatMessages,
  participants,
  hasImages,
  language = 'en',
}) {
  const langKey = language === 'ko' || language === 'zh' ? language : 'en';
  const languageInstruction =
    LANGUAGE_INSTRUCTION[langKey] || LANGUAGE_INSTRUCTION.en;

  const p = project || {};
  const priAF = p.priority_aesthetics_functionality;
  const priCQ = p.priority_cost_quality;
  const priSS = p.priority_speed_stability;

  const chatBlock = (chatMessages || [])
    .map(
      (m) =>
        `- [${m.senderRole || 'unknown'}] ${m.senderName || 'User'}: ${String(m.content || '').slice(0, 4000)}`,
    )
    .join('\n');

  const peopleBlock = (participants || [])
    .map((x) => `- ${x.name} (userId: ${x.userId}, role: ${x.role || 'Member'})`)
    .join('\n');

  const imgNote = hasImages
    ? 'Design image(s) are attached; use them only as supportive context.'
    : 'No design images were attached (unavailable or CORS); rely on text only.';

  return `You are an expert product/engineering facilitator analyzing a design sprint conflict.

IMPORTANT: ${languageInstruction}

PROJECT
- name: ${p.name ?? ''}
- short description: ${p.description_short ?? ''}
- north star: ${p.north_star ?? ''}
- priority aesthetics vs functionality (0–100, 50=balanced): ${priAF ?? 'unknown'}
- priority cost vs quality (0–100): ${priCQ ?? 'unknown'}
- priority speed vs stability (0–100): ${priSS ?? 'unknown'}

PARTICIPANTS
${peopleBlock || '(none)'}

CHAT TRANSCRIPT (chronological)
${chatBlock || '(empty)'}

${imgNote}

TASK
1) If there is not enough discussion to analyze (e.g. almost no messages, or no meaningful disagreement), return JSON with canAnalyze: false, reason: "insufficient_chat", message in the response language above, and details array listing each participant with userName, currentCount (estimate messages attributed to them), required: 3.
2) If more thematic context is needed before a solid analysis, return canAnalyze: false, reason: "need_more_context", message in the response language above, suggestedTopics as strings in that same language.
3) Otherwise return canAnalyze: true with a full structured analysis; all user-visible text fields must follow the response language above.

When canAnalyze is true, use exactly this JSON shape (no markdown fences):
{
  "canAnalyze": true,
  "activeConflict": {
    "id": "CF-01",
    "title": string,
    "summary": string,
    "content": string
  },
  "positions": [
    {
      "userId": string (must match a participant userId),
      "userName": string,
      "role": string,
      "titleSummary": string,
      "detailedPosition": string
    }
  ],
  "valueMatrix": {
    "axes": ["Aesthetics","Functionality","Cost","Quality","Speed","Stability"],
    "projectValues": [ six integers 0-100 aligned to axes, derived from north star and priorities ],
    "positionValues": [
      { "userName": string, "color": "#hex", "values": [ six integers 0-100 ] }
    ]
  },
  "alternative": {
    "title": string,
    "description": string,
    "pros": [ string ],
    "cons": [ string ],
    "alignmentReason": string,
    "metrics": { "leadTime": string, "riskDelta": string, "confidence": string }
  }
}

Rules:
- projectValues reflect the project's stated north star and priority sliders.
- positionValues: one series per distinct stakeholder position (dashed interpretation); use distinct hex colors.
- Keep metrics strings short (e.g. "+3d", "-20%", "85%").
- Respond with valid JSON only.`;
}

function coerceNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function clampPct(v) {
  const n = Math.round(coerceNumber(v, 0));
  return Math.min(100, Math.max(0, n));
}

/**
 * @param {unknown} raw
 * @returns {object}
 */
export function normalizeAnalysisResult(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid JSON from model');
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  if (o.canAnalyze === false) {
    return {
      canAnalyze: false,
      reason: String(o.reason || 'error'),
      message: String(o.message || 'Analysis unavailable.'),
      details: Array.isArray(o.details) ? o.details : undefined,
      suggestedTopics: Array.isArray(o.suggestedTopics) ? o.suggestedTopics : undefined,
    };
  }

  const ac = o.activeConflict && typeof o.activeConflict === 'object' ? o.activeConflict : {};
  const vm = o.valueMatrix && typeof o.valueMatrix === 'object' ? o.valueMatrix : {};
  const alt = o.alternative && typeof o.alternative === 'object' ? o.alternative : {};
  const axes = Array.isArray(vm.axes) && vm.axes.length >= 3 ? vm.axes : [
    'Aesthetics',
    'Functionality',
    'Cost',
    'Quality',
    'Speed',
    'Stability',
  ];
  const nAxes = axes.length;

  const projectValuesRaw = Array.isArray(vm.projectValues) ? vm.projectValues : [];
  const projectValues = axes.map((_, i) => clampPct(projectValuesRaw[i] ?? projectValuesRaw[0] ?? 70));

  const positionValuesIn = Array.isArray(vm.positionValues) ? vm.positionValues : [];
  const fallbackColors = ['#10b981', '#3b82f6', '#a855f7', '#f97316'];
  const positionValues = positionValuesIn.map((row, idx) => {
    const r = row && typeof row === 'object' ? row : {};
    const valsIn = Array.isArray(r.values) ? r.values : [];
    const values = axes.map((__, i) => clampPct(valsIn[i] ?? valsIn[0] ?? 50));
    return {
      userName: String(r.userName || `Position ${idx + 1}`),
      color: typeof r.color === 'string' && r.color.startsWith('#') ? r.color : fallbackColors[idx % fallbackColors.length],
      values,
    };
  });

  const positionsIn = Array.isArray(o.positions) ? o.positions : [];
  const positions = positionsIn.map((row) => {
    const r = row && typeof row === 'object' ? row : {};
    return {
      userId: String(r.userId || ''),
      userName: String(r.userName || ''),
      role: String(r.role || 'Member'),
      titleSummary: String(r.titleSummary || ''),
      detailedPosition: String(r.detailedPosition || ''),
    };
  });

  const pros = Array.isArray(alt.pros) ? alt.pros.map((x) => String(x)) : [];
  const cons = Array.isArray(alt.cons) ? alt.cons.map((x) => String(x)) : [];
  const metrics = alt.metrics && typeof alt.metrics === 'object' ? alt.metrics : {};

  return {
    canAnalyze: true,
    activeConflict: {
      id: String(ac.id || 'CF-01'),
      title: String(ac.title || 'Active conflict'),
      summary: String(ac.summary || ''),
      content: String(ac.content || ''),
    },
    positions,
    valueMatrix: {
      axes,
      projectValues: projectValues.slice(0, nAxes),
      positionValues,
    },
    alternative: {
      title: String(alt.title || 'Proposal'),
      description: String(alt.description || ''),
      pros,
      cons,
      alignmentReason: String(alt.alignmentReason || ''),
      metrics: {
        leadTime: String(metrics.leadTime ?? '—'),
        riskDelta: String(metrics.riskDelta ?? '—'),
        confidence: String(metrics.confidence ?? '—'),
      },
    },
  };
}

/**
 * @param {{
 *   project: Record<string, unknown>,
 *   chatMessages: Array<{ content: string, senderName: string, senderRole: string }>,
 *   participants: Array<{ userId: string, name: string, role: string }>,
 *   designImageUrls?: string[],
 *   language?: 'en' | 'ko' | 'zh',
 * }} input
 */
export async function requestGeminiAnalysis({
  project,
  chatMessages,
  participants,
  designImageUrls = [],
  language = 'en',
}) {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey || String(apiKey).trim() === '') {
    throw new Error('VITE_GEMINI_API_KEY is not set.');
  }

  const urls = Array.isArray(designImageUrls) ? designImageUrls.filter(Boolean) : [];
  const imageParts = [];
  for (let i = 0; i < urls.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const part = await fetchImageInlinePart(urls[i]);
    if (part) imageParts.push(part);
  }

  const lang =
    language === 'ko' || language === 'zh' ? language : 'en';
  const textPrompt = buildPrompt({
    project,
    chatMessages,
    participants,
    hasImages: imageParts.length > 0,
    language: lang,
  });
  const parts = [{ text: textPrompt }, ...imageParts];

  const url = `${GEMINI_API_URL}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 500)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') {
    throw new Error('Empty or invalid response from Gemini.');
  }

  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Model did not return valid JSON.');
  }

  return normalizeAnalysisResult(parsed);
}
