// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { captureTraceParentFromPerformanceEntries } from './servertiming';
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { Span } from '@opentelemetry/sdk-trace-base';
import OpenTelemetryTracingImpl from './index'

export interface DocumentLoadServerTimingInstrumentationConfig extends InstrumentationConfig {
  ignoreUrls?: (string|RegExp)[];
}

type PerformanceEntriesWithServerTiming = PerformanceEntries & {serverTiming?: ReadonlyArray<({name: string, duration: number, description: string})>}

type ExposedSuper = {
  _startSpan(spanName: string, performanceName: string, entries: PerformanceEntries, parentSpan?: Span): void;
}

export class DocumentLoadServerTimingInstrumentation extends DocumentLoadInstrumentation {

  readonly component: string = 'document-load-server-timing';
  moduleName = this.component;

  constructor(config: DocumentLoadServerTimingInstrumentationConfig = {}, impl: OpenTelemetryTracingImpl) {
    super(config);

    const exposedSuper = this as any as ExposedSuper;


    const _superStartSpan: ExposedSuper['_startSpan'] = exposedSuper._startSpan.bind(this);
    exposedSuper._startSpan = (spanName, performanceName, entries, parentSpan) => {
      if (
        !(entries as PerformanceEntriesWithServerTiming).serverTiming &&
        performance.getEntriesByType
      ) {
        const navEntries = performance.getEntriesByType('navigation');
        // @ts-ignore
        if (navEntries[0]?.serverTiming) {
          // @ts-ignore
          (entries as PerformanceEntriesWithServerTiming).serverTiming = navEntries[0].serverTiming;
        }
      }

      captureTraceParentFromPerformanceEntries(entries, impl);

      return _superStartSpan(spanName, performanceName, entries, parentSpan);
    }
  }
}
