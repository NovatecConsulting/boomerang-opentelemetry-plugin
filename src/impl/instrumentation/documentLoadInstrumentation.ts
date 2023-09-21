// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import * as api from '@opentelemetry/api';
import { captureTraceParentFromPerformanceEntries } from '../transaction/servertiming';
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { Span, Tracer } from '@opentelemetry/sdk-trace-base';
import { isTracingSuppressed } from '@opentelemetry/core/build/src/trace/suppress-tracing'
import { sanitizeAttributes } from '@opentelemetry/core/build/src/common/attributes';
import { TransactionSpanManager } from '../transaction/transactionSpanManager';
import { addUrlParams } from './urlParams';
import { RequestParameterConfig } from '../../types';

export interface CustomDocumentLoadInstrumentationConfig extends InstrumentationConfig {
  recordTransaction?: boolean;
  exporterDelay?: number;
}

/**
 * Patch the Tracer class to use the transaction span as root span
 * OpenTelemetry version: 0.25.0
 */
export function patchTracer() {
  // Overwrite startSpan() in Tracer class
  // Copy of the original startSpan()-function with additional logic inside the function to determine the parentContext
  Tracer.prototype.startSpan = function (
    name: string,
    options: api.SpanOptions = {},
    context = api.context.active()
  ) {

    if (isTracingSuppressed(context)) {
      api.diag.debug('Instrumentation suppressed, returning Noop Span');
      return api.trace.wrapSpanContext(api.INVALID_SPAN_CONTEXT);
    }

    /*
      #######################################
              OVERWRITTEN LOGIC START
      #######################################
     */

    let parentContext; //getParent(options, context);
    if(options.root) parentContext = undefined;
    else parentContext = api.trace.getSpanContext(context);

    if(!parentContext) {
      const transactionSpan = TransactionSpanManager.getTransactionSpan();
      if(transactionSpan)
        parentContext = transactionSpan.spanContext();
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
    if (!parentContext || !api.trace.isSpanContextValid(parentContext)) {
      // New root span.
      traceId = this._idGenerator.generateTraceId();
    } else {
      // New child span.
      traceId = parentContext.traceId;
      traceState = parentContext.traceState;
      parentSpanId = parentContext.spanId;
    }

    const spanKind = options.kind ?? api.SpanKind.INTERNAL;
    const links = options.links ?? [];
    const attributes = sanitizeAttributes(options.attributes);
    // make sampling decision
    const samplingResult = this._sampler.shouldSample(
      options.root
        ? api.trace.setSpanContext(context, api.INVALID_SPAN_CONTEXT)
        : context,
      traceId,
      name,
      spanKind,
      attributes,
      links
    );

    const traceFlags =
      samplingResult.decision === api.SamplingDecision.RECORD_AND_SAMPLED
        ? api.TraceFlags.SAMPLED
        : api.TraceFlags.NONE;
    const spanContext = { traceId, spanId, traceFlags, traceState };
    if (samplingResult.decision === api.SamplingDecision.NOT_RECORD) {
      api.diag.debug('Recording is off, propagating context in a non-recording span');
      return api.trace.wrapSpanContext(spanContext);
    }

    const span = new Span(
      this,
      context,
      name,
      spanContext,
      spanKind,
      parentSpanId,
      links,
      options.startTime
    );
    // Set default attributes
    span.setAttributes(Object.assign(attributes, samplingResult.attributes));
    return span;
  }
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

  private readonly excludeUrlKeys: string[] = [];

  constructor(config: CustomDocumentLoadInstrumentationConfig = {}, requestParameterConfig: RequestParameterConfig) {
    super(config);

    if(config.recordTransaction)
      this.recordTransaction = config.recordTransaction;

    if(requestParameterConfig.enabled)
      this.excludeUrlKeys = requestParameterConfig.excludeKeys;

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

        if(span) addUrlParams(span, location.href, this.excludeUrlKeys);

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
        if(span && exposedSpan.name == "documentLoad") addUrlParams(span, location.href, this.excludeUrlKeys);

        return span;
      }
    }
  }
}
