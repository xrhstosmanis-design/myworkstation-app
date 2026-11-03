using System.Text.Json;

namespace MyWorkStation.RemoteAgent;

// Runs on the caller's UI context. It never retries an uncertain input response.
internal sealed class RemoteCommandChannel : IAsyncDisposable {
 readonly CancellationTokenSource lifetime;
 readonly SemaphoreSlim captureWake = new(0,1);
 public Task Completion { get; }
 public RemoteCommandChannel(Func<CancellationToken,Task<JsonElement>> poll,Action<JsonElement> apply,Func<bool> allowed,Action failed,CancellationToken token) {
  lifetime=CancellationTokenSource.CreateLinkedTokenSource(token);
  Completion=Run(poll,apply,allowed,failed);
 }
 async Task Run(Func<CancellationToken,Task<JsonElement>> poll,Action<JsonElement> apply,Func<bool> allowed,Action failed) {
  try {
   while(!lifetime.IsCancellationRequested) {
    var response=await poll(lifetime.Token);
    foreach(var command in response.GetProperty("commands").EnumerateArray()) {
     lifetime.Token.ThrowIfCancellationRequested();
     if(!allowed())return;
     if(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()-command.GetProperty("at").GetInt64()>3000)continue;
     apply(command);
     // Coalesce input bursts into one prompt capture; idle capture stays at 900ms.
     if(captureWake.CurrentCount==0)captureWake.Release();
    }
   }
  }catch(OperationCanceledException)when(lifetime.IsCancellationRequested){}
  catch{failed();}
 }
 public async Task WaitForCapture(CancellationToken token) {
  if(await captureWake.WaitAsync(900,token))await Task.Delay(75,token);
 }
 public async ValueTask DisposeAsync() {
  lifetime.Cancel();await Completion;lifetime.Dispose();captureWake.Dispose();
 }
}
