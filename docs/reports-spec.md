# Reports Spec (MVP)

## Required Report Dimensions

- Attendance by day.
- Session utilization (booked/capacity ratio).
- Active vs inactive clients.
- Revenue by period (day/week/month range).
- Package insights: most-used PackageType, revenue per PackageType, comp vs paid (Flow 1 vs Flow 2) ratio.

## Data Sources

- `Booking` + `Session` for bookings/utilization.
- `User` + `ClientProfile` status for active/inactive.
- `BillingRecord` for revenue summaries (and `BillingRecord.packageTypeId` for revenue-per-PackageType).
- `ClientPackage` for package counts (joined to `BillingRecord` by `(clientUserId, packageTypeId)` to split paid vs comp).

## Output Shape

- Aggregate endpoints should return:
  - timeframe
  - grouped labels
  - totals
  - trend deltas when previous period is available
