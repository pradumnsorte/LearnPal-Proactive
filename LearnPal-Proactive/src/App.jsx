import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'
import transcriptRows from './data/transcript.json'
import glossaryData from './data/glossary.json'

import brandIcon from './assets/brand-icon.svg'
import palCharacter from './assets/pal-character.svg'
import chatgptLogo from './assets/Chat GPT logo.png'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
  || (typeof window !== 'undefined' && window.location.hostname.endsWith('.onrender.com'))
const VIDEO_SRC = import.meta.env.VITE_VIDEO_URL || '/neural-networks.mp4'

const QUICK_SUGGESTIONS = [
  'Give me a summary in simple terms',
  'Explain the topic in simple terms',
  'Explain with real life example',
]

const FREQUENCY_OPTIONS = ['Low', 'Medium', 'High']
const FREQUENCY_LABELS  = { Low: 'Lower', Medium: 'Default', High: 'Higher' }
const PLAYBACK_SPEEDS = [1, 1.25, 1.5]

// Analyse always fires every ANALYSE_GAP_ROWS new transcript rows (matches
// Continuous's glossary logic). Keyword popups run on this fixed cadence and
// have no user-facing control.
const ANALYSE_GAP_ROWS = 2

// Visual nudge cooldown by Highlights frequency — a deliberate "look here"
// intervention should be well-spaced. Time is measured in playback seconds
// since the last nudge appeared.
const VISUAL_NUDGE_COOLDOWN = { Low: 60, Medium: 40, High: 25 }

// How long after a nudge appears (in playback seconds) before it auto-dismisses.
// Pausing the video pauses this clock — the nudge waits for the learner.
const VISUAL_NUDGE_LIFETIME = 5

const QUIZ_FREQUENCY_CONFIG = {
  Low: {
    quizInterval: 180,  // one quiz roughly every 3 minutes
    qualityInstruction: `Only generate a question if the recent transcript introduces a non-obvious, foundational concept that genuinely rewards deeper understanding.
If the content is too shallow or transitional to support a meaningful question, respond with exactly {"skip":true} and nothing else.
When you do generate: the question must require genuine conceptual understanding. Prefer WHY and HOW over WHAT. The learner should only be able to answer it correctly if they truly grasped the idea — not just heard the words.`,
  },
  Medium: {
    quizInterval: 102,  // ~10 quizzes across a 17-minute video
    qualityInstruction: `Generate a question that tests understanding of the key concept just covered. Prefer "why" and "how" over "what". Only skip if the content is purely transitional or introductory with nothing substantive to test.`,
  },
  High: {
    quizInterval: 60,   // one quiz roughly every minute
    qualityInstruction: `Generate a useful question from the content just covered. It can test recall, understanding, or application — prioritise questions that reinforce the core idea of the current segment.`,
  },
}

// Minimum gap after any other intervention (keyword/nudge) before a quiz fires,
// so a keyword popup and a quiz don't stack immediately on top of each other.
const QUIZ_POST_INTERVENTION_GAP = 15



const createMessageId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const normalizeText = (value = '') => value
  .toLowerCase()
  .replace(/propogation/g, 'propagation')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const formatTime = (totalSeconds = 0) => {
  if (!Number.isFinite(totalSeconds)) return '0:00'
  const mins = Math.floor(totalSeconds / 60)
  const secs = Math.floor(totalSeconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

const getActiveTranscriptIndex = (currentSeconds) => {
  let currentIndex = 0
  for (let index = 0; index < transcriptRows.length; index += 1) {
    if (transcriptRows[index].seconds <= currentSeconds) currentIndex = index
    else break
  }
  return currentIndex
}

const getRecentTranscriptRows = (currentSeconds, count = 3) => {
  const activeIndex = getActiveTranscriptIndex(currentSeconds)
  return transcriptRows.slice(Math.max(0, activeIndex - count + 1), activeIndex + 1)
}

const buildAdaptiveStrategy = (stats) => {
  let promptGapBonus = 0
  if (stats.keywordIgnored >= 2) promptGapBonus += 16
  return { promptGapBonus }
}

// ─── Quiz generator ───────────────────────────────────────────────────────────

const buildQuizPrompt = (currentSeconds, previousQuestions, frequency, quizHistory = [], coveredConcepts = []) => {
  const watchedRows = transcriptRows.filter((r) => r.seconds <= currentSeconds)
  const transcriptContext = watchedRows.map((r) => `[${r.time}] ${r.text}`).join('\n')
  const { qualityInstruction } = QUIZ_FREQUENCY_CONFIG[frequency]

  const previousBlock = previousQuestions.length > 0
    ? `\n\nDo NOT repeat or closely resemble any of these already-asked questions:\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : ''

  const recentHistory = quizHistory.slice(-2)
  const performanceBlock = recentHistory.length > 0
    ? `\n\nLearner's recent quiz performance:\n${recentHistory.map((h) => `- "${h.question}" — ${h.isCorrect ? 'answered correctly' : 'answered incorrectly'}`).join('\n')}\n\nUse this to inform the next question: if there are recent incorrect answers, consider approaching that concept from a different angle to reinforce understanding. Do not repeat those exact questions.`
    : ''

  const conceptsBlock = coveredConcepts.length > 0
    ? `\n\nThe learner has been shown keyword popups for these concepts so far (these are the anchors of "what has actually been taught"):\n${coveredConcepts.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\nPrefer to test one of these concepts. If you must test something outside this list, it MUST have been substantively explained in the transcript above — not merely mentioned, name-dropped, or referenced as a forward concept.`
    : `\n\nNo keyword concepts have been surfaced yet. Only generate a question if the watched transcript on its own contains a substantively explained concept that genuinely rewards understanding. Otherwise respond with {"skip":true}.`

  return `You are a quiz generator for an educational video app focused on knowledge gain.

The learner has watched this portion of "The Essential Main Ideas of Neural Networks" by StatQuest:
${transcriptContext}${conceptsBlock}${previousBlock}${performanceBlock}

${qualityInstruction}

QUALITY GATE — read carefully:
- The question MUST test understanding of a concept that has been substantively explained in the transcript above. Skim mentions, name-drops, and forward references ("we'll cover this later") DO NOT count as explained.
- If you cannot identify a substantively-explained concept worth testing right now, respond with EXACTLY {"skip":true} and nothing else.
- Do NOT invent context. Do NOT test general background knowledge that wasn't covered in the transcript.
- Better to skip than to ask a weak or vague question.

If you ARE generating a question, respond ONLY with a valid JSON object — no markdown, no explanation, nothing else:
{
  "concept": "name of the concept being tested (must appear in or be clearly grounded in the transcript)",
  "question": "...",
  "options": ["...", "...", "...", "..."],
  "correctIndex": <integer 0-3>,
  "explanation": "..."
}

Rules:
- Exactly 4 options
- correctIndex is 0-based — vary which position is correct across questions; the option order is randomised after generation, so DO NOT bias toward index 0
- Distractor quality (CRITICAL):
  · Every wrong option must be a plausible misconception a learner could genuinely hold — not an obvious throwaway
  · All four options must be similar in length, grammatical structure, and level of detail (no "long correct option, short wrong options" tell)
  · Distractors should reflect partial understanding, common confusions, or near-miss alternatives — not unrelated facts
  · No joke options, no "all of the above", no "none of the above", no "I don't know"
  · Avoid options that can be eliminated by surface features (tone, hedging words like "always"/"never", category mismatch)
- Explanation: 1-2 sentences clarifying why the answer is correct AND why the most tempting distractor is wrong`
}

const callQuizAPI = async (provider, prompt) => {
  const res = await fetch('/api/quiz/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, prompt }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error ?? `Server error ${res.status}`)
  }
  return res.json()
}

const generateQuizQuestion = async (provider, currentSeconds, previousQuestions = [], frequency = 'Medium', quizHistory = [], coveredConcepts = []) => {
  return callQuizAPI(provider, buildQuizPrompt(currentSeconds, previousQuestions, frequency, quizHistory, coveredConcepts))
}

const buildQuizExplanation = (question, selectedIndex) => {
  const correctOption = question.options[question.correctIndex]

  if (selectedIndex === question.correctIndex) {
    return question.explanation
  }

  return `The correct answer is "${correctOption}". ${question.explanation}`
}

// Returns true when the transcript in the recent window is too dense to interrupt.
// Measured as words-per-second across the last 12 seconds of captions.
const isTranscriptDense = (currentSeconds, threshold = 3.5) => {
  const windowSeconds = 12
  const windowRows = transcriptRows.filter(
    (row) => row.seconds > currentSeconds - windowSeconds && row.seconds <= currentSeconds,
  )
  if (windowRows.length < 2) return false
  const totalWords = windowRows.reduce(
    (sum, row) => sum + (row.text ? row.text.split(/\s+/).length : 0),
    0,
  )
  const elapsed = currentSeconds - windowRows[0].seconds
  if (elapsed < 3) return false
  return totalWords / elapsed > threshold
}

const PROVIDERS = { GROQ: 'groq', AZURE: 'azure', AZURE_54: 'azure-54', OLLAMA: 'ollama' }
const PROVIDER_CYCLE = [PROVIDERS.AZURE_54, PROVIDERS.AZURE, PROVIDERS.GROQ, PROVIDERS.OLLAMA]
const PROVIDER_LABELS = {
  [PROVIDERS.AZURE]:    { label: 'GPT-4o mini', logo: true },
  [PROVIDERS.AZURE_54]: { label: 'GPT-5.4 mini', logo: true },
  [PROVIDERS.GROQ]:     { label: '⚡ Groq', logo: false },
  [PROVIDERS.OLLAMA]:   { label: '🦙 Ollama', logo: false },
}

const buildSystemPrompt = (currentSeconds, quizHistory = [], surfacedKeywords = [], surfacedVisuals = []) => {
  const mins = Math.floor(currentSeconds / 60)
  const secs = Math.floor(currentSeconds % 60)
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`

  const recentContext = transcriptRows
    .filter((r) => r.seconds <= currentSeconds)
    .slice(-6)
    .map((r) => `[${r.time}] ${r.text}`)
    .join('\n')

  const quizBlock = quizHistory.length > 0
    ? `\nQuiz attempts this session:\n${quizHistory
        .map((q) => `- "${q.question}" — ${q.isCorrect ? 'answered correctly' : 'answered incorrectly'}`)
        .join('\n')}`
    : ''

  const keywordBlock = surfacedKeywords.length > 0
    ? `\nKeywords already surfaced to the learner via popup (don't re-explain from scratch — assume they have a working sense of these):\n${surfacedKeywords.slice(-10).map((t) => `- ${t}`).join('\n')}`
    : ''

  const visualBlock = surfacedVisuals.length > 0
    ? `\nOn-screen visual elements the system has highlighted to the learner:\n${surfacedVisuals.slice(-5).map((v) => `- ${v}`).join('\n')}`
    : ''

  const sessionContext = (quizBlock || keywordBlock || visualBlock)
    ? `\n--- Session context ---${quizBlock}${keywordBlock}${visualBlock}\n`
    : ''

  return `You are Pal, a friendly learning assistant embedded in LearnPal, a video learning app.

The user is currently learning about neural networks (video: "The Essential Main Ideas of Neural Networks" by StatQuest, position: ${timeStr}).

The following topics are being covered at this moment — use this as background knowledge to stay relevant, not as a source to cite:
${recentContext || 'Video just started.'}
${sessionContext}
You are a subject-matter expert in machine learning and neural networks. Explain every concept from first principles, with full depth — don't summarise, don't simplify away important detail, and never truncate. Go beyond the immediate question: bring in related concepts, real-world applications, intuitive analogies, and historical context where they add value. Your goal is to leave the user with a genuinely deeper understanding than any single video could provide.

Never reference the video, transcript, or presenter as a source. Do not say "the transcript says", "in the video", "the presenter mentions", "as stated", or anything similar. You simply know this material — explain it that way. The background topics above are only to help you stay contextually relevant; they are not a script to follow or cite.

Use the session context to personalise your responses — if the user got a quiz question wrong, directly address that misconception with a clear, corrective explanation. If a keyword has already been surfaced, build on that rather than re-defining it from scratch.

Format your responses using markdown: use **bold** for key terms, bullet points or numbered lists for multi-part answers, and short paragraphs. Keep it conversational and clear — like a brilliant tutor who genuinely loves the subject.`
}

const callAnalyse = async (provider, chunk, previousTerms, previousHighlights, frameBase64 = null, chatContext = '', highlightFrequency = 'Medium') => {
  const res = await fetch('/api/analyse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, chunk, previousTerms, previousHighlights, frameBase64, chatContext, highlightFrequency }),
  })
  if (!res.ok) throw new Error(`Analyse error ${res.status}`)
  return res.json()
}

const callAI = async (provider, messages, currentSeconds, sessionId = null, quizHistory = [], source = 'chat', surfacedKeywords = [], surfacedVisuals = []) => {
  const systemPrompt = buildSystemPrompt(currentSeconds, quizHistory, surfacedKeywords, surfacedVisuals)
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, messages, systemPrompt, sessionId, source }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error ?? `Server error ${res.status}`)
  }
  const data = await res.json()
  return data.reply
}

// ─── Highlights panel ─────────────────────────────────────────────────────────

function Highlights({ items = [], onDetailClick, frequency, onFrequencyChange, paused, onPausedChange }) {
  const prevCountRef = useRef(0)
  const [newIds, setNewIds] = useState(new Set())
  const [tipOpen, setTipOpen] = useState(false)
  const tipRef = useRef(null)

  useEffect(() => {
    if (items.length > prevCountRef.current) {
      const added = items.slice(prevCountRef.current).map(h => h.id)
      setNewIds(new Set(added))
      const timer = setTimeout(() => setNewIds(new Set()), 1200)
      prevCountRef.current = items.length
      return () => clearTimeout(timer)
    }
    prevCountRef.current = items.length
  }, [items.length])

  useEffect(() => {
    if (!tipOpen) return
    const close = (e) => { if (!tipRef.current?.contains(e.target)) setTipOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [tipOpen])

  const sorted = [...items].sort((a, b) => (b.arrivedAt ?? 0) - (a.arrivedAt ?? 0))

  return (
    <article className="lp-feature-card">
      <div className="lp-feature-head">
        <div className="lp-feature-head-left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="#0336ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <h3>Explore highlights</h3>
          <div className="lp-info-tip" ref={tipRef}>
            <button
              type="button"
              className={`lp-info-tip-btn${tipOpen ? ' lp-info-tip-btn--open' : ''}`}
              onClick={() => setTipOpen((v) => !v)}
              aria-label="About this section"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
                <line x1="12" y1="8" x2="12" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="11" x2="12" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
            {tipOpen && (
              <div className="lp-tip-bubble lp-tip-bubble--open" role="tooltip">
                <strong>Explore highlights</strong> — the AI nudges your attention to specific on-screen moments worth examining. Each highlight links to the exact point in the video. Use the frequency control to make nudges more or less frequent.
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className={paused ? 'is-cta' : ''}
          onClick={() => onPausedChange(!paused)}
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
      <div className="lp-freq-row">
        <span>Frequency</span>
        <div className="lp-freq-pills" role="list" aria-label="Highlight frequency">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`lp-freq-pill${frequency === opt ? ' is-active' : ''}`}
              onClick={() => onFrequencyChange(opt)}
            >
              {FREQUENCY_LABELS[opt]}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="lp-highlights-empty">Nothing yet — keep watching and the AI will highlight interesting moments on screen for you.</p>
      ) : (
        <ul className="lp-nudge-log">
          {sorted.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className={`lp-nudge-entry${newIds.has(h.id) ? ' lp-nudge-new' : ''}`}
                onClick={() => onDetailClick(h)}
              >
                <span className="lp-nudge-time">{h.arrivedStr}</span>
                <span className="lp-nudge-label">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function App() {
  const [selectedFrequency, setSelectedFrequency] = useState('Medium')
  const [surfacedHighlights, setSurfacedHighlights] = useState([])
  const [liveKeywords, setLiveKeywords] = useState([])
  const [frameRegions, setFrameRegions] = useState([])
  const [quizFrequency, setQuizFrequency] = useState('Medium')
  const [highlightsPaused, setHighlightsPaused] = useState(false)
  const [quizPaused, setQuizPaused] = useState(false)
  const [quizTipOpen, setQuizTipOpen] = useState(false)
  const quizTipRef = useRef(null)
  const highlightsPausedRef = useRef(false)
  const [prompt, setPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [savedVisualCards, setSavedVisualCards] = useState([])
  const [laterQueue, setLaterQueue] = useState([])
  const [currentPlaybackSeconds, setCurrentPlaybackSeconds] = useState(0)
  const [activeTranscriptId, setActiveTranscriptId] = useState(transcriptRows[0]?.id ?? '')
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(100)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const [aiProvider, setAiProvider] = useState(PROVIDERS.AZURE_54)
  const [isLoading, setIsLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [quizHistory, setQuizHistory] = useState([])
  const [participantId, setParticipantId] = useState('')
  const [pidInput, setPidInput] = useState('')
  const [pidConfirmed, setPidConfirmed] = useState(false)
  const [modalDismissed, setModalDismissed] = useState(DEMO_MODE)  // skip = dismiss modal without creating a session
  const [activeKeywordPrompt, setActiveKeywordPrompt] = useState(null)
  const [activeVisualCard, setActiveVisualCard] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null)
  const [quizSelection, setQuizSelection] = useState(null)
  const [quizOutcome, setQuizOutcome] = useState(null)
  const [shownKeywordIds, setShownKeywordIds] = useState([])
  const [keywordLog, setKeywordLog] = useState([])
  const [keywordLogOpen, setKeywordLogOpen] = useState(false)
  const [quizLoading, setQuizLoading] = useState(false)
  const [askedQuestions, setAskedQuestions] = useState([])
  const [quizLog, setQuizLog] = useState([])
  const [quizLogIdx, setQuizLogIdx] = useState(null)
  const [consecutiveSkips, setConsecutiveSkips] = useState(0)
  const [consecutiveAnswered, setConsecutiveAnswered] = useState(0)
  const [quizFreqToast, setQuizFreqToast] = useState(null)
  const [freqDownCountdown, setFreqDownCountdown] = useState(null)
  const freqCountdownTimerRef = useRef(null)
  const isGeneratingQuizRef = useRef(false)
  // Counts new glossary terms surfaced since the last quiz fired. Quiz triggers
  // when this crosses the frequency-specific threshold — purely content-driven,
  // not time-driven.
  const newKeywordsSinceQuizRef = useRef(0)
  const lastAnalysedRowRef = useRef(0)
  const isAnalysingRef = useRef(false)
  const canvasRef = useRef(null)
  const liveKeywordsRef = useRef([])
  const surfacedHighlightsRef = useRef([])
  const shownKeywordTermsRef = useRef([])
  const frameRegionsRef = useRef([])
  const lastVisualNudgeAtRef = useRef(-Infinity)
  const activeKeywordPromptRef = useRef(null)
  const activeQuizRef = useRef(null)
  const activeVisualCardRef = useRef(null)
  const pausedRegionRef = useRef(null)
  const [lastInterventionAt, setLastInterventionAt] = useState(-45)
  // Initialize to 0 so the first quiz can't fire until a full quizGap has elapsed —
  // prevents quizzes during the intro before any concept has been introduced.
  const [lastQuizAt, setLastQuizAt] = useState(0)
  const [interactionStats, setInteractionStats] = useState({
    keywordIgnored: 0,
    keywordOpened: 0,
    keywordDeferred: 0,
    visualOpened: 0,
    visualSaved: 0,
    quizSkipped: 0,
    quizAnswered: 0,
    quizCorrect: 0,
    detailRequests: 0,
  })

  const playerStageRef = useRef(null)
  const mainColumnRef = useRef(null)
  const isPlayingRef = useRef(false)
  const isCompactRef = useRef(false)
  const controlsTimerRef = useRef(null)
  const isSeekingRef = useRef(false)
  const progressRef = useRef(null)
  const sessionIdRef = useRef(null)
  const firstInteractionLoggedRef = useRef(false)  // ensures first_interaction is logged only once per session
  const chatMessagesRef = useRef(null)
  const featureGridRef = useRef(null)
  const localVideoRef = useRef(null)
  const transcriptListRef  = useRef(null)
  const transcriptItemRefs = useRef(new Map())
  const userScrolledRef    = useRef(false)
  const userScrollTimerRef = useRef(null)

  const logEvent = (eventType, atSeconds, meta = null) => {
    if (!pidConfirmed || !sessionIdRef.current) return
    const body = JSON.stringify({
      sessionId: sessionIdRef.current,
      eventType,
      playbackSeconds: Math.floor(atSeconds ?? 0),
      meta,
    })
    if (eventType === 'session_end') {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }).catch(() => {})
    }
  }

  const adaptiveStrategy = useMemo(() => buildAdaptiveStrategy(interactionStats), [interactionStats])
  const seekPercent = duration > 0 ? (currentPlaybackSeconds / duration) * 100 : 0


  // ── YouTube player setup ─────────────────────────────────────────────────

  useEffect(() => () => clearTimeout(controlsTimerRef.current), [])

  // Close the Pop-quiz info tooltip on outside click
  useEffect(() => {
    if (!quizTipOpen) return
    const close = (e) => { if (!quizTipRef.current?.contains(e.target)) setQuizTipOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [quizTipOpen])

  // ── Fullscreen sync ─────────────────────────────────────────────────────

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Log session_end with final position on unload
  useEffect(() => {
    const handleUnload = () => {
      logEvent('session_end', localVideoRef.current?.currentTime ?? 0)
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // Tab focus / blur — engagement signal
  useEffect(() => {
    const onVisibility = () => {
      const pos = localVideoRef.current?.currentTime ?? 0
      logEvent(document.hidden ? 'tab_blurred' : 'tab_focused', pos)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // ── Compact player on scroll ─────────────────────────────────────────────

  // ── Transcript auto-scroll ────────────────────────────────────────────────

  useEffect(() => {
    if (!transcriptRows.length) return
    let currentId = transcriptRows[0].id
    for (let i = 0; i < transcriptRows.length; i += 1) {
      if (currentPlaybackSeconds >= transcriptRows[i].seconds) {
        currentId = transcriptRows[i].id
      } else {
        break
      }
    }
    setActiveTranscriptId(currentId)
  }, [currentPlaybackSeconds])

  // Effect 2: scroll the list to the active line (fires only when active line changes)
  // Uses list.scrollTo() — NOT scrollIntoView() — so only the transcript list scrolls,
  // never the main column.
  useEffect(() => {
    if (userScrolledRef.current) return
    if (isSeekingRef.current) return
    const list = transcriptListRef.current
    const activeNode = transcriptItemRefs.current.get(activeTranscriptId)
    if (!list || !activeNode) return
    const listRect = list.getBoundingClientRect()
    const activeRect = activeNode.getBoundingClientRect()
    const target = list.scrollTop + (activeRect.top - listRect.top) - 8
    list.scrollTo({ top: Math.max(target, 0), behavior: 'smooth' })
  }, [activeTranscriptId])

  const setTranscriptItemRef = (id, node) => {
    if (node) transcriptItemRefs.current.set(id, node)
    else transcriptItemRefs.current.delete(id)
  }

  const handleTranscriptScroll = useCallback(() => {
    userScrolledRef.current = true
    clearTimeout(userScrollTimerRef.current)
    userScrollTimerRef.current = setTimeout(() => {
      userScrolledRef.current = false
    }, 4000)
  }, [])

  const handleMainScroll = useCallback(() => {
    const el = mainColumnRef.current
    if (!el) return
    if (!isCompactRef.current && el.scrollTop > 1) {
      isCompactRef.current = true
      setIsCompact(true)
    } else if (isCompactRef.current && el.scrollTop < 1) {
      isCompactRef.current = false
      setIsCompact(false)
    }
  }, [])

  // ── Chat auto-scroll ──────────────────────────────────────────────────────

  useEffect(() => {
    const el = chatMessagesRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [chatMessages, isLoading])

  // ── Local video player events ─────────────────────────────────────────────

  useEffect(() => {
    const video = localVideoRef.current
    if (!video) return
    const onTimeUpdate = () => {
      if (isSeekingRef.current) return
      const t = video.currentTime
      if (Number.isFinite(t)) setCurrentPlaybackSeconds(t)
    }
    const onLoadedMetadata = () => setDuration(video.duration)
    const onPlay = () => {
      isPlayingRef.current = true
      setIsPlaying(true)
      if (pausedRegionRef.current === null && frameRegionsRef.current[0]?.pinned) {
        setFrameRegions([])
        frameRegionsRef.current = []
      }
      clearTimeout(controlsTimerRef.current)
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
    const onPause = () => {
      isPlayingRef.current = false
      setIsPlaying(false)
      clearTimeout(controlsTimerRef.current)
      setShowControls(true)
    }
    const onEnded = () => {
      isPlayingRef.current = false
      setIsPlaying(false)
      clearTimeout(controlsTimerRef.current)
      setShowControls(true)
    }
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
    }
  }, [])

  // ── Sync --feature-row-h to actual grid height (drives transcript sticky) ──
  // Debounced so rapid Highlights panel growth doesn't cause the transcript
  // header sticky threshold to shift on every animation frame.

  useLayoutEffect(() => {
    const el = featureGridRef.current
    if (!el) return
    let timer = null
    const sync = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        document.documentElement.style.setProperty('--feature-row-h', `${el.offsetHeight}px`)
      }, 120)
    }
    // Sync immediately once (no debounce on mount)
    document.documentElement.style.setProperty('--feature-row-h', `${el.offsetHeight}px`)
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => { observer.disconnect(); clearTimeout(timer) }
  }, [])

  useEffect(() => {
    if (!pidConfirmed) return
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'proactive-neural-networks',
        videoTitle: 'The Essential Main Ideas of Neural Networks',
        paradigm: 'proactive',
        participantId: pidInput.trim() || null,
      }),
    })
      .then((r) => r.json())
      .then((data) => { sessionIdRef.current = data.id })
      .catch(() => {})
  }, [pidConfirmed])

  useEffect(() => {
    if (!isPlaying) return
    if (activeKeywordPrompt || activeVisualCard || activeQuiz) return

    const basePromptGap = selectedFrequency === 'Low' ? 35 : selectedFrequency === 'High' ? 12 : 20
    const promptGap = basePromptGap + adaptiveStrategy.promptGapBonus

    // §3.4 — do not interrupt if the transcript is too dense at this moment
    if (isTranscriptDense(currentPlaybackSeconds)) return

    const { quizInterval } = QUIZ_FREQUENCY_CONFIG[quizFrequency]

    // Quiz is time-driven and independent of keyword count. It fires when enough
    // playback time has elapsed since the last quiz, with a short cooldown after
    // any other intervention so keyword popups and quizzes don't stack.
    const quizDue = !quizPaused
      && !isGeneratingQuizRef.current
      && currentPlaybackSeconds - lastQuizAt >= quizInterval
      && currentPlaybackSeconds - lastInterventionAt >= QUIZ_POST_INTERVENTION_GAP

    if (quizDue) {
      isGeneratingQuizRef.current = true
      setQuizLoading(true)
      setLastInterventionAt(currentPlaybackSeconds)
      logEvent('quiz_triggered', currentPlaybackSeconds)
      generateQuizQuestion(aiProvider, currentPlaybackSeconds, askedQuestions, quizFrequency, quizHistory, shownKeywordTermsRef.current)
        .then((q) => {
          if (q.skip) {
            // AI judged content not rich enough — advance lastQuizAt by half the
            // interval so we retry sooner rather than waiting the full interval.
            setLastQuizAt(currentPlaybackSeconds - Math.floor(quizInterval / 2))
            return
          }
          localVideoRef.current?.pause()
          setAskedQuestions((prev) => [...prev, q.question])
          setLastQuizAt(currentPlaybackSeconds)
          newKeywordsSinceQuizRef.current = 0
          setActiveQuiz(q)
          setQuizSelection(null)
          setQuizOutcome(null)
        })
        .catch(() => {
          setLastQuizAt(currentPlaybackSeconds - Math.floor(quizInterval / 2))
        })
        .finally(() => {
          isGeneratingQuizRef.current = false
          setQuizLoading(false)
        })
      return
    }

    // Keywords and visual nudges use the shared promptGap cooldown.
    if (currentPlaybackSeconds - lastInterventionAt < promptGap) return

    const keywordCandidate = liveKeywords.find(
      (item) =>
        item.arrivedAt <= currentPlaybackSeconds
        && !shownKeywordIds.includes(item.id),
    )

    if (keywordCandidate) {
      setShownKeywordIds((current) => [...current, keywordCandidate.id])
      shownKeywordTermsRef.current = [...shownKeywordTermsRef.current, keywordCandidate.term]
      newKeywordsSinceQuizRef.current += 1
      const numbered = { ...keywordCandidate, number: shownKeywordTermsRef.current.length }
      setKeywordLog((prev) => [...prev, { ...numbered, pinned: false }])
      setActiveKeywordPrompt(numbered)
      setLastInterventionAt(currentPlaybackSeconds)
      logEvent('keyword_shown', currentPlaybackSeconds)
    }
  }, [
    activeKeywordPrompt,
    activeQuiz,
    activeVisualCard,
    adaptiveStrategy,
    aiProvider,
    askedQuestions,
    quizHistory,
    isPlaying,
    lastInterventionAt,
    lastQuizAt,
    currentPlaybackSeconds,
    selectedFrequency,
    quizFrequency,
    quizPaused,
    shownKeywordIds,
    liveKeywords,
  ])

  useEffect(() => {
    if (!activeKeywordPrompt) return undefined

    const timer = window.setTimeout(() => {
      setInteractionStats((current) => ({ ...current, keywordIgnored: current.keywordIgnored + 1 }))
      setActiveKeywordPrompt(null)
      logEvent('keyword_ignored', currentPlaybackSeconds)
    }, 7800)

    return () => window.clearTimeout(timer)
  }, [activeKeywordPrompt])

  // Keep refs in sync with state so the analyse callback (which runs after a
  // network round-trip) can check current intervention state without staleness.
  useEffect(() => { activeKeywordPromptRef.current = activeKeywordPrompt }, [activeKeywordPrompt])
  useEffect(() => { activeQuizRef.current           = activeQuiz           }, [activeQuiz])
  useEffect(() => { activeVisualCardRef.current     = activeVisualCard     }, [activeVisualCard])
  useEffect(() => { highlightsPausedRef.current     = highlightsPaused     }, [highlightsPaused])

  // Visual-nudge auto-dismiss: clear when playback has moved more than
  // VISUAL_NUDGE_LIFETIME seconds past the nudge's arrivedAt. Gated on
  // currentPlaybackSeconds so pausing pauses the clock — the nudge waits
  // for the learner.
  useEffect(() => {
    if (frameRegions.length === 0) return
    const region = frameRegions[0]
    if (region.pinned) return
    if (currentPlaybackSeconds > region.arrivedAt + VISUAL_NUDGE_LIFETIME) {
      setFrameRegions([])
      frameRegionsRef.current = []
    }
  }, [currentPlaybackSeconds, frameRegions])

  // ── AI analyse trigger — generates keyword popups and visual nudges ──

  useEffect(() => {
    if (!isPlayingRef.current) return
    const coveredRows = transcriptRows.filter((r) => r.seconds <= currentPlaybackSeconds)
    if (coveredRows.length < 2) return
    const lastIdx = coveredRows.length - 1
    if (lastIdx - lastAnalysedRowRef.current < ANALYSE_GAP_ROWS) return
    if (isAnalysingRef.current) return

    const chunkStart = lastAnalysedRowRef.current + 1
    const chunk = coveredRows.slice(chunkStart, chunkStart + 12)
    if (chunk.length === 0) return

    let frameBase64 = null
    if (isPlayingRef.current) {
      const video = localVideoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState >= 2) {
        canvas.width = 480
        canvas.height = 270
        canvas.getContext('2d').drawImage(video, 0, 0, 480, 270)
        frameBase64 = canvas.toDataURL('image/jpeg', 0.65).replace('data:image/jpeg;base64,', '')
      }
    }

    const chatContext = chatMessages
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content)
      .join(' | ')

    isAnalysingRef.current = true
    const arrivedAt = currentPlaybackSeconds
    const arrivedStr = formatTime(arrivedAt)
    // Include BOTH shown and pending-queue keywords so the model doesn't
    // regenerate a term that's already in flight but hasn't surfaced yet.
    const queuedTerms = liveKeywordsRef.current.map((k) => k.term)
    const prevTerms = Array.from(new Set([...shownKeywordTermsRef.current, ...queuedTerms]))
    const prevHighlights = surfacedHighlightsRef.current.map((h) => h.text)

    callAnalyse(aiProvider, chunk, prevTerms, prevHighlights, frameBase64, chatContext, selectedFrequency)
      .then((result) => {
        const hasContent = result.glossaryTerms?.length || result.regions?.length
        const advance = hasContent ? chunk.length : Math.max(2, Math.floor(chunk.length / 2))
        lastAnalysedRowRef.current = chunkStart + advance - 1
        const stamp = { arrivedAt, arrivedStr }

        if (result.glossaryTerms?.length) {
          const newKeywords = result.glossaryTerms.map((g, i) => ({
            ...g, id: `kw-${Date.now()}-${i}`, ...stamp,
          }))
          liveKeywordsRef.current = [...liveKeywordsRef.current, ...newKeywords]
          setLiveKeywords((prev) => [...prev, ...newKeywords])
        }

        // Visual nudge — gated by cooldown and intervention guards. The AI may
        // return a region, but we only surface it when nothing else is competing
        // for the learner's attention and the per-frequency cooldown has passed.
        if (result.regions?.length) {
          const cooldown = VISUAL_NUDGE_COOLDOWN[selectedFrequency] ?? VISUAL_NUDGE_COOLDOWN.Medium
          const interventionActive = activeKeywordPromptRef.current
            || activeQuizRef.current
            || activeVisualCardRef.current
            || frameRegionsRef.current.length > 0
          const cooledDown = arrivedAt - lastVisualNudgeAtRef.current >= cooldown

          if (!interventionActive && cooledDown && !highlightsPausedRef.current) {
            const reg = result.regions[0]
            const nudge = { ...reg, id: `fr-${Date.now()}`, ...stamp }

            // Panel log entry — short label only, no description.
            const panelEntry = {
              id: `fh-${nudge.id}`,
              text: nudge.label,
              arrivedAt: nudge.arrivedAt,
              arrivedStr: nudge.arrivedStr,
              regions: [nudge],
            }
            surfacedHighlightsRef.current = [...surfacedHighlightsRef.current, panelEntry]
            setSurfacedHighlights((prev) => [...prev, panelEntry])

            setFrameRegions([nudge])
            frameRegionsRef.current = [nudge]
            lastVisualNudgeAtRef.current = arrivedAt
          }
        }
      })
      .catch((err) => {
        // On failure, advance by only 2 rows so we retry soon rather than skipping a big window
        lastAnalysedRowRef.current = chunkStart + 1
        console.error('[analyse] failed — check that the server is running and /api/analyse is registered:', err.message)
      })
      .finally(() => { isAnalysingRef.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlaybackSeconds, aiProvider])

  const addChatExchange = ({ source, title, userMessage, assistantMessage }) => {
    setChatMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role: 'user',
        content: userMessage,
      },
      {
        id: createMessageId(),
        role: 'assistant',
        source,
        title,
        content: assistantMessage,
      },
    ])
  }

  const sendMessage = async (nextPrompt = prompt.trim(), source = 'chat') => {
    if (!nextPrompt || isLoading) return

    const userMsg = {
      id: createMessageId(),
      role: 'user',
      content: nextPrompt,
    }
    setChatMessages((prev) => [...prev, userMsg])
    setPrompt('')
    setAiError(null)
    setIsLoading(true)

    if (!firstInteractionLoggedRef.current) {
      firstInteractionLoggedRef.current = true
      logEvent('first_interaction', currentPlaybackSeconds)
    }
    logEvent('chat_message_sent', currentPlaybackSeconds, { char_count: nextPrompt.length, source })

    try {
      const history = [...chatMessages, userMsg].map(({ role, content }) => ({ role, content }))
      // Pass cross-feature context so chat is aware of what the learner has
      // already seen via keyword popups and visual highlight cards.
      const surfacedKeywords = shownKeywordTermsRef.current
      const surfacedVisuals = surfacedHighlightsRef.current.map((h) => h.text)
      const reply = await callAI(aiProvider, history, currentPlaybackSeconds, sessionIdRef.current, quizHistory, source, surfacedKeywords, surfacedVisuals)
      setChatMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          source: 'Ask Pal',
          title: `Reply • ${formatTime(currentPlaybackSeconds)}`,
          content: reply,
        },
      ])
    } catch (err) {
      setAiError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    sendMessage()
  }

  const handlePinKeyword = () => {
    if (!activeKeywordPrompt) return
    setKeywordLog((prev) => prev.map((k) => k.id === activeKeywordPrompt.id ? { ...k, pinned: true } : k))
    setActiveKeywordPrompt(null)
    logEvent('keyword_pinned', currentPlaybackSeconds, { term: activeKeywordPrompt.term })
  }

  const handleKeywordResponse = (action) => {
    if (!activeKeywordPrompt) return

    if (action === 'detail') {
      localVideoRef.current?.pause()
      sendMessage(`A term just appeared while I was watching: "${activeKeywordPrompt.term}" — briefly defined as "${activeKeywordPrompt.definition}". Can you explain this in depth with intuitive analogies, real-world examples, and how it fits into neural networks?`, 'keyword_detail')
      setInteractionStats((current) => ({
        ...current,
        keywordOpened: current.keywordOpened + 1,
        detailRequests: current.detailRequests + 1,
      }))
      if (!firstInteractionLoggedRef.current) {
        firstInteractionLoggedRef.current = true
        logEvent('first_interaction', currentPlaybackSeconds)
      }
      logEvent('keyword_detail', currentPlaybackSeconds)
    } else if (action === 'later') {
      setLaterQueue((current) => (
        current.some((item) => item.id === activeKeywordPrompt.id)
          ? current
          : [...current, activeKeywordPrompt]
      ))
      setInteractionStats((current) => ({
        ...current,
        keywordDeferred: current.keywordDeferred + 1,
      }))
      logEvent('keyword_later', currentPlaybackSeconds)
    } else {
      setInteractionStats((current) => ({
        ...current,
        keywordIgnored: current.keywordIgnored + 1,
      }))
      logEvent('keyword_dismissed', currentPlaybackSeconds)
    }

    setActiveKeywordPrompt(null)
  }

  const openRegionCard = (region) => {
    setInteractionStats((current) => ({ ...current, visualOpened: current.visualOpened + 1 }))
    setActiveVisualCard({
      id: region.id,
      x: (region.x + region.width  / 2) / 100,
      y: (region.y + region.height / 2) / 100,
      title: region.label,
      shortExplanation: region.description,
      detailPrompt: `Explain "${region.label}" in this neural network diagram: ${region.description}`,
    })
    pausedRegionRef.current = region
    setFrameRegions([])
    frameRegionsRef.current = []
    localVideoRef.current?.pause()
    logEvent('visual_opened', currentPlaybackSeconds)
  }

  const handleVisualCardAction = (action) => {
    if (!activeVisualCard) return

    if (action === 'save') {
      setSavedVisualCards((current) => (
        current.some((item) => item.id === activeVisualCard.id)
          ? current
          : [...current, activeVisualCard]
      ))
      setInteractionStats((current) => ({ ...current, visualSaved: current.visualSaved + 1 }))
      if (!firstInteractionLoggedRef.current) {
        firstInteractionLoggedRef.current = true
        logEvent('first_interaction', currentPlaybackSeconds)
      }
      logEvent('visual_saved', currentPlaybackSeconds)
    }

    if (action === 'detail') {
      sendMessage(`The AI highlighted something on screen: "${activeVisualCard.title}" — ${activeVisualCard.shortExplanation}. Can you explain this in depth with intuitive analogies, real-world examples, and its role in neural networks?`, 'visual_detail')
      setInteractionStats((current) => ({
        ...current,
        detailRequests: current.detailRequests + 1,
      }))
      if (!firstInteractionLoggedRef.current) {
        firstInteractionLoggedRef.current = true
        logEvent('first_interaction', currentPlaybackSeconds)
      }
      logEvent('visual_detail', currentPlaybackSeconds)
    }

    if (action === 'close') {
      if (pausedRegionRef.current) {
        const pinned = { ...pausedRegionRef.current, pinned: true }
        setFrameRegions([pinned])
        frameRegionsRef.current = [pinned]
      }
      pausedRegionRef.current = null
      logEvent('visual_closed', currentPlaybackSeconds)
    }

    if (action === 'detail' || action === 'save') {
      pausedRegionRef.current = null
    }

    setActiveVisualCard(null)
  }

  const shiftQuizFrequency = (direction, reason) => {
    const order = ['Low', 'Medium', 'High']
    setQuizFrequency((current) => {
      const idx = order.indexOf(current)
      const next = direction === 'down' ? order[Math.max(0, idx - 1)] : order[Math.min(2, idx + 1)]
      if (next === current) return current
      const toastMsg = direction === 'down'
        ? `Quiz frequency reduced to ${FREQUENCY_LABELS[next]} — ${reason}`
        : `Quiz frequency increased to ${FREQUENCY_LABELS[next]} — ${reason}`
      setQuizFreqToast(toastMsg)
      setTimeout(() => setQuizFreqToast(null), 5000)
      return next
    })
  }

  const dismissQuiz = () => {
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setFreqDownCountdown(null)
    localVideoRef.current?.play()
  }

  const skipQuiz = () => {
    setInteractionStats((current) => ({ ...current, quizSkipped: current.quizSkipped + 1 }))
    setQuizLog((prev) => [...prev, {
      id: `ql-${Date.now()}`,
      question: activeQuiz.question,
      options: activeQuiz.options,
      correctIndex: activeQuiz.correctIndex,
      explanation: activeQuiz.explanation,
      selectedIndex: null,
      status: 'skipped',
      arrivedStr: formatTime(currentPlaybackSeconds),
    }])
    setQuizLogIdx(null)
    setConsecutiveAnswered(0)
    const nextSkips = consecutiveSkips + 1

    if (nextSkips >= 2) {
      const order = ['Low', 'Medium', 'High']
      const nextFreq = order[Math.max(0, order.indexOf(quizFrequency) - 1)]
      if (nextFreq !== quizFrequency) {
        // Show countdown — don't dismiss yet
        setConsecutiveSkips(0)
        setFreqDownCountdown({ nextFreq })
        clearTimeout(freqCountdownTimerRef.current)
        freqCountdownTimerRef.current = setTimeout(() => {
          setQuizFrequency(nextFreq)
          setFreqDownCountdown(null)
          dismissQuiz()
        }, 5000)
        logEvent('quiz_skipped', currentPlaybackSeconds)
        return
      }
      setConsecutiveSkips(0)
    } else {
      setConsecutiveSkips(nextSkips)
    }

    logEvent('quiz_skipped', currentPlaybackSeconds)
    dismissQuiz()
  }

  const stayOnFrequency = () => {
    clearTimeout(freqCountdownTimerRef.current)
    setFreqDownCountdown(null)
    setConsecutiveSkips(0)
    dismissQuiz()
  }

  const submitQuiz = () => {
    if (!activeQuiz || quizSelection === null || quizOutcome) return

    const isCorrect = quizSelection === activeQuiz.correctIndex
    setQuizOutcome({ isCorrect })
    setInteractionStats((current) => ({
      ...current,
      quizAnswered: current.quizAnswered + 1,
      quizCorrect: current.quizCorrect + (isCorrect ? 1 : 0),
    }))
    setQuizHistory((prev) => [...prev, { question: activeQuiz.question, isCorrect }])
    setQuizLog((prev) => [...prev, {
      id: `ql-${Date.now()}`,
      question: activeQuiz.question,
      options: activeQuiz.options,
      correctIndex: activeQuiz.correctIndex,
      explanation: activeQuiz.explanation,
      selectedIndex: quizSelection,
      status: isCorrect ? 'correct' : 'wrong',
      arrivedStr: formatTime(currentPlaybackSeconds),
    }])
    setQuizLogIdx(null)
    setConsecutiveSkips(0)
    setConsecutiveAnswered((prev) => {
      const next = prev + 1
      if (next >= 3) {
        shiftQuizFrequency('up', "you've been actively answering questions")
        return 0
      }
      return next
    })
    if (!firstInteractionLoggedRef.current) {
      firstInteractionLoggedRef.current = true
      logEvent('first_interaction', currentPlaybackSeconds)
    }
    logEvent(isCorrect ? 'quiz_correct' : 'quiz_wrong', currentPlaybackSeconds)

    // Save attempt to backend — fire and forget. Mirrors the pattern used by
    // the Intermittent and Continuous prototypes so quiz_attempts is populated.
    if (sessionIdRef.current && activeQuiz) {
      fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          question: activeQuiz.question,
          options: activeQuiz.options,
          correctIndex: activeQuiz.correctIndex,
          selectedIndex: quizSelection,
          isCorrect,
          provider: aiProvider,
        }),
      }).catch(() => {})
    }
  }

  const explainQuizInAskPal = () => {
    if (!activeQuiz || quizSelection === null || !quizOutcome) return

    addChatExchange({
      source: 'Checkpoint quiz',
      title: `Quiz follow-up • ${formatTime(currentPlaybackSeconds)}`,
      userMessage: activeQuiz.question,
      assistantMessage: buildQuizExplanation(activeQuiz, quizSelection, currentPlaybackSeconds),
    })
    setInteractionStats((current) => ({
      ...current,
      detailRequests: current.detailRequests + 1,
    }))
    logEvent('quiz_detail', currentPlaybackSeconds)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
  }

  const resumeAfterQuiz = () => dismissQuiz()

  const seekTo = (seconds) => {
    if (activeQuiz) return
    const clamped = Math.max(0, seconds)
    if (localVideoRef.current) localVideoRef.current.currentTime = clamped
    setCurrentPlaybackSeconds(clamped)
    setActiveKeywordPrompt(null)
    setFrameRegions([])
    if (activeVisualCard) {
      setActiveVisualCard(null)
      localVideoRef.current?.play()
    }
  }

  const stepPlayback = (deltaSeconds) => {
    const current = localVideoRef.current?.currentTime ?? currentPlaybackSeconds
    seekTo(Math.max(0, current + deltaSeconds))
  }

  // ── Custom overlay controls ──────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const v = localVideoRef.current
    if (!v) return
    isPlayingRef.current ? v.pause() : v.play()
  }, [])

  const seekRelative = useCallback((delta) => {
    const v = localVideoRef.current
    if (!v) return
    const from = v.currentTime
    const t = Math.max(0, from + delta)
    v.currentTime = t
    setCurrentPlaybackSeconds(t)
    logEvent('video_seek', from, { to_seconds: t, delta, source: 'button' })
  }, [])

  const handleStageMouseMove = useCallback(() => {
    setShowControls(true)
    clearTimeout(controlsTimerRef.current)
    if (isPlayingRef.current) {
      controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [])

  const handleStageMouseLeave = useCallback(() => {
    clearTimeout(controlsTimerRef.current)
    if (isPlayingRef.current) setShowControls(false)
  }, [])

  const seekToRatio = (clientX) => {
    const rect = progressRef.current?.getBoundingClientRect()
    if (!rect || !duration) return
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration
    const from = localVideoRef.current?.currentTime ?? 0
    if (localVideoRef.current) localVideoRef.current.currentTime = t
    setCurrentPlaybackSeconds(t)
    if (Math.abs(t - from) > 1.5) {
      logEvent('video_seek', from, { to_seconds: t, delta: t - from, source: 'scrubber' })
    }
  }

  const handleSeekPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isSeekingRef.current = true
    seekToRatio(e.clientX)
  }

  const handleSeekPointerMove = (e) => {
    if (!isSeekingRef.current) return
    seekToRatio(e.clientX)
  }

  const handleSeekPointerUp = () => { isSeekingRef.current = false }

  const handleVolumeChange = (val) => {
    setVolume(val)
    const v = localVideoRef.current
    if (!v) return
    v.volume = val / 100
    v.muted = val === 0
    if (val === 0) setIsMuted(true)
    else if (isMuted) setIsMuted(false)
  }

  const toggleMute = () => {
    const v = localVideoRef.current
    if (!v) return
    v.muted = !isMuted
    setIsMuted(!isMuted)
    if (isMuted && volume === 0) { setVolume(50); v.volume = 0.5 }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      playerStageRef.current?.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const saveParticipantId = (id) => {
    if (!sessionIdRef.current) return
    fetch(`/api/sessions/${sessionIdRef.current}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantId: id }),
    }).catch(() => {})
  }

  const resetSession = () => {
    // Pause and rewind video
    const v = localVideoRef.current
    if (v) { v.pause(); v.currentTime = 0 }
    setCurrentPlaybackSeconds(0)

    // Reset all AI + chat state
    setChatMessages([])
    setAiError(null)
    setPrompt('')
    setIsLoading(false)
    setQuizHistory([])

    // Reset all proactive intervention state
    setActiveKeywordPrompt(null)
    setActiveVisualCard(null)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setShownKeywordIds([])
    setKeywordLog([])
    setKeywordLogOpen(false)
    setLiveKeywords([])
    setFrameRegions([])
    setSurfacedHighlights([])
    liveKeywordsRef.current = []
    surfacedHighlightsRef.current = []
    lastAnalysedRowRef.current = 0
    newKeywordsSinceQuizRef.current = 0
    lastVisualNudgeAtRef.current = -Infinity
    frameRegionsRef.current = []
    setFrameRegions([])
    setLastInterventionAt(-45)
    setLastQuizAt(0)
    setSavedVisualCards([])
    setLaterQueue([])
    setInteractionStats({
      keywordIgnored: 0, keywordOpened: 0, keywordDeferred: 0,
      visualOpened: 0, visualSaved: 0,
      quizSkipped: 0, quizAnswered: 0, quizCorrect: 0, detailRequests: 0,
    })
    setQuizPaused(false)
    setHighlightsPaused(false)
    setSelectedFrequency('Medium')
    setQuizFrequency('Medium')

    // Reset participant flow — drop the session and re-show the PID modal so the
    // next participant types their ID before any data is logged.
    sessionIdRef.current = null
    firstInteractionLoggedRef.current = false
    setParticipantId('')
    setPidInput('')
    setPidConfirmed(false)
    setModalDismissed(false)
  }

  const applyPlaybackRate = (rate) => {
    logEvent('playback_speed_changed', localVideoRef.current?.currentTime ?? 0, { from: playbackRate, to: rate })
    setPlaybackRate(rate)
    if (localVideoRef.current) localVideoRef.current.playbackRate = rate
  }

  const cyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate)
    const next = PLAYBACK_SPEEDS[currentIndex === PLAYBACK_SPEEDS.length - 1 ? 0 : currentIndex + 1]
    applyPlaybackRate(next)
  }

  const visibleSavedCards = savedVisualCards.slice(-2)
  const visibleLaterQueue = laterQueue.slice(-2)

  const confirmPid = () => {
    const trimmed = pidInput.trim()
    if (!trimmed) return
    setParticipantId(trimmed)
    saveParticipantId(trimmed)
    setPidConfirmed(true)
  }

  return (
    <div className="proactive-app">
      {!pidConfirmed && !modalDismissed && (
        <div className="lp-pid-backdrop">
          <button className="lp-pid-skip" type="button" onClick={() => setModalDismissed(true)}>skip</button>
          <div className="lp-pid-modal">
            <div>
              <h2>Enter Participant ID</h2>
              <p style={{ marginTop: 6 }}>Enter the participant ID assigned by the researcher before starting the session.</p>
            </div>
            <input
              className="lp-pid-input"
              type="text"
              placeholder="e.g. P01"
              value={pidInput}
              autoFocus
              onChange={(e) => setPidInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmPid() }}
            />
            <button
              className="lp-pid-submit"
              type="button"
              disabled={!pidInput.trim()}
              onClick={confirmPid}
            >
              Start Session
            </button>
          </div>
        </div>
      )}
      <header className="app-header">
        <div className="brand-lockup">
          <img className="brand-mark" src={brandIcon} alt="LearnPal brand icon" />
          <p className="brand-wordmark" aria-label="LearnPal">
            <span className="brand-wordmark-learn">Learn</span>
            <span className="brand-wordmark-pal">Pal</span>
          </p>
        </div>
      </header>

      <div className="app-shell">
        <aside className="lp-left-nav">
          <button className="lp-icon-btn" type="button" aria-label="Menu">
            ☰
          </button>

          <div className="lp-left-bottom">
            <div className="lp-user-avatar" aria-label="User profile">
              P
            </div>
          </div>
        </aside>

        <main className="main-panel" ref={mainColumnRef} onScroll={handleMainScroll}>
          <section className={`player-card${isCompact ? ' player-card-compact' : ''}`}>
            <div
              ref={playerStageRef}
              className={`player-stage${!showControls ? ' player-nocursor' : ''}${activeQuiz || activeVisualCard ? ' is-dimmed' : ''}`}
              onMouseMove={handleStageMouseMove}
              onMouseLeave={handleStageMouseLeave}
            >
              <video
                ref={localVideoRef}
                src={VIDEO_SRC}
                className="lp-youtube-player"
                style={{ objectFit: 'contain', background: '#000' }}
              />

              {/* Hidden canvas for frame capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} aria-hidden="true" />

              <div className="lp-player-click-capture" onClick={togglePlay} aria-hidden="true" />

              <div className={`lp-controls${showControls ? ' lp-controls-visible' : ''}`}>
                <div
                  className="lp-seek-bar"
                  ref={progressRef}
                  onPointerDown={handleSeekPointerDown}
                  onPointerMove={handleSeekPointerMove}
                  onPointerUp={handleSeekPointerUp}
                >
                  <div className="lp-seek-track">
                    <div className="lp-seek-fill" style={{ width: `${seekPercent}%` }} />
                    <div className="lp-seek-thumb" style={{ left: `${seekPercent}%` }} />
                    {duration > 0 && surfacedHighlights.map(h => (
                      <button
                        key={h.id}
                        type="button"
                        className="lp-seek-marker"
                        style={{ left: `${(h.arrivedAt / duration) * 100}%` }}
                        aria-label={`Highlight: ${h.text}`}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => {
                          e.stopPropagation()
                          setActiveVisualCard(h)
                          localVideoRef.current?.pause()
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="lp-controls-row">
                  <div className="lp-ctrl-left">
                    <button type="button" className="lp-ctrl-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
                      {isPlaying ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M5 3l14 9-14 9V3z" />
                        </svg>
                      )}
                    </button>
                    <button type="button" className="lp-ctrl-btn" onClick={() => seekRelative(-10)} aria-label="Rewind 10 seconds">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                        <text x="12" y="17" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">10</text>
                      </svg>
                    </button>
                    <button type="button" className="lp-ctrl-btn" onClick={() => seekRelative(10)} aria-label="Forward 10 seconds">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                        <text x="12" y="17" textAnchor="middle" fontSize="6" fontWeight="bold" fill="currentColor">10</text>
                      </svg>
                    </button>
                    <div className="lp-vol-group">
                      <button type="button" className="lp-ctrl-btn" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
                        {(isMuted || volume === 0) ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 18l1.73 1.73L21 18.46 5.73 3H4.27zM12 4L9.91 6.09 12 8.18V4z" />
                          </svg>
                        ) : volume < 50 ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                          </svg>
                        )}
                      </button>
                      <div className="lp-vol-track">
                        <input
                          type="range" min="0" max="100"
                          value={isMuted ? 0 : volume}
                          onChange={(e) => handleVolumeChange(Number(e.target.value))}
                          className="lp-vol-slider"
                          aria-label="Volume"
                        />
                      </div>
                    </div>
                    <span className="lp-ctrl-time">{formatTime(currentPlaybackSeconds)} / {formatTime(duration)}</span>
                  </div>
                  <div className="lp-ctrl-right">
                    <div className="lp-speed-group">
                      <button
                        type="button"
                        className="lp-ctrl-btn lp-speed-btn"
                        onClick={(e) => { e.stopPropagation(); setShowSpeedMenu((v) => !v) }}
                        aria-label="Playback speed"
                      >
                        {playbackRate === 1 ? '1×' : `${playbackRate}×`}
                      </button>
                      {showSpeedMenu && (
                        <div className="lp-speed-menu">
                          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
                            <button
                              key={r}
                              type="button"
                              className={`lp-speed-opt${playbackRate === r ? ' lp-speed-current' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                applyPlaybackRate(r)
                                setShowSpeedMenu(false)
                              }}
                            >
                              {r === 1 ? 'Normal' : `${r}×`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Fullscreen — disabled for study */}
                    <button type="button" className="lp-ctrl-btn lp-ctrl-btn--disabled" title="Fullscreen is disabled for this study" aria-disabled="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {frameRegions.map((region) => (
                <button
                  key={region.id}
                  className="lp-frame-region"
                  type="button"
                  style={{
                    left:   `${region.x}%`,
                    top:    `${region.y}%`,
                    width:  `${region.width}%`,
                    height: `${region.height}%`,
                  }}
                  aria-label={`Visual nudge: ${region.label}`}
                  onClick={() => openRegionCard(region)}
                >
                  <span className="lp-frame-region-pulse" />
                </button>
              ))}

              {activeKeywordPrompt ? (
                <article className="proactive-alert">
                  <div className="proactive-alert-header">
                    <div className="proactive-alert-title">
                      <img src={brandIcon} alt="" />
                      <span className="lp-kw-number">#{activeKeywordPrompt.number + 1}</span>
                      <h2>{activeKeywordPrompt.term}</h2>
                    </div>
                    <div className="proactive-alert-header-actions">
                      <button
                        className="lp-kw-pin-btn"
                        type="button"
                        aria-label="Pin keyword"
                        onClick={handlePinKeyword}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
                        </svg>
                        Pin
                      </button>
                      <button
                        className="icon-dismiss"
                        type="button"
                        aria-label="Dismiss proactive prompt"
                        onClick={() => handleKeywordResponse('close')}
                      >
                        <CloseIcon />
                      </button>
                    </div>
                  </div>

                  <p>{activeKeywordPrompt.definition}</p>

                  <div className="proactive-alert-actions">
                    <button className="button-primary" type="button" onClick={() => handleKeywordResponse('detail')}>
                      Detail
                    </button>
                    <button className="button-secondary" type="button" onClick={() => handleKeywordResponse('later')}>
                      Later
                    </button>
                  </div>
                </article>
              ) : null}

              {activeVisualCard ? (
                <article
                  className="visual-detail-card"
                  style={{
                    top:    activeVisualCard.y > 0.52 ? '16px' : 'auto',
                    bottom: activeVisualCard.y > 0.52 ? 'auto' : '24px',
                    left:   activeVisualCard.x > 0.52 ? '8px'  : 'auto',
                    right:  activeVisualCard.x > 0.52 ? 'auto' : '8px',
                  }}
                >
                  <div className="visual-card-header">
                    <div>
                      <span className="overlay-kicker">Visual detail</span>
                      <h2>{activeVisualCard.title}</h2>
                    </div>
                    <button
                      className="icon-dismiss"
                      type="button"
                      aria-label="Close visual detail"
                      onClick={() => handleVisualCardAction('close')}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <p>{activeVisualCard.shortExplanation}</p>

                  <div className="visual-card-actions">
                    <button className="button-secondary" type="button" onClick={() => handleVisualCardAction('save')}>
                      Save
                    </button>
                    <button className="button-primary" type="button" onClick={() => handleVisualCardAction('detail')}>
                      Detail
                    </button>
                  </div>
                </article>
              ) : null}

              {(quizLoading && !activeQuiz) || activeQuiz ? (
                <div className="lp-modal-backdrop">
                  <section className="lp-quiz-modal" role="dialog" aria-modal="true" aria-label="Quick check">
                    <div className="lp-quiz-modal-top">
                      <h3>Quick check</h3>
                    </div>
                    <p className="lp-quiz-meta">Generated from what you've watched so far.</p>

                    {quizLoading && !activeQuiz && (
                      <div className="lp-quiz-loading">
                        <div className="lp-typing-indicator"><span /><span /><span /></div>
                        <p>Generating question…</p>
                      </div>
                    )}

                    {activeQuiz && (
                      <>
                        <p className="lp-quiz-question">{activeQuiz.question}</p>

                        <div className="lp-quiz-options">
                          {activeQuiz.options.map((option, index) => {
                            const isCorrect = !!quizOutcome && index === activeQuiz.correctIndex
                            const isWrong = !!quizOutcome && index === quizSelection && index !== activeQuiz.correctIndex
                            return (
                              <button
                                key={option}
                                type="button"
                                className={`lp-quiz-option${!quizOutcome && quizSelection === index ? ' lp-selected' : ''}${isCorrect ? ' lp-correct' : ''}${isWrong ? ' lp-wrong' : ''}`}
                                disabled={!!quizOutcome}
                                onClick={() => setQuizSelection(index)}
                              >
                                {option}
                              </button>
                            )
                          })}
                        </div>

                        {quizOutcome && (
                          <div className="lp-quiz-feedback">
                            <div className={`lp-feedback-result lp-feedback-result--${quizOutcome.isCorrect ? 'correct' : 'wrong'}`}>
                              <span className="lp-feedback-icon">{quizOutcome.isCorrect ? '✓' : '✗'}</span>
                              <span className="lp-feedback-label">
                                {quizOutcome.isCorrect ? 'Correct' : 'Incorrect — the right answer is: '}
                                {!quizOutcome.isCorrect && <strong>{activeQuiz.options[activeQuiz.correctIndex]}</strong>}
                              </span>
                            </div>
                            <div className="lp-feedback-explanation">
                              <span className="lp-feedback-explanation-label">Explanation</span>
                              <p>{activeQuiz.explanation}</p>
                            </div>
                          </div>
                        )}

                        {freqDownCountdown && (
                          <div className="quiz-freq-down">
                            <p className="quiz-freq-down-msg">
                              Switching to <strong>{FREQUENCY_LABELS[freqDownCountdown.nextFreq]}</strong> frequency…
                            </p>
                            <div className="quiz-freq-down-bar">
                              <div className="quiz-freq-down-fill" />
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div className="lp-quiz-actions">
                      {freqDownCountdown ? (
                        <button type="button" className="lp-secondary" onClick={stayOnFrequency}>
                          Stay on {FREQUENCY_LABELS[quizFrequency]}
                        </button>
                      ) : quizOutcome ? (
                        <>
                          <button type="button" className="lp-secondary" onClick={resumeAfterQuiz}>
                            Resume
                          </button>
                          <button type="button" onClick={explainQuizInAskPal}>
                            Explain in Ask Pal
                          </button>
                        </>
                      ) : activeQuiz ? (
                        <>
                          <button type="button" className="lp-secondary" onClick={skipQuiz}>
                            Skip
                          </button>
                          <button
                            type="button"
                            disabled={quizSelection === null}
                            onClick={submitQuiz}
                          >
                            Submit
                          </button>
                        </>
                      ) : null}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>

          </section>

          <div className="feature-cards-grid" ref={featureGridRef}>
            <Highlights
              items={surfacedHighlights}
              onDetailClick={(h) => {
                if (h.regions?.[0]) openRegionCard(h.regions[0])
              }}
              frequency={selectedFrequency}
              onFrequencyChange={(next) => {
                logEvent('frequency_changed', localVideoRef.current?.currentTime ?? 0, { type: 'highlights', from: selectedFrequency, to: next })
                setSelectedFrequency(next)
              }}
              paused={highlightsPaused}
              onPausedChange={(next) => {
                logEvent(next ? 'highlights_paused' : 'highlights_resumed', localVideoRef.current?.currentTime ?? 0)
                setHighlightsPaused(next)
              }}
            />

            <article className="lp-feature-card">
              <div className="lp-feature-head">
                <div className="lp-feature-head-left">
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="7.2" stroke="#0336ff" strokeWidth="1.8"/>
                    <path d="M7 10.2l2.1 2.1L13.5 8" stroke="#0336ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <h3>Pop quiz</h3>
                  <div className="lp-info-tip" ref={quizTipRef}>
                    <button
                      type="button"
                      className={`lp-info-tip-btn${quizTipOpen ? ' lp-info-tip-btn--open' : ''}`}
                      onClick={() => setQuizTipOpen((v) => !v)}
                      aria-label="About this section"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
                        <line x1="12" y1="8" x2="12" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <line x1="12" y1="11" x2="12" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                    {quizTipOpen && (
                      <div className="lp-tip-bubble lp-tip-bubble--open" role="tooltip">
                        <strong>Pop quiz</strong> — the AI pauses you at key moments with a question based on what you just watched. Use the frequency control to make pop quizzes more or less frequent. Pause stops new quizzes from being generated.
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={quizPaused ? 'is-cta' : ''}
                  onClick={() => setQuizPaused((current) => !current)}
                >
                  {quizPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
              {quizFreqToast && (
                <div className="lp-quiz-freq-toast">
                  {quizFreqToast}
                </div>
              )}
              <div className="lp-freq-row">
                <span>Frequency</span>
                <div className="lp-freq-pills" role="list" aria-label="Quiz frequency">
                  {FREQUENCY_OPTIONS.map((option) => (
                    <button
                      key={option}
                      className={`lp-freq-pill${quizFrequency === option ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => setQuizFrequency(option)}
                    >
                      {FREQUENCY_LABELS[option]}
                    </button>
                  ))}
                </div>
              </div>

              {quizLog.length === 0 && (
                <p className="lp-qlog-empty">Questions you've answered will appear here.</p>
              )}

              {quizLog.length > 0 && (
                <div className="lp-qlog">
                  <div className="lp-qlog-pills">
                    {quizLog.map((entry, i) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`lp-qlog-pill lp-qlog-pill--${entry.status}${quizLogIdx === i ? ' is-active' : ''}`}
                        onClick={() => setQuizLogIdx(quizLogIdx === i ? null : i)}
                        title={`Q${i + 1} · ${entry.arrivedStr} · ${entry.status}`}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>

                  {quizLogIdx !== null && quizLog[quizLogIdx] && (() => {
                    const e = quizLog[quizLogIdx]
                    return (
                      <div className="lp-qlog-detail">
                        <div className="lp-qlog-meta">
                          <span className={`lp-qlog-badge lp-qlog-badge--${e.status}`}>
                            {e.status === 'correct' ? 'Correct' : e.status === 'wrong' ? 'Incorrect' : 'Skipped'}
                          </span>
                          <span className="lp-qlog-ts">{e.arrivedStr}</span>
                        </div>
                        <p className="lp-qlog-question">{e.question}</p>
                        {e.status !== 'skipped' && (
                          <ul className="lp-qlog-options">
                            {e.options.map((opt, idx) => {
                              let cls = 'lp-qlog-option'
                              if (idx === e.correctIndex) cls += ' is-correct'
                              else if (idx === e.selectedIndex) cls += ' is-wrong'
                              return (
                                <li key={idx} className={cls}>
                                  <span>{String.fromCharCode(65 + idx)}.</span> {opt}
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        {e.explanation && (
                          <p className="lp-qlog-explanation">{e.explanation}</p>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </article>
          </div>

          <section className="transcript-card">
            <div className="transcript-header">
              <h2>Transcripts</h2>
              <div className="transcript-divider" />
            </div>

            <ul
              className="transcript-list"
              ref={transcriptListRef}
              onScroll={handleTranscriptScroll}
            >
              {transcriptRows.map((row) => (
                <li
                  key={row.id}
                  ref={(node) => setTranscriptItemRef(row.id, node)}
                  className={`transcript-row${activeTranscriptId === row.id ? ' is-active' : ''}`}
                  onClick={() => { logEvent('transcript_clicked', localVideoRef.current?.currentTime ?? 0, { to_seconds: row.seconds }); seekTo(row.seconds) }}
                >
                  <p className="transcript-time">{row.time}</p>
                  <p className="transcript-copy">{row.text}</p>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <aside className="lp-chat-column">
          {/* Title bar + provider toggle */}
          <div className="lp-chat-title">
            Ask Pal
            <button
              type="button"
              className="lp-provider-toggle"
              onClick={() =>
                setAiProvider((p) => {
                  const idx = PROVIDER_CYCLE.indexOf(p)
                  return PROVIDER_CYCLE[(idx + 1) % PROVIDER_CYCLE.length]
                })
              }
              title="Switch AI provider"
            >
              {PROVIDER_LABELS[aiProvider].logo && (
                <img src={chatgptLogo} alt="" className="lp-provider-logo" />
              )}
              {PROVIDER_LABELS[aiProvider].label}
            </button>
          </div>

          {/* Scrollable chat body */}
          <section className="lp-chat-hero" ref={chatMessagesRef} aria-live="polite">
            {chatMessages.length === 0 && !isLoading ? (
              <>
                <div className="lp-greeting-wrap">
                  <img src={palCharacter} alt="Pal mascot" />
                  <div className="lp-greeting-bubbles">
                    <p className="lp-greet-light">Hi there,</p>
                    <p className="lp-greet-strong">How can I help you?</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="lp-snap-chat-flow">
                {chatMessages.map((msg) =>
                  msg.role === 'user' ? (
                    <div key={msg.id} className="lp-flow-user-end lp-flow-col">
                      <div className="lp-flow-chip">{msg.content}</div>
                    </div>
                  ) : (
                    <div key={msg.id} className="lp-flow-assistant">
                      <div className="lp-flow-assistant--md">
                        {msg.title && (
                          <p className="lp-flow-meta">{msg.source} · {msg.title}</p>
                        )}
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  )
                )}

                {isLoading && (
                  <div className="lp-flow-assistant">
                    <div className="lp-typing-indicator">
                      <span /><span /><span />
                    </div>
                  </div>
                )}

                {aiError && (
                  <div className="lp-flow-assistant">
                    <p className="lp-error-msg">⚠ {aiError}</p>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Footer */}
          <section className="lp-chat-bottom">
            <div className="lp-input-row">
              <form className="lp-input-main" onSubmit={handleSubmit}>
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask me anything..."
                  aria-label="Ask Pal input"
                  disabled={isLoading}
                />
                <button type="submit" aria-label="Send message" disabled={isLoading}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </form>
            </div>

            {chatMessages.length === 0 && (
              <div className="lp-suggestions-inline">
                <p className="lp-suggestions-label">Try asking</p>
                <div className="lp-suggestions-grid">
                  {QUICK_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="lp-suggestion-card"
                      onClick={() => {
                        logEvent('chat_suggestion_clicked', currentPlaybackSeconds, { suggestion: s })
                        sendMessage(s, 'chat_suggestion')
                      }}
                      disabled={isLoading}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="lp-suggestion-arrow">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <p className="lp-ai-disclaimer">Pal can make mistakes. Always verify important information.</p>
        </aside>
      </div>

      {/* Researcher panel — fixed top-right, fades unless hovered */}
      {!DEMO_MODE && <div className="lp-researcher-panel">
        <input
          type="text"
          className="lp-researcher-input"
          placeholder="Participant ID"
          value={participantId}
          onChange={(e) => {
            setParticipantId(e.target.value)
            saveParticipantId(e.target.value)
          }}
        />
        <button type="button" className="lp-researcher-reset" onClick={resetSession}>
          Reset
        </button>
        <a
          className="lp-researcher-export"
          href="/api/export/all"
          target="_blank"
          rel="noreferrer"
        >
          Export Excel
        </a>
      </div>}

      {/* Keyword log — fixed bottom-right */}
      <div className="lp-kw-log-wrap">
        {keywordLogOpen && (
          <div className="lp-kw-log-panel">
            <div className="lp-kw-log-header">
              <span>Keywords</span>
              <button type="button" onClick={() => setKeywordLogOpen(false)}>×</button>
            </div>
            {keywordLog.length === 0 ? (
              <p className="lp-kw-log-empty">No keywords yet.</p>
            ) : (
              <ul className="lp-kw-log-list">
                {keywordLog.map((k) => (
                  <li key={k.id} className={`lp-kw-log-item${k.pinned ? ' lp-kw-log-item--pinned' : ''}`}>
                    <span className="lp-kw-number">#{k.number + 1}</span>
                    <div className="lp-kw-log-item-body">
                      <strong>{k.term}</strong>
                      <p>{k.definition}</p>
                    </div>
                    {k.pinned && <span className="lp-kw-pinned-badge">Pinned</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button
          type="button"
          className="lp-kw-log-btn"
          title="Keyword log"
          onClick={() => setKeywordLogOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <line x1="7" y1="7" x2="7.01" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {keywordLog.length > 0 && (
            <span className="lp-kw-log-count">{keywordLog.length}</span>
          )}
        </button>
      </div>
    </div>
  )
}


function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5l1.2 2.4 2.6.4-1.9 1.9.4 2.7-2.3-1.2-2.3 1.2.4-2.7-1.9-1.9 2.6-.4L12 3.5Z" />
      <path d="M12 13.8a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" />
      <path d="M12 18.5l1.1 2 2.2-.6.2-2.2 2-1.1-.8-2.2 1.4-1.7-1.4-1.7.8-2.2-2-1.1-.2-2.2-2.2-.6-1.1-2-2.1.8-2.1-.8-1.1 2-2.2.6-.2 2.2-2 1.1.8 2.2-1.4 1.7 1.4 1.7-.8 2.2 2 1.1.2 2.2 2.2.6 1.1 2 2.1-.8 2.1.8Z" />
    </svg>
  )
}

function PlayIcon({ isPlaying }) {
  if (isPlaying) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M6.5 4.5v11M13.5 4.5v11" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 4.5v11l9-5.5-9-5.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function VolumeIcon({ isMuted }) {
  if (isMuted) {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 8h3l4-3v10l-4-3H4Z" />
        <path d="m13 7 4 6M17 7l-4 6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 8h3l4-3v10l-4-3H4Z" />
      <path d="M13.4 7.1a4 4 0 0 1 0 5.8" />
      <path d="M15.7 5a7 7 0 0 1 0 10" />
    </svg>
  )
}

function RotateLeftIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5.5 6.5V3.5L2.5 6.5l3 3" />
      <path d="M6 6.5h4.5a5 5 0 1 1-4.6 7" />
    </svg>
  )
}

function RotateRightIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M14.5 6.5V3.5l3 3-3 3" />
      <path d="M14 6.5H9.5a5 5 0 1 0 4.6 7" />
    </svg>
  )
}

function CaptionsIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="4" width="14" height="11" rx="2" />
      <path d="M7 8.5h2.2M6.2 10h3M10.8 8.5H13M10.2 10h3.6" />
    </svg>
  )
}



function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  )
}

export default App
