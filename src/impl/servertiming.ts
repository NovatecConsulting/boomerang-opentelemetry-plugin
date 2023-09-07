// Also see: https://github.com/signalfx/splunk-otel-js-web/blob/main/packages/web/src/servertiming.ts
import { PerformanceEntries } from '@opentelemetry/sdk-trace-web';
import OpenTelemetryTracingImpl from './index'

function setTransactionIds(match: RegExpMatchArray, impl: OpenTelemetryTracingImpl): void {
  if (match && match[1] && match[2]) {
    const traceId = match[1];
    const spanId = match[2];
    impl.setTransactionTraceId(traceId);
    impl.setTransactionSpanId(spanId);
  }
}

const ValueRegex = new RegExp('00-([0-9a-f]{32})-([0-9a-f]{16})-01');

export function captureTraceParentFromPerformanceEntries(entries: PerformanceEntries, impl: OpenTelemetryTracingImpl): void {
  if (!(entries as any).serverTiming) {
    return;
  }
  for(const st of (entries as any).serverTiming) {
    if (st.name === 'traceparent' && st.description) {
      const match = st.description.match(ValueRegex);
      setTransactionIds(match, impl);
    }
  }
}
