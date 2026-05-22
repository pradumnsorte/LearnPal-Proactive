# P3 Study Data Analysis - Working Notes

## Data Sources Checked

This analysis uses the files in `src/P3 Data/`:

- `P3_Study Data.xlsx`: questionnaire and test data from all 21 participants.
- `learnpal-intermittent-2026-05-10T14-41-34.xlsx`: Intermittent prototype logs.
- `learnpal-continuous-2026-05-10T14-41-23.xlsx`: Continuous prototype logs.
- `learnpal-proactive-2026-05-10T14-41-43.xlsx`: Proactive prototype logs.
- `Feedback Interviews.pdf`: feedback interview notes reviewed separately from the `P3 Data` folder.

The participant set is balanced:

| Condition | IDs | n |
|---|---|---:|
| Intermittent | I01-I07 | 7 |
| Continuous | C01-C07 | 7 |
| Proactive | P01-P07 | 7 |

The study procedure represented in the data is:

1. Form_1: demographics and learning habits.
2. Form_2: pre-knowledge filter test, scored out of 10.
3. Form_3: pre-test, scored out of 20.
4. Priming document.
5. Prototype-based video session.
6. Form_4: post-test, scored out of 20.
7. Form_5: UES-SF engagement questionnaire plus custom AI-support items.
8. Feedback interview.

No full interview transcripts were found in the current `P3 Data` folder. The feedback notes PDF can be used for triangulation, but it should be treated as interview-note evidence rather than a fully coded transcript dataset.

## Data Quality Notes

Use the findings below as descriptive, not inferential. Each condition has only seven participants, so one participant can noticeably move the mean.

Important caveats:

- The `ai_acceptance_rate_pct` column in the exported `Comparable` sheets is not safe to compare directly across all three conditions. In Intermittent and Continuous, several values exceed 100%, which means the numerator and denominator are not measuring the same kind of event.
- The Proactive export has `active_video_seconds = 0` and `video_pauses = 0` for every participant, even though other interaction events are present. This appears to be a logging/export limitation rather than evidence that no video activity occurred.
- The Proactive `Quizzes` sheet contains only 14 rows and only includes P06 and P07, while the `Events` and `Comparable` sheets show quiz activity for most Proactive participants. For Proactive quiz behavior, the event/comparable counts are more informative than the `Quizzes` sheet alone.
- I02 has a very short prototype-log duration in the Intermittent export, only 41 seconds, despite having complete form data. Treat I02's interaction-log metrics cautiously.
- Transcript-click counts are zero across all prototype exports. Either participants did not use transcript navigation or transcript-click logging was not captured.
- The `video_completion_pct` field exists in the Comparable exports, but it is blank in the current files. Do not report video-completion percentage unless it is recomputed from reliable video-state logs.
- Condition-specific event counts are not universal measures. Snaps are Intermittent-only; feed, glossary, and highlight events are Continuous-only; keyword, visual, and proactive quiz-trigger events are Proactive-only. Use explicit positive uptake for AI-engagement comparisons, and use the exported feature-activity field only as a broader activity/exposure metric.
- The exported `icap_interactive_events` alias is not fair as a cross-condition measure in the current exports because it is based on `keyword_detail` and `visual_detail`, which are Proactive-specific. Do not use it as a primary cross-condition ICAP comparison unless the alias is redefined for all prototypes.
- Temporal charts based on `playback_seconds` should remain exploratory, especially for Proactive, because the same export has known active-video and pause logging gaps.

## Participant Background

The groups are broadly comparable demographically:

- Most participants are aged 23-27.
- Most are postgraduate students.
- All participants reported high English-video comprehension: almost everyone selected 5, with one Intermittent participant selecting 4.
- None clearly reported having watched the exact StatQuest video before; two selected "Not sure" and the rest selected "No".
- Prior neural-network experience was low. Most had either never studied neural networks or had only heard about them.
- AI-tool use was already common: every participant used tools such as ChatGPT, Gemini, Claude, or Perplexity either daily or a few times per week.

Prior familiarity with the core concepts was low across all groups:

| Condition | Mean familiarity across ML, neural networks, weights/biases, activation functions, hidden layers |
|---|---:|
| Continuous | 1.69 / 5 |
| Intermittent | 1.54 / 5 |
| Proactive | 1.51 / 5 |

The most common self-reported strategies when confused by a learning video were rewatching the same part, asking an AI tool, and searching on Google. This matters because the prototypes map onto habits participants already have: they are used to pausing, rewatching, and external explanation-seeking.

## Learning Outcomes

| Condition | Pre-knowledge mean /10 | Pre-test mean /20 | Post-test mean /20 | Mean gain | Median gain | Mean normalized gain |
|---|---:|---:|---:|---:|---:|---:|
| Continuous | 2.86 | 9.43 | 13.71 | +4.29 | +4.00 | 0.47 |
| Intermittent | 3.29 | 8.29 | 11.71 | +3.43 | +4.00 | 0.12 |
| Proactive | 1.43 | 6.86 | 12.57 | +5.71 | +4.00 | 0.42 |

Main reading:

- All three conditions improved on average from pre-test to post-test.
- Proactive produced the largest raw mean gain, but it also began with the lowest pre-knowledge and pre-test scores. That gives Proactive participants more room to improve.
- This baseline imbalance is important: Proactive's Form_2 pre-knowledge mean is 1.43/10, while Intermittent's is 3.29/10. Proactive's larger raw gain should therefore be interpreted partly as a room-to-improve pattern, not as proof that Proactive caused better learning.
- Continuous produced the highest final post-test mean and the highest mean normalized gain.
- Intermittent had the highest pre-knowledge mean but the lowest post-test mean and lowest mean normalized gain.
- Median raw gain is the same in all three groups: +4 points. The condition difference is therefore driven by distribution shape and outliers, not a uniformly higher gain for every participant in one condition.

Participant-level outliers:

| Pattern | Participants |
|---|---|
| Largest gains | C07 +12, P02 +12, I06 +10, P06 +10 |
| Negative gains | I04 -4, C06 -2, P04 -2 |
| No gain | I05 0, I07 0 |

Interpretation:

The learning data suggests that more active AI paradigms can support learning, but it does not justify a simple "Proactive is best" claim. A stronger interpretation is:

> Proactive generated the largest average improvement from the lowest baseline, while Continuous produced the strongest final performance. Intermittent still supported learning, but its gains depended more on whether learners chose to initiate support.

## Engagement Questionnaire

UES-SF was scored with the negatively worded usability items reverse-coded: confusing, frustrating, and taxing.

| Condition | Overall UES | Focused attention | Usability | Aesthetic appeal | Reward |
|---|---:|---:|---:|---:|---:|
| Continuous | 3.58 | 3.24 | 3.81 | 3.33 | 3.95 |
| Intermittent | 4.05 | 3.71 | 4.52 | 3.81 | 4.14 |
| Proactive | 3.64 | 3.05 | 3.76 | 3.76 | 4.00 |

Custom AI-support items:

| Condition | Helped understanding | Relevant to video | Useful timing | Felt in control | Distracting | Overloading |
|---|---:|---:|---:|---:|---:|---:|
| Continuous | 3.86 | 4.14 | 3.86 | 3.86 | 3.00 | 2.86 |
| Intermittent | 4.14 | 4.14 | 4.71 | 4.57 | 1.29 | 2.00 |
| Proactive | 4.00 | 3.86 | 3.57 | 3.14 | 2.86 | 2.86 |

Main reading:

- Intermittent is the strongest subjective experience. It has the highest overall UES, highest perceived timing, highest control, and lowest distraction. The perceived-usability subscale should not carry the interpretation because its internal consistency is weak in this sample.
- Continuous is perceived as relevant and moderately useful, but it carries more distraction than Intermittent and is slightly higher on distraction than Proactive in the questionnaire data.
- Proactive is also perceived as helpful, but it has the lowest control rating and a higher distraction/overload profile than Intermittent.

Interpretation:

This is the clearest trade-off in the data. Learner-controlled AI feels better, cleaner, and less disruptive. System-initiated AI creates more opportunities for interaction, but participants feel less in control. Continuous and Proactive should not be collapsed into the same kind of distraction: the scale is slightly higher for Continuous, while the qualitative feedback points to visual density for Continuous and poorly timed or insufficiently controllable keyword popups for Proactive.

## Prototype Interaction Patterns

Mean exported metrics by condition:

| Condition | Session duration (s) | First interaction (s) | Chat messages | Quiz attempts | Positive AI uptake | Feature activity/export metric | ICAP active | ICAP constructive |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Continuous | 2591 | 392 | 3.14 | 6.86 | 20.57 | 10.43 | 37.00 | 12.14 |
| Intermittent | 1116 | 300 | 2.43 | 4.86 | 8.86 | 1.57 | 11.29 | 8.71 |
| Proactive | 1335 | 214 | 1.43 | 8.71 | 14.43 | 57.71 | 3.29 | 10.14 |

Because of the logging caveats, compare these as behavioral signals rather than exact equivalents.

Condition-specific event totals:

| Condition | Notable events |
|---|---|
| Intermittent | 34 quiz attempts, 20 correct quiz answers, 17 chat messages, 9 completed snaps |
| Continuous | 66 feed questions unlocked, 48 feed questions answered, 40 feed-question jumps, 19 glossary clicks, 6 highlight-detail clicks, 22 chat messages |
| Proactive | 154 keywords shown, 89 keywords ignored, 44 dismissed, 17 saved for later, 3 pinned, 75 quiz triggers, 57 quiz answer events, 7 quiz skips, 13 visual opens |

Main reading:

- Intermittent produced fewer overall interactions, but those interactions were more deliberate. Participants had to choose to chat, quiz, or snap.
- Continuous produced the most exploratory behavior. It had the highest mean session duration, highest pause/seek activity, and many feed-question jumps.
- Proactive produced the highest volume of system-generated prompts, especially keyword popups and quiz triggers. It also produced the fastest mean time to first interaction.
- Intermittent also produced the highest subjective engagement score despite the fewest feature activity/exposure events. This is an important finding because it challenges the assumption that more AI activity automatically means better engagement.

The feature logs should be interpreted using three categories:

| Category | Meaning | Examples |
|---|---|---|
| AI exposure / opportunity | The system surfaced something to the learner. This is not positive engagement by itself. | Continuous feed questions unlocked; Proactive keywords shown; Proactive quizzes triggered |
| Explicit positive uptake | The learner acted on the support. | Feed questions answered; explanation clicks; glossary clicks; keyword later/pinned/detail; quiz answers |
| Non-engagement / friction | The learner skipped, ignored, dismissed, or closed support. | Keyword ignored/dismissed; quiz skipped; visual card closed |

This matters most for keyword/glossary features. A Continuous glossary term or Proactive keyword may be read without any click, so the logs undercount passive uptake. Therefore, low explicit keyword interaction should not be interpreted as "no use." The safer interpretation is: Continuous glossary usefulness is supported by interview-note evidence despite limited explicit clicks, while Proactive keyword popups had low explicit uptake and weaker subjective reception.

For cross-prototype comparison of **engagement with AI**, use explicit positive uptake rather than raw AI exposure:

| Condition | Visual/frame uptake | Quiz/question uptake | Concept/chat uptake | Total explicit positive AI uptake |
|---|---:|---:|---:|---:|
| Intermittent | 9 snap completions | 35 quiz/question actions | 18 chat/concept actions | 62 total, 8.86 per participant |
| Continuous | 6 highlight-detail clicks | 96 feed-question actions | 42 glossary/chat actions | 144 total, 20.57 per participant |
| Proactive | 3 visual detail/saved actions | 66 quiz/question actions | 32 keyword/chat actions | 101 total, 14.43 per participant |

These are action counts, not unique learning moments. For example, a Continuous feed question can involve a jump, an answer, and an explanation click. This makes the metric useful for comparing explicit uptake intensity, but it should still be interpreted with the passive-reading caveat for glossary and keyword features.

The Proactive keyword stream appears especially noisy in explicit log terms:

- 154 keywords were shown.
- Only 21 direct positive keyword actions were logged if counting "later", "pinned", and "detail" together.
- 133 keyword non-engagement actions were logged if counting ignored and dismissed together.

This does not mean the keyword feature failed entirely, because passive reading is not captured. But it does suggest that the keyword prompt frequency may have been higher than participants wanted.

## Exploratory Statistical Checks

A reproducible script for the checks below is saved at `report/combined/p3-stats.mjs`. It reads the four Excel files directly and prints markdown-ready tables.

Because each condition has only seven participants, the tests below should be treated as exploratory. The right way to use them is to strengthen interpretation, not to make hard inferential claims. I used:

- Wilcoxon signed-rank checks for pre-test to post-test change.
- Kruskal-Wallis tests with permutation p-values for condition differences.
- Cliff's delta for pairwise effect sizes.
- Spearman correlations with permutation p-values for associations between interaction behavior, learning, and experience.
- Benjamini-Hochberg correction across the exploratory correlation set.

### Pre-Test to Post-Test Change

| Group | n non-zero | Mean gain | Median gain | Rank-biserial r | Exact p |
|---|---:|---:|---:|---:|---:|
| All participants | 19 | +4.48 | +4.00 | 0.89 | 0.0002 |
| Continuous | 7 | +4.29 | +4.00 | 0.93 | 0.0313 |
| Intermittent | 5 | +3.43 | +4.00 | 0.80 | 0.1875 |
| Proactive | 7 | +5.71 | +4.00 | 0.93 | 0.0313 |

Reading:

- Across all 21 participants, the pre-post improvement is clear.
- Continuous and Proactive show detectable within-condition improvement even with `n = 7`.
- Intermittent still improves descriptively, but the signed-rank check is not strong because two participants had no gain and one had a negative gain.
- This does not mean Intermittent "did not work"; it means its learning effect is less stable in this small sample.

### Condition Differences

Kruskal-Wallis checks show a useful distinction: condition differences are weak for learning outcomes, but stronger for experience and behavior.

| Metric | H | epsilon^2 | Permutation p |
|---|---:|---:|---:|
| Pre-test score | 1.77 | ~0.00 | 0.4291 |
| Post-test score | 0.48 | ~0.00 | 0.7882 |
| Raw learning gain | 0.75 | ~0.00 | 0.7021 |
| Normalized gain | 1.25 | ~0.00 | 0.5581 |
| Overall UES | 4.57 | 0.14 | 0.0988 |
| AI control | 6.22 | 0.23 | 0.0425 |
| AI distraction | 7.31 | 0.30 | 0.0221 |
| Positive AI uptake | 4.74 | 0.15 | 0.0920 |
| Feature activity/export metric | 17.95 | 0.89 | <0.0001 |

Reading:

- The three prototypes do not separate cleanly on measured learning outcomes in this small sample.
- They do separate on the experience of control and distraction.
- They separate very strongly on the exported feature activity/exposure metric. This confirms that the prototype manipulation changed how participants interacted, even if the learning test is underpowered to detect condition-level differences.

Pairwise Cliff's delta gives the same story:

| Metric | Continuous vs Intermittent | Proactive vs Intermittent | Proactive vs Continuous |
|---|---:|---:|---:|
| Raw gain | 0.04 | 0.24 | 0.20 |
| Normalized gain | 0.33 | 0.24 | -0.14 |
| Overall UES | -0.53 | -0.63 | 0.12 |
| AI control | -0.43 | -0.73 | -0.35 |
| AI distraction | 0.78 | 0.63 | -0.04 |
| Positive AI uptake | 0.51 | 0.61 | -0.39 |
| Feature activity/export metric | 1.00 | 1.00 | 1.00 |

Positive values mean the first condition tends to be higher than the second. The strongest pairwise differences are not in learning gain; they are in subjective control, distraction, and feature activity/exposure.

Feature activity/exposure is the most separated behavioral measure: Cliff's delta is 1.00 for every pairwise condition comparison, meaning there is no overlap between condition distributions on this export metric. This confirms that the prototypes created distinct interaction patterns, but it should not be interpreted as "more engagement caused more learning." P04 is the strongest counterexample: 61 feature activity events with a -2 learning gain.

### Correlations With Learning

The strongest Spearman correlations with raw learning gain across all 21 participants were:

| Metric | rho | Permutation p | BH q |
|---|---:|---:|---:|
| Baseline pre-test score | -0.52 | 0.0176 | 0.3366 |
| First interaction time | -0.35 | 0.1204 | 0.7474 |
| AI control | -0.32 | 0.1512 | 0.7979 |
| AI overload | 0.30 | 0.1963 | 0.9215 |
| Feature activity/export metric | 0.23 | 0.3096 | 0.9215 |

Reading:

- The clearest learning correlation is with baseline score: participants who started lower tended to gain more. This supports the earlier caveat that Proactive's larger raw gain is partly a room-to-improve effect.
- Interaction volume is not strongly correlated with learning gain. More clicks, prompts, or feature activity did not automatically produce more learning. In the final page's positive-uptake framing, explicit positive AI uptake is also weakly related to raw gain (rho = +0.02).
- After multiple-comparison correction, none of the exploratory learning correlations remain statistically secure. Treat these as hypotheses.

For post-test score, the strongest correlations were baseline knowledge variables:

| Metric | rho | Permutation p | BH q |
|---|---:|---:|---:|
| Baseline pre-test score | 0.49 | 0.0232 | 0.3741 |
| Self-rated concept familiarity | 0.46 | 0.0389 | 0.4256 |
| Pre-knowledge filter score | 0.46 | 0.0386 | 0.4256 |

This means final score is more tied to incoming knowledge than to any single logged interaction count.

### Correlations With Experience

The experience variables produce stronger and more interpretable correlations than the learning variables.

| Outcome | Strongest related metric | rho | Permutation p | BH q |
|---|---|---:|---:|---:|
| Overall UES | AI distraction | -0.68 | 0.0010 | 0.0880 |
| Overall UES | AI relevance | 0.49 | 0.0269 | 0.3741 |
| AI control | AI distraction | -0.61 | 0.0041 | 0.1664 |
| AI control | AI overload | -0.55 | 0.0114 | 0.2920 |
| AI control | AI suggestions shown | -0.45 | 0.0428 | 0.4370 |
| AI distraction | AI overload | 0.57 | 0.0084 | 0.2570 |
| AI distraction | AI timing | -0.53 | 0.0175 | 0.3366 |
| AI distraction | AI relevance | -0.49 | 0.0249 | 0.3741 |

Reading:

- The strongest experience signal is distraction. Lower distraction is closely associated with higher overall engagement.
- Control is not just a design label; participants who felt distracted and overloaded also felt less in control.
- More AI suggestions shown tends to relate to lower control. This supports the qualitative interpretation that AI initiative has a subjective cost.
- These correlations are stronger than the interaction-learning correlations, which suggests the study is more sensitive to experience differences than to learning differences at this sample size.

### Condition-Specific Behavioral Signals

Within-condition correlations are extremely unstable with `n = 7`, but they suggest useful hypotheses for interview coding:

The final HTML page now shows this in two layers: one combined relationship map across all 21 participants, followed by three condition-specific maps for Intermittent, Continuous, and Proactive. The combined map is used for the main story; the condition maps are only descriptive pattern checks.

| Condition | Metric | rho with raw gain | rho with control | rho with distraction |
|---|---|---:|---:|---:|
| Continuous | Feed answer rate | 0.66 | 0.18 | 0.13 |
| Continuous | Feed jump rate | 0.40 | 0.42 | -0.25 |
| Continuous | Video control actions | 0.53 | -0.28 | 0.54 |
| Intermittent | Self-initiated intensity | -0.45 | 0.68 | 0.56 |
| Intermittent | Completed snaps | -0.87 | 0.65 | 0.61 |
| Intermittent | Quiz attempts | -0.60 | 0.50 | 0.72 |
| Proactive | Keyword explicit action rate | 0.52 | -0.06 | 0.02 |
| Proactive | Keyword ignored/dismissed | 0.11 | 0.30 | 0.02 |
| Proactive | Quiz attempts | -0.30 | 0.13 | -0.43 |

Possible readings:

- In Continuous, engaging with feed questions may be more meaningful than simply having feed content present. C06 had a 0% feed answer rate and a negative learning gain, while several high-answer-rate participants improved.
- In Proactive, explicit keyword actions have a more positive relationship with gain than ignored/dismissed keyword counts. This suggests that active uptake of interventions matters more than exposure volume.
- In Intermittent, higher self-initiated activity does not map cleanly to higher gain. This may reflect help-seeking by participants who were struggling, not a negative effect of the features.

### Scale Reliability

Cronbach's α across all 21 participants:

| Scale | Items | Cronbach's α |
|---|---:|---:|
| UES overall | 12 | 0.78 |
| Focused attention | 3 | 0.66 |
| Perceived usability | 3 | 0.39 |
| Aesthetic appeal | 3 | 0.84 |
| Reward | 3 | 0.62 |

Reading:

- The 12-item UES overall score is internally acceptable for exploratory reporting.
- Aesthetic appeal is strong.
- Focused attention and reward are usable but modest.
- The perceived-usability subscale is weak in this sample. It is safer to discuss the individual usability-related items or the overall UES score rather than overinterpreting the usability subscale alone.

## Additional Insights Worth Using

The statistical checks suggest several richer claims than the first descriptive pass:

1. **The manipulation worked behaviorally before it worked statistically on learning.** The prototypes clearly produced different interaction patterns and subjective experiences, but the learning test does not have enough power to separate conditions cleanly.

2. **Intermittent creates an engagement paradox.** It had the fewest explicit AI uptake actions and the lowest broader feature activity, but the highest overall UES, highest control, and lowest distraction. Learner control is not just a safety feature; it appears to make engagement feel more genuine.

3. **AI initiative creates opportunity and cost at the same time.** Continuous and Proactive increase AI-mediated activity, but the experience data shows that more AI presence can reduce perceived control and increase distraction.

4. **Interaction quality matters more than interaction quantity.** Raw feature activity/exposure has only a weak relationship with learning. For AI engagement, use explicit positive uptake, such as whether Continuous participants answered feed questions or whether Proactive participants explicitly acted on keywords.

5. **Final score and learning gain answer different questions.** Continuous has the strongest final performance, while Proactive has the largest raw gain from a lower baseline. These should not be collapsed into one "best" condition claim.

6. **Learner agency is a measurable outcome, not just a design principle.** Intermittent's advantage in control and low distraction is visible in the questionnaire and in the condition tests.

7. **The logs undercount passive cognitive engagement.** Proactive keyword prompts may have been read and mentally processed even when they were dismissed or ignored. This is exactly where interview-note evidence or full transcript coding is needed.

## Cross-Condition Interpretation

The data supports a trade-off model rather than a single winning prototype.

### Intermittent

Intermittent is strongest on subjective experience:

- Highest UES overall.
- Highest perceived control.
- Lowest distraction.

It fits learners who prefer agency and who already know when to ask for help. Its weakness is that support depends on learner initiative. If a learner does not ask, the AI remains invisible.

### Continuous

Continuous is strongest as a balanced learning-support condition:

- Highest post-test mean.
- Highest mean normalized gain.
- High relevance ratings.
- Strong active and constructive event counts.

It seems to encourage exploration without forcing interruption. The cost is that sessions become longer and somewhat more distracting than Intermittent.

### Proactive

Proactive is strongest at forcing engagement:

- Highest raw mean learning gain.
- Fastest mean time to first interaction.
- Most quiz attempts.
- Very high feature-engagement volume.

Its weakness is user agency. Participants rated it lower on control and similarly high to Continuous on distraction/overload. The keyword stream especially appears too frequent relative to explicit engagement with keywords.

## Suggested Thesis Claim

A defensible claim from the current data is:

> The three LearnPal paradigms shaped learning and engagement in different ways. Intermittent support produced the most controlled and least distracting experience, Continuous support produced the strongest final test performance and a balanced engagement profile, and Proactive support produced the highest volume of AI-mediated activity and the largest raw learning gains from a lower baseline. The results therefore suggest a design trade-off between learner agency and AI initiative rather than a single universally superior paradigm.

## Analysis Still Needed

The feedback interview notes should be used to triangulate the quantitative findings, and full transcripts would strengthen these themes further:

- Perceived usefulness of AI support.
- Moment-to-moment relevance.
- Distraction and interruption.
- Sense of learner control.
- Differences between noticing AI content, ignoring it, and acting on it.
- Whether participants used the AI for clarification, confirmation, curiosity, or test preparation.

The interview analysis is especially important for Proactive, because the logs can count ignored and dismissed prompts, but they cannot tell whether participants still read or benefited from those prompts before dismissing them. Based on the current notes and supplementary author notes, the safer qualitative claim is that proactive quizzes were liked, keyword popups were not, and nobody explicitly claimed that keyword popups helped learning.
