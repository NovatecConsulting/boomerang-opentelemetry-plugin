import api, { Span } from '@opentelemetry/api';
import { CustomIdGenerator } from './transactionIdGeneration';

/**
 * Manager, that stores the transaction-span and provides Getter- and Setter-functions
 */
export class TransactionSpanManager {

  private static readonly openTelemetryVersion = "0.25.0";
  private static readonly documentLoadTracerName = "@opentelemetry/instrumentation-document-load";

  // Store trace-id, before transactionSpan was created
  private static transactionTraceId: string;
  // Store span-id, before transactionSpan was created
  private static transactionSpanId: string;
  private static transactionSpan: Span;

  // Disabled, by default
  private static isTransactionRecordingEnabled = false;

  private static idGenerator: CustomIdGenerator;

  public static initialize = (isTransactionRecordingEnabled: boolean,
                              idGenerator: CustomIdGenerator) => {
    TransactionSpanManager.isTransactionRecordingEnabled = isTransactionRecordingEnabled;
    TransactionSpanManager.idGenerator = idGenerator;
  }

  public static getTransactionTraceId = () => {
    return TransactionSpanManager.transactionTraceId;
  }

  public static setTransactionTraceId = (traceId: string) => {
    if(TransactionSpanManager.isTransactionRecordingEnabled)
      TransactionSpanManager.transactionTraceId = traceId;
  }

  public static getTransactionSpanId = () => {
    return TransactionSpanManager.transactionSpanId;
  }

  public static setTransactionSpanId = (spanId: string) => {
    if(TransactionSpanManager.isTransactionRecordingEnabled)
      TransactionSpanManager.transactionSpanId = spanId;
  }

  public static getTransactionSpan = () => {
    return TransactionSpanManager.transactionSpan;
  }

  public static setTransactionSpan = (span: Span) => {
    if(TransactionSpanManager.isTransactionRecordingEnabled)
      TransactionSpanManager.transactionSpan = span;
  }

  public static startNewTransaction = (spanName: string) => {
    // Check if transactions should be recorded, otherwise don't start transaction
    if(!TransactionSpanManager.isTransactionRecordingEnabled) {
      console.warn("No Transaction started: Transaction recording is disabled");
      return;
    }

    const currentTransactionSpan = TransactionSpanManager.getTransactionSpan();
    if(currentTransactionSpan) TransactionSpanManager.transactionSpan.end();
    // Delete current transaction span, after closing it
    TransactionSpanManager.setTransactionSpan(null);

    // Delete current transaction IDs, so the IdGenerator cannot use it
    TransactionSpanManager.setTransactionTraceId(null);
    TransactionSpanManager.setTransactionSpanId(null);
    // Generate new random transaction trace ID
    const newTraceId = TransactionSpanManager.idGenerator.generateTraceId();
    TransactionSpanManager.setTransactionTraceId(newTraceId);

    // Just use any existing tracer, for example document-load
    const tracer = api.trace.getTracer(TransactionSpanManager.documentLoadTracerName, TransactionSpanManager.openTelemetryVersion);
    const newTransactionSpan = tracer.startSpan(spanName, {root: true});
    TransactionSpanManager.setTransactionSpan(newTransactionSpan);
  }
}
