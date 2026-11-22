using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
namespace MyWorkStation.RemoteAgent;
// Loopback only. No filesystem, command execution or reusable credential endpoint.
internal sealed class LocalRemoteBridge:IDisposable {
 const string Origin="https://myworkstation-app.onrender.com";
 readonly TcpListener listener=new(IPAddress.Loopback,17861);
 readonly CancellationTokenSource lifetime=new();
 readonly SemaphoreSlim clients=new(4);
 readonly Func<string,bool> accept;readonly Action stop;
 public LocalRemoteBridge(Func<string,bool> accept,Action stop){this.accept=accept;this.stop=stop;listener.Start();_=Listen();}
 async Task Listen(){try{while(!lifetime.IsCancellationRequested){var client=await listener.AcceptTcpClientAsync(lifetime.Token);if(!clients.Wait(0)){client.Dispose();continue;}_=Handle(client);}}catch(OperationCanceledException){}catch(ObjectDisposedException){}catch(SocketException)when(lifetime.IsCancellationRequested){} }
 async Task Handle(TcpClient client){using(client)using(var timeout=CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token)){timeout.CancelAfter(5000);var ct=timeout.Token;try{
  var stream=client.GetStream();using var reader=new StreamReader(stream,new UTF8Encoding(false,true),false,1024,true);
  var first=await ReadLine(reader,ct,512)??"";if(first.Length>512)return;var line=first.Split(' ');if(line.Length!=3||line[2]!="HTTP/1.1")return;
  var headers=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);int total=first.Length;
  for(int count=0;count<30;count++){var h=await ReadLine(reader,ct,8192-total);if(h==null)return;if(h.Length==0)break;total+=h.Length;if(total>8192)return;var colon=h.IndexOf(':');if(colon<1||!headers.TryAdd(h[..colon].Trim(),h[(colon+1)..].Trim()))return;}
  if(!headers.TryGetValue("Origin",out var origin)||origin!=Origin||headers.ContainsKey("Transfer-Encoding")){await Reply(stream,403,new{error="Forbidden"},ct);return;}
  if(line[0]=="OPTIONS"){await Reply(stream,200,new{ok=true},ct);return;}
  if(!headers.TryGetValue("X-MWS-Local",out var marker)||marker!="remote-v2"){await Reply(stream,403,new{error="Forbidden"},ct);return;}
  if(line[0]=="GET"&&line[1]=="/status"){await Reply(stream,200,new{version=2},ct);return;}
  if(line[0]!="POST"||!headers.TryGetValue("Content-Length",out var lengthText)||!int.TryParse(lengthText,out int length)||length<0||length>8192){await Reply(stream,400,new{error="Bad request"},ct);return;}
  var buffer=new char[length];int read=0;while(read<length){int n=await reader.ReadAsync(buffer.AsMemory(read),ct);if(n==0)return;read+=n;}if(buffer.Any(c=>c>127))return;
  using var json=JsonDocument.Parse(new string(buffer));
  if(line[1]=="/stop"){stop();await Reply(stream,200,new{stopped=true},ct);return;}
  if(line[1]!="/accept"||!json.RootElement.TryGetProperty("grant",out var value)||value.ValueKind!=JsonValueKind.String){await Reply(stream,400,new{error="Bad request"},ct);return;}
  var grant=value.GetString()??"";if(grant.Length!=43||grant.Any(c=>!char.IsAsciiLetterOrDigit(c)&&c!='_'&&c!='-')){await Reply(stream,400,new{error="Bad grant"},ct);return;}
  bool ok=accept(grant);await Reply(stream,ok?200:409,new{accepted=ok},ct);
 }catch(Exception){}finally{clients.Release();}}}
 static async Task<string?> ReadLine(StreamReader reader,CancellationToken ct,int limit){var text=new StringBuilder();var one=new char[1];while(text.Length<=limit){int n=await reader.ReadAsync(one.AsMemory(),ct);if(n==0)return null;if(one[0]=='\n')return text.ToString().TrimEnd('\r');text.Append(one[0]);}throw new InvalidOperationException("Header too long");}
 static async Task Reply(NetworkStream stream,int status,object data,CancellationToken ct){var body=JsonSerializer.SerializeToUtf8Bytes(data);var head=Encoding.ASCII.GetBytes($"HTTP/1.1 {status} Result\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: {Origin}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-MWS-Local\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: {body.Length}\r\n\r\n");await stream.WriteAsync(head,ct);await stream.WriteAsync(body,ct);}
 public void Dispose(){lifetime.Cancel();listener.Stop();lifetime.Dispose();}
}
