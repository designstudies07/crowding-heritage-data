# Study 2 — Anonymous Supplementary Materials

This directory contains the de-identified data, analysis code, reanalysis outputs,
methodological documentation, and application source for Study 2 of the CHI submission.

## Study overview

Study 2 examined how participants interacted with four authored crowd states
(`empty`, `low`, `moderate`, `high`) when those states were immediately inspectable
and reversible in a browser interface.

The analyzed sample contains:

- **65 participants**
- **4 trials per participant**
- **260 trials total**
- two task contexts:
  - `feature`: locate a named architectural feature after committing to a crowd state
  - `visit`: select a representation useful for imagining a future visit

The four heritage landmarks were Notre-Dame, Milan Cathedral (Duomo), the Colosseum,
and Cologne Cathedral. Landmark-task pairing and order were counterbalanced through
16 predefined experimental programs.

## Directory structure

```text
study 2/
├── analysis/
│   ├── audit_study2_stimuli(1).py
│   ├── reanalyze_interaction_traces(1).py
│   └── reproduce_primary_results(1).py
├── data/
│   ├── reproduced_primary_results.json
│   ├── study2_codebook.csv
│   └── study2_public_data.csv
├── materials/
│   ├── study1_protocol_and_results_summary.md
│   ├── study2_protocol_summary.md
│   ├── study2_stimulus_image_difference_audit.csv
│   └── study2_stimulus_image_difference_audit.json
├── reanalysis/
│   ├── reanalyze_interaction_traces.py
│   ├── study2_reanalysis_report.md
│   ├── study2_reanalysis_results.json
│   └── study2_trial_trace_metrics.csv
└── software/
    ├── browser_app/
    │   ├── app.js
    │   ├── config.js
    │   ├── index.html
    │   ├── styles.css
    │   ├── netlify.toml
    │   └── netlify/functions/
    │       ├── assign.js
    │       ├── complete.js
    │       └── trial.js
    └── supabase/
        └── schema.sql
```

## Public data

`data/study2_public_data.csv` is the de-identified analysis dataset.

It contains randomized public participant codes rather than internal study identifiers.
The public release excludes names, email addresses, exact timestamps, open-text responses,
deployment identifiers, credentials, and privileged infrastructure configuration.
Age is coarsened for public release.

`data/study2_codebook.csv` documents all released variables.

## Reproducing the primary descriptive results

The simplest reproduction script uses only the Python standard library:

```bash
python "analysis/reproduce_primary_results(1).py" --data data/study2_public_data.csv
```

It prints the reproduced summary and writes `reproduced_primary_results.json`
next to the input data file.

## Reanalysis

The fuller interaction-trajectory and mixed-model analysis is available in:

```text
reanalysis/reanalyze_interaction_traces.py
```

From the Study 2 directory, run:

```bash
python reanalysis/reanalyze_interaction_traces.py
```

The script uses `numpy`, `pandas`, and `Pillow` and implements the mixed-model
likelihood calculations directly with Gauss-Hermite quadrature.

The corresponding archived outputs are:

- `reanalysis/study2_reanalysis_report.md`
- `reanalysis/study2_reanalysis_results.json`
- `reanalysis/study2_trial_trace_metrics.csv`

## Stimulus image-difference audit

The experimental stimulus images themselves are **not redistributed** in this repository.

The post hoc image-difference audit is provided for methodological transparency and
does not constitute perceptual validation, person counting, a person mask, or an
architectural-occlusion measure.

To rerun the audit with locally available stimulus images:

```bash
python "analysis/audit_study2_stimuli(1).py" --stimuli /path/to/local/stimuli
```

The expected filenames are the landmark and density names retained in the application
configuration, for example `notre_dame_empty.jpg` and `notre_dame_high.jpg`.

## Application source

`software/browser_app/` contains the browser application used for Study 2.

The client was implemented in static HTML, CSS, and JavaScript. Netlify serverless
functions handled program assignment, trial recording, and final session submission.
The functions communicated with Supabase through server-held environment variables.
No service-role key or deployment credential is included in this repository.

`software/supabase/schema.sql` contains the database tables and server-side procedures
used for assignment, trial persistence, and validated final-session submission.

## Terminology note

The deployed application and raw public dataset retain the historical field name
`first_user_selected_density`. In the manuscript and derived analysis outputs, this is
described more precisely as the **first participant-initiated state** after the randomized
starting display. The raw field name is retained to preserve provenance.

## Main interaction-trace results

The archived reanalysis reports that:

- 72.3% of trials ended on a state different from the randomized starting state;
- 78.5% of trials included all four states;
- 79.6% revisited a previously viewed state;
- 66.9% ended on a state different from the first participant-initiated state.

These interaction-trace analyses are treated as exploratory.

## Ethics and anonymous review

Study 2 was covered by the institutional ethics approval described in the manuscript.
The application required explicit electronic consent before participant profile,
tutorial, or task data were collected.

For double-anonymous review, committee, institution, decision-number, and exact-date
identifiers are intentionally omitted from this package.

## Scope and limitations

This repository supports reproducibility of the released Study 2 analyses and software.
It does not redistribute the experimental stimulus images and should not be interpreted
as an independent validation of crowd-density perception. Associations between
self-selected states and ratings or task performance are descriptive/noncausal unless
otherwise specified in the manuscript.
