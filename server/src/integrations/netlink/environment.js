const renderPrPreviewPattern=/^[a-z0-9-]+-pr-\d+\.onrender\.com$/i;

export function isRenderPrPreview(hostname=process.env.RENDER_EXTERNAL_HOSTNAME){
  return renderPrPreviewPattern.test(String(hostname||"").trim());
}

export function isNetlinkTestMode(env=process.env){
  if(env.NETLINK_TEST_MODE!=="true")return false;
  return env.NODE_ENV!=="production"||isRenderPrPreview(env.RENDER_EXTERNAL_HOSTNAME);
}
