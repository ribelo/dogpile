export type JobSource = 'api' | 'scheduler' | 'scraper-processor' | 'cli' | 'admin'

export interface JobEnvelope<T extends string, P> {
  v: 1
  type: T
  payload: P
  traceId: string
  createdAt: number
  source: JobSource
  parentTraceId?: string
}

export interface MakeEnvelopeOptions<T extends string, P> {
  type: T
  payload: P
  source: JobSource
  parentTraceId?: string
}

export const makeEnvelope = <T extends string, P>(
  options: MakeEnvelopeOptions<T, P>
): JobEnvelope<T, P> => {
  const base: JobEnvelope<T, P> = {
    v: 1,
    type: options.type,
    payload: options.payload,
    traceId: crypto.randomUUID(),
    createdAt: Date.now(),
    source: options.source
  }

  if (options.parentTraceId === undefined) {
    return base
  }

  return { ...base, parentTraceId: options.parentTraceId }
}
