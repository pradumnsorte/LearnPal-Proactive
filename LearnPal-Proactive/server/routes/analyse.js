import { Router } from 'express'

const router = Router()

const callProvider = async (provider, systemPrompt, userPrompt, frameBase64 = null) => {
  const hasImage = !!frameBase64

  const buildContent = (type) => {
    if (!hasImage) return userPrompt
    const textPart = { type: 'text', text: userPrompt }
    if (type === 'anthropic') {
      return [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frameBase64 } },
        textPart,
      ]
    }
    return [
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameBase64}` } },
      textPart,
    ]
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}`)
    return (await res.json()).choices[0].message.content
  }

  if (provider === 'ollama') {
    const model = process.env.OLLAMA_MODEL || 'llama3.2'
    const res = await fetch('http://localhost:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    })
    if (!res.ok) throw new Error(`Ollama error ${res.status}`)
    return (await res.json()).choices[0].message.content
  }

  if (provider === 'azure' || provider === 'azure-54') {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '')
    const deployment = provider === 'azure-54' ? process.env.AZURE_OPENAI_DEPLOYMENT_54 : process.env.AZURE_OPENAI_DEPLOYMENT
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview'
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY },
      body: JSON.stringify({
        ...(provider === 'azure-54' ? { max_completion_tokens: 1000 } : { max_tokens: 1000 }),
        // response_format is intentionally omitted: Azure OpenAI rejects json_object
        // mode when the request contains image content (vision + JSON mode conflict).
        // The system prompt enforces JSON output; the cleanup below handles any wrapping.
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildContent('openai') },
        ],
      }),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      throw new Error(errBody?.error?.message ?? `Azure OpenAI error ${res.status}`)
    }
    return (await res.json()).choices[0].message.content
  }

  throw new Error('Unknown provider')
}

// Region selectivity in the proactive paradigm: regions are a deliberate
// AI-initiated interruption ("look at this exact spot right now"), not an
// ambient feed. Strictness rises as the user's chosen frequency drops.
const REGION_STRICTNESS = {
  Low: {
    descriptor: 'EXTREMELY strict — expect 0 regions per chunk; at most 1 across many chunks',
    rule: 'Only emit a region when pausing playback to look at this exact area would meaningfully change the learner\'s understanding right now. Default to []. When in doubt, return [].',
  },
  Medium: {
    descriptor: 'Strict — expect 0 or 1 per chunk',
    rule: 'Emit a region only when a specific on-screen element is the focal point of the current explanation AND the learner would clearly benefit from the system pointing it out. When in doubt, return [].',
  },
  High: {
    descriptor: 'Moderate — expect 0 or 1 per chunk, occasionally a second',
    rule: 'Emit a region when a specific element on screen is being actively referenced and pointing it out would help the learner. Still skip transitional, decorative, or speaker-only frames.',
  },
}

router.post('/', async (req, res) => {
  const {
    provider,
    chunk,
    previousTerms = [],
    previousHighlights = [],
    frameBase64 = null,
    chatContext = '',
    highlightFrequency = 'Medium',
  } = req.body

  if (!provider || !Array.isArray(chunk) || chunk.length === 0) {
    return res.status(400).json({ error: 'provider and chunk are required' })
  }

  const hasImage = !!frameBase64
  const chunkText = chunk.map((r) => `[${r.time}] ${r.text}`).join('\n')
  const strictness = REGION_STRICTNESS[highlightFrequency] ?? REGION_STRICTNESS.Medium

  const prevTermsLine = previousTerms.length > 0
    ? `\nDo NOT repeat these already-identified terms: ${previousTerms.join(', ')}.`
    : ''

  const prevHighlightsLine = previousHighlights.length > 0
    ? `\nDo NOT generate a region whose label or focus duplicates any of these already-surfaced visual nudges:\n${previousHighlights.map((h, i) => `${i + 1}. ${h}`).join('\n')}`
    : ''

  const chatContextLine = chatContext
    ? `\nThe learner has been asking about: ${chatContext} — avoid surfacing terms or visual nudges already covered in those conversations.`
    : ''

  const systemPrompt = `You are an AI learning assistant analysing an educational video about neural networks. You generate structured support content from transcript chunks and the current video frame.

Each output category has a DISTINCT purpose — never produce overlapping content across them:
  • glossaryTerms → NEW technical vocabulary being introduced in speech (the primary, lightweight surface)
  • regions       → A SINGLE specific on-screen element that the system will visibly highlight to the learner RIGHT NOW (a deliberate AI-initiated interruption)

PRIORITY ORDER — glossaryTerms come FIRST. If a concept fits as a glossaryTerm, it MUST go there. A region is only valid when a SPECIFIC visual element on screen is the focal point of the current explanation and the learner would benefit from the system pointing it out — not when the concept can be conveyed by a keyword popup alone.

A region in this app is NOT an ambient marker — it is a moment-based intervention. The on-screen cue will deliberately draw the learner's attention to that exact area. Treat it as a strong signal: only emit one when you are confident it is worth interrupting attention right now.

Be conservative. Empty arrays are BETTER than redundant, obvious, or low-value content. Always return valid JSON only — no markdown, no explanation.`

  const regionsSchema = hasImage
    ? `,\n  "regions": [\n    {\n      "label": "short name (2-4 words)",\n      "description": "1-2 sentences: what this region shows and why it matters",\n      "cx": 50,\n      "cy": 45,\n      "width": 22,\n      "height": 18\n    }\n  ]`
    : ',\n  "regions": []'

  const regionsRule = hasImage
    ? `- regions: AT MOST 1 region per chunk. Strictness: ${strictness.descriptor}. ${strictness.rule}
  Valid examples: a node in a neural network diagram being actively discussed, a labelled axis the speaker is pointing at, a weight/bias label being computed right now, a specific term in an equation under explanation. EXCLUDE: the speaker's face/body, logos, generic title text, UI chrome, anything not actively referenced. Must be knowledge-bearing — pointing it out should advance understanding.
  Coordinates use a CENTRE-BASED system: cx and cy are the horizontal and vertical centre of the element as a percentage of the full image (0 = left/top edge, 100 = right/bottom edge). width and height are the element's size as percentages of the image. Example: a chart centred in the right half of the screen, spanning the middle third vertically → cx:75, cy:50, width:40, height:30. Be as precise as possible — look at the actual pixels of the element, not its approximate location.
  NEVER duplicate a concept already covered in glossaryTerms (this response or previousTerms) — the keyword popup is enough. Return [] if nothing on screen genuinely warrants an interruption.`
    : `- regions: [] (no frame provided)`

  const userPrompt = `New transcript chunk from "The Essential Main Ideas of Neural Networks" by StatQuest:

${chunkText}
${prevTermsLine}
${prevHighlightsLine}
${chatContextLine}
${hasImage ? '\nA video frame captured at this moment is attached. Examine it carefully before deciding whether to emit a region.' : ''}

Return ONLY this JSON structure:
{
  "glossaryTerms": [{ "term": "...", "definition": "..." }]${regionsSchema}
}

Rules:
- glossaryTerms: 0–2 NEW NEURAL-NETWORK / MACHINE-LEARNING technical concepts introduced in THIS chunk. Plain-English definition, 1 sentence each.
  WHITELIST examples (the kind of thing that IS a valid term): activation function, sigmoid, weight, bias, node, neural network, parameter, gradient descent, backpropagation, training data, input layer, hidden layer, output layer, neuron, regression, fitting, sum-of-squared-residuals, softplus.
  STRICTLY EXCLUDED — never emit any of these or anything like them:
    · Surface analogy words used as illustrative wrapper for the math (this video uses a drug-dosage analogy → NEVER surface: dosage, efficacy, drug, treatment, medicine, drug response, dose-response, low dose, high dose).
    · Generic English nouns/adjectives that a non-technical adult already knows: graph, line, curve, axis, value, number, equation, point, dot, label, box, arrow, diagram, sketch, notation, insight, summary, range, scale, amount, output, input box, dosage input, efficacy axis, fancy graph, blue curve, yellow dot.
    · Concrete on-screen visual elements (those belong in regions, not glossaryTerms).
    · Any term already in the "do not repeat" list (case-insensitive match).
  RULE OF THUMB: if a smart 12-year-old already knows what the word means in everyday English, it is NOT a glossary term — even if the speaker just used it. Only surface terms whose technical/ML meaning is non-obvious from common usage.
  Better to return [] than to surface a weak term.

- ${regionsRule}

- Return [] for any category with nothing genuinely worthwhile.`

  try {
    const raw = await callProvider(provider, systemPrompt, userPrompt, frameBase64)
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    const regions = (Array.isArray(parsed.regions) ? parsed.regions : [])
      .filter((r) => {
        const hasCentre = typeof r.cx === 'number' && typeof r.cy === 'number'
        const hasTopLeft = typeof r.x === 'number' && typeof r.y === 'number'
        return (hasCentre || hasTopLeft) && typeof r.width === 'number' && typeof r.height === 'number' && r.width > 2 && r.height > 2
      })
      .slice(0, 1)
      .map((r) => {
        // Normalise to top-left origin. Model may return centre-based (cx/cy) or
        // legacy top-left (x/y) — handle both so old responses still work.
        const w = Math.max(3, Math.min(80, r.width))
        const h = Math.max(3, Math.min(80, r.height))
        const tlx = typeof r.cx === 'number' ? r.cx - w / 2 : r.x
        const tly = typeof r.cy === 'number' ? r.cy - h / 2 : r.y
        return {
          label: r.label ?? '',
          description: r.description ?? '',
          x: Math.max(0, Math.min(100 - w, tlx)),
          y: Math.max(0, Math.min(100 - h, tly)),
          width: w,
          height: h,
        }
      })

    // Server-side safety net: enforce dedup (case-insensitive) and reject
    // generic / off-domain words even if the model ignores the prompt rules.
    const BLOCKLIST = new Set([
      // surface analogy words used in this StatQuest video
      'dosage', 'efficacy', 'drug', 'treatment', 'medicine', 'dose', 'dose-response',
      'low dose', 'high dose', 'low dosage', 'medium dosage', 'high dosage',
      'drug response', 'dosage input', 'efficacy axis', 'dosage axis',
      // generic English / visual descriptors
      'graph', 'line', 'curve', 'axis', 'value', 'number', 'equation', 'point',
      'dot', 'label', 'box', 'arrow', 'diagram', 'sketch', 'notation', 'insight',
      'summary', 'range', 'scale', 'amount', 'output', 'input box',
      'fancy graph', 'blue curve', 'yellow dot', 'red box', 'green curve',
      'mathematical notation', 'connection values', 'curved node',
    ])
    const prevSet = new Set((previousTerms ?? []).map((t) => String(t).toLowerCase().trim()))
    const seenInBatch = new Set()
    const glossaryTerms = (Array.isArray(parsed.glossaryTerms) ? parsed.glossaryTerms : [])
      .filter((g) => {
        const term = String(g?.term ?? '').toLowerCase().trim()
        if (!term) return false
        if (BLOCKLIST.has(term)) return false
        if (prevSet.has(term)) return false
        if (seenInBatch.has(term)) return false
        seenInBatch.add(term)
        return true
      })

    // Region dedup — fuzzy substring match against previousHighlights so the
    // same on-screen element doesn't get re-surfaced under slightly different wording.
    const prevHighlightTexts = (previousHighlights ?? []).map((h) => String(h).toLowerCase().trim())
    const dedupedRegions = regions.filter((r) => {
      const label = String(r?.label ?? '').toLowerCase().trim()
      if (!label) return false
      return !prevHighlightTexts.some((p) => p.includes(label) || label.includes(p))
    })

    res.json({
      glossaryTerms,
      regions: dedupedRegions,
    })
  } catch (err) {
    console.error('[analyse]', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router
