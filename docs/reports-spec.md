# Reports Spec (MVP)

## Required Report Dimensions

- Attendance by day.
- Session utilization (booked/capacity ratio).
- Active vs inactive clients.
- Revenue by period (day/week/month range).

## Data Sources

- `Booking` + `Session` for bookings/utilization.
- `User` + `ClientProfile` status for active/inactive.
- `BillingRecord` for revenue summaries.

## Output Shape

- Aggregate endpoints should return:
  - timeframe
  - grouped labels
  - totals
  - trend deltas when previous period is available
