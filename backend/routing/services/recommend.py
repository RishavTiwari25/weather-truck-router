"""
Route recommendation. Lexicographic preference, exactly as specified:

    1. fewest Severe miles      (No-Travel miles are treated as worse than
    2. fewest High miles         Severe and compared first; a route that
    3. lowest average risk       crosses a No-Travel zone can never beat one
    4. shortest travel time      that doesn't)

The function also produces a plain-English explanation so the UI can show
*why* a route won, not just which one.
"""
from __future__ import annotations


def rank_key(summary: dict) -> tuple:
    return (
        summary["no_travel_miles"],
        summary["severe_miles"],
        summary["high_miles"],
        summary["avg_risk"],
        summary["duration_s"],
    )


def _fmt_hours(seconds: float) -> str:
    h, m = divmod(int(round(seconds / 60)), 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def recommend(routes: list[dict]) -> dict:
    """
    `routes` are serialised route dicts containing `id` and `summary`.
    Mutates each with `rank` and `recommended`, returns the recommendation.
    """
    ordered = sorted(routes, key=lambda r: rank_key(r["summary"]))
    for position, r in enumerate(ordered, start=1):
        r["rank"] = position
        r["recommended"] = position == 1

    best = ordered[0]
    bs = best["summary"]
    reasons: list[str] = []
    comparisons: list[dict] = []

    for other in ordered[1:]:
        os_ = other["summary"]
        if os_["no_travel_miles"] > bs["no_travel_miles"]:
            why = f"Route {other['id']} crosses {os_['no_travel_miles']:.0f} mi of No-Travel conditions"
        elif os_["severe_miles"] > bs["severe_miles"]:
            why = f"Route {other['id']} has {os_['severe_miles']:.0f} mi of Severe weather vs {bs['severe_miles']:.0f} mi"
        elif os_["high_miles"] > bs["high_miles"]:
            why = f"Route {other['id']} has {os_['high_miles']:.0f} mi of High risk vs {bs['high_miles']:.0f} mi"
        elif os_["avg_risk"] > bs["avg_risk"]:
            why = f"Route {other['id']} averages {os_['avg_risk']:.2f} risk vs {bs['avg_risk']:.2f}"
        elif os_["duration_s"] > bs["duration_s"]:
            why = f"Route {other['id']} takes {_fmt_hours(os_['duration_s'] - bs['duration_s'])} longer"
        else:
            why = f"Route {other['id']} ties on every criterion"
        comparisons.append({"route_id": other["id"], "reason": why})

    if bs["no_travel_miles"] > 0:
        reasons.append(
            f"Every option crosses No-Travel conditions; Route {best['id']} has the fewest "
            f"({bs['no_travel_miles']:.0f} mi). Consider delaying departure."
        )
    elif bs["severe_miles"] == 0 and bs["high_miles"] == 0:
        reasons.append(f"Route {best['id']} avoids all Severe and High-risk segments.")
    elif bs["severe_miles"] == 0:
        reasons.append(f"Route {best['id']} avoids Severe weather entirely ({bs['high_miles']:.0f} mi of High risk).")
    else:
        reasons.append(f"Route {best['id']} has the fewest Severe miles ({bs['severe_miles']:.0f} mi).")

    fastest = min(routes, key=lambda r: r["summary"]["duration_s"])
    if fastest["id"] == best["id"]:
        reasons.append("It is also the fastest option.")
    else:
        delta = bs["duration_s"] - fastest["summary"]["duration_s"]
        reasons.append(f"It costs {_fmt_hours(delta)} more than the fastest route ({fastest['id']}) in exchange for lower risk.")

    reasons.append(f"Average risk {bs['avg_risk']:.2f} / 4 over {bs['total_miles']:.0f} mi.")

    return {
        "route_id": best["id"],
        "reasons": reasons,
        "comparisons": comparisons,
        "advisory": "no_travel" if bs["no_travel_miles"] > 0 else ("severe" if bs["severe_miles"] > 0 else "ok"),
        "criteria": ["No-Travel miles", "Severe miles", "High miles", "Average risk", "Travel time"],
    }
