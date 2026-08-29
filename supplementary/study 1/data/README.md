# Study 1 data release notes

## Included

- `study1_subjective_ratings_long.csv`
  - 20 pseudonymous participants
  - two conditions (`empty`, `crowded`)
  - four image positions per condition
  - three 1–5 subjective ratings per image
- `study1_subjective_ratings_codebook.csv`
- `study1_demographics_aggregate.md`

The public subjective-rating file excludes exact age, detailed department, handedness, names, email
addresses, timestamps, and free-text fields.

## Participant-code boundary

The `P01`–`P20` codes in the two subjective-rating source workbooks are consistent with each other.
However, the legacy standalone `anonymized_demographics.csv` uses a different row mapping for the
same labels. Therefore, that old row-level demographics file is **not** included here and must not be
joined to this ratings file by participant code.

Likewise, no mapping is inferred between these `P01`–`P20` rating codes and the first-name-like labels
in the legacy EEG filenames.

## Participant-level EEG and gaze

Participant-level EEG files remain excluded from this public release until the legacy filename mapping
is verified against original laboratory records and any identity-bearing filenames/metadata are removed
from a fresh repository history. Participant-level gaze files are not redistributed here.
