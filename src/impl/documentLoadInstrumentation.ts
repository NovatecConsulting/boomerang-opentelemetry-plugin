// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/SplunkDocumentLoadInstrumentation.ts
import { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import * as api from '@opentelemetry/api';
import { captureTraceParentFromPerformanceEntries } from './servertiming';
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import { Span } from '@opentelemetry/sdk-trace-base';
import { isUrlIgnored } from '@opentelemetry/core';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import OpenTelemetryTracingImpl from './index'

export interface DocumentLoadServerTimingInstrumentationConfig extends InstrumentationConfig {
  ignoreUrls?: (string|RegExp)[];
}

const excludedInitiatorTypes = ['beacon', 'fetch', 'xmlhttprequest'];

function addExtraDocLoadTags(span: api.Span) {
  if (document.referrer && document.referrer !== '') {
    span.setAttribute('document.referrer', document.referrer);
  }
  if (window.screen) {
    span.setAttribute('screen.xy', window.screen.width + 'x' + window.screen.height);
  }
}

type PerformanceEntriesWithServerTiming = PerformanceEntries & {serverTiming?: ReadonlyArray<({name: string, duration: number, description: string})>}

type ExposedSuper = {
  _endSpan(span: api.Span | undefined, performanceName: string, entries: PerformanceEntries): void;
  _initResourceSpan(resource: PerformanceResourceTiming, parentSpan: api.Span): void;
}

export class DocumentLoadServerTimingInstrumentation extends DocumentLoadInstrumentation {

  readonly component: string = 'document-load-server-timing';
  moduleName = this.component;

  constructor(config: DocumentLoadServerTimingInstrumentationConfig = {}, impl: OpenTelemetryTracingImpl) {
    super(config);

    const exposedSuper = this as any as ExposedSuper;

    const _superEndSpan: ExposedSuper['_endSpan'] = exposedSuper._endSpan.bind(this);
    exposedSuper._endSpan = (span, performanceName, entries) => {
      const exposedSpan = span as any as Span;

      if (span) {
        span.setAttribute('component', this.component);
      }

      if (span && exposedSpan.name !== 'documentLoad') { // only apply links to document/resource fetch
        // To maintain compatibility, getEntries copies out select items from
        // different versions of the performance API into its own structure for the
        // initial document load (but leaves the entries undisturbed for resource loads).
        if (
          exposedSpan.name === 'documentFetch' &&
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

        captureTraceParentFromPerformanceEntries(entries, span, impl);
        span.setAttribute(SemanticAttributes.HTTP_METHOD, 'GET');
      }
      if (span && exposedSpan.name === 'documentLoad') {
        addExtraDocLoadTags(span);
      }
      return _superEndSpan(span, performanceName, entries);
    };

    const _superInitResourceSpan: ExposedSuper['_initResourceSpan'] = exposedSuper._initResourceSpan.bind(this);
    exposedSuper._initResourceSpan = (resource, parentSpan) => {
      if (excludedInitiatorTypes.indexOf(resource.initiatorType) !== -1 || isUrlIgnored(resource.name, config.ignoreUrls)) {
        return;
      }
      _superInitResourceSpan(resource, parentSpan);
    };

  }
}
