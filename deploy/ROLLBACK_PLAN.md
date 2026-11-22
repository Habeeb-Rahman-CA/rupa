# =============================================================================
# Rupa — Rollback Plan & Cutover Checklist
# =============================================================================

## CRITICAL WARNING

Do NOT execute production writes or switch users to the NestJS system until
explicitly approved. Do NOT delete Supabase tables, functions, projects, or
backups under any circumstances.

## Rollback Scenarios

### Scenario A: Pre-cutover issues (before any user traffic)

Issue discovered during staging or pre-production testing.

**Rollback:** Simply do not promote to production. Continue using Supabase +
Angular. Fix issues in the development branch.

**Data impact:** None.

---

### Scenario B: Post-deployment, pre-cutover (API deployed, no users migrated)

NestJS API is deployed but Angular frontend still points to Supabase.

**Rollback:**
1. Stop the NestJS API container/process.
2. Revert Vercel deployment to previous Angular build (if already deployed).
3. Supabase continues serving all traffic — no changes needed.

**Data impact:** None. Supabase is untouched.

---

### Scenario C: Post-cutover issues (users migrated to NestJS)

Angular frontend now calls NestJS API. Users have data in both systems.

**Rollback steps:**

1. **Immediate:**
   - Revert Vercel to the previous Angular build (the one that uses Supabase).
   - Stop the NestJS API (or leave it running but stop accepting traffic).

2. **Data sync:**
   - Any new data created in NestJS after cutover must be exported and
     imported back into Supabase manually.
   - Use the reconciliation report (`migration/02_reconciliation_report.sql`)
     to identify records created after cutover timestamp.

3. **Auth:**
   - Users who reset passwords on NestJS will need to reset again on Supabase
     (or use password recovery flow).
   - Supabase auth.users table is unchanged — original credentials still work.

4. **Verification:**
   - Confirm all users can log in to Supabase-based Angular app.
   - Confirm all pre-cutover data is intact in Supabase.

**Data impact:** Post-cutover NestJS data needs manual export/import to
Supabase. Pre-cutover Supabase data is unaffected.

---

### Scenario D: Database corruption or migration failure

**Rollback:**
1. Restore PostgreSQL from the most recent automated backup.
2. Re-run TypeORM migrations if needed.
3. If Supabase data was migrated, re-run the data migration script from the
   verified Supabase backup.

**Data impact:** Potential loss of data created after the last backup.

---

## Cutover Checklist

### Pre-cutover (must all be ✓)

- [ ] All 275 backend tests pass
- [ ] Backend build succeeds (no TypeScript errors)
- [ ] Backend lint passes
- [ ] Docker image builds successfully
- [ ] Health check endpoint returns 200 (`/api/health/ready`)
- [ ] Production `.env.production` filled with real secrets (not defaults)
- [ ] Database migrations applied to production PostgreSQL
- [ ] Database backup taken and verified restorable
- [ ] CORS_ORIGIN set to production frontend domain
- [ ] COOKIE_SECURE=true
- [ ] VAPID keys generated and configured
- [ ] PUSH_CRON_SECRET configured
- [ ] Single replica of API running (to avoid duplicate cron notifications)
- [ ] Uptime monitoring configured on `/api/health/ready`
- [ ] Angular production build succeeds
- [ ] Vercel environment variables set (apiUrl, vapidPublicKey)
- [ ] Staging test completed end-to-end (register → login → create tx → view dashboard)
- [ ] Cross-user authorization tested (user A cannot access user B's data)
- [ ] Password reset flow documented and communicated to users

### Cutover (execute in order)

1. Deploy NestJS API to production
2. Verify `/api/health/ready` returns 200
3. Deploy Angular to Vercel with new `apiUrl` env var
4. Verify Angular loads and calls `/api/auth/me` successfully
5. Create test user, verify full CRUD flow works
6. Verify push notification subscription works (VAPID keys correct)
7. Verify cron scheduler runs (check logs at 15-min interval)
8. Notify users to log in and reset passwords

### Post-cutover (monitor for 24-48 hours)

- [ ] Monitor error rates on `/api/health/ready`
- [ ] Monitor push notification delivery logs
- [ ] Monitor database connection pool
- [ ] Compare reconciliation reports between Supabase and NestJS
- [ ] Verify no duplicate notifications from cron
- [ ] Verify wallet/bank balances match between systems

### Rollback trigger conditions

Roll back immediately if any of the following occur:
- Authentication failures affecting >5% of login attempts
- Data inconsistency detected in reconciliation reports
- Push notifications sending to wrong users (cross-user leak)
- Cron scheduler sending duplicate notifications
- Database connection exhaustion
- Health check failing for >10 minutes

---

## Recovery Procedure

### Full system recovery from backup

1. Provision new PostgreSQL instance
2. Restore from latest automated backup
3. Run TypeORM migrations (`npm run migration:run`)
4. If data was migrated from Supabase, re-run migration script from Supabase backup
5. Redeploy NestJS API
6. Redeploy Angular to Vercel
7. Verify health checks
8. Notify users to log in

### Partial recovery (specific user data corruption)

1. Identify affected user IDs from error logs
2. Export affected user's data from Supabase backup
3. Import into NestJS PostgreSQL using migration script (single-user subset)
4. Verify data integrity with reconciliation queries
5. Notify affected users

---

## Supabase Preservation Rule

**NEVER:**
- Delete Supabase tables
- Delete Supabase functions (including push-notifications Edge Function)
- Delete Supabase project
- Delete Supabase backups
- Revoke Supabase API keys

Supabase remains as the system of record until explicitly decommissioned
with separate approval.
