import XLSX from 'xlsx';

const STUDY_FILE = 'src/P3 Data/P3_Study Data.xlsx';
const LOG_FILES = [
  'src/P3 Data/learnpal-intermittent-2026-05-10T14-41-34.xlsx',
  'src/P3 Data/learnpal-continuous-2026-05-10T14-41-23.xlsx',
  'src/P3 Data/learnpal-proactive-2026-05-10T14-41-43.xlsx',
];

const idKey = 'Participant ID (Ask me)';
const conditionName = (id) =>
  id.startsWith('I') ? 'Intermittent' : id.startsWith('C') ? 'Continuous' : 'Proactive';

const scoreValue = (value) => {
  const match = String(value ?? '').match(/([0-9.]+)\s*\/\s*([0-9.]+)/);
  return match ? Number(match[1]) : NaN;
};

const numberValue = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
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
  const midpoint = Math.floor(valid.length / 2);
  return valid.length % 2 ? valid[midpoint] : (valid[midpoint - 1] + valid[midpoint]) / 2;
};
const variance = (values) => {
  const valid = finite(values);
  if (valid.length < 2) return NaN;
  const avg = mean(valid);
  return sum(valid.map((value) => (value - avg) ** 2)) / (valid.length - 1);
};
const standardDeviation = (values) => Math.sqrt(variance(values));
const format = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '');
const formatSigned = (value, digits = 2) =>
  Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(digits)}` : '';

const workbookRows = (file, sheetName) => {
  const workbook = XLSX.readFile(file, { cellDates: true });
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null, raw: false });
};

const rank = (values) => {
  const sorted = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value);
  const ranks = Array(values.length);

  for (let index = 0; index < sorted.length; ) {
    let end = index + 1;
    while (end < sorted.length && sorted[end].value === sorted[index].value) end += 1;
    const averageRank = (index + 1 + end) / 2;
    for (let tieIndex = index; tieIndex < end; tieIndex += 1) {
      ranks[sorted[tieIndex].index] = averageRank;
    }
    index = end;
  }

  return ranks;
};

const pearson = (pairs) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 3) return NaN;
  const xMean = mean(valid.map(([x]) => x));
  const yMean = mean(valid.map(([, y]) => y));
  const numerator = sum(valid.map(([x, y]) => (x - xMean) * (y - yMean)));
  const xDenominator = Math.sqrt(sum(valid.map(([x]) => (x - xMean) ** 2)));
  const yDenominator = Math.sqrt(sum(valid.map(([, y]) => (y - yMean) ** 2)));
  return numerator / (xDenominator * yDenominator);
};

const spearman = (pairs) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 3) return NaN;
  const xRanks = rank(valid.map(([x]) => x));
  const yRanks = rank(valid.map(([, y]) => y));
  return pearson(xRanks.map((xRank, index) => [xRank, yRanks[index]]));
};

const createRandom = (seed = 123456789) => {
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

const permutationCorrelationP = (pairs, iterations = 20000, seed = 101) => {
  const valid = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (valid.length < 5) return NaN;
  const observed = Math.abs(spearman(valid));
  const xs = valid.map(([x]) => x);
  const ys = valid.map(([, y]) => y);
  const random = createRandom(seed);
  let atLeastObserved = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffledY = shuffle(ys, random);
    const permuted = xs.map((x, index) => [x, shuffledY[index]]);
    if (Math.abs(spearman(permuted)) >= observed - 1e-12) atLeastObserved += 1;
  }

  return (atLeastObserved + 1) / (iterations + 1);
};

const benjaminiHochberg = (rows) => {
  const withP = rows
    .filter((row) => Number.isFinite(row.p))
    .map((row, index) => ({ ...row, originalIndex: index }))
    .sort((a, b) => a.p - b.p);
  let nextQ = 1;
  for (let index = withP.length - 1; index >= 0; index -= 1) {
    const row = withP[index];
    row.q = Math.min(nextQ, (row.p * withP.length) / (index + 1));
    nextQ = row.q;
  }
  return rows.map((row) => {
    const adjusted = withP.find((candidate) => candidate.metric === row.metric && candidate.outcome === row.outcome);
    return adjusted ? { ...row, q: adjusted.q } : row;
  });
};

const wilcoxonSignedRank = (differences) => {
  const nonZero = differences
    .filter((difference) => Number.isFinite(difference) && difference !== 0)
    .map((difference) => ({ difference, abs: Math.abs(difference) }));
  if (!nonZero.length) return null;
  const ranks = rank(nonZero.map(({ abs }) => abs));
  const totalRank = sum(ranks);
  const observedPositive = sum(
    nonZero.map(({ difference }, index) => (difference > 0 ? ranks[index] : 0))
  );
  const observedStatistic = Math.min(observedPositive, totalRank - observedPositive);
  const combinations = 2 ** nonZero.length;
  let asExtreme = 0;

  for (let mask = 0; mask < combinations; mask += 1) {
    let positive = 0;
    for (let index = 0; index < ranks.length; index += 1) {
      if (mask & (1 << index)) positive += ranks[index];
    }
    const statistic = Math.min(positive, totalRank - positive);
    if (statistic <= observedStatistic + 1e-12) asExtreme += 1;
  }

  return {
    n: nonZero.length,
    wPositive: observedPositive,
    p: asExtreme / combinations,
    rankBiserial: (observedPositive - (totalRank - observedPositive)) / totalRank,
  };
};

const kruskalWallis = (rows, metric, iterations = 20000, seed = 211) => {
  const valid = rows
    .map((row) => ({ group: row.condition, value: row[metric] }))
    .filter(({ value }) => Number.isFinite(value));
  const groups = [...new Set(valid.map(({ group }) => group))];
  const values = valid.map(({ value }) => value);
  const ranks = rank(values);
  const rankByGroup = new Map(groups.map((group) => [group, []]));
  valid.forEach(({ group }, index) => rankByGroup.get(group).push(ranks[index]));

  const n = valid.length;
  const hRaw =
    (12 / (n * (n + 1))) *
      sum(groups.map((group) => {
        const groupRanks = rankByGroup.get(group);
        return sum(groupRanks) ** 2 / groupRanks.length;
      })) -
    3 * (n + 1);

  const tieCounts = new Map();
  values.forEach((value) => tieCounts.set(value, (tieCounts.get(value) ?? 0) + 1));
  const tieCorrection =
    1 - sum([...tieCounts.values()].map((count) => count ** 3 - count)) / (n ** 3 - n);
  const observedH = hRaw / tieCorrection;
  const labels = valid.map(({ group }) => group);
  const random = createRandom(seed);
  let atLeastObserved = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const shuffledLabels = shuffle(labels, random);
    const permRankByGroup = new Map(groups.map((group) => [group, []]));
    shuffledLabels.forEach((group, index) => permRankByGroup.get(group).push(ranks[index]));
    const permHRaw =
      (12 / (n * (n + 1))) *
        sum(groups.map((group) => {
          const groupRanks = permRankByGroup.get(group);
          return sum(groupRanks) ** 2 / groupRanks.length;
        })) -
      3 * (n + 1);
    const permH = permHRaw / tieCorrection;
    if (permH >= observedH - 1e-12) atLeastObserved += 1;
  }

  return {
    h: observedH,
    p: (atLeastObserved + 1) / (iterations + 1),
    epsilonSquared: (observedH - groups.length + 1) / (n - groups.length),
  };
};

const cliffsDelta = (groupA, groupB) => {
  const a = finite(groupA);
  const b = finite(groupB);
  let greater = 0;
  let lesser = 0;
  a.forEach((valueA) => {
    b.forEach((valueB) => {
      if (valueA > valueB) greater += 1;
      if (valueA < valueB) lesser += 1;
    });
  });
  return (greater - lesser) / (a.length * b.length);
};

const cronbachAlpha = (rows, itemKeys) => {
  const complete = rows.filter((row) => itemKeys.every((key) => Number.isFinite(row[key])));
  if (complete.length < 3 || itemKeys.length < 2) return NaN;
  const itemVariances = itemKeys.map((key) => variance(complete.map((row) => row[key])));
  const totalScores = complete.map((row) => sum(itemKeys.map((key) => row[key])));
  return (itemKeys.length / (itemKeys.length - 1)) * (1 - sum(itemVariances) / variance(totalScores));
};

const markdownTable = (headers, rows) => {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
};

const studyWorkbook = XLSX.readFile(STUDY_FILE, { cellDates: true });
const studyRows = (sheetName) =>
  XLSX.utils.sheet_to_json(studyWorkbook.Sheets[sheetName], { defval: null, raw: false });

const form1 = studyRows('Form Responses 1');
const form2 = studyRows('Form Responses 2');
const form3 = studyRows('Form Responses 3');
const form4 = studyRows('Form Responses 4');
const form5 = studyRows('Form Responses 5');

const participants = new Map();
form1.forEach((row) => {
  const headers = Object.keys(row);
  const familiarityColumns = headers.filter((header) => header.startsWith('10.'));
  const videoLearningColumn = headers.find((header) =>
    header.includes('video-based learning platforms')
  );
  const aiLearningColumn = headers.find((header) => header.includes('AI tools such as'));
  const neuralNetworkColumn = headers.find((header) =>
    header.includes('formally studied neural networks')
  );

  const frequencyScores = {
    Rarely: 1,
    'A few times a month': 2,
    'A few times a week': 3,
    Daily: 4,
  };
  const neuralNetworkScores = {
    'No, I have not studied neural networks before': 0,
    'I have heard about them but not studied them properly': 1,
    'I have studied them briefly in a course/workshop': 2,
    'I have studied them in detail': 3,
  };

  participants.set(row[idKey], {
    id: row[idKey],
    condition: conditionName(row[idKey]),
    familiarityMean: mean(familiarityColumns.map((column) => numberValue(row[column]))),
    videoLearningFreq: frequencyScores[row[videoLearningColumn]] ?? NaN,
    aiLearningFreq: frequencyScores[row[aiLearningColumn]] ?? NaN,
    neuralNetworkFormal: neuralNetworkScores[row[neuralNetworkColumn]] ?? NaN,
  });
});

form2.forEach((row) => {
  participants.get(row[idKey]).preKnowledge = scoreValue(row.Score);
});
form3.forEach((row) => {
  participants.get(row[idKey]).pre = scoreValue(row.Score);
});
form4.forEach((row) => {
  participants.get(row[idKey]).post = scoreValue(row.Score);
});

const form5Columns = Object.keys(form5[0]);
const uesColumns = {
  interest: form5Columns[2],
  aesthetic: form5Columns[3],
  worthwhile: form5Columns[4],
  confusing: form5Columns[5],
  absorbed: form5Columns[6],
  rewarding: form5Columns[7],
  lost: form5Columns[8],
  attractive: form5Columns[9],
  frustrated: form5Columns[10],
  senses: form5Columns[11],
  taxing: form5Columns[12],
  timeSlip: form5Columns[13],
  helped: form5Columns[14],
  relevant: form5Columns[15],
  timing: form5Columns[16],
  control: form5Columns[17],
  distracted: form5Columns[18],
  overloaded: form5Columns[19],
};

form5.forEach((row) => {
  const participant = participants.get(row[idKey]);
  const item = (key) => numberValue(row[uesColumns[key]]);
  const reverse = (key) => 6 - item(key);
  const focusedItems = [item('absorbed'), item('lost'), item('timeSlip')];
  const usabilityItems = [reverse('confusing'), reverse('frustrated'), reverse('taxing')];
  const aestheticItems = [item('aesthetic'), item('attractive'), item('senses')];
  const rewardItems = [item('interest'), item('worthwhile'), item('rewarding')];

  Object.assign(participant, {
    uesInterest: item('interest'),
    uesAestheticItem: item('aesthetic'),
    uesWorthwhile: item('worthwhile'),
    uesConfusingRev: reverse('confusing'),
    uesAbsorbed: item('absorbed'),
    uesRewarding: item('rewarding'),
    uesLost: item('lost'),
    uesAttractive: item('attractive'),
    uesFrustratedRev: reverse('frustrated'),
    uesSenses: item('senses'),
    uesTaxingRev: reverse('taxing'),
    uesTimeSlip: item('timeSlip'),
    uesFocused: mean(focusedItems),
    uesUsability: mean(usabilityItems),
    uesAesthetic: mean(aestheticItems),
    uesReward: mean(rewardItems),
    uesOverall: mean([...focusedItems, ...usabilityItems, ...aestheticItems, ...rewardItems]),
    aiHelped: item('helped'),
    aiRelevant: item('relevant'),
    aiTiming: item('timing'),
    aiControl: item('control'),
    aiDistracted: item('distracted'),
    aiOverloaded: item('overloaded'),
    aiLowBurden: mean([6 - item('distracted'), 6 - item('overloaded')]),
  });
});

LOG_FILES.forEach((file) => {
  const workbook = XLSX.readFile(file, { cellDates: true });
  const comparable = XLSX.utils.sheet_to_json(workbook.Sheets.Comparable, {
    defval: null,
    raw: false,
  });
  comparable.forEach((row) => {
    const participant = participants.get(row.participant_id);
    if (!participant) return;
    [
      'session_duration_seconds',
      'active_video_seconds',
      'time_to_first_interaction_seconds',
      'chat_messages_sent',
      'transcript_clicks',
      'video_pauses',
      'video_seeks_total',
      'playback_speed_changes',
      'quiz_attempts_total',
      'quiz_correct',
      'quiz_accuracy_pct',
      'quiz_skipped_total',
      'avg_time_to_answer_seconds',
      'paradigm_feature_engagements',
      'ai_suggestions_shown',
      'ai_suggestions_accepted',
      'ai_suggestions_rejected',
      'ai_acceptance_rate_pct',
      'icap_active_events',
      'icap_constructive_events',
      'icap_interactive_events',
    ].forEach((key) => {
      const value = numberValue(row[key]);
      participant[key] = Number.isFinite(value) ? value : NaN;
    });
  });

  const events = XLSX.utils.sheet_to_json(workbook.Sheets.Events, { defval: null, raw: false });
  events.forEach((row) => {
    const participant = participants.get(row.participant_id);
    if (!participant) return;
    const key = `event_${row.event_type}`;
    participant[key] = (participant[key] ?? 0) + 1;
  });
});

const rows = [...participants.values()].sort((a, b) => a.id.localeCompare(b.id));
rows.forEach((row) => {
  row.gain = row.post - row.pre;
  row.normalizedGain = row.pre < 20 ? row.gain / (20 - row.pre) : NaN;
  row.selfInitiatedIntensity =
    (row.chat_messages_sent || 0) +
    (row.quiz_attempts_total || 0) +
    (row.event_snap_completed || 0);
  row.videoControlActions = (row.video_pauses || 0) + (row.video_seeks_total || 0);
  row.quizAccuracyComputed =
    row.quiz_attempts_total > 0 ? row.quiz_correct / row.quiz_attempts_total : NaN;
  row.keywordPositiveActions =
    (row.event_keyword_later || 0) + (row.event_keyword_pinned || 0) + (row.event_keyword_detail || 0);
  row.keywordNonEngagement =
    (row.event_keyword_ignored || 0) + (row.event_keyword_dismissed || 0);
  row.keywordExplicitRate =
    (row.event_keyword_shown || 0) > 0 ? row.keywordPositiveActions / row.event_keyword_shown : NaN;
  row.feedAnswerRate =
    (row.event_feed_question_unlocked || 0) > 0
      ? (row.event_feed_question_answered || 0) / row.event_feed_question_unlocked
      : NaN;
  row.feedJumpRate =
    (row.event_feed_question_unlocked || 0) > 0
      ? (row.event_feed_question_jumped || 0) / row.event_feed_question_unlocked
      : NaN;
});

const byCondition = (condition) => rows.filter((row) => row.condition === condition);
const conditions = ['Continuous', 'Intermittent', 'Proactive'];

console.log('\n## Wilcoxon Signed-Rank Checks: Pre-Test to Post-Test');
console.log(
  markdownTable(
    ['Group', 'n non-zero', 'Mean gain', 'Median gain', 'Rank-biserial r', 'Exact p'],
    ['All', ...conditions].map((condition) => {
      const subset = condition === 'All' ? rows : byCondition(condition);
      const result = wilcoxonSignedRank(subset.map((row) => row.gain));
      return [
        condition,
        result?.n ?? '',
        formatSigned(mean(subset.map((row) => row.gain))),
        formatSigned(median(subset.map((row) => row.gain))),
        format(result?.rankBiserial),
        format(result?.p, 4),
      ];
    })
  )
);

console.log('\n## Kruskal-Wallis Condition Checks');
const kruskalMetrics = [
  ['Pre-test score', 'pre'],
  ['Post-test score', 'post'],
  ['Raw learning gain', 'gain'],
  ['Normalized gain', 'normalizedGain'],
  ['Overall UES', 'uesOverall'],
  ['AI control', 'aiControl'],
  ['AI distraction', 'aiDistracted'],
  ['AI overload', 'aiOverloaded'],
  ['Feature engagements', 'paradigm_feature_engagements'],
  ['Quiz attempts', 'quiz_attempts_total'],
  ['Chat messages', 'chat_messages_sent'],
];
console.log(
  markdownTable(
    ['Metric', 'H', 'epsilon^2', 'Permutation p'],
    kruskalMetrics.map(([label, metric], index) => {
      const result = kruskalWallis(rows, metric, 20000, 300 + index);
      return [label, format(result.h), format(result.epsilonSquared), format(result.p, 4)];
    })
  )
);

console.log('\n## Pairwise Effect Sizes: Cliff Delta');
const pairwiseMetrics = [
  ['Raw gain', 'gain'],
  ['Normalized gain', 'normalizedGain'],
  ['Overall UES', 'uesOverall'],
  ['AI control', 'aiControl'],
  ['AI distraction', 'aiDistracted'],
  ['Feature engagements', 'paradigm_feature_engagements'],
];
const conditionPairs = [
  ['Continuous', 'Intermittent'],
  ['Proactive', 'Intermittent'],
  ['Proactive', 'Continuous'],
];
console.log(
  markdownTable(
    ['Metric', 'Continuous vs Intermittent', 'Proactive vs Intermittent', 'Proactive vs Continuous'],
    pairwiseMetrics.map(([label, metric]) => [
      label,
      ...conditionPairs.map(([a, b]) =>
        format(
          cliffsDelta(
            byCondition(a).map((row) => row[metric]),
            byCondition(b).map((row) => row[metric])
          )
        )
      ),
    ])
  )
);

const correlationSpecs = [
  ['Baseline pre-test', 'pre'],
  ['Pre-knowledge filter', 'preKnowledge'],
  ['Self-rated concept familiarity', 'familiarityMean'],
  ['AI-learning frequency', 'aiLearningFreq'],
  ['Video-learning frequency', 'videoLearningFreq'],
  ['First interaction time', 'time_to_first_interaction_seconds'],
  ['Session duration', 'session_duration_seconds'],
  ['Video control actions', 'videoControlActions'],
  ['Chat messages', 'chat_messages_sent'],
  ['Quiz attempts', 'quiz_attempts_total'],
  ['Quiz correct count', 'quiz_correct'],
  ['Quiz accuracy', 'quizAccuracyComputed'],
  ['Feature engagements', 'paradigm_feature_engagements'],
  ['AI suggestions shown', 'ai_suggestions_shown'],
  ['AI suggestions accepted', 'ai_suggestions_accepted'],
  ['AI suggestions rejected', 'ai_suggestions_rejected'],
  ['ICAP active events', 'icap_active_events'],
  ['ICAP constructive events', 'icap_constructive_events'],
  ['Self-initiated intensity', 'selfInitiatedIntensity'],
  ['AI helped understanding', 'aiHelped'],
  ['AI relevant', 'aiRelevant'],
  ['AI timing', 'aiTiming'],
  ['AI control', 'aiControl'],
  ['AI distraction', 'aiDistracted'],
  ['AI overload', 'aiOverloaded'],
  ['Overall UES', 'uesOverall'],
];

const outcomes = [
  ['Raw gain', 'gain'],
  ['Normalized gain', 'normalizedGain'],
  ['Post-test score', 'post'],
  ['Overall UES', 'uesOverall'],
  ['AI control', 'aiControl'],
  ['AI distraction', 'aiDistracted'],
];

const correlationRows = [];
outcomes.forEach(([outcomeLabel, outcomeKey], outcomeIndex) => {
  correlationSpecs
    .filter(([, metric]) => metric !== outcomeKey)
    .forEach(([metricLabel, metric], metricIndex) => {
      const pairs = rows.map((row) => [row[metric], row[outcomeKey]]);
      const rho = spearman(pairs);
      if (!Number.isFinite(rho)) return;
      correlationRows.push({
        outcome: outcomeLabel,
        metric: metricLabel,
        rho,
        p: permutationCorrelationP(pairs, 20000, 1000 + outcomeIndex * 100 + metricIndex),
      });
    });
});
const adjustedCorrelations = benjaminiHochberg(correlationRows);

const topCorrelations = (outcome, limit = 8) =>
  adjustedCorrelations
    .filter((row) => row.outcome === outcome)
    .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho))
    .slice(0, limit);

console.log('\n## Strongest Spearman Correlations by Outcome');
outcomes.forEach(([outcome]) => {
  console.log(`\n### ${outcome}`);
  console.log(
    markdownTable(
      ['Metric', 'rho', 'Permutation p', 'BH q'],
      topCorrelations(outcome).map((row) => [
        row.metric,
        format(row.rho),
        format(row.p, 4),
        format(row.q, 4),
      ])
    )
  );
});

console.log('\n## Condition-Specific Behavioral Correlations');
const withinConditionSpecs = [
  ['Continuous', 'feedAnswerRate', 'Feed answer rate'],
  ['Continuous', 'feedJumpRate', 'Feed jump rate'],
  ['Continuous', 'videoControlActions', 'Video control actions'],
  ['Intermittent', 'selfInitiatedIntensity', 'Self-initiated intensity'],
  ['Intermittent', 'event_snap_completed', 'Completed snaps'],
  ['Intermittent', 'quiz_attempts_total', 'Quiz attempts'],
  ['Proactive', 'keywordExplicitRate', 'Keyword explicit action rate'],
  ['Proactive', 'keywordNonEngagement', 'Keyword ignored/dismissed'],
  ['Proactive', 'quiz_attempts_total', 'Quiz attempts'],
  ['Proactive', 'event_frequency_changed', 'Frequency changes'],
];
console.log(
  markdownTable(
    ['Condition', 'Metric', 'rho with raw gain', 'rho with control', 'rho with distraction'],
    withinConditionSpecs.map(([condition, metric, label]) => {
      const subset = byCondition(condition);
      return [
        condition,
        label,
        format(spearman(subset.map((row) => [row[metric], row.gain]))),
        format(spearman(subset.map((row) => [row[metric], row.aiControl]))),
        format(spearman(subset.map((row) => [row[metric], row.aiDistracted]))),
      ];
    })
  )
);

const alphaRows = [
  [
    'UES overall',
    [
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
    ],
  ],
  ['Focused attention', ['uesAbsorbed', 'uesLost', 'uesTimeSlip']],
  ['Perceived usability', ['uesConfusingRev', 'uesFrustratedRev', 'uesTaxingRev']],
  ['Aesthetic appeal', ['uesAestheticItem', 'uesAttractive', 'uesSenses']],
  ['Reward', ['uesInterest', 'uesWorthwhile', 'uesRewarding']],
  ['AI burden reverse pair', ['aiLowBurden']],
];

console.log('\n## Internal Consistency Checks');
console.log(
  markdownTable(
    ['Scale', 'Items', 'Cronbach alpha'],
    alphaRows
      .filter(([, itemKeys]) => itemKeys.length > 1)
      .map(([label, itemKeys]) => [label, itemKeys.length, format(cronbachAlpha(rows, itemKeys))])
  )
);

console.log('\n## Proactive Keyword and Continuous Feed Rates');
console.log(
  markdownTable(
    ['Participant', 'Condition', 'Keyword explicit rate', 'Keyword non-engagement', 'Feed answer rate', 'Feed jump rate'],
    rows
      .filter((row) => row.condition === 'Proactive' || row.condition === 'Continuous')
      .map((row) => [
        row.id,
        row.condition,
        Number.isFinite(row.keywordExplicitRate) ? `${format(row.keywordExplicitRate * 100)}%` : '',
        Number.isFinite(row.keywordNonEngagement) ? row.keywordNonEngagement : '',
        Number.isFinite(row.feedAnswerRate) ? `${format(row.feedAnswerRate * 100)}%` : '',
        Number.isFinite(row.feedJumpRate) ? `${format(row.feedJumpRate * 100)}%` : '',
      ])
  )
);
