export function isAuthorizedInternalCallback(
  configuredKey: string,
  providedHeader: string | null | undefined,
): boolean {
  if (!configuredKey) return false
  return providedHeader === configuredKey
}

export function deriveRequestStatusFromRemaining(remainingAgents: number): 'running' | 'completed' {
  return remainingAgents === 0 ? 'completed' : 'running'
}

