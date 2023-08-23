import { IdGenerator } from '@opentelemetry/core';
import { RandomIdGenerator } from '@opentelemetry/core';
import OpenTelemetryTracingImpl from './index'

const SPAN_ID_BYTES = 8;
const TRACE_ID_BYTES = 16;
const SHARED_BUFFER = Buffer.allocUnsafe(TRACE_ID_BYTES);

// Copy of RandomIdGenerator with adjusted functions
export class CustomIdGenerator implements IdGenerator {

  private impl: OpenTelemetryTracingImpl;

  constructor(impl: OpenTelemetryTracingImpl) {
    this.impl = impl;
  }

  /**
   * Returns a random 16-byte trace ID formatted/encoded as a 32 lowercase hex
   * characters corresponding to 128 bits.
   */
  generateTraceId = this.getServerTimingTraceId();

  /**
   * Returns a random 8-byte span ID formatted/encoded as a 16 lowercase hex
   * characters corresponding to 64 bits.
   */
  generateSpanId = this.getIdGenerator(SPAN_ID_BYTES);


  getServerTimingTraceId(): () => string {
    const correlationTraceID = this.impl.getTraceID();

    // Use Trace-ID from server-timing-header, if existing
    if(correlationTraceID) {
      return () => correlationTraceID;
    }
    else return this.getIdGenerator(TRACE_ID_BYTES);
  }

  getIdGenerator(bytes: number): () => string {
    return function generateId() {
      for (let i = 0; i < bytes / 4; i++) {
        // unsigned right shift drops decimal part of the number
        // it is required because if a number between 2**32 and 2**32 - 1 is generated, an out of range error is thrown by writeUInt32BE
        SHARED_BUFFER.writeUInt32BE((Math.random() * 2 ** 32) >>> 0, i * 4);
      }

      // If buffer is all 0, set the last byte to 1 to guarantee a valid w3c id is generated
      for (let i = 0; i < bytes; i++) {
        if (SHARED_BUFFER[i] > 0) {
          break;
        } else if (i === bytes - 1) {
          SHARED_BUFFER[bytes - 1] = 1;
        }
      }

      return SHARED_BUFFER.toString('hex', 0, bytes);
    };
  }
}


