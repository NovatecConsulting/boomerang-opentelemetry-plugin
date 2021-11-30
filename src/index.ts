// Required for loading Zone.js
// We ship our own Zone.js due to a bug with IE in 0.11.0 - https://github.com/angular/angular/issues/38669
import 'zone.js/dist/zone';

// Global Boomerang instance
declare global {
  interface Window {
    BOOMR: any;
    Prototype: any;
    usePrototypeCompatibilityFix: boolean;
  }
}

// When using the IE11 browser and Prototypejs, OpenTelemetry cannot be loaded.
// This is caused by the OpenTelemetry framework due to a polyfill of core-js which is used in OpenTelemetry
// and the fact, that Prototypejs adds a `entries` attribute to the array class.
//
// As a workaround, we remove the entries attribute of the Array object, load OpenTelemetry and add the entries
// attribute in order to not break the target application.
//
// See https://github.com/NovatecConsulting/boomerang-opentelemetry-plugin/issues/27#issue-1067341825
const isIE = !!(<any>window.document).documentMode;
const usesPrototype = !!window.Prototype;

let currentEntriesFn;
if (isIE && usesPrototype) {
  currentEntriesFn = Array.prototype.entries;
  delete Array.prototype.entries;
}

import OpenTelemetryTracingImpl from './impl';

if (currentEntriesFn) {
  Array.prototype.entries = currentEntriesFn;
}

/**
 * Skeleton template for all boomerang plugins.
 *
 * Use this code as a starting point for your own plugins.
 */
(function (): void {
  // First, make sure BOOMR is actually defined.  It's possible that your plugin
  // is loaded before boomerang, in which case you'll need this.
  window.BOOMR = window.BOOMR || {};
  window.BOOMR.plugins = window.BOOMR.plugins || {};

  // A private object to encapsulate all your implementation details
  // This is optional, but the way we recommend you do it.
  const impl = new OpenTelemetryTracingImpl();

  //
  // Public exports
  //
  window.BOOMR.plugins.OpenTelemetry = {
    init: (config: any) => {
      // list of user configurable properties
      const properties = Object.keys(impl.getProps());

      // This block is only needed if you actually have user configurable properties
      window.BOOMR.utils.pluginConfig(
        impl.getProps(),
        config,
        'OpenTelemetry',
        properties
      );

      // resolve beacon url
      const beaconUrl = config['beacon_url'];
      if (beaconUrl !== undefined && typeof beaconUrl === 'string') {
        impl.setBeaconUrl(beaconUrl);
      }

      // Other initialization code here
      impl.register();

      // Subscribe to any BOOMR events here.
      // Unless your code will explicitly be called by the developer
      // or by another plugin, you must to do this.

      return this;
    },

    // Executes the specified function within the context of the given span
    withSpan: impl.withSpan,

    // Getting an OpenTelemetry tracer instace for manual tracing
    getTracer: impl.getTracer,

    // Returns the internally used OpenTelemetry API
    getOpenTelemetryApi: impl.getOpenTelemetryApi,

    is_complete: () => {
      // This method should determine if the plugin has completed doing what it
      // needs to do and return true if so or false otherwise
      return impl.isInitalized();
    },
  };
})();
