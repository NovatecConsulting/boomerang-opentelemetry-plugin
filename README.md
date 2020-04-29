# Boomerang-OpenTelemetry Plugin

This is a [Boomerang plugin](https://github.com/akamai/boomerang) for collecting spans using the [OpenTelemetry](https://opentelemetry.io/) framework and exporting them, e.g., to an OpenTelemetry collector.
The plugin is based on the [opentelemetry-js](https://github.com/open-telemetry/opentelemetry-js) implementation.
The plugin version always corresponds to the opentelemetry-js version that's being used internally.

## Features

Currently implemented features:

* Automatic instrumentation of asynhrounous XHR requests with the B3 propagation. [More details ↗](https://github.com/open-telemetry/opentelemetry-js/tree/master/packages/opentelemetry-plugin-xml-http-request)

## Setup

The basic setup requires only to include the `boomerang-opentelemetry.js` file to the list of the boomerang plugins to run.
This setup works out-of-the-box with the  [inspectit-ocelot EUM server](https://github.com/inspectIT/inspectit-ocelot/tree/master/components/inspectit-ocelot-eum-server) and traces will be sent to the server endpoint relative to the defined `beacon_url` Boomerang property.
If you want to use the standard OpenTelemetry collector, check out the configuration section.

## Configuration

The plugin is configured using the standard [Boomerang configuration](https://developer.akamai.com/tools/boomerang/docs/index.html).
All available configuration options are optional.

```
<script>
  BOOMR.init({
    beacon_url: 'http://localhost:8080/beacon/',
    OpenTelemetry: {
      samplingRate: 0.5,
      corsUrls: ['https://my.backend.com'],
      collectorConfiguration: {
        url: 'http://my.opentelemetry.collector'
      }
    }
  });
</script>
```

Available options are:

| Option | Description | Default value |
|---|---|---|
| `collectorConfiguration` | Object that defines the OpenTelemetry collector configuration, like the URL to send spans to. See [CollectorExporterConfig](https://github.com/open-telemetry/opentelemetry-js/blob/master/packages/opentelemetry-exporter-collector/src/CollectorExporter.ts) interface for all options. | `undefined` |
| `samplingRate` | Sampling rate to use when collecting spans. Value must be [0-1]. | `1` |
| `corsUrls` | Array of CORS URLs to take into consideration when propagating trace information. By default, CORS URLs are excluded from the propagation. | `[]` |
| `consoleOnly` | If `true` spans will be logged on the console and not sent to the OpenTelemetry collector. | `false` |
