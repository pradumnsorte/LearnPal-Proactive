# Screenshot Checklist

Capture these manually with your OS screenshot tool (Cmd-Shift-4 on macOS for region capture; Cmd-Shift-5 for window capture). Save each PNG to this directory using the suggested filename so the report sections can reference them in order.

For each prototype, start the backend + frontend, dismiss the participant modal with a temporary ID like `DEMO`, and let the video play to the indicated point before capturing. Keep the browser window at 1440 × 900 or wider — narrower viewports hide the chat sidebar.

---

## Intermittent (`LearnPal`, frontend on http://localhost:5173)

| File | What to show | How to set up |
|---|---|---|
| `2a-A-default.png` | Default-viewing state with empty chat suggestions | Dismiss modal; pause at ~0:05 so the player is shown but transcript hasn't moved much |
| `2a-B-snap-confirm.png` | Snap selection-confirm card with a region drawn on the player | Click *Select Area*, drag a box on the diagram, capture the screen *before* clicking *Ask Pal* |
| `2a-C-snap-chat.png` | A completed snap exchange in chat (user chip with thumbnail above, AI reply below) | After sending a snap, scroll to the bottom of chat |
| `2a-D-quiz-question.png` | Quiz modal mid-question (4 options, no answer selected) | Click *Start Quiz*; wait for the question; capture before selecting |
| `2a-E-quiz-feedback.png` | Quiz feedback state with explanation visible | Submit any answer; capture the green/red highlight + explanation |

---

## Continuous (`LearnPal-Continuous`, frontend on http://localhost:5174)

| File | What to show | How to set up |
|---|---|---|
| `2b-A-default-populated.png` | Ambient state with glossary populated, ≥1 highlight, ≥1 question in feed | Let the video play for ~3–4 minutes; capture once all three feeds have content |
| `2b-B-glossary-controls.png` | Glossary panel header with *Stop* button and provider toggle visible | Hover over the glossary header |
| `2b-C-feed-question.png` | Live question card with options visible (no answer yet) | Scroll the question feed to the latest unanswered question |
| `2b-D-region-overlay.png` *(optional)* | Concentric region marker dot animating on the video | Catch a region overlay during its ~4 s lifetime; takes patience |
| `2b-E-feed-answered.png` | Feed question after submitting an answer (green/red indication + Explain CTA) | Submit any feed answer |
| `2b-F-chat-context.png` | Chat showing AI reply that references a previously surfaced term | After several glossary terms have appeared, ask "explain X in more detail" |

---

## Proactive (`LearnPal-Proactive`, frontend on http://localhost:5175)

| File | What to show | How to set up |
|---|---|---|
| `2c-A-keyword-popup.png` | Numbered keyword popup visible bottom-right of player | Wait for the first keyword popup; capture within the 7.8 s window |
| `2c-B-region-overlay.png` | Pulsing amber region dot active on the video frame | Wait for a region; capture during the 5 s playback-time window |
| `2c-C-region-card.png` | Visual detail card open after clicking a region | Click a region overlay; capture the modal card |
| `2c-D-pop-quiz.png` | Pop quiz modal mid-question with frequency pill toggle visible | Wait for `quizInterval` to elapse (60 / 102 / 180 s depending on setting) |
| `2c-E-pop-quiz-feedback.png` | Pop quiz after submitting (correct/wrong + explanation) | Submit any answer |
| `2c-F-keyword-log.png` | Keyword log panel expanded, showing numbered + pinned keywords | After several keywords have surfaced, click the corner button |
| `2c-G-frequency-toast.png` *(optional)* | Auto-downgrade toast with 5 s countdown | Skip two pop quizzes in a row; capture during the countdown |

---

## Tips

- For the keyword popup and region-overlay shots, consider using **screen recording** (`Cmd-Shift-5 → Record selected portion`) and grabbing a still from the recording. Easier than catching the precise frame live.
- For Continuous + Proactive populated states, the AI provider must be responding. If the toggle is on Ollama and the local server isn't running, no content will surface. Use Azure or Groq for these captures.
- Keep the participant modal ID consistent (e.g., `DEMO`) so the screenshots don't accidentally show real participant IDs.
- After capturing, `git add` is unnecessary — `report/screenshots/` is fine to leave untracked or add to `.gitignore` depending on whether you want them in the repo.
