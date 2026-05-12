import { updateSettings, logAction } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    const missionDirective = "Close the existing LTC and XRP positions at the earliest opportunity, overriding the 2.5% profit floor for these specific exits. The primary objective is to clear the book and reset the system to a zero-position state. All new trade executions remain paused until both positions are confirmed closed.";
    
    const coachNotes = "[NULL Strategic Command - EMERGENCY OVERRIDE]: CIPHER, immediately close your existing LTC and XRP positions at current market prices, disregarding the 2.5% profit floor. Clearing the book is your only objective. Do not open new positions.";

    await updateSettings({
      missionDirective: missionDirective,
      missionSetBy: "Human Override (Auditor Recommendation)",
      coachNotes: coachNotes
    });

    await logAction('⚠️ [SYSTEM OVERRIDE] Auditor recommendation applied: Mission and NULL directive updated to clear the book.', true);

    res.status(200).json({ ok: true, message: 'Emergency override applied successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
