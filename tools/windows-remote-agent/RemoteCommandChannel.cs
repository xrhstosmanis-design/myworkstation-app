using System.Text.Json;

namespace MyWorkStation.RemoteAgent;

// Runs on the caller's UI context. It never retries an uncertain input response.
internal sealed class RemoteCommandChannel : IAsyncDisposable {
 readonly CancellationTokenSource lifetime;
 readonly SemaphoreSlim captureWake = new(0,1);
 readonly Action<string>? diagnostic;
 public Task Completion { get; }
 public RemoteCommandChannel(Func<CancellationToken,Task<JsonElement>> poll,Action<JsonElement> apply,Func<bool> allowed,Action failed,CancellationToken token,Action<string>? diagnostic=null) {
  this.diagnostic=diagnostic;
  lifetime=CancellationTokenSource.CreateLinkedTokenSource(token);
  Completion=Run(poll,apply,allowed,failed);
 }
 async Task Run(Func<CancellationToken,Task<JsonElement>> poll,Action<JsonElement> apply,Func<bool> allowed,Action failed) {
  try {
   while(!lifetime.IsCancellationRequested) {
    var response=await poll(lifetime.Token);
    var receivedAt=System.Diagnostics.Stopwatch.GetTimestamp();
    foreach(var command in response.GetProperty("commands").EnumerateArray()) {
     lifetime.Token.ThrowIfCancellationRequested();
     if(!allowed())return;
     // Both values are monotonic within their respective machines: the server
     // measures queue age at dequeue, then the Agent measures time since receipt.
     // Never compare Windows wall-clock time with a server timestamp.
     if(!command.TryGetProperty("ageMs",out var ageValue)||!ageValue.TryGetInt64(out long serverAgeMs)||serverAgeMs<0||serverAgeMs>=3000)continue;
     if(serverAgeMs+System.Diagnostics.Stopwatch.GetElapsedTime(receivedAt).TotalMilliseconds>=3000)continue;
     apply(command);
     // Coalesce input bursts into one prompt capture; idle capture stays at 900ms.
     if(captureWake.CurrentCount==0)captureWake.Release();
    }
   }
  }catch(OperationCanceledException)when(lifetime.IsCancellationRequested){}
  catch(OperationCanceledException){diagnostic?.Invoke("COMMAND_POLL_TIMEOUT");failed();}
  catch(HttpRequestException){diagnostic?.Invoke("COMMAND_TRANSPORT_ERROR");failed();}
  catch(JsonException){diagnostic?.Invoke("COMMAND_RESPONSE_ERROR");failed();}
  catch{diagnostic?.Invoke("COMMAND_CHANNEL_ERROR");failed();}
 }
 public async Task WaitForCapture(CancellationToken token) {
  if(await captureWake.WaitAsync(900,token))await Task.Delay(75,token);
 }
 public async ValueTask DisposeAsync() {
  lifetime.Cancel();await Completion;lifetime.Dispose();captureWake.Dispose();
 }
}
