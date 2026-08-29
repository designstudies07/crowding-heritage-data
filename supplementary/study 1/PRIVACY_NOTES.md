# Privacy and anonymization notes

## Subjective-rating workbooks

The original `EMPTY VERSION ANSWERS.xlsx` and `CROWDED VERSION ANSWERS.xlsx` were audited as real
Excel workbooks. Their participant/profile columns are identical across conditions, and their rating
rows use pseudonymous `P01`–`P20` codes.

For public release, the workbooks were **not copied directly**. A fresh CSV was created containing only:
participant code, condition, image order, and the three 1–5 rating outcomes.

Participant-level exact age, detailed department, and handedness were removed.

A legacy standalone demographics CSV was also reviewed and found to use a different `P01`–`P20`
row mapping from the rating workbooks. It is excluded to prevent a false participant-level linkage.

## EEG

The legacy EEG folder contains identity-bearing first-name-like filename labels. No crosswalk to
`P01`–`P20` is inferred. Participant-level EEG remains excluded until original records are used to
verify the analyzed N=20 sample and a fresh history is created without identity-bearing filenames.

## Not for CHI author identification

The two legacy public GitHub repositories are author-identifying. They should not be linked directly
from a double-anonymous CHI review package.
