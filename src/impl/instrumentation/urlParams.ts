import { Span } from '@opentelemetry/api';

export function addUrlParams(span: Span, url: string, excludeKeys: string[]){
  const urlParams = url.split("?")[1];

  if(urlParams) {
    const keyValuePairs = urlParams.split("&");
    for(const keyValue of keyValuePairs) {
      const [key, value] = keyValue.split("=");
      span.setAttribute(key, value);

      if(!this.excludeKeys.includes(key)) window.BOOMR.addVar(key, value);
    }
  }
}
