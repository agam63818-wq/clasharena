// api/_lib/audit.js
// Best-effort admin audit trail (supabase/proposed/007_admin_audit_log.sql).
//
// Every privileged action the admin router performs is recorded with the
// admin id that was verified from the caller's token. The write is BEST
// EFFORT on purpose: a missing or broken audit table must never undo an
// action that already happened — but it is never silent either. The failure is
// logged server-side and reported to the caller as `auditLogged: false`, so
// the client can tell the truth instead of assuming the log exists.

export async function recordAdminAction(supabase, { adminId, action, targetType, targetId, details } = {}) {
  try {
    const { error } = await supabase.from('admin_audit_log').insert([
      {
        admin_id: adminId,
        action,
        target_type: targetType,
        // target_id is a TEXT column (tournament ids are bigint, user ids are uuid).
        target_id: targetId === undefined || targetId === null || targetId === '' ? null : String(targetId),
        details: details || {}
      }
    ]);

    if (error) {
      // Logged, not thrown: the action stands, the gap is visible.
      console.warn(`admin audit log: NOT written for ${action}: ${error.message}`);
      return false;
    }
    return true;
  } catch (err) {
    // A transport failure (or a missing table the client could not even
    // describe) is still only a logging gap — never a reason to fail an
    // action that has already been performed.
    console.warn(`admin audit log: NOT written for ${action}: ${err && err.message}`);
    return false;
  }
}
