# Study 2 Reanalysis: Interaction Trajectories and Mixed Models

The four crowd states are retained as ordered categories; no dichotomized contrast is treated as primary. Transition, first-participant-initiated-to-final change, unique-state, switching, revisiting, and density-specific dwell analyses are labeled exploratory. No contrast is characterized as preregistered or prespecified.

## Ordered final-state model

A cumulative-logit mixed model used a participant random intercept and fixed effects for task, randomized initial-state score, task × initial state, trial order, landmark, design education, prior visit, visual familiarity, and spatial knowledge. Landmark was fixed because the study contains four purposefully selected scenes.

- Visit task: OR = 1.43 for a higher final state, 95% CI [0.90, 2.27], p = .135.
- Initial state: OR = 0.92 per level, 95% CI [0.67, 1.25], p = .591.
- Task × initial state: OR = 1.14, 95% CI [0.72, 1.79], p = .573.

The task direction is compatible with higher choices for imagined visits but is imprecise. We did not reliably detect persistence of the randomized initial level.

## Proportional-odds sensitivity

Three threshold-specific logistic mixed models retained the primary covariates and participant random intercept. Visit-task ORs were 1.28 (95% CI [0.61, 2.70]) for above-empty, 2.00 [1.07, 3.76] for moderate/high versus empty/low, and 1.39 [0.69, 2.79] for high versus lower states. Initial-state ORs were 0.81 [0.48, 1.36], 0.87 [0.58, 1.32], and 0.92 [0.57, 1.51]. The middle task split was stronger than the other thresholds, so the primary proportional-odds task coefficient should be read as an average association rather than a uniform effect. The initial-state sensitivity did not reveal positive anchoring, but it is not an equivalence test.

## Randomized initial state and final commitment

Seventy-two of 260 trials (27.7%) ended on the randomized initial state; 188 (72.3%) ended elsewhere. A 50,000-draw within-participant permutation preserved one occurrence of each initial state. The randomization reference mean was 25.0%, with a 95% interval of [20.8%, 29.2%]; the one-sided probability of at least the observed match rate was .129.

## Comparison, revision, and dwell

- Viewed all four states: 204/260 (78.5%).
- Revisited a previously viewed state: 207/260 (79.6%).
- Returned to the randomized initial state: 177/260 (68.1%).
- Final commitment differed from the first participant-initiated state: 174/260 (66.9%).
- Mean switch count: 4.95; median 5; IQR [4, 6].
- Mean unique states viewed: 3.59; median 4.
- Mean return transitions: 2.36.
- Mean direction reversals: 2.01.

Mean exploration-time shares were 22.6%, 25.9%, 24.1%, and 27.5% for empty through high in feature trials, and 20.9%, 24.9%, 26.0%, and 28.3% in visit trials. Dwell was distributed across states; time on a state is not equivalent to final preference.

## Feature accuracy

A logistic mixed model used a participant random intercept. The committed-state association was imprecise (OR = 1.20 per level, 95% CI [0.48, 3.00], p = .694). Raw accuracy differed sharply by scene/target: Cologne 91.2%, Duomo 87.5%, Notre-Dame 74.2%, and Colosseum 36.4%. The feature result is interpreted primarily as scene/target structure.

## Reproducibility files

The `reanalysis` directory contains full model output in JSON and one-row-per-trial derived trace metrics in CSV. `analysis/reanalyze_interaction_traces.py` fits the primary and threshold-specific mixed models with Gauss–Hermite quadrature and writes the reported matrices and summaries.
