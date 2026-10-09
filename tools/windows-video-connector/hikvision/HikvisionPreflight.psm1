Set-StrictMode -Version 2
function Get-HikvisionEndpoint([string]$Endpoint) {
  $uri=$null
  if (![Uri]::TryCreate($Endpoint,[UriKind]::Absolute,[ref]$uri)) { throw 'INVALID_LAN_ENDPOINT' }
  $ip=$null
  if ($uri.Scheme -notin @('http','https') -or $uri.UserInfo -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or ![Net.IPAddress]::TryParse($uri.Host,[ref]$ip)) { throw 'INVALID_LAN_ENDPOINT' }
  $b=$ip.GetAddressBytes()
  if ($b.Length -ne 4 -or !($b[0] -eq 10 -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168))) { throw 'PRIVATE_IPV4_REQUIRED' }
  return $uri.GetLeftPart([UriPartial]::Authority)
}
function Convert-HikvisionXml([string]$Text) {
  $settings=New-Object Xml.XmlReaderSettings
  $settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
  $settings.XmlResolver=$null
  $settings.MaxCharactersInDocument=2097152
  $reader=[Xml.XmlReader]::Create((New-Object IO.StringReader($Text)),$settings)
  try { $doc=New-Object Xml.XmlDocument; $doc.XmlResolver=$null; $doc.Load($reader); return ,$doc } finally { $reader.Dispose() }
}
function Get-HikvisionValue([Xml.XmlNode]$Xml,[string]$Name) {
  if ($Name -notmatch '^[A-Za-z][A-Za-z0-9]*$') { throw 'INVALID_XML_FIELD' }
  $n=$Xml.SelectSingleNode(".//*[local-name()='$Name']")
  if ($n) { return $n.InnerText.Trim() }; return $null
}
function Get-HikvisionTime([Xml.XmlNode]$Xml) {
  $value=Get-HikvisionValue $Xml 'localTime'
  if (!$value -or $value -notmatch '(Z|[+-][0-9]{2}:[0-9]{2})$') { throw 'NVR_TIME_OFFSET_MISSING' }
  $result=[DateTimeOffset]::MinValue
  if (![DateTimeOffset]::TryParse($value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::None,[ref]$result)) { throw 'INVALID_NVR_TIME' }
  return $result
}
function New-HikvisionSearch([int]$TrackId,[DateTimeOffset]$StartAt,[DateTimeOffset]$EndAt) {
  if ($TrackId -lt 1 -or $TrackId -gt 99999) { throw 'INVALID_TRACK' }
  $seconds=($EndAt-$StartAt).TotalSeconds
  if ($seconds -le 0 -or $seconds -gt 600) { throw 'SEARCH_WINDOW_MUST_BE_1_TO_600_SECONDS' }
  $start=$StartAt.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ'); $end=$EndAt.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
  return ('<CMSearchDescription version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema"><searchID>'+[Guid]::NewGuid().ToString()+'</searchID><trackIDList><trackID>'+$TrackId+'</trackID></trackIDList><timeSpanList><timeSpan><startTime>'+$start+'</startTime><endTime>'+$end+'</endTime></timeSpan></timeSpanList><maxResults>10</maxResults><searchResultPostion>0</searchResultPostion><metadataList><metadataDescriptor>//recordType.meta.std-cgi.com</metadataDescriptor></metadataList></CMSearchDescription>')
}
function Invoke-HikvisionQuery([Net.Http.HttpClient]$Client,[string]$Endpoint,[string]$Path,[string]$Body='') {
  $allowed=@('/ISAPI/System/deviceInfo','/ISAPI/System/time','/ISAPI/Streaming/channels','/ISAPI/ContentMgmt/record/tracks','/ISAPI/ContentMgmt/search/profile','/ISAPI/ContentMgmt/search')
  if ($Path -notin $allowed -or ($Body -and $Path -ne '/ISAPI/ContentMgmt/search')) { throw 'QUERY_NOT_ALLOWED' }
  $response=$null; $content=$null
  try {
    if ($Body) { $content=New-Object Net.Http.StringContent($Body,[Text.Encoding]::UTF8,'application/xml'); $response=$Client.PostAsync($Endpoint+$Path,$content).GetAwaiter().GetResult() }
    else { $response=$Client.GetAsync($Endpoint+$Path).GetAwaiter().GetResult() }
    if (!$response.IsSuccessStatusCode) { throw ('HTTP_'+[int]$response.StatusCode) }
    $text=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return Convert-HikvisionXml $text
  } catch {
    if ($_.Exception.Message -match '^HTTP_[0-9]+$') { throw $_.Exception.Message }
    throw 'QUERY_FAILED_OR_INVALID_XML'
  } finally { if ($response) { $response.Dispose() }; if ($content) { $content.Dispose() } }
}
Export-ModuleMember -Function Get-HikvisionEndpoint,Convert-HikvisionXml,Get-HikvisionValue,Get-HikvisionTime,New-HikvisionSearch,Invoke-HikvisionQuery
