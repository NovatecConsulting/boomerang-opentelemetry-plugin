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
 * In this file, an exporter can be patched using the `patchExporter` function, so the previously described problems are "solved".
 */
import type { IResource } from '@opentelemetry/resources';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import {
  IExportTraceServiceRequest,
  IResourceSpans,
  IScopeSpans
} from '@opentelemetry/otlp-transformer/build/src/trace/types';
import { sdkSpanToOtlpSpan } from '@opentelemetry/otlp-transformer/build/src/trace/internal';
import { Encoder, getOtlpEncoder } from '@opentelemetry/otlp-transformer/build/src/common';
import { toAttributes } from '@opentelemetry/otlp-transformer/build/src/common/internal';
import { OtlpEncodingOptions } from '@opentelemetry/otlp-transformer/build/src/common/types';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag } from '@opentelemetry/api';
import {
  OTLPExporterBrowserBase
} from '@opentelemetry/otlp-exporter-base/build/src/platform/browser/OTLPExporterBrowserBase';
import { OTLPExporterBase } from '@opentelemetry/otlp-exporter-base/build/src/OTLPExporterBase';
import { OTLPExporterConfigBase } from '@opentelemetry/otlp-exporter-base/build/src/types';
import * as otlpTypes from '@opentelemetry/otlp-exporter-base/build/src/types';
import { sendWithBeacon, sendWithXhr } from '@opentelemetry/otlp-exporter-base/build/src/platform/browser/util';

/**
 * Patchs the given exporter.
 *
 * @param traceExporter the exporter instance to patch
 */
export function patchExporter(traceExporter: OTLPTraceExporter) {
  // Patches the transformation function, in order to call the custom `toCollectorExportTraceServiceRequest`
  // function to prevent calls of `Array.from`.
  traceExporter.convert = (spans: ReadableSpan[]) => {
    return toCollectorExportTraceServiceRequest(spans, {
      useHex: true,
      useLongBits: false,
    });
  };
}

/**
 * Prepares trace service request to be sent to collector
 * @param spans spans
 * @param options
 */
function toCollectorExportTraceServiceRequest(spans: ReadableSpan[], options?: OtlpEncodingOptions): IExportTraceServiceRequest {
  const encoder = getOtlpEncoder(options);
  return {
    resourceSpans: toCollectorResourceSpans(spans, encoder),
  };
}

/**
 *
 * Returns a list of resource spans which will be exported to the collector.
 * @param readableSpans
 * @param encoder
 */
function toCollectorResourceSpans(readableSpans: ReadableSpan[], encoder: Encoder): IResourceSpans[] {
  const resourceMap = createResourceMap(readableSpans);
  const out: IResourceSpans[] = [];

  const entryIterator = resourceMap.entries();
  let entry = entryIterator.next();
  while (!entry.done) {
    const [resource, ilmMap] = entry.value;
    const scopeResourceSpans: IScopeSpans[] = [];
    const ilmIterator = ilmMap.values();
    let ilmEntry = ilmIterator.next();
    while (!ilmEntry.done) {
      const scopeSpans = ilmEntry.value;
      if (scopeSpans.length > 0) {
        const { name, version, schemaUrl } = scopeSpans[0].instrumentationLibrary;
        const spans = scopeSpans.map((readableSpan: ReadableSpan) =>
          sdkSpanToOtlpSpan(readableSpan, encoder)
        );

        scopeResourceSpans.push({
          scope: { name, version },
          spans: spans,
          schemaUrl: schemaUrl,
        });
      }
      ilmEntry = ilmIterator.next();
      }
      const transformedSpans: IResourceSpans = {
        resource: {
          attributes: toAttributes(resource.attributes),
          droppedAttributesCount: 0,
        },
        scopeSpans: scopeResourceSpans,
        schemaUrl: undefined,
      };

      out.push(transformedSpans);
      entry = entryIterator.next();
    }

  return out;
}

/**
 * Original, no changes
 */
function createResourceMap(readableSpans: ReadableSpan[]) {
  const resourceMap: Map<IResource, Map<string, ReadableSpan[]>> = new Map();
  for (const record of readableSpans) {
    let ilmMap = resourceMap.get(record.resource);

    if (!ilmMap) {
      ilmMap = new Map();
      resourceMap.set(record.resource, ilmMap);
    }

    // TODO this is duplicated in basic tracer. Consolidate on a common helper in core
    const instrumentationLibraryKey = `${record.instrumentationLibrary.name}@${
      record.instrumentationLibrary.version || ''
    }:${record.instrumentationLibrary.schemaUrl || ''}`;
    let records = ilmMap.get(instrumentationLibraryKey);

    if (!records) {
      records = [];
      ilmMap.set(instrumentationLibraryKey, records);
    }

    records.push(record);
  }

  return resourceMap;
}


// ##########################################################################################
// ##########################################################################################
// ##########################################################################################
// ##########################################################################################

export function patchExporterClass() {
  // Patches the `send`function of the trace exporter in order to handle
  // the span serialization correctly, when using Prototype < 1.7
  const arrayPrototype: any = Array.prototype;
  if (
    typeof Prototype !== 'undefined' &&
    parseFloat(Prototype.Version.substr(0, 3)) < 1.7 &&
    typeof arrayPrototype.toJSON !== 'undefined'
  ) {
    OTLPTraceExporter.prototype.send = sendPatch;
  }
}

/**
 * This function is basically a copy of the `send` function of the following file:
 * https://github.com/open-telemetry/opentelemetry-js/blob/v0.25.0/packages/opentelemetry-exporter-collector/src/platform/browser/CollectorExporterBrowserBase.ts
 *
 * Here, a "fix" has been added in order to support Prototype prior 1.7.
 */
function sendPatch(
  items: any[],
  onSuccess: () => void,
  onError: (error: otlpTypes.OTLPExporterError) => void
): void {
  if (this._shutdownOnce.isCalled) {
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
      sendWithXhr(
        body,
        this.url,
        this._headers,
        this.timeoutMillis,
        resolve,
        reject
      );
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


