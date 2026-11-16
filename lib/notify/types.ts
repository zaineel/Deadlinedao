export type NotificationEvent =
  | { kind: 'appeal_window_open'; goalId: string; goalTitle: string; closesAt: string }
  | { kind: 'appeal_resolved'; goalId: string; goalTitle: string; outcome: 'upheld' | 'overturned' }
  | { kind: 'deadline_reminder'; goalId: string; goalTitle: string; deadline: string }
  | { kind: 'proof_result'; goalId: string; goalTitle: string; verdict: 'approved' | 'rejected' | 'needs_review' }
  | { kind: 'team_invite'; teamName: string; invitedBy: string }
  | { kind: 'reward_paid'; goalId?: string; amountSol: number; signature: string };

export type NotificationKind = NotificationEvent['kind'];

export interface Recipient {
  wallet: string;
  email?: string;
  expoPushTokens?: string[];
}

export interface SendResult {
  ok: boolean;
  error?: string;
}

export interface Channel {
  name: string;
  send(event: NotificationEvent, recipient: Recipient): Promise<SendResult>;
}

export interface RenderedMessage {
  title: string;
  body: string;
}
