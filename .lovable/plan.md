

## Plan: Specialist Panel Fix + DB Consolidation + Dashboard Cleanup

### Summary
Fix specialist view permissions, consolidate `services` + `specialist_services` into one table, remove the Work Hours tab from admin, and clean up Dashboard quick actions.

---

### 1. Database: Merge `specialist_services` into `services`

Add `specialist_id` column to `services` table, migrate data from `specialist_services`, then drop `specialist_services`.

**Migration steps:**
- `ALTER TABLE services ADD COLUMN specialist_id uuid;`
- Populate `specialist_id` from existing `specialist_services` join data
- Drop `specialist_services` table
- Add RLS policies for specialist self-management on `services` (specialists can manage their own services where `specialist_id` matches)

Similarly, add RLS policies on `specialist_work_hours`, `blocked_times`, `blocked_days` so specialists can manage their own records.

### 2. Admin Page: Remove Work Hours tab

- Remove the `work-hours` tab from `AdminTab` type and from the tab list in `Admin.tsx`
- Remove the `WorkHoursManager` import (the old global work hours are no longer needed since each specialist manages their own)

### 3. Specialist Panel: Full self-management

Update `SpecialistsManager.tsx`:
- When `restrictToSpecialistId` is set (specialist logged in), show the full config tabs (Servicii, Program, Blocări timp, Vacanțe) just like it shows for admin
- Specialist can CRUD their own services, edit their schedule, manage blocked times and vacations
- Remove the checkbox-based service assignment UI; replace with direct CRUD on `services` table filtered by `specialist_id`

### 4. Dashboard: Clean up Quick Actions

In `Dashboard.tsx`:
- Remove "View Services" button from Quick Actions for all users
- For specialists: add a "Go to Specialist Panel" button linking to `/admin`
- Keep only "Book New Appointment" for clients

### 5. Update all queries

Update all components that query `specialist_services` to instead query `services` filtered by `specialist_id`:
- `src/pages/Booking.tsx` — filter services by selected specialist's ID
- `src/components/admin/AdminBookAppointment.tsx` — same
- `src/components/admin/SpecialistsManager.tsx` — direct CRUD on services with specialist_id
- `src/pages/Dashboard.tsx` — remove admin-services query if unused

### Technical Details

**New RLS policies needed:**
```sql
-- Specialists can manage their own services
CREATE POLICY "Specialists can manage own services"
ON services FOR ALL TO authenticated
USING (specialist_id IN (
  SELECT id FROM specialists WHERE user_id = auth.uid()
))
WITH CHECK (specialist_id IN (
  SELECT id FROM specialists WHERE user_id = auth.uid()
));

-- Similar policies for specialist_work_hours, blocked_times, blocked_days
```

**Files to modify:**
- New migration SQL (add specialist_id to services, migrate data, drop specialist_services, add RLS)
- `src/pages/Admin.tsx` — remove work-hours tab
- `src/components/admin/SpecialistsManager.tsx` — refactor service management to use services.specialist_id directly
- `src/pages/Booking.tsx` — query services by specialist_id instead of specialist_services
- `src/components/admin/AdminBookAppointment.tsx` — same
- `src/pages/Dashboard.tsx` — remove View Services button, add specialist panel button

