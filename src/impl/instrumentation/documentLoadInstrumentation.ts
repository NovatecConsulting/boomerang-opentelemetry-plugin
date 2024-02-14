/**
 * Inject code into the original the OT-DocumentLoadInstrumentation as well as the OT-Tracer
 * Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
 */
import {
  DocumentLoadInstrumentation,
  DocumentLoadInstrumentationConfig
} from '@opentelemetry/instrumentation-document-load';
import * as api from '@opentelemetry/api';
import { captureTraceParentFromPerformanceEntries } from '../transaction/servertiming';
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { Span, Tracer } from '@opentelemetry/sdk-trace-base';
import { isTracingSuppressed } from '@opentelemetry/core/build/src/trace/suppress-tracing'
import { sanitizeAttributes } from '@opentelemetry/core/build/src/common/attributes';
import { TransactionSpanManager } from '../transaction/transactionSpanManager';
import { addUrlParams } from './urlParams';
import { GlobalInstrumentationConfig } from '../../types';
import { Context, SpanOptions } from '@opentelemetry/api';

export interface CustomDocumentLoadInstrumentationConfig extends DocumentLoadInstrumentationConfig {
  recordTransaction?: boolean;
  exporterDelay?: number;
}

/**
 * Patch the Tracer class to use the transaction span as root span.
 * For any additional instrumentation of the startSpan() function, you have to use the
 * new returned function
 *
 * Original: https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-sdk-trace-base/src/Tracer.ts
 * OpenTelemetry version: 0.48.0
 *
 * @return new startSpan() function
 */
export function patchTracerForTransactions(): (name: string, options?: SpanOptions, context?: Context) => (api.Span) {
  /**
   * Overwrite startSpan() in Tracer class
   * Copy of the original startSpan()-function with additional logic inside the function to determine the parentContext
   */
  const overwrittenFunction = function (
    name: string,
    options: api.SpanOptions = {},
    context = api.context.active()
  ) {
    // remove span from context in case a root span is requested via options
    if (options.root) {
      context = api.trace.deleteSpan(context);
    }
    const parentSpan = api.trace.getSpan(context);

    if (isTracingSuppressed(context)) {
      api.diag.debug('Instrumentation suppressed, returning Noop Span');
      const nonRecordingSpan = api.trace.wrapSpanContext(
        api.INVALID_SPAN_CONTEXT
      );
      return nonRecordingSpan;
    }

    /*
      #######################################
              OVERWRITTEN LOGIC START
      #######################################
     */

    let parentSpanContext = parentSpan?.spanContext();
    // let parentSpanContext;
    // if(options.root) parentSpanContext = undefined;
    // else parentSpanContext = api.trace.getSpanContext(context);

    if(!parentSpanContext) {
      const transactionSpan = TransactionSpanManager.getTransactionSpan();
      if(transactionSpan)
        parentSpanContext = transactionSpan.spanContext();
    }

    // Use transaction span-ID for documentLoadSpan, if existing
    let spanId = this._idGenerator.generateSpanId();
    if(name == "documentLoad") {
      const transactionSpanId = TransactionSpanManager.getTransactionSpanId();
      if(transactionSpanId) spanId = transactionSpanId;
    }

    /*
      #######################################
              OVERWRITTEN LOGIC END
      #######################################
     */

    let traceId;
    let traceState;
    let parentSpanId;
    if (
      !parentSpanContext ||
      !api.trace.isSpanContextValid(parentSpanContext)
    ) {
      // New root span.
      traceId = this._idGenerator.generateTraceId();
    } else {
      // New child span.
      traceId = parentSpanContext.traceId;
      traceState = parentSpanContext.traceState;
      parentSpanId = parentSpanContext.spanId;
    }

    const spanKind = options.kind ?? api.SpanKind.INTERNAL;
    const links = (options.links ?? []).map(link => {
      return {
        context: link.context,
        attributes: sanitizeAttributes(link.attributes),
      };
    });
    const attributes = sanitizeAttributes(options.attributes);
    // make sampling decision
    const samplingResult = this._sampler.shouldSample(
      context,
      traceId,
      name,
      spanKind,
      attributes,
      links
    );

    traceState = samplingResult.traceState ?? traceState;

    const traceFlags =
      samplingResult.decision === api.SamplingDecision.RECORD_AND_SAMPLED
        ? api.TraceFlags.SAMPLED
        : api.TraceFlags.NONE;
    const spanContext = { traceId, spanId, traceFlags, traceState };
    if (samplingResult.decision === api.SamplingDecision.NOT_RECORD) {
      api.diag.debug(
        'Recording is off, propagating context in a non-recording span'
      );
      const nonRecordingSpan = api.trace.wrapSpanContext(spanContext);
      return nonRecordingSpan;
    }

    // Set initial span attributes. The attributes object may have been mutated
    // by the sampler, so we sanitize the merged attributes before setting them.
    const initAttributes = sanitizeAttributes(
      Object.assign(attributes, samplingResult.attributes)
    );

    const span = new Span(
      this,
      context,
      name,
      spanContext,
      spanKind,
      parentSpanId,
      links,
      options.startTime,
      undefined,
      initAttributes
    );
    return span;
  }

  // Assign the function to the Tracer
  Tracer.prototype.startSpan = overwrittenFunction;
  // Return the function for additional instrumentation, if necessary
  return overwrittenFunction;
}

type PerformanceEntriesWithServerTiming = PerformanceEntries & {serverTiming?: ReadonlyArray<({name: string, duration: number, description: string})>}
type ExposedDocumentLoadSuper = {
  _startSpan(spanName: string, performanceName: string, entries: PerformanceEntries, parentSpan?: Span): api.Span | undefined;
  _endSpan(span: api.Span | undefined, performanceName: string, entries: PerformanceEntries): void;
}

export class CustomDocumentLoadInstrumentation extends DocumentLoadInstrumentation {
  readonly component: string = 'document-load-server-timing';
  moduleName = this.component;

  // Per default transaction should not be recorded
  private recordTransaction = false;

  constructor(config: CustomDocumentLoadInstrumentationConfig = {}, globalInstrumentationConfig: GlobalInstrumentationConfig) {
    super(config);
    const { requestParameter} = globalInstrumentationConfig;

    if(config.recordTransaction)
      this.recordTransaction = config.recordTransaction;

    //Store original functions in variables
    const exposedSuper = this as any as ExposedDocumentLoadSuper;
    const _superStartSpan: ExposedDocumentLoadSuper['_startSpan'] = exposedSuper._startSpan.bind(this);
    const _superEndSpan: ExposedDocumentLoadSuper['_endSpan'] = exposedSuper._endSpan.bind(this);

    if(this.recordTransaction) {
      //Override function
      exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
        if (!(entries as PerformanceEntriesWithServerTiming).serverTiming && performance.getEntriesByType) {
          const navEntries = performance.getEntriesByType('navigation');
          // @ts-ignore
          if (navEntries[0]?.serverTiming) {
            // @ts-ignore
            (entries as PerformanceEntriesWithServerTiming).serverTiming = navEntries[0].serverTiming;
          }
        }
        captureTraceParentFromPerformanceEntries(entries);

        const span = _superStartSpan(spanName, performanceName, entries, parentSpan);
        const exposedSpan = span as any as Span;
        if(exposedSpan.name == "documentLoad") TransactionSpanManager.setTransactionSpan(span);

        if(span && exposedSpan.name == "documentLoad" && requestParameter?.enabled)
          addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);

        return span;
      }

      //Override function
      exposedSuper._endSpan = (span, performanceName, entries) => {
        const transactionSpan = TransactionSpanManager.getTransactionSpan();
        // Don't close transactionSpan
        // transactionSpan will be closed through "beforeunload"-event
        if(transactionSpan && transactionSpan == span) return;

        return _superEndSpan(span, performanceName, entries);
      };
    }
    else {
      //Override function
      exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
        const span = _superStartSpan(spanName, performanceName, entries, parentSpan);
        const exposedSpan = span as any as Span;

        if(span && exposedSpan.name == "documentLoad" && requestParameter?.enabled)
          addUrlParams(span, location.href, requestParameter.excludeKeysFromBeacons);

        return span;
      }
    }
  }
}
