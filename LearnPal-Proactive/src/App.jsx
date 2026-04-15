import { useEffect, useRef, useState } from 'react'
import './App.css'
import transcriptRows from './data/transcript.json'
import glossaryData from './data/glossary.json'
import highlightsData from './data/highlights.json'
import questionsData from './data/questions.json'
import brandIcon from './assets/brand-icon.svg'
import palCharacter from './assets/pal-character.svg'

const VIDEO_FRAME_URL = 'https://www.figma.com/api/mcp/asset/23bfe8ed-0e49-430f-a6b4-8d5ccbb148c5'
const VIDEO_DURATION_SECONDS = Math.max(
  1080,
  Math.ceil((transcriptRows[transcriptRows.length - 1]?.seconds ?? 720) / 30) * 30,
)
const INITIAL_PLAYBACK_SECONDS = 222

const QUICK_SUGGESTIONS = [
  'Give me a summary in simple terms',
  'Explain the topic in simple terms',
  'Explain with real life example',
]

const FREQUENCY_OPTIONS = ['Low', 'medium', 'High']
const PLAYBACK_SPEEDS = [1, 1.25, 1.5]

const FREQUENCY_CONFIG = {
  Low: { visualThreshold: 3, promptGap: 60 },
  medium: { visualThreshold: 2, promptGap: 42 },
  High: { visualThreshold: 1, promptGap: 28 },
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

const VISUAL_EVENTS = [
  {
    id: 'pv1',
    timestampSeconds: 222,
    salience: 2,
    title: 'Input dosage box',
    summary: 'This square is the input node where the dosage first enters the network.',
    detailPrompt: 'Explain the dosage input box and why it matters',
    detailExplanation: 'The dosage value enters here, then the connection labels show how that one number is transformed before the hidden nodes bend it into new shapes.',
    region: { left: 12, top: 50, width: 7, height: 14 },
  },
  {
    id: 'pv2',
    timestampSeconds: 229,
    salience: 3,
    title: 'Top hidden node',
    summary: 'This hidden node is one of the curved building blocks that help produce the final squiggle.',
    detailPrompt: 'Explain the top hidden node in the diagram',
    detailExplanation: 'That node takes the transformed dosage, runs it through an activation function, and contributes one shaped curve to the final prediction.',
    region: { left: 33, top: 28, width: 8, height: 15 },
  },
  {
    id: 'pv3',
    timestampSeconds: 238,
    salience: 2,
    title: 'Output node',
    summary: 'This final green circle combines earlier pieces into the network output.',
    detailPrompt: 'Explain how the output node combines the hidden nodes',
    detailExplanation: 'The output node sums the hidden-node contributions and applies the final bias, producing the green squiggle that predicts effectiveness.',
    region: { left: 59, top: 55, width: 7, height: 11 },
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

  let visualThresholdOffset = 0
  if (stats.visualIgnored >= 2 && stats.visualOpened === 0) visualThresholdOffset = 1
  if (stats.visualOpened >= 2) visualThresholdOffset = -1

  const quizGap = stats.quizSkipped >= 2 ? 240 : 135
  const quizEnabled = stats.quizSkipped < 4

  return { keywordThreshold, promptGapBonus, visualThresholdOffset, quizGap, quizEnabled }
}

const buildKeywordExplanation = (item, currentSeconds) => {
  const glossaryEntry = findGlossaryEntry(item.term)
  const currentConcept = getCurrentConceptSummary(currentSeconds)
  return `${glossaryEntry?.definition ?? item.fallbackExplanation} Right now the lesson is focused on ${currentConcept.toLowerCase()}.`
}

const buildVisualExplanation = (item, currentSeconds) => {
  const currentConcept = getCurrentConceptSummary(currentSeconds)
  return `${item.detailExplanation} This matters now because the speaker is walking through ${currentConcept.toLowerCase()}.`
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

const buildManualReply = (message, currentSeconds) => {
  const normalizedMessage = normalizeText(message)
  const recentHighlights = highlightsData
    .filter((item) => item.timestampSeconds <= currentSeconds)
    .slice(-3)
  const glossaryMatch = glossaryData.find((entry) => {
    const normalizedEntry = normalizeText(entry.term)
    return normalizedMessage.includes(normalizedEntry)
      || normalizedEntry
        .split(' ')
        .filter((word) => word.length > 4)
        .some((word) => normalizedMessage.includes(word))
  })

  if (normalizedMessage.includes('summary')) {
    const summary = recentHighlights.map((item) => item.text).join(' ')
    return summary || 'So far the lesson has introduced neural networks as a way to fit useful curved patterns instead of forcing a straight line.'
  }

  if (glossaryMatch) {
    return `${glossaryMatch.term}: ${glossaryMatch.definition} In this part of the lesson, that idea supports ${getCurrentConceptSummary(currentSeconds).toLowerCase()}.`
  }

  if (normalizedMessage.includes('real life') || normalizedMessage.includes('example')) {
    return 'Think of the network like tuning a recipe: each node adjusts the ingredient a little differently, and the final taste tells you whether the combination worked.'
  }

  return `Right now the lesson is focused on ${getCurrentConceptSummary(currentSeconds).toLowerCase()}. The main idea is that each node transforms the signal so the final output can match the pattern in the data.`
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

const SERVER_URL = 'http://localhost:3003'

function App() {
  const [selectedFrequency, setSelectedFrequency] = useState('medium')
  const [highlightsPaused, setHighlightsPaused] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [savedVisualCards, setSavedVisualCards] = useState([])
  const [laterQueue, setLaterQueue] = useState([])
  const [playbackSeconds, setPlaybackSeconds] = useState(INITIAL_PLAYBACK_SECONDS)
  const [isPlaying, setIsPlaying] = useState(true)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [activeKeywordPrompt, setActiveKeywordPrompt] = useState(null)
  const [activeVisualCue, setActiveVisualCue] = useState(null)
  const [activeVisualCard, setActiveVisualCard] = useState(null)
  const [activeQuiz, setActiveQuiz] = useState(null)
  const [quizSelection, setQuizSelection] = useState(null)
  const [quizOutcome, setQuizOutcome] = useState(null)
  const [shownKeywordIds, setShownKeywordIds] = useState([])
  const [shownVisualIds, setShownVisualIds] = useState([])
  const [shownQuizIds, setShownQuizIds] = useState([])
  const [lastInterventionAt, setLastInterventionAt] = useState(INITIAL_PLAYBACK_SECONDS - 45)
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

  const progressRef = useRef(null)
  const sessionIdRef = useRef(null)

  const logEvent = (eventType, atSeconds) => {
    if (!sessionIdRef.current) return
    fetch(`${SERVER_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        eventType,
        playbackSeconds: Math.floor(atSeconds ?? 0),
      }),
    }).catch(() => {})
  }

  const activeTranscriptIndex = getActiveTranscriptIndex(playbackSeconds)
  const transcriptWindow = transcriptRows.slice(
    Math.max(0, activeTranscriptIndex - 1),
    Math.min(transcriptRows.length, activeTranscriptIndex + 5),
  )
  const currentHighlightAnchor = getCurrentHighlightAnchor(playbackSeconds)
  const adaptiveStrategy = buildAdaptiveStrategy(interactionStats)
  const playbackProgress = (playbackSeconds / VIDEO_DURATION_SECONDS) * 100
  const systemState = activeQuiz
    ? 'Checkpoint quiz'
    : activeVisualCard
      ? 'Expanded support'
      : activeKeywordPrompt
        ? 'Keyword prompt'
        : activeVisualCue
          ? 'Visual highlight'
          : 'Passive watching'

  useEffect(() => {
    if (!isPlaying || activeQuiz) return undefined

    const timer = window.setInterval(() => {
      setPlaybackSeconds((current) => clamp(current + playbackRate, 0, VIDEO_DURATION_SECONDS))
    }, 1000)

    return () => window.clearInterval(timer)
  }, [isPlaying, playbackRate, activeQuiz])

  useEffect(() => {
    if (playbackSeconds >= VIDEO_DURATION_SECONDS) setIsPlaying(false)
  }, [playbackSeconds])

  useEffect(() => {
    fetch(`${SERVER_URL}/api/sessions`, {
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
    if (playbackSeconds - lastInterventionAt < promptGap) return

    // §3.4 — do not interrupt if the transcript is too dense at this moment
    if (isTranscriptDense(playbackSeconds)) return

    const quizCandidate = adaptiveStrategy.quizEnabled
      ? questionsData.find(
          (question) =>
            question.timestampSeconds <= playbackSeconds
            && !shownQuizIds.includes(question.id)
            && playbackSeconds - lastQuizAt >= adaptiveStrategy.quizGap,
        )
      : null

    if (quizCandidate && playbackSeconds - lastInterventionAt >= Math.max(promptGap, 38)) {
      setShownQuizIds((current) => [...current, quizCandidate.id])
      setActiveQuiz(quizCandidate)
      setQuizSelection(null)
      setQuizOutcome(null)
      setIsPlaying(false)
      setLastQuizAt(playbackSeconds)
      setLastInterventionAt(playbackSeconds)
      logEvent('quiz_shown', playbackSeconds)
      return
    }

    const keywordCandidate = PROACTIVE_KEYWORD_EVENTS.find(
      (item) =>
        item.timestampSeconds <= playbackSeconds
        && !shownKeywordIds.includes(item.id)
        && item.importance >= adaptiveStrategy.keywordThreshold,
    )

    if (keywordCandidate) {
      setShownKeywordIds((current) => [...current, keywordCandidate.id])
      setActiveKeywordPrompt(keywordCandidate)
      setLastInterventionAt(playbackSeconds)
      logEvent('keyword_shown', playbackSeconds)
      return
    }

    if (highlightsPaused) return

    const visualThreshold = clamp(
      frequency.visualThreshold + adaptiveStrategy.visualThresholdOffset,
      1,
      3,
    )
    const visualCandidate = VISUAL_EVENTS.find(
      (item) =>
        item.timestampSeconds <= playbackSeconds
        && !shownVisualIds.includes(item.id)
        && item.salience >= visualThreshold,
    )

    if (visualCandidate) {
      setShownVisualIds((current) => [...current, visualCandidate.id])
      setActiveVisualCue(visualCandidate)
      setLastInterventionAt(playbackSeconds)
      logEvent('visual_shown', playbackSeconds)
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
    playbackSeconds,
    selectedFrequency,
    shownKeywordIds,
    shownQuizIds,
    shownVisualIds,
  ])

  useEffect(() => {
    if (!activeKeywordPrompt) return undefined

    const timer = window.setTimeout(() => {
      setInteractionStats((current) => ({ ...current, keywordIgnored: current.keywordIgnored + 1 }))
      setActiveKeywordPrompt(null)
      logEvent('keyword_ignored', playbackSeconds)
    }, 7800)

    return () => window.clearTimeout(timer)
  }, [activeKeywordPrompt])

  useEffect(() => {
    if (!activeVisualCue) return undefined

    const timer = window.setTimeout(() => {
      setInteractionStats((current) => ({ ...current, visualIgnored: current.visualIgnored + 1 }))
      setActiveVisualCue(null)
      logEvent('visual_ignored', playbackSeconds)
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

  const sendMessage = (nextPrompt = prompt.trim()) => {
    if (!nextPrompt) return

    const reply = buildManualReply(nextPrompt, playbackSeconds)
    addChatExchange({
      source: 'Ask Pal',
      title: `Manual question • ${formatTime(playbackSeconds)}`,
      userMessage: nextPrompt,
      assistantMessage: reply,
    })
    setPrompt('')
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
        title: `${activeKeywordPrompt.term} • ${formatTime(playbackSeconds)}`,
        userMessage: activeKeywordPrompt.detailPrompt,
        assistantMessage: buildKeywordExplanation(activeKeywordPrompt, playbackSeconds),
      })
      setInteractionStats((current) => ({
        ...current,
        keywordOpened: current.keywordOpened + 1,
        detailRequests: current.detailRequests + 1,
      }))
      logEvent('keyword_detail', playbackSeconds)
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
      logEvent('keyword_later', playbackSeconds)
    } else {
      setInteractionStats((current) => ({
        ...current,
        keywordIgnored: current.keywordIgnored + 1,
      }))
      logEvent('keyword_dismissed', playbackSeconds)
    }

    setActiveKeywordPrompt(null)
  }

  const openVisualCard = () => {
    if (!activeVisualCue) return
    setInteractionStats((current) => ({ ...current, visualOpened: current.visualOpened + 1 }))
    setActiveVisualCard(activeVisualCue)
    setActiveVisualCue(null)
    setIsPlaying(false)
    logEvent('visual_opened', playbackSeconds)
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
      logEvent('visual_saved', playbackSeconds)
    }

    if (action === 'detail') {
      addChatExchange({
        source: 'Visual detail',
        title: `${activeVisualCard.title} • ${formatTime(playbackSeconds)}`,
        userMessage: activeVisualCard.detailPrompt,
        assistantMessage: buildVisualExplanation(activeVisualCard, playbackSeconds),
      })
      setInteractionStats((current) => ({
        ...current,
        detailRequests: current.detailRequests + 1,
      }))
      logEvent('visual_detail', playbackSeconds)
    }

    if (action === 'close') {
      logEvent('visual_closed', playbackSeconds)
    }

    setActiveVisualCard(null)
    setIsPlaying(true)
  }

  const skipQuiz = () => {
    setInteractionStats((current) => ({ ...current, quizSkipped: current.quizSkipped + 1 }))
    logEvent('quiz_skipped', playbackSeconds)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setIsPlaying(true)
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
    logEvent(isCorrect ? 'quiz_correct' : 'quiz_wrong', playbackSeconds)
  }

  const explainQuizInAskPal = () => {
    if (!activeQuiz || quizSelection === null || !quizOutcome) return

    addChatExchange({
      source: 'Checkpoint quiz',
      title: `Quiz follow-up • ${formatTime(playbackSeconds)}`,
      userMessage: activeQuiz.question,
      assistantMessage: buildQuizExplanation(activeQuiz, quizSelection, playbackSeconds),
    })
    setInteractionStats((current) => ({
      ...current,
      detailRequests: current.detailRequests + 1,
    }))
    logEvent('quiz_detail', playbackSeconds)
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setIsPlaying(true)
  }

  const resumeAfterQuiz = () => {
    setActiveQuiz(null)
    setQuizSelection(null)
    setQuizOutcome(null)
    setIsPlaying(true)
  }

  const seekTo = (seconds) => {
    if (activeQuiz) return
    setPlaybackSeconds(clamp(seconds, 0, VIDEO_DURATION_SECONDS))
    setActiveKeywordPrompt(null)
    setActiveVisualCue(null)
    if (activeVisualCard) {
      setActiveVisualCard(null)
      setIsPlaying(true)
    }
  }

  const stepPlayback = (deltaSeconds) => {
    seekTo(playbackSeconds + deltaSeconds)
  }

  const handleProgressClick = (event) => {
    if (!progressRef.current || activeQuiz) return
    const bounds = progressRef.current.getBoundingClientRect()
    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
    seekTo(ratio * VIDEO_DURATION_SECONDS)
  }

  const cyclePlaybackRate = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate)
    const nextIndex = currentIndex === PLAYBACK_SPEEDS.length - 1 ? 0 : currentIndex + 1
    setPlaybackRate(PLAYBACK_SPEEDS[nextIndex])
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
        <aside className="left-rail" aria-label="Primary navigation">
          <button className="rail-button rail-button-top" type="button" aria-label="Open navigation menu">
            <MenuIcon />
          </button>

          <div className="rail-footer">
            <button className="rail-button" type="button" aria-label="Open settings">
              <SettingsIcon />
            </button>
            <button className="profile-chip" type="button" aria-label="Open profile">
              <img src={brandIcon} alt="" />
            </button>
          </div>
        </aside>

        <main className="main-panel">
          <section className="player-card">
            <div className="player-titlebar">
              <div className="player-title-copy">
                <h1>The Essential Main Ideas of Neural Networks</h1>
                <p>Transcript, visuals, and checkpoint logic are running in the background.</p>
              </div>
              <span className="state-chip">{systemState}</span>
            </div>

            <div className={`player-stage${activeQuiz || activeVisualCard ? ' is-dimmed' : ''}`}>
              <img
                className="player-frame"
                src={VIDEO_FRAME_URL}
                alt="Neural network lesson frame with labelled nodes and diagram annotations"
              />

              {activeVisualCue ? (
                <button
                  className="visual-cue"
                  type="button"
                  style={{
                    left: `${activeVisualCue.region.left}%`,
                    top: `${activeVisualCue.region.top}%`,
                    width: `${activeVisualCue.region.width}%`,
                    height: `${activeVisualCue.region.height}%`,
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

                  <p>{activeVisualCard.summary}</p>

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

            <div className="player-controls">
              <button
                ref={progressRef}
                className="progress-track"
                type="button"
                aria-label="Seek through the lesson"
                onClick={handleProgressClick}
              >
                <span className="progress-fill" style={{ width: `${playbackProgress}%` }} />
              </button>

              <div className="player-controls-row">
                <div className="player-controls-left">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={isPlaying ? 'Pause lesson' : 'Play lesson'}
                    disabled={!!activeQuiz}
                    onClick={() => setIsPlaying((current) => !current)}
                  >
                    <PlayIcon isPlaying={isPlaying} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={isMuted ? 'Unmute lesson' : 'Mute lesson'}
                    onClick={() => setIsMuted((current) => !current)}
                  >
                    <VolumeIcon isMuted={isMuted} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Jump backward ten seconds"
                    onClick={() => stepPlayback(-10)}
                  >
                    <RotateLeftIcon />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Jump forward ten seconds"
                    onClick={() => stepPlayback(10)}
                  >
                    <RotateRightIcon />
                  </button>
                  <span className="timecode">
                    {formatTime(playbackSeconds)} / {formatTime(VIDEO_DURATION_SECONDS)}
                  </span>
                </div>

                <div className="player-controls-right">
                  <button className="icon-button" type="button" aria-label="Captions are available in the transcript panel">
                    <CaptionsIcon />
                  </button>
                  <button className="control-pill" type="button" onClick={cyclePlaybackRate}>
                    {playbackRate}x
                  </button>
                  <button className="control-pill" type="button">
                    {selectedFrequency}
                  </button>
                </div>
              </div>
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
                            assistantMessage: buildKeywordExplanation(item, playbackSeconds),
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
                            assistantMessage: buildVisualExplanation(item, playbackSeconds),
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

        <aside className="chat-panel">
          <div className="chat-panel-header">
            <h2>Ask Pal</h2>
          </div>

          <div className="chat-panel-body">
            <div className="chat-greeting">
              <img className="chat-mascot" src={palCharacter} alt="Pal assistant character" />

              <div className="greeting-bubbles">
                <div className="chat-bubble chat-bubble-light">Hi there,</div>
                <div className="chat-bubble chat-bubble-strong">How can I help you?</div>
              </div>
            </div>

            <div className="chat-context-banner">
              <span>Current concept</span>
              <p>{getCurrentConceptSummary(playbackSeconds)}</p>
            </div>

            {chatMessages.length > 0 ? (
              <div className="chat-history" aria-live="polite">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-history-bubble chat-history-bubble-${message.role}`}
                  >
                    {message.role === 'assistant' && message.title ? (
                      <div className="chat-message-meta">
                        <span>{message.source}</span>
                        <strong>{message.title}</strong>
                      </div>
                    ) : null}
                    <div>{message.content}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="chat-panel-footer">
            <form className="composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="ask-pal-input">
                Ask Pal anything
              </label>
              <input
                id="ask-pal-input"
                name="prompt"
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask me anything..."
              />
              <button className="send-button" type="submit" aria-label="Send prompt">
                <SendIcon />
              </button>
              <button className="mic-button" type="button" aria-label="Use microphone">
                <MicIcon />
              </button>
            </form>

            <section className="suggestions-card" aria-label="Quick suggestions">
              <h3>Quick suggestions</h3>
              <div className="suggestion-list">
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="suggestion-chip"
                    type="button"
                    onClick={() => sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  )
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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

function SendIcon() {
  return (
    <svg viewBox="0 0 21 24" aria-hidden="true">
      <path d="M2 21 19 12 2 3l3.6 7L2 21Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 18 24" aria-hidden="true">
      <rect x="5.3" y="2.5" width="7.4" height="11" rx="3.7" />
      <path d="M3.5 10.6a5.5 5.5 0 0 0 11 0M9 16.2v4.3M6 20.5h6" />
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
