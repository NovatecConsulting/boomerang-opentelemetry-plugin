/**
 * This file is basically a partial copy of the `https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-exporter-collector/src/transform.ts` file
 * of the OpenTelemetry Collector span exporter.
 * <>
 * The original exporter is using the `Array.from` method which is overridden by Prototype. The Prototype's function does not provide
 * all functionallity of the original function, thus, the exporter will fail exporting spans in case Prototype is used.
 * See: https://github.com/prototypejs/prototype/issues/338
 * <>
 * In this file, the exporters transform module will be patched, so its functions are not using the `Array.from` function.
 */
import {
  CollectorExporterConfigBase,
  opentelemetryProto,
} from '@opentelemetry/exporter-collector/build/src/types';
import { SpanAttributes } from '@opentelemetry/api';
import { CollectorExporterBase } from '@opentelemetry/exporter-collector';
import * as core from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import {
  groupSpansByResourceAndLibrary,
  toCollectorResource,
  toCollectorSpan,
} from '@opentelemetry/exporter-collector/build/src/transform';

/**
 *
 * Returns a list of resource spans which will be exported to the collector.
 * @param groupedSpans
 * @param baseAttributes
 * @param useHex - if ids should be kept as hex without converting to base64
 */
function toCollectorResourceSpans(
  groupedSpans: Map<Resource, Map<core.InstrumentationLibrary, ReadableSpan[]>>,
  baseAttributes: SpanAttributes,
  useHex?: boolean
): opentelemetryProto.trace.v1.ResourceSpans[] {
  const resultSpans: Array<opentelemetryProto.trace.v1.ResourceSpans> = [];

  groupedSpans.forEach((libSpans, resource) => {
    const instLibSpans: Array<any> = [];

    libSpans.forEach((spans, instrumentationLibrary) => {
      instLibSpans.push(
        toCollectorInstrumentationLibrarySpans(
          instrumentationLibrary,
          spans,
          useHex
        )
      );
    });

    resultSpans.push({
      resource: toCollectorResource(resource, baseAttributes),
      instrumentationLibrarySpans: instLibSpans,
    });
  });

  return resultSpans;
}

/**
 * ########################################
 * # This function has NOT been modified. #
 * ########################################
 *
 * Convert to InstrumentationLibrarySpans
 * @param instrumentationLibrary
 * @param spans
 * @param useHex - if ids should be kept as hex without converting to base64
 */
function toCollectorInstrumentationLibrarySpans(
  instrumentationLibrary: core.InstrumentationLibrary,
  spans: ReadableSpan[],
  useHex?: boolean
): opentelemetryProto.trace.v1.InstrumentationLibrarySpans {
  return {
    spans: spans.map((span) => toCollectorSpan(span, useHex)),
    instrumentationLibrary,
  };
}

/**
 * Prepares trace service request to be sent to collector
 * @param spans spans
 * @param collectorExporterBase
 * @param useHex - if ids should be kept as hex without converting to base64
 */
export function toCollectorExportTraceServiceRequest<
  T extends CollectorExporterConfigBase
>(
  spans: ReadableSpan[],
  collectorTraceExporterBase: CollectorExporterBase<
    T,
    ReadableSpan,
    opentelemetryProto.collector.trace.v1.ExportTraceServiceRequest
  >,
  useHex?: boolean
): opentelemetryProto.collector.trace.v1.ExportTraceServiceRequest {
  const groupedSpans: Map<
    Resource,
    Map<core.InstrumentationLibrary, ReadableSpan[]>
  > = groupSpansByResourceAndLibrary(spans);

  const additionalAttributes = Object.assign(
    {},
    collectorTraceExporterBase.attributes
  );

  return {
    resourceSpans: toCollectorResourceSpans(
      groupedSpans,
      additionalAttributes,
      useHex
    ),
  };
}
