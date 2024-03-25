/**
 * The original OpenTelemetry Collector span exporter used the `Array.from` method which is overridden by Prototype. The Prototype's function does not provide
 * all functionality of the original function, thus, the exporter will fail exporting spans in case Prototype is used.
 * See: https://github.com/prototypejs/prototype/issues/338
 * <>
 * The original exporter is using the `JSON.stringify` method. This method is calling `toJSON` functions on the object to serialize.
 * Unfortunately, prototype is adding a `toJSON` method to the Array class in versions prior 1.7. This leads to the problem, that nested
 * arrays are stringified separately, thus, they are considered not as an array anymore but as a string resulting in an invalid JSON string.
 * See: https://stackoverflow.com/questions/29637962/json-stringify-turned-the-value-array-into-a-string/29638420#29638420
 */
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag } from '@opentelemetry/api';
import * as otlpTypes from '@opentelemetry/otlp-exporter-base/build/src/types';
import { sendWithBeacon, sendWithXhr } from '@opentelemetry/otlp-exporter-base/build/src/platform/browser/util';

/**
 * Patches the `send` function of the trace exporter in order to handle
 * the span serialization correctly, when using Prototype < 1.7
 */
export function patchExporterClass() {
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
 * https://github.com/open-telemetry/opentelemetry-js/blob/experimental/v0.48.0/experimental/packages/otlp-exporter-base/src/platform/browser/OTLPExporterBrowserBase.ts
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

  // in order to fix the problem, we temporarily remove the `toJSON`
  // function (1), serializing the spans (2) and reading the function (3)
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
