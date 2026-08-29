# Study 1 Protocol and Aggregate Results

## Scope

Study 1 was a controlled within-participant laboratory pilot examining empty and highly crowded exterior representations of four heritage landmarks. This anonymous review summary contains protocol details and aggregate results only. It does not contain participant-level EEG or gaze data.

## Participants and ethics

Twenty adults participated (10 women, 10 men; age range 18–43 years, M = 23.65, SD = 6.98). Institutional ethics approval was obtained before data collection, the same approval covered Study 2, and participants completed informed consent. Committee, institution, decision-number, and exact-date identifiers are withheld in this double-anonymous package and retained in the private author record.

## Stimuli and design

The landmarks were Notre-Dame in Paris, Milan Cathedral (Duomo), the Colosseum in Rome, and Cologne Cathedral. Initial architectural references were captured from Google Maps Street View using a consistent viewpoint and framing for each landmark. An AI-assisted Gemini AI Pro workflow removed people, vehicles, and other transient elements for the uncrowded versions and added tourist-like human figures for the high-density versions. Outputs were manually inspected and corrected in Adobe Photoshop using layer-based masking and retouching; original façade surfaces, textures, shadows, color, lighting, and architectural details were selectively reinstated when synthesis introduced distortions or local inconsistencies.

The two condition blocks were counterbalanced, and images within a block were randomized. Trials used a one-second fixation, a five-second image, a five-point visual-appeal rating, and approximately one to two seconds of jitter. A one-minute eyes-open baseline preceded the task.

## Apparatus and measures

Stimuli appeared on a 24-inch 1920 × 1080 display at an approximate 60 cm viewing distance in a quiet, dimly lit room. Wearable EEG was recorded with a four-channel Muse 2 headset (TP9, AF7, AF8, TP10) at 256 Hz. Signals were band-pass filtered from 1–40 Hz, visually screened, epoched to stimulus onset, and baseline-corrected; trials with more than 25% signal loss or saturation were rejected. Conservative four-channel ICA removed only clear blink or gross-movement components. Welch power spectral density yielded alpha (8–12 Hz) and beta (13–30 Hz) estimates. Band values were normalized to the eyes-open baseline as `(P_condition − P_baseline) / (|P_baseline| + ε)`. The arousal-related index was `(β_AF7 + β_AF8) / (α_AF7 + α_AF8)`, and the valence-related index was `α_AF7 − α_AF8`, using baseline-normalized band values.


Webcam gaze was recorded with RealEye. Recordings with low data quality or poor calibration were excluded. Fixation heatmaps used first-exposure trials and fixations from 0.5–5.0 s after image onset. Because webcam-based eye tracking is sensitive to calibration quality, head movement, and viewing conditions, the heatmaps are interpreted descriptively rather than as inferential population-level gaze estimates. Visual appeal was recorded after each image and provides the clearest quantitative result.

## Reanalysis of visual appeal

All 20 participants contributed one rating in each condition for every landmark, giving 160 ratings. The primary comparison averaged the four landmarks within participant.

- Empty mean: 4.25 of 5
- High-density mean: 3.53 of 5
- High-density minus empty: −0.73
- Participant-level bootstrap 95% CI: [−1.10, −0.39]
- Exact two-sided sign-flip test: p < .001
- Cohen's dz: −0.87
- Participant directions: 16 lower under high density, 3 equal, 1 higher

Descriptive empty-minus-high-density differences were 0.90 for Cologne Cathedral, 0.85 for the Colosseum, 0.70 for Duomo, and 0.45 for Notre-Dame.

## Multimodal condition-level results

The baseline-referenced EEG indices showed a directionally consistent condition-level pattern. Arousal-related values were negative relative to baseline in both conditions and shifted more strongly negative for crowded scenes. Valence-related values were positive for uncrowded scenes but closer to zero or slightly negative for crowded scenes. These four-channel wearable-EEG patterns are treated as baseline-referenced descriptive physiological indicators associated with the viewing condition; they are not interpreted as direct evidence of discrete emotional states or as standalone confirmatory outcomes.

Across the four landmarks, fixation heatmaps appeared more concentrated on central façade elements, openings, vertical alignments, and the main architectural mass under uncrowded views. Under crowded views, attention appeared more broadly dispersed across the lower visual field and socially populated areas. These are descriptive heatmap observations rather than inferential gaze claims.

Visual-appeal ratings were lower for crowded views across all four landmarks, with a participant-level paired mean difference of −0.73 and a bootstrap 95% CI of [−1.10, −0.39]. Considered together, the three domains suggest that crowd presence was consequential across physiological response, visual attention, and appraisal. The study did not test a causal chain, correlation, or mediation among the modalities.

## Review-package data boundary

Study 1 participant-level EEG and gaze files are not included in this public repository. The repository therefore provides protocol information and aggregate Study 1 results only.
