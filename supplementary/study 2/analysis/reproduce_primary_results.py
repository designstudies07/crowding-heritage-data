#!/usr/bin/env python3
"""Reproduce the primary descriptive and paired results from the anonymous CSV.

Usage:
    python analysis/reproduce_primary_results.py
    python analysis/reproduce_primary_results.py --data path/to/study2_public_data.csv

The script uses only the Python standard library. It prints JSON and writes the
same object to reproduced_primary_results.json next to the input data file.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
from collections import Counter, defaultdict
from pathlib import Path


DENSITIES = ("empty", "low", "moderate", "high")
SCORE = {name: i for i, name in enumerate(DENSITIES)}


def mean(values):
    return sum(values) / len(values)


def percentile(sorted_values, probability):
    if not sorted_values:
        return None
    position = (len(sorted_values) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] * (1 - fraction) + sorted_values[upper] * fraction


def bootstrap_ci(values, iterations=20000, seed=20270828):
    rng = random.Random(seed)
    n = len(values)
    estimates = sorted(mean([values[rng.randrange(n)] for _ in range(n)]) for _ in range(iterations))
    return [percentile(estimates, 0.025), percentile(estimates, 0.975)]


def sign_flip_p(values, iterations=500000, seed=20260828):
    rng = random.Random(seed)
    observed = abs(mean(values))
    extreme = 0
    for _ in range(iterations):
        estimate = mean([value if rng.random() < 0.5 else -value for value in values])
        extreme += abs(estimate) >= observed - 1e-15
    return (extreme + 1) / (iterations + 1)


def wilson(successes, total, z=1.959963984540054):
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    half_width = z * math.sqrt((proportion * (1 - proportion) + z * z / (4 * total)) / total) / denominator
    return [center - half_width, center + half_width]


def numeric(row, key):
    value = row.get(key, "")
    return None if value == "" else float(value)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "study2_public_data.csv",
    )
    args = parser.parse_args()
    with args.data.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    participant_ids = sorted({row["participant_id"] for row in rows})
    task_rows = {task: [row for row in rows if row["task_type"] == task] for task in ("feature", "visit")}

    density_counts = {
        task: dict(Counter(row["committed_density"] for row in task_rows[task]))
        for task in task_rows
    }
    for task in density_counts:
        density_counts[task] = {density: density_counts[task].get(density, 0) for density in DENSITIES}

    by_participant = defaultdict(lambda: defaultdict(list))
    for row in rows:
        by_participant[row["participant_id"]][row["task_type"]].append(row)

    moderate_high_differences = []
    density_score_differences = []
    selection_time_differences = []
    control_usefulness_differences = []
    for participant_id in participant_ids:
        feature = by_participant[participant_id]["feature"]
        visit = by_participant[participant_id]["visit"]
        moderate_high_differences.append(
            mean([row["committed_density"] in ("moderate", "high") for row in visit])
            - mean([row["committed_density"] in ("moderate", "high") for row in feature])
        )
        density_score_differences.append(
            mean([SCORE[row["committed_density"]] for row in visit])
            - mean([SCORE[row["committed_density"]] for row in feature])
        )
        selection_time_differences.append(
            mean([numeric(row, "selection_time_s") for row in visit])
            - mean([numeric(row, "selection_time_s") for row in feature])
        )
        control_usefulness_differences.append(
            mean([numeric(row, "rating_control_usefulness") for row in visit])
            - mean([numeric(row, "rating_control_usefulness") for row in feature])
        )

    feature_rows = task_rows["feature"]
    feature_correct = sum(int(float(row["accuracy"])) for row in feature_rows)

    def accuracy_group(key):
        result = {}
        for name in sorted({row[key] for row in feature_rows}):
            group = [row for row in feature_rows if row[key] == name]
            successes = sum(int(float(row["accuracy"])) for row in group)
            result[name] = {
                "correct": successes,
                "n": len(group),
                "proportion": successes / len(group),
                "wilson_95_ci": wilson(successes, len(group)),
            }
        return result

    final_rating_keys = (
        "final_usefulness",
        "final_ease",
        "final_representational_value",
        "final_future_preference",
    )
    first_rows = [by_participant[participant_id]["feature"][0] for participant_id in participant_ids]
    final_ratings = {
        key: mean([numeric(row, key) for row in first_rows]) for key in final_rating_keys
    }

    output = {
        "participants": len(participant_ids),
        "completed_trials": len(rows),
        "trials_by_task": {task: len(group) for task, group in task_rows.items()},
        "density_counts": density_counts,
        "moderate_or_high_rate": {
            task: sum(row["committed_density"] in ("moderate", "high") for row in group) / len(group)
            for task, group in task_rows.items()
        },
        "paired_visit_minus_feature": {
            "moderate_or_high": {
                "mean": mean(moderate_high_differences),
                "bootstrap_95_ci": bootstrap_ci(moderate_high_differences),
                "sign_flip_p_two_sided": sign_flip_p(moderate_high_differences),
            },
            "density_score_0_to_3": {
                "mean": mean(density_score_differences),
                "bootstrap_95_ci": bootstrap_ci(density_score_differences, seed=20270829),
                "sign_flip_p_two_sided": sign_flip_p(density_score_differences, seed=20270829),
            },
            "selection_time_s": {
                "mean": mean(selection_time_differences),
                "bootstrap_95_ci": bootstrap_ci(selection_time_differences, seed=20270830),
                "sign_flip_p_two_sided": sign_flip_p(selection_time_differences, seed=20270830),
            },
            "control_usefulness_1_to_7": {
                "mean": mean(control_usefulness_differences),
                "bootstrap_95_ci": bootstrap_ci(control_usefulness_differences, seed=20270831),
                "sign_flip_p_two_sided": sign_flip_p(control_usefulness_differences, seed=20270831),
            },
        },
        "feature_accuracy": {
            "correct": feature_correct,
            "n": len(feature_rows),
            "proportion": feature_correct / len(feature_rows),
            "wilson_95_ci": wilson(feature_correct, len(feature_rows)),
            "by_density": accuracy_group("committed_density"),
            "by_landmark": accuracy_group("landmark_id"),
        },
        "selection_time_s_mean": {
            task: mean([numeric(row, "selection_time_s") for row in group])
            for task, group in task_rows.items()
        },
        "switch_count_mean": {
            task: mean([numeric(row, "switch_count") for row in group])
            for task, group in task_rows.items()
        },
        "final_ratings_mean": final_ratings,
    }
    target = args.data.parent / "reproduced_primary_results.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
