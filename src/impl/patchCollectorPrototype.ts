/**
 * This file is basically a partial copy of the `https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-exporter-collector/src/transform.ts` file
 * of the OpenTelemetry Collector span exporter.
 * <>
 * The original exporter is using the `Array.from` method which is overridden by Prototype. The Prototype's function does not provide
 * all functionallity of the original funcrion, thus, the exporter will fail exporting spans in case Prototype is used.
 * See: https://github.com/prototypejs/prototype/issues/338
 * <>
 * In this file, the exporters transform module will be patched, so its functions are not using the `Array.from` function.
 */
import { CollectorExporterConfigBase, opentelemetryProto } from "@opentelemetry/exporter-collector/build/src/types";
import { CollectorExporterBase } from "@opentelemetry/exporter-collector";
import { groupSpansByResourceAndLibrary, toCollectorResource, toCollectorSpan } from "@opentelemetry/exporter-collector/build/src/transform";

const transformModule = require('@opentelemetry/exporter-collector/build/src/transform');

/**
 * This function is NOT modified.
 */
function toCollectorInstrumentationLibrarySpans(
    instrumentationLibrary: any,
    spans: any[],
    useHex?: boolean
): opentelemetryProto.trace.v1.InstrumentationLibrarySpans {
    return {
        spans: spans.map(span => toCollectorSpan(span, useHex)),
        instrumentationLibrary,
    };
}

/**
 * This function was modified in order to replace the `Array.from` usage.
 */
function toCollectorResourceSpans(
    groupedSpans: Map<any, Map<any, any[]>>,
    baseAttributes: any,
    useHex?: boolean
): opentelemetryProto.trace.v1.ResourceSpans[] {
    const resultSpans: Array<any> = [];

    groupedSpans.forEach((libSpans, resource) => {

        const instLibSpans: Array<any> = [];
        libSpans.forEach((spans, instrumentationLibrary) => {
            instLibSpans.push(
                toCollectorInstrumentationLibrarySpans(
                    instrumentationLibrary,
                    spans,
                    useHex
                ));
        });

        resultSpans.push({
            resource: toCollectorResource(resource, baseAttributes),
            instrumentationLibrarySpans: instLibSpans,
        });
    });

    return resultSpans;
}

/**
 * This function is NOT modified.
 */
export function toCollectorExportTraceServiceRequest<
    T extends CollectorExporterConfigBase
>(
    spans: any[],
    collectorTraceExporterBase: CollectorExporterBase<
        T,
        any,
        opentelemetryProto.collector.trace.v1.ExportTraceServiceRequest
    >,
    useHex?: boolean
): opentelemetryProto.collector.trace.v1.ExportTraceServiceRequest {
    const groupedSpans: Map<
        any,
        Map<any, any[]>
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

export default function () {
    transformModule.toCollectorExportTraceServiceRequest = toCollectorExportTraceServiceRequest;
};