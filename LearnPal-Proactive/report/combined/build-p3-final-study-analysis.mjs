import XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const dataDir = join(root, 'src', 'P3 Data');
const outputFile = join(here, 'p3-final-study-analysis.html');

const studyFile = join(dataDir, 'P3_Study Data.xlsx');
const logFiles = {
  Intermittent: join(dataDir, 'learnpal-intermittent-2026-05-10T14-41-34.xlsx'),
  Continuous: join(dataDir, 'learnpal-continuous-2026-05-10T14-41-23.xlsx'),
  Proactive: join(dataDir, 'learnpal-proactive-2026-05-10T14-41-43.xlsx'),
};

const CONDITIONS = ['Intermittent', 'Continuous', 'Proactive'];
const COLOR = {
  Intermittent: '#b89214',
  Continuous: '#2764d8',
  Proactive: '#d83a5d',
};
const SOFT = {
  Intermittent: '#fff5cf',
  Continuous: '#eaf1ff',
  Proactive: '#ffe7ed',
};
const ID_KEY = 'Participant ID (Ask me)';
const MAX_TEST = 20;
const ALPHA = 0.05;

const conditionOf = (id) =>
  id.startsWith('I') ? 'Intermittent' : id.startsWith('C') ? 'Continuous' : 'Proactive';
const num = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};
const score = (value) => {
  const match = String(value ?? '').match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
  return match ? Number(match[1]) : num(value);
};
const finite = (values) => values.filter(Number.isFinite);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => {
  const valid = finite(values);
  return valid.length ? sum(valid) / valid.length : NaN;
};
const median = (values) => {
  const valid = finite(values).sort((a, b) => a - b);
  if (!valid.length) return NaN;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
};
const variance = (values) => {
  const valid = finite(values);
  if (valid.length < 2) return NaN;
  const avg = mean(valid);
  return sum(valid.map((value) => (value - avg) ** 2)) / (valid.length - 1);
};
const sd = (values) => Math.sqrt(variance(values));
const linearRegression = (pairs) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 2) return null;
  const xMean = mean(valid.map(([x]) => x));
  const yMean = mean(valid.map(([, y]) => y));
  const numerator = sum(valid.map(([x, y]) => (x - xMean) * (y - yMean)));
  const denominator = sum(valid.map(([x]) => (x - xMean) ** 2));
  if (!denominator) return null;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;
  return {
    slope,
    intercept,
    xMin: Math.min(...valid.map(([x]) => x)),
    xMax: Math.max(...valid.map(([x]) => x)),
  };
};
const fmt = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'NA');
const signed = (value, digits = 1) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}` : 'NA';
const pct = (value, digits = 0) => (Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : 'NA');
const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const rowsFrom = (workbook, sheetName) =>
  XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });

const rank = (values) => {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);
  for (let index = 0; index < sorted.length; ) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let tie = index; tie < end; tie += 1) ranks[sorted[tie].index] = averageRank;
    index = end;
  }
  return ranks;
};

const spearman = (pairs) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 3) return NaN;
  const xRanks = rank(valid.map(([x]) => x));
  const yRanks = rank(valid.map(([, y]) => y));
  const xMean = mean(xRanks);
  const yMean = mean(yRanks);
  const numerator = sum(xRanks.map((x, index) => (x - xMean) * (yRanks[index] - yMean)));
  const xDenominator = Math.sqrt(sum(xRanks.map((x) => (x - xMean) ** 2)));
  const yDenominator = Math.sqrt(sum(yRanks.map((y) => (y - yMean) ** 2)));
  return numerator / (xDenominator * yDenominator);
};

const seededRandom = (seed = 123456789) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};
const shuffle = (values, random) => {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
};

const wilcoxonSignedRank = (differences) => {
  const nonZero = finite(differences)
    .filter((difference) => difference !== 0)
    .map((difference) => ({ difference, abs: Math.abs(difference) }));
  const ranks = rank(nonZero.map(({ abs }) => abs));
  const totalRank = sum(ranks);
  const positiveRank = sum(
    nonZero.map(({ difference }, index) => (difference > 0 ? ranks[index] : 0))
  );
  const observed = Math.min(positiveRank, totalRank - positiveRank);
  const combinations = 2 ** nonZero.length;
  let asExtreme = 0;
  for (let mask = 0; mask < combinations; mask += 1) {
    let positive = 0;
    for (let index = 0; index < ranks.length; index += 1) {
      if (mask & (1 << index)) positive += ranks[index];
    }
    if (Math.min(positive, totalRank - positive) <= observed + 1e-12) asExtreme += 1;
  }
  return {
    n: nonZero.length,
    p: asExtreme / combinations,
    rankBiserial: (positiveRank - (totalRank - positiveRank)) / totalRank,
  };
};

const kruskalPermutation = (items, key, iterations = 20000, seed = 100) => {
  const valid = items
    .map((item) => ({ group: item.condition, value: item[key] }))
    .filter(({ value }) => Number.isFinite(value));
  const values = valid.map(({ value }) => value);
  const labels = valid.map(({ group }) => group);
  const groups = [...new Set(labels)];
  const ranks = rank(values);
  const n = valid.length;
  const tieCounts = new Map();
  values.forEach((value) => tieCounts.set(value, (tieCounts.get(value) ?? 0) + 1));
  const tieCorrection = 1 - sum([...tieCounts.values()].map((count) => count ** 3 - count)) / (n ** 3 - n);

  const hFor = (groupLabels) => {
    const byGroup = new Map(groups.map((group) => [group, []]));
    groupLabels.forEach((group, index) => byGroup.get(group).push(ranks[index]));
    const raw =
      (12 / (n * (n + 1))) *
        sum(groups.map((group) => {
          const groupRanks = byGroup.get(group);
          return sum(groupRanks) ** 2 / groupRanks.length;
        })) -
      3 * (n + 1);
    return raw / tieCorrection;
  };

  const observed = hFor(labels);
  const random = seededRandom(seed);
  let atLeastObserved = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (hFor(shuffle(labels, random)) >= observed - 1e-12) atLeastObserved += 1;
  }

  return {
    h: observed,
    p: (atLeastObserved + 1) / (iterations + 1),
    epsilon: Math.max(0, (observed - groups.length + 1) / (n - groups.length)),
  };
};

const cliffsDelta = (aValues, bValues) => {
  const a = finite(aValues);
  const b = finite(bValues);
  let greater = 0;
  let lesser = 0;
  a.forEach((x) => {
    b.forEach((y) => {
      if (Math.abs(x - y) < 1e-9) return;
      if (x > y) greater += 1;
      if (x < y) lesser += 1;
    });
  });
  return (greater - lesser) / (a.length * b.length);
};

const cronbachAlpha = (items, keys) => {
  const complete = items.filter((item) => keys.every((key) => Number.isFinite(item[key])));
  if (complete.length < 3 || keys.length < 2) return NaN;
  const itemVariances = keys.map((key) => variance(complete.map((item) => item[key])));
  const totals = complete.map((item) => sum(keys.map((key) => item[key])));
  return (keys.length / (keys.length - 1)) * (1 - sum(itemVariances) / variance(totals));
};

const workbook = XLSX.readFile(studyFile, { cellDates: true });
const form1 = rowsFrom(workbook, 'Form Responses 1');
const form2 = rowsFrom(workbook, 'Form Responses 2');
const form3 = rowsFrom(workbook, 'Form Responses 3');
const form4 = rowsFrom(workbook, 'Form Responses 4');
const form5 = rowsFrom(workbook, 'Form Responses 5');

const byId = (rows) => Object.fromEntries(rows.map((row) => [row[ID_KEY], row]));
const form1ById = byId(form1);
const form5ById = byId(form5);
const preKnowledgeById = Object.fromEntries(form2.map((row) => [row[ID_KEY], score(row.Score)]));
const preById = Object.fromEntries(form3.map((row) => [row[ID_KEY], score(row.Score)]));
const postById = Object.fromEntries(form4.map((row) => [row[ID_KEY], score(row.Score)]));

const f5Columns = Object.keys(form5[0]);
const f5Key = {
  interest: f5Columns[2],
  aesthetic: f5Columns[3],
  worthwhile: f5Columns[4],
  confusing: f5Columns[5],
  absorbed: f5Columns[6],
  rewarding: f5Columns[7],
  lost: f5Columns[8],
  attractive: f5Columns[9],
  frustrated: f5Columns[10],
  senses: f5Columns[11],
  taxing: f5Columns[12],
  timeSlip: f5Columns[13],
  helped: f5Columns[14],
  relevant: f5Columns[15],
  timing: f5Columns[16],
  control: f5Columns[17],
  distracted: f5Columns[18],
  overloaded: f5Columns[19],
};

const familiarityColumns = Object.keys(form1[0]).filter((key) => key.startsWith('10.'));
const videoLearningColumn = Object.keys(form1[0]).find((key) =>
  key.includes('video-based learning platforms')
);
const aiLearningColumn = Object.keys(form1[0]).find((key) => key.includes('AI tools such as'));
const neuralNetworkColumn = Object.keys(form1[0]).find((key) =>
  key.includes('formally studied neural networks')
);
const frequencyScore = {
  Rarely: 1,
  'A few times a month': 2,
  'A few times a week': 3,
  Daily: 4,
};
const neuralNetworkScore = {
  'No, I have not studied neural networks before': 0,
  'I have heard about them but not studied them properly': 1,
  'I have studied them briefly in a course/workshop': 2,
  'I have studied them in detail': 3,
};

const comparableById = new Map();
const eventById = new Map();
const messagesByCondition = Object.fromEntries(CONDITIONS.map((condition) => [condition, {}]));
const eventTotals = Object.fromEntries(CONDITIONS.map((condition) => [condition, {}]));
const timeline = Object.fromEntries(CONDITIONS.map((condition) => [condition, {}]));

for (const [condition, file] of Object.entries(logFiles)) {
  const wb = XLSX.readFile(file, { cellDates: true });
  rowsFrom(wb, 'Comparable').forEach((row) => comparableById.set(row.participant_id, row));
  rowsFrom(wb, 'Events').forEach((row) => {
    if (!eventById.has(row.participant_id)) eventById.set(row.participant_id, {});
    const participantEvents = eventById.get(row.participant_id);
    participantEvents[row.event_type] = (participantEvents[row.event_type] ?? 0) + 1;
    eventTotals[condition][row.event_type] = (eventTotals[condition][row.event_type] ?? 0) + 1;

    const second = num(row.playback_seconds);
    if (Number.isFinite(second)) {
      const minute = Math.max(0, Math.min(18, Math.floor(second / 60)));
      timeline[condition][minute] = (timeline[condition][minute] ?? 0) + 1;
    }
  });
  rowsFrom(wb, 'Messages')
    .filter((row) => row.role === 'user')
    .forEach((row) => {
      messagesByCondition[condition][row.source] = (messagesByCondition[condition][row.source] ?? 0) + 1;
    });
}

const participants = Object.keys(preById)
  .sort()
  .map((id) => {
    const condition = conditionOf(id);
    const f1 = form1ById[id] ?? {};
    const f5 = form5ById[id] ?? {};
    const comparable = comparableById.get(id) ?? {};
    const events = eventById.get(id) ?? {};
    const value = (key) => num(f5[f5Key[key]]);
    const reverse = (key) => 6 - value(key);
    const focused = mean([value('absorbed'), value('lost'), value('timeSlip')]);
    const usability = mean([reverse('confusing'), reverse('frustrated'), reverse('taxing')]);
    const aesthetic = mean([value('aesthetic'), value('attractive'), value('senses')]);
    const reward = mean([value('interest'), value('worthwhile'), value('rewarding')]);
    const uesItems = [
      value('interest'),
      value('aesthetic'),
      value('worthwhile'),
      reverse('confusing'),
      value('absorbed'),
      value('rewarding'),
      value('lost'),
      value('attractive'),
      reverse('frustrated'),
      value('senses'),
      reverse('taxing'),
      value('timeSlip'),
    ];
    const pre = preById[id];
    const post = postById[id];
    const gain = post - pre;
    const normalizedGain = pre < MAX_TEST ? gain / (MAX_TEST - pre) : NaN;
    const logNum = (key) => {
      const parsed = num(comparable[key]);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const feedUnlocked = events.feed_question_unlocked ?? 0;
    const keywordShown = events.keyword_shown ?? 0;
    const keywordPositive =
      (events.keyword_later ?? 0) + (events.keyword_pinned ?? 0) + (events.keyword_detail ?? 0);
    const keywordNonEngagement = (events.keyword_ignored ?? 0) + (events.keyword_dismissed ?? 0);
    const visualFrameUptake =
      condition === 'Intermittent'
        ? events.snap_completed ?? 0
        : condition === 'Continuous'
          ? events.highlight_detail_clicked ?? 0
          : (events.visual_detail ?? 0) + (events.visual_saved ?? 0);
    const quizQuestionUptake =
      condition === 'Intermittent'
        ? (events.quiz_correct ?? 0) + (events.quiz_wrong ?? 0) + (events.quiz_explained ?? 0)
        : condition === 'Continuous'
          ? (events.feed_question_answered ?? 0) +
            (events.explain_answer_clicked ?? 0) +
            (events.feed_question_jumped ?? 0)
          : (events.quiz_correct ?? 0) + (events.quiz_wrong ?? 0) + (events.quiz_detail ?? 0);
    const conceptChatUptake =
      condition === 'Intermittent'
        ? (events.chat_message_sent ?? 0) + (events.chat_suggestion_clicked ?? 0)
        : condition === 'Continuous'
          ? (events.glossary_term_clicked ?? 0) +
            (events.chat_message_sent ?? 0) +
            (events.chat_suggestion_clicked ?? 0)
          : keywordPositive + (events.chat_message_sent ?? 0) + (events.chat_suggestion_clicked ?? 0);
    const positiveAiUptake = visualFrameUptake + quizQuestionUptake + conceptChatUptake;

    return {
      id,
      condition,
      age: f1['1. What is your age?'],
      field: f1['3. What is your primary field or discipline?'],
      videoLearningFrequency: frequencyScore[f1[videoLearningColumn]] ?? NaN,
      aiLearningFrequency: frequencyScore[f1[aiLearningColumn]] ?? NaN,
      neuralNetworkFormal: neuralNetworkScore[f1[neuralNetworkColumn]] ?? NaN,
      familiarity: mean(familiarityColumns.map((column) => num(f1[column]))),
      preKnowledge: preKnowledgeById[id],
      pre,
      post,
      gain,
      normalizedGain,
      focused,
      usability,
      aesthetic,
      reward,
      uesOverall: mean(uesItems),
      uesInterest: value('interest'),
      uesAestheticItem: value('aesthetic'),
      uesWorthwhile: value('worthwhile'),
      uesConfusingRev: reverse('confusing'),
      uesAbsorbed: value('absorbed'),
      uesRewarding: value('rewarding'),
      uesLost: value('lost'),
      uesAttractive: value('attractive'),
      uesFrustratedRev: reverse('frustrated'),
      uesSenses: value('senses'),
      uesTaxingRev: reverse('taxing'),
      uesTimeSlip: value('timeSlip'),
      aiHelped: value('helped'),
      aiRelevant: value('relevant'),
      aiTiming: value('timing'),
      aiControl: value('control'),
      aiDistracted: value('distracted'),
      aiOverloaded: value('overloaded'),
      sessionDuration: logNum('session_duration_seconds'),
      firstInteraction: logNum('time_to_first_interaction_seconds'),
      chatMessages: logNum('chat_messages_sent'),
      pauses: logNum('video_pauses'),
      seeks: logNum('video_seeks_total'),
      videoCompletion: logNum('video_completion_pct'),
      quizAttempts: logNum('quiz_attempts_total'),
      quizCorrect: logNum('quiz_correct'),
      featureEngagements: logNum('paradigm_feature_engagements'),
      suggestionsShown: logNum('ai_suggestions_shown'),
      suggestionsAccepted: logNum('ai_suggestions_accepted'),
      suggestionsRejected: logNum('ai_suggestions_rejected'),
      icapActive: logNum('icap_active_events'),
      icapConstructive: logNum('icap_constructive_events'),
      icapInteractive: logNum('icap_interactive_events'),
      videoControlActions: logNum('video_pauses') + logNum('video_seeks_total'),
      feedAnswerRate: feedUnlocked ? (events.feed_question_answered ?? 0) / feedUnlocked : NaN,
      feedJumpPerUnlock: feedUnlocked ? (events.feed_question_jumped ?? 0) / feedUnlocked : NaN,
      keywordExplicitRate: keywordShown ? keywordPositive / keywordShown : NaN,
      keywordPositive,
      keywordNonEngagement,
      visualFrameUptake,
      quizQuestionUptake,
      conceptChatUptake,
      positiveAiUptake,
      selfInitiatedIntensity:
        logNum('chat_messages_sent') + logNum('quiz_attempts_total') + (events.snap_completed ?? 0),
      events,
    };
  });

const subset = (condition) => participants.filter((participant) => participant.condition === condition);
const avg = (condition, key) => mean(subset(condition).map((participant) => participant[key]));
const group = Object.fromEntries(
  CONDITIONS.map((condition) => [
    condition,
    {
      n: subset(condition).length,
      ids: subset(condition).map((participant) => participant.id),
      preKnowledge: avg(condition, 'preKnowledge'),
      familiarity: avg(condition, 'familiarity'),
      pre: avg(condition, 'pre'),
      post: avg(condition, 'post'),
      gain: avg(condition, 'gain'),
      medianGain: median(subset(condition).map((participant) => participant.gain)),
      normalizedGain: avg(condition, 'normalizedGain'),
      uesOverall: avg(condition, 'uesOverall'),
      focused: avg(condition, 'focused'),
      usability: avg(condition, 'usability'),
      aesthetic: avg(condition, 'aesthetic'),
      reward: avg(condition, 'reward'),
      aiHelped: avg(condition, 'aiHelped'),
      aiRelevant: avg(condition, 'aiRelevant'),
      aiTiming: avg(condition, 'aiTiming'),
      aiControl: avg(condition, 'aiControl'),
      aiDistracted: avg(condition, 'aiDistracted'),
      aiOverloaded: avg(condition, 'aiOverloaded'),
      firstInteraction: avg(condition, 'firstInteraction'),
      videoCompletion: avg(condition, 'videoCompletion'),
      chatMessages: avg(condition, 'chatMessages'),
      quizAttempts: avg(condition, 'quizAttempts'),
      quizCorrect: avg(condition, 'quizCorrect'),
      featureEngagements: avg(condition, 'featureEngagements'),
      visualFrameUptake: avg(condition, 'visualFrameUptake'),
      quizQuestionUptake: avg(condition, 'quizQuestionUptake'),
      conceptChatUptake: avg(condition, 'conceptChatUptake'),
      positiveAiUptake: avg(condition, 'positiveAiUptake'),
      icapActive: avg(condition, 'icapActive'),
      icapConstructive: avg(condition, 'icapConstructive'),
      icapInteractive: avg(condition, 'icapInteractive'),
      feedAnswerRate: avg(condition, 'feedAnswerRate'),
      keywordExplicitRate: avg(condition, 'keywordExplicitRate'),
      keywordNonEngagement: avg(condition, 'keywordNonEngagement'),
    },
  ])
);
const conditionSum = (condition, key) =>
  sum(subset(condition).map((participant) => participant[key]).filter(Number.isFinite));
const continuousVsProactiveUptakeLift =
  (group.Continuous.positiveAiUptake - group.Proactive.positiveAiUptake) /
  group.Proactive.positiveAiUptake;

const tests = {
  allGain: wilcoxonSignedRank(participants.map((participant) => participant.gain)),
  gainByCondition: Object.fromEntries(
    CONDITIONS.map((condition) => [
      condition,
      wilcoxonSignedRank(subset(condition).map((participant) => participant.gain)),
    ])
  ),
  gainKw: kruskalPermutation(participants, 'gain', 20000, 302),
  normalizedGainKw: kruskalPermutation(participants, 'normalizedGain', 20000, 303),
  uesKw: kruskalPermutation(participants, 'uesOverall', 20000, 304),
  controlKw: kruskalPermutation(participants, 'aiControl', 20000, 305),
  distractionKw: kruskalPermutation(participants, 'aiDistracted', 20000, 306),
  overloadKw: kruskalPermutation(participants, 'aiOverloaded', 20000, 307),
  featureKw: kruskalPermutation(participants, 'featureEngagements', 20000, 308),
  positiveUptakeKw: kruskalPermutation(participants, 'positiveAiUptake', 20000, 309),
};

const correlations = {
  baselineGain: spearman(participants.map((participant) => [participant.pre, participant.gain])),
  featureGain: spearman(participants.map((participant) => [participant.featureEngagements, participant.gain])),
  positiveUptakeGain: spearman(participants.map((participant) => [participant.positiveAiUptake, participant.gain])),
  distractionUes: spearman(participants.map((participant) => [participant.aiDistracted, participant.uesOverall])),
  controlDistraction: spearman(participants.map((participant) => [participant.aiControl, participant.aiDistracted])),
  suggestionsControl: spearman(participants.map((participant) => [participant.suggestionsShown, participant.aiControl])),
  timingDistraction: spearman(participants.map((participant) => [participant.aiTiming, participant.aiDistracted])),
};

const effectSizes = {
  rawGain: [
    cliffsDelta(subset('Continuous').map((p) => p.gain), subset('Intermittent').map((p) => p.gain)),
    cliffsDelta(subset('Proactive').map((p) => p.gain), subset('Intermittent').map((p) => p.gain)),
    cliffsDelta(subset('Proactive').map((p) => p.gain), subset('Continuous').map((p) => p.gain)),
  ],
  normalizedGain: [
    cliffsDelta(subset('Continuous').map((p) => p.normalizedGain), subset('Intermittent').map((p) => p.normalizedGain)),
    cliffsDelta(subset('Proactive').map((p) => p.normalizedGain), subset('Intermittent').map((p) => p.normalizedGain)),
    cliffsDelta(subset('Proactive').map((p) => p.normalizedGain), subset('Continuous').map((p) => p.normalizedGain)),
  ],
  uesOverall: [
    cliffsDelta(subset('Continuous').map((p) => p.uesOverall), subset('Intermittent').map((p) => p.uesOverall)),
    cliffsDelta(subset('Proactive').map((p) => p.uesOverall), subset('Intermittent').map((p) => p.uesOverall)),
    cliffsDelta(subset('Proactive').map((p) => p.uesOverall), subset('Continuous').map((p) => p.uesOverall)),
  ],
  aiControl: [
    cliffsDelta(subset('Continuous').map((p) => p.aiControl), subset('Intermittent').map((p) => p.aiControl)),
    cliffsDelta(subset('Proactive').map((p) => p.aiControl), subset('Intermittent').map((p) => p.aiControl)),
    cliffsDelta(subset('Proactive').map((p) => p.aiControl), subset('Continuous').map((p) => p.aiControl)),
  ],
  aiDistracted: [
    cliffsDelta(subset('Continuous').map((p) => p.aiDistracted), subset('Intermittent').map((p) => p.aiDistracted)),
    cliffsDelta(subset('Proactive').map((p) => p.aiDistracted), subset('Intermittent').map((p) => p.aiDistracted)),
    cliffsDelta(subset('Proactive').map((p) => p.aiDistracted), subset('Continuous').map((p) => p.aiDistracted)),
  ],
  featureEngagements: [
    cliffsDelta(subset('Continuous').map((p) => p.featureEngagements), subset('Intermittent').map((p) => p.featureEngagements)),
    cliffsDelta(subset('Proactive').map((p) => p.featureEngagements), subset('Intermittent').map((p) => p.featureEngagements)),
    cliffsDelta(subset('Proactive').map((p) => p.featureEngagements), subset('Continuous').map((p) => p.featureEngagements)),
  ],
  positiveAiUptake: [
    cliffsDelta(subset('Continuous').map((p) => p.positiveAiUptake), subset('Intermittent').map((p) => p.positiveAiUptake)),
    cliffsDelta(subset('Proactive').map((p) => p.positiveAiUptake), subset('Intermittent').map((p) => p.positiveAiUptake)),
    cliffsDelta(subset('Proactive').map((p) => p.positiveAiUptake), subset('Continuous').map((p) => p.positiveAiUptake)),
  ],
};

const improvedCount = participants.filter((participant) => participant.gain > 0).length;
const unchangedCount = participants.filter((participant) => participant.gain === 0).length;
const declinedCount = participants.filter((participant) => participant.gain < 0).length;
const proactiveKeywordPositiveTotal =
  (eventTotals.Proactive.keyword_later ?? 0) +
  (eventTotals.Proactive.keyword_pinned ?? 0) +
  (eventTotals.Proactive.keyword_detail ?? 0);
const proactiveKeywordShownTotal = eventTotals.Proactive.keyword_shown ?? 0;
const proactiveKeywordExplicitRate = proactiveKeywordShownTotal
  ? proactiveKeywordPositiveTotal / proactiveKeywordShownTotal
  : NaN;

const alpha = {
  uesOverall: cronbachAlpha(participants, [
    'uesInterest',
    'uesAestheticItem',
    'uesWorthwhile',
    'uesConfusingRev',
    'uesAbsorbed',
    'uesRewarding',
    'uesLost',
    'uesAttractive',
    'uesFrustratedRev',
    'uesSenses',
    'uesTaxingRev',
    'uesTimeSlip',
  ]),
  focused: cronbachAlpha(participants, ['uesAbsorbed', 'uesLost', 'uesTimeSlip']),
  usability: cronbachAlpha(participants, ['uesConfusingRev', 'uesFrustratedRev', 'uesTaxingRev']),
  aesthetic: cronbachAlpha(participants, ['uesAestheticItem', 'uesAttractive', 'uesSenses']),
  reward: cronbachAlpha(participants, ['uesInterest', 'uesWorthwhile', 'uesRewarding']),
};

const interviewThemes = [
  {
    condition: 'Intermittent',
    theme: 'Learner-controlled help',
    evidence: 'Interview notes indicate that chat support was useful and Snap-to-ask was handy because learners did not need to type visual/text details.',
    interpretation: 'This explains high control and low distraction, but also why support depends on learner initiative.',
  },
  {
    condition: 'Intermittent',
    theme: 'Delayed use',
    evidence: 'Interview notes indicate that some participants waited until the video ended and then took the in-video quiz all at once.',
    interpretation: 'Intermittent support can become revision-like rather than moment-by-moment support.',
  },
  {
    condition: 'Continuous',
    theme: 'Ambient engagement',
    evidence: 'Interview notes indicate that live feed questions kept participants engaged; when they could not answer, they rewatched or asked AI.',
    interpretation: 'The feed question layer supports constructive engagement without forcing interruption.',
  },
  {
    condition: 'Continuous',
    theme: 'Glossary as clarification and revision',
    evidence: 'Interview notes indicate that the keyword glossary was useful, including for clarification and revision; one participant wanted to download it.',
    interpretation: 'The glossary worked both as in-the-moment explanation and as a revision artifact.',
  },
  {
    condition: 'Continuous',
    theme: 'Visual density',
    evidence: 'Interview notes indicate that some participants felt a lot was going on; one wanted feature tabs to collapse.',
    interpretation: 'Ambient support must be visually manageable to avoid becoming distracting.',
  },
  {
    condition: 'Proactive',
    theme: 'Structured proactivity succeeds',
    evidence: 'Interview notes and supplementary clarifications indicate that most participants liked the quiz popups and the overall quiz feature; frequency controls were appreciated.',
    interpretation: 'System initiative was accepted when it created clear, controllable learning checkpoints.',
  },
  {
    condition: 'Proactive',
    theme: 'Keyword popups failed as uncontrolled initiative',
    evidence: 'Interview notes and supplementary clarifications indicate that keyword popups were distracting; nobody explicitly claimed they helped learning.',
    interpretation: 'Proactive prompts need suppression, pacing, and stronger timing/context logic.',
  },
  {
    condition: 'Across conditions',
    theme: 'Pacing and context continuity',
    evidence: 'Interview notes indicate that some increased playback speed because the video felt slow or they wanted to finish faster; some felt AI support became detached from the video.',
    interpretation: 'Speed and context-loss feedback should be treated as session-flow issues, not direct learning indicators.',
  },
];

const svg = {
  line: (x1, y1, x2, y2, attrs = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`,
  rect: (x, y, width, height, attrs = '') =>
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}/>`,
  circle: (cx, cy, r, attrs = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`,
  text: (x, y, text, attrs = '') => `<text x="${x}" y="${y}" ${attrs}>${esc(text)}</text>`,
};

const groupedBy = (items, keyFor) => {
  const grouped = new Map();
  items.forEach((item) => {
    const key = keyFor(item);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  return [...grouped.values()];
};

const horizontalBars = (items, options = {}) => {
  const width = options.width ?? 820;
  const left = options.left ?? 210;
  const right = width - 58;
  const rowHeight = options.rowHeight ?? 34;
  const top = 24;
  const max = options.max ?? Math.max(...items.map((item) => Math.abs(item.value)));
  const height = top + items.length * rowHeight + 22;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label ?? 'bar chart')}">
    ${items
      .map((item, index) => {
        const y = top + index * rowHeight;
        const value = Number.isFinite(item.value) ? item.value : 0;
        const barWidth = Math.max(2, (Math.abs(value) / max) * (right - left));
        return `<g>
          ${svg.text(left - 12, y + 15, item.label, 'class="bar-label" text-anchor="end"')}
          ${svg.rect(left, y, right - left, 18, 'class="bar-track" rx="4"')}
          ${svg.rect(left, y, barWidth, 18, `fill="${item.color}" rx="4"`)}
          ${svg.text(left + barWidth + 8, y + 14, item.display ?? fmt(item.value), 'class="bar-value"')}
        </g>`;
      })
      .join('')}
  </svg>`;
};

const chartPointers = (items) => `<ul class="chart-pointers">
  ${items.map((item) => `<li>${esc(item)}</li>`).join('')}
</ul>`;

const storyChain = () => {
  const steps = [
    [
      '1. Establish the learning baseline',
      'RQ1 asks whether learning changed from pre-test to post-test, then checks whether raw gains are partly explained by different starting points.',
    ],
    [
      '2. Separate exposure from uptake',
      'RQ2 separates what the system showed from what learners positively acted on, so ignored popups and raw feature volume are not treated as engagement.',
    ],
    [
      '3. Explain the design trade-off',
      'RQ3 combines ratings, logs, heatmaps, and interview-note themes to explain why control, timing, and visual density shaped the experience.',
    ],
  ];
  return `<div class="story-chain">${steps
    .map(
      ([title, text]) => `<article class="story-step">
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </article>`
    )
    .join('')}</div>`;
};

const groupedBars = (metrics, options = {}) => {
  const width = 860;
  const height = options.height ?? 330;
  const left = 72;
  const right = 810;
  const top = options.valueLabels ? 54 : 34;
  const bottom = height - 58;
  const groupWidth = (right - left) / metrics.length;
  const legendY = height - 18;
  const showValues = options.valueLabels ?? false;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(options.label ?? 'grouped bars')}">
    ${[0, 0.25, 0.5, 0.75, 1]
      .map((ratio) => svg.line(left - 8, bottom - ratio * (bottom - top), right, bottom - ratio * (bottom - top), 'class="grid-line"'))
      .join('')}
    ${metrics
      .map(([label], index) =>
        svg.text(left + index * groupWidth + groupWidth / 2, bottom + 25, label, 'class="axis-label" text-anchor="middle"')
      )
      .join('')}
    ${metrics
      .flatMap(([label, key, max], metricIndex) =>
        CONDITIONS.map((condition, conditionIndex) => {
          const value = group[condition][key];
          const barWidth = 18;
          const gap = 6;
          const x =
            left +
            metricIndex * groupWidth +
            groupWidth / 2 -
            ((barWidth + gap) * CONDITIONS.length) / 2 +
            conditionIndex * (barWidth + gap);
          const barHeight = Math.max(1, (value / max) * (bottom - top));
          const y = bottom - barHeight;
          return `<g>
            ${svg.rect(x, y, barWidth, barHeight, `fill="${COLOR[condition]}" rx="4"`)}
            ${
              showValues
                ? svg.text(
                    x + barWidth / 2,
                    y - 7,
                    fmt(value, 2),
                    'class="bar-value" text-anchor="middle"'
                  )
                : ''
            }
            <title>${condition} ${label}: ${fmt(value)}</title>
          </g>`;
        })
      )
      .join('')}
    ${CONDITIONS.map((condition, index) => {
      const x = left + index * 160;
      return `${svg.circle(x, legendY - 4, 6, `fill="${COLOR[condition]}"`)}${svg.text(x + 12, legendY, condition, 'class="legend-text"')}`;
    }).join('')}
  </svg>`;
};

const prePostSlope = () => {
  const width = 980;
  const height = 500;
  const left = 170;
  const right = 810;
  const top = 44;
  const bottom = 420;
  const y = (value) => bottom - (value / MAX_TEST) * (bottom - top);
  const postGroups = groupedBy(participants, (participant) => participant.post).sort(
    (a, b) => b[0].post - a[0].post
  );

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Pre-test to post-test slope chart">
    ${[0, 5, 10, 15, 20]
      .map(
        (tick) =>
          `${svg.line(left - 24, y(tick), right + 28, y(tick), 'class="grid-line"')}${svg.text(
            left - 34,
            y(tick) + 4,
            tick,
            'class="axis-label" text-anchor="end"'
          )}`
      )
      .join('')}
    ${svg.text(left, 24, 'Pre-test', 'class="axis-title" text-anchor="middle"')}
    ${svg.text(right, 24, 'Post-test', 'class="axis-title" text-anchor="middle"')}
    ${svg.text(
      left - 78,
      (top + bottom) / 2,
      'Score out of 20',
      `class="axis-title" text-anchor="middle" transform="rotate(-90 ${left - 78} ${(top + bottom) / 2})"`
    )}
    ${participants
      .map((participant) => {
        const color = COLOR[participant.condition];
        const y1 = y(participant.pre);
        const y2 = y(participant.post);
        const postGroup = postGroups.find((group) => group.includes(participant));
        const postIndex = postGroup.indexOf(participant);
        const postOffset = postGroup.length > 1 ? (postIndex - (postGroup.length - 1) / 2) * 8 : 0;
        return `<g class="participant-line">
          ${svg.line(left, y1, right, y2, `stroke="${color}" class="slope-line"`)}
          ${svg.circle(left, y1, 5, `fill="${color}" class="dot"`)}
          ${svg.circle(right + postOffset, y2, 4.5, `fill="${color}" class="dot" opacity="0.92"`)}
          <title>${participant.id}: ${participant.pre} to ${participant.post}, gain ${signed(participant.gain, 0)}</title>
        </g>`;
      })
      .join('')}
    ${postGroups
      .map((group) => {
        const ids = group.map((participant) => participant.id).join(', ');
        const gains = group.map((participant) => `${participant.id} ${signed(participant.gain, 0)}`).join('; ');
        return `${svg.text(right + 42, y(group[0].post) + 3, ids, 'class="small-label key-label compact-label"')}<title>Post-test ${group[0].post}: ${gains}</title>`;
      })
      .join('')}
  </svg>`;
};

const scatter = ({
  xKey,
  yKey,
  xLabel,
  yLabel,
  xDomain,
  yDomain,
  sizeKey,
  label,
  labelIds = [],
  labelAll = false,
  trendLine = false,
}) => {
  const width = 940;
  const height = 510;
  const left = 88;
  const right = 850;
  const top = 54;
  const bottom = 420;
  const x = (value) => left + ((value - xDomain[0]) / (xDomain[1] - xDomain[0])) * (right - left);
  const y = (value) => bottom - ((value - yDomain[0]) / (yDomain[1] - yDomain[0])) * (bottom - top);
  const ticks = (domain) => {
    const out = [];
    for (let value = domain[0]; value <= domain[1]; value += 1) out.push(value);
    return out;
  };
  const points = participants.filter(
    (participant) => Number.isFinite(participant[xKey]) && Number.isFinite(participant[yKey])
  );
  const keyFor = (participant) => `${fmt(participant[xKey], 2)}:${fmt(participant[yKey], 2)}`;
  const labelSet = new Set(labelIds);
  const pointGroups = groupedBy(points, keyFor).map((group) => {
    const cx = x(group[0][xKey]);
    const cy = y(group[0][yKey]);
    const radius = sizeKey ? Math.min(18, 6 + Math.max(0, group[0][sizeKey]) * 1.05) : 8;
    const side = cx > (left + right) / 2 ? 'left' : 'right';
    const labelParticipants = labelAll ? group : group.filter((participant) => labelSet.has(participant.id));
    const labelText = labelParticipants.map((participant) => participant.id).join(', ');
    const labelY = cy < top + 24 ? cy + 18 : cy > bottom - 18 ? cy - 11 : cy - 9;
    return { group, cx, cy, radius, side, labelText, labelY };
  });
  const trend = trendLine
    ? linearRegression(points.map((participant) => [participant[xKey], participant[yKey]]))
    : null;

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
    ${ticks(xDomain)
      .map(
        (tick) =>
          `${svg.line(x(tick), top, x(tick), bottom, 'class="grid-line"')}${svg.text(
            x(tick),
            bottom + 24,
            tick,
            'class="axis-label" text-anchor="middle"'
          )}`
      )
      .join('')}
    ${ticks(yDomain)
      .map(
        (tick) =>
          `${svg.line(left, y(tick), right, y(tick), 'class="grid-line"')}${svg.text(
            left - 18,
            y(tick) + 4,
            tick,
            'class="axis-label" text-anchor="end"'
          )}`
      )
      .join('')}
    ${svg.text((left + right) / 2, 484, xLabel, 'class="axis-title" text-anchor="middle"')}
    ${svg.text(
      24,
      (top + bottom) / 2,
      yLabel,
      `class="axis-title" text-anchor="middle" transform="rotate(-90 24 ${(top + bottom) / 2})"`
    )}
    ${
      trend
        ? `<g>
            ${svg.line(
              x(trend.xMin),
              y(trend.slope * trend.xMin + trend.intercept),
              x(trend.xMax),
              y(trend.slope * trend.xMax + trend.intercept),
              'class="trend-line"'
            )}
            <title>Linear trend: ${yLabel} = ${fmt(trend.slope, 2)} * ${xLabel} + ${fmt(
              trend.intercept,
              2
            )}</title>
          </g>`
        : ''
    }
    ${pointGroups
      .map(({ group, radius, cx, cy, side, labelText, labelY }) => {
        const anchor = side === 'right' ? 'start' : 'end';
        const textX = side === 'right' ? cx + radius + 8 : cx - radius - 8;
        const markerGap = group.length > 1 ? 6.5 : 0;
        const markerRadius = group.length > 1 ? Math.min(5.5, radius * 0.72) : radius;
        const title = group
          .map(
            (participant) =>
              `${participant.id}: ${xLabel} ${fmt(participant[xKey])}, ${yLabel} ${fmt(participant[yKey])}`
          )
          .join('; ');
        return `<g>
          ${group
            .map((participant, index) => {
              const offset = group.length > 1 ? (index - (group.length - 1) / 2) * markerGap : 0;
              return svg.circle(
                cx + offset,
                cy,
                markerRadius,
                `fill="${COLOR[participant.condition]}" class="scatter-dot" opacity="0.92"`
              );
            })
            .join('')}
          ${labelText ? svg.text(textX, labelY, labelText, `class="point-label key-label compact-label" text-anchor="${anchor}"`) : ''}
          <title>${title}</title>
        </g>`;
      })
      .join('')}
  </svg>`;
};

const timelineChart = () => {
  const width = 860;
  const height = 280;
  const left = 58;
  const right = 818;
  const top = 28;
  const bottom = 220;
  const minutes = Array.from({ length: 18 }, (_, index) => index);
  const max = Math.max(
    ...CONDITIONS.flatMap((condition) => minutes.map((minute) => timeline[condition][minute] ?? 0))
  );
  const x = (minute) => left + (minute / 17) * (right - left);
  const y = (count) => bottom - (count / max) * (bottom - top);
  const path = (condition) => {
    const points = minutes.map((minute) => `${x(minute)},${y(timeline[condition][minute] ?? 0)}`);
    return `<polyline points="${points.join(' ')}" fill="none" stroke="${COLOR[condition]}" stroke-width="2.5" opacity="0.88"/>`;
  };
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Event density over video timeline">
    ${[0, Math.round(max / 2), max]
      .map(
        (tick) =>
          `${svg.line(left, y(tick), right, y(tick), 'class="grid-line"')}${svg.text(
            left - 12,
            y(tick) + 4,
            tick,
            'class="axis-label" text-anchor="end"'
          )}`
      )
      .join('')}
    ${minutes
      .filter((minute) => minute % 3 === 0)
      .map((minute) => svg.text(x(minute), bottom + 23, `${minute}m`, 'class="axis-label" text-anchor="middle"'))
      .join('')}
    ${CONDITIONS.map(path).join('')}
    ${CONDITIONS.map((condition, index) => {
      const xPos = left + index * 160;
      return `${svg.circle(xPos, 260, 6, `fill="${COLOR[condition]}"`)}${svg.text(xPos + 12, 264, condition, 'class="legend-text"')}`;
    }).join('')}
  </svg>`;
};

const featureEngagementStrip = () => {
  const width = 980;
  const height = 340;
  const left = 140;
  const right = 910;
  const top = 54;
  const rowGap = 84;
  const max = 70;
  const x = (value) => left + (Math.max(0, Math.min(max, value)) / max) * (right - left);
  const y = (condition) => top + CONDITIONS.indexOf(condition) * rowGap;
  const ticks = [0, 10, 20, 30, 40, 50, 60, 70];
  const groupedParticipants = CONDITIONS.flatMap((condition) =>
    groupedBy(subset(condition), (participant) => participant.featureEngagements)
      .sort((a, b) => a[0].featureEngagements - b[0].featureEngagements)
      .map((group, index) => ({ condition, group, index }))
  );

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Feature activity and exposure by participant">
    ${ticks
      .map(
        (tick) =>
          `${svg.line(x(tick), top - 18, x(tick), top + rowGap * 2 + 24, 'class="grid-line"')}${svg.text(
            x(tick),
            top + rowGap * 2 + 48,
            tick,
            'class="axis-label" text-anchor="middle"'
          )}`
      )
      .join('')}
    ${CONDITIONS.map(
      (condition) =>
        `${svg.text(left - 16, y(condition) + 5, condition, 'class="axis-title" text-anchor="end"')}${svg.line(
          left,
          y(condition),
          right,
          y(condition),
          'class="grid-line"'
        )}`
    ).join('')}
    ${groupedParticipants
      .map(({ condition, group, index }) => {
        const groupX = x(group[0].featureEngagements);
        const groupY = y(condition);
        const markerGap = group.length > 1 ? 7 : 0;
        const markerRadius = group.length > 1 ? 5.5 : 8;
        const label = group.map((participant) => participant.id).join(', ');
        const labelOffset = -24 + index * 10;
        const labelX = groupX > right - 80 ? groupX - 10 : groupX + 10;
        const anchor = groupX > right - 80 ? 'end' : 'start';
        const title = group
          .map(
            (participant) =>
              `${participant.id}: ${fmt(participant.featureEngagements, 0)} feature activity events, gain ${signed(
                participant.gain,
                0
              )}`
          )
          .join('; ');
        return `<g>
          ${group
            .map((participant, participantIndex) => {
              const markerOffset = group.length > 1 ? (participantIndex - (group.length - 1) / 2) * markerGap : 0;
              return svg.circle(
                groupX,
                groupY + markerOffset,
                markerRadius,
                `fill="${COLOR[participant.condition]}" class="scatter-dot" opacity="0.92"`
              );
            })
            .join('')}
          ${svg.text(labelX, groupY + labelOffset, label, `class="point-label key-label compact-label" text-anchor="${anchor}"`)}
          <title>${title}</title>
        </g>`;
      })
      .join('')}
    ${svg.text((left + right) / 2, height - 18, 'Feature activity / exposure per participant', 'class="axis-title" text-anchor="middle"')}
  </svg>`;
};

const dataMapTable = () => {
  const rows = [
    ['RQ1 Knowledge gain', 'Form_2, Form_3, Form_4', 'pre-knowledge, pre-test, post-test, raw gain, normalised gain', 'Did learning happen, and did gain differ by paradigm?'],
    ['RQ2 Engagement', 'Form_5, comparable logs, condition-specific logs', 'UES, explicit positive AI uptake, support-family uptake, feature activity/exposure', 'How did each paradigm change learner activity and uptake?'],
    ['RQ3 Initiative-control trade-off', 'Form_5, logs, interview notes', 'control, distraction, overload, timing, relevance, ignored/dismissed prompts, interview-note themes', 'When did AI initiative help, and when did it disrupt?'],
  ];
  return `<table>
    <thead><tr><th>Research question</th><th>Data source</th><th>Measures</th><th>Output</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`;
};

const groupSummaryTable = () => `<table>
  <thead>
    <tr><th>Condition</th><th>IDs</th><th>Pre-knowledge</th><th>Pre</th><th>Post</th><th>Gain</th><th>Norm. gain</th><th>UES</th><th>Control</th><th>Distract</th></tr>
  </thead>
  <tbody>
    ${CONDITIONS.map(
      (condition) => `<tr>
        <th><span class="pill" style="--c:${COLOR[condition]}; --bg:${SOFT[condition]}">${condition}</span></th>
        <td>${group[condition].ids.join(', ')}</td>
        <td class="num">${fmt(group[condition].preKnowledge, 2)}</td>
        <td class="num">${fmt(group[condition].pre, 2)}</td>
        <td class="num">${fmt(group[condition].post, 2)}</td>
        <td class="num">${signed(group[condition].gain, 2)}</td>
        <td class="num">${fmt(group[condition].normalizedGain, 2)}</td>
        <td class="num">${fmt(group[condition].uesOverall, 2)}</td>
        <td class="num">${fmt(group[condition].aiControl, 2)}</td>
        <td class="num">${fmt(group[condition].aiDistracted, 2)}</td>
      </tr>`
    ).join('')}
  </tbody>
</table>`;

const statsTable = () => `<table>
  <thead><tr><th>Question</th><th>Test/check</th><th>Result</th><th>Why this test</th></tr></thead>
  <tbody>
    <tr><td>Did participants improve?</td><td>Wilcoxon signed-rank</td><td>p = ${fmt(tests.allGain.p, 4)}, r = ${fmt(tests.allGain.rankBiserial, 2)}</td><td>Paired pre/post scores, small sample, bounded score scale.</td></tr>
    <tr><td>Does gain differ by condition?</td><td>Permutation Kruskal-Wallis</td><td>p = ${fmt(tests.gainKw.p, 4)}, epsilon^2 = ${fmt(tests.gainKw.epsilon, 2)}</td><td>Three independent groups, small N, non-normal counts/scores likely.</td></tr>
    <tr><td>Does normalised gain differ?</td><td>Permutation Kruskal-Wallis</td><td>p = ${fmt(tests.normalizedGainKw.p, 4)}</td><td>Controls partly for different room to improve.</td></tr>
    <tr><td>Does control differ?</td><td>Permutation Kruskal-Wallis</td><td>p = ${fmt(tests.controlKw.p, 4)}, epsilon^2 = ${fmt(tests.controlKw.epsilon, 2)}</td><td>Likert-type ratings across three groups.</td></tr>
    <tr><td>Does distraction differ?</td><td>Permutation Kruskal-Wallis</td><td>p = ${fmt(tests.distractionKw.p, 4)}, epsilon^2 = ${fmt(tests.distractionKw.epsilon, 2)}</td><td>Likert-type ratings across three groups.</td></tr>
    <tr><td>Did explicit AI uptake differ?</td><td>Permutation Kruskal-Wallis</td><td>p = ${fmt(tests.positiveUptakeKw.p, 4)}, epsilon^2 = ${fmt(tests.positiveUptakeKw.epsilon, 2)}</td><td>Counts only learner actions that indicate positive uptake.</td></tr>
    <tr><td>Did feature activity/exposure differ?</td><td>Permutation Kruskal-Wallis</td><td>p &lt; 0.0001, epsilon^2 = ${fmt(tests.featureKw.epsilon, 2)}</td><td>Exposure/activity counts are skewed but confirm the manipulation.</td></tr>
  </tbody>
</table>`;

const hypothesisDecision = (p) => (p < ALPHA ? 'Reject H0' : 'Fail to reject H0');

const prototypeHypothesisTable = () => `<table>
  <thead>
    <tr><th>Prototype</th><th>Null hypothesis (H0)</th><th>Alternative hypothesis (H1)</th><th>Evidence</th><th>Decision at alpha = ${ALPHA}</th></tr>
  </thead>
  <tbody>
    ${CONDITIONS.map((condition) => {
      const test = tests.gainByCondition[condition];
      return `<tr>
        <th><span class="pill" style="--c:${COLOR[condition]}; --bg:${SOFT[condition]}">${condition}</span></th>
        <td>${condition} does not produce a statistically significant pre-test to post-test learning improvement.</td>
        <td>${condition} produces a statistically significant pre-test to post-test learning improvement.</td>
        <td>Mean gain ${signed(group[condition].gain, 2)}; median gain ${signed(group[condition].medianGain, 2)}; Wilcoxon exact p = ${fmt(test.p, 4)}.</td>
        <td><strong>${hypothesisDecision(test.p)}</strong>${test.p >= ALPHA ? '<br><span class="note">Descriptive improvement is still visible, but the test is not significant in this small sample.</span>' : ''}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>`;

const crossConditionHypothesisTable = () => {
  const rows = [
    {
      label: 'Learning difference between prototypes',
      h0: 'The three prototypes produce the same learning outcomes.',
      h1: 'At least one prototype produces different learning outcomes.',
      evidence: `Raw gain p = ${fmt(tests.gainKw.p, 4)}; normalised gain p = ${fmt(tests.normalizedGainKw.p, 4)}.`,
      p: tests.gainKw.p,
      reading: 'No prototype can be claimed as statistically superior for learning from this sample.',
    },
    {
      label: 'Perceived control difference',
      h0: 'The three prototypes produce the same perceived control.',
      h1: 'At least one prototype changes perceived control.',
      evidence: `AI control p = ${fmt(tests.controlKw.p, 4)}; Intermittent mean control = ${fmt(group.Intermittent.aiControl, 2)}/5.`,
      p: tests.controlKw.p,
      reading: 'Control differed by condition, with Intermittent highest.',
    },
    {
      label: 'Distraction difference',
      h0: 'The three prototypes produce the same distraction level.',
      h1: 'At least one prototype changes distraction.',
      evidence: `AI distraction p = ${fmt(tests.distractionKw.p, 4)}; Intermittent mean distraction = ${fmt(group.Intermittent.aiDistracted, 2)}/5.`,
      p: tests.distractionKw.p,
      reading: 'Distraction differed by condition, with Intermittent lowest.',
    },
    {
      label: 'Interaction-pattern difference',
      h0: 'The three prototypes produce the same feature activity/exposure.',
      h1: 'At least one prototype produces a different interaction pattern.',
      evidence: `Feature activity p < 0.0001; epsilon^2 = ${fmt(tests.featureKw.epsilon, 2)}.`,
      p: tests.featureKw.p,
      reading: 'The prototype manipulation clearly changed behaviour, even though learning differences were not significant.',
    },
  ];

  return `<table>
    <thead>
      <tr><th>Comparison</th><th>Null hypothesis (H0)</th><th>Alternative hypothesis (H1)</th><th>Evidence</th><th>Decision at alpha = ${ALPHA}</th><th>Reading</th></tr>
    </thead>
    <tbody>${rows
      .map(
        (row) => `<tr>
          <th>${esc(row.label)}</th>
          <td>${esc(row.h0)}</td>
          <td>${esc(row.h1)}</td>
          <td>${esc(row.evidence)}</td>
          <td><strong>${hypothesisDecision(row.p)}</strong></td>
          <td>${esc(row.reading)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
};

const effectSizeTable = () => {
  const rows = [
    ['Raw gain', effectSizes.rawGain],
    ['Normalised gain', effectSizes.normalizedGain],
    ['Overall UES', effectSizes.uesOverall],
    ['AI control', effectSizes.aiControl],
    ['AI distraction', effectSizes.aiDistracted],
    ['Positive AI uptake', effectSizes.positiveAiUptake],
    ['Feature activity/export metric', effectSizes.featureEngagements],
  ];
  return `<table>
    <thead><tr><th>Metric</th><th>Continuous vs Intermittent</th><th>Proactive vs Intermittent</th><th>Proactive vs Continuous</th></tr></thead>
    <tbody>${rows
      .map(
        ([label, values]) => `<tr>
          <td>${esc(label)}</td>
          ${values.map((value) => `<td class="num">${signed(value, 2)}</td>`).join('')}
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
};

const alphaTable = () => `<table>
  <thead><tr><th>Scale</th><th>Items</th><th>Cronbach's &alpha;</th><th>Use in interpretation</th></tr></thead>
  <tbody>
    <tr><td>UES overall</td><td class="num">12</td><td class="num">${fmt(alpha.uesOverall, 2)}</td><td>Acceptable for exploratory reporting.</td></tr>
    <tr><td>Focused attention</td><td class="num">3</td><td class="num">${fmt(alpha.focused, 2)}</td><td>Usable but modest.</td></tr>
    <tr><td>Perceived usability</td><td class="num">3</td><td class="num">${fmt(alpha.usability, 2)}</td><td>Weak; avoid overinterpreting the subscale alone.</td></tr>
    <tr><td>Aesthetic appeal</td><td class="num">3</td><td class="num">${fmt(alpha.aesthetic, 2)}</td><td>Strong.</td></tr>
    <tr><td>Reward</td><td class="num">3</td><td class="num">${fmt(alpha.reward, 2)}</td><td>Usable but modest.</td></tr>
  </tbody>
</table>`;

const participantMatrix = () => {
  const columns = [
    ['Pre', 'pre', 20, false],
    ['Pre-know', 'preKnowledge', 10, false],
    ['Post', 'post', 20, false],
    ['Gain', 'gain', 12, false],
    ['Norm', 'normalizedGain', 1, false],
    ['UES', 'uesOverall', 5, false],
    ['Control', 'aiControl', 5, false],
    ['Distract', 'aiDistracted', 5, true],
    ['AI uptake', 'positiveAiUptake', Math.max(1, ...participants.map((p) => p.positiveAiUptake)), false],
    ['AI shown', 'suggestionsShown', Math.max(1, ...participants.map((p) => p.suggestionsShown)), false],
    ['Activity', 'featureEngagements', 70, false],
  ];
  const heat = (value, max, inverse = false) => {
    if (!Number.isFinite(value)) return '';
    const ratio = Math.max(0, Math.min(1, value / max));
    const useful = inverse ? 1 - ratio : ratio;
    const hue = 8 + useful * 142;
    return `background:hsl(${hue} 68% 91%);`;
  };
  return `<table class="matrix">
    <thead><tr><th>ID</th><th>Condition</th>${columns.map(([label]) => `<th>${label}</th>`).join('')}</tr></thead>
    <tbody>${participants
      .map(
        (participant) => `<tr>
          <th>${participant.id}</th>
          <td><span class="pill" style="--c:${COLOR[participant.condition]}; --bg:${SOFT[participant.condition]}">${participant.condition}</span></td>
          ${columns
            .map(([label, key, max, inverse]) => {
              const value = participant[key];
              const display =
                key === 'gain'
                  ? signed(value, 0)
                  : key === 'normalizedGain'
                    ? fmt(value, 2)
                    : ['uesOverall', 'aiControl', 'aiDistracted'].includes(key)
                      ? fmt(value, 1)
                      : fmt(value, 0);
              return `<td class="num" style="${heat(value, max, inverse)}" title="${participant.id} ${label}: ${display}">${display}</td>`;
            })
            .join('')}
        </tr>`
      )
      .join('')}</tbody>
  </table>`;
};

const interviewTable = () => `<table>
  <thead><tr><th>Condition</th><th>Theme</th><th>Interview-note pattern</th><th>How it explains the data</th></tr></thead>
  <tbody>${interviewThemes
    .map(
      (theme) => `<tr>
        <th>${esc(theme.condition)}</th>
        <td>${esc(theme.theme)}</td>
        <td>${esc(theme.evidence)}</td>
        <td>${esc(theme.interpretation)}</td>
      </tr>`
    )
    .join('')}</tbody>
</table>`;

const uptakeTable = () => {
  const continuousFeedUnlocked = eventTotals.Continuous.feed_question_unlocked ?? 0;
  const continuousFeedAnswered = eventTotals.Continuous.feed_question_answered ?? 0;
  const continuousExplain = eventTotals.Continuous.explain_answer_clicked ?? 0;
  const continuousJumps = eventTotals.Continuous.feed_question_jumped ?? 0;
  const continuousGlossaryClicks = eventTotals.Continuous.glossary_term_clicked ?? 0;
  const continuousHighlightDetails = eventTotals.Continuous.highlight_detail_clicked ?? 0;
  const proactiveQuizTriggered = eventTotals.Proactive.quiz_triggered ?? 0;
  const proactiveQuizAnswered = (eventTotals.Proactive.quiz_correct ?? 0) + (eventTotals.Proactive.quiz_wrong ?? 0);
  const proactiveQuizSkipped = eventTotals.Proactive.quiz_skipped ?? 0;
  const proactiveVisualOpened = eventTotals.Proactive.visual_opened ?? 0;
  const proactiveVisualPositive = (eventTotals.Proactive.visual_detail ?? 0) + (eventTotals.Proactive.visual_saved ?? 0);
  const proactiveVisualClosed = eventTotals.Proactive.visual_closed ?? 0;
  const rows = [
    [
      'Continuous',
      'Feed questions',
      `${continuousFeedUnlocked} questions unlocked`,
      `${continuousFeedAnswered} answered, ${continuousExplain} explanation clicks, ${continuousJumps} jumps`,
      'Unanswered questions are not automatically rejection.',
      'A question may still have prompted thinking even without a logged answer.',
    ],
    [
      'Continuous',
      'Glossary',
      'Terms were surfaced visually; shown-count is not exported.',
      `${continuousGlossaryClicks} glossary clicks`,
      'No close/dismiss metric.',
      'Reading visible terms without clicking is likely undercounted; interview notes support clarification/revision use.',
    ],
    [
      'Continuous',
      'Highlights',
      'Highlights were surfaced visually.',
      `${continuousHighlightDetails} detail clicks`,
      'No direct rejection metric.',
      'May support orientation without a detail click.',
    ],
    [
      'Proactive',
      'Keyword popups',
      `${proactiveKeywordShownTotal} keywords shown`,
      `${proactiveKeywordPositiveTotal} later/pinned/detail actions (${pct(proactiveKeywordExplicitRate, 0)})`,
      `${(eventTotals.Proactive.keyword_ignored ?? 0) + (eventTotals.Proactive.keyword_dismissed ?? 0)} ignored/dismissed`,
      'Ignored/dismissed may include read-then-dismiss, but interview notes indicate weak reception.',
    ],
    [
      'Proactive',
      'Quiz prompts',
      `${proactiveQuizTriggered} quizzes triggered`,
      `${proactiveQuizAnswered} answered`,
      `${proactiveQuizSkipped} skipped`,
      'Stronger uptake because the intervention was structured as a learning checkpoint.',
    ],
    [
      'Proactive',
      'Visual cues',
      `${proactiveVisualOpened} visual cards opened`,
      `${proactiveVisualPositive} detail/saved actions`,
      `${proactiveVisualClosed} closed`,
      'Small counts; useful as supporting evidence only.',
    ],
  ];
  return `<table>
    <thead><tr><th>Condition</th><th>Feature</th><th>AI exposure / opportunity</th><th>Explicit positive uptake</th><th>Non-engagement / friction</th><th>Passive-use caveat</th></tr></thead>
    <tbody>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
      .join('')}</tbody>
  </table>`;
};

const prototypeBucketCharts = () => {
  const bucketRows = [
    {
      condition: 'Intermittent',
      title: 'Intermittent',
      subtitle: 'Snap, quiz, and learner-pulled chat',
      detail:
        'Visual/frame = completed snaps; quiz/question = quiz answers and explanations; keyword/chat = chat messages and suggestion clicks.',
      buckets: [
        ['Highlight / snap / visual', conditionSum('Intermittent', 'visualFrameUptake')],
        ['Quiz / question', conditionSum('Intermittent', 'quizQuestionUptake')],
        ['Concept support', conditionSum('Intermittent', 'conceptChatUptake')],
      ],
    },
    {
      condition: 'Continuous',
      title: 'Continuous',
      subtitle: 'Highlights, feed questions, glossary, and chat',
      detail:
        'Visual/frame = highlight detail clicks; quiz/question = feed answers, explanations, and jumps; keyword/chat = glossary clicks plus chat actions.',
      buckets: [
        ['Highlight / snap / visual', conditionSum('Continuous', 'visualFrameUptake')],
        ['Quiz / question', conditionSum('Continuous', 'quizQuestionUptake')],
        ['Concept support', conditionSum('Continuous', 'conceptChatUptake')],
      ],
    },
    {
      condition: 'Proactive',
      title: 'Proactive',
      subtitle: 'Visual cards, proactive quizzes, keywords, and chat',
      detail:
        'Visual/frame = visual detail or save actions; quiz/question = quiz answers and detail requests; keyword/chat = keyword later/pinned/detail plus chat actions.',
      buckets: [
        ['Highlight / snap / visual', conditionSum('Proactive', 'visualFrameUptake')],
        ['Quiz / question', conditionSum('Proactive', 'quizQuestionUptake')],
        ['Concept support', conditionSum('Proactive', 'conceptChatUptake')],
      ],
    },
  ];
  const maxValue = Math.max(...bucketRows.flatMap((row) => row.buckets.map(([, value]) => value)));
  return `<div class="grid three">${bucketRows
    .map(
      (row) => `<div class="bucket-card" style="--accent:${COLOR[row.condition]}; --soft:${SOFT[row.condition]}">
        <h4>${esc(row.title)}</h4>
        <div class="bucket-total">${esc(row.subtitle)}: ${fmt(
          conditionSum(row.condition, 'positiveAiUptake'),
          0
        )} explicit uptake actions total</div>
        ${horizontalBars(
          row.buckets.map(([label, value]) => ({
            label,
            value,
            display: fmt(value, 0),
            color: COLOR[row.condition],
          })),
          {
            width: 620,
            left: 185,
            rowHeight: 33,
            max: maxValue,
            label: `${row.title} positive uptake feature buckets`,
          }
        )}
        <p class="note">${esc(row.detail)}</p>
      </div>`
    )
    .join('')}</div>`;
};

const relationshipMetrics = [
  ['Pre-test score', 'pre'],
  ['Pre-knowledge', 'preKnowledge'],
  ['Positive AI uptake', 'positiveAiUptake'],
  ['AI shown / exposure', 'suggestionsShown'],
  ['Feature activity / exposure', 'featureEngagements'],
  ['Visual/frame uptake', 'visualFrameUptake'],
  ['Quiz/question uptake', 'quizQuestionUptake'],
  ['Concept-support uptake', 'conceptChatUptake'],
  ['Chat messages', 'chatMessages'],
  ['Time to first interaction', 'firstInteraction'],
  ['AI timing rating', 'aiTiming'],
  ['AI control rating', 'aiControl'],
  ['AI distraction rating', 'aiDistracted'],
  ['AI overload rating', 'aiOverloaded'],
];

const relationshipOutcomes = [
  ['Raw gain', 'gain'],
  ['Normalised gain', 'normalizedGain'],
  ['Post-test', 'post'],
  ['Overall UES', 'uesOverall'],
  ['AI control', 'aiControl'],
  ['AI distraction', 'aiDistracted'],
];

const corrCellStyle = (rho) => {
  if (!Number.isFinite(rho)) return 'background:#f6f4eb;color:#8f8877;';
  const magnitude = Math.min(1, Math.abs(rho));
  const hue = rho >= 0 ? 217 : 348;
  const lightness = 96 - magnitude * 42;
  const color = magnitude >= 0.72 ? '#fff' : '#1d2430';
  return `background:hsl(${hue} 72% ${lightness}%);color:${color};`;
};

const relationshipHeatmap = (items, label, options = {}) => {
  const rows = relationshipMetrics.map(([metricLabel, metricKey]) => ({
    metricLabel,
    metricKey,
    values: relationshipOutcomes.map(([outcomeLabel, outcomeKey]) => {
      const rho =
        metricKey === outcomeKey
          ? NaN
          : spearman(items.map((participant) => [participant[metricKey], participant[outcomeKey]]));
      return { outcomeLabel, outcomeKey, rho };
    }),
  }));
  return `<div class="heatmap-wrap">
    <table class="heatmap-table ${options.compact ? 'compact' : ''}">
      <caption>${esc(label)}</caption>
      <thead><tr><th>Metric</th>${relationshipOutcomes
        .map(([outcomeLabel]) => `<th>${esc(outcomeLabel)}</th>`)
        .join('')}</tr></thead>
      <tbody>${rows
        .map(
          (row) => `<tr>
            <th>${esc(row.metricLabel)}</th>
            ${row.values
              .map(
                (cell) => `<td class="${Number.isFinite(cell.rho) && Math.abs(cell.rho) >= 0.4 ? 'strong' : ''}" style="${corrCellStyle(
                  cell.rho
                )}" title="${esc(row.metricLabel)} vs ${esc(cell.outcomeLabel)}: ${
                  Number.isFinite(cell.rho) ? fmt(cell.rho, 3) : 'n/a'
                }">${Number.isFinite(cell.rho) ? signed(cell.rho, 2) : 'NA'}</td>`
              )
              .join('')}
          </tr>`
        )
        .join('')}</tbody>
    </table>
  </div>`;
};

const correlationCards = () =>
  [
    ['Baseline pre-test vs gain', correlations.baselineGain, 'Lower starting scores had more room to improve.'],
    ['Positive uptake vs gain', correlations.positiveUptakeGain, 'Explicit AI uptake still did not cleanly map to more learning.'],
    ['Distraction vs UES', correlations.distractionUes, 'Distraction is the clearest experience penalty.'],
    ['Control vs distraction', correlations.controlDistraction, 'Lower control traveled with higher distraction.'],
    ['Suggestions shown vs control', correlations.suggestionsControl, 'More AI exposure tended to reduce perceived control.'],
    ['Timing vs distraction', correlations.timingDistraction, 'Better timing related to lower distraction.'],
  ]
    .map(
      ([title, rho, text]) => `<article class="corr">
        <div class="rho ${rho < 0 ? 'neg' : 'pos'}">${rho >= 0 ? '+' : ''}${fmt(rho, 2)}</div>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
      </article>`
    )
    .join('');

const conditionMapInterpretation = () => {
  const intermittentQuizGain = spearman(
    subset('Intermittent').map((participant) => [participant.quizQuestionUptake, participant.gain])
  );
  const intermittentQuizUes = spearman(
    subset('Intermittent').map((participant) => [participant.quizQuestionUptake, participant.uesOverall])
  );
  const proactiveUptakePost = spearman(
    subset('Proactive').map((participant) => [participant.positiveAiUptake, participant.post])
  );

  return `<div class="stats-callout" style="margin-top:18px;">
    <strong>Two descriptive within-prototype patterns:</strong>
    In Intermittent, quiz/question uptake was negatively related to raw gain (rho = ${fmt(
      intermittentQuizGain,
      2
    )}) and overall UES (rho = ${fmt(
      intermittentQuizUes,
      2
    )}), suggesting that learners may have reached for the quiz more when they were struggling or enjoying the experience less. In Proactive, positive AI uptake was negatively related to post-test score (rho = ${fmt(
      proactiveUptakePost,
      2
    )}), which is consistent with either struggling learners seeking more AI help or heavy AI activity competing with focus. Treat both as design clues, not confirmatory statistics, because each condition has n = 7.
  </div>`;
};

const featureStoryCards = () => {
  const cards = [
    {
      condition: 'Intermittent',
      title: 'Controlled but dependent on initiative',
      metrics: [
        ['Chat messages/session', fmt(group.Intermittent.chatMessages, 1)],
        ['Positive AI uptake/session', fmt(group.Intermittent.positiveAiUptake, 1)],
        ['Quiz/question uptake', fmt(group.Intermittent.quizQuestionUptake, 1)],
        ['AI control', `${fmt(group.Intermittent.aiControl, 2)} / 5`],
      ],
      text: 'Intermittent kept AI quiet until learners asked. This protected control and reduced distraction, but support could remain unused.',
    },
    {
      condition: 'Continuous',
      title: 'Ambient support for explanation and revision',
      metrics: [
        ['Feed answer rate', pct(group.Continuous.feedAnswerRate, 0)],
        ['Positive AI uptake/session', fmt(group.Continuous.positiveAiUptake, 1)],
        ['Concept/chat uptake', fmt(group.Continuous.conceptChatUptake, 1)],
        ['Post-test mean', `${fmt(group.Continuous.post, 2)} / 20`],
      ],
      text: 'Continuous made support persistently available. The glossary and feed questions helped, but screen density became a design issue.',
    },
    {
      condition: 'Proactive',
      title: 'Quizzes worked; keyword popups did not',
      metrics: [
        ['Positive AI uptake/session', fmt(group.Proactive.positiveAiUptake, 1)],
        ['Quiz/question uptake', fmt(group.Proactive.quizQuestionUptake, 1)],
        ['Keyword positive action rate', `${pct(proactiveKeywordExplicitRate, 0)} (${proactiveKeywordPositiveTotal}/${proactiveKeywordShownTotal})`],
        ['Ignored/dismissed keywords/session', fmt(group.Proactive.keywordNonEngagement, 1)],
      ],
      text: 'Proactive was strongest when initiative became a checkpoint quiz with frequency control. Keyword popups lacked enough control and were disliked.',
    },
  ];
  return cards
    .map(
      (card) => `<article class="feature-card" style="--accent:${COLOR[card.condition]}; --soft:${SOFT[card.condition]}">
        <div class="tag">${card.condition}</div>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.text)}</p>
        ${card.metrics
          .map(([label, value]) => `<div class="feature-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
          .join('')}
      </article>`
    )
    .join('');
};

const findingsByRq = [
  {
    heading: 'RQ1: Knowledge gain',
    items: [
      ['Learning improved for the majority, not everyone.', `Across all participants, mean gain was ${signed(mean(participants.map((p) => p.gain)), 2)}; ${improvedCount} improved, ${unchangedCount} had no gain, and ${declinedCount} declined.`],
      ['Learning differences between paradigms are descriptive.', `Gain-by-condition was not statistically secure (p = ${fmt(tests.gainKw.p, 4)}), and Proactive began with the lowest pre-knowledge mean (${fmt(group.Proactive.preKnowledge, 2)}/10), so the learning outcome should not be used to claim the superiority of any one condition.`],
    ],
  },
  {
    heading: 'RQ2: Engagement behaviour',
    items: [
      ['The behaviour manipulation worked strongly.', `The exported feature-activity metric showed non-overlapping distributions across conditions in this dataset (Cliff's delta = ${fmt(effectSizes.featureEngagements[0], 2)}, ${fmt(effectSizes.featureEngagements[1], 2)}, ${fmt(effectSizes.featureEngagements[2], 2)}), but AI-engagement comparisons use positive uptake only.`],
      ['Delivery style changed uptake quality.', `Continuous produced ${pct(continuousVsProactiveUptakeLift, 0)} more explicit positive uptake than Proactive (${fmt(group.Continuous.positiveAiUptake, 2)} vs ${fmt(group.Proactive.positiveAiUptake, 2)} per participant), despite Proactive producing much more raw activity/exposure.`],
      ['Intermittent creates an engagement paradox.', `It had the fewest explicit AI uptake actions but the highest overall UES (${fmt(group.Intermittent.uesOverall, 2)}/5), highest control (${fmt(group.Intermittent.aiControl, 2)}/5), and lowest distraction (${fmt(group.Intermittent.aiDistracted, 2)}/5).`],
    ],
  },
  {
    heading: 'RQ3: Initiative-control trade-off',
    items: [
      ['Distraction has two different mechanisms.', `Continuous was slightly higher on the distraction scale than Proactive (${fmt(group.Continuous.aiDistracted, 2)} vs ${fmt(group.Proactive.aiDistracted, 2)}), while interviews point to visual density for Continuous and keyword timing/control for Proactive.`],
      ['Proactivity needs structure and control.', 'Participants liked proactive quizzes and frequency controls, but not keyword popups. Keyword logs undercount passive reading, but explicit uptake was low and nobody explicitly claimed the keyword popups helped learning.'],
      ['The best future direction is selective proactivity.', 'Use system-initiated support for meaningful checkpoints, while giving learners control over frequency, visibility, and persistence of secondary prompts.'],
    ],
  },
];

const findingList = () => {
  let index = 0;
  return findingsByRq
    .map(
      (grouping) => `<div class="finding-group">
        <h3 class="finding-group-title">${esc(grouping.heading)}</h3>
        ${grouping.items
          .map(([title, text]) => {
            index += 1;
            return `<article class="finding">
              <div class="finding-num">${index}</div>
              <div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
            </article>`;
          })
          .join('')}
      </div>`
    )
    .join('');
};

const generatedDate = '2026-05-12';

const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Study Analysis: Knowledge Gain, Engagement Behaviour and AI Support Trade-offs</title>
  <link rel="icon" href="../../src/assets/LearnPal-Favicon.svg" type="image/svg+xml">
  <style>
    :root {
      --bg: #f6f6f0;
      --ink: #17191d;
      --muted: #656b74;
      --line: #dddbd0;
      --panel: #ffffff;
      --panel-soft: #fbfbf6;
      --green: #12805c;
      --red: #d83a5d;
      --blue: #2764d8;
      --gold: #b89214;
      --shadow: 0 1px 2px rgba(20,20,20,0.06);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.55;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      border-bottom: 1px solid var(--line);
      background: rgba(246,246,240,0.94);
      backdrop-filter: blur(10px);
    }
    .topbar-inner {
      max-width: 1220px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 11px 28px;
      flex-wrap: wrap;
    }
    .brand { font-weight: 760; }
    nav { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; font-size: 0.88rem; }
    nav a { color: var(--muted); text-decoration: none; padding: 6px 8px; border-radius: 6px; }
    nav a:hover { background: var(--line); color: var(--ink); }
    header, section, footer {
      max-width: 1220px;
      margin: 0 auto;
      padding: 44px 28px;
    }
    header { padding-top: 60px; }
    .kicker {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.85rem;
      font-weight: 720;
    }
    h1 {
      max-width: 1040px;
      margin: 12px 0 16px;
      font-size: clamp(2.35rem, 5vw, 5.4rem);
      line-height: 0.98;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: clamp(1.6rem, 2.5vw, 2.35rem);
      line-height: 1.1;
      letter-spacing: 0;
    }
    h3 { margin: 0 0 7px; font-size: 1.03rem; line-height: 1.24; letter-spacing: 0; }
    p { margin: 0; color: #313640; }
    .lede { max-width: 940px; font-size: 1.12rem; color: #30343b; }
    .thesis {
      margin-top: 26px;
      padding-top: 18px;
      border-top: 2px solid var(--ink);
      max-width: 1040px;
      font-size: clamp(1.24rem, 2vw, 1.7rem);
      line-height: 1.28;
      font-weight: 680;
    }
    .metric-strip { margin-top: 28px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
    .metric {
      background: var(--panel);
      border: 1px solid var(--line);
      border-top: 3px solid var(--green);
      border-radius: 8px;
      padding: 17px;
      box-shadow: var(--shadow);
    }
    .metric strong { display: block; font-size: 1.9rem; line-height: 1; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
    .metric span { color: var(--muted); font-size: 0.9rem; }
    .band { border-top: 1px solid var(--line); }
    .section-head {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(280px, 0.52fr);
      gap: 30px;
      align-items: end;
      margin-bottom: 24px;
    }
    .note { color: var(--muted); font-size: 0.92rem; }
    .note p { color: var(--muted); }
    .grid { display: grid; gap: 18px; }
    .grid.two { grid-template-columns: 1fr 1fr; }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .chart-panel { padding: 24px; }
    .chart-panel h3 { font-size: 1.12rem; }
    .chart-pointers {
      margin: 14px 0 0;
      padding-left: 20px;
      color: #39404a;
      display: grid;
      gap: 6px;
    }
    .chart-pointers li { padding-left: 2px; }
    .story-chain {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 18px;
    }
    .story-step {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .story-step h3 { color: #20242b; }
    .story-step p { color: var(--muted); font-size: 0.95rem; }
    .rq-card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      border-radius: 8px;
      padding: 20px;
      box-shadow: var(--shadow);
    }
    .rq-card .label { color: var(--muted); font-size: 0.78rem; font-weight: 740; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .rq-card ul { padding-left: 18px; margin: 12px 0 0; color: #333842; }
    .rq-card li { margin: 5px 0; }
    svg { width: 100%; height: auto; display: block; }
    .grid-line { stroke: #e3e1d7; stroke-width: 1; }
    .axis-label, .small-label, .legend-text, .bar-label, .bar-value, .point-label {
      font-size: 12px;
      fill: var(--muted);
      font-variant-numeric: tabular-nums;
    }
    .axis-title { font-size: 13px; fill: #343943; font-weight: 720; }
    .vertical { transform: rotate(-90deg); transform-origin: 20px center; }
    .slope-line { stroke-width: 2; opacity: 0.58; }
    .trend-line { stroke: #6f747d; stroke-width: 2; stroke-dasharray: 6 6; opacity: 0.72; }
    .dot, .scatter-dot { stroke: #fff; stroke-width: 1.6; opacity: 0.88; }
    .compact-label { font-size: 10px; }
    .key-label { font-weight: 760; fill: #232831; }
    .bar-track { fill: #eeece2; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 820px; border-collapse: collapse; background: var(--panel); }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; font-size: 0.9rem; }
    th { color: var(--muted); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .heatmap-wrap { overflow-x: auto; }
    .heatmap-table {
      min-width: 820px;
      table-layout: fixed;
      border-collapse: separate;
      border-spacing: 4px;
      background: transparent;
    }
    .heatmap-table caption {
      text-align: left;
      font-weight: 760;
      margin-bottom: 8px;
      color: #343943;
    }
    .heatmap-table th, .heatmap-table td {
      border: 0;
      border-radius: 6px;
      padding: 8px 9px;
      text-align: center;
      vertical-align: middle;
      font-variant-numeric: tabular-nums;
    }
    .heatmap-table tbody th {
      width: 210px;
      text-align: left;
      background: #f4f2e9;
      color: #343943;
      text-transform: none;
      letter-spacing: 0;
      font-size: 0.82rem;
    }
    .heatmap-table td.strong { box-shadow: inset 0 0 0 2px rgba(21, 24, 28, 0.58); }
    .heatmap-table.compact { min-width: 760px; }
    .heatmap-table.compact th, .heatmap-table.compact td { padding: 7px 8px; font-size: 0.78rem; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      border-radius: 999px;
      padding: 4px 8px;
      background: var(--bg);
      color: #16181c;
      white-space: nowrap;
    }
    .pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
    .stats-callout {
      border-left: 4px solid var(--blue);
      background: #f4f7ff;
      padding: 16px 18px;
      border-radius: 8px;
      color: #263245;
    }
    .corr {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 17px;
      box-shadow: var(--shadow);
    }
    .rho { font-size: 1.9rem; line-height: 1; font-weight: 780; font-variant-numeric: tabular-nums; margin-bottom: 10px; }
    .rho.neg { color: var(--red); }
    .rho.pos { color: var(--blue); }
    .corr p, .feature-card p, .finding p { font-size: 0.92rem; color: var(--muted); }
    .feature-card {
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      background: linear-gradient(180deg, var(--soft), #fff 120px);
      border-radius: 8px;
      padding: 19px;
      box-shadow: var(--shadow);
    }
    .feature-card .tag {
      display: inline-flex;
      border-radius: 999px;
      background: #fff;
      color: var(--muted);
      padding: 4px 8px;
      font-size: 0.75rem;
      font-weight: 760;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 12px;
    }
    .feature-stat {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid var(--line);
      padding-top: 10px;
      margin-top: 10px;
      font-size: 0.9rem;
    }
    .feature-stat span { color: var(--muted); }
    .feature-stat strong { font-variant-numeric: tabular-nums; }
    .bucket-card {
      border: 1px solid var(--line);
      border-top: 4px solid var(--accent);
      border-radius: 8px;
      padding: 16px;
      background: linear-gradient(180deg, var(--soft), #fff 108px);
    }
    .bucket-card h4 { margin-bottom: 4px; }
    .bucket-card .bucket-total {
      color: var(--muted);
      font-size: 0.86rem;
      margin-bottom: 10px;
      font-variant-numeric: tabular-nums;
    }
    .finding-group { padding: 4px 0 18px; }
    .finding-group + .finding-group {
      border-top: 1px solid var(--line);
      padding-top: 20px;
    }
    .finding-group-title { color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.84rem; }
    .finding {
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 14px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
    }
    .finding:last-child { border-bottom: 0; }
    .finding-num {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--ink);
      color: #fff;
      display: grid;
      place-items: center;
      font-weight: 780;
    }
    .matrix td { font-variant-numeric: tabular-nums; }
    footer { color: var(--muted); font-size: 0.9rem; padding-bottom: 70px; }
    code { background: #eceae0; border-radius: 4px; padding: 1px 4px; }
    @media (max-width: 900px) {
      .grid.two, .grid.three, .section-head, .metric-strip, .story-chain { grid-template-columns: 1fr; }
      nav { margin-left: 0; }
      header, section, footer { padding-left: 18px; padding-right: 18px; }
      h1 { font-size: 2.35rem; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">LearnPal P3 Final Analysis</div>
      <nav aria-label="Page sections">
        <a href="#story">Story</a>
        <a href="#rqs">RQs</a>
        <a href="#data">Data map</a>
        <a href="#rq1">RQ1</a>
        <a href="#rq2">RQ2</a>
        <a href="#feature-buckets">Buckets</a>
        <a href="#relationships">Maps</a>
        <a href="#rq3">RQ3</a>
        <a href="#participants">Participants</a>
        <a href="#interviews">Interviews</a>
        <a href="#findings">Findings</a>
      </nav>
    </div>
  </div>

  <header>
    <div class="kicker">Study Analysis: Knowledge Gain, Engagement Behaviour and AI Support Trade-offs</div>
    <h1>Three AI paradigms, three different trade-offs.</h1>
    <p class="lede">This page turns the P3 data into a coherent findings story: knowledge gain, engagement behaviour, and the trade-off between AI initiative and learner control.</p>
    <div class="thesis">A key result is an engagement paradox: Intermittent support produced the fewest explicit AI uptake actions, yet had the highest subjective engagement score. The data therefore does not support a simple "more AI is better" conclusion. AI initiative appears useful when it creates structured, controllable learning checkpoints, and problematic when it becomes frequent, poorly timed, visually dense, or hard to suppress.</div>
    <p class="note" style="margin-top:14px; max-width:980px;">In this analysis, explicit AI uptake refers to logged participant actions that indicate intentional engagement with AI support, such as answering a question, opening an explanation, clicking a glossary item, using chat, saving a prompt, or opening details. It excludes passive exposure, such as a keyword being shown but ignored.</p>
    <div class="metric-strip">
      <div class="metric"><strong>21</strong><span>participants, balanced across I/C/P</span></div>
      <div class="metric" style="border-top-color:var(--green)"><strong>${signed(mean(participants.map((p) => p.gain)), 2)}</strong><span>mean pre-post gain overall</span></div>
      <div class="metric" style="border-top-color:var(--blue)"><strong>${fmt(group.Continuous.post, 2)}</strong><span>highest mean post-test score, Continuous</span></div>
      <div class="metric" style="border-top-color:var(--blue)"><strong>${fmt(group.Continuous.positiveAiUptake, 2)} vs ${fmt(group.Proactive.positiveAiUptake, 2)}</strong><span>explicit AI uptake, Continuous vs Proactive</span></div>
      <div class="metric" style="border-top-color:var(--red)"><strong>${fmt(group.Intermittent.aiControl, 2)}</strong><span>highest perceived control, Intermittent</span></div>
    </div>
  </header>

  <section id="story" class="band">
    <div class="section-head">
      <div>
        <h2>How the analysis is stitched together</h2>
        <p>The page follows one argument instead of treating each dataset as a separate result. Each chart either establishes learning, separates exposure from genuine uptake, or explains the initiative-control trade-off.</p>
      </div>
      <p class="note">Read the page as a sequence: first confirm whether learning changed, then inspect how each prototype shaped behaviour, then use ratings, relationship maps, and interviews to explain why more AI activity did not translate proportionally into better experience or learning.</p>
    </div>
    ${storyChain()}
  </section>

  <section id="rqs" class="band">
    <div class="section-head">
      <div>
        <h2>Focused research questions</h2>
        <p>The study should not have a different RQ for every dataset. The data sources are evidence layers supporting three project-level questions.</p>
      </div>
      <p class="note">These RQs follow the report framing: knowledge gain, learner engagement, and the design trade-off between AI initiative and learner control.</p>
    </div>
    <div class="grid three">
      <article class="rq-card" style="--accent:var(--green)">
        <div class="label">RQ1</div>
        <h3>How do different Human-AI interaction paradigms for in-video learning support influence learners' knowledge gain?</h3>
        <ul><li>Pre-test to post-test change</li><li>Raw and normalised gain</li><li>Prior knowledge as context</li></ul>
      </article>
      <article class="rq-card" style="--accent:var(--blue)">
        <div class="label">RQ2</div>
        <h3>How do these paradigms shape learner engagement during video-based learning?</h3>
        <ul><li>UES and explicit positive AI uptake</li><li>Visual/frame, quiz/question, and concept/chat support families</li><li>Exposure and passive-use caveats</li></ul>
      </article>
      <article class="rq-card" style="--accent:var(--red)">
        <div class="label">RQ3</div>
        <h3>What trade-off emerges between AI initiative and learner control?</h3>
        <ul><li>Control, distraction, overload</li><li>Prompt exposure and uptake</li><li>Interview triangulation</li></ul>
      </article>
    </div>
  </section>

  <section id="data" class="band">
    <div class="section-head">
      <div>
        <h2>Data map and safeguards</h2>
        <p>The analysis merges forms and logs by participant ID. IDs starting with I, C, and P are mapped only to Intermittent, Continuous, and Proactive respectively.</p>
      </div>
      <p class="note">Known caveats remain visible: Proactive active-video seconds/pauses are unreliable, video-completion fields are present but blank in the current comparable exports, Proactive quiz sheet rows are incomplete, transcript clicks are zero, exported acceptance rate is not used as a decisive metric, and feature-specific counts are not treated as universal measures.</p>
    </div>
    <div class="panel table-wrap">${dataMapTable()}</div>
    <div class="panel table-wrap" style="margin-top:18px;">${groupSummaryTable()}</div>
  </section>

  <section id="rq1" class="band">
    <div class="section-head">
      <div>
        <h2>RQ1: Knowledge gain</h2>
        <p>The strongest statistically supported statement is that participants improved overall from pre-test to post-test, rather than that one condition outperformed the others.</p>
      </div>
      <div class="note">
        <p>${improvedCount}/21 improved, ${unchangedCount}/21 had no gain, and ${declinedCount}/21 had negative gain. Overall Wilcoxon p = ${fmt(tests.allGain.p, 4)}. Gain by condition: permutation Kruskal-Wallis p = ${fmt(tests.gainKw.p, 4)}. Baseline score vs raw gain: Spearman rho = ${fmt(correlations.baselineGain, 2)}.</p>
        <p style="margin-top:10px;">Pre-knowledge differed descriptively across groups: Proactive started lowest (${fmt(group.Proactive.preKnowledge, 2)}/10), Continuous was ${fmt(group.Continuous.preKnowledge, 2)}/10, and Intermittent was highest (${fmt(group.Intermittent.preKnowledge, 2)}/10). This is why Proactive's larger raw gain should be read partly as a room-to-improve pattern.</p>
      </div>
    </div>
    <div class="panel chart-panel">
        <h3>Participant pre-test to post-test movement</h3>
        ${prePostSlope()}
        ${chartPointers([
          'Each line is one participant moving from pre-test to post-test. Upward lines indicate learning gain; downward lines show negative gain.',
          'Participant IDs are grouped by shared post-test score with comma-separated labels, and overlapping post-test endpoints use small multi-colour markers.',
          'This chart supports the cautious claim: most participants improved, but the study does not show improvement for every participant.',
        ])}
    </div>
    <div class="panel chart-panel" style="margin-top:18px;">
        <h3>Learning outcome summary</h3>
        ${groupedBars(
          [
            ['Pre', 'pre', 20],
            ['Post', 'post', 20],
            ['Gain', 'gain', 6],
            ['Norm gain', 'normalizedGain', 0.5],
          ],
          { label: 'Learning metrics by condition', valueLabels: true }
        )}
        <p class="note">The columns use different scales: pre/post are out of 20, gain is raw points, and normalised gain is a proportion. Use the value labels, not only bar height, when comparing across columns.</p>
        ${chartPointers([
          'Proactive has the largest raw gain, but it also begins with the lowest pre-knowledge and low pre-test baseline.',
          'Normalised gain is included because it partially corrects for room to improve.',
          'The result is descriptive: the chart motivates interpretation, while the Kruskal-Wallis check below prevents overclaiming the superiority of any one condition.',
        ])}
    </div>
    <div class="panel chart-panel" style="margin-top:18px;">
        <h3>Room-to-improve check</h3>
        ${scatter({
          xKey: 'pre',
          yKey: 'gain',
          xLabel: 'Pre-test score',
          yLabel: 'Raw gain',
          xDomain: [0, 20],
          yDomain: [-4, 12],
          sizeKey: null,
          label: 'Baseline score and raw gain',
          labelAll: true,
          trendLine: true,
        })}
        ${chartPointers([
          `The negative correlation (rho = ${fmt(correlations.baselineGain, 2)}) means participants with lower starting scores tended to gain more.`,
          'The dashed downward line is the same linear trend used in the Claude analysis, fitted through all 21 participant points.',
          'Repeated coordinates are grouped with comma-separated participant IDs and multi-colour markers so overlap is visible without connector lines.',
        ])}
    </div>
    <div class="panel table-wrap" style="margin-top:18px;">
        <h3>Per-prototype learning hypotheses</h3>
        ${prototypeHypothesisTable()}
        <p class="note">For non-significant results, the decision is written as "fail to reject H0" rather than "accept H0." This means the test did not provide enough evidence against the null; it does not prove that there was no learning effect.</p>
    </div>
    <div class="panel table-wrap" style="margin-top:18px;">
        <h3>Statistical checks</h3>
        ${statsTable()}
        <h3>Cross-condition hypothesis decisions</h3>
        ${crossConditionHypothesisTable()}
        <h3>Effect-size framing</h3>
        ${effectSizeTable()}
        <p class="note">With n = 7 per condition, these pairwise Cliff's delta values carry more interpretive weight than p-values. Positive values mean the first named condition tends to be higher than the second.</p>
    </div>
  </section>

  <section id="rq2" class="band">
    <div class="section-head">
      <div>
        <h2>RQ2: Engagement behaviour</h2>
        <p>The clearest behavioural result is that the prototypes changed how people interacted. For AI-engagement comparison, the page uses explicit positive uptake, not raw exposure counts.</p>
      </div>
      <p class="note">Positive AI uptake per participant was Intermittent ${fmt(group.Intermittent.positiveAiUptake, 1)}, Continuous ${fmt(group.Continuous.positiveAiUptake, 1)}, and Proactive ${fmt(group.Proactive.positiveAiUptake, 1)}. The exported feature-activity metric still proves that the prototypes behaved differently, but it is not treated as positive engagement by itself.</p>
    </div>
    <div class="panel chart-panel">
        <h3>Feature activity / exposure separation</h3>
        ${featureEngagementStrip()}
        <p class="note">The manipulation was behaviourally complete: feature-activity distributions do not overlap across conditions. This does not mean more feature activity caused more learning; P04 is a useful counterexample with 61 feature activity events and a -2 gain.</p>
        ${chartPointers([
          'This chart checks whether the prototypes created different behavioural environments. They did.',
          'The x-axis is broader activity/exposure, so it should not be read as positive engagement.',
          'All participant IDs are labelled; repeated activity values are grouped with comma-separated labels.',
        ])}
    </div>
    <div id="feature-buckets" class="panel chart-panel" style="margin-top:18px; scroll-margin-top:90px;">
      <h3>Feature-bucket uptake by prototype</h3>
      ${prototypeBucketCharts()}
      <div class="stats-callout" style="margin-top:12px;"><strong>Delivery-style signal:</strong> Continuous produced ${pct(
        continuousVsProactiveUptakeLift,
        0
      )} more explicit positive uptake than Proactive (${fmt(group.Continuous.positiveAiUptake, 2)} vs ${fmt(
        group.Proactive.positiveAiUptake,
        2
      )} actions per participant), even though Proactive generated much more raw feature activity/exposure.</div>
      <p class="note" style="margin-top:12px;">This is the clearer chart for the three major feature families: highlight/snap/visual support, quiz/question support, and concept support. Values are total explicit positive uptake actions across the seven participants in each condition, using the same count scale across all three mini charts.</p>
      ${chartPointers([
        'Read within and across prototypes because all three mini charts share the same scale.',
        'Quiz/question activity is the most reliable active learning signal because answering or asking for explanations is clearly intentional.',
        'Concept-support uptake needs the passive-use caveat: learners may read terms without clicking, especially in Continuous.',
      ])}
    </div>
    <div class="panel table-wrap" style="margin-top:18px;">
      <h3>Exposure, uptake, and passive use</h3>
      ${uptakeTable()}
      <p class="note">This table changes how the log data should be read. AI exposure is not positive engagement. Explicit uptake is logged action. Passive uptake, such as reading a Continuous glossary term or a Proactive keyword without clicking, is plausible but undercounted and therefore needs interview evidence.</p>
    </div>
    <div class="panel chart-panel" style="margin-top:18px;">
        <h3>Feature-specific exposure and uptake counts</h3>
        ${horizontalBars(
          [
            { label: 'I: chat messages', value: 17, display: '17', color: COLOR.Intermittent },
            { label: 'I: quiz attempts', value: 34, display: '34', color: COLOR.Intermittent },
            { label: 'I: completed snaps', value: 9, display: '9', color: COLOR.Intermittent },
            { label: 'C: feed questions unlocked', value: eventTotals.Continuous.feed_question_unlocked ?? 0, display: String(eventTotals.Continuous.feed_question_unlocked ?? 0), color: COLOR.Continuous },
            { label: 'C: feed questions answered', value: eventTotals.Continuous.feed_question_answered ?? 0, display: String(eventTotals.Continuous.feed_question_answered ?? 0), color: COLOR.Continuous },
            { label: 'C: glossary clicks', value: eventTotals.Continuous.glossary_term_clicked ?? 0, display: String(eventTotals.Continuous.glossary_term_clicked ?? 0), color: COLOR.Continuous },
            { label: 'P: keyword shown', value: eventTotals.Proactive.keyword_shown ?? 0, display: String(eventTotals.Proactive.keyword_shown ?? 0), color: COLOR.Proactive },
            { label: 'P: keyword ignored/dismissed', value: (eventTotals.Proactive.keyword_ignored ?? 0) + (eventTotals.Proactive.keyword_dismissed ?? 0), display: String((eventTotals.Proactive.keyword_ignored ?? 0) + (eventTotals.Proactive.keyword_dismissed ?? 0)), color: COLOR.Proactive },
            { label: 'P: quiz triggers', value: eventTotals.Proactive.quiz_triggered ?? 0, display: String(eventTotals.Proactive.quiz_triggered ?? 0), color: COLOR.Proactive },
          ],
          { max: 160, rowHeight: 30, label: 'Feature-level event totals' }
        )}
        <p class="note">These feature-specific counts mix exposure, explicit uptake, and non-engagement. Snaps are Intermittent-only; feed/glossary/highlight events are Continuous-only; keywords/visual opens/quiz triggers are Proactive-only. Use the uptake table above before interpreting any feature count as positive engagement.</p>
        ${chartPointers([
          'This chart is diagnostic rather than comparative because each prototype logs different feature types.',
          'The Proactive keyword-shown bar is exposure, while keyword ignored/dismissed is friction; neither should be counted as positive uptake.',
          'The most useful comparison is within a feature family: for example, Proactive keyword shown versus later/pinned/detail actions.',
        ])}
    </div>
    <div class="panel" style="margin-top:18px;">
        <h3>Interaction quality checks</h3>
        <div class="grid two">${correlationCards()}</div>
        <h3>UES reliability check</h3>
        ${alphaTable()}
    </div>
  </section>

  <section id="relationships" class="band">
    <div class="section-head">
      <div>
        <h2>Exploratory relationship maps</h2>
        <p>The combined map shows broad study-level relationships across all 21 participants. The condition maps show whether those patterns appear prototype-dependent.</p>
      </div>
      <p class="note">All cells are Spearman rho correlations. Blue cells are positive relationships, red cells are negative relationships, and stronger colour means a stronger relationship. Bordered cells mark |rho| >= 0.40. Because each condition-specific map has only seven participants, those maps are descriptive pattern checks, not confirmatory statistics.</p>
    </div>
    <div class="panel">
      <h3>Combined map: all participants</h3>
      ${relationshipHeatmap(participants, 'All participants, n = 21')}
      <p class="note">This map should carry the main interpretation: positive AI uptake is weakly related to learning gain, while experience-quality measures such as distraction, control, and timing show clearer relationships with subjective engagement.</p>
      ${chartPointers([
        'Use this heatmap as an exploratory map, not as proof of causation.',
        'Blue means the two measures rise together; red means one rises as the other falls.',
        'The most useful story is that experience-quality measures relate more clearly to UES than interaction volume relates to knowledge gain.',
      ])}
    </div>
    <div class="grid" style="margin-top:18px;">
      ${CONDITIONS.map(
        (condition) => `<div class="panel">
          <h3>${condition}</h3>
          ${relationshipHeatmap(subset(condition), `${condition}, n = 7`, { compact: true })}
        </div>`
      ).join('')}
    </div>
    ${conditionMapInterpretation()}
    <div class="stats-callout" style="margin-top:18px;">
      <strong>How to read this section:</strong> use the combined map for the main findings, and use the three condition-specific maps to generate design explanations. A relationship that appears only inside one prototype is useful for interpretation, but it is too small to report as a stable statistical result.
    </div>
  </section>

  <section id="rq3" class="band">
    <div class="section-head">
      <div>
        <h2>RQ3: AI initiative vs learner control</h2>
        <p>This is the design contribution. Initiative helped when it was structured and controllable, especially quizzes. Keyword and glossary features require a more careful reading: clicks show explicit uptake, but reading without clicking may still be useful and is not fully captured.</p>
      </div>
      <p class="note">Control differed by condition (p = ${fmt(tests.controlKw.p, 4)}), as did distraction (p = ${fmt(tests.distractionKw.p, 4)}). Continuous reported slightly higher distraction than Proactive (${fmt(group.Continuous.aiDistracted, 2)} vs ${fmt(group.Proactive.aiDistracted, 2)}), so the qualitative explanation differs by condition: Continuous visual density versus Proactive keyword timing/control. Distraction and UES were strongly related (rho = ${fmt(correlations.distractionUes, 2)}).</p>
    </div>
    <div class="panel chart-panel">
        <h3>Control vs distraction</h3>
        ${scatter({
          xKey: 'aiControl',
          yKey: 'aiDistracted',
          xLabel: 'Felt in control',
          yLabel: 'AI distraction',
          xDomain: [1, 5],
          yDomain: [1, 5],
          sizeKey: 'gain',
          label: 'AI control and distraction',
          labelAll: true,
        })}
        ${chartPointers([
          'Points toward the upper-left represent a risky experience: low control and high distraction.',
          'The point size follows positive learning gain, so this chart separates experience quality from learning outcome.',
          'All participant IDs are visible, and repeated rating coordinates use grouped comma labels and multi-colour markers.',
        ])}
    </div>
    <div class="panel chart-panel" style="margin-top:18px;">
        <h3>AI-support experience means</h3>
        ${groupedBars(
          [
            ['Helped', 'aiHelped', 5],
            ['Relevant', 'aiRelevant', 5],
            ['Timing', 'aiTiming', 5],
            ['Control', 'aiControl', 5],
            ['Distract', 'aiDistracted', 5],
            ['Overload', 'aiOverloaded', 5],
          ],
          { height: 360, label: 'AI-support items by condition', valueLabels: true }
        )}
        ${chartPointers([
          'Intermittent is strongest on control and lowest on distraction, matching the engagement paradox.',
          'Continuous has slightly higher distraction than Proactive, so the final narrative should not imply Proactive is uniquely distracting.',
          'The qualitative explanation differs: Continuous appears visually dense, while Proactive keyword timing and persistence caused friction.',
        ])}
    </div>
    <div class="grid three" style="margin-top:18px;">${featureStoryCards()}</div>
  </section>

  <section id="participants" class="band">
    <div class="section-head">
      <div>
        <h2>Participant-level matrix</h2>
        <p>This table keeps outliers visible. The condition averages should be read alongside participants such as C07 and P02 with large gains, and I04/C06/P04 with negative gains.</p>
      </div>
      <p class="note">Heat colours are descriptive. AI uptake counts only explicit positive actions; AI shown approximates AI exposure/opportunity; Activity is the broader feature activity/export metric. A high activity count is not automatically good; it can mean useful uptake, system pressure, or struggling behaviour. P04 is a counterexample: high activity with negative gain. P03 also shows why UES and custom AI items must be read separately.</p>
    </div>
    <div class="panel table-wrap">${participantMatrix()}</div>
  </section>

  <section id="interviews" class="band">
    <div class="section-head">
      <div>
        <h2>Interview triangulation</h2>
        <p>The interviews explain the quantitative patterns. They are not treated as a separate research question.</p>
      </div>
      <p class="note">These themes combine the interview notes PDF with supplementary author notes, not full transcript coding: proactive quizzes were liked, keyword popups were not, glossary helped both clarification and revision, and context loss felt like detachment from the video flow.</p>
    </div>
    <div class="panel table-wrap">${interviewTable()}</div>
  </section>

  <section id="findings" class="band">
    <div class="section-head">
      <div>
        <h2>Final findings story</h2>
        <p>These are the claims the data can support without overstating the sample.</p>
      </div>
    </div>
    <div class="stats-callout" style="margin-bottom:18px;">Avoid claiming that Proactive is statistically best for learning, that keyword popups improved learning, or that higher interaction count caused higher gain. The safer claim is a trade-off between initiative, engagement, and control.</div>
    <div class="panel">${findingList()}</div>
  </section>

  <section class="band">
    <div class="section-head">
      <div>
        <h2>Recommended written conclusion</h2>
        <p>The text below can be adapted into the report's data-analysis or findings section.</p>
      </div>
    </div>
    <div class="panel">
      <p><strong>Conclusion:</strong> The study shows that AI-supported video learning is shaped not only by the availability of AI assistance, but also by the interaction paradigm through which assistance is delivered. Participants improved on average from pre-test to post-test, but this improvement was not universal, and condition-level learning differences should be interpreted descriptively rather than as statistically conclusive.</p>
      <p style="margin-top:12px;">Intermittent support offered the greatest learner control, lowest distraction and highest subjective engagement, despite producing the fewest explicit AI uptake actions. Continuous support created a useful ambient layer for clarification and revision, but also showed the highest mean distraction score, likely due to visual density and the simultaneous presence of multiple support elements. Proactive support generated the most AI exposure and activity, especially through quizzes; however, proactive initiative was effective mainly when structured as a clear and controllable checkpoint, while frequent keyword popups had low explicit uptake and were often experienced as distracting or contextually detached.</p>
      <p style="margin-top:12px;">These findings suggest that future AI-supported video learning systems should use selective proactivity: initiating support at meaningful learning checkpoints while preserving learner control over frequency, visibility and persistence of secondary prompts.</p>
    </div>
  </section>

  <section class="band">
    <div class="section-head">
      <div>
        <h2>Data-quality notes</h2>
        <p>These caveats should remain in the report because they affect how strongly the results can be claimed.</p>
      </div>
    </div>
    <div class="grid three">
      <div class="panel"><h3>Small sample</h3><p>There are 7 participants per condition, so inferential tests are exploratory and effect sizes/descriptive patterns matter.</p></div>
      <div class="panel"><h3>Export limitations</h3><p>Proactive active-video seconds and pauses appear unreliable, video-completion fields are blank, and Proactive quiz sheet rows are incomplete. Event/comparable counts are used instead; playback-second temporal analysis is treated as exploratory rather than a main finding.</p></div>
      <div class="panel"><h3>Uptake ambiguity</h3><p>Ignored or dismissed prompts may still have been read. Interview notes help interpret this, but full transcript coding would be needed for stronger qualitative claims.</p></div>
    </div>
  </section>

  <footer>
    Generated on ${generatedDate} from <code>src/P3 Data</code>, <code>Feedback Interviews.pdf</code> notes, and the final RQ plan. Build script: <code>report/combined/build-p3-final-study-analysis.mjs</code>. This page is standalone and uses inline SVG, not external chart libraries.
  </footer>
</body>
</html>`;

writeFileSync(outputFile, page);
console.log(`Wrote ${outputFile}`);
