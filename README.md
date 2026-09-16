# GATEID v2.1

Gate identification, load tickets, and camera integration for quarries.

## Features
- Live camera + plate OCR + Auto Detect
- Photo on every log, weights, ticket numbers
- Unknown plate warnings
- **Load Tickets**: create at loading site → accept at dump site
- **Camera webhook**: Reolink / ANPR middleman auto-logs plates
- Multi-site, multi-user roles
- Daily reports, shift lock, Excel/CSV, JSON backup
- Offline support

## Demo logins
| User | Password | Role |
|------|----------|------|
| admin | admin123 | Admin |
| operator | op123 | Operator |
| viewer | view123 | Viewer |

## Tickets workflow
1. At **loading site**: Tickets → Create Ticket (plate, from, to, material)
2. Truck is logged OUT automatically
3. At **dump site**: Tickets → Accept on the open ticket
4. Truck is logged IN at receiving site

## Camera integration
Middleman POSTs JSON (or use Test Injector on Camera tab):

```json
{
  "plate": "ABC1234",
  "direction": "IN",
  "siteCode": "NQ-MAIN",
  "source": "reolink-north-gate",
  "confidence": 0.94
}
```

From the browser console on the same origin:
`GATEID.ingestCameraEvent({ plate: "ABC1234", direction: "IN", siteCode: "NQ-MAIN" })`
