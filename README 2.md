# GATEID – Gate Identification System

**Multi-site • Multi-user • License Plate Logging • Spreadsheet Export**

GATEID is a web application designed for quarries, aggregate yards, sand pits, and similar operations that need to log trucks entering and leaving gates using license plate recognition.

---

## Key Features

### 1. License Plate Camera System
- Live camera feed (phone or computer camera)
- **Manual Capture** – snap a frame and OCR the plate
- **Auto Detect mode** – continuously samples the camera every few seconds and attempts to read plates when a vehicle is in frame
- Cleaned plate results with confidence indication
- One-click logging to the spreadsheet after detection

### 2. Automatic Upload to Spreadsheet
When a plate is confirmed, the system automatically creates a log entry containing:
- Date & Time
- Site / Gate
- License Plate
- Direction (IN / OUT)
- Matched Truck Unit #, Company, Driver
- Material / Purpose
- Who logged it

The full log is viewable as a live spreadsheet and can be exported to **Excel (.xlsx)** or **CSV** at any time.

### 3. Multi-Site Support
- Create multiple sites/gates (e.g. North Quarry Main Gate, South Scale, East Exit)
- Switch the active site with one click
- Each log entry is tagged with the correct site
- Filter the spreadsheet by site

### 4. Employee Logins & Roles
| Role       | Permissions                                      |
|------------|--------------------------------------------------|
| **Admin**  | Full access – manage users, sites, everything    |
| **Operator** | Start camera, capture plates, log entries, manage trucks |
| **Viewer** | Read-only access to logs and dashboards          |

Each employee can be restricted to specific sites only.

### 5. Truck Registry
- Maintain a list of known trucks (plate → unit #, company, driver, tare weight)
- When a plate is read, known trucks are auto-matched and fields are pre-filled
- New plates can be automatically added to the registry

### 6. Dashboard
- Today’s total entries, IN vs OUT counts, unique plates
- Activity broken down by site
- Recent activity feed

---

## Demo Logins

| Username  | Password  | Role     |
|-----------|-----------|----------|
| admin     | admin123  | Admin    |
| operator  | op123     | Operator |
| viewer    | view123   | Viewer   |

---

## How to Run

1. Unzip the folder
2. Open `index.html` in **Chrome**, **Edge**, or **Safari** (best on a phone or tablet for camera use)
3. Allow camera permissions when prompted
4. Sign in with one of the demo accounts

**Tip:** On a phone, use “Add to Home Screen” for an app-like experience.

---

## Important Notes on Automatic Plate Reading

### What this version does well
- Continuous camera monitoring with Auto Detect
- OCR specialized for license plates (alphanumeric focus)
- Automatic matching against known trucks
- Instant logging + spreadsheet export
- Multi-user and multi-site ready

### Real-world production recommendation
Browser-based OCR (Tesseract) works for demos and low-volume gates, but for **high-accuracy, high-volume, truly hands-free** operation when trucks drive past a fixed camera, the recommended architecture is:

1. **Dedicated ANPR / LPR cameras** (Hikvision, Axis, Genetec, etc.) or an edge AI box
2. The camera (or its software) sends the plate + timestamp + image via webhook / API / MQTT to a backend
3. GATEID (or a future server version) receives the event and writes it to the database / spreadsheet automatically

This web app is structured so it can later accept those external plate events easily.

---

## Data Storage

All data currently lives in the browser’s `localStorage` (users, sites, trucks, logs).  
This is perfect for single-device or demo use. For multi-device real-time sync across the whole company, a backend (Firebase, Supabase, or custom API) would be the next step.

---

## Future Extension Ideas

- Backend + real-time sync across devices
- Webhook endpoint to receive plates from professional ANPR cameras
- Photo of the truck stored with each log entry
- Weight integration from scale systems
- SMS / email alerts for unknown plates
- Mobile push notifications

---

Built for quarry and aggregate operations that need reliable gate tracking without complex infrastructure.
