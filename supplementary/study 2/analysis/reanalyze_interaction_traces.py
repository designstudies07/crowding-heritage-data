#!/usr/bin/env python3
"""Reviewer-oriented Study 2 reanalysis for the CHI manuscript.

The script deliberately avoids dichotomizing the four density states. It fits
an ordinal cumulative-logit mixed model with a participant random intercept,
then derives transparent interaction-trace summaries from the logged state
sequences. A separate logistic mixed model evaluates feature accuracy while
making landmark/target difficulty explicit.

Only numpy, pandas, and Pillow are required; the mixed-model likelihoods are
integrated with Gauss-Hermite quadrature and optimized with a small BFGS
implementation so the analysis is reproducible in the locked bundle.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageFont


DENSITIES = ("empty", "low", "moderate", "high")
SCORE = {name: i for i, name in enumerate(DENSITIES)}
SEED = 20270828


def logistic(x):
    x = np.clip(x, -35.0, 35.0)
    return 1.0 / (1.0 + np.exp(-x))


def logsumexp(a, axis=None):
    m = np.max(a, axis=axis, keepdims=True)
    result = m + np.log(np.sum(np.exp(a - m), axis=axis, keepdims=True))
    if axis is not None:
        result = np.squeeze(result, axis=axis)
    return result


def finite_gradient(fun, x, rel_step=2e-5):
    g = np.zeros_like(x)
    for j in range(len(x)):
        h = rel_step * max(1.0, abs(float(x[j])))
        xp = x.copy(); xp[j] += h
        xm = x.copy(); xm[j] -= h
        g[j] = (fun(xp) - fun(xm)) / (2.0 * h)
    return g


def finite_hessian(fun, x, rel_step=2e-4):
    n = len(x)
    hess = np.zeros((n, n))
    f0 = fun(x)
    steps = np.array([rel_step * max(1.0, abs(float(v))) for v in x])
    for i in range(n):
        ei = np.zeros(n); ei[i] = steps[i]
        f_plus, f_minus = fun(x + ei), fun(x - ei)
        hess[i, i] = (f_plus - 2.0 * f0 + f_minus) / (steps[i] ** 2)
        for j in range(i + 1, n):
            ej = np.zeros(n); ej[j] = steps[j]
            value = (
                fun(x + ei + ej) - fun(x + ei - ej)
                - fun(x - ei + ej) + fun(x - ei - ej)
            ) / (4.0 * steps[i] * steps[j])
            hess[i, j] = hess[j, i] = value
    return hess


def bfgs(fun, x0, max_iter=180, tolerance=1e-4):
    x = np.asarray(x0, dtype=float).copy()
    n = len(x)
    inverse = np.eye(n)
    f = fun(x)
    g = finite_gradient(fun, x)
    history = [{"iteration": 0, "nll": float(f), "gradient_max": float(np.max(np.abs(g)))}]
    converged = False
    for iteration in range(1, max_iter + 1):
        if np.max(np.abs(g)) < tolerance:
            converged = True
            break
        direction = -inverse @ g
        if float(direction @ g) >= 0:
            direction = -g
            inverse = np.eye(n)
        step = 1.0
        directional = float(g @ direction)
        accepted = False
        for _ in range(35):
            candidate = x + step * direction
            f_candidate = fun(candidate)
            if np.isfinite(f_candidate) and f_candidate <= f + 1e-4 * step * directional:
                accepted = True
                break
            step *= 0.5
        if not accepted:
            break
        g_candidate = finite_gradient(fun, candidate)
        s = candidate - x
        y = g_candidate - g
        ys = float(y @ s)
        if ys > 1e-10:
            rho = 1.0 / ys
            identity = np.eye(n)
            inverse = (identity - rho * np.outer(s, y)) @ inverse @ (identity - rho * np.outer(y, s)) + rho * np.outer(s, s)
        else:
            inverse = np.eye(n)
        x, f, g = candidate, f_candidate, g_candidate
        if iteration <= 10 or iteration % 10 == 0:
            history.append({"iteration": iteration, "nll": float(f), "gradient_max": float(np.max(np.abs(g))), "step": float(step)})
    if np.max(np.abs(g)) < max(tolerance, 1e-4):
        converged = True
    return {"x": x, "fun": float(f), "gradient": g, "inverse_bfgs": inverse,
            "iterations": iteration, "converged": converged, "history": history}


def normal_p(z):
    return math.erfc(abs(float(z)) / math.sqrt(2.0))


def model_table(names, beta, covariance):
    rows = []
    for i, name in enumerate(names):
        se = math.sqrt(max(0.0, float(covariance[i, i])))
        z = float(beta[i]) / se if se > 0 else float("nan")
        rows.append({
            "term": name,
            "estimate_log_odds": float(beta[i]),
            "standard_error": se,
            "odds_ratio": math.exp(float(beta[i])),
            "ci_95": [math.exp(float(beta[i]) - 1.959964 * se), math.exp(float(beta[i]) + 1.959964 * se)],
            "wald_p_two_sided": normal_p(z) if np.isfinite(z) else None,
        })
    return rows


def design_matrix(frame, outcome="density"):
    x = pd.DataFrame(index=frame.index)
    if outcome == "accuracy":
        x["intercept"] = 1.0
        x["committed_density_per_level"] = frame["committed_score"] - 1.5
    x["initial_density_per_level"] = frame["initial_score"] - 1.5
    if outcome == "density":
        x["visit_task"] = (frame["task_type"] == "visit").astype(float)
        x["visit_x_initial"] = x["visit_task"] * x["initial_density_per_level"]
    x["trial_order_per_step"] = frame["trial_order"].astype(float) - 2.5
    for landmark in ("duomo", "notre_dame", "colosseum"):
        x[f"landmark_{landmark}"] = (frame["landmark_id"] == landmark).astype(float)
    x["design_education"] = (frame["design_education"].astype(str).str.lower() == "yes").astype(float)
    x["previously_visited"] = (frame["familiarity_visited"].astype(str).str.lower() == "yes").astype(float)
    x["visual_familiarity_centered"] = pd.to_numeric(frame["familiarity_visual"], errors="coerce").fillna(1.0) - 1.0
    x["spatial_knowledge_centered"] = pd.to_numeric(frame["familiarity_spatial"], errors="coerce").fillna(1.0) - 1.0
    return x.astype(float)


def group_layout(frame):
    order = np.argsort(frame["participant_id"].astype(str).to_numpy(), kind="stable")
    ids = frame.iloc[order]["participant_id"].astype(str).to_numpy()
    starts = np.r_[0, np.where(ids[1:] != ids[:-1])[0] + 1]
    return order, starts


def fit_ordinal_mixed(frame, quadrature_points=17):
    xdf = design_matrix(frame, "density")
    names = list(xdf.columns)
    x = xdf.to_numpy()
    y = frame["committed_score"].astype(int).to_numpy()
    order, starts = group_layout(frame)
    x, y = x[order], y[order]
    nodes, weights = np.polynomial.hermite.hermgauss(quadrature_points)
    log_weights = np.log(weights) - 0.5 * math.log(math.pi)

    empirical = np.bincount(y, minlength=4) / len(y)
    cumulative = np.cumsum(empirical)[:-1]
    cuts = np.log(cumulative / (1.0 - cumulative))
    raw_cuts = np.array([cuts[0], math.log(max(cuts[1] - cuts[0], 0.2)), math.log(max(cuts[2] - cuts[1], 0.2))])
    initial = np.r_[raw_cuts, np.zeros(x.shape[1]), math.log(0.55)]

    def unpack(params):
        c1 = params[0]
        c2 = c1 + math.exp(np.clip(params[1], -8, 8))
        c3 = c2 + math.exp(np.clip(params[2], -8, 8))
        return np.array([c1, c2, c3]), params[3:-1], math.exp(np.clip(params[-1], -8, 4))

    def objective(params):
        cuts_now, beta, sigma = unpack(params)
        eta_base = x @ beta
        participant_log = []
        for node, log_w in zip(nodes, log_weights):
            eta = eta_base + math.sqrt(2.0) * sigma * node
            cum = logistic(cuts_now[:, None] - eta[None, :])
            probs = np.vstack((cum[0], cum[1] - cum[0], cum[2] - cum[1], 1.0 - cum[2]))
            chosen = np.maximum(probs[y, np.arange(len(y))], 1e-13)
            row_log = np.log(chosen)
            participant_log.append(np.add.reduceat(row_log, starts) + log_w)
        integrated = logsumexp(np.vstack(participant_log), axis=0)
        return -float(np.sum(integrated))

    fit = bfgs(objective, initial)
    hessian = finite_hessian(objective, fit["x"])
    covariance_all = np.linalg.pinv(hessian, rcond=1e-8)
    cuts_final, beta, sigma = unpack(fit["x"])
    covariance_beta = covariance_all[3:-1, 3:-1]
    return {
        "model": "cumulative logit mixed model with participant random intercept",
        "outcome": "committed density (empty < low < moderate < high)",
        "landmark_handling": "fixed effects (four stimulus scenes; Cologne reference)",
        "quadrature_points": quadrature_points,
        "n_trials": int(len(frame)),
        "n_participants": int(frame["participant_id"].nunique()),
        "converged": bool(fit["converged"]),
        "iterations": int(fit["iterations"]),
        "negative_log_likelihood": fit["fun"],
        "gradient_max": float(np.max(np.abs(fit["gradient"]))),
        "cutpoints": cuts_final.tolist(),
        "participant_random_intercept_sd": float(sigma),
        "coefficients": model_table(names, beta, covariance_beta),
        "optimization_history": fit["history"],
    }


def fit_threshold_binary_mixed(frame, threshold, quadrature_points=17):
    """Fit a cumulative threshold-specific mixed logit as a PO sensitivity check.

    The three models estimate P(Y > threshold) separately while retaining the
    same covariates and participant random intercept as the primary ordinal
    model. Variation across slopes is reported descriptively rather than
    treated as a formal equivalence test.
    """
    xdf = design_matrix(frame, "density")
    xdf.insert(0, "intercept", 1.0)
    names = list(xdf.columns)
    x = xdf.to_numpy()
    y = (frame["committed_score"].astype(int).to_numpy() > threshold).astype(int)
    order, starts = group_layout(frame)
    x, y = x[order], y[order]
    nodes, weights = np.polynomial.hermite.hermgauss(quadrature_points)
    log_weights = np.log(weights) - 0.5 * math.log(math.pi)
    overall = np.clip(y.mean(), 0.01, 0.99)
    initial = np.r_[math.log(overall / (1.0 - overall)), np.zeros(x.shape[1] - 1), math.log(0.55)]

    def unpack(params):
        return params[:-1], math.exp(np.clip(params[-1], -8, 4))

    def objective(params):
        beta, sigma = unpack(params)
        eta_base = x @ beta
        participant_log = []
        for node, log_w in zip(nodes, log_weights):
            eta = eta_base + math.sqrt(2.0) * sigma * node
            prob = logistic(eta)
            row_log = y * np.log(np.maximum(prob, 1e-13)) + (1 - y) * np.log(np.maximum(1 - prob, 1e-13))
            participant_log.append(np.add.reduceat(row_log, starts) + log_w)
        integrated = logsumexp(np.vstack(participant_log), axis=0)
        return -float(np.sum(integrated))

    fit = bfgs(objective, initial)
    hessian = finite_hessian(objective, fit["x"])
    covariance_all = np.linalg.pinv(hessian, rcond=1e-8)
    beta, sigma = unpack(fit["x"])
    return {
        "model": "threshold-specific logistic mixed model with participant random intercept",
        "outcome": f"committed density above {DENSITIES[threshold]}",
        "threshold": f"{DENSITIES[threshold]} | {'/'.join(DENSITIES[threshold + 1:])}",
        "quadrature_points": quadrature_points,
        "n_trials": int(len(frame)),
        "n_participants": int(frame["participant_id"].nunique()),
        "converged": bool(fit["converged"]),
        "iterations": int(fit["iterations"]),
        "negative_log_likelihood": fit["fun"],
        "gradient_max": float(np.max(np.abs(fit["gradient"]))),
        "participant_random_intercept_sd": float(sigma),
        "coefficients": model_table(names, beta, covariance_all[:-1, :-1]),
        "optimization_history": fit["history"],
    }


def fit_logistic_mixed(frame, quadrature_points=17):
    xdf = design_matrix(frame, "accuracy")
    names = list(xdf.columns)
    x = xdf.to_numpy()
    y = frame["accuracy"].astype(int).to_numpy()
    order, starts = group_layout(frame)
    x, y = x[order], y[order]
    nodes, weights = np.polynomial.hermite.hermgauss(quadrature_points)
    log_weights = np.log(weights) - 0.5 * math.log(math.pi)
    overall = np.clip(y.mean(), 0.01, 0.99)
    initial = np.r_[math.log(overall / (1.0 - overall)), np.zeros(x.shape[1] - 1), math.log(0.45)]

    def unpack(params):
        return params[:-1], math.exp(np.clip(params[-1], -8, 4))

    def objective(params):
        beta, sigma = unpack(params)
        eta_base = x @ beta
        participant_log = []
        for node, log_w in zip(nodes, log_weights):
            eta = eta_base + math.sqrt(2.0) * sigma * node
            prob = logistic(eta)
            row_log = y * np.log(np.maximum(prob, 1e-13)) + (1 - y) * np.log(np.maximum(1 - prob, 1e-13))
            participant_log.append(np.add.reduceat(row_log, starts) + log_w)
        integrated = logsumexp(np.vstack(participant_log), axis=0)
        return -float(np.sum(integrated))

    fit = bfgs(objective, initial)
    hessian = finite_hessian(objective, fit["x"])
    covariance_all = np.linalg.pinv(hessian, rcond=1e-8)
    beta, sigma = unpack(fit["x"])
    return {
        "model": "logistic mixed model with participant random intercept",
        "outcome": "feature AOI accuracy",
        "landmark_handling": "fixed effects (four target scenes; Cologne reference)",
        "quadrature_points": quadrature_points,
        "n_trials": int(len(frame)),
        "n_participants": int(frame["participant_id"].nunique()),
        "converged": bool(fit["converged"]),
        "iterations": int(fit["iterations"]),
        "negative_log_likelihood": fit["fun"],
        "gradient_max": float(np.max(np.abs(fit["gradient"]))),
        "participant_random_intercept_sd": float(sigma),
        "coefficients": model_table(names, beta, covariance_all[:-1, :-1]),
        "optimization_history": fit["history"],
    }


def percentile(values, q):
    return float(np.percentile(np.asarray(values, dtype=float), q))


def bootstrap_paired(frame, column, iterations=30000, seed=SEED):
    pivot = frame.groupby(["participant_id", "task_type"])[column].mean().unstack()
    diffs = (pivot["visit"] - pivot["feature"]).dropna().to_numpy(dtype=float)
    rng = np.random.default_rng(seed)
    draws = rng.choice(diffs, size=(iterations, len(diffs)), replace=True).mean(axis=1)
    flips = rng.choice(np.array([-1.0, 1.0]), size=(iterations, len(diffs)))
    perm = (flips * diffs).mean(axis=1)
    observed = abs(diffs.mean())
    return {
        "participants": int(len(diffs)),
        "visit_minus_feature": float(diffs.mean()),
        "bootstrap_95_ci": [percentile(draws, 2.5), percentile(draws, 97.5)],
        "sign_flip_p_two_sided": float((np.sum(np.abs(perm) >= observed - 1e-15) + 1) / (iterations + 1)),
    }


def derive_trace_metrics(frame):
    records = []
    transition_counter = Counter()
    task_transition_counter = defaultdict(Counter)
    for _, row in frame.iterrows():
        sequence = [part.strip() for part in str(row["density_sequence"]).split(">") if part.strip()]
        initial = row["initial_density"]
        # Raw field name retained from the deployed app; conceptually this is the
        # first participant-initiated state after the randomized starting display.
        first = row["first_user_selected_density"]
        final = row["committed_density"]
        transitions = list(zip(sequence[:-1], sequence[1:]))
        signs = []
        adjacent = skip = noop = return_steps = 0
        seen = {sequence[0]} if sequence else set()
        for source, target in transitions:
            transition_counter[(source, target)] += 1
            task_transition_counter[row["task_type"]][(source, target)] += 1
            delta = SCORE[target] - SCORE[source]
            if delta == 0:
                noop += 1
            elif abs(delta) == 1:
                adjacent += 1
                signs.append(1 if delta > 0 else -1)
            else:
                skip += 1
                signs.append(1 if delta > 0 else -1)
            if target in seen:
                return_steps += 1
            seen.add(target)
        direction_reversals = sum(a != b for a, b in zip(signs[:-1], signs[1:]))
        total_dwell = sum(float(row[f"time_{density}_s"]) for density in DENSITIES)
        record = {
            "record_id": row["record_id"],
            "participant_id": row["participant_id"],
            "task_type": row["task_type"],
            "landmark_id": row["landmark_id"],
            "initial_density": initial,
            "first_user_selected_density": first,
            "committed_density": final,
            "initial_match": int(initial == final),
            "first_participant_initiated_match": int(first == final),
            "changed_from_initial": int(initial != final),
            "changed_after_first_participant_initiated_state": int(first != final),
            "viewed_all_four": int(len(set(sequence)) == 4),
            "revisited_any_state": int(len(sequence) > len(set(sequence))),
            "returned_to_initial": int(initial in sequence[1:]),
            "adjacent_transitions": adjacent,
            "skip_transitions": skip,
            "noop_transitions": noop,
            "return_transitions": return_steps,
            "direction_reversals": direction_reversals,
            "net_initial_to_final": SCORE[final] - SCORE[initial],
            "sequence_length": len(sequence),
            "switch_count": int(float(row["switch_count"])),
            "unique_levels_viewed": int(float(row["unique_levels_viewed"])),
            "selection_time_s": float(row["selection_time_s"]),
            "total_dwell_s": total_dwell,
        }
        for density in DENSITIES:
            dwell = float(row[f"time_{density}_s"])
            record[f"dwell_{density}_s"] = dwell
            record[f"dwell_share_{density}"] = dwell / total_dwell if total_dwell > 0 else np.nan
        records.append(record)
    return pd.DataFrame(records), transition_counter, task_transition_counter


def matrix_summary(frame, row_key, col_key):
    output = {}
    for task in ("overall", "feature", "visit"):
        subset = frame if task == "overall" else frame[frame["task_type"] == task]
        counts = pd.crosstab(subset[row_key], subset[col_key]).reindex(index=DENSITIES, columns=DENSITIES, fill_value=0)
        percentages = counts.div(counts.sum(axis=1).replace(0, np.nan), axis=0) * 100
        output[task] = {
            "counts": {row: {col: int(counts.loc[row, col]) for col in DENSITIES} for row in DENSITIES},
            "row_percent": {row: {col: float(percentages.loc[row, col]) for col in DENSITIES} for row in DENSITIES},
        }
    return output


def summarize_trace(trace):
    binary = ("initial_match", "changed_from_initial", "first_participant_initiated_match", "changed_after_first_participant_initiated_state",
              "viewed_all_four", "revisited_any_state", "returned_to_initial")
    numeric = ("switch_count", "unique_levels_viewed", "selection_time_s", "adjacent_transitions",
               "skip_transitions", "return_transitions", "direction_reversals")
    summary = {}
    for task in ("overall", "feature", "visit"):
        subset = trace if task == "overall" else trace[trace["task_type"] == task]
        summary[task] = {"n": int(len(subset))}
        for column in binary:
            summary[task][column] = {"count": int(subset[column].sum()), "proportion": float(subset[column].mean())}
        for column in numeric:
            values = subset[column].to_numpy(dtype=float)
            summary[task][column] = {
                "mean": float(values.mean()), "median": float(np.median(values)),
                "iqr": [percentile(values, 25), percentile(values, 75)],
            }
    paired_columns = binary + numeric
    paired = {column: bootstrap_paired(trace, column, seed=SEED + i) for i, column in enumerate(paired_columns)}
    return summary, paired


def summarize_dwell(trace):
    result = {}
    for task in ("overall", "feature", "visit"):
        subset = trace if task == "overall" else trace[trace["task_type"] == task]
        result[task] = {}
        for density in DENSITIES:
            shares = subset[f"dwell_share_{density}"].dropna().to_numpy(dtype=float)
            seconds = subset[f"dwell_{density}_s"].to_numpy(dtype=float)
            positive = seconds[seconds > 0]
            result[task][density] = {
                "mean_share": float(shares.mean()),
                "median_share": float(np.median(shares)),
                "share_iqr": [percentile(shares, 25), percentile(shares, 75)],
                "zero_dwell_proportion": float(np.mean(seconds == 0)),
                "conditional_positive_median_s": float(np.median(positive)) if len(positive) else None,
            }
    result["paired_task_differences"] = {
        density: bootstrap_paired(trace, f"dwell_share_{density}", seed=SEED + 100 + i)
        for i, density in enumerate(DENSITIES)
    }
    return result


def initial_match_permutation(frame, iterations=50000):
    observed = float(np.mean(frame["initial_density"] == frame["committed_density"]))
    grouped = [group for _, group in frame.groupby("participant_id", sort=False)]
    initials = np.vstack([group["initial_density"].map(SCORE).to_numpy(dtype=int) for group in grouped])
    finals = np.vstack([group["committed_density"].map(SCORE).to_numpy(dtype=int) for group in grouped])
    rng = np.random.default_rng(SEED + 700)
    simulated = np.empty(iterations, dtype=float)
    batch_size = 1000
    cursor = 0
    while cursor < iterations:
        size = min(batch_size, iterations - cursor)
        random_order = np.argsort(rng.random((size, initials.shape[0], initials.shape[1])), axis=2)
        shuffled = np.take_along_axis(initials[None, :, :], random_order, axis=2)
        simulated[cursor:cursor + size] = np.mean(shuffled == finals[None, :, :], axis=(1, 2))
        cursor += size
    return {
        "observed_match_proportion": observed,
        "randomization_reference_mean": float(simulated.mean()),
        "randomization_reference_95_interval": [percentile(simulated, 2.5), percentile(simulated, 97.5)],
        "one_sided_p_more_matching": float((np.sum(simulated >= observed - 1e-15) + 1) / (iterations + 1)),
        "iterations": iterations,
        "note": "Initial labels were permuted within participant, preserving one use of each randomized initial state.",
    }


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"),
        Path("/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def draw_matrix_figure(initial_matrix, out_path):
    width, height = 1800, 1010
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    title_font, heading_font, cell_font, small_font, callout_font = font(52, True), font(34, True), font(30, True), font(25), font(27, True)
    draw.text((70, 38), "Randomized starting state did not anchor final commitment", fill="#102F56", font=title_font)
    draw.text((70, 105), "27.7% retained the randomized start; matrices show row percentages and counts", fill="#333333", font=small_font)
    draw.rounded_rectangle((1190, 32, 1725, 138), radius=18, fill="#EDF3F8", outline="#365F85", width=3)
    draw.text((1220, 52), "Retained start   27.7%", fill="#102F56", font=callout_font)
    draw.text((1220, 93), "Departed start   72.3%", fill="#102F56", font=callout_font)
    panel_w, gap = 790, 80
    for panel_index, task in enumerate(("feature", "visit")):
        x0 = 70 + panel_index * (panel_w + gap)
        y0 = 205
        draw.text((x0, y0), "Feature finding" if task == "feature" else "Imagined visit", fill="#111111", font=heading_font)
        matrix = initial_matrix[task]
        cell_w, cell_h = 142, 118
        grid_x, grid_y = x0 + 185, y0 + 85
        for j, density in enumerate(DENSITIES):
            label = density.capitalize()
            box = draw.textbbox((0, 0), label, font=small_font)
            draw.text((grid_x + j * cell_w + (cell_w - (box[2]-box[0]))/2, grid_y - 45), label, fill="#222222", font=small_font)
        for i, row_density in enumerate(DENSITIES):
            draw.text((x0, grid_y + i * cell_h + 38), row_density.capitalize(), fill="#222222", font=small_font)
            for j, col_density in enumerate(DENSITIES):
                pct = matrix["row_percent"][row_density][col_density]
                count = matrix["counts"][row_density][col_density]
                shade = int(246 - min(1.0, pct / 50.0) * 175)
                fill = (shade, shade, shade)
                left, top = grid_x + j * cell_w, grid_y + i * cell_h
                diagonal = i == j
                draw.rectangle(
                    (left, top, left + cell_w - 4, top + cell_h - 4),
                    fill=fill,
                    outline="#111111" if diagonal else "#666666",
                    width=6 if diagonal else 2,
                )
                text_value = f"{pct:.0f}%\n({count})"
                lines = text_value.split("\n")
                color = "white" if shade < 155 else "#111111"
                for k, line in enumerate(lines):
                    fnt = cell_font if k == 0 else small_font
                    box = draw.textbbox((0, 0), line, font=fnt)
                    draw.text((left + (cell_w-(box[2]-box[0]))/2, top + 22 + k*43), line, fill=color, font=fnt)
        draw.text((grid_x + panel_w/2 - 150, grid_y + 4*cell_h + 28), "Final committed state →", fill="#333333", font=small_font)
        draw.text((x0, grid_y - 40), "Initial state ↓", fill="#333333", font=small_font)
        draw.text((grid_x + 42, grid_y + 4*cell_h + 78), "Bold diagonal = retained randomized start", fill="#4C5967", font=font(21))
    image.save(out_path, quality=95)


def draw_trace_figure(trace_summary, dwell_summary, frame, out_path):
    width, height = 1800, 1450
    image = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(image)
    title_font, heading_font, small_font, node_font = font(49, True), font(31, True), font(23), font(23, True)
    draw.text((70, 38), "How participants compared, revisited, and revised representations", fill="#102F56", font=title_font)
    draw.text((70, 102), "Aggregate prevalence, observed median-switch traces, and dwell across the four states", fill="#333333", font=small_font)
    metrics = [
        ("Changed from\nrandomized initial", "changed_from_initial"),
        ("Viewed all\nfour states", "viewed_all_four"),
        ("Revisited a\nprevious state", "revisited_any_state"),
        ("Final differed from first\nparticipant-initiated state", "changed_after_first_participant_initiated_state"),
    ]
    x0, y0, bar_max, row_gap = 480, 205, 1090, 125
    draw.text((70, 160), "A  What participants did", fill="#111111", font=heading_font)
    for i, (label, key) in enumerate(metrics):
        y = y0 + i * row_gap
        draw.multiline_text((70, y + 8), label, fill="#222222", font=small_font, spacing=3)
        for k, (task, fill, hatch) in enumerate((("feature", "#444444", False), ("visit", "#BBBBBB", True))):
            p = trace_summary[task][key]["proportion"]
            top = y + k * 43
            right = x0 + p * bar_max
            draw.rectangle((x0, top, right, top + 31), fill=fill, outline="#111111", width=2)
            if hatch:
                for hx in range(x0, int(right), 18):
                    draw.line((hx, top + 31, min(hx + 31, right), top), fill="#666666", width=2)
            draw.text((right + 14, top + 1), f"{p*100:.1f}%", fill="#111111", font=small_font)
    draw.rectangle((1235, 155, 1268, 183), fill="#444444", outline="#111111")
    draw.text((1280, 154), "Feature", fill="#111111", font=small_font)
    draw.rectangle((1450, 155, 1483, 183), fill="#BBBBBB", outline="#111111")
    draw.line((1450, 183, 1483, 155), fill="#666666", width=2)
    draw.text((1495, 154), "Visit", fill="#111111", font=small_font)

    divider_y = 735
    draw.line((70, divider_y, 1730, divider_y), fill="#777777", width=2)
    draw.text((70, divider_y + 25), "B  What an observed trajectory looked like", fill="#111111", font=heading_font)
    draw.text((810, divider_y + 32), "Illustrative observed traces selected deterministically from median-switch trials", fill="#4C5967", font=font(20))

    median_switch = int(round(float(frame["switch_count"].median())))
    selected = []
    used_participants = set()
    for task in ("feature", "visit"):
        candidates = frame[(frame["task_type"] == task) & (frame["switch_count"] == median_switch)].copy()
        candidates = candidates.sort_values(["record_id", "participant_id"])
        endings = set()
        for _, row in candidates.iterrows():
            if row["participant_id"] in used_participants or row["committed_density"] in endings:
                continue
            selected.append(row)
            used_participants.add(row["participant_id"])
            endings.add(row["committed_density"])
            if len(endings) == 2:
                break
    density_fill = {"empty": "#F3F3F3", "low": "#CFCFCF", "moderate": "#8F8F8F", "high": "#444444"}
    density_letter = {"empty": "E", "low": "L", "moderate": "M", "high": "H"}
    trace_y = divider_y + 105
    for index, row in enumerate(selected[:4]):
        y = trace_y + index * 72
        task_label = "Feature" if row["task_type"] == "feature" else "Visit"
        draw.text((95, y + 6), task_label, fill="#222222", font=small_font)
        sequence_values = str(row["density_sequence"]).split(">")
        start_x = 300
        for seq_index, density in enumerate(sequence_values):
            x = start_x + seq_index * 128
            if seq_index:
                draw.line((x - 62, y + 21, x - 12, y + 21), fill="#365F85", width=4)
                draw.polygon(((x - 12, y + 21), (x - 25, y + 13), (x - 25, y + 29)), fill="#365F85")
            outline_width = 5 if seq_index in (0, len(sequence_values) - 1) else 2
            draw.rounded_rectangle((x, y, x + 54, y + 42), radius=8, fill=density_fill[density], outline="#111111", width=outline_width)
            text_color = "white" if density == "high" else "#111111"
            centered = draw.textbbox((0, 0), density_letter[density], font=node_font)
            draw.text((x + (54 - (centered[2] - centered[0])) / 2, y + 7), density_letter[density], fill=text_color, font=node_font)
        last_x = start_x + (len(sequence_values) - 1) * 128
        draw.text((last_x + 66, y + 7), "COMMIT", fill="#102F56", font=font(20, True))
        if index == 0:
            draw.text((start_x - 5, y - 24), "START", fill="#4C5967", font=font(18, True))
    draw.text((300, trace_y + 4 * 72 + 8), "E = Empty    L = Low    M = Moderate    H = High", fill="#4C5967", font=font(20))

    divider_y = 1135
    draw.line((70, divider_y, 1730, divider_y), fill="#777777", width=2)
    draw.text((70, divider_y + 25), "C  Where exploration time went", fill="#111111", font=heading_font)
    colors = ["#222222", "#666666", "#AAAAAA", "#E0E0E0"]
    start_x, start_y, full_w = 620, divider_y + 30, 1080
    for task_i, task in enumerate(("feature", "visit")):
        y = start_y + 72 + task_i * 65
        draw.text((500, y + 5), "Feature" if task == "feature" else "Visit", fill="#111111", font=small_font)
        current = start_x
        for density, color in zip(DENSITIES, colors):
            share = dwell_summary[task][density]["mean_share"]
            segment = share * full_w
            draw.rectangle((current, y, current + segment, y + 42), fill=color, outline="#111111", width=1)
            if segment > 80:
                text_color = "white" if color in ("#222222", "#666666") else "#111111"
                draw.text((current + 8, y + 6), f"{share*100:.0f}%", fill=text_color, font=small_font)
            current += segment
    legend_x = 560
    for i, (density, color) in enumerate(zip(DENSITIES, colors)):
        lx = legend_x + i * 285
        draw.rectangle((lx, 1390, lx + 28, 1415), fill=color, outline="#111111")
        draw.text((lx + 38, 1387), density.capitalize(), fill="#111111", font=small_font)
    image.save(out_path, quality=95)


def main():
    script_dir = Path(__file__).resolve().parent
    supplement_root = script_dir.parent
    if (supplement_root / "data" / "study2_public_data.csv").exists():
        default_data = supplement_root / "data" / "study2_public_data.csv"
        default_outdir = supplement_root / "reanalysis"
        default_figdir = supplement_root / "figures"
    else:
        # Repository-relative fallbacks for running from the project root.
        default_data = Path("data/study2_public_data.csv")
        default_outdir = Path("reanalysis")
        default_figdir = Path("figures")
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=default_data)
    parser.add_argument("--outdir", type=Path, default=default_outdir)
    parser.add_argument("--figdir", type=Path, default=default_figdir)
    args = parser.parse_args()
    args.outdir.mkdir(parents=True, exist_ok=True)
    args.figdir.mkdir(parents=True, exist_ok=True)

    frame = pd.read_csv(args.data)
    frame["initial_score"] = frame["initial_density"].map(SCORE)
    frame["committed_score"] = frame["committed_density"].map(SCORE)
    frame["accuracy"] = pd.to_numeric(frame["accuracy"], errors="coerce")
    trace, transitions, task_transitions = derive_trace_metrics(frame)

    initial_final = matrix_summary(frame, "initial_density", "committed_density")
    first_final = matrix_summary(frame, "first_user_selected_density", "committed_density")
    trace_summary, paired_trace = summarize_trace(trace)
    dwell_summary = summarize_dwell(trace)
    print("Fitting ordinal mixed model...", flush=True)
    ordinal_model = fit_ordinal_mixed(frame)
    print("Fitting threshold-specific ordinal sensitivity models...", flush=True)
    threshold_models = [fit_threshold_binary_mixed(frame, threshold) for threshold in range(3)]
    print("Fitting feature-accuracy mixed model...", flush=True)
    feature_model = fit_logistic_mixed(frame[frame["task_type"] == "feature"].copy())
    print("Computing randomization and trajectory summaries...", flush=True)

    density_counts = {
        task: {density: int(((frame["task_type"] == task) & (frame["committed_density"] == density)).sum()) for density in DENSITIES}
        for task in ("feature", "visit")
    }
    feature_accuracy = frame[frame["task_type"] == "feature"].groupby("landmark_id")["accuracy"].agg(["sum", "count", "mean"]).reset_index()
    task_transition_serialized = {
        task: {f"{a}->{b}": int(count) for (a, b), count in sorted(counter.items())}
        for task, counter in task_transitions.items()
    }
    output = {
        "analysis_status": {
            "density_model": "four-category ordinal mixed model; no dichotomized density test is treated as primary",
            "trace_analyses": "exploratory, as described in the supplied Study 2 analysis-plan document",
            "preregistration": "No contrast is characterized as preregistered or prespecified.",
        },
        "sample": {"participants": int(frame["participant_id"].nunique()), "trials": int(len(frame)), "trials_per_task": frame["task_type"].value_counts().to_dict()},
        "density_counts": density_counts,
        "ordinal_mixed_model": ordinal_model,
        "proportional_odds_sensitivity": {
            "method": "three threshold-specific logistic mixed models with the primary model covariates and participant random intercept",
            "purpose": "descriptive sensitivity check for slope heterogeneity across cumulative cutpoints; not an equivalence test",
            "models": threshold_models,
        },
        "initial_state_randomization_test": initial_match_permutation(frame),
        "initial_to_final": initial_final,
        "first_participant_initiated_to_final": first_final,
        "trace_summary": trace_summary,
        "paired_trace_comparisons": paired_trace,
        "dwell_summary": dwell_summary,
        "transition_counts_overall": {f"{a}->{b}": int(count) for (a, b), count in sorted(transitions.items())},
        "transition_counts_by_task": task_transition_serialized,
        "feature_accuracy_by_landmark": feature_accuracy.to_dict(orient="records"),
        "feature_accuracy_mixed_model": feature_model,
    }

    trace.to_csv(args.outdir / "study2_trial_trace_metrics.csv", index=False)
    (args.outdir / "study2_reanalysis_results.json").write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    draw_matrix_figure(initial_final, args.figdir / "fig5_initial_to_final_matrix.png")
    draw_trace_figure(trace_summary, dwell_summary, frame, args.figdir / "fig6_interaction_trajectories.png")
    task_term = next(row for row in ordinal_model["coefficients"] if row["term"] == "visit_task")
    initial_term = next(row for row in ordinal_model["coefficients"] if row["term"] == "initial_density_per_level")
    compact = {
        "ordinal_converged": ordinal_model["converged"],
        "ordinal_gradient_max": ordinal_model["gradient_max"],
        "threshold_sensitivity_converged": [model["converged"] for model in threshold_models],
        "threshold_visit_task": [next(row for row in model["coefficients"] if row["term"] == "visit_task") for model in threshold_models],
        "threshold_initial_density": [next(row for row in model["coefficients"] if row["term"] == "initial_density_per_level") for model in threshold_models],
        "visit_task": task_term,
        "initial_density": initial_term,
        "initial_match": output["initial_state_randomization_test"],
        "trace_summary": trace_summary,
        "feature_model_converged": feature_model["converged"],
    }
    print(json.dumps(compact, indent=2))


if __name__ == "__main__":
    main()
