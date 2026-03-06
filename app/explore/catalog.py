CATALOG = [
    {
        "id": "lp-agent-foundations",
        "title": "Agent Foundations Learning Path",
        "type": "learning_path",
        "role": "agent",
        "track": "core",
        "modality": "self-paced",
        "level": "beginner",
        "duration_hours": 8,
        "tags": ["inbound", "softphone", "status management"],
        "description": "Core path for new agents: inbound handling, desktop basics, and call controls.",
    },
    {
        "id": "lp-admin-campaigns",
        "title": "Outbound Campaign Operations",
        "type": "learning_path",
        "role": "admin",
        "track": "campaigns",
        "modality": "self-paced",
        "level": "intermediate",
        "duration_hours": 10,
        "tags": ["csv uploads", "autodial", "monitoring"],
        "description": "Build and manage campaigns, contacts, execution controls, and troubleshooting.",
    },
    {
        "id": "cert-cloud-core",
        "title": "Cloud Contact Center Core Certification Prep",
        "type": "certification",
        "role": "agent",
        "track": "certification",
        "modality": "instructor-led",
        "level": "intermediate",
        "duration_hours": 12,
        "tags": ["certification", "assessment", "best practices"],
        "description": "Structured prep aligned to cloud contact center implementation and operations.",
    },
    {
        "id": "lp-supervisor-analytics",
        "title": "Supervisor Analytics and QA",
        "type": "learning_path",
        "role": "admin",
        "track": "analytics",
        "modality": "blended",
        "level": "advanced",
        "duration_hours": 9,
        "tags": ["dashboards", "qa", "coaching"],
        "description": "Track quality and performance metrics with practical monitoring workflows.",
    },
    {
        "id": "webinar-release-readiness",
        "title": "Release Readiness Webinar",
        "type": "webinar",
        "role": "all",
        "track": "release",
        "modality": "live",
        "level": "all",
        "duration_hours": 1,
        "tags": ["new features", "release notes"],
        "description": "Monthly webinar covering platform updates and rollout guidance.",
    },
    {
        "id": "lp-integrations-api",
        "title": "APIs and Integrations Track",
        "type": "learning_path",
        "role": "admin",
        "track": "integrations",
        "modality": "self-paced",
        "level": "advanced",
        "duration_hours": 14,
        "tags": ["api", "webhooks", "automation"],
        "description": "Deep-dive track for API usage, integration patterns, and webhook operations.",
    },
]


def filter_catalog(role=None, track=None, content_type=None, level=None):
    rows = CATALOG
    if role:
        rows = [x for x in rows if x["role"] in {"all", role}]
    if track:
        rows = [x for x in rows if x["track"] == track]
    if content_type:
        rows = [x for x in rows if x["type"] == content_type]
    if level:
        rows = [x for x in rows if x["level"] == level or x["level"] == "all"]
    return rows


def summary_stats(items):
    by_type = {}
    for item in items:
        by_type[item["type"]] = by_type.get(item["type"], 0) + 1

    return {
        "total": len(items),
        "by_type": by_type,
        "tracks": sorted({x["track"] for x in items}),
        "modalities": sorted({x["modality"] for x in items}),
    }