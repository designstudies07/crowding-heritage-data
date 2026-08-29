# Study 2 Protocol Summary

## Research question

Study 2 examined how participants interacted with four authored crowd states when those states were made immediately inspectable and reversible, and how task demands, feature-finding performance, and subjective appraisals contextualized those interaction trajectories. The two task contexts were locating a named architectural feature and selecting a depiction useful for imagining a future visit.

## Participants and eligibility

The analysis includes 65 adults aged 18–62. Participation required age 18 or older, self-reported normal or corrected-to-normal vision, and a desktop or laptop computer. The application did not request names or email addresses and generated an anonymous study code.

## Design

Each participant completed four timed trials: two `feature` and two `visit` trials. Four landmarks appeared once per participant: Notre-Dame, Milan Cathedral (Duomo), the Colosseum, and Cologne Cathedral. Sixteen predefined programs counterbalanced landmark–task pairings and order. The application selected among programs with the lowest number of completed sessions and broke ties randomly.

Each landmark had four authored ordinal states: `empty`, `low`, `moderate`, and `high`. Initial architectural references were captured from Google Maps Street View using consistent viewpoint and framing. Gemini AI Pro assisted removal or addition of transient street elements and tourist-like human figures; Adobe Photoshop layer-based masking and manual retouching corrected façade, texture, shadow, color, lighting, and architectural-detail inconsistencies. The Study 2 sets retained the Study 1 endpoints and extended the same matched-image workflow to low and moderate occupancy states. A post hoc native-resolution image-difference audit found monotonically increasing change from low to moderate to high within every landmark (mean absolute RGB difference from empty: 6.84, 10.93, and 17.39 on the 0–255 scale). This is not a perceptual validation, visible-person count, person mask, or architectural-occlusion estimate. The labels therefore combine headcount, placement, occlusion, foreground mass, and salience. A randomized state appeared when the participant started a trial.

## Procedure

Participants completed informed consent, demographic questions, landmark familiarity questions, a mandatory density-control tutorial, and one practice trial of each task. The tutorial required opening all four states; the four experimental trials did not require opening any state beyond the randomized start. Participants then completed final interface ratings.

In every trial, participants saw the task before the image. After pressing Start, they could move freely among four labeled density states and then committed one. Feature trials retained the committed image and asked the participant to click a named architectural target. Visit trials hid the image after commitment and presented experience ratings.

## Application implementation

The client used static HTML, CSS, and JavaScript. Three Netlify serverless functions handled completion-balanced assignment, trial recording, and final session submission. Those functions called Supabase stored procedures with server-held environment variables; no privileged key was embedded in the browser client. The anonymous supplement includes the client, serverless functions, and Supabase schema, but excludes deployment credentials and URLs.

## Measures

The released table contains the randomized initial density, first participant-initiated density, and committed density; the full state sequence; switch count; unique levels viewed; time spent in each density; selection time; task-specific outcomes; familiarity covariates; trial ratings; final interface ratings; and a focus/reload sensitivity flag.

Feature accuracy used a predefined area of interest. For correct trials, localization time runs from commitment to the target click. Seven-point ratings were used for confidence, comparison benefit, control usefulness, self-location imagery, informational adequacy, realism, aesthetics, comfort, and final interface evaluation.

## Ethics and consent

Study 2 was covered by the same institutional ethics approval as Study 1. The application required four explicit electronic consent confirmations before profile, tutorial, or task data were collected and used anonymous codes and data-minimized collection. Committee, institution, decision-number, and exact-date identifiers are withheld from this double-anonymous public package.

## Data freeze and exclusions

The frozen data collection contained 98 assignments. Thirty-two were incomplete. One completed-marker record was a legacy pilot without an analyzable session and was excluded. Three partial trial rows from two incomplete sessions were excluded. Every included participant completed exactly four trials, producing 260 analyzed trials.

Visibility and reload events were logged but were not automatic exclusions. Twelve included participants received the focus/reload sensitivity flag. The complete-session sample is primary; event-filtered summaries are a robustness check.

## Analysis outline

Committed state is analyzed as a four-category ordered outcome with a cumulative-logit mixed model and participant random intercept. Fixed effects include task, randomized initial state, their interaction, trial order, participant characteristics, familiarity, and landmark. Three threshold-specific logistic mixed models with the same covariates and participant random intercept provide a proportional-odds sensitivity check. Initial-state matching is evaluated with a within-participant permutation that preserves one occurrence of every randomized state. Sequence analyses derive all-state exposure, revisiting, return to the randomized initial state, change from the first participant-initiated state, transition direction, and per-state dwell. These trace analyses are exploratory. Feature accuracy uses a participant-random-intercept logistic mixed model, while ratings by self-selected state are descriptive and noncausal. The analyses are not characterized as preregistered or prespecified.
