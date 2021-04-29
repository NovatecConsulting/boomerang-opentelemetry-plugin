# Boomerang-OpenTelemetry Plugin

![](https://img.shields.io/badge/OpenTelemetry%20Version-0.18.2-success)

This is a [Boomerang plugin](https://github.com/akamai/boomerang) for collecting spans using the [OpenTelemetry](https://opentelemetry.io/) framework and exporting them, e.g., to an OpenTelemetry collector.
The plugin is based on the [opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) implementation.
The plugin version always corresponds to the opentelemetry-js version that's being used internally.

## Features

Currently implemented features:

* Automatic instrumentation of the asynhrounous XMLHttpRequest API and Fetch API, including B3 header propagation. [More details ↗](https://www.npmjs.com/package/@opentelemetry/instrumentation-xml-http-request)
* Automatic tracing of the initial page load including resource timings.
* Automatic instrumentation of user interactions.
* Automatic local context propagation using _Zone Context Manager_. [More details ↗](https://www.npmjs.com/package/@opentelemetry/context-zone)
* Exporting collected spans to an OpenTelemetry collector.
* Providing access to the OpenTelemtry Tracing-API for manual instrumentation.

### OpenTelemetry Plugins

A list of OpenTelemetry instrumentation and non-instrumentation plugins that are currently included in this Boomerang plugin:

* [@opentelemetry/exporter-collector](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-exporter-collector)
* [@opentelemetry/instrumentation-xml-http-request](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-xml-http-request)
* [@opentelemetry/instrumentation-fetch](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-fetch)
* [@opentelemetry/instrumentation-document-load](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-document-load)
* [@opentelemetry/instrumentation-user-interaction](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-user-interaction)

## Setup

The basic setup requires only to include the `boomerang-opentelemetry.js` file to the list of the boomerang plugins to run. This setup works out-of-the-box with the  [inspectit-ocelot EUM server](https://github.com/inspectIT/inspectit-ocelot/tree/master/components/inspectit-ocelot-eum-server).

By default, collected spans will be sent to an URL relative to the defined `beacon_url` Boomerang property in case your `beacon_url` ends with `/beacon`. In this case, an endpoint for spans is used, where `/beacon` is replaced by `/spans`. However, if you use different URLs, the collector URL must be configured accordingly.

## Configuration

The plugin is configured using the standard [Boomerang configuration](https://developer.akamai.com/tools/boomerang/docs/index.html).
All available configuration options are optional.

```
BOOMR.init({
  beacon_url: 'http://localhost:8080/beacon/',
  
  OpenTelemetry: {
    samplingRate: 0.5, // an optional sampling rate
    corsUrls: ['https://my.backend.com'],
    consoleOnly: false, // an optional flag whether spans should only be printed to the console
    collectorConfiguration: {
      url: 'http://localhost:55681/v1/trace' // an optional url for an OpenTelemetry collector
      headers: {}, // an optional object containing custom headers to be sent with each request
      concurrencyLimit: 10, // an optional limit on pending requests
      serviceName: 'my-application' // an optional string for defining the service name used in the spans
    },
    plugins: {
      instrument_fetch: true,
      instrument_xhr: true,
      instrument_document_load: true,
      instrument_user_interaction: true
    }
  }
});
```
Available options are:

| Option | Description | Default value |
|---|---|---|
| `samplingRate` | Sampling rate to use when collecting spans. Value must be between `0` and `1`. | `1` |
| `corsUrls` | Array of CORS URLs to take into consideration when propagating trace information. By default, CORS URLs are excluded from the propagation. | `[]` |
| `collectorConfiguration` | Object that defines the OpenTelemetry collector configuration, like the URL to send spans to. See [CollectorExporterNodeConfigBase](https://www.npmjs.com/package/@opentelemetry/exporter-collector) interface for all options. | `undefined` |
| `consoleOnly` | If `true` spans will be logged on the console and not sent to the collector endpoint. | `false` |
| `plugins` | Object for enabling and disabling OpenTelemetry plugins. |  |
| `plugins.instrument_fetch` | Enabling the [OpenTelemetry plugin](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-fetch) for insturmentation of the fetch API. | `true` |
| `plugins.instrument_xhr` | Enabling the [OpenTelemetry plugin](https://github.com/open-telemetry/opentelemetry-js/tree/main/packages/opentelemetry-instrumentation-xml-http-request) for insturmentation of the XMLHttpRequest API. | `true` |
| `plugins.instrument_document_load` | Enabling the [OpenTelemetry plugin](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-document-load) for insturmentation of the document load (initial request). | `true` |
| `plugins.instrument_user_interaction` | Enabling the [OpenTelemetry plugin](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/web/opentelemetry-instrumentation-user-interaction) for insturmentation of user interactions. | `true` |

## Manual Instrumentation

The boomerang OpenTelemetry Plugin also exposes a part of the OpenTelemetry tracing API for manual instrumentation:

```
const tracer = window.BOOMR.plugins.OpenTelemetry.getTracer("my-library-name", "v1.0");

const span = tracer.startSpan("doSomething");
// do something
span.end();
```

For execution of functions within a span context, the plugin provides the following convenient function: `withSpan(span, fn)`

```
const OT = window.BOOMR.plugins.OpenTelemetry;
const tracer = OT.getTracer("my-library-name", "v1.0");

const span = tracer.startSpan("doSomething");
OT.withSpan(span, () => {
  // do something
});
span.end();
```

The plugin also provides direct access to the OpenTelemetry API via the following function: `getOpenTelemetryApi()`. This returns the OpenTelemetry API and can be used for more advanced data collection.

### Asynchronous inclusion of Boomerang

Make sure to check that `window.BOOMR.plugins.OpenTelemetry` actually exists prior to using it in your code in case you load boomerang asynchronously.

## Development

During development, the plugin can be compiled and automatically recompiled whenever a file is changed using: `yarn watch`

The plugin can be built using the command: `yarn build`