const adapterDefinitions=Object.freeze({
  ONVIF:Object.freeze({protocol:"ONVIF",discovery:true,liveStream:true,playback:true,clipExport:false,timeApi:true,audio:false}),
  RTSP:Object.freeze({protocol:"RTSP",discovery:false,liveStream:true,playback:false,clipExport:false,timeApi:false,audio:false}),
  VENDOR_API:Object.freeze({protocol:"VENDOR_API",discovery:true,liveStream:true,playback:true,clipExport:true,timeApi:true,audio:false})
});

function safeEndpoint(endpoint){
  const parsed=new URL(String(endpoint||""));
  if(!["http:","https:","rtsp:"].includes(parsed.protocol))throw new Error("Μη υποστηριζόμενο πρωτόκολλο endpoint.");
  return `${parsed.protocol}//${parsed.host}`;
}

export function videoAdapterFor(protocol){
  const definition=adapterDefinitions[protocol];
  if(!definition)throw new Error("Δεν υπάρχει ενεργός adapter για αυτό το πρωτόκολλο.");
  return {
    ...definition,
    validate(config){
      const endpoint=safeEndpoint(config?.endpoint);
      if(protocol==="RTSP"&&!String(config.endpoint).toLowerCase().startsWith("rtsp://"))throw new Error("Ο RTSP adapter απαιτεί rtsp:// endpoint.");
      if(protocol!=="RTSP"&&String(config.endpoint).toLowerCase().startsWith("rtsp://"))throw new Error("Ο ONVIF/vendor API adapter απαιτεί HTTP(S) endpoint.");
      return {valid:true,protocol,endpoint,credentialsConfigured:Boolean(config?.username&&config?.passwordConfigured)};
    },
    capabilities(){return {...definition}},
    async connect(){throw new Error("Η πραγματική σύνδεση απαιτεί εγκατεστημένο και προσβάσιμο NVR.")}
  };
}

export function videoAdapterDescriptor(config){
  const adapter=videoAdapterFor(config.protocol),validation=adapter.validate(config);
  return {protocol:config.protocol,configured:validation.valid,endpointHost:validation.endpoint,capabilities:adapter.capabilities(),realConnectionPerformed:false};
}

export function buildVendorClientFallback({endpoint,cameraKey,streamReference,nvrEventAt}){
  const target=new URL(String(endpoint||""));
  if(!["http:","https:"].includes(target.protocol))throw new Error("Το vendor client fallback απαιτεί ασφαλές HTTP(S) launch endpoint.");
  target.username="";target.password="";
  target.searchParams.set("camera",String(streamReference||cameraKey||""));
  target.searchParams.set("at",new Date(nvrEventAt).toISOString());
  return {launchUrl:target.toString(),cameraKey:String(cameraKey||""),nvrEventAt:new Date(nvrEventAt).toISOString(),requiresUserConfirmation:true,realVideoOpened:false};
}

export const supportedVideoAdapterProtocols=Object.freeze(Object.keys(adapterDefinitions));
