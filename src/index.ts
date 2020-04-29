import OpenTelemetryTracingImpl from './impl';

/**
 * Skeleton template for all boomerang plugins.
 *
 * Use this code as a starting point for your own plugins.
 */
(function (): void {
  // First, make sure BOOMR is actually defined.  It's possible that your plugin
  // is loaded before boomerang, in which case you'll need this.
  const BOOMR = window.BOOMR || {};
  BOOMR.plugins = BOOMR.plugins || {};

  // A private object to encapsulate all your implementation details
  // This is optional, but the way we recommend you do it.
  const impl = new OpenTelemetryTracingImpl();

  //
  // Public exports
  //
  BOOMR.plugins.OpenTelemetry = {
    init: (config: any) => {
      // list of user configurable properties
      const properties = Object.keys(impl.getProps());

      // This block is only needed if you actually have user configurable properties
      BOOMR.utils.pluginConfig(impl.getProps(), config, 'OpenTelemetry', properties);

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

    // Any other public methods would be defined here

    is_complete: () => {
      // This method should determine if the plugin has completed doing what it
      // needs to do and return true if so or false otherwise
      return impl.isInitalized();
    },
  };
})();
