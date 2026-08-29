# Study 1 — privacy-cleaned public-release package

This package contains privacy-cleaned Study 1 analysis code and minimized subjective-rating data.

## Contents

```text
code/
  study1_eeg_processing_clean.ipynb
  study1_figures_clean.ipynb

data/
  study1_subjective_ratings_long.csv
  study1_subjective_ratings_codebook.csv
  study1_demographics_aggregate.md
  README.md

PRIVACY_NOTES.md
```

## Public data boundary

The subjective-rating source workbooks were re-read from the original `.xlsx` files and converted to
a new long-form CSV containing only pseudonymous participant code, condition, image order, and the
three rating outcomes.

Exact age, detailed department, handedness, workbook metadata, and other quasi-identifiers are not
redistributed at participant level.

A discrepancy was identified between the `P01`–`P20` ordering in the source rating workbooks and the
legacy standalone `anonymized_demographics.csv`. The legacy demographics table is therefore excluded
from this package and should not be joined to the ratings by participant code.

## EEG boundary

The legacy EEG repository contains first-name-like labels in filenames. No mapping from those labels
to `P01`–`P20` is guessed here. Participant-level EEG should be released only after a verified private
crosswalk is created from the original laboratory record and a fresh public repository history is built.

## CHI anonymous review

Do not host this review package under a personal author-identifying GitHub account if it is linked from
a double-anonymous CHI submission. Use an anonymous review repository/supplement, then restore normal
author-linked archival references after anonymity is no longer required.
