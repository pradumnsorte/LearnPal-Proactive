import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import './App.css'
import transcriptRows from './data/transcript.json'
import glossaryData from './data/glossary.json'
import highlightsData from './data/highlights.json'
import questionsData from './data/questions.json'
import brandIcon from './assets/brand-icon.svg'
import palCharacter from './assets/pal-character.svg'

const VIDEO_ID = 'CqOfi41LfDw'
const PLAYLIST_ID = 'PLblh5JKOoLUIxGDQs4LFFD--41Vzf-ME1'

let ytApiPromise = null
const loadYouTubeIframeApi = () => {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady()
      resolve(window.YT)
    }
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(script)
    }
  })
  return ytApiPromise
}

const QUICK_SUGGESTIONS = [
  'Give me a summary in simple terms',
  'Explain the topic in simple terms',
  'Explain with real life example',
]

const FREQUENCY_OPTIONS = ['Low', 'Medium', 'High']
const PLAYBACK_SPEEDS = [1, 1.25, 1.5]

// confidenceThreshold: minimum highlight confidence (0–1) to surface at each frequency.
// Low  → only very high-confidence highlights; High → surface more liberally.
const FREQUENCY_CONFIG = {
  Low:    { confidenceThreshold: 0.9, promptGap: 60 },
  Medium: { confidenceThreshold: 0.8, promptGap: 42 },
  High:   { confidenceThreshold: 0.6, promptGap: 28 },
}

const PROACTIVE_KEYWORD_EVENTS = [
  {
    id: 'pk1',
    term: 'Back propogation',
    timestampSeconds: 222,
    importance: 2,
    reason: 'This is a key term that may be important for understanding the next section.',
    detailPrompt: 'Explain back propagation in simple terms',
    fallbackExplanation: 'Backpropagation is the training process that sends the prediction error backward through the network so each weight and bias can be adjusted.',
  },
  {
    id: 'pk2',
    term: 'Parameters',
    timestampSeconds: 235,
    importance: 3,
    reason: 'These values control how each connection changes the signal inside the network.',
    detailPrompt: 'Explain what parameters mean in this neural network example',
    fallbackExplanation: 'Parameters are the learnable numbers on the connections. Weights scale the signal and biases shift it before the next node uses it.',
  },
  {
    id: 'pk3',
    term: 'Activation Function',
    timestampSeconds: 343,
    importance: 3,
    reason: 'This idea unlocks why the network can fit a squiggle instead of a straight line.',
    detailPrompt: 'Explain activation functions with a simple example',
    fallbackExplanation: 'An activation function bends the signal inside a node. That bend is what lets the whole network create non-linear shapes.',
  },
]


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

const getCurrentHighlightAnchor = (currentSeconds) => {
  let anchor = null
  for (let index = 0; index < highlightsData.length; index += 1) {
    if (highlightsData[index].timestampSeconds <= currentSeconds) anchor = highlightsData[index]
    else break
  }
  return anchor
}

const getCurrentConceptSummary = (currentSeconds) => {
  const highlight = getCurrentHighlightAnchor(currentSeconds)
  if (highlight) return highlight.text
  return getRecentTranscriptRows(currentSeconds, 1)[0]?.text ?? 'the current neural network walkthrough'
}

const findGlossaryEntry = (term) => {
  const normalizedTerm = normalizeText(term)
  return glossaryData.find((entry) => {
    const normalizedEntry = normalizeText(entry.term)
    return normalizedEntry === normalizedTerm
      || normalizedEntry.includes(normalizedTerm)
      || normalizedTerm.includes(normalizedEntry)
  })
}

const buildAdaptiveStrategy = (stats) => {
  let keywordThreshold = 2
  let promptGapBonus = 0

  if (stats.keywordIgnored >= 2) {
    keywordThreshold = 3
    promptGapBonus += 16
  }
  if (stats.keywordOpened >= 2 && stats.keywordIgnored === 0) {
    keywordThreshold = 1
  }

  // Adjust confidence threshold based on engagement with visual highlights.
  // Positive offset → raise threshold (more selective); negative → lower it (show more).
  let confidenceThresholdOffset = 0
  if (stats.visualIgnored >= 2 && stats.visualOpened === 0) confidenceThresholdOffset = 0.08
  if (stats.visualOpened >= 2) confidenceThresholdOffset = -0.08

  const quizGap = stats.quizSkipped >= 2 ? 240 : 135
  const quizEnabled = stats.quizSkipped < 4

  return { keywordThreshold, promptGapBonus, confidenceThresholdOffset, quizGap, quizEnabled }
}

const buildKeywordExplanation = (item, currentSeconds) => {
  const glossaryEntry = findGlossaryEntry(item.term)
  const currentConcept = getCurrentConceptSummary(currentSeconds)
  return `${glossaryEntry?.definition ?? item.fallbackExplanation} Right now the lesson is focused on ${currentConcept.toLowerCase()}.`
}

const buildVisualExplanation = (item, currentSeconds) => {
  const currentConcept = getCurrentConceptSummary(currentSeconds)
  return `${item.detailedExplanation} This matters now because the speaker is walking through ${currentConcept.toLowerCase()}.`
}

const buildQuizExplanation = (question, selectedIndex, currentSeconds) => {
  const selectedOption = question.options[selectedIndex] ?? 'that option'
  const correctOption = question.options[question.correctIndex]
  const currentConcept = getCurrentConceptSummary(currentSeconds)

  if (selectedIndex === question.correctIndex) {
    return `${question.explanation} This checkpoint sits right after ${currentConcept.toLowerCase()}, so your answer shows the idea has landed.`
  }

  return `The best answer is "${correctOption}". ${question.explanation} The tricky part is that "${selectedOption}" sounds plausible until you connect it back to ${currentConcept.toLowerCase()}.`
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
const PROVIDER_CYCLE = [PROVIDERS.AZURE, PROVIDERS.AZURE_54, PROVIDERS.GROQ, PROVIDERS.OLLAMA]
const PROVIDER_LABELS = {
  [PROVIDERS.AZURE]:    '⬡ GPT-4o mini',
  [PROVIDERS.AZURE_54]: '⬡ GPT-5.4 mini',
  [PROVIDERS.GROQ]:     '⚡ Groq',
  [PROVIDERS.OLLAMA]:   '🦙 Ollama',
}

const buildSystemPrompt = (currentSeconds, quizHistory = []) => {
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

  const sessionContext = quizBlock ? `\n--- Session context ---${quizBlock}\n` : ''

  return `You are Pal, a friendly learning assistant embedded in LearnPal, a video learning app.

The user is currently learning about neural networks (video: "The Essential Main Ideas of Neural Networks" by StatQuest, position: ${timeStr}).

The following topics are being covered at this moment — use this as background knowledge to stay relevant, not as a source to cite:
${recentContext || 'Video just started.'}
${sessionContext}
You are a subject-matter expert in machine learning and neural networks. Explain every concept from first principles, with full depth — don't summarise, don't simplify away important detail, and never truncate. Go beyond the immediate question: bring in related concepts, real-world applications, intuitive analogies, and historical context where they add value. Your goal is to leave the user with a genuinely deeper understanding than any single video could provide.

Never reference the video, transcript, or presenter as a source. Do not say "the transcript says", "in the video", "the presenter mentions", "as stated", or anything similar. You simply know this material — explain it that way. The background topics above are only to help you stay contextually relevant; they are not a script to follow or cite.

Format your responses using markdown: use **bold** for key terms, bullet points or numbered lists for multi-part answers, and short paragraphs. Keep it conversational and clear — like a brilliant tutor who genuinely loves the subject.`
}

const callAI = async (provider, messages, currentSeconds, sessionId = null, quizHistory = []) => {
  const systemPrompt = buildSystemPrompt(currentSeconds, quizHistory)
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, messages, systemPrompt, sessionId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error ?? `Server error ${res.status}`)
  }
  const data = await res.json()
  return data.reply
}

function App() {
  const [selectedFrequency, setSelectedFrequency] = useState('Medium')
  const [videoHighlights, setVideoHighlights] = useState([])
  const [highlightsPaused, setHighlightsPaused] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [savedVisualCards, setSavedVisualCards] = useState([])
  const [laterQueue, setLaterQueue] = useState([])
  const [currentPlaybackSeconds, setCurrentPlaybackSeconds] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(100)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isCompact, setIsCompact] = useState(false)
  const [playerControlsMode, setPlayerControlsMode] = useState('custom')
  const [playerKey, setPlayerKey] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [aiProvider, setAiProvider] = useState(PROVIDERS.AZURE)
  const [isLoading, setIsLoading] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [quizHistory, setQuizHistory] = useState([])
  const [participantId, setParticipantId] = useState('')
  const [activeKeywordPrompt, setActiveKeywordPrompt] = useState(null)
  const [activeVisualCue, setActiveVisualCue] = useState(null)
  const [activeVisualCard, setActiveVisualCard] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null)
  const [quizSelection, setQuizSelection] = useState(null)
  const [quizOutcome, setQuizOutcome] = useState(null)
  const [shownKeywordIds, setShownKeywordIds] = useState([])
  const [shownVisualIds, setShownVisualIds] = useState([])
  const [shownQuizIds, setShownQuizIds] = useState([])
  const [lastInterventionAt, setLastInterventionAt] = useState(-45)
  const [lastQuizAt, setLastQuizAt] = useState(-Infinity)
  const [interactionStats, setInteractionStats] = useState({
    keywordIgnored: 0,
    keywordOpened: 0,
    keywordDeferred: 0,
    visualIgnored: 0,
    visualOpened: 0,
    visualSaved: 0,
    quizSkipped: 0,
    quizAnswered: 0,
    quizCorrect: 0,
    detailRequests: 0,
  })

  const playerHostRef = useRef(null)
  const playerRef = useRef(null)
  const playbackPollRef = useRef(null)
  const playerStageRef = useRef(null)
  const mainColumnRef = useRef(null)
  const isPlayingRef = useRef(false)
  const isCompactRef = useRef(false)
  const controlsTimerRef = useRef(null)
  const isSeekingRef = useRef(false)
  const savedTimeRef = useRef(0)
  const playerControlsModeRef = useRef('custom')
  const settingsPanelRef = useRef(null)
  const gearBtnRef = useRef(null)
  const progressRef = useRef(null)
  const sessionIdRef = useRef(null)
  const chatMessagesRef = useRef(null)

  const logEvent = (eventType, atSeconds) => {
    if (!sessionIdRef.current) return
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        eventType,
        currentPlaybackSeconds: Math.floor(atSeconds ?? 0),
      }),
    }).catch(() => {})
  }

  const activeTranscriptIndex = getActiveTranscriptIndex(currentPlaybackSeconds)
  const transcriptWindow = transcriptRows.slice(
    Math.max(0, activeTranscriptIndex - 1),
    Math.min(transcriptRows.length, activeTranscriptIndex + 5),
  )
  const currentHighlightAnchor = getCurrentHighlightAnchor(currentPlaybackSeconds)
  const adaptiveStrategy = buildAdaptiveStrategy(interactionStats)
  const seekPercent = duration > 0 ? (currentPlaybackSeconds / duration) * 100 : 0


  // ── YouTube player setup ─────────────────────────────────────────────────

  useEffect(() => {
    let disposed = false

    const startPlaybackPolling = () => {
      window.clearInterval(playbackPollRef.current)
      playbackPollRef.current = window.setInterval(() => {
        const player = playerRef.current
        if (!player || typeof player.getCurrentTime !== 'function') return
        const current = player.getCurrentTime()
        if (Number.isFinite(current)) setCurrentPlaybackSeconds(current)
      }, 500)
    }

    const initPlayer = async () => {
      await loadYouTubeIframeApi()
      if (disposed || !playerHostRef.current || !window.YT?.Player) return

      playerRef.current = new window.YT.Player(playerHostRef.current, {
        host: 'https://www.youtube-nocookie.com',
        videoId: VIDEO_ID,
        playerVars: {
          controls: playerControlsModeRef.current === 'native' ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
          list: PLAYLIST_ID,
          autoplay: 0,
        },
        events: {
          onReady: (e) => {
            startPlaybackPolling()
            if (savedTimeRef.current > 0) {
              e.target.seekTo(savedTimeRef.current, true)
              savedTimeRef.current = 0
            }
            const d = e.target.getDuration()
            if (d > 0) setDuration(d)
            setVolume(e.target.getVolume())
            setIsMuted(e.target.isMuted())
          },
          onStateChange: (e) => {
            const playing = e.data === 1
            const ended  = e.data === 0
            isPlayingRef.current = playing
            setIsPlaying(playing)
            const d = e.target.getDuration()
            if (d > 0) setDuration(d)
            if (playerControlsModeRef.current === 'custom') {
              if (playing) {
                clearTimeout(controlsTimerRef.current)
                controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000)
              } else {
                clearTimeout(controlsTimerRef.current)
                setShowControls(true)
              }
            }
            void ended
          },
        },
      })
    }

    initPlayer()

    return () => {
      disposed = true
      window.clearInterval(playbackPollRef.current)
      clearTimeout(controlsTimerRef.current)
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy()
      }
      playerRef.current = null
    }
  }, [playerKey])

  // ── Fullscreen sync ─────────────────────────────────────────────────────

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Compact player on scroll ─────────────────────────────────────────────

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

  // ── Settings panel (close on outside click) ──────────────────────────────

  useEffect(() => {
    if (!showSettings) return
    const close = (e) => {
      if (settingsPanelRef.current?.contains(e.target)) return
      if (gearBtnRef.current?.contains(e.target)) return
      setShowSettings(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showSettings])

  // ── Controls mode switch ─────────────────────────────────────────────────

  const switchPlayerControls = (next) => {
    if (next === playerControlsMode) { setShowSettings(false); return }
    savedTimeRef.current = playerRef.current?.getCurrentTime?.() ?? 0
    playerControlsModeRef.current = next
    setPlayerControlsMode(next)
    setShowControls(true)
    setShowSettings(false)
    setPlayerKey((k) => k + 1)
  }

  // ── Fetch video highlights from backend ──────────────────────────────────

  useEffect(() => {
    fetch('/api/videos/neural-networks/highlights')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setVideoHighlights(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'proactive-neural-networks',
        videoTitle: 'The Essential Main Ideas of Neural Networks',
      }),
    })
      .then((r) => r.json())
      .then((data) => { sessionIdRef.current = data.id })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!isPlaying) return
    if (activeKeywordPrompt || activeVisualCue || activeVisualCard || activeQuiz) return

    const frequency = FREQUENCY_CONFIG[selectedFrequency]
    const promptGap = frequency.promptGap + adaptiveStrategy.promptGapBonus
    if (currentPlaybackSeconds - lastInterventionAt < promptGap) return

    // §3.4 — do not interrupt if the transcript is too dense at this moment
    if (isTranscriptDense(currentPlaybackSeconds)) return

    const quizCandidate = adaptiveStrategy.quizEnabled
      ? questionsData.find(
          (question) =>
            question.timestampSeconds <= currentPlaybackSeconds
            && !shownQuizIds.includes(question.id)
            && currentPlaybackSeconds - lastQuizAt >= adaptiveStrategy.quizGap,
        )
      : null

    if (quizCandidate && currentPlaybackSeconds - lastInterventionAt >= Math.max(promptGap, 38)) {
      setShownQuizIds((current) => [...current, quizCandidate.id])
      setActiveQuiz(quizCandidate)
      setQuizSelection(null)
      setQuizOutcome(null)
      playerRef.current?.pauseVideo()
      setLastQuizAt(currentPlaybackSeconds)
      setLastInterventionAt(currentPlaybackSeconds)
      logEvent('quiz_shown', currentPlaybackSeconds)
      return
    }

    const keywordCandidate = PROACTIVE_KEYWORD_EVENTS.find(
      (item) =>
        item.timestampSeconds <= currentPlaybackSeconds
        && !shownKeywordIds.includes(item.id)
        && item.importance >= adaptiveStrategy.keywordThreshold,
    )

    if (keywordCandidate) {
      setShownKeywordIds((current) => [...current, keywordCandidate.id])
      setActiveKeywordPrompt(keywordCandidate)
      setLastInterventionAt(currentPlaybackSeconds)
      logEvent('keyword_shown', currentPlaybackSeconds)
      return
    }

    if (highlightsPaused) return

    // Confidence threshold is frequency-controlled and nudged by adaptive strategy.
    const confidenceThreshold = clamp(
      frequency.confidenceThreshold + adaptiveStrategy.confidenceThresholdOffset,
      0,
      1,
    )
    const visualCandidate = videoHighlights.find(
      (item) =>
        item.startTime <= currentPlaybackSeconds
        && !shownVisualIds.includes(item.id)
        && item.confidence >= confidenceThreshold,
    )

    if (visualCandidate) {
      setShownVisualIds((current) => [...current, visualCandidate.id])
      setActiveVisualCue(visualCandidate)
      setLastInterventionAt(currentPlaybackSeconds)
      logEvent('visual_shown', currentPlaybackSeconds)
    }
  }, [
    activeKeywordPrompt,
    activeQuiz,
    activeVisualCard,
    activeVisualCue,
    adaptiveStrategy,
    highlightsPaused,
    isPlaying,
    lastInterventionAt,
    lastQuizAt,
    currentPlaybackSeconds,
    selectedFrequency,
    shownKeywordIds,
    shownQuizIds,
    shownVisualIds,
    videoHighlights,
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

  useEffect(() => {
    if (!activeVisualCue) return undefined

    const timer = window.setTimeout(() => {
      setInteractionStats((current) => ({ ...current, visualIgnored: current.visualIgnored + 1 }))
      setActiveVisualCue(null)
      logEvent('visual_ignored', currentPlaybackSeconds)
    }, 6500)

    return () => window.clearTimeout(timer)
  }, [activeVisualCue])

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

  const sendMessage = async (nextPrompt = prompt.trim()) => {
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

    try {
      const history = [...chatMessages, userMsg].map(({ role, content }) => ({ role, content }))
      const reply = await callAI(aiProvider, history, currentPlaybackSeconds, sessionIdRef.current, quizHistory)
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

  const handleKeywordResponse = (action) => {
    if (!activeKeywordPrompt) return

    if (action === 'detail') {
      addChatExchange({
        source: 'Keyword prompt',
        title: `${activeKeywordPrompt.term} • ${formatTime(currentPlaybackSeconds)}`,
        userMessage: activeKeywordPrompt.detailPrompt,
        assistantMessage: buildKeywordExplanation(activeKeywordPrompt, currentPlaybackSeconds),
      })
      setInteractionStats((current) => ({
        ...current,
        keywordOpened: current.keywordOpened + 1,
        detailRequests: current.detailRequests + 1,
      }))
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

  const openVisualCard = () => {
    if (!activeVisualCue) return
    setInteractionStats((current) => ({ ...current, visualOpened: current.visualOpened + 1 }))
    setActiveVisualCard(activeVisualCue)
    setActiveVisualCue(null)
    playerRef.current?.pauseVideo()
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
      logEvent('visual_saved', currentPlaybackSeconds)
    }

    if (action === 'detail') {
      addChatExchange({
        source: 'Visual detail',
        title: `${activeVisualCard.title} • ${formatTime(currentPlaybackSeconds)}`,
        userMessage: activeVisualCard.detailPrompt,
        assistantMessage: buildVisualExplanation(activeVisualCard, currentPlaybackSeconds),
      })
      setInteractionStats((current) => ({
        ...current,
        detailRequests: current.detailRequests + 1,
      }))
      logEvent('visual_detail', currentPlaybackSeconds)
    }

    if (action === 'close') {
      logEvent('visual_closed', currentPlaybackSeconds)
    }

    setActiveVisualCard(null)
    playerRef.current?.playVideo()
  }

  const skipQuiz = () => {
    setInteractionStats((current) => ({ ...current, quizSkipped: current.quizSkipped + 1 }))
    logEvent('quiz_skipped', currentPlaybackSeconds)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    playerRef.current?.playVideo()
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
    logEvent(isCorrect ? 'quiz_correct' : 'quiz_wrong', currentPlaybackSeconds)
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
    playerRef.current?.playVideo()
  }

  const resumeAfterQuiz = () => {
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    playerRef.current?.playVideo()
  }

  const seekTo = (seconds) => {
    if (activeQuiz) return
    const player = playerRef.current
    if (player && typeof player.seekTo === 'function') {
      player.seekTo(Math.max(0, seconds), true)
      setCurrentPlaybackSeconds(Math.max(0, seconds))
    }
    setActiveKeywordPrompt(null)
    setActiveVisualCue(null)
    if (activeVisualCard) {
      setActiveVisualCard(null)
      player?.playVideo()
    }
  }

  const stepPlayback = (deltaSeconds) => {
    const p = playerRef.current
    seekTo(Math.max(0, (p?.getCurrentTime?.() ?? currentPlaybackSeconds) + deltaSeconds))
  }

  // ── Custom overlay controls ──────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    isPlayingRef.current ? p.pauseVideo() : p.playVideo()
  }, [])

  const seekRelative = useCallback((delta) => {
    const p = playerRef.current
    if (!p) return
    const t = Math.max(0, (p.getCurrentTime() || 0) + delta)
    p.seekTo(t, true)
    setCurrentPlaybackSeconds(t)
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
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const t = ratio * duration
    setCurrentPlaybackSeconds(t)
    playerRef.current?.seekTo(t, true)
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
    const p = playerRef.current
    if (!p) return
    setVolume(val)
    p.setVolume(val)
    if (val === 0) { p.mute(); setIsMuted(true) }
    else if (isMuted) { p.unMute(); setIsMuted(false) }
  }

  const toggleMute = () => {
    const p = playerRef.current
    if (!p) return
    if (isMuted) {
      p.unMute()
      setIsMuted(false)
      if (volume === 0) { setVolume(50); p.setVolume(50) }
    } else {
      p.mute()
      setIsMuted(true)
    }
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
    playerRef.current?.pauseVideo?.()
    playerRef.current?.seekTo?.(0, true)

    // Reset all AI + chat state
    setChatMessages([])
    setAiError(null)
    setPrompt('')
    setIsLoading(false)
    setQuizHistory([])

    // Reset all proactive intervention state
    setActiveKeywordPrompt(null)
    setActiveVisualCue(null)
    setActiveVisualCard(null)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setShownKeywordIds([])
    setShownVisualIds([])
    setShownQuizIds([])
    setLastInterventionAt(-45)
    setLastQuizAt(-Infinity)
    setSavedVisualCards([])
    setLaterQueue([])
    setInteractionStats({ dismissed: 0, detailed: 0, quizCorrect: 0, quizTotal: 0 })

    // Reset participant
    setParticipantId('')

    // Create a fresh session
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: 'proactive-neural-networks',
        videoTitle: 'The Essential Main Ideas of Neural Networks',
      }),
    })
      .then((r) => r.json())
      .then((data) => { sessionIdRef.current = data.id })
      .catch(() => {})
  }

  const cyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate)
    const nextIndex = currentIndex === PLAYBACK_SPEEDS.length - 1 ? 0 : currentIndex + 1
    const next = PLAYBACK_SPEEDS[nextIndex]
    setPlaybackRate(next)
    playerRef.current?.setPlaybackRate(next)
  }

  const visibleSavedCards = savedVisualCards.slice(-2)
  const visibleLaterQueue = laterQueue.slice(-2)

  return (
    <div className="proactive-app">
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
            <div className="lp-settings-anchor">
              <button
                ref={gearBtnRef}
                className={`lp-icon-btn${showSettings ? ' lp-icon-btn-active' : ''}`}
                type="button"
                aria-label="Settings"
                aria-expanded={showSettings}
                onClick={() => setShowSettings((v) => !v)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {showSettings && (
                <div ref={settingsPanelRef} className="lp-settings-panel" role="dialog" aria-label="Settings">
                  <p className="lp-settings-label">Player controls</p>
                  <div className="lp-settings-seg">
                    <button
                      type="button"
                      className={`lp-seg-opt${playerControlsMode === 'custom' ? ' lp-seg-active' : ''}`}
                      onClick={() => switchPlayerControls('custom')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                      Custom
                    </button>
                    <button
                      type="button"
                      className={`lp-seg-opt${playerControlsMode === 'native' ? ' lp-seg-active' : ''}`}
                      onClick={() => switchPlayerControls('native')}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                        <path d="M8 10l2.5 2.5L8 15M12 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      YouTube
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="lp-user-avatar" aria-label="User profile">
              P
            </div>
          </div>
        </aside>

        <main className="main-panel" ref={mainColumnRef} onScroll={handleMainScroll}>
          <section className={`player-card${isCompact ? ' player-card-compact' : ''}`}>
            <div
              ref={playerStageRef}
              className={`player-stage${playerControlsMode === 'custom' && !showControls ? ' player-nocursor' : ''}${activeQuiz || activeVisualCard ? ' is-dimmed' : ''}`}
              onMouseMove={handleStageMouseMove}
              onMouseLeave={handleStageMouseLeave}
            >
              <div ref={playerHostRef} className="lp-youtube-player" />

              {/* Click capture — only in custom controls mode */}
              {playerControlsMode === 'custom' && (
                <div className="lp-player-click-capture" onClick={togglePlay} aria-hidden="true" />
              )}

              {/* Custom controls overlay — hidden in native mode */}
              {playerControlsMode === 'custom' && (
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
                                playerRef.current?.setPlaybackRate(r)
                                setPlaybackRate(r)
                                setShowSpeedMenu(false)
                              }}
                            >
                              {r === 1 ? 'Normal' : `${r}×`}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" className="lp-ctrl-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                      {isFullscreen ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              )}

              {activeVisualCue ? (
                <button
                  className="visual-cue"
                  type="button"
                  style={{
                    left:   `${activeVisualCue.x      * 100}%`,
                    top:    `${activeVisualCue.y      * 100}%`,
                    width:  `${activeVisualCue.width  * 100}%`,
                    height: `${activeVisualCue.height * 100}%`,
                  }}
                  aria-label={`Open explanation for ${activeVisualCue.title}`}
                  onClick={openVisualCard}
                >
                  <span />
                </button>
              ) : null}

              {activeKeywordPrompt ? (
                <article className="proactive-alert">
                  <div className="proactive-alert-header">
                    <div className="proactive-alert-title">
                      <img src={brandIcon} alt="" />
                      <h2>{activeKeywordPrompt.term}</h2>
                    </div>
                    <button
                      className="icon-dismiss"
                      type="button"
                      aria-label="Dismiss proactive prompt"
                      onClick={() => handleKeywordResponse('close')}
                    >
                      <CloseIcon />
                    </button>
                  </div>

                  <p>{activeKeywordPrompt.reason}</p>

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
                <article className="visual-detail-card">
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

              {activeQuiz ? (
                <div className="quiz-overlay">
                  <article className="quiz-card">
                    <div className="quiz-card-header">
                      <span className="overlay-kicker">Quick check</span>
                      <h2>{activeQuiz.question}</h2>
                    </div>

                    <div className="quiz-options">
                      {activeQuiz.options.map((option, index) => {
                        let className = 'quiz-option'

                        if (quizOutcome) {
                          if (index === activeQuiz.correctIndex) className += ' is-correct'
                          else if (index === quizSelection) className += ' is-wrong'
                        } else if (index === quizSelection) {
                          className += ' is-selected'
                        }

                        return (
                          <button
                            key={option}
                            className={className}
                            type="button"
                            disabled={!!quizOutcome}
                            onClick={() => setQuizSelection(index)}
                          >
                            <span>{String.fromCharCode(65 + index)}</span>
                            {option}
                          </button>
                        )
                      })}
                    </div>

                    {quizOutcome ? (
                      <>
                        <div className={`quiz-feedback${quizOutcome.isCorrect ? ' is-correct' : ' is-wrong'}`}>
                          <strong>{quizOutcome.isCorrect ? 'Correct' : 'Incorrect'}</strong>
                          <p>{activeQuiz.explanation}</p>
                        </div>
                        <div className="quiz-actions">
                          <button className="button-secondary" type="button" onClick={resumeAfterQuiz}>
                            Resume
                          </button>
                          <button className="button-primary" type="button" onClick={explainQuizInAskPal}>
                            Explain in Ask Pal
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="quiz-actions">
                        <button className="button-secondary" type="button" onClick={skipQuiz}>
                          Skip
                        </button>
                        <button
                          className="button-primary"
                          type="button"
                          disabled={quizSelection === null}
                          onClick={submitQuiz}
                        >
                          Submit
                        </button>
                      </div>
                    )}
                  </article>
                </div>
              ) : null}
            </div>

          </section>

          <section className="highlights-card">
            <div className="section-header">
              <div className="section-title">
                <BullseyeIcon />
                <h2>Explore highlights</h2>
              </div>

              <button
                className="button-secondary section-button"
                type="button"
                onClick={() => setHighlightsPaused((current) => !current)}
              >
                {highlightsPaused ? 'Resume' : 'Pause'}
              </button>
            </div>

            <div className="highlights-note">
              <InfoIcon />
              <p>
                {highlightsPaused
                  ? 'Visual monitoring is paused. Transcript and checkpoint logic continue running in the background.'
                  : 'Parts of the video are highlighted as this lesson progresses. Open any highlighted region to understand diagrams, labels and any visual details which you need to clarify.'}
              </p>
            </div>

            <div className="highlight-context">
              <span className="highlight-context-label">Current visual anchor</span>
              <p>{currentHighlightAnchor?.text ?? 'Watching for a diagram or region worth surfacing.'}</p>
            </div>

            <div className="frequency-row">
              <span>Frequency</span>
              <div className="frequency-pills" role="list" aria-label="Highlight frequency">
                {FREQUENCY_OPTIONS.map((option) => (
                  <button
                    key={option}
                    className={`frequency-pill${selectedFrequency === option ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => setSelectedFrequency(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {visibleLaterQueue.length > 0 || visibleSavedCards.length > 0 ? (
              <div className="support-memory">
                {visibleLaterQueue.length > 0 ? (
                  <div className="memory-block">
                    <span>Later queue</span>
                    <div className="memory-chip-list">
                      {visibleLaterQueue.map((item) => (
                        <button
                          key={item.id}
                          className="memory-chip"
                          type="button"
                          onClick={() => addChatExchange({
                            source: 'Later queue',
                            title: `${item.term} • revisit`,
                            userMessage: `Revisit ${item.term}`,
                            assistantMessage: buildKeywordExplanation(item, currentPlaybackSeconds),
                          })}
                        >
                          {item.term}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {visibleSavedCards.length > 0 ? (
                  <div className="memory-block">
                    <span>Saved cards</span>
                    <div className="memory-chip-list">
                      {visibleSavedCards.map((item) => (
                        <button
                          key={item.id}
                          className="memory-chip"
                          type="button"
                          onClick={() => addChatExchange({
                            source: 'Saved visual',
                            title: `${item.title} • revisit`,
                            userMessage: `Revisit the saved visual detail for ${item.title}`,
                            assistantMessage: buildVisualExplanation(item, currentPlaybackSeconds),
                          })}
                        >
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="transcript-card">
            <div className="section-title section-title-simple">
              <h2>Transcripts</h2>
            </div>

            <div className="transcript-divider" />

            <div className="transcript-list">
              {transcriptWindow.map((row) => (
                <button
                  key={row.id}
                  className={`transcript-row${row.id === transcriptRows[activeTranscriptIndex]?.id ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => seekTo(row.seconds)}
                >
                  <p className="transcript-time">{row.time}</p>
                  <p className="transcript-copy">{row.text}</p>
                </button>
              ))}
            </div>
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
              {PROVIDER_LABELS[aiProvider]}
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
                <div className="chat-context-banner">
                  <span>Current concept</span>
                  <p>{getCurrentConceptSummary(currentPlaybackSeconds)}</p>
                </div>
              </>
            ) : (
              <div className="lp-snap-chat-flow">
                {/* Proactive-specific context banner */}
                <div className="chat-context-banner">
                  <span>Current concept</span>
                  <p>{getCurrentConceptSummary(currentPlaybackSeconds)}</p>
                </div>

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
              <div className="lp-suggestions-wrap">
                <h4>Quick suggestions</h4>
                {QUICK_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="lp-suggestion-chip"
                    onClick={() => sendMessage(s)}
                    disabled={isLoading}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className="lp-ai-disclaimer">Pal can make mistakes. Always verify important information.</p>
        </aside>
      </div>

      {/* Researcher panel — fixed top-right, fades unless hovered */}
      <div className="lp-researcher-panel">
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
          href="/api/export"
          target="_blank"
          rel="noreferrer"
        >
          Export CSV
        </a>
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

function BullseyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.8" />
      <circle cx="10" cy="10" r="3.8" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 8.5v4.2M10 6.2h.01" />
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
