import { Span } from '@opentelemetry/api';

/**
 * Add url parameters to spans and if not excluded also to the current beacon
 * @param span current span
 * @param url complete request url
 * @param excludeKeys list of keys, which should not be written to beacons
 */
export function addUrlParams(span: Span, url: string, excludeKeys: string[] = []){
  const urlParams = url.split("?")[1];

  if(urlParams) {
    const keyValuePairs = urlParams.split("&");
    for(const keyValue of keyValuePairs) {
      const [key, value] = keyValue.split("=");
      span.setAttribute(key, value);

      if(!excludeKeys.includes(key)) window.BOOMR.addVar(key, value);
    }
  }
}
