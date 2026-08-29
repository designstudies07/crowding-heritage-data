#!/usr/bin/env python3
"""Deterministic pixel-difference audit of the 16 authored Study 2 images.

This is not a perceptual validation, person detector, or architectural
occlusion measure. It quantifies how much each authored state differs from its
matched empty image while preserving native image registration.

The stimulus images themselves are not redistributed in the public repository;
supply their local directory with --stimuli when running this audit.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image


LANDMARKS = ("notre_dame", "duomo", "colosseum", "cologne")
STATES = ("empty", "low", "moderate", "high")
STATE_ORDER = {state: index for index, state in enumerate(STATES)}
CHANGE_THRESHOLD = 12.0  # mean absolute RGB-channel difference on the 0-255 scale


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--stimuli",
        type=Path,
        required=True,
        help=(
            "Path to the locally available experimental stimulus directory. "
            "The stimulus images are not redistributed with the public repository."
        ),
    )
    parser.add_argument(
        "--outdir",
        type=Path,
        default=Path("materials"),
        help="Directory for the CSV and JSON audit outputs (default: materials).",
    )
    args = parser.parse_args()
    if not args.stimuli.exists():
        parser.error(f"Stimulus directory does not exist: {args.stimuli}")
    args.outdir.mkdir(parents=True, exist_ok=True)

    rows = []
    for landmark in LANDMARKS:
        empty = load_rgb(args.stimuli / f"{landmark}_empty.jpg")
        height, width = empty.shape[:2]
        for state in STATES:
            image = load_rgb(args.stimuli / f"{landmark}_{state}.jpg")
            if image.shape != empty.shape:
                raise ValueError(f"Image registration mismatch for {landmark}_{state}: {image.shape} vs {empty.shape}")
            pixel_difference = np.abs(image - empty).mean(axis=2)
            lower_half = pixel_difference[height // 2 :, :]
            rows.append(
                {
                    "landmark": landmark,
                    "state": state,
                    "state_order": STATE_ORDER[state],
                    "width_px": width,
                    "height_px": height,
                    "mean_absolute_rgb_difference_0_255": float(pixel_difference.mean()),
                    "changed_pixel_share_threshold_12": float((pixel_difference > CHANGE_THRESHOLD).mean()),
                    "lower_half_changed_pixel_share_threshold_12": float((lower_half > CHANGE_THRESHOLD).mean()),
                }
            )

    frame = pd.DataFrame(rows)
    nonempty = frame[frame["state"] != "empty"].copy()
    means = (
        nonempty.groupby(["state", "state_order"])
        .agg(
            mean_absolute_rgb_difference_0_255=("mean_absolute_rgb_difference_0_255", "mean"),
            changed_pixel_share_threshold_12=("changed_pixel_share_threshold_12", "mean"),
            lower_half_changed_pixel_share_threshold_12=("lower_half_changed_pixel_share_threshold_12", "mean"),
        )
        .reset_index()
        .sort_values("state_order")
    )
    monotonic = {}
    for landmark, group in nonempty.groupby("landmark"):
        ordered = group.sort_values("state_order")
        monotonic[landmark] = {
            "mean_absolute_rgb_difference": bool(ordered["mean_absolute_rgb_difference_0_255"].is_monotonic_increasing),
            "changed_pixel_share": bool(ordered["changed_pixel_share_threshold_12"].is_monotonic_increasing),
            "lower_half_changed_pixel_share": bool(ordered["lower_half_changed_pixel_share_threshold_12"].is_monotonic_increasing),
        }

    summary = {
        "scope": "post hoc deterministic image-difference audit",
        "reference": "each landmark's authored empty image",
        "threshold": "mean absolute RGB-channel difference > 12 on the 0-255 scale",
        "limitations": [
            "not an independent perceptual manipulation check",
            "not a visible-person count",
            "not a person mask or architectural-occlusion estimate",
            "cannot separate headcount, placement, salience, and retouching changes",
        ],
        "state_means": means.to_dict(orient="records"),
        "monotonic_within_landmark": monotonic,
    }
    frame.to_csv(args.outdir / "study2_stimulus_image_difference_audit.csv", index=False)
    (args.outdir / "study2_stimulus_image_difference_audit.json").write_text(
        json.dumps(summary, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
