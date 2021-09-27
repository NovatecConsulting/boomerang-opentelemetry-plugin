/**
 * This file is basically a partial copy of the `https://github.com/open-telemetry/opentelemetry-js/blob/main/packages/opentelemetry-exporter-collector/src/transform.ts` file
 * of the OpenTelemetry Collector span exporter. We adapted some methods/functions in order to solve the following problems:
 * <>
 * The original exporter is using the `Array.from` method which is overridden by Prototype. The Prototype's function does not provide
 * all functionallity of the original function, thus, the exporter will fail exporting spans in case Prototype is used.
 * See: https://github.com/prototypejs/prototype/issues/338
 * <>
 * The original exporter is using the `JSON.stringify` method. This method is calling `toJSON` functions on the object to serialize.
 * Unfortuently, prototype is adding a `toJSON` method to the Array class in versions prior 1.7. This leads to the problem, that nested
 * arrays are stringified seperatly, thus, they are considered not as an array anymore but as a string resulting in a invalid JSON string.
 * See: https://stackoverflow.com/questions/29637962/json-stringify-turned-the-value-array-into-a-string/29638420#29638420
 * <>
 * In this file, a exporter can be patched using the `patchExporter` function, so the previously described problems are "solved".
 */
import {
  CollectorExporterConfigBase,
  opentelemetryProto,
} from '@opentelemetry/exporter-collector/build/src/types';
import { SpanAttributes, diag } from '@opentelemetry/api';
import {
  CollectorExporterBase,
  CollectorTraceExporter,
  collectorTypes,
} from '@opentelemetry/exporter-collector';
import * as core from '@opentelemetry/core';
import { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import {
  groupSpansByResourceAndLibrary,
  toCollectorResource,
  toCollectorSpan,
} from '@opentelemetry/exporter-collector/build/src/transform';

import {
  sendWithBeacon,
  sendWithXhr,
} from '@opentelemetry/exporter-collector/build/src/platform/browser/util';

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
function toCollectorExportTraceServiceRequest<
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

/**
 * Patchs the given exporter.
 *
 * @param traceExporter the exporter instance to patch
 */
export function patchExporter(traceExporter: CollectorTraceExporter) {
  // Patches the transformation function, in order to call the custom `toCollectorExportTraceServiceRequest`
  // function to prevent calls of `Array.from`.
  traceExporter.convert = (spans) => {
    return toCollectorExportTraceServiceRequest(spans, traceExporter, true);
  };
}

// ##########################################################################################
// ##########################################################################################
// ##########################################################################################
// ##########################################################################################

/**
 * This function is basically a copy of the `send` function of the following file:
 * https://github.com/open-telemetry/opentelemetry-js/blob/v0.25.0/packages/opentelemetry-exporter-collector/src/platform/browser/CollectorExporterBrowserBase.ts
 * 
 * Here, a "fix" has been added in order to support Prorotype prior 1.7.
 */
function sendPatch(
  items: any[],
  onSuccess: () => void,
  onError: (error: collectorTypes.CollectorExporterError) => void
) {
  if (this._isShutdown) {
    diag.debug('Shutdown already started. Cannot send objects');
    return;
  }
  const serviceRequest = this.convert(items);

  // in order to fix the problem, we temporarly remove the `toJSON``
  // function (1), serializing the spans (2) and readding the function (3)
  // in order to preserve the initial state of the class
  
  // (1)
  const arrayPrototype: any = Array.prototype;
  const arrayToJson = arrayPrototype.toJSON;
  delete arrayPrototype.toJSON;
  // (2)
  const body = JSON.stringify(serviceRequest);
  // (3)
  arrayPrototype.toJSON = arrayToJson;

  const promise = new Promise<void>((resolve, reject) => {
    if (this._useXHR) {
      sendWithXhr(body, this.url, this._headers, resolve, reject);
    } else {
      sendWithBeacon(
        body,
        this.url,
        { type: 'application/json' },
        resolve,
        reject
      );
    }
  }).then(onSuccess, onError);

  this._sendingPromises.push(promise);
  const popPromise = () => {
    const index = this._sendingPromises.indexOf(promise);
    this._sendingPromises.splice(index, 1);
  };
  promise.then(popPromise, popPromise);
}

// declares the global Prototype variable
declare const Prototype: any;

export function patchExporterClass() {
  // Patches the `send`function of the trace exporter in order to handle
  // the span serialization correctly, when using Prototype < 1.7
  const arrayPrototype: any = Array.prototype;
  if (
    typeof Prototype !== 'undefined' &&
    parseFloat(Prototype.Version.substr(0, 3)) < 1.7 &&
    typeof arrayPrototype.toJSON !== 'undefined'
  ) {
    CollectorTraceExporter.prototype.send = sendPatch;
  }
}
