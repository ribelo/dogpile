import { describe, test, expect, mock, beforeEach } from "bun:test"
import { Effect, Layer, Option } from "effect"
import { processMessageBase } from "../src/index.js"
import { 
  TextExtractor, 
  PhotoAnalyzer, 
  DescriptionGenerator,
} from "@dogpile/core/services"

// Mock dependencies
const mockTextExtractor = {
  extract: mock(() => Effect.succeed({
    sex: "male",
    breedEstimates: [],
    personalityTags: [],
    locationHints: {},
    urgent: false
  }))
}

const mockPhotoAnalyzer = {
  analyzeMultiple: mock(() => Effect.succeed({
    breedEstimates: [],
    furLength: "short",
    furType: "smooth"
  }))
}

const mockDescriptionGenerator = {
  generate: mock(() => Effect.succeed({ bio: "Mock bio" }))
}

const TextExtractorLive = Layer.succeed(TextExtractor, TextExtractor.of(mockTextExtractor as any))
const PhotoAnalyzerLive = Layer.succeed(PhotoAnalyzer, PhotoAnalyzer.of(mockPhotoAnalyzer as any))
const DescriptionGeneratorLive = Layer.succeed(DescriptionGenerator, DescriptionGenerator.of(mockDescriptionGenerator as any))

describe("Dog Lifecycle", () => {
  let mockEnv: any
  let mockMessage: any
  let mockAdapter: any

  const createStmt = (data: any = []) => {
    const stmt = {
      bind: mock(function() {
        return {
          all: mock(() => Promise.resolve(data)),
          run: mock(() => Promise.resolve({ success: true })),
          get: mock(() => Promise.resolve(data[0] || null)),
          raw: mock(() => Promise.resolve(data))
        }
      }),
      all: mock(() => Promise.resolve(data)),
      run: mock(() => Promise.resolve({ success: true })),
      get: mock(() => Promise.resolve(data[0] || null)),
      raw: mock(() => Promise.resolve(data))
    }
    return stmt
  }

  beforeEach(() => {
    mockMessage = {
      body: {
        shelterId: "shelter-1",
        shelterSlug: "test-shelter",
        baseUrl: "https://test.com"
      },
      ack: mock(() => {}),
      retry: mock(() => {})
    }

    mockEnv = {
      DB: {
        prepare: mock((query: string) => createStmt()),
        batch: mock((stmts: any[]) => Promise.all(stmts.map(s => s.all()))),
        exec: mock(() => Promise.resolve({}))
      },
      REINDEX_QUEUE: {
        send: mock(() => Promise.resolve()),
        sendBatch: mock(() => Promise.resolve())
      },
      IMAGE_QUEUE: {
        send: mock(() => Promise.resolve())
      }
    }

    mockAdapter = {
      id: "test-shelter",
      fetch: mock(() => Effect.succeed("<html></html>")),
      parse: mock(() => Effect.succeed([])),
      transform: mock((raw: any) => Effect.succeed({
        ...raw,
        shelterId: "shelter-1"
      }))
    }

    mock.module("@dogpile/scrapers", () => ({
      getAdapter: () => mockAdapter
    }))
  })

  describe("Circuit Breaker", () => {
    test("triggers when scraped count < 30% of existing", async () => {
      const existingDogs = Array.from({ length: 100 }, (_, i) => ({
        id: `dog-${i}`,
        fingerprint: `fp-${i}`,
        status: "available"
      }))
      
      const prepareMock = mock((query: string) => {
        let data: any[] = []
        if (query.toLowerCase().includes("select") && query.toLowerCase().includes("dogs") && !query.includes("<")) {
           data = existingDogs
        }
        return createStmt(data)
      })
      mockEnv.DB.prepare = prepareMock

      mockAdapter.parse = mock(() => Effect.succeed(Array.from({ length: 20 }, (_, i) => ({
        fingerprint: `new-fp-${i}`,
        rawDescription: "desc",
        externalId: `ext-${i}`,
        name: `Dog ${i}`
      }))))

      await Effect.runPromise(
        processMessageBase(mockMessage, mockEnv, "log-1").pipe(
          Effect.provide(Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive))
        )
      )

      expect(mockMessage.ack).toHaveBeenCalled()
      
      const syncLogUpdate = prepareMock.mock.calls.find((call: any) => 
        call[0].toLowerCase().includes("update") && 
        call[0].toLowerCase().includes("sync_logs") && 
        call[0].toLowerCase().includes("errors")
      )
      expect(syncLogUpdate).toBeDefined()
    })
    
    test("allows when scraped count >= 30%", async () => {
       const existingDogs = Array.from({ length: 100 }, (_, i) => ({
        id: `dog-${i}`,
        fingerprint: `fp-${i}`,
        status: "available"
      }))
      
      const prepareMock = mock((query: string) => {
        let data: any[] = []
        if (query.toLowerCase().includes("select") && query.toLowerCase().includes("dogs") && !query.includes("<")) {
           data = existingDogs
        }
        return createStmt(data)
      })
      mockEnv.DB.prepare = prepareMock

      mockAdapter.parse = mock(() => Effect.succeed(Array.from({ length: 50 }, (_, i) => ({
        fingerprint: `fp-${i}`,
        rawDescription: "desc",
        externalId: `ext-${i}`,
        name: `Dog ${i}`
      }))))

      await Effect.runPromise(
        processMessageBase(mockMessage, mockEnv, "log-1").pipe(
          Effect.provide(Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive))
        )
      )

      expect(mockMessage.ack).toHaveBeenCalled()
      const syncLogCircuitBreaker = prepareMock.mock.calls.filter((call: any) => 
        call[0].toLowerCase().includes("update") && 
        call[0].toLowerCase().includes("sync_logs") && 
        call[0].toLowerCase().includes("errors")
      )
      // Note: syncLogCircuitBreaker might have 1 call if it's the final update of the sync log,
      // but it shouldn't have the circuit breaker error.
      const hasCircuitBreakerError = syncLogCircuitBreaker.some((call: any) => 
        call[0].toLowerCase().includes("circuit breaker")
      )
      expect(hasCircuitBreakerError).toBe(false)
    })
  })
  
  describe("Heartbeat", () => {
    test("updates lastSeenAt for found dogs", async () => {
      const existingDogs = [{
        id: "dog-1",
        fingerprint: "fp-1",
        status: "available",
        lastSeenAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
      }]
      
      const prepareMock = mock((query: string) => {
        let data: any[] = []
        if (query.toLowerCase().includes("select") && query.toLowerCase().includes("dogs") && !query.includes("<")) {
           data = existingDogs
        }
        return createStmt(data)
      })
      mockEnv.DB.prepare = prepareMock

      mockAdapter.parse = mock(() => Effect.succeed([{
        fingerprint: "fp-1",
        rawDescription: "desc",
        externalId: "ext-1",
        name: "Dog 1"
      }]))

      await Effect.runPromise(
        processMessageBase(mockMessage, mockEnv, "log-1").pipe(
          Effect.provide(Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive))
        )
      )

      expect(mockMessage.ack).toHaveBeenCalled()
      const updateCall = prepareMock.mock.calls.find((call: any) => 
        call[0].toLowerCase().includes("update") && 
        call[0].toLowerCase().includes("dogs") && 
        call[0].toLowerCase().includes("last_seen_at")
      )
      expect(updateCall).toBeDefined()
    })
    
    test("resets status to available if was removed", async () => {
      const existingDogs = [{
        id: "dog-1",
        fingerprint: "fp-1",
        status: "removed",
        lastSeenAt: new Date(Date.now() - 48 * 60 * 60 * 1000)
      }]
      
      const prepareMock = mock((query: string) => {
        let data: any[] = []
        if (query.toLowerCase().includes("select") && query.toLowerCase().includes("dogs") && !query.includes("<")) {
           data = existingDogs
        }
        return createStmt(data)
      })
      mockEnv.DB.prepare = prepareMock

      mockAdapter.parse = mock(() => Effect.succeed([{
        fingerprint: "fp-1",
        rawDescription: "desc",
        externalId: "ext-1",
        name: "Dog 1"
      }]))

      await Effect.runPromise(
        processMessageBase(mockMessage, mockEnv, "log-1").pipe(
          Effect.provide(Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive))
        )
      )

      expect(mockMessage.ack).toHaveBeenCalled()
      const updateCall = prepareMock.mock.calls.find((call: any) => 
        call[0].toLowerCase().includes("update") && 
        call[0].toLowerCase().includes("dogs") && 
        call[0].toLowerCase().includes("status")
      )
      expect(updateCall).toBeDefined()
    })
  })
  
  describe("Graceful Sweep", () => {
    test("marks dogs removed after 36h stale", async () => {
      const staleDogs = [{
        id: "stale-dog",
        fingerprint: "fp-stale"
      }]

      const prepareMock = mock((query: string) => {
        let data: any[] = []
        if (query.toLowerCase().includes("select") && query.toLowerCase().includes("dogs") && query.includes("<")) {
           data = staleDogs
        }
        return createStmt(data)
      })
      mockEnv.DB.prepare = prepareMock

      mockAdapter.parse = mock(() => Effect.succeed([]))

      await Effect.runPromise(
        processMessageBase(mockMessage, mockEnv, "log-1").pipe(
          Effect.provide(Layer.mergeAll(TextExtractorLive, PhotoAnalyzerLive, DescriptionGeneratorLive))
        )
      )

      expect(mockEnv.REINDEX_QUEUE.sendBatch).toHaveBeenCalled()
      const updateCall = prepareMock.mock.calls.find((call: any) => 
        call[0].toLowerCase().includes("update") && 
        call[0].toLowerCase().includes("dogs") && 
        call[0].toLowerCase().includes("status")
      )
      expect(updateCall).toBeDefined()
    })
  })
})
