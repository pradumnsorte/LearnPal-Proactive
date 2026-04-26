import { Router } from 'express'
import db from '../db.js'

const router = Router()

router.get('/', (req, res) => {
  const sessions = db.prepare('SELECT * FROM sessions ORDER BY created_at ASC').all()

  const rows = sessions.map((s) => {
    const messageCount = db.prepare(
      'SELECT COUNT(*) as c FROM messages WHERE session_id = ?'
    ).get(s.id).c

    const quizTotal = db.prepare(
      'SELECT COUNT(*) as c FROM quiz_attempts WHERE session_id = ?'
    ).get(s.id).c

    const quizCorrect = db.prepare(
      'SELECT COUNT(*) as c FROM quiz_attempts WHERE session_id = ? AND is_correct = 1'
    ).get(s.id).c

    const snapCount = db.prepare(
      'SELECT COUNT(*) as c FROM snaps WHERE session_id = ?'
    ).get(s.id).c

    // Total session duration
    const endEvent = db.prepare(
      'SELECT created_at, playback_seconds FROM events WHERE session_id = ? AND event_type = ? ORDER BY created_at DESC LIMIT 1'
    ).get(s.id, 'session_end')

    const durationSeconds = endEvent
      ? Math.round((new Date(endEvent.created_at) - new Date(s.created_at)) / 1000)
      : null

    // Time to first interaction
    const firstInteraction = db.prepare(
      'SELECT created_at FROM events WHERE session_id = ? AND event_type = ? LIMIT 1'
    ).get(s.id, 'first_interaction')

    const timeToFirstInteraction = firstInteraction
      ? Math.round((new Date(firstInteraction.created_at) - new Date(s.created_at)) / 1000)
      : null

    // Proactive event counts
    const countEvent = (type) =>
      db.prepare('SELECT COUNT(*) as c FROM events WHERE session_id = ? AND event_type = ?')
        .get(s.id, type).c

    const visual_cues_shown       = countEvent('visual_shown')
    const visual_cues_opened      = countEvent('visual_opened')
    const visual_cues_saved       = countEvent('visual_saved')
    const visual_detail_requests  = countEvent('visual_detail')
    const visual_cues_ignored     = countEvent('visual_ignored')
    const keywords_shown          = countEvent('keyword_shown')
    const keywords_opened         = countEvent('keyword_detail')
    const keywords_deferred       = countEvent('keyword_later')
    const keywords_dismissed      = countEvent('keyword_dismissed') + countEvent('keyword_ignored')
    const quizzes_shown           = countEvent('quiz_shown')
    const quizzes_skipped         = countEvent('quiz_skipped')

    return {
      session_id: s.id,
      participant_id: s.participant_id ?? '',
      created_at: s.created_at,
      duration_seconds: durationSeconds ?? '',
      final_video_position: endEvent?.playback_seconds ?? '',
      messages_sent: messageCount,
      snaps_taken: snapCount,
      quiz_attempts: quizTotal,
      quiz_correct: quizCorrect,
      time_to_first_interaction_seconds: timeToFirstInteraction ?? '',
      visual_cues_shown,
      visual_cues_opened,
      visual_cues_saved,
      visual_detail_requests,
      visual_cues_ignored,
      keywords_shown,
      keywords_opened,
      keywords_deferred,
      keywords_dismissed,
      quizzes_shown,
      quizzes_skipped,
    }
  })

  const headers = Object.keys(rows[0] ?? {
    session_id: '', participant_id: '', created_at: '', duration_seconds: '',
    final_video_position: '', messages_sent: '', snaps_taken: '',
    quiz_attempts: '', quiz_correct: '', time_to_first_interaction_seconds: '',
    visual_cues_shown: '', visual_cues_opened: '', visual_cues_saved: '',
    visual_detail_requests: '', visual_cues_ignored: '',
    keywords_shown: '', keywords_opened: '', keywords_deferred: '', keywords_dismissed: '',
    quizzes_shown: '', quizzes_skipped: '',
  })

  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n')

  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="learnpal-sessions.csv"')
  res.send(csv)
})

export default router
