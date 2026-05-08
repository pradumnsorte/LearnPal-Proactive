# Section 4: Implementation Rationale, Trade-offs, and Limitations

This final section steps back from the prototypes themselves to discuss the choices behind them: what was deliberately accepted as a trade-off, and where the design has known limitations. Many of the most consequential decisions in a design project are not visible in the artefact itself, and they are documented here for completeness.

## 4.1 Why three apps instead of one with toggles

The most obvious alternative architecture would have been a single application with a setting that changes its behaviour. Three separate apps were built instead, for three reasons.

**It removes contamination.** A toggle would let participants flip mid-session, producing data points that are mixtures of paradigms. Three separate apps make the condition a fixed property of the deployment; once a participant lands on Continuous, they stay on Continuous.

**It makes the design claims visible in the code.** Intermittent has no `/api/analyse` route at all; its codebase is genuinely smaller. The architectural claim ("Intermittent has no background AI loop") is concrete in the file system rather than parameterised away.

**It allowed the three to evolve independently.** During pilot work, each prototype needed different fixes. The anti-recall quiz prompt landed in all three. The keyword blocklist landed in Continuous and Proactive only. Region strictness only matters in Proactive. Separate repositories let each fix land without re-validating the other two.

The cost is real code duplication: chat, quiz, sessions, events, export, and the participant modal flow are nearly identical across all three. Duplication was chosen over premature abstraction because these are study artefacts, not a product. If a single paradigm wins clearly in the user study, the next iteration would consolidate them.

## 4.2 Holding everything else constant

To isolate the paradigm as the variable actually being tested, everything else was kept constant.

| What was held constant | Why |
|---|---|
| Same video (StatQuest, *The Essential Main Ideas of Neural Networks*, ~17 min) | Different videos would mean different content density, different visual style, different speaking pace, all confounds. |
| Same transcript (static `.json` file) | Removes any variance from live transcription quality. |
| Same set of AI providers, same default | The provider's behaviour should not be a hidden variable in the comparison. |
| Same token caps, same JSON-mode flags | Aligned where the provider supports them. |
| Same English-only setup | Language-handling differences would dominate the data. |

Anything different that the participants experience, including different engagement and different learning outcomes, can therefore be attributed to the paradigm itself, not to model quality, content, or production values.

## 4.3 The little things that turn out to matter

Three small details, each of which broke the data in early pilots, are worth flagging because they would be easy to miss when reading the code.

**Skipping the participant modal must NOT create a session.** In the first pilot, sessions were saved with `participant_id = NULL` whenever the modal was dismissed during testing. The fix was to introduce a separate state, *modal dismissed*, that prevents session creation while still letting the UI be explored.

**Reset must NOT immediately create a new session.** When a Reset button was added, it eagerly created the next participant's session right away. This produced two awkward effects: a row in the database for every reset performed in testing, and occasional double-rows for the same participant. The fix was to make Reset return to the modal state and only create a session on confirmation.

**`first_interaction` must fire exactly once.** The earliest version logged a "first interaction" event on incidental things, like the first transcript scroll. The gate was tightened to fire only on the first deliberate engagement (first quiz, first chat, first snap), and to suppress all subsequent firings.

These are small bugs, but each of them would have invalidated some measurements if not caught early. They are documented here because they are the kind of decision that would otherwise have to be reconstructed from `git log`.

## 4.4 Why the local MP4

An earlier version of all three prototypes used the YouTube embedded player. Two problems pushed the design off it.

**Frame capture is impossible.** The two prototypes that need to send video frames to the AI (Continuous and Proactive) need to read pixels from the video element. YouTube's embedded player blocks this for security reasons. Without frame capture, the on-screen region overlays in Proactive disappear entirely, and the equivalent feature in Continuous degrades from "look here" markers to text-only highlights.

**Reliability.** The video occasionally returned "Video unavailable" mid-session for reasons outside our control. The participant's session would just freeze. Switching to a local MP4 file removes this entirely.

The trade-off is asset weight: the MP4 is gitignored and has to be present on the local machine. The deployment instructions for the study include a one-line copy step.

## 4.5 Why fullscreen is disabled

The side panels (chat, glossary, highlights, question feed, keyword log) are *the paradigm*. A participant who watches the video full-screen has effectively collapsed every prototype into the same Passive-ICAP experience, and the paradigm distinction is lost in the data. Disabling fullscreen with an explanatory tooltip preserves the comparison.

This is a study-design choice, not a technical limitation. A real product built on any single paradigm would re-enable fullscreen.

## 4.6 The trade-offs knowingly accepted

| Choice | Trade-off |
|---|---|
| LLM-only generation, not curated content | Better generalisation to other videos at the cost of occasional weak items. Mitigated by blocklists, dedup, and the anti-recall rule. |
| One video for the whole study | Strong internal validity, but the paradigm differences cannot be claimed to generalise. |
| English only | Avoids transcription quality variance, but excludes non-English speakers entirely. |
| No learner model | Adaptive behaviour is reactive (skip / correct streaks), not diagnostic (concept mastery). |
| Chat context capped at 4 messages × 120 chars | Bounds the analysis prompt size, but loses long conversational threads. |
| Three identical SQLite databases | Trivial deployment, but cross-prototype joins have to happen at export time. |
| Excel export, not a researcher dashboard | The researcher uses their preferred tool; no UI to maintain. |

## 4.7 Honest limitations

A few things are worth being upfront about.

**The sample size is small.** At the current data snapshot, the study includes a small number of participants per condition. Statistical claims will be limited; qualitative analysis carries most of the weight while data collection continues.

**Self-paced sessions vary in length.** Some participants watched the full 17 minutes; others paused frequently. Active-watching time is logged, but session length is not normalised.

**No eye-tracking.** The instrumentation captures clicks, keystrokes, and answers, not attention. "Ignored" is a count of expired keyword popups, not a measurement of where the eyes were.

**The frequency setting in Proactive may interact with prior expectations.** A participant told to use "Medium" may anchor differently from one who experiments. The effect of the setting cannot be fully separated from the effect of being told about it.

**Same researcher administered every session.** Order effects, demand characteristics, and verbal cuing are possible.

**The transcript is fixed.** Real-world video lectures vary in pace, density, and clarity. A single video does not tell us whether the paradigm differences generalise across content types.

**The AI is non-deterministic.** Two participants in the same condition do not see exactly the same content. The blocklists and dedup rules reduce this to a tolerable level, but it is not zero.

**No cross-session memory.** Each session is isolated; the AI does not remember the participant from one session to the next.

**The Proactive skip-gate trusts the AI.** When the AI returns `{"skip": true}` saying the recent material is not substantive, no quiz fires. If the AI is wrong about that, the participant simply does not see a quiz they could have benefited from. There is no fallback.

## 4.8 What was deliberately left out

A few things were on the table and were intentionally not included, to keep the comparison clean.

- **Voice input or output.** TTS quality and audio overlap with the video would have introduced too many confounds.
- **Pre-test gating on prior knowledge.** Everyone sees the same prompts regardless of background.
- **Group or shared sessions.** No multi-user features, no shared annotations.
- **Mobile UI.** Desktop only; the chat sidebar is hidden below 1280 pixels of viewport width.
- **Cross-session memory.** Each session is a fresh start.
- **Difficulty propagation between Continuous's two quiz paths.** The legacy modal quiz and the live feed quiz keep separate difficulty state.

Each of these was a deliberate scoping decision rather than an oversight.
