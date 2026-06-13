// Realtime channel + event names. Shared by client (subscribe) and server
// (broadcast). Payloads are minimal hints to refetch authoritative state,
// never the source of truth.

export const channels = {
  session: (sessionId: string) => `p:${sessionId}`,
};

export const events = {
  questionAdded: "question_added", // someone submitted → refetch list
  voteChanged: "vote_changed", // a vote toggled → refetch list
  stateChanged: "state_changed", // show/hide/answer/mode/close → refetch all
  pollChanged: "poll_changed", // a poll opened/closed/shown or a response cast → refetch
} as const;
