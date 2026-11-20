# Architecture
- Calculate client and staff booking availability with the shared `src/lib/booking-slots.ts` helper so both flows honor the same specialist slot mode and occupied intervals.
- Save specialist slot mode through a narrowly scoped authorized database function; do not widen specialist profile update permissions.