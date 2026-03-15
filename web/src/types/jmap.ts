/** Core JMAP protocol types */

export interface JMAPRequest {
  using: string[];
  methodCalls: JMAPMethodCall[];
}

export type JMAPMethodCall = [method: string, args: Record<string, unknown>, callId: string];

export interface JMAPResponse {
  methodResponses: JMAPMethodResponse[];
  sessionState: string;
}

export type JMAPMethodResponse = [method: string, result: Record<string, unknown>, callId: string];

export interface JMAPError {
  type: string;
  description?: string;
  status?: number;
}

export interface JMAPQueryResponse {
  accountId: string;
  queryState: string;
  canCalculateChanges: boolean;
  position: number;
  ids: string[];
  total: number;
  limit?: number;
}

export interface JMAPGetResponse<T> {
  accountId: string;
  state: string;
  list: T[];
  notFound: string[];
}

export interface JMAPSetResponse {
  accountId: string;
  oldState: string;
  newState: string;
  created?: Record<string, Record<string, unknown>>;
  updated?: Record<string, Record<string, unknown> | null>;
  destroyed?: string[];
  notCreated?: Record<string, JMAPError>;
  notUpdated?: Record<string, JMAPError>;
  notDestroyed?: Record<string, JMAPError>;
}

export interface JMAPFilter {
  operator?: "AND" | "OR" | "NOT";
  conditions?: JMAPFilter[];
  inMailbox?: string;
  inMailboxOtherThan?: string[];
  hasKeyword?: string;
  notKeyword?: string;
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  before?: string;
  after?: string;
  hasAttachment?: boolean;
  minSize?: number;
  maxSize?: number;
}

export interface JMAPSort {
  property: string;
  isAscending: boolean;
}
