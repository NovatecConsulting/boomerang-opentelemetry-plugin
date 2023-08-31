// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import * as api from '@opentelemetry/api';
import { captureTraceParentFromPerformanceEntries } from './servertiming';
import { PerformanceEntries, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { Span, Tracer } from '@opentelemetry/sdk-trace-base';
import OpenTelemetryTracingImpl from './index'
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import {
  XMLHttpRequestInstrumentation,
  XMLHttpRequestInstrumentationConfig
} from '@opentelemetry/instrumentation-xml-http-request';
import { Context, ContextAPI, trace } from '@opentelemetry/api';
import { hrTime, isUrlIgnored, otperformance } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { EventNames } from "@opentelemetry/instrumentation-xml-http-request/build/src/enums/EventNames"
import { XhrMem } from '@opentelemetry/instrumentation-xml-http-request/build/esm/types';

export interface DocumentLoadServerTimingInstrumentationConfig extends InstrumentationConfig {
  serverTiming?: boolean;
}

type PerformanceEntriesWithServerTiming = PerformanceEntries & {serverTiming?: ReadonlyArray<({name: string, duration: number, description: string})>}
type ExposedDocumentLoadSuper = {
  _startSpan(spanName: string, performanceName: string, entries: PerformanceEntries, parentSpan?: Span): api.Span | undefined;
  _endSpan(span: api.Span | undefined, performanceName: string, entries: PerformanceEntries): void;
}

export class DocumentLoadServerTimingInstrumentation extends DocumentLoadInstrumentation {
  readonly component: string = 'document-load-server-timing';
  moduleName = this.component;

  constructor(config: DocumentLoadServerTimingInstrumentationConfig = {}, impl: OpenTelemetryTracingImpl) {
    super(config);

    const exposedSuper = this as any as ExposedDocumentLoadSuper;

    const _superStartSpan: ExposedDocumentLoadSuper['_startSpan'] = exposedSuper._startSpan.bind(this);
    exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
      if (!(entries as PerformanceEntriesWithServerTiming).serverTiming && performance.getEntriesByType) {
        const navEntries = performance.getEntriesByType('navigation');
        // @ts-ignore
        if (navEntries[0]?.serverTiming) {
          // @ts-ignore
          (entries as PerformanceEntriesWithServerTiming).serverTiming = navEntries[0].serverTiming;
        }
      }

      captureTraceParentFromPerformanceEntries(entries, impl);
      const span = _superStartSpan(spanName, performanceName, entries, parentSpan);
      const exposedSpan = span as any as Span;
      if(exposedSpan.name == "documentLoad") impl.setTransactionSpan(span);

      return span;
    }

    const _superEndSpan: ExposedDocumentLoadSuper['_endSpan'] = exposedSuper._endSpan.bind(this);
    exposedSuper._endSpan = (span, performanceName, entries) => {
      const transactionTraceId = impl.getTransactionTraceId();

      if(transactionTraceId) {
        const transactionSpan = impl.getTransactionSpan();
        //Don't close span, if it's the transaction span
        //Transaction span will be closed through "beforeunload"-event
        if(transactionSpan && transactionSpan == span) {
           //trace.setSpan(api.context.active(), transactionSpan);
          //api.context.
          return;
        }
      }

      return _superEndSpan(span, performanceName, entries);
    };
  }
}

type ExposedUserInteractionSuper = {
  _createSpan(element: EventTarget | null | undefined, eventName: string, parentSpan?: api.Span | undefined): api.Span | undefined;
}
export class PatchedUserInteractionInstrumentation extends UserInteractionInstrumentation {

  constructor(config: InstrumentationConfig = {}, impl: OpenTelemetryTracingImpl) {
    super(config);

    const exposedSuper = this as any as ExposedUserInteractionSuper;

    const _superCreateSpan: ExposedUserInteractionSuper['_createSpan'] = exposedSuper._createSpan.bind(this);
    exposedSuper._createSpan = (element, eventName, parentSpan)=> {

      // UserInteractionInstrumentation does not find transactionSpan via api.context().active()
      if(!parentSpan) parentSpan = impl.getTransactionSpan();

      return _superCreateSpan(element, eventName, parentSpan);
    }
  }
}

type ExposedXMLHttpRequestSuper = {
  _createSpan(xhr: XMLHttpRequest, url: string, method: string): api.Span | undefined;
  _getConfig(): XMLHttpRequestInstrumentationConfig;
  _cleanPreviousSpanInformation(xhr: XMLHttpRequest): void;
  _xhrMem: WeakMap<XMLHttpRequest, XhrMem>;
}
export class PatchedXMLHttpRequestInstrumentation extends XMLHttpRequestInstrumentation {

  constructor(config: XMLHttpRequestInstrumentationConfig = {}, impl: OpenTelemetryTracingImpl) {
    super(config);

    const exposedSuper = this as any as ExposedXMLHttpRequestSuper;

    const _superCreateSpan: ExposedXMLHttpRequestSuper['_createSpan'] = exposedSuper._createSpan.bind(this);
    const _superGetConfig: ExposedXMLHttpRequestSuper['_getConfig'] = exposedSuper._getConfig.bind(this);
    const _superCleanPreviousSpanInformation: ExposedXMLHttpRequestSuper['_cleanPreviousSpanInformation'] = exposedSuper._cleanPreviousSpanInformation.bind(this);
    const _superXhrMem: ExposedXMLHttpRequestSuper['_xhrMem'] = exposedSuper._xhrMem;

    exposedSuper._createSpan = (xhr, url, method)=> {
      if (isUrlIgnored(url, _superGetConfig().ignoreUrls)) {
        this._diag.debug('ignoring span as url matches ignored url');
        return;
      }
      const spanName = `HTTP ${method.toUpperCase()}`;

      let activeContext = api.context.active();
      let contextKey = Symbol.for("OpenTelemetry Context Key SPAN");
      let activeSpan = activeContext.getValue(contextKey);

      // XMLHttpRequestInstrumentation does not find transactionSpan via api.context().active()
      if(!activeSpan) {
        const transactionSpan = impl.getTransactionSpan()
        activeContext = api.trace.setSpan(api.context.active(), transactionSpan);
      }

      const options = {
        kind: api.SpanKind.CLIENT,
        attributes: {
          [SemanticAttributes.HTTP_METHOD]: method,
          [SemanticAttributes.HTTP_URL]: url,
        },
      }
      const currentSpan = this.tracer.startSpan(spanName, options, activeContext);

      currentSpan.addEvent(EventNames.METHOD_OPEN);

      _superCleanPreviousSpanInformation(xhr);

      _superXhrMem.set(xhr, {
        span: currentSpan,
        spanUrl: url,
      });

      return currentSpan;
    }
  }
}

