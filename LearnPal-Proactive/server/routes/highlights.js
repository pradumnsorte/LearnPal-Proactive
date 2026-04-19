import { Router } from 'express'

const router = Router()

/**
 * Mock highlight data for the neural networks video.
 * Each entry follows the VideoHighlight schema so a future AI/vision pipeline
 * can replace this data without changing the API contract.
 *
 * Coordinates (x, y, width, height) are normalized 0–1 relative to video frame.
 * confidence: 0–1 float; used by the frontend to apply frequency filtering.
 * detailPrompt: the question injected into Ask Pal when the learner clicks Detail.
 */
const HIGHLIGHTS_BY_VIDEO = {
  'neural-networks': [
    {
      id: 'h1',
      videoId: 'neural-networks',
      startTime: 218,
      endTime: 235,
      x: 0.12,
      y: 0.50,
      width: 0.07,
      height: 0.14,
      title: 'Input dosage box',
      shortExplanation:
        'This square is the input node where the dosage first enters the network.',
      detailedExplanation:
        'The dosage value enters here, then the connection labels show how that one number is transformed before the hidden nodes bend it into new shapes.',
      detailPrompt: 'Explain the dosage input box and why it matters in this neural network',
      type: 'diagram',
      confidence: 0.92,
    },
    {
      id: 'h2',
      videoId: 'neural-networks',
      startTime: 226,
      endTime: 245,
      x: 0.33,
      y: 0.28,
      width: 0.08,
      height: 0.15,
      title: 'Top hidden node',
      shortExplanation:
        'This hidden node is one of the curved building blocks that produce the final squiggle.',
      detailedExplanation:
        'That node takes the transformed dosage, runs it through an activation function, and contributes one shaped curve to the final prediction.',
      detailPrompt: 'Explain the top hidden node in the neural network diagram',
      type: 'diagram',
      confidence: 0.87,
    },
    {
      id: 'h3',
      videoId: 'neural-networks',
      startTime: 235,
      endTime: 255,
      x: 0.59,
      y: 0.55,
      width: 0.07,
      height: 0.11,
      title: 'Output node',
      shortExplanation:
        'This final green circle combines earlier pieces into the network output.',
      detailedExplanation:
        'The output node sums the hidden-node contributions and applies the final bias, producing the green squiggle that predicts effectiveness.',
      detailPrompt: 'Explain how the output node combines the hidden nodes into a final prediction',
      type: 'diagram',
      confidence: 0.95,
    },
  ],
}

/**
 * GET /api/videos/:videoId/highlights
 * Returns all highlights for a video.
 *
 * Optional query param: ?time=<seconds>
 * When provided, returns only highlights whose [startTime, endTime] window
 * contains the given playback position.
 */
router.get('/:videoId/highlights', (req, res) => {
  const { videoId } = req.params
  const highlights = HIGHLIGHTS_BY_VIDEO[videoId] ?? []

  const { time } = req.query
  if (time !== undefined) {
    const t = parseFloat(time)
    if (!Number.isFinite(t)) {
      return res.status(400).json({ error: 'time must be a finite number' })
    }
    return res.json(highlights.filter((h) => h.startTime <= t && h.endTime >= t))
  }

  res.json(highlights)
})

export default router
