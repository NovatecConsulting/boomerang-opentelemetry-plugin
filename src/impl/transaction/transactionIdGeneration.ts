import { IdGenerator } from '@opentelemetry/sdk-trace-base';
import { TransactionSpanManager } from './transactionSpanManager';

const SPAN_ID_BYTES = 8;
const TRACE_ID_BYTES = 16;
const SHARED_CHAR_CODES_ARRAY = Array(32);

/**
 * Copy of RandomIdGenerator with additional getTransactionTraceId()-function
 * Original: https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/platform/browser/RandomIdGenerator.ts
 * The RandomIdGenerator of the src/platform/node/ package does not work, since 'Buffer' is not defined at runtime
 */

export class CustomIdGenerator implements IdGenerator {

  /**
   * Returns a random 16-byte trace ID formatted/encoded as a 32 lowercase hex
   * characters corresponding to 128 bits.
   */
  get generateTraceId(): () => string {
    return this.getTransactionTraceId();
  }

  /**
   * Returns a random 8-byte span ID formatted/encoded as a 16 lowercase hex
   * characters corresponding to 64 bits.
   */
  get generateSpanId(): () => string {
    return this.getIdGenerator(SPAN_ID_BYTES);
  }

  /**
   * If there is a transaction-trace-id, use it
   * Otherwise, generate a new trace-id the ordinary way
   */
  getTransactionTraceId(): () => string {
    const transactionTraceId = TransactionSpanManager.getTransactionTraceId();
    // Use current transaction trace ID, if existing
    if(transactionTraceId) return () => transactionTraceId;
    else return this.getIdGenerator(TRACE_ID_BYTES);
  }

  getIdGenerator(bytes: number): () => string {
    return function generateId() {
      for (let i = 0; i < bytes * 2; i++) {
        SHARED_CHAR_CODES_ARRAY[i] = Math.floor(Math.random() * 16) + 48;
        // valid hex characters in the range 48-57 and 97-102
        if (SHARED_CHAR_CODES_ARRAY[i] >= 58) {
          SHARED_CHAR_CODES_ARRAY[i] += 39;
        }
      }
      return String.fromCharCode.apply(
        null,
        SHARED_CHAR_CODES_ARRAY.slice(0, bytes * 2)
      );
    };
  }
}
