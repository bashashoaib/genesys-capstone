# Mini-Genesys — Cloud Contact Center Platform

> **Vibecoded over a single night** by **Shabul** & **Shoaib** with the help of **Claude** and **ChatGPT**. What started as a "let's see how far we can get" capstone idea turned into a full-blown contact center platform — built from scratch, debugged at 3 AM, and shipped before sunrise.

A full-stack, browser-based contact center application built with **Flask** and **Twilio**, featuring a WebRTC softphone, outbound campaign auto-dialer, cloud UI replica, and a learning catalog — all wrapped in a modern, premium glassmorphism UI.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Demo Accounts](#demo-accounts)
- [API Reference](#api-reference)
- [Database Models](#database-models)
- [Running Tests](#running-tests)
- [Screenshots](#screenshots)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Mini-Genesys** is a capstone project that was vibecoded in one overnight session by **Shabul** and **Shoaib**, pair-programming with AI assistants **Claude** and **ChatGPT**. The idea was simple: replicate the core of an enterprise contact center — agent desktop, call routing, outbound campaigns, and admin dashboards — and actually make it work end-to-end. No templates, no boilerplate starters. Just two devs, two AIs, and a lot of caffeine.

### What Can It Do?

- Make and receive phone calls directly in the browser (WebRTC)
- Toggle agent availability for inbound call routing
- Create outbound dialing campaigns with CSV contact uploads
- Browse a mock Genesys Cloud UI with modules, queues, and dashboards
- Explore a learning catalog with role-based recommendations
- Track all call activity with detailed logs

---

## Features

### Agent Desktop & Softphone
- Browser-based WebRTC softphone powered by Twilio Voice SDK
- Dial pad for manual outbound calls to any phone number
- Call controls: Accept, Reject, Mute/Unmute, Hang up
- Real-time agent status toggle (Available / Offline)
- Recent calls table with auto-refresh polling (every 5 seconds)

### Inbound Call Handling
- Twilio webhook integration routes incoming calls to available agents
- Automatic busy/voicemail routing when agent is offline
- TwiML-based call flow with status callback tracking

### Outbound Campaigns (Auto-Dialer)
- Create named campaigns and upload CSV contact lists
- Progressive dialer with background scheduling (APScheduler)
- Campaign lifecycle management: Start, Pause, Stop
- Live contact status tracking: pending, dialing, ringing, answered, failed
- Attempt counting and error reporting per contact
- Campaign summary dashboard with real-time stat cards

### Cloud Replica (Mock Genesys Cloud UI)
- Browsable module catalog with category filtering and search
- Queue snapshot cards showing waiting count, agents, and service level
- Dashboard widgets with owner attribution
- Module detail view with dummy panels and objects
- Demonstrates UI parity structure with dummy data

### Explore Learning Catalog
- Filterable catalog of learning paths, certifications, and webinars
- Filter by role (Agent/Admin), type, and difficulty level
- Role-based personalized recommendations
- Catalog summary with type breakdowns, tracks, and modalities

### Call Logs
- Unified call history across softphone and campaigns
- Direction indicators (inbound/outbound) with status badges
- Auto-refresh with manual refresh option

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Backend** | Python / Flask | 3.1.0 |
| **ORM** | Flask-SQLAlchemy | 3.1.1 |
| **Database** | SQLite (default) / PostgreSQL | — |
| **Auth** | Flask-Login | 0.6.3 |
| **Migrations** | Flask-Migrate / Alembic | 4.0.7 / 1.14.0 |
| **Background Jobs** | APScheduler | 3.10.4 |
| **Telephony** | Twilio Voice SDK + REST API | 9.3.2 |
| **Frontend Framework** | Bootstrap | 5.3.3 |
| **DOM / AJAX** | jQuery | 3.7.1 |
| **Icons** | Bootstrap Icons | 1.11.3 |
| **Typography** | Google Fonts (Inter) | — |
| **Testing** | pytest | 8.3.3 |

---

## Project Structure

```
mini-genesys/
├── app/
│   ├── __init__.py              # Flask app factory & blueprint registration
│   ├── models.py                # SQLAlchemy models
│   ├── extensions.py            # db, login_manager, migrate instances
│   ├── main.py                  # Root routes (login page, app page)
│   │
│   ├── auth/                    # Authentication blueprint
│   │   └── routes.py            #   Login, logout, /me endpoint
│   ├── calls/                   # Call management blueprint
│   │   └── routes.py            #   Manual calls, recent calls, call logs
│   ├── voice/                   # Voice/telephony blueprint
│   │   └── routes.py            #   Twilio tokens, agent status, webhooks
│   ├── campaigns/               # Outbound campaign blueprint
│   │   └── routes.py            #   Campaign CRUD, CSV upload, start/pause/stop
│   ├── explore/                 # Learning catalog blueprint
│   │   ├── routes.py            #   Catalog search, recommendations
│   │   └── catalog.py           #   Dummy learning catalog data
│   ├── cloud_mock/              # Cloud UI replica blueprint
│   │   ├── routes.py            #   Module browsing, overview
│   │   └── data.py              #   Mock cloud data
│   │
│   ├── services/                # Business logic & utilities
│   │   ├── twilio_service.py    #   Twilio integration helper
│   │   ├── campaign_worker.py   #   Background campaign scheduler
│   │   ├── csv_parser.py        #   CSV contact list parser
│   │   ├── auth_utils.py        #   Role-based access decorator
│   │   └── webhook_security.py  #   Twilio webhook signature validation
│   │
│   ├── static/
│   │   ├── css/app.css          # Premium design system (600+ lines)
│   │   └── js/app.js            # Frontend logic & interactions
│   │
│   └── templates/
│       ├── base.html            # Base template (fonts, icons, scripts)
│       ├── login.html           # Glassmorphism login page
│       └── index.html           # Main app dashboard (all sections)
│
├── config.py                    # Flask configuration
├── run.py                       # Application entry point
├── requirements.txt             # Python dependencies
├── alembic.ini                  # Migration configuration
├── migrations/                  # Alembic migration versions
├── tests/                       # Test suite
│   ├── conftest.py              #   Shared fixtures
│   ├── test_auth.py             #   Authentication tests
│   ├── test_campaigns.py        #   Campaign CRUD tests
│   ├── test_cloud_replica.py    #   Cloud replica tests
│   ├── test_csv_parser.py       #   CSV parser tests
│   ├── test_explore.py          #   Explore catalog tests
│   └── test_voice_and_calls.py  #   Voice & call tests
└── testing_assets/              # Test data files
```

---

## Getting Started

### Prerequisites

- **Python 3.10+**
- **pip** (Python package manager)
- **Twilio account** (optional — the app works in simulated mode without it)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/bashashoaib/genesys-capstone.git
cd genesys-capstone

# 2. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Run the application
python run.py
```

The app will start at **http://127.0.0.1:5000**

---

## Environment Variables

Create a `.env` file in the project root (optional — all have sensible defaults):

```env
# Flask
FLASK_SECRET=your-secret-key
APP_ENV=development

# Database (defaults to SQLite)
DATABASE_URL=sqlite:///mini_genesys.db

# Twilio (optional — leave blank for simulated mode)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret
TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_CALLER_ID=+1234567890
TWILIO_WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
TWILIO_VALIDATE_SIGNATURE=false

# Campaign Dialer
ALLOW_SIMULATED_CALLS=true
SCHEDULER_ENABLED=true
CAMPAIGN_DIAL_INTERVAL_SECONDS=5
CAMPAIGN_MAX_ATTEMPTS=2
```

> **Note:** Without Twilio credentials, the softphone will show a "Voice token unavailable" warning but all other features (campaigns, cloud replica, explore, logs) work normally with simulated data.

---

## Demo Accounts

| Username | Password | Role | Access |
|----------|----------|------|--------|
| `admin` | `admin123` | Admin | Full access (including Campaigns) |
| `agent` | `agent123` | Agent | Softphone, Cloud Replica, Explore, Logs |

---

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Login with username/password |
| `POST` | `/auth/logout` | End session |
| `GET` | `/auth/me` | Get current user info |

### Voice & Softphone
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/voice/token` | Get Twilio access token |
| `POST` | `/api/agent/status` | Set agent status (available/offline) |
| `POST` | `/webhooks/twilio/voice/inbound` | Inbound call webhook |
| `POST` | `/webhooks/twilio/call-status` | Call status callback |

### Calls
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/calls/manual` | Initiate outbound call |
| `GET` | `/api/calls/recent?limit=20` | Get recent call logs |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/campaigns` | Create a new campaign |
| `POST` | `/api/campaigns/:id/contacts/upload` | Upload CSV contact list |
| `POST` | `/api/campaigns/:id/start` | Start campaign dialer |
| `POST` | `/api/campaigns/:id/pause` | Pause campaign |
| `POST` | `/api/campaigns/:id/stop` | Stop campaign |
| `GET` | `/api/campaigns/:id/status` | Get campaign status & counts |
| `GET` | `/api/campaigns/:id/contacts` | Get contacts (paginated) |

### Explore Catalog
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/explore/catalog` | Search catalog (query params: role, type, level) |
| `GET` | `/api/explore/recommendations` | Get role-based recommendations |
| `GET` | `/api/explore/tracks` | List available learning tracks |

### Cloud Replica
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/cloud-replica/overview` | Cloud overview (modules, queues, dashboards) |
| `GET` | `/api/cloud-replica/modules` | List modules (query params: category, q) |
| `GET` | `/api/cloud-replica/module/:id` | Module detail with panels & objects |
| `POST` | `/api/cloud-replica/action` | Execute dummy action |

---

## Database Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| **User** | Agent/Admin accounts | `username`, `password_hash`, `role`, `is_active` |
| **AgentPresence** | Online status tracking | `user_id`, `status`, `updated_at` |
| **CallLog** | Call records | `direction`, `from_number`, `to_number`, `twilio_sid`, `status`, `started_at`, `ended_at` |
| **Campaign** | Outbound campaigns | `name`, `status`, `created_by`, `started_at`, `stopped_at` |
| **CampaignContact** | Campaign contact list | `campaign_id`, `name`, `phone`, `status`, `attempt_count`, `last_error` |

---

## Running Tests

```bash
# Run the full test suite
pytest

# Run with verbose output
pytest -v

# Run a specific test file
pytest tests/test_auth.py

# Run with coverage
pytest --cov=app
```

### Test Coverage

| Module | Tests |
|--------|-------|
| `test_auth.py` | Login, logout, session management |
| `test_campaigns.py` | Campaign CRUD, lifecycle, contact management |
| `test_cloud_replica.py` | Cloud module browsing, overview, actions |
| `test_csv_parser.py` | CSV parsing and validation |
| `test_explore.py` | Catalog search, filtering, recommendations |
| `test_voice_and_calls.py` | Voice tokens, manual calls, call logs |

---

## Screenshots

> **Login Page** — Glassmorphism design with animated gradient orbs
>
> **Softphone** — Agent status, dial pad, call controls, recent calls
>
> **Campaigns** — Create, manage, and monitor outbound campaigns
>
> **Cloud Replica** — Browse mock Genesys Cloud modules and queues
>
> **Explore** — Learning catalog with filters and recommendations

---

## The Vibe

This entire project was vibecoded overnight. Here's how it went down:

- **Shabul** and **Shoaib** kicked things off with an idea and a blank repo
- **Claude** helped architect the Flask backend, design the premium UI, and wire up the Twilio integration
- **ChatGPT** assisted with brainstorming features, debugging edge cases, and refining the UX
- No sleep was had. Many bugs were squashed. The result? A working contact center platform by morning.

This is what happens when humans and AI collaborate — you ship things that would normally take weeks, in a single night.

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Vibecoded overnight by <strong>Shabul</strong> & <strong>Shoaib</strong><br>
  Powered by <strong>Claude</strong> & <strong>ChatGPT</strong><br>
  Built with Flask, Twilio, and Bootstrap<br>
  <strong>Mini-Genesys</strong> — Capstone Project
</p>
