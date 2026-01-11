import { describe, expect, it } from 'bun:test'
import { makeEnvelope } from '../src/queues'

describe('makeEnvelope', () => {
  it('generates a valid envelope with defaults', () => {
    const payload = { foo: 'bar' }
    const envelope = makeEnvelope({
      type: 'test.job',
      payload,
      source: 'cli'
    })

    expect(envelope.v).toBe(1)
    expect(envelope.type).toBe('test.job')
    expect(envelope.payload).toEqual(payload)
    expect(envelope.source).toBe('cli')
    expect(envelope.traceId).toBeDefined()
    expect(envelope.traceId.length).toBeGreaterThan(0)
    expect(envelope.createdAt).toBeLessThanOrEqual(Date.now())
    expect(envelope.createdAt).toBeGreaterThan(Date.now() - 1000)
    expect(envelope.parentTraceId).toBeUndefined()
  })

  it('includes parentTraceId if provided', () => {
    const parentTraceId = 'parent-123'
    const envelope = makeEnvelope({
      type: 'test.job',
      payload: {},
      source: 'api',
      parentTraceId
    })

    expect(envelope.parentTraceId).toBe(parentTraceId)
  })

  it('generates unique traceIds', () => {
    const e1 = makeEnvelope({ type: 't', payload: {}, source: 'cli' })
    const e2 = makeEnvelope({ type: 't', payload: {}, source: 'cli' })
    expect(e1.traceId).not.toBe(e2.traceId)
  })
})
