-- Both character and cosmetic refunds credit a student's wallet and must
-- enqueue the same durable notification event.
DROP TRIGGER IF EXISTS "notification_outbox_transaction_insert"
ON public."Transaction";

CREATE TRIGGER "notification_outbox_transaction_insert"
AFTER INSERT ON public."Transaction"
FOR EACH ROW
WHEN (
  (NEW."type" = 'deposit' AND NEW."sourceType" IN (
    'reading_reward', 'walking_reward', 'walking_weekly_reward',
    'walking_classroom_rank_reward', 'assignment_reward', 'comment_reward',
    'attendance_reward', 'reading_weekly_mission_reward',
    'reading_classroom_rank_reward'
  ))
  OR (
    NEW."type" = 'refund'
    AND NEW."sourceType" IN ('slime_refund', 'slime_item_refund')
  )
)
EXECUTE FUNCTION private.enqueue_notification_outbox('transaction');
