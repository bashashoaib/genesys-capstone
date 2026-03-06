MODULES = [
    {
        "id": "admin",
        "name": "Admin",
        "category": "Platform",
        "status": "preview",
        "features": [
            "Organizations",
            "Divisions",
            "Roles & Permissions",
            "Single Sign-On",
            "SCIM Provisioning",
            "Audit Viewer",
            "Data Privacy Requests",
        ],
    },
    {
        "id": "directory",
        "name": "Directory",
        "category": "Platform",
        "status": "preview",
        "features": [
            "Users",
            "Groups",
            "Presence Definitions",
            "Skills Management",
            "External Contacts",
            "Contact Lists",
        ],
    },
    {
        "id": "routing",
        "name": "Routing",
        "category": "Contact Center",
        "status": "preview",
        "features": [
            "Queues",
            "Queue Membership",
            "Routing Methods",
            "Bullseye Routing",
            "Language Routing",
            "Skill Expressions",
            "Priority & SLA",
        ],
    },
    {
        "id": "architect",
        "name": "Architect",
        "category": "Contact Center",
        "status": "preview",
        "features": [
            "Inbound Call Flows",
            "In-Queue Flows",
            "Bot Flows",
            "Common Modules",
            "Data Actions",
            "Flow Outcomes",
            "Version Publish",
        ],
    },
    {
        "id": "workforce",
        "name": "Workforce Management",
        "category": "WEM",
        "status": "preview",
        "features": [
            "Forecasts",
            "Schedules",
            "Adherence",
            "Time Off Plans",
            "Intraday Monitoring",
            "Shift Trade",
        ],
    },
    {
        "id": "quality",
        "name": "Quality Management",
        "category": "WEM",
        "status": "preview",
        "features": [
            "Evaluations",
            "Forms",
            "Calibration",
            "Coaching Appointments",
            "Screen Recording Metadata",
            "Disputes",
        ],
    },
    {
        "id": "analytics",
        "name": "Analytics",
        "category": "Insights",
        "status": "preview",
        "features": [
            "Interaction Details",
            "Performance Dashboards",
            "Journey Views",
            "Realtime Queue Metrics",
            "Custom Reports",
            "Export Jobs",
        ],
    },
    {
        "id": "speech",
        "name": "Speech & Text Analytics",
        "category": "Insights",
        "status": "preview",
        "features": [
            "Topics",
            "Phrase Spotting",
            "Sentiment",
            "Silence Detection",
            "Acoustic Metrics",
            "Transcripts",
        ],
    },
    {
        "id": "knowledge",
        "name": "Knowledge",
        "category": "AI",
        "status": "preview",
        "features": [
            "Knowledge Bases",
            "Articles",
            "Categories",
            "Language Variants",
            "Feedback",
            "Import/Export",
        ],
    },
    {
        "id": "bots",
        "name": "Virtual Agents",
        "category": "AI",
        "status": "preview",
        "features": [
            "Intent Management",
            "Slots",
            "Dialog Tasks",
            "NLU Training",
            "Voice/Chat Channel Binding",
            "Fallback Handling",
        ],
    },
    {
        "id": "outbound",
        "name": "Outbound Dialing",
        "category": "Contact Center",
        "status": "preview",
        "features": [
            "Campaign Rulesets",
            "Contact List Filters",
            "DNC Lists",
            "Call Analysis Response",
            "Wrap-Up Mapping",
            "Pacing Settings",
        ],
    },
    {
        "id": "digital",
        "name": "Digital Channels",
        "category": "Contact Center",
        "status": "preview",
        "features": [
            "Web Messaging",
            "WhatsApp",
            "SMS",
            "Email Routing",
            "Co-browse",
            "Attachment Policies",
        ],
    },
    {
        "id": "integrations",
        "name": "Integrations",
        "category": "Platform",
        "status": "preview",
        "features": [
            "AppFoundry Catalog",
            "OAuth Clients",
            "Webhooks",
            "EventBridge",
            "Data Actions",
            "Lambda Connectors",
        ],
    },
]

DASHBOARDS = [
    {"name": "Executive Overview", "widgets": 12, "owner": "admin"},
    {"name": "Supervisor Live Wallboard", "widgets": 9, "owner": "supervisor"},
    {"name": "Agent Personal Metrics", "widgets": 6, "owner": "agent"},
]

QUEUE_SUMMARY = [
    {"queue": "Support-Voice", "waiting": 14, "agents_on_queue": 8, "service_level": "72%"},
    {"queue": "Sales-Inbound", "waiting": 7, "agents_on_queue": 5, "service_level": "81%"},
    {"queue": "Billing", "waiting": 3, "agents_on_queue": 4, "service_level": "93%"},
]

ACTIONS = [
    "Create Queue",
    "Publish Flow",
    "Bulk User Import",
    "Add Integration",
    "Clone Evaluation Form",
    "Create Dashboard",
    "Launch Campaign",
]


def categories():
    return sorted({m["category"] for m in MODULES})


def modules_by_category(category: str | None = None):
    if not category:
        return MODULES
    return [m for m in MODULES if m["category"].lower() == category.lower()]